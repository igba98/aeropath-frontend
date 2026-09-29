"use client";

import type { ID } from "@/domain/types";
import { amountInWords } from "@/domain/money";
import { fileTotals } from "@/domain/selectors/fileTotals";
import { useApp } from "@/store";
import { fmtDate, fmtDateTime } from "@/lib/dates";

import { Amount } from "@/components/shared/amount";
import { METHOD_LABEL } from "@/components/payments/payment-rows";
import { DocFooter, DocSection, Grid, Letterhead, Party, Td, Th, Tr, Watermark } from "./doc-parts";
import { Paper, PrintMessage, PrintShell } from "./print-shell";
import { receiptMessage } from "./share";

/** Receipt (payment in) or refund payment advice (payment out). id = payment id. */
export function ReceiptDoc({ id }: { id: ID }) {
  const db = useApp((s) => s.db)!;
  const p = db.payments[id];
  if (!p) return <PrintMessage title="Receipt not found" body="The link may be wrong, or the payment was recorded on another device." />;

  const client = db.clients[p.clientId];
  const company = db.settings.company;
  const out = p.direction === "out";
  const account = db.moneyAccounts[p.accountId];
  const by = db.users[p.recordedBy];
  const refund = p.refundRequestId ? db.refunds[p.refundRequestId] : undefined;
  const firstFile = p.allocations[0] ? db.files[p.allocations[0].fileId] : undefined;

  return (
    <PrintShell
      title={p.number}
      backHref={firstFile ? `/bookings/${firstFile.id}?tab=payments` : `/payments?tab=received&open=${p.id}`}
      share={client && p.status !== "reversed" ? { phone: client.phone, text: receiptMessage(db, p) } : null}
    >
      <Paper>
        <Letterhead
          company={company}
          docTitle={out ? "Refund payment" : "Receipt"}
          number={p.number}
          meta={[
            { label: "Date", value: fmtDateTime(p.receivedAt) },
            ...(p.fiscalReceiptNo ? [{ label: "Fiscal receipt no.", value: <span className="font-mono">{p.fiscalReceiptNo}</span> }] : []),
            ...(refund ? [{ label: "Refund request", value: <span className="font-mono">{refund.number}</span> }] : []),
          ]}
        />
        {p.status === "reversed" && <Watermark word="Reversed" note={p.reversal ? `on ${fmtDate(p.reversal.at)}. This payment does not count towards any balance.` : undefined} />}

        <div className="mt-5 grid gap-5 sm:grid-cols-2 print:grid-cols-2">
          <Party label={out ? "Paid to" : "Received from"} name={client?.name ?? "—"} lines={[client?.address, client?.phone, client?.email, client?.tin && `TIN ${client.tin}`]} />
          <div className="sm:text-right print:text-right">
            <p className="col-head mb-1">{out ? "Amount paid" : "Amount received"}</p>
            <Amount value={p.amount} className="text-[22px] leading-7 font-semibold text-ink" />
          </div>
        </div>

        <p className="mt-4 border-y border-rule py-2 text-[12.5px] text-ink-2">
          <span className="text-ink-3">The sum of </span>
          <span className="font-medium text-ink">{amountInWords(p.amount)}</span>
          {p.fxRate && <span className="text-ink-3"> · rate 1 USD = TZS {p.fxRate.toLocaleString("en-US")}</span>}
        </p>

        <dl className="mt-3 grid grid-cols-1 gap-x-8 gap-y-1 text-[12.5px] sm:grid-cols-2 print:grid-cols-2">
          {[
            ["Method", METHOD_LABEL[p.method]],
            [out ? "Paid from" : "Paid into", account?.name ?? "—"],
            ["Reference", p.reference ? <span key="ref" className="font-mono">{p.reference}</span> : "Cash"],
            [out ? "Paid by" : "Received by", by?.name ?? "—"],
          ].map(([k, v]) => (
            <div key={String(k)} className="flex justify-between gap-4 border-b border-rule py-1.5">
              <dt className="text-ink-3">{k}</dt>
              <dd className="text-right text-ink">{v}</dd>
            </div>
          ))}
        </dl>

        <DocSection title={out ? "Refunded on" : "Allocated to"}>
          <Grid>
            <thead>
              <tr>
                <Th>Booking</Th>
                <Th>Trip</Th>
                <Th right>{out ? "Refunded" : "Applied"}</Th>
                <Th right>Balance remaining</Th>
              </tr>
            </thead>
            <tbody>
              {p.allocations.map((a, i) => {
                const f = db.files[a.fileId];
                const bal = f ? fileTotals(db, f.id).balance : undefined;
                return (
                  <Tr key={`${a.fileId}-${i}`}>
                    <Td className="font-mono font-semibold">{f?.number ?? "—"}</Td>
                    <Td className="text-ink-2">{f?.title}</Td>
                    <Td right>
                      <Amount value={a.amount} />
                    </Td>
                    <Td right>
                      <Amount value={bal} className="font-medium" />
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Grid>
          <p className="mt-1.5 text-[11px] text-ink-3">Balances as of {fmtDateTime(new Date())}.</p>
        </DocSection>

        {p.note && (
          <DocSection title="Note">
            <p className="text-[12px] text-ink-2">{p.note}</p>
          </DocSection>
        )}

        <DocFooter company={company}>{!out && <p className="mb-1 font-medium text-ink-2">Thank you for your payment.</p>}</DocFooter>
      </Paper>
    </PrintShell>
  );
}
