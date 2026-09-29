import { z } from "zod";
import type { Command, ExchangeDetails, FlightSegment, ID, Money, RefundRequest } from "../types";
import { makeAudit } from "../audit";
import { convert, format, sum } from "../money";
import { refundNeedsManager } from "../permissions";
import { computeExchangeQuote, computeRefundQuote } from "../refunds";
import { canTransition } from "../status/line-machine";
import { denied, fail, historyEntry, nowIso, ok, parse, produce, takeNumber } from "./_helpers";
import { zId, zMoneyNonNeg, zSegment, zText } from "./_schemas";

export interface RequestRefundInput {
  lineId: ID;
  kind: "refund" | "exchange";
  reason: string;
  /** What the airline or supplier keeps (for an exchange: the airline change fee). Any currency; converted to the line currency. */
  supplierPenalty: Money;
  /** Refund only. Defaults to settings.defaultServiceFee.service_fee. Any currency; converted to the line currency. */
  agencyFee?: Money;
  /** Manager only: return the original markup, service fee and VAT to the client. */
  waiveOriginalFees?: boolean;
  /** Required for kind 'exchange'. */
  exchange?: { newSegments: FlightSegment[]; additionalFare: Money; changeFee: Money };
}

export interface RequestRefundResult {
  refundId: ID;
  number: string;
}

const schema = z.object({
  lineId: zId,
  kind: z.enum(["refund", "exchange"]),
  reason: zText("Reason"),
  supplierPenalty: zMoneyNonNeg,
  agencyFee: zMoneyNonNeg.optional(),
  waiveOriginalFees: z.boolean().default(false),
  exchange: z
    .object({
      newSegments: z.array(zSegment).min(1, "Add at least one new flight segment."),
      additionalFare: zMoneyNonNeg,
      changeFee: zMoneyNonNeg,
    })
    .optional(),
});

export const requestRefund: Command<RequestRefundInput, RequestRefundResult> = (state, input, ctx) => {
  const no = denied(ctx, "refund.request");
  if (no) return no;
  const parsed = parse(schema, input);
  if (!parsed.ok) return parsed;
  const f = parsed.data;

  if (f.waiveOriginalFees) {
    const noWaive = denied(ctx, "refund.waive");
    if (noWaive) return { ...noWaive, error: { ...noWaive.error, field: "waiveOriginalFees" } };
  }

  const line = state.lines[f.lineId];
  if (!line) return fail("NOT_FOUND", "This service could not be found.", "lineId");
  const file = state.files[line.fileId];
  if (!file) return fail("NOT_FOUND", "The booking for this service could not be found.");

  if (f.kind === "exchange") {
    if (line.type !== "flight") return fail("VALIDATION", "Only flights can be exchanged. Request a refund instead.", "kind");
    if (!f.exchange) return fail("VALIDATION", "Enter the new flight segments, the additional fare and the change fee.", "exchange");
    if (f.waiveOriginalFees) return fail("VALIDATION", "Waiving the original fees only applies to refunds.", "waiveOriginalFees");
  }

  const check = canTransition(line, "refund_pending", { now: ctx.now, via: "requestRefund" });
  if (!check.ok) return check;

  const rate = state.settings.fx.USD_TZS;
  const cur = line.pricing.currency;
  const penalty = convert(f.supplierPenalty, cur, rate);
  if (f.kind === "refund" && penalty.amountMinor > line.pricing.cost.amountMinor) {
    return fail("VALIDATION", `The supplier penalty (${format(penalty)}) cannot be more than what we owe the supplier for this service (${format(line.pricing.cost)}).`, "supplierPenalty");
  }

  let exchange: ExchangeDetails | undefined;
  const quote =
    f.kind === "exchange"
      ? computeExchangeQuote(line.pricing, penalty, f.exchange!.changeFee, state.settings)
      : computeRefundQuote(line.pricing, { supplierPenalty: penalty, agencyFee: f.agencyFee, waiveOriginalFees: f.waiveOriginalFees }, state.settings);
  if (f.kind === "exchange") {
    exchange = {
      newSegments: [...f.exchange!.newSegments].sort((a, b) => a.segmentNo - b.segmentNo),
      additionalFare: convert(f.exchange!.additionalFare, cur, rate),
      changeFee: quote.agencyFee,
    };
  }

  if (f.kind === "refund" && quote.clientRefund.amountMinor < 0) {
    const kept = sum(
      quote.waiveOriginalFees
        ? [quote.supplierPenalty, quote.agencyFee, quote.vatOnAgencyFee]
        : [quote.supplierPenalty, quote.agencyFee, quote.vatOnAgencyFee, line.pricing.markup, line.pricing.serviceFee, line.pricing.vat],
      cur,
    );
    const waiveHint = quote.waiveOriginalFees ? "" : " or ask a Manager to waive the original markup and service fee";
    return fail(
      "VALIDATION",
      `The amounts kept (${format(kept)}: supplier penalty ${format(quote.supplierPenalty)}, agency fee ${format(quote.agencyFee)} plus VAT ${format(quote.vatOnAgencyFee)}${quote.waiveOriginalFees ? "" : ", and the original markup, service fee and VAT"}) are more than the price the client paid (${format(line.pricing.sell)}). Lower the penalty or the agency fee${waiveHint}.`,
      "supplierPenalty",
    );
  }

  const { number, counters } = takeNumber(state, "refund_request", ctx);
  const id = ctx.newId("rfq");
  const at = nowIso(ctx);
  const refund: RefundRequest = {
    id,
    number,
    fileId: file.id,
    lineId: line.id,
    kind: f.kind,
    reason: f.reason,
    quote,
    previousStatus: line.status,
    status: "requested",
    requestedBy: ctx.user.id,
    requestedAt: at,
  };
  if (exchange) refund.exchange = exchange;

  const next = produce(state, (d) => {
    d.refunds[id] = refund;
    d.counters = counters;
    const l = d.lines[line.id];
    l.statusHistory.push(historyEntry(l.status, "refund_pending", ctx, `${f.kind === "exchange" ? "Exchange" : "Refund"} ${number} requested: ${f.reason}`));
    l.status = "refund_pending";
    l.updatedAt = at;
    d.files[file.id].updatedAt = at;
  });

  const needsManager = f.kind === "refund" && refundNeedsManager(quote.clientRefund, state.settings);
  const what =
    f.kind === "exchange"
      ? `Exchange ${number} requested for ${line.description}: airline fee ${format(quote.supplierPenalty)}, additional fare ${format(exchange!.additionalFare)}, change fee ${format(quote.agencyFee)}`
      : `Refund ${number} requested for ${line.description}: client refund ${format(quote.clientRefund)}${quote.waiveOriginalFees ? " (original fees waived)" : ""}`;
  const summary = `${what}${needsManager ? " — needs Manager approval" : ""}`;
  return ok(next, [makeAudit(ctx, "refund.requested", "refund", id, summary, file.id)], { refundId: id, number }, `${f.kind === "exchange" ? "Exchange" : "Refund"} request ${number} created${needsManager ? " · needs Manager approval" : ""}`);
};
