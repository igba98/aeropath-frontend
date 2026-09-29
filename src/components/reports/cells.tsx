"use client";

import * as React from "react";
import Link from "next/link";

import type { Money } from "@/domain/types";
import { cn } from "@/lib/utils";
import type { Column } from "@/components/shared/data-table";
import { TotalsRow } from "@/components/shared/data-table";
import { Amount } from "@/components/shared/amount";

/** CSV value for money: major units as a number (the currency goes in the header or a sibling column). */
export const csvMajor = (m: Money | undefined | null): number | "" => (m ? m.amountMinor / 100 : "");
/** CSV value with the code, for columns in mixed currencies. */
export const csvCode = (m: Money | undefined | null): string => (m ? `${m.currency} ${(m.amountMinor / 100).toFixed(2)}` : "");

/** A right-aligned money column (sortable, exported). `rate` normalises mixed currencies for sorting. */
export function moneyCol<T>(
  key: string,
  header: string,
  get: (r: T) => Money | undefined,
  opts: { hideBelow?: Column<T>["hideBelow"]; tone?: "plain" | "auto" | "balance" | "muted"; rate?: number; mixed?: boolean; muteZero?: boolean } = {},
): Column<T> {
  const norm = (m?: Money) => (m ? (m.currency === "USD" && opts.rate ? m.amountMinor * opts.rate : m.amountMinor) : null);
  return {
    key,
    header,
    align: "right",
    hideBelow: opts.hideBelow,
    sort: (r) => norm(get(r)),
    csv: (r) => (opts.mixed ? csvCode(get(r)) : csvMajor(get(r))),
    csvHeader: header,
    cell: (r) => {
      const m = get(r);
      return <Amount value={m} tone={opts.tone} className={cn(opts.muteZero !== false && m?.amountMinor === 0 && "text-ink-4")} />;
    },
  };
}

/** A right-aligned count column. */
export function countCol<T>(key: string, header: string, get: (r: T) => number, hideBelow?: Column<T>["hideBelow"]): Column<T> {
  return { key, header, align: "right", hideBelow, sort: get, csv: get, cell: (r) => <span className={cn("tnum", !get(r) && "text-ink-4")}>{get(r).toLocaleString("en-US")}</span> };
}

/** File number in mono, linking to the booking. */
export function FileNo({ id, number, className }: { id: string; number: string; className?: string }) {
  return (
    <Link href={`/bookings/${id}`} className={cn("font-mono whitespace-nowrap text-[13.5px] font-semibold text-ink hover:text-link hover:underline", className)}>
      {number}
    </Link>
  );
}

/** Mono machine code (ticket, receipt, PNR). */
export function Mono({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cn("font-mono whitespace-nowrap text-[13.5px] text-ink", className)}>{children}</span>;
}

const HIDE = { sm: "hidden sm:table-cell", md: "hidden md:table-cell", lg: "hidden lg:table-cell", xl: "hidden xl:table-cell", "2xl": "hidden 2xl:table-cell" } as const;

/** A double-ruled totals footer aligned to `columns` (hidden columns stay hidden). First visible cell carries the label. */
export function Totals<T>({ columns, values, label = "Total" }: { columns: Column<T>[]; values: Record<string, React.ReactNode>; label?: string }) {
  return (
    <TotalsRow
      cells={columns.map((c, i) => ({
        content: i === 0 ? label : values[c.key],
        align: c.align === "right" ? "right" : "left",
        className: c.hideBelow ? HIDE[c.hideBelow] : undefined,
      }))}
    />
  );
}

/** Percent from a fraction: 0.124 → "12.4 %". */
export const pct = (f: number | null | undefined) => (f === null || f === undefined || !Number.isFinite(f) ? "—" : `${(f * 100).toFixed(1)} %`);
