"use client";

import * as React from "react";
import Link from "next/link";
import { Check, X } from "lucide-react";

import type { ID, Money, RefundRequest } from "@/domain/types";
import { can, forbiddenMessage, refundNeedsManager } from "@/domain/permissions";
import { decideRefund } from "@/domain/commands";
import { add, convert, format } from "@/domain/money";
import { useApp, useDispatch, useMe } from "@/store";
import { fmtDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Amount } from "@/components/shared/amount";
import { Code, KeyValues } from "@/components/shared/bits";
import { Banner, Field, FormSection } from "@/components/shared/field";
import { StatusChip } from "@/components/shared/status-chip";
import { FlightTimetable } from "@/components/bookings/flight-timetable";
import { PayoutForm } from "./payout-form";
import { exchangeExtra } from "./payment-rows";

/** Decide / pay out drawer for a refund or exchange request. Opens from ?tab=refunds&open=<refundId>. */
export function RefundDrawer({ refundId, onClose, onOpenPayment }: { refundId?: ID | null; onClose: () => void; onOpenPayment: (id: ID) => void }) {
  const refund = useApp((s) => (refundId ? s.db!.refunds[refundId] : undefined));
  return (
    <Sheet open={Boolean(refund)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="sm:max-w-xl">{refund && <RefundDetail refund={refund} onOpenPayment={onOpenPayment} />}</SheetContent>
    </Sheet>
  );
}

function Row({ label, value, strong, sub, rule, muted }: { label: React.ReactNode; value: Money; strong?: boolean; sub?: boolean; rule?: "top" | "double"; muted?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-4 py-1.5 text-sm",
        sub && "pl-3 text-ink-2",
        rule === "top" && "mt-1 border-t border-rule pt-2",
        rule === "double" && "mt-1 border-t-[1.5px] border-rule-strong pt-2",
        muted && "text-ink-3",
      )}
    >
      <span className={cn(strong ? "font-semibold text-ink" : "text-ink-2", muted && "text-ink-3")}>{label}</span>
      <Amount value={value} className={cn(strong && "font-semibold text-ink", muted && "text-ink-3")} />
    </div>
  );
}

export function RefundDetail({ refund: r, onOpenPayment }: { refund: RefundRequest; onOpenPayment: (id: ID) => void }) {
  const me = useMe();
  const db = useApp((s) => s.db)!;
  const dispatch = useDispatch();
  const [note, setNote] = React.useState("");
  const [noteError, setNoteError] = React.useState<string | null>(null);

  const file = db.files[r.fileId];
  const client = file ? db.clients[file.clientId] : undefined;
  const line = db.lines[r.lineId];
  const q = r.quote;
  const p = line?.pricing;
  const rate = db.settings.fx.USD_TZS;
  const exchange = r.kind === "exchange";
  const needsManager = !exchange && refundNeedsManager(q.clientRefund, db.settings);
  const limit = format(convert(db.settings.refundApprovalLimit, "TZS", rate));
  const canDecide = can(me, "refund.approve", { settings: db.settings, refund: r });
  const toPayOut = !exchange && r.status === "approved" && q.clientRefund.amountMinor > 0;
  const user = (id?: ID) => (id ? db.users[id]?.name : undefined);
  const extra = exchangeExtra(r, rate);
  const newLine = r.exchange?.newLineId ? db.lines[r.exchange.newLineId] : undefined;

  const decide = (decision: "approve" | "reject") => {
    if (decision === "reject" && !note.trim()) {
      setNoteError("Say why it is rejected, so the agent can tell the client.");
      return;
    }
    setNoteError(null);
    dispatch(decideRefund, { refundId: r.id, decision, note: note.trim() || undefined });
  };

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex flex-wrap items-center gap-2">
          <Code strong copy>
            {r.number}
          </Code>
          <span className="text-sm font-medium text-ink-3">{exchange ? "Exchange" : "Refund"}</span>
          <StatusChip status={`refund.${r.status}`} />
          {needsManager && r.status === "requested" && <StatusChip status="limit.manager" />}
        </SheetTitle>
        <SheetDescription>
          Requested by {user(r.requestedBy) ?? "staff"} · {fmtDateTime(r.requestedAt)}
        </SheetDescription>
      </SheetHeader>
      <SheetBody className="space-y-6">
        <KeyValues
          items={[
            {
              label: "Booking",
              value: file ? (
                <Link href={`/bookings/${file.id}`} className="font-mono whitespace-nowrap text-[13.5px] hover:underline">
                  {file.number}
                </Link>
              ) : (
                "—"
              ),
            },
            { label: "Client", value: client ? <Link href={`/clients/${client.id}`} className="hover:underline">{client.name}</Link> : "—" },
            { label: "Service", value: <span className="block max-w-[320px] text-right">{line?.description ?? "—"}</span> },
            { label: "Reason", value: r.reason },
          ]}
        />

        {exchange && r.exchange && (
          <FormSection title="New flights">
            <FlightTimetable segments={r.exchange.newSegments} compact />
          </FormSection>
        )}

        <FormSection title={exchange ? "What the client pays extra" : "Refund quote"} description={q.waiveOriginalFees ? "Original markup, service fee and VAT waived by a Manager." : undefined}>
          {exchange && r.exchange && extra ? (
            <div>
              <Row label="Additional fare" value={convert(r.exchange.additionalFare, q.currency, rate)} />
              <Row label="Airline change fee" value={q.supplierPenalty} />
              <Row label="Agency change fee" value={q.agencyFee} />
              <Row label="VAT on agency fee" value={q.vatOnAgencyFee} />
              <Row label="Extra to collect" value={extra} strong rule="double" />
            </div>
          ) : p ? (
            <div>
              <div className="col-head mb-1">Original sale</div>
              <Row label="Cost (supplier)" value={p.cost} sub />
              <Row label="Markup" value={p.markup} sub />
              <Row label="Service fee" value={p.serviceFee} sub />
              <Row label="VAT" value={p.vat} sub />
              <Row label="Client paid for this service" value={p.sell} strong rule="top" />
              <div className="col-head mt-4 mb-1">Kept</div>
              <Row label="Supplier penalty" value={q.supplierPenalty} sub />
              <Row label="Agency refund fee" value={q.agencyFee} sub />
              <Row label="VAT on agency fee" value={q.vatOnAgencyFee} sub />
              {!q.waiveOriginalFees && <Row label="Original markup, fee and VAT" value={add(add(p.markup, p.serviceFee), p.vat)} sub />}
              <Row label="Retained" value={{ amountMinor: p.sell.amountMinor - q.clientRefund.amountMinor, currency: q.currency }} rule="top" />
              <Row label="Client refund" value={q.clientRefund} strong rule="double" />
              <Row label="Supplier credit (cost − penalty)" value={q.supplierCredit} muted />
            </div>
          ) : (
            <p className="text-sm text-ink-3">The service for this request could not be found.</p>
          )}
        </FormSection>

        {r.status === "requested" && (
          <FormSection title="Decision" description={exchange || !needsManager ? `An Accountant or a Manager can decide (refunds up to ${limit}).` : `Above ${limit}: only a Manager can approve.`}>
            {canDecide ? (
              <div className="space-y-3">
                <Field label="Note" htmlFor="rf-note" optional error={noteError} hint="Required when rejecting.">
                  <Textarea id="rf-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={exchange ? "e.g. Fare difference confirmed with the airline" : "e.g. Penalty checked against the fare rules"} />
                </Field>
                <p className="text-[13.5px] text-ink-3">
                  {exchange
                    ? "Approving marks the ticket exchanged and adds the new flight as booked; the agent then issues the new ticket."
                    : `Approving marks the service refunded, posts the reversal, and leaves ${format(q.clientRefund)} to pay out to the client. Rejecting puts the service back as it was.`}
                </p>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="outline" onClick={() => decide("reject")}>
                    <X /> Reject
                  </Button>
                  <Button onClick={() => decide("approve")}>
                    <Check /> Approve {exchange ? "exchange" : format(q.clientRefund)}
                  </Button>
                </div>
              </div>
            ) : (
              <Banner tone="info">{forbiddenMessage("refund.approve", can(me, "refund.approve") ? { settings: db.settings, refund: r } : undefined, me)}</Banner>
            )}
          </FormSection>
        )}

        {r.decidedAt && (
          <FormSection title="Decision">
            <KeyValues
              items={[
                { label: r.status === "rejected" ? "Rejected by" : "Approved by", value: `${user(r.decidedBy) ?? "—"} · ${fmtDateTime(r.decidedAt)}` },
                { label: "Note", value: r.decisionNote, hidden: !r.decisionNote },
                {
                  label: "New flight",
                  value: newLine && file ? <Link href={`/bookings/${file.id}`} className="hover:underline">{newLine.description}</Link> : "—",
                  hidden: !exchange || !newLine,
                },
                {
                  label: "Paid out",
                  value: r.payoutPaymentId && db.payments[r.payoutPaymentId] ? (
                    <button type="button" onClick={() => onOpenPayment(r.payoutPaymentId!)} className="font-mono text-[13.5px] hover:underline">
                      {db.payments[r.payoutPaymentId].number}
                    </button>
                  ) : (
                    "—"
                  ),
                  hidden: r.status !== "paid",
                },
              ]}
            />
          </FormSection>
        )}

        {toPayOut &&
          (can(me, "refund.pay") ? (
            <PayoutForm refund={r} onPaid={onOpenPayment} />
          ) : (
            <Banner tone="info">{forbiddenMessage("refund.pay", undefined, me)}</Banner>
          ))}
      </SheetBody>
    </>
  );
}
