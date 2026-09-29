"use client";

import * as React from "react";
import Link from "next/link";
import { Clock, FileText } from "lucide-react";

import type { FlightLine } from "@/domain/types";
import { can } from "@/domain/permissions";
import { currentInvoice, isInvoiceOutdated } from "@/domain/selectors/core";
import { useApp, useMe } from "@/store";
import { fmtDate, fmtDateTime, fmtRelative } from "@/lib/dates";
import type { BookingRow } from "@/lib/view-models";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Amount } from "@/components/shared/amount";
import { StatusChip } from "@/components/shared/status-chip";
import { useIssueDocument } from "./header";

/** Money summary (spec §9.4 right rail): charges − received = balance, then margin and supplier owed. */
export function MoneyRail({ row, now }: { row: BookingRow; now: Date }) {
  const me = useMe();
  const db = useApp((s) => s.db)!;
  const issueDoc = useIssueDocument();
  const t = row.totals;
  const bal = t.balance.amountMinor;
  const inv = currentInvoice(db, row.id, "invoice");
  const outdated = inv ? isInvoiceOutdated(db, row.id, "invoice") : false;
  const ttl = (Object.values(db.lines).filter((l) => l.fileId === row.id && l.type === "flight" && l.status === "booked") as FlightLine[])
    .map((l) => l.details.ticketingTimeLimit)
    .filter(Boolean)
    .sort()[0];
  const ttlMs = ttl ? Date.parse(ttl) - now.getTime() : null;
  const finance = can(me, "report.view") || can(me, "line.edit");

  return (
    <aside className="space-y-4 lg:sticky lg:top-[68px]">
      <section className={cn("rounded-lg border bg-paper", row.overdue ? "border-[var(--st-red-bd)]" : "border-rule")} aria-label="Money">
        <div className={cn("border-b border-rule px-4 pt-3.5 pb-3", row.overdue && "hatch text-[var(--st-red-fg)]")}>
          <div className="col-head">{bal < 0 ? "Credit to client" : "Balance due"}</div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <Amount value={bal < 0 ? { ...t.balance, amountMinor: -bal } : t.balance} size="xl" className={cn(bal === 0 && "text-ink-3")} />
            {bal < 0 && <StatusChip status="pay.credit" />}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[13px] text-ink-3">
            {row.dueAt && bal > 0 && <span className={cn(row.overdue && "font-medium text-[var(--st-red-fg)]")}>Due {fmtDate(row.dueAt)}</span>}
            {row.overdue && <StatusChip status="pay.overdue" size="xs" />}
            {bal < 0 && <span>Refund the client or keep it as credit.</span>}
            {bal === 0 && t.charges.amountMinor > 0 && <span>Fully paid.</span>}
          </div>
        </div>
        <dl className="px-4 py-2 text-sm">
          <div className="flex justify-between py-1.5">
            <dt className="text-ink-3">Charges</dt>
            <dd>
              <Amount value={t.charges} />
            </dd>
          </div>
          <div className="flex justify-between py-1.5">
            <dt className="text-ink-3">Received</dt>
            <dd>
              <Amount value={{ ...t.received, amountMinor: -t.received.amountMinor }} className="text-ink-2" />
            </dd>
          </div>
          <div className="flex justify-between border-t-[3px] border-double border-rule-strong py-1.5 font-semibold">
            <dt>Balance</dt>
            <dd>
              <Amount value={t.balance} tone="balance" />
            </dd>
          </div>
          {finance && (
            <>
              <div className="mt-1 flex justify-between border-t border-rule pt-2.5 pb-1.5">
                <dt className="text-ink-3">Margin</dt>
                <dd>
                  <Amount value={t.margin} tone="auto" />
                </dd>
              </div>
              <div className="flex justify-between py-1.5">
                <dt className="text-ink-3">Supplier owed</dt>
                <dd>
                  <Amount value={t.supplierOwed} className="text-ink-2" />
                </dd>
              </div>
            </>
          )}
        </dl>
      </section>

      {ttl && ttlMs !== null && (
        <section className={cn("rounded-lg border px-4 py-3", ttlMs < 48 * 3_600_000 ? "border-[var(--st-red-bd)] bg-[var(--st-red-bg)] text-[var(--st-red-fg)]" : "border-[var(--st-amber-bd)] bg-[var(--st-amber-bg)] text-[var(--st-amber-fg)]")}>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Clock className="size-4" /> Ticketing time limit
          </div>
          <p className="mt-1 text-sm">
            {ttlMs > 0 ? (
              <>
                Issue by <strong>{fmtDateTime(ttl)}</strong> ({fmtRelative(ttl, now)}) or the airline may cancel the seats.
              </>
            ) : (
              <>The time limit passed {fmtRelative(ttl, now)}. Check the PNR in Amadeus.</>
            )}
          </p>
        </section>
      )}

      <section className="rounded-lg border border-rule px-4 py-3 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-2 font-medium text-ink">
            <FileText className="size-4 text-ink-3" /> Invoice
          </span>
          {inv ? <StatusChip status={outdated ? "doc.outdated" : "doc.issued"} size="xs" /> : <span className="text-[13px] text-ink-4">Not issued</span>}
        </div>
        {inv ? (
          <p className="mt-1 text-[13px] text-ink-3">
            <Link href={`/print/invoice/${inv.id}`} target="_blank" className="font-mono whitespace-nowrap text-ink hover:underline">
              {inv.number}
            </Link>{" "}
            · {fmtDate(inv.issuedAt)}
            {outdated && " · the booking changed since"}
          </p>
        ) : (
          <p className="mt-1 text-[13px] text-ink-3">Issue one when the client is ready to pay.</p>
        )}
        {can(me, "document.issue") && row.status !== "cancelled" && row.status !== "draft" && (!inv || outdated) && (
          <Button variant="outline" size="sm" className="mt-2.5 w-full" onClick={() => issueDoc(row.id, "invoice")}>
            {inv ? "Reissue invoice" : "Issue invoice"}
          </Button>
        )}
      </section>
    </aside>
  );
}
