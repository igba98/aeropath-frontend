"use client";

import * as React from "react";
import Link from "next/link";
import { BadgeCheck, MessageCircle, Printer, Undo2, Wallet } from "lucide-react";

import type { BookingFile, Payment } from "@/domain/types";
import { can, refundNeedsManager } from "@/domain/permissions";
import { reversePayment, verifyPayment } from "@/domain/commands";
import { allocationTo, paymentsOfFile, refundsOfFile } from "@/domain/selectors/core";
import { format } from "@/domain/money";
import { PAYMENT_METHODS } from "@/store/seed/reference";
import { useApp, useDispatch, useMe } from "@/store";
import { useModals } from "@/store/modals";
import { fmtDateTime, fmtRelative } from "@/lib/dates";
import { firstName, openWhatsApp } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Amount } from "@/components/shared/amount";
import { Code } from "@/components/shared/bits";
import { ConfirmDialog, Consequences } from "@/components/shared/confirm-dialog";
import { EmptyState, Section } from "@/components/shared/page";
import { StatusChip } from "@/components/shared/status-chip";

/** Every allocation to this booking (in and out) with actions by role, then refund requests. */
export function PaymentsTab({ file }: { file: BookingFile }) {
  const me = useMe();
  const db = useApp((s) => s.db)!;
  const dispatch = useDispatch();
  const openPayment = useModals((s) => s.openPayment);
  const [reverse, setReverse] = React.useState<Payment | null>(null);
  const payments = paymentsOfFile(db, file.id).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  const refunds = refundsOfFile(db, file.id);
  const client = db.clients[file.clientId];
  const method = (m: Payment["method"]) => PAYMENT_METHODS.find((x) => x.value === m)?.label ?? m;

  return (
    <div className="space-y-8">
      <Section
        title="Payments"
        count={payments.length}
        actions={
          can(me, "payment.record") && (
            <Button variant="outline" size="sm" onClick={() => openPayment({ fileId: file.id, clientId: file.clientId })}>
              <Wallet /> Record payment
            </Button>
          )
        }
      >
        {payments.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="No money received yet"
            body="Record a deposit or full payment; it shows here and updates the balance."
            action={
              can(me, "payment.record") && (
                <Button onClick={() => openPayment({ fileId: file.id, clientId: file.clientId })}>
                  <Wallet /> Record payment
                </Button>
              )
            }
          />
        ) : (
          <Table className="min-w-[720px]">
            <TableHeader>
              <TableRow className="rule-head border-0">
                <TableHead className="h-auto px-0 pb-2 first:pl-0">Receipt</TableHead>
                <TableHead className="h-auto px-0 pb-2">Received</TableHead>
                <TableHead className="h-auto px-0 pb-2 whitespace-normal">Method · reference</TableHead>
                <TableHead className="h-auto px-0 pb-2 text-right whitespace-normal">To this booking</TableHead>
                <TableHead className="h-auto pr-0 pb-2 pl-4">Status</TableHead>
                <TableHead className="h-auto px-0 pb-2 last:pr-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((p) => {
                const a = allocationTo(p, file.id);
                const out = p.direction === "out";
                return (
                  <TableRow key={p.id} className={cn(p.status === "reversed" && "text-ink-3")}>
                    <TableCell className="px-0 py-2.5 first:pl-0">
                      <Code className={cn(p.status === "reversed" && "line-through")}>{p.number}</Code>
                      {out && <span className="ml-1.5 text-xs text-[var(--st-violet-fg)]">refund out</span>}
                    </TableCell>
                    <TableCell className="px-0 py-2.5 whitespace-nowrap">
                      <span className="tnum block">{fmtDateTime(p.receivedAt)}</span>
                      <span className="block text-xs text-ink-3">by {db.users[p.recordedBy]?.name}</span>
                    </TableCell>
                    <TableCell className="px-0 py-2.5">
                      <span className="block">{method(p.method)}</span>
                      <span className="block font-mono whitespace-nowrap text-xs text-ink-3">{p.reference ?? "—"}</span>
                    </TableCell>
                    <TableCell className="px-0 py-2.5 text-right">
                      {a && <Amount value={out ? { ...a, amountMinor: -a.amountMinor } : a} className={cn(p.status === "reversed" && "line-through")} />}
                      {p.amount.currency !== a?.currency && (
                        <span className="block text-xs text-ink-3">
                          paid {format(p.amount)} @ {p.fxRate?.toLocaleString("en-US")}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="py-2.5 pr-0 pl-4">
                      <StatusChip status={`payment.${p.status}`} />
                      {p.status === "recorded" && <span className="ml-1.5 text-xs text-ink-3">{fmtRelative(p.receivedAt)}</span>}
                    </TableCell>
                    <TableCell className="px-0 py-2.5 text-right whitespace-nowrap last:pr-0">
                      {p.status === "recorded" && can(me, "payment.verify") && (
                        <Button variant="ghost" size="sm" onClick={() => dispatch(verifyPayment, { paymentId: p.id })}>
                          <BadgeCheck /> Verify
                        </Button>
                      )}
                      {p.status !== "reversed" && can(me, "payment.reverse") && (
                        <Button variant="ghost" size="sm" onClick={() => setReverse(p)}>
                          <Undo2 /> Reverse
                        </Button>
                      )}
                      <Button variant="ghost" size="icon-sm" asChild aria-label="Print receipt">
                        <Link href={`/print/receipt/${p.id}`} target="_blank">
                          <Printer />
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Share receipt on WhatsApp"
                        onClick={() =>
                          openWhatsApp(client?.phone, `Hello ${firstName(client?.contactPerson || client?.name || "")}, we ${out ? "have refunded" : "received"} ${format(p.amount)} for booking ${file.number}. ${out ? "Reference" : "Receipt"} ${p.number}. — Aeropath Travel`)
                        }
                      >
                        <MessageCircle />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Section>

      {refunds.length > 0 && (
        <Section title="Refunds and exchanges" count={refunds.length}>
          <ul className="divide-y divide-rule border-y border-rule">
            {refunds.map((r) => {
              const line = db.lines[r.lineId];
              return (
                <li key={r.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 text-sm">
                  <Code>{r.number}</Code>
                  <span className="min-w-0 flex-1 truncate text-ink-2">
                    {r.kind === "refund" ? "Refund" : "Exchange"} · {line?.description}
                  </span>
                  {r.kind === "refund" && <Amount value={r.quote.clientRefund} />}
                  {r.status === "requested" && r.kind === "refund" && refundNeedsManager(r.quote.clientRefund, db.settings) && <StatusChip status="limit.manager" size="xs" />}
                  <StatusChip status={`refund.${r.status}`} />
                  <Link href={`/payments?tab=refunds&open=${r.id}`} className="text-[13px] font-medium text-link hover:underline">
                    Open
                  </Link>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      <ConfirmDialog
        open={reverse !== null}
        onOpenChange={(o) => !o && setReverse(null)}
        title={`Reverse ${reverse?.number}?`}
        confirmLabel="Reverse payment"
        reason={{ label: "Reason", required: true, placeholder: "e.g. M-Pesa transaction was reversed by the bank" }}
        onConfirm={(reason) => (reverse ? dispatch(reversePayment, { paymentId: reverse.id, reason }).ok : false)}
      >
        {reverse && (
          <Consequences
            items={[
              <>
                <strong className="tnum text-ink">{format(reverse.amount)}</strong> comes off the {reverse.allocations.length > 1 ? `${reverse.allocations.length} bookings it paid` : "booking"}; the balance goes back up.
              </>,
              <>The receipt stays on record, struck through, with your reason.</>,
            ]}
          />
        )}
      </ConfirmDialog>
    </div>
  );
}
