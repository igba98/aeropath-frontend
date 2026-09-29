"use client";

import * as React from "react";
import type { FlightSegment, Money, ServiceLine } from "@/domain/types";
import { requestRefund } from "@/domain/commands";
import { can, refundNeedsManager } from "@/domain/permissions";
import { computeExchangeQuote, computeRefundQuote } from "@/domain/refunds";
import { convert, format } from "@/domain/money";
import { useApp, useDispatch, useMe } from "@/store";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Amount } from "@/components/shared/amount";
import { Banner, Field, FieldGrid, FormSection } from "@/components/shared/field";
import { MoneyInput } from "@/components/shared/money-input";
import { StatusChip } from "@/components/shared/status-chip";
import { SegmentsEditor, type Errors } from "./line-forms";

/** Request a refund (any issued line) or an exchange (issued flight). Line → refund pending. */
export function RefundDialog({
  line,
  kind,
  open,
  onOpenChange,
}: {
  line: ServiceLine;
  kind: "refund" | "exchange";
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(kind === "exchange" ? "sm:max-w-[760px]" : "sm:max-w-[600px]")}>{open && <RefundBody line={line} kind={kind} onClose={() => onOpenChange(false)} />}</DialogContent>
    </Dialog>
  );
}

function RefundBody({ line, kind, onClose }: { line: ServiceLine; kind: "refund" | "exchange"; onClose: () => void }) {
  const me = useMe();
  const settings = useApp((s) => s.db!.settings);
  const dispatch = useDispatch();
  const cur = line.pricing.currency;
  const defFee = settings.defaultServiceFee.service_fee ? convert(settings.defaultServiceFee.service_fee, cur, settings.fx.USD_TZS) : { amountMinor: 0, currency: cur };

  const [reason, setReason] = React.useState("");
  const [penalty, setPenalty] = React.useState<number | null>(null);
  const [fee, setFee] = React.useState<number | null>(defFee.amountMinor);
  const [waive, setWaive] = React.useState(false);
  const [segments, setSegments] = React.useState<FlightSegment[]>(() =>
    line.type === "flight" ? line.details.segments.map((s) => ({ ...s, departureLocal: "", arrivalLocal: "", statusCode: "HK" as const })) : [],
  );
  const [addFare, setAddFare] = React.useState<number | null>(0);
  const [errors, setErrors] = React.useState<Errors>({});

  const m = (minor: number | null): Money => ({ amountMinor: minor ?? 0, currency: cur });
  const quote =
    kind === "refund"
      ? computeRefundQuote(line.pricing, { supplierPenalty: m(penalty), agencyFee: m(fee), waiveOriginalFees: waive }, settings)
      : computeExchangeQuote(line.pricing, m(penalty), m(fee), settings);
  const negative = kind === "refund" && quote.clientRefund.amountMinor < 0;
  const needsManager = kind === "refund" && refundNeedsManager(quote.clientRefund, settings);
  const canWaive = can(me, "refund.waive");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const er: Errors = {};
    if (!reason.trim()) er.reason = kind === "refund" ? "Say why the client is refunding (e.g. trip cancelled)." : "Say what changes (e.g. new return date).";
    if (penalty === null) er.penalty = kind === "refund" ? "Enter the airline or supplier penalty, 0 if none." : "Enter the airline change fee, 0 if none.";
    if (negative) er.penalty = "The penalty and fees are more than the client paid. Lower the agency fee or check the penalty.";
    if (kind === "exchange") {
      segments.forEach((s, i) => {
        if (!s.departureLocal) er[`seg.${i}.departureLocal`] = "Departure";
        if (!s.arrivalLocal) er[`seg.${i}.arrivalLocal`] = "Arrival";
        if (!/^\d{1,4}[A-Z]?$/.test(s.flightNumber)) er[`seg.${i}.flightNumber`] = "Flight no.";
      });
    }
    setErrors(er);
    if (Object.keys(er).length) return;
    const r = dispatch(requestRefund, {
      lineId: line.id,
      kind,
      reason: reason.trim(),
      supplierPenalty: m(penalty),
      agencyFee: kind === "refund" ? m(fee) : undefined,
      waiveOriginalFees: kind === "refund" && waive ? true : undefined,
      exchange: kind === "exchange" ? { newSegments: segments, additionalFare: m(addFare), changeFee: m(fee) } : undefined,
    });
    if (r.ok) onClose();
  };

  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-col">
      <DialogHeader>
        <DialogTitle>{kind === "refund" ? "Request a refund" : "Request an exchange"}</DialogTitle>
        <DialogDescription>{line.description}</DialogDescription>
      </DialogHeader>
      <DialogBody className="space-y-4">
        <Field label="Reason" htmlFor="rf-reason" required error={errors.reason}>
          <Textarea id="rf-reason" autoFocus rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>

        {kind === "exchange" && line.type === "flight" && (
          <FormSection title="New flights" description="Change dates or flights; times are local at each airport.">
            <SegmentsEditor segments={segments} onChange={setSegments} errors={errors} airlines={settings.airlines} />
          </FormSection>
        )}

        <FieldGrid cols={kind === "exchange" ? 3 : 2}>
          <Field label={kind === "refund" ? "Supplier penalty" : "Airline change fee"} htmlFor="rf-pen" required error={errors.penalty} hint="From the fare rules">
            <MoneyInput id="rf-pen" value={penalty} onChange={setPenalty} currency={cur} invalid={Boolean(errors.penalty)} />
          </Field>
          {kind === "exchange" && (
            <Field label="Additional fare" htmlFor="rf-add" hint="Fare difference collected">
              <MoneyInput id="rf-add" value={addFare} onChange={setAddFare} currency={cur} />
            </Field>
          )}
          <Field label={kind === "refund" ? "Agency refund fee" : "Agency change fee"} htmlFor="rf-fee" hint={`VAT ${Math.round(settings.vatRate * 100)}% added`}>
            <MoneyInput id="rf-fee" value={fee} onChange={setFee} currency={cur} />
          </Field>
        </FieldGrid>

        {kind === "refund" && canWaive && (
          <label className="flex items-start gap-2.5 text-sm">
            <Switch checked={waive} onCheckedChange={setWaive} className="mt-0.5" />
            <span>
              <span className="font-medium text-ink">Waive the original fees</span>
              <span className="block text-[13px] text-ink-3">Return the original markup, service fee and its VAT to the client. Manager only.</span>
            </span>
          </label>
        )}

        <Table containerClassName="rounded-md border border-rule">
          <TableBody>
            {kind === "refund" ? (
              <>
                <Row label="Client paid for this line" value={line.pricing.sell} />
                <Row label="Supplier penalty" value={quote.supplierPenalty} minus />
                <Row label="Agency refund fee" value={quote.agencyFee} minus />
                <Row label="VAT on agency fee" value={quote.vatOnAgencyFee} minus />
                {!waive && <Row label="Original markup, service fee and VAT (kept)" value={{ amountMinor: line.pricing.markup.amountMinor + line.pricing.serviceFee.amountMinor + line.pricing.vat.amountMinor, currency: cur }} minus />}
                <TableRow className="border-t-[1.5px] border-rule-strong">
                  <TableCell className="px-3 py-2.5 font-semibold text-ink first:pl-3">Client refund</TableCell>
                  <TableCell className="px-3 py-2.5 text-right last:pr-3">
                    <Amount value={quote.clientRefund} size="lg" tone="auto" />
                  </TableCell>
                </TableRow>
              </>
            ) : (
              <>
                <Row label="Original ticket value (carried into the new ticket)" value={line.pricing.sell} />
                <Row label="New line cost: additional fare + change fee" value={{ amountMinor: (addFare ?? 0) + (penalty ?? 0), currency: cur }} />
                <Row label="Agency change fee + VAT" value={{ amountMinor: quote.agencyFee.amountMinor + quote.vatOnAgencyFee.amountMinor, currency: cur }} />
                <TableRow className="border-t-[1.5px] border-rule-strong">
                  <TableCell className="px-3 py-2.5 font-semibold text-ink first:pl-3">Client pays extra</TableCell>
                  <TableCell className="px-3 py-2.5 text-right last:pr-3">
                    <Amount value={{ amountMinor: (addFare ?? 0) + (penalty ?? 0) + quote.agencyFee.amountMinor + quote.vatOnAgencyFee.amountMinor, currency: cur }} size="lg" />
                  </TableCell>
                </TableRow>
              </>
            )}
          </TableBody>
        </Table>

        {negative && <Banner tone="error">The penalty and fees add up to more than the client paid ({format(line.pricing.sell)}). A refund can&apos;t be negative.</Banner>}
        {kind === "refund" && !negative && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
            {needsManager ? (
              <>
                <StatusChip status="limit.manager" />
                Above {format(settings.refundApprovalLimit)}: only a Manager can approve.
              </>
            ) : (
              <>An Accountant or Manager can approve (at or below {format(settings.refundApprovalLimit)}).</>
            )}
          </div>
        )}
        {kind === "exchange" && <p className="text-[13px] text-ink-3">On approval, this ticket becomes Exchanged and a new flight line is created as Booked. Issue it with the new ticket numbers.</p>}
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={negative}>
          Send for approval
        </Button>
      </DialogFooter>
    </form>
  );
}

function Row({ label, value, minus }: { label: string; value: Money; minus?: boolean }) {
  return (
    <TableRow>
      <TableCell className="px-3 py-2 text-ink-2 first:pl-3">{label}</TableCell>
      <TableCell className="px-3 py-2 text-right last:pr-3">
        <Amount value={minus ? { ...value, amountMinor: -value.amountMinor } : value} className={cn(minus && "text-ink-2")} />
      </TableCell>
    </TableRow>
  );
}
