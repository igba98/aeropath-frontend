"use client";

import { MoneyText } from "@/components/shared/money-text";
import { cn } from "@/lib/utils";

export interface BarRow {
  label: string;
  value: number;
  /** secondary caption under the label */
  hint?: string;
}

/**
 * Deliberately dependency-free bar chart: divs with a percentage width.
 * Values are always restated as text so the chart never carries meaning by length alone.
 */
export function BarChart({ rows, format = "money", title, emptyLabel = "Nothing to chart yet", className, tone = "brand" }: {
  rows: BarRow[];
  format?: "money" | "count";
  title?: string;
  emptyLabel?: string;
  className?: string;
  tone?: "brand" | "success" | "warning";
}) {
  const max = rows.reduce((m, r) => Math.max(m, r.value), 0);
  return (
    <div className={cn("rounded-xl border bg-card p-4", className)}>
      {title ? <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p> : null}
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>
      ) : (
        <ul className={cn("space-y-3", title && "mt-3")}>
          {rows.map((r) => (
            <li key={r.label}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 truncate text-sm">{r.label}</span>
                {format === "money" ? (
                  <MoneyText minor={r.value} size="sm" showCurrency={false} />
                ) : (
                  <span className="text-sm font-semibold tabular-nums">{r.value.toLocaleString("en-GB")}</span>
                )}
              </div>
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full rounded-full", tone === "brand" && "bg-brand-500", tone === "success" && "bg-success", tone === "warning" && "bg-warning")}
                  style={{ width: `${max > 0 ? Math.max(2, Math.round((r.value / max) * 100)) : 0}%` }}
                />
              </div>
              {r.hint ? <p className="mt-0.5 text-[11px] text-muted-foreground">{r.hint}</p> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Single utilisation / usage bar with a tone that turns as it fills. */
export function UsageBar({ usedPct, className, label }: { usedPct: number; className?: string; label?: string }) {
  const clamped = Math.max(0, Math.min(100, Math.round(usedPct)));
  const tone = clamped > 100 - 0.01 ? "bg-destructive" : clamped > 80 ? "bg-destructive" : clamped > 60 ? "bg-warning" : "bg-success";
  return (
    <div className={className}>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label={label ?? `${clamped}% used`}>
        <div className={cn("h-full rounded-full transition-[width]", tone)} style={{ width: `${clamped}%` }} />
      </div>
    </div>
  );
}
