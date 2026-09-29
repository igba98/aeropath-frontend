"use client";

import * as React from "react";
import Link from "next/link";
import { Banknote, Building2, Smartphone, Wallet } from "lucide-react";

import type { Currency, Money } from "@/domain/types";
import type { CashPosition, AgingTotals } from "@/domain/selectors/balances";
import { PAYMENT_METHODS } from "@/store/seed/reference";
import { fmtWeekday } from "@/lib/dates";
import { PAY_KEY, type BookingRow } from "@/lib/view-models";
import { cn } from "@/lib/utils";

import { Amount } from "@/components/shared/amount";
import { Route, UserMark } from "@/components/shared/bits";
import { StatusChip } from "@/components/shared/status-chip";

/** Departures in the next days: date and time lead, then route, client and what is still owed. */
export function DepartingList({ rows }: { rows: BookingRow[] }) {
  if (!rows.length) return <p className="rounded-lg bg-canvas px-4 py-6 text-center text-sm text-ink-3">No departures in the next 7 days.</p>;
  return (
    <ul className="-mx-5 -mb-5 divide-y divide-rule border-t border-rule">
      {rows.map((r) => {
        const soon = r.daysToStart !== undefined && r.daysToStart <= 1;
        return (
          <li key={r.id}>
            <Link href={`/bookings/${r.id}`} className="flex items-start gap-4 px-5 py-3.5 transition-colors hover:bg-band-hover">
              <span className={cn("w-14 shrink-0 rounded-lg border px-1 py-1.5 text-center leading-tight", soon ? "border-[var(--st-amber-bd)] bg-[var(--st-amber-bg)] text-[var(--st-amber-fg)]" : "border-rule bg-canvas text-ink")}>
                <span className="block text-xs font-semibold opacity-80">{r.daysToStart === 0 ? "Today" : r.daysToStart === 1 ? "Tmrw" : fmtWeekday(r.start).split(" ")[0]}</span>
                <span className="tnum block text-lg font-bold">{r.start ? Number(r.start.slice(8, 10)) : "—"}</span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block">{r.route.length ? <Route codes={r.route} size="sm" /> : <span className="text-sm font-semibold text-ink">{r.title}</span>}</span>
                <span className="mt-0.5 block truncate text-[13px] text-ink-3">
                  {r.firstFlight ? `${r.firstFlight.at.slice(11, 16)} · ${r.firstFlight.flight} · ` : ""}
                  {r.client?.name}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <Amount value={r.totals.balance} className={cn("text-sm font-semibold", r.totals.balance.amountMinor === 0 && "text-ink-4")} />
                <span className="mt-1 flex justify-end">
                  {r.pay !== "none" ? <StatusChip status={r.overdue ? "pay.overdue" : PAY_KEY[r.pay]} size="xs" /> : <UserMark user={r.owner} size="xs" />}
                </span>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

const ACCOUNT_ICON = { cash: Banknote, bank: Building2, mobile_money: Smartphone, card: Wallet } as const;

/** Cash position per money account (from the ledger plus opening balances). */
export function CashTable({ positions, displayCurrency, rate }: { positions: CashPosition[]; displayCurrency: Currency; rate: number }) {
  const total = positions.reduce((s, p) => s + (p.balance.currency === displayCurrency ? p.balance.amountMinor : p.balance.currency === "USD" ? Math.round(p.balance.amountMinor * rate) : Math.round(p.balance.amountMinor / rate)), 0);
  return (
    <div>
      <ul className="-mx-5 divide-y divide-rule border-t border-rule">
        {positions.map((p) => {
          const I = ACCOUNT_ICON[p.account.kind] ?? Wallet;
          return (
            <li key={p.account.id} className="flex items-center gap-3 px-5 py-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-canvas-2 text-ink-2">
                <I className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink">{p.account.name}</span>
                <span className="block text-[13px] text-ink-3 capitalize">{p.account.kind.replace("_", " ")}</span>
              </span>
              <Amount value={p.balance} tone="auto" className="text-[15px] font-semibold" />
            </li>
          );
        })}
      </ul>
      <div className="-mx-5 -mb-5 flex items-baseline justify-between gap-3 border-t border-rule bg-table-head px-5 py-3.5">
        <span className="text-sm font-semibold text-ink">
          Total <span className="font-normal text-ink-3">at 1 USD = TZS {rate.toLocaleString("en-US")}</span>
        </span>
        <Amount value={{ amountMinor: total, currency: displayCurrency }} className="text-base font-bold" />
      </div>
    </div>
  );
}

export function AgingBar({ totals, href, label }: { totals: AgingTotals; href: string; label: string }) {
  const b = totals.buckets;
  const parts = [
    { k: "Not due", v: b.notDue.amountMinor, c: "bg-brand-300" },
    { k: "0–30", v: b.d0_30.amountMinor, c: "bg-[#f2c26b]" },
    { k: "31–60", v: b.d31_60.amountMinor, c: "bg-[#e79a3b]" },
    { k: "61–90", v: b.d61_90.amountMinor, c: "bg-[#dc6a4a]" },
    { k: "90+", v: b.d90plus.amountMinor, c: "bg-[var(--st-red-fg)]" },
  ];
  const sum = parts.reduce((s, p) => s + Math.max(0, p.v), 0) || 1;
  return (
    <Link href={href} className="block rounded-lg border border-rule p-4 transition-colors hover:border-rule-2 hover:bg-band-hover">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm font-semibold text-ink">{label}</span>
        <Amount value={totals.total} className="text-lg font-bold" />
      </div>
      <div className="mt-3 flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-canvas-2" role="img" aria-label={`${label} by age`}>
        {parts.map((p) => (p.v > 0 ? <span key={p.k} className={cn("rounded-full", p.c)} style={{ width: `${(p.v / sum) * 100}%` }} /> : null))}
      </div>
      <div className="mt-3 grid grid-cols-5 gap-2 text-xs">
        {parts.map((p) => (
          <span key={p.k} className="min-w-0">
            <span className="flex items-center gap-1.5 text-ink-3">
              <span className={cn("size-2 shrink-0 rounded-full", p.c)} />
              {p.k}
            </span>
            <span className="tnum mt-0.5 block truncate font-semibold text-ink">{(p.v / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}</span>
          </span>
        ))}
      </div>
    </Link>
  );
}

export function ReceiptsToday({ rows }: { rows: { method: string; count: number; amount: Money }[] }) {
  if (!rows.length) return <p className="rounded-lg bg-canvas px-4 py-6 text-center text-sm text-ink-3">No receipts yet today.</p>;
  return (
    <ul className="-mx-5 -mb-5 divide-y divide-rule border-t border-rule">
      {rows.map((r) => (
        <li key={r.method} className="flex items-center justify-between gap-3 px-5 py-3">
          <span className="text-sm font-medium text-ink">
            {PAYMENT_METHODS.find((m) => m.value === r.method)?.label ?? r.method}
            <span className="ml-2 text-[13px] font-normal text-ink-3">
              {r.count} receipt{r.count === 1 ? "" : "s"}
            </span>
          </span>
          <Amount value={r.amount} className="text-[15px] font-semibold" />
        </li>
      ))}
    </ul>
  );
}
