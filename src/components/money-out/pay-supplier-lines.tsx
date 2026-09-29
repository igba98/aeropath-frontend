"use client";

import * as React from "react";

import type { ID } from "@/domain/types";
import type { SupplierOpenItem } from "@/domain/selectors/balances";
import { fmtDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Amount } from "@/components/shared/amount";
import { MoneyInput } from "@/components/shared/money-input";

/** Allocation grid inside Pay supplier: tick, amount per line (line currency), remaining after. */
export function AllocationTable({
  items,
  alloc,
  setAlloc,
}: {
  items: SupplierOpenItem[];
  alloc: Record<ID, number | null>;
  setAlloc: React.Dispatch<React.SetStateAction<Record<ID, number | null>>>;
}) {
  if (!items.length) {
    return <p className="border-y border-rule py-6 text-center text-sm text-ink-3">Nothing is owed to this supplier right now.</p>;
  }
  return (
    <Table className="min-w-[600px]">
      <TableHeader>
        <TableRow className="rule-head border-0">
          <TableHead className="h-auto w-7 px-0 pb-1.5 first:pl-0" />
          <TableHead className="h-auto px-0 pb-1.5 whitespace-normal">Booking · line</TableHead>
          <TableHead className="h-auto px-0 pb-1.5 text-right">Days</TableHead>
          <TableHead className="h-auto px-0 pb-1.5 text-right">Remaining</TableHead>
          <TableHead className="h-auto w-40 pr-0 pb-1.5 pl-3 text-right">Pay</TableHead>
          <TableHead className="h-auto pr-0 pb-1.5 pl-3 text-right last:pr-0">After</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((i) => {
          const a = alloc[i.line.id] ?? null;
          const on = (a ?? 0) > 0;
          const after = { amountMinor: i.remaining.amountMinor - (a ?? 0), currency: i.remaining.currency };
          const over = after.amountMinor < 0;
          return (
            <TableRow key={i.line.id} className={cn(on && "bg-band")}>
              <TableCell className="py-2 pr-0 pl-1 first:pl-1">
                <Checkbox
                  checked={on}
                  aria-label={`Pay ${i.line.description}`}
                  onCheckedChange={(v) => setAlloc((x) => ({ ...x, [i.line.id]: v === true ? i.remaining.amountMinor : null }))}
                />
              </TableCell>
              <TableCell className="max-w-[260px] px-0 py-2">
                <span className="block font-mono whitespace-nowrap text-[13px] font-semibold text-ink">{i.file.number}</span>
                <span className="block truncate text-[13px] text-ink-3">
                  {i.line.description}
                  {i.serviceDate ? ` · ${fmtDate(i.serviceDate)}` : ""}
                </span>
              </TableCell>
              <TableCell className={cn("tnum px-0 py-2 text-right", i.overdue ? "font-medium text-[var(--st-red-fg)]" : "text-ink-2")}>{i.daysOutstanding}</TableCell>
              <TableCell className="px-0 py-2 text-right">
                <Amount value={i.remaining} />
              </TableCell>
              <TableCell className="py-2 pr-0 pl-3">
                <MoneyInput value={a} onChange={(v) => setAlloc((x) => ({ ...x, [i.line.id]: v }))} currency={i.remaining.currency} aria-label={`Amount for ${i.line.description}`} invalid={over} className="h-7" />
              </TableCell>
              <TableCell className="py-2 pr-0 pl-3 text-right last:pr-0">
                <Amount value={after} tone="auto" className={cn(!on && "text-ink-4")} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
