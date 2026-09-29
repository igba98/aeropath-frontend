"use client";

import * as React from "react";

import type { Currency, DbState, ExpenseCategory, Money } from "@/domain/types";
import { convert } from "@/domain/money";
import { darToday } from "@/domain/dates";
import { shiftMonth } from "@/domain/selectors/reports/common";
import { EXPENSE_CATEGORIES } from "@/store/seed/reference";
import { cn } from "@/lib/utils";

import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Amount } from "@/components/shared/amount";

const monthLabel = (ym: string) => new Date(`${ym}-15T12:00:00Z`).toLocaleString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

/** The last `n` month keys ("2026-07", "2026-08", "2026-09"), oldest first. */
export function lastMonths(now: Date, n = 3): string[] {
  const first = `${darToday(now).slice(0, 7)}-01`;
  return Array.from({ length: n }, (_, i) => shiftMonth(first, i - (n - 1)).slice(0, 7));
}

/**
 * Monthly total per category (spec §9.9): category × last 3 months, in the display currency.
 * Click a category to filter the list below.
 */
export function ExpenseMonths({
  db,
  now,
  currency,
  onPick,
  activeCategory,
}: {
  db: DbState;
  now: Date;
  currency: Currency;
  onPick?: (p: { category: ExpenseCategory }) => void;
  activeCategory?: string;
}) {
  const rate = db.settings.fx.USD_TZS;
  const monthKey = lastMonths(now).join(",");
  const months = React.useMemo(() => monthKey.split(","), [monthKey]);
  const { grid, colTotals, cats, mixed } = React.useMemo(() => {
    const g = new Map<ExpenseCategory, number[]>();
    const col = months.map(() => 0);
    let mix = false;
    for (const e of Object.values(db.expenses)) {
      if (e.deletedAt) continue;
      const mi = months.indexOf(e.paidAt.slice(0, 7));
      if (mi < 0) continue;
      if (e.amount.currency !== currency) mix = true;
      const v = convert(e.amount, currency, rate).amountMinor;
      const row = g.get(e.category) ?? months.map(() => 0);
      row[mi] += v;
      g.set(e.category, row);
      col[mi] += v;
    }
    const order = EXPENSE_CATEGORIES.map((c) => c.value).filter((c) => g.has(c));
    return { grid: g, colTotals: col, cats: order, mixed: mix };
  }, [db.expenses, months, currency, rate]);

  const m = (n: number): Money => ({ amountMinor: n, currency });
  const label = (c: ExpenseCategory) => EXPENSE_CATEGORIES.find((x) => x.value === c)?.label ?? c;

  if (!cats.length) {
    return <p className="border-y border-rule py-4 text-sm text-ink-3">No expenses in {monthLabel(months[0])} – {monthLabel(months[months.length - 1])}.</p>;
  }

  return (
    <div>
      <Table className="min-w-[460px]">
        <TableHeader>
          <TableRow className="rule-head border-0">
            <TableHead className="h-auto px-0 pb-2 first:pl-0">Category</TableHead>
            {months.map((ym, i) => (
              <TableHead key={ym} className="h-auto px-0 pb-2 text-right whitespace-normal last:pr-0">
                {monthLabel(ym)}
                {i === months.length - 1 && <span className="font-normal normal-case"> · to date</span>}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {cats.map((c) => {
            const row = grid.get(c)!;
            return (
              <TableRow key={c} className={cn(activeCategory === c && "bg-band")}>
                <TableCell className="h-8 px-0 py-1 first:pl-0">
                  {onPick ? (
                    <button type="button" onClick={() => onPick({ category: c })} className="text-left text-ink hover:underline">
                      {label(c)}
                    </button>
                  ) : (
                    label(c)
                  )}
                </TableCell>
                {row.map((v, i) => (
                  <TableCell key={i} className="tnum px-0 py-1 text-right last:pr-0">
                    {v ? <Amount value={m(v)} hideCode /> : <span className="text-ink-4">—</span>}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
        </TableBody>
        <TableFooter className="bg-transparent font-normal">
          <TableRow className="border-b-0 border-t-[1.5px] border-rule-strong">
            <TableCell className="h-9 px-0 font-semibold first:pl-0">Total</TableCell>
            {colTotals.map((v, i) => (
              <TableCell key={i} className="tnum px-0 text-right font-semibold last:pr-0">
                <Amount value={m(v)} />
              </TableCell>
            ))}
          </TableRow>
        </TableFooter>
      </Table>
      <p className="mt-2 text-[13px] text-ink-3">
        Amounts in {currency}
        {mixed ? `, converted at 1 USD = TZS ${rate.toLocaleString("en-US")}` : ""}. Deleted expenses are left out.
      </p>
    </div>
  );
}
