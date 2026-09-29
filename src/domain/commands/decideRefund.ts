import { z } from "zod";
import type { AuditEvent, Command, CommandResult, Ctx, DbState, FlightDetails, FlightLine, ID, LedgerEntry, RefundRequest, ServiceLine } from "../types";
import { makeAudit } from "../audit";
import { add, format, zero } from "../money";
import { issueGroupOf, mirrorGroup, postRefundRetained } from "../ledger/postings";
import { canTransition } from "../status/line-machine";
import { LINE_STATUS_LABELS } from "../status/line-statuses";
import { denied, fail, historyEntry, nowIso, ok, parse, post, produce } from "./_helpers";
import { inferTripType, zId, zOptText } from "./_schemas";
import { buildServiceLine } from "./addServiceLine";

export interface DecideRefundInput {
  refundId: ID;
  decision: "approve" | "reject";
  note?: string;
}

export interface DecideRefundResult {
  /** Set when an exchange is approved: the new (booked) flight line. */
  newLineId?: ID;
}

const schema = z.object({ refundId: zId, decision: z.enum(["approve", "reject"]), note: zOptText });

const STATUS_WORD: Record<RefundRequest["status"], string> = { requested: "waiting for a decision", approved: "already approved", rejected: "already rejected", paid: "already paid out", closed: "already closed" };

function decided(refund: RefundRequest, status: RefundRequest["status"], ctx: Ctx, note?: string): RefundRequest {
  const r: RefundRequest = { ...refund, status, decidedBy: ctx.user.id, decidedAt: nowIso(ctx) };
  if (note) r.decisionNote = note;
  return r;
}

function reject(state: DbState, ctx: Ctx, refund: RefundRequest, line: ServiceLine, note?: string): CommandResult<DecideRefundResult> {
  const back = refund.previousStatus;
  const check = canTransition(line, back, { now: ctx.now, via: "decideRefund", previousStatus: back });
  if (!check.ok) return check;
  const at = nowIso(ctx);
  const next = produce(state, (d) => {
    const l = d.lines[line.id];
    l.statusHistory.push(historyEntry(l.status, back, ctx, `Refund ${refund.number} rejected${note ? `: ${note}` : ""}`));
    l.status = back;
    l.updatedAt = at;
    d.refunds[refund.id] = decided(refund, "rejected", ctx, note);
    if (d.files[line.fileId]) d.files[line.fileId].updatedAt = at;
  });
  const summary = `${refund.kind === "exchange" ? "Exchange" : "Refund"} ${refund.number} rejected; ${line.description} is ${LINE_STATUS_LABELS[back].toLowerCase()} again${note ? ` — ${note}` : ""}`;
  return ok(next, [makeAudit(ctx, "refund.rejected", "refund", refund.id, summary, line.fileId)], {}, `${refund.number} rejected`);
}

function approveRefund(state: DbState, ctx: Ctx, refund: RefundRequest, line: ServiceLine, note?: string): CommandResult<DecideRefundResult> {
  const check = canTransition(line, "refunded", { now: ctx.now, via: "decideRefund" });
  if (!check.ok) return check;
  const file = state.files[line.fileId];
  if (!file) return fail("NOT_FOUND", "The booking for this refund could not be found.");
  const at = nowIso(ctx);
  const pc = { newId: ctx.newId, at };

  const entries: LedgerEntry[] = [];
  const a = post(() => mirrorGroup(issueGroupOf(state.ledger, line.id), pc, { kind: "refund_reversal", memo: `Refund ${refund.number}: reversal of ${line.description}`, ref: { entity: "refund", id: refund.id } }));
  if (!a.ok) return a;
  const b = post(() => postRefundRetained(refund, line, file.clientId, pc));
  if (!b.ok) return b;
  entries.push(...a.entries, ...b.entries);

  const nothingToPay = refund.quote.clientRefund.amountMinor <= 0;
  const next = produce(state, (d) => {
    const l = d.lines[line.id];
    l.statusHistory.push(historyEntry(l.status, "refunded", ctx, `Refund ${refund.number} approved${note ? `: ${note}` : ""}`));
    l.status = "refunded";
    l.updatedAt = at;
    d.refunds[refund.id] = decided(refund, nothingToPay ? "closed" : "approved", ctx, note);
    d.ledger.push(...entries);
    d.files[file.id].updatedAt = at;
  });
  const audit: AuditEvent[] = [
    makeAudit(ctx, "refund.approved", "refund", refund.id, `Refund ${refund.number} approved: client refund ${format(refund.quote.clientRefund)}${note ? ` — ${note}` : ""}`, file.id),
    makeAudit(ctx, "line.refunded", "line", line.id, `${line.description} refunded`, file.id),
  ];
  return ok(next, audit, {}, nothingToPay ? `${refund.number} approved — nothing to pay out` : `${refund.number} approved — ${format(refund.quote.clientRefund)} to pay out`);
}

function approveExchange(state: DbState, ctx: Ctx, refund: RefundRequest, line: ServiceLine, note?: string): CommandResult<DecideRefundResult> {
  if (line.type !== "flight" || !refund.exchange) return fail("VALIDATION", "Only flights can be exchanged.");
  const check = canTransition(line, "exchanged", { now: ctx.now, via: "decideRefund" });
  if (!check.ok) return check;
  const file = state.files[line.fileId];
  if (!file) return fail("NOT_FOUND", "The booking for this exchange could not be found.");

  const orig = line.details;
  const cur = line.pricing.currency;
  const x = refund.exchange;
  const penalty = refund.quote.supplierPenalty;
  const segments = [...x.newSegments].sort((s1, s2) => s1.segmentNo - s2.segmentNo);
  const details: FlightDetails = {
    recordLocator: orig.recordLocator,
    validatingCarrier: orig.validatingCarrier,
    tripType: inferTripType(segments),
    segments,
    passengers: orig.passengers.map((p) => {
      const copy = { ...p, emdNumbers: [] as string[] };
      delete copy.ticketNumber;
      delete copy.fareAmount;
      return copy;
    }),
    // New line cost = additional fare + airline change fee (§8.6). The change fee is shown as tax code CP.
    fare: {
      currency: cur,
      baseFare: x.additionalFare,
      taxes: penalty.amountMinor > 0 ? [{ code: "CP", amount: penalty }] : [],
      totalFare: add(x.additionalFare, penalty),
      commissionPct: 0,
    },
    exchangedFromLineId: line.id,
  };
  if (orig.airlineLocator) details.airlineLocator = orig.airlineLocator;
  if (orig.officeId) details.officeId = orig.officeId;
  if (orig.baggage) details.baggage = orig.baggage;

  const built = buildServiceLine(state, ctx, {
    file,
    type: "flight",
    supplierId: line.supplierId,
    travellerIds: line.travellerIds,
    details,
    pricing: { currency: cur, markup: zero(cur), serviceFee: x.changeFee },
    status: "booked",
    source: line.source,
    external: line.external ? { ...line.external } : undefined,
    historyNote: `Created from exchange ${refund.number}`,
    skipBookedGuard: true,
  });
  if (!built.ok) return built;
  const newLine = built.line as FlightLine;
  const at = nowIso(ctx);

  const next = produce(state, (d) => {
    const l = d.lines[line.id] as FlightLine;
    l.statusHistory.push(historyEntry(l.status, "exchanged", ctx, `Exchange ${refund.number} approved${note ? `: ${note}` : ""}`));
    l.status = "exchanged";
    l.details.exchangedToLineId = newLine.id;
    l.updatedAt = at;
    d.lines[newLine.id] = newLine;
    const r = decided(refund, "closed", ctx, note);
    r.exchange = { ...x, newLineId: newLine.id };
    d.refunds[refund.id] = r;
    d.files[file.id].updatedAt = at;
  });
  const audit: AuditEvent[] = [
    makeAudit(ctx, "refund.approved", "refund", refund.id, `Exchange ${refund.number} approved${note ? ` — ${note}` : ""}`, file.id),
    makeAudit(ctx, "line.exchanged", "line", line.id, `${line.description} exchanged for ${newLine.description}`, file.id),
    makeAudit(ctx, "line.added", "line", newLine.id, `${newLine.description} added from exchange ${refund.number} (booked, sell ${format(newLine.pricing.sell)})`, file.id),
  ];
  return ok(next, audit, { newLineId: newLine.id }, `Exchange approved — enter the new ticket numbers to issue ${newLine.description}`);
}

export const decideRefund: Command<DecideRefundInput, DecideRefundResult> = (state, input, ctx) => {
  const no = denied(ctx, "refund.approve");
  if (no) return no;
  const parsed = parse(schema, input);
  if (!parsed.ok) return parsed;
  const f = parsed.data;

  const refund = state.refunds[f.refundId];
  if (!refund) return fail("NOT_FOUND", "This refund request could not be found.", "refundId");
  const noLimit = denied(ctx, "refund.approve", { clientRefund: refund.quote.clientRefund, settings: state.settings });
  if (noLimit) return noLimit;
  if (refund.status !== "requested") return fail("CONFLICT", `${refund.number} is ${STATUS_WORD[refund.status]}.`);

  const line = state.lines[refund.lineId];
  if (!line) return fail("NOT_FOUND", "The service for this refund request could not be found.");

  if (f.decision === "reject") return reject(state, ctx, refund, line, f.note);
  return refund.kind === "exchange" ? approveExchange(state, ctx, refund, line, f.note) : approveRefund(state, ctx, refund, line, f.note);
};
