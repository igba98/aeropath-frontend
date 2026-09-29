import * as React from "react";
import { cn } from "@/lib/utils";
import { TrendBadge } from "@/components/shared/trend";

export interface StripItem {
  label: React.ReactNode;
  value: React.ReactNode;
  /** One quiet line under the value: a count, a trend vs last period, a note. */
  sub?: React.ReactNode;
  key?: string;
}

/**
 * Summary card: label/value pairs in one card, split by hairlines.
 * Two columns on phones, three from sm, one row from xl (from sm when there are four or fewer).
 * `flush` drops the card chrome for use inside a card that already has it.
 */
export function Strip({ items, className, flush }: { items: StripItem[]; className?: string; flush?: boolean }) {
  const wide = items.length > 4;
  const cols = wide ? (items.length === 6 ? "sm:grid-cols-3 xl:grid-cols-6" : "sm:grid-cols-3 xl:grid-cols-5") : items.length === 4 ? "sm:grid-cols-4" : items.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2";
  return (
    <dl className={cn("grid grid-cols-2 gap-px overflow-hidden bg-rule", cols, flush ? "border-t border-rule" : "rounded-xl border border-rule shadow-card", className)}>
      {items.map((it, i) => (
        <div key={it.key ?? i} className="min-w-0 bg-card p-4 max-sm:odd:last:col-span-2 sm:p-5">
          <dt className="truncate text-[13px] font-medium text-ink-3 sm:text-sm">{it.label}</dt>
          <dd className="tnum mt-1.5 text-lg leading-7 font-bold tracking-[-0.01em] text-ink [&_[data-slot=amount-code]]:text-[0.62em] [&_[data-slot=amount-code]]:font-semibold">{it.value}</dd>
          {it.sub && <dd className="mt-1 text-[13px] leading-5 text-ink-3">{it.sub}</dd>}
        </div>
      ))}
    </dl>
  );
}

/** Change vs the previous period as the shared trend badge ("+12%" vs Aug). Neutral grey: volume, not good or bad. */
export function Trend({ current, previous, label }: { current: number; previous: number; label: string }) {
  if (previous === 0 && current === 0) return <span>None in {label} either</span>;
  if (previous === 0) return <span>None in {label}</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <TrendBadge value={(current - previous) / Math.abs(previous)} neutral label={`vs ${label}`} className="h-5" />
      vs {label}
    </span>
  );
}
