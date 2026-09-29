"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, CheckCheck, MessageCircle, Printer, Undo2 } from "lucide-react";

import type { ID, Payment } from "@/domain/types";
import { can } from "@/domain/permissions";
import { reversePayment, verifyPayment } from "@/domain/commands";
import { fileTotals } from "@/domain/selectors/fileTotals";
import { format } from "@/domain/money";
import { useApp, useDispatch, useMe } from "@/store";
import { fmtDateTime } from "@/lib/dates";
import { openWhatsApp } from "@/lib/whatsapp";

import { Button } from "@/components/ui/button";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Amount } from "@/components/shared/amount";
import { Code, KeyValues } from "@/components/shared/bits";
import { ConfirmDialog, Consequences } from "@/components/shared/confirm-dialog";
import { Banner } from "@/components/shared/field";
import { StatusChip } from "@/components/shared/status-chip";
import { receiptMessage } from "@/components/print/share";
import { METHOD_LABEL } from "./payment-rows";

/** Payment drawer: details, allocations, verify, reverse, print receipt, WhatsApp. Opens from ?open=<paymentId>. */
export function PaymentDrawer({ paymentId, onClose }: { paymentId?: ID | null; onClose: () => void }) {
  const payment = useApp((s) => (paymentId ? s.db!.payments[paymentId] : undefined));
  return (
    <Sheet open={Boolean(payment)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="sm:max-w-lg">{payment && <PaymentDetail payment={payment} />}</SheetContent>
    </Sheet>
  );
}

export function PaymentDetail({ payment: p }: { payment: Payment }) {
  const me = useMe();
  const db = useApp((s) => s.db)!;
  const dispatch = useDispatch();
  const [reversing, setReversing] = React.useState(false);

  const client = db.clients[p.clientId];
  const account = db.moneyAccounts[p.accountId];
  const out = p.direction === "out";
  const refund = p.refundRequestId ? db.refunds[p.refundRequestId] : undefined;
  const user = (id?: ID) => (id ? db.users[id]?.name : undefined);
  const allocs = p.allocations.map((a) => {
    const file = db.files[a.fileId];
    const balance = file ? fileTotals(db, file.id).balance : undefined;
    return { ...a, file, balance };
  });
  const canVerify = can(me, "payment.verify") && p.status === "recorded";
  const canReverse = can(me, "payment.reverse") && p.status !== "reversed";

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex flex-wrap items-center gap-2">
          <Code strong copy>
            {p.number}
          </Code>
          <StatusChip status={`payment.${p.status}`} />
        </SheetTitle>
        <SheetDescription>
          {out ? "Refund paid to" : "Received from"} {client?.name ?? "unknown client"} · {fmtDateTime(p.receivedAt)}
        </SheetDescription>
      </SheetHeader>
      <SheetBody className="space-y-6">
        <div className="flex items-baseline justify-between border-b border-rule pb-3">
          <span className="text-sm text-ink-3">{out ? "Paid out" : "Amount received"}</span>
          <Amount value={p.amount} size="lg" className={p.status === "reversed" ? "text-ink-3 line-through" : undefined} />
        </div>

        {p.status === "reversed" && p.reversal && (
          <Banner tone="info" title={`Reversed by ${user(p.reversal.by) ?? "staff"} on ${fmtDateTime(p.reversal.at)}`}>
            {p.reversal.reason}
          </Banner>
        )}

        <KeyValues
          items={[
            { label: "Client", value: client ? <Link href={`/clients/${client.id}`} className="hover:underline">{client.name}</Link> : "—" },
            { label: "Method", value: METHOD_LABEL[p.method] },
            { label: out ? "From account" : "Into account", value: account?.name ?? "—" },
            { label: "Reference", value: p.reference ? <Code copy>{p.reference}</Code> : <span className="text-ink-3">Cash, no reference</span> },
            { label: "Fiscal receipt no.", value: p.fiscalReceiptNo ? <Code>{p.fiscalReceiptNo}</Code> : "—", hidden: out },
            { label: "Rate used", value: <span className="tnum">1 USD = TZS {p.fxRate?.toLocaleString("en-US")}</span>, hidden: !p.fxRate },
            { label: "Recorded by", value: `${user(p.recordedBy) ?? "—"}` },
            { label: "Verified", value: p.verifiedAt ? `${user(p.verifiedBy) ?? "—"} · ${fmtDateTime(p.verifiedAt)}` : <span className="text-ink-3">Not yet</span>, hidden: p.status === "reversed" && !p.verifiedAt },
            {
              label: "Refund request",
              value: refund ? (
                <Link href={`/payments?tab=refunds&open=${refund.id}`} className="font-mono whitespace-nowrap text-[13.5px] hover:underline">
                  {refund.number}
                </Link>
              ) : (
                "—"
              ),
              hidden: !out,
            },
            { label: "Note", value: p.note, hidden: !p.note },
          ]}
        />

        <section>
          <h3 className="mb-2 text-sm font-semibold text-ink">Allocated to</h3>
          <Table containerClassName="overflow-visible">
            <TableHeader>
              <TableRow className="rule-head border-0">
                <TableHead className="h-auto px-0 pb-1.5 first:pl-0">Booking</TableHead>
                <TableHead className="h-auto px-0 pb-1.5 text-right">{out ? "Refunded" : "Allocated"}</TableHead>
                <TableHead className="h-auto pr-0 pb-1.5 pl-3 text-right whitespace-normal last:pr-0">Balance now</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {allocs.map((a, i) => (
                <TableRow key={`${a.fileId}-${i}`}>
                  <TableCell className="px-0 py-2 first:pl-0">
                    {a.file ? (
                      <Link href={`/bookings/${a.file.id}?tab=payments`} className="block leading-tight hover:underline">
                        <span className="block font-mono whitespace-nowrap text-[13.5px] font-semibold">{a.file.number}</span>
                        <span className="block max-w-[200px] truncate text-xs text-ink-3">{a.file.title}</span>
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="px-0 py-2 text-right">
                    <Amount value={a.amount} />
                  </TableCell>
                  <TableCell className="py-2 pr-0 pl-3 text-right last:pr-0">
                    <Amount value={a.balance} tone="balance" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      </SheetBody>
      <SheetFooter className="flex-wrap">
        <Button variant="outline" asChild>
          <Link href={`/print/receipt/${p.id}`} target="_blank">
            <Printer /> {out ? "Print payout" : "Print receipt"}
          </Link>
        </Button>
        <Button variant="outline" onClick={() => openWhatsApp(client?.phone, receiptMessage(db, p))} disabled={p.status === "reversed"}>
          <MessageCircle /> WhatsApp
        </Button>
        {canReverse && (
          <Button variant="danger-ghost" onClick={() => setReversing(true)}>
            <Undo2 /> Reverse
          </Button>
        )}
        {canVerify && (
          <Button onClick={() => dispatch(verifyPayment, { paymentId: p.id })}>
            <CheckCheck /> Verify
          </Button>
        )}
      </SheetFooter>

      <ConfirmDialog
        open={reversing}
        onOpenChange={setReversing}
        title={`Reverse ${p.number}?`}
        description="Use this when money never arrived, bounced or was recorded twice. The record stays, marked reversed."
        confirmLabel={`Reverse ${format(p.amount)}`}
        reason={{ label: "Reason", required: true, placeholder: "e.g. M-Pesa code not on the statement" }}
        onConfirm={(reason) => dispatch(reversePayment, { paymentId: p.id, reason }).ok}
      >
        <Consequences
          items={[
            <>
              {format(p.amount)} is taken back out of {account?.name ?? "the account"} and the ledger entries are mirrored.
            </>,
            ...allocs.map((a) =>
              a.file && a.balance ? (
                <span key={a.fileId} className="inline-flex flex-wrap items-center gap-1.5">
                  <span className="font-mono whitespace-nowrap text-[13.5px]">{a.file.number}</span> balance {out ? "goes down" : "goes back up"}:
                  <Amount value={a.balance} tone="balance" />
                  <ArrowRight className="size-3.5 text-brand" />
                  <Amount value={{ amountMinor: a.balance.amountMinor + (out ? -1 : 1) * a.amount.amountMinor, currency: a.balance.currency }} tone="balance" className="font-semibold" />
                </span>
              ) : null,
            ),
            ...(out && refund ? [<>Refund {refund.number} goes back to “approved, not paid” so it can be paid out again.</>] : []),
          ].filter(Boolean)}
        />
      </ConfirmDialog>
    </>
  );
}
