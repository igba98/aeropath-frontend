"use client";

import * as React from "react";
import { ClipboardPaste, CloudDownload, Loader2, Ticket } from "lucide-react";

import type { ID, ServiceLine } from "@/domain/types";
import { transitionLine, updateServiceLine } from "@/domain/commands";
import type { Currency } from "@/domain/types";
import { computeVoidDeadline } from "@/domain/status/line-machine";
import { format } from "@/domain/money";
import { parsePnr } from "@/providers/pnr-parser/parse";
import { getProvider } from "@/providers";
import { ticketNumbers } from "@/providers/inventory/flights";
import { toProviderError } from "@/providers/types";
import { findAirline } from "@/store/seed/reference";
import { useApp, useDispatch } from "@/store";
import { fmtDateTime } from "@/lib/dates";

import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Banner, Field } from "@/components/shared/field";
import { MoneyInput } from "@/components/shared/money-input";
import { Consequences } from "@/components/shared/confirm-dialog";

const TICKET_RE = /^\d{3}-?\d{10}$/;
const CONF_LABEL: Record<string, string> = {
  hotel: "Hotel confirmation no.",
  car: "Car hire confirmation no.",
  transfer: "Transfer confirmation no.",
  tour: "Tour confirmation no.",
  visa: "Visa reference",
  insurance: "Policy no.",
};

function currentConfirmation(line: ServiceLine): string {
  switch (line.type) {
    case "hotel":
    case "car":
    case "transfer":
    case "tour":
      return line.details.confirmationNumber ?? "";
    case "visa":
      return line.details.reference ?? "";
    case "insurance":
      return line.details.policyNumber ?? "";
    default:
      return "";
  }
}

/** Issue a line: tickets for flights, confirmation numbers for everything else. Posts the issue group. */
export function IssueDialog({ line, open, onOpenChange }: { line: ServiceLine; open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">{open && <IssueBody line={line} onClose={() => onOpenChange(false)} />}</DialogContent>
    </Dialog>
  );
}

function IssueBody({ line, onClose }: { line: ServiceLine; onClose: () => void }) {
  const dispatch = useDispatch();
  const db = useApp((s) => s.db)!;
  const settings = db.settings;
  const isFlight = line.type === "flight";

  // Settings first (the Manager may have corrected it), then the reference list.
  const prefix = isFlight ? (findAirline(line.details.validatingCarrier, settings.airlines)?.ticketPrefix ?? findAirline(line.details.validatingCarrier)?.ticketPrefix) : undefined;
  // Booked through Search and book: the airline can issue straight away.
  const fromSearch = isFlight && Boolean(line.external?.externalIds?.offers);
  const [tickets, setTickets] = React.useState<Record<ID, string>>(() =>
    isFlight ? Object.fromEntries(line.details.passengers.map((p) => [p.travellerId, p.ticketNumber ?? (prefix ? `${prefix}-` : "")])) : {},
  );
  const [conf, setConf] = React.useState(() => currentConfirmation(line));
  const needFare = isFlight && line.details.fare.totalFare.amountMinor === 0;
  const [fare, setFare] = React.useState<{ currency: Currency; minor: number | null }>({ currency: isFlight ? line.details.fare.currency : "USD", minor: null });
  const [paste, setPaste] = React.useState<string | null>(null);
  const [pasteMsg, setPasteMsg] = React.useState<string | null>(null);
  const [mock, setMock] = React.useState<{ loading: boolean; error?: string }>({ loading: false });
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const fillFromPnr = (text: string) => {
    if (!isFlight) return;
    const s = parsePnr(text, new Date());
    if (!s.tickets.length) {
      setPasteMsg("No FA ticket lines in that PNR yet. Issue in Amadeus first, then paste the new display.");
      return;
    }
    const next = { ...tickets };
    let filled = 0;
    for (const p of line.details.passengers) {
      const byNo = p.pnrPaxNo ? s.tickets.find((t) => t.pnrPaxNo === p.pnrPaxNo) : undefined;
      const pax = s.passengers.find((x) => `${x.surname}/${x.givenName}`.toUpperCase() === p.nameInPnr.split(" ").slice(0, -1).join(" ").toUpperCase() || p.nameInPnr.toUpperCase().startsWith(`${x.surname}/${x.givenName}`.toUpperCase()));
      const byName = pax ? s.tickets.find((t) => t.pnrPaxNo === pax.pnrPaxNo) : undefined;
      const t = byNo ?? byName;
      if (t) {
        next[p.travellerId] = t.ticketNumber;
        filled++;
      }
    }
    setTickets(next);
    const priced = s.tickets.filter((t) => t.currency && typeof t.amount === "number");
    if (needFare && priced.length) {
      const cur = priced[0].currency as Currency;
      setFare({ currency: cur, minor: Math.round(priced.filter((t) => t.currency === cur).reduce((a, t) => a + (t.amount ?? 0), 0) * 100) });
    }
    setPasteMsg(`Filled ${filled} of ${line.details.passengers.length} ticket numbers${needFare && priced.length ? " and the fare" : ""} from the PNR.`);
  };

  const issueInMock = async () => {
    if (!isFlight) return;
    setMock({ loading: true });
    try {
      const r = await getProvider(settings).issueTicket(line.details.recordLocator);
      fillFromTickets(r.tickets.map((t) => ({ pnrPaxNo: t.pnrPaxNo, ticketNumber: t.ticketNumber })));
      setMock({ loading: false });
    } catch (e) {
      setMock({ loading: false, error: toProviderError(e).message });
    }
  };

  const fillFromTickets = (list: { pnrPaxNo: number; ticketNumber: string }[]) => {
    if (!isFlight) return;
    const next = { ...tickets };
    line.details.passengers.forEach((p, i) => {
      const t = list.find((x) => x.pnrPaxNo === (p.pnrPaxNo ?? i + 1)) ?? list[i];
      if (t) next[p.travellerId] = t.ticketNumber;
    });
    setTickets(next);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (isFlight) {
      for (const p of line.details.passengers) {
        const v = (tickets[p.travellerId] ?? "").replace(/\s/g, "");
        if (!TICKET_RE.test(v)) er[p.travellerId] = "13 digits: 3-digit airline code, then 10 digits (e.g. 176-2401234567).";
      }
    } else if (["hotel", "car", "transfer", "tour"].includes(line.type) && !conf.trim()) {
      er.conf = "The supplier's confirmation number is needed to issue.";
    }
    if (needFare && !fare.minor) er.fare = "Enter the total fare for all passengers, or paste the ticketed PNR to fill it.";
    setErrors(er);
    if (Object.keys(er).length) return;
    if (needFare && isFlight) {
      const total = { amountMinor: fare.minor!, currency: fare.currency };
      const u = dispatch(
        updateServiceLine,
        { lineId: line.id, patch: { details: { fare: { ...line.details.fare, currency: fare.currency, baseFare: total, taxes: [], totalFare: total } } } },
        { toast: false },
      );
      if (!u.ok) return;
    }
    const r = dispatch(transitionLine, {
      lineId: line.id,
      to: "issued",
      tickets: isFlight ? line.details.passengers.map((p) => ({ travellerId: p.travellerId, ticketNumber: tickets[p.travellerId].replace(/\s/g, "") })) : undefined,
      confirmationNumber: !isFlight && conf.trim() ? conf.trim() : undefined,
    });
    if (r.ok) onClose();
  };

  const supplier = db.suppliers[line.supplierId];
  const voidUntil = isFlight ? computeVoidDeadline(new Date(), settings.voidWindow) : null;
  const mockOn = settings.integrations.amadeus.mode === "mock";

  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-col">
      <DialogHeader>
        <DialogTitle>{isFlight ? "Issue tickets" : `Issue ${line.type.replace("_", " ")}`}</DialogTitle>
        <DialogDescription>{line.description}</DialogDescription>
      </DialogHeader>
      <DialogBody className="space-y-4">
        {isFlight && (
          <>
            {fromSearch && (
              <div className="rounded-lg border border-brand-200 bg-band p-3 dark:border-brand-800">
                {prefix ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="min-w-0 flex-1 text-sm text-ink-2">Booked through Search and book. The airline issues the e-tickets at once.</p>
                    <Button type="button" size="sm" onClick={() => fillFromTickets(ticketNumbers(prefix, line.details.passengers.length).map((ticketNumber, i) => ({ pnrPaxNo: line.details.passengers[i].pnrPaxNo ?? i + 1, ticketNumber })))}>
                      <Ticket /> Get ticket numbers
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-ink-2">{findAirline(line.details.validatingCarrier)?.name ?? line.details.validatingCarrier} issues its own tickets. Type the numbers from the airline&rsquo;s confirmation.</p>
                )}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setPaste(paste === null ? "" : null)}>
                <ClipboardPaste /> Fill from ticketed PNR
              </Button>
              {mockOn && (
                <Button type="button" variant="outline" size="sm" onClick={() => void issueInMock()} disabled={mock.loading}>
                  {mock.loading ? <Loader2 className="animate-spin" /> : <CloudDownload />} Issue in Amadeus (mock)
                </Button>
              )}
            </div>
            {paste !== null && (
              <div className="space-y-2">
                <Textarea
                  autoFocus
                  rows={5}
                  value={paste}
                  onChange={(e) => {
                    setPaste(e.target.value);
                    if (e.target.value.trim()) fillFromPnr(e.target.value);
                  }}
                  placeholder="Paste the PNR display after ticketing; the FA lines fill the numbers."
                  className="font-mono text-[13px] leading-[18px]"
                />
                {pasteMsg && <p className="text-[13px] text-ink-3">{pasteMsg}</p>}
              </div>
            )}
            {mock.error && <Banner tone="error">{mock.error}</Banner>}
            {needFare && (
              <Field label="Total fare, all passengers" htmlFor="issue-fare" required error={errors.fare} hint="This line has no fare yet. Use the ticketed fare from Amadeus.">
                <MoneyInput id="issue-fare" value={fare.minor} onChange={(m) => setFare((f) => ({ ...f, minor: m }))} currency={fare.currency} onCurrencyChange={(c) => setFare((f) => ({ ...f, currency: c }))} invalid={Boolean(errors.fare)} />
              </Field>
            )}
            <div className="space-y-3">
              {line.details.passengers.map((p) => (
                <Field key={p.travellerId} label={<span className="font-mono whitespace-nowrap text-[13px]">{p.nameInPnr}</span>} htmlFor={`tk-${p.travellerId}`} error={errors[p.travellerId]}>
                  <Input
                    id={`tk-${p.travellerId}`}
                    inputMode="numeric"
                    value={tickets[p.travellerId] ?? ""}
                    onChange={(e) => setTickets((t) => ({ ...t, [p.travellerId]: e.target.value.replace(/[^\d-]/g, "") }))}
                    placeholder="176-2401234567"
                    className="font-mono tracking-wide"
                    aria-invalid={Boolean(errors[p.travellerId]) || undefined}
                  />
                </Field>
              ))}
            </div>
          </>
        )}
        {!isFlight && CONF_LABEL[line.type] && (
          <Field label={CONF_LABEL[line.type]} htmlFor="issue-conf" required={["hotel", "car", "transfer", "tour"].includes(line.type)} optional={!["hotel", "car", "transfer", "tour"].includes(line.type)} error={errors.conf}>
            <Input id="issue-conf" autoFocus value={conf} onChange={(e) => setConf(e.target.value)} className="font-mono" />
          </Field>
        )}
        <div className="rounded-md border border-rule bg-canvas p-3 text-sm text-ink-2">
          <Consequences
            items={[
              <>The client is charged <strong className="tnum text-ink">{format(line.pricing.sell)}</strong> in the books.</>,
              <>We owe {supplier?.name ?? "the supplier"} <strong className="tnum text-ink">{format(line.pricing.cost)}</strong>.</>,
              ...(voidUntil ? [<>You can void until <strong className="text-ink">{fmtDateTime(voidUntil)}</strong>. After that, only a refund or exchange.</>] : []),
            ]}
          />
        </div>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit">{isFlight ? `Issue ${line.details.passengers.length} ticket${line.details.passengers.length === 1 ? "" : "s"}` : "Mark issued"}</Button>
      </DialogFooter>
    </form>
  );
}
