"use client";

import type { ID } from "@/domain/types";
import { money, sub, sum } from "@/domain/money";
import { fileTotals } from "@/domain/selectors/fileTotals";
import { invoicesOfFile } from "@/domain/selectors/core";
import { useApp } from "@/store";
import { fmtDate } from "@/lib/dates";

import { Amount } from "@/components/shared/amount";
import { DocFooter, DocSection, Grid, Letterhead, Party, Td, Th, Totals, Tr, Watermark } from "./doc-parts";
import { Paper, PrintMessage, PrintShell } from "./print-shell";
import { invoiceMessage, tripSummary } from "./share";

/** Invoice or quote (id = invoice id), from the frozen snapshot; paid to date and balance due are live. */
export function InvoiceDoc({ id, kind }: { id: ID; kind: "invoice" | "quote" }) {
  const db = useApp((s) => s.db)!;
  const inv = db.invoices[id];
  if (!inv || inv.kind !== kind) return <PrintMessage title={`${kind === "quote" ? "Quote" : "Invoice"} not found`} body="The link may be wrong, or the document was issued on another device." />;

  const file = db.files[inv.fileId];
  const client = file ? db.clients[file.clientId] : undefined;
  const company = db.settings.company;
  const snap = inv.snapshot;
  const c = snap.currency;
  const quote = inv.kind === "quote";
  const fees = sum(
    snap.lines.map((l) => l.serviceFee),
    c,
  );
  const subtotal = sub(sub(snap.total, snap.vat), fees);
  const totals = file ? fileTotals(db, file.id) : undefined;
  const paid = totals?.received ?? money(0, c);
  const balance = totals?.balance ?? snap.total;
  const replacedBy =
    inv.status === "superseded" ? invoicesOfFile(db, inv.fileId, inv.kind).filter((o) => o.issuedAt > inv.issuedAt).sort((a, b) => a.issuedAt.localeCompare(b.issuedAt))[0] : undefined;
  const cb = snap.clientBlock;
  const vatPct = Math.round(db.settings.vatRate * 100);

  return (
    <PrintShell title={inv.number} backHref={file ? `/bookings/${file.id}?tab=documents` : "/bookings"} share={client && inv.status === "issued" ? { phone: client.phone, text: invoiceMessage(db, inv) } : null}>
      <Paper>
        <Letterhead
          company={company}
          docTitle={quote ? "Quotation" : "Invoice"}
          number={inv.number}
          meta={[
            { label: "Issued", value: fmtDate(inv.issuedAt) },
            ...(quote ? [] : [{ label: "Due", value: fmtDate(inv.dueAt) }]),
            ...(file ? [{ label: "Booking", value: <span className="font-mono">{file.number}</span> }] : []),
            { label: "Currency", value: c },
          ]}
        />
        {inv.status === "superseded" && <Watermark word="Superseded" note={replacedBy ? `Replaced by ${replacedBy.number} on ${fmtDate(replacedBy.issuedAt)}. Do not pay from this copy.` : "A newer document replaces this one."} />}
        {inv.status === "void" && <Watermark word="Void" note="The booking was cancelled. This document is no longer valid." />}

        <div className="mt-5 grid gap-5 sm:grid-cols-2 print:grid-cols-2">
          <Party label={quote ? "Prepared for" : "Bill to"} name={cb.name} lines={[cb.address, cb.phone, cb.email, cb.tin && `TIN ${cb.tin}`, client?.vrn && `VRN ${client.vrn}`]} />
          {file && <Party label="Trip" name={tripSummary(db, file.id)} lines={[file.title !== tripSummary(db, file.id) && file.title]} className="sm:text-right print:text-right" />}
        </div>

        <DocSection title={quote ? "Services quoted" : "Services"}>
          <Grid>
            <thead>
              <tr>
                <Th className="w-8">#</Th>
                <Th>Description</Th>
                <Th>Travellers</Th>
                <Th right>Amount</Th>
              </tr>
            </thead>
            <tbody>
              {snap.lines.map((l, i) => (
                <Tr key={`${l.lineId}-${i}`}>
                  <Td className="tnum text-ink-3">{i + 1}</Td>
                  <Td className="text-ink">{l.description}</Td>
                  <Td className="text-[11.5px] text-ink-2">{l.travellers.length ? l.travellers.join(", ") : "—"}</Td>
                  <Td right>
                    <Amount value={sub(sub(l.sell, l.serviceFee), l.vat)} />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Grid>
        </DocSection>

        <Totals
          className="mt-3"
          rows={[
            { label: "Subtotal", value: subtotal, rule: true },
            { label: "Service fees", value: fees },
            { label: `VAT${vatPct ? ` ${vatPct}%` : ""}`, value: snap.vat },
            { label: "Total", value: snap.total, strong: true },
            ...(!quote || paid.amountMinor !== 0 ? [{ label: "Paid to date", value: paid, muted: true }] : []),
            ...(!quote ? [{ label: balance.amountMinor < 0 ? "Credit to client" : "Balance due", value: balance, strong: true }] : []),
          ]}
        />
        {!quote && totals && totals.charges.amountMinor !== snap.total.amountMinor && (
          <p className="mt-2 text-right text-[11px] text-ink-3">Balance reflects the booking as of {fmtDate(new Date())}, including changes after this invoice.</p>
        )}

        {!quote && db.settings.paymentInstructions && (
          <DocSection title="How to pay">
            <p className="text-[12px] whitespace-pre-line text-ink-2">{db.settings.paymentInstructions}</p>
            <p className="mt-1 text-[12px] text-ink-2">
              Please quote <span className="font-mono font-semibold text-ink">{inv.number}</span> as the payment reference.
            </p>
          </DocSection>
        )}

        <DocFooter company={company}>
          {quote && <p className="mb-1 font-medium text-ink-2">Prices subject to availability until ticketed.</p>}
        </DocFooter>
      </Paper>
    </PrintShell>
  );
}
