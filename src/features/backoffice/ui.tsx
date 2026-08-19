"use client";

import type { LucideIcon } from "lucide-react";
import { Info, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

/** Card section used across the content, finance and administration consoles. */
export function Section({ title, description, actions, children, className }: {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("overflow-hidden rounded-xl border bg-card", className)}>
      {title || actions ? (
        <div className="flex flex-wrap items-start justify-between gap-2 border-b border-brand-100 bg-brand-50/60 px-4 py-3">
          <div className="min-w-0">
            {title ? <h2 className="font-display text-lg text-brand-text-strong">{title}</h2> : null}
            {description ? <p className="mt-0.5 max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      <div className="p-4">{children}</div>
    </section>
  );
}

export interface BarRow {
  key: string;
  label: string;
  value: number;
  /** rendered on the right of the bar — usually a <MoneyText> */
  display: React.ReactNode;
  hint?: string;
  tone?: "brand" | "success" | "warning" | "danger" | "neutral";
}

const BAR_TONE: Record<NonNullable<BarRow["tone"]>, string> = {
  brand: "bg-brand-500",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-destructive",
  neutral: "bg-muted-foreground/50",
};

/** Horizontal CSS bar chart — no chart library anywhere in this prototype. */
export function BarChart({ rows, max, className, emptyLabel = "Nothing to chart yet" }: { rows: BarRow[]; max?: number; className?: string; emptyLabel?: string }) {
  const peak = max ?? Math.max(1, ...rows.map((r) => Math.abs(r.value)));
  if (!rows.length) return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  return (
    <ul className={cn("space-y-2.5", className)}>
      {rows.map((r) => (
        <li key={r.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0 truncate">{r.label}</span>
            <span className="shrink-0 tabular-nums">{r.display}</span>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <div className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className={cn("h-full rounded-full transition-[width]", BAR_TONE[r.tone ?? "brand"])}
                style={{ width: `${Math.max(2, Math.round((Math.abs(r.value) / peak) * 100))}%` }}
              />
            </div>
            {r.hint ? <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{r.hint}</span> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

export interface ColumnPoint {
  key: string;
  label: string;
  value: number;
  display?: string;
}

/** Vertical CSS column chart used for the daily cash / bookings trend. */
export function ColumnChart({ points, className, tone = "brand" }: { points: ColumnPoint[]; className?: string; tone?: NonNullable<BarRow["tone"]> }) {
  const peak = Math.max(1, ...points.map((p) => p.value));
  return (
    <div className={cn("flex h-36 items-end gap-1", className)} role="img" aria-label={`Trend: ${points.map((p) => `${p.label} ${p.display ?? p.value}`).join(", ")}`}>
      {points.map((p) => (
        <div key={p.key} className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
          <span className="pointer-events-none text-[10px] tabular-nums text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">{p.display ?? p.value}</span>
          <div
            className={cn("w-full rounded-t", BAR_TONE[tone])}
            style={{ height: `${Math.max(2, Math.round((p.value / peak) * 100))}%` }}
            title={`${p.label}: ${p.display ?? p.value}`}
          />
          <span className="w-full truncate text-center text-[10px] text-muted-foreground">{p.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Budget / utilisation burn-down bar. */
export function ProgressBar({ used, total, tone, label }: { used: number; total: number; tone?: NonNullable<BarRow["tone"]>; label?: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;
  const auto: NonNullable<BarRow["tone"]> = pct >= 90 ? "danger" : pct >= 70 ? "warning" : "success";
  return (
    <div className="min-w-[120px]">
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", BAR_TONE[tone ?? auto])} style={{ width: `${Math.max(pct === 0 ? 0 : 2, pct)}%` }} />
      </div>
      <p className="mt-1 text-[11px] tabular-nums text-muted-foreground">{label ?? `${pct}% used`}</p>
    </div>
  );
}

/** Explanatory note — these consoles have to teach the mechanism, not just show rows. */
export function Note({ title, children, icon: Icon = Info, tone = "info" }: { title?: string; children: React.ReactNode; icon?: LucideIcon; tone?: "info" | "warning" | "danger" | "neutral" }) {
  return (
    <div
      className={cn(
        "flex gap-3 rounded-xl border p-4 text-sm leading-relaxed",
        tone === "info" && "border-brand-200 bg-brand-50 text-brand-text-strong",
        tone === "warning" && "border-warning/40 bg-warning/5 text-warning-foreground",
        tone === "danger" && "border-destructive/40 bg-destructive/5 text-destructive",
        tone === "neutral" && "bg-muted/40 text-muted-foreground",
      )}
    >
      <Icon className="mt-0.5 size-[18px] shrink-0" aria-hidden />
      <div className="min-w-0">
        {title ? <p className="font-semibold">{title}</p> : null}
        <div className={cn(title && "mt-0.5")}>{children}</div>
      </div>
    </div>
  );
}

/** Shown instead of a screen when the signed in role cannot see it. Always says why. */
export function AccessDenied({ what, needs }: { what: string; needs: string }) {
  return (
    <div className="mx-auto max-w-md rounded-xl border bg-card p-6 text-center">
      <Lock className="mx-auto size-8 text-muted-foreground" aria-hidden />
      <h2 className="mt-3 font-display text-xl">{what} is restricted</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">{needs}</p>
    </div>
  );
}

/** Labelled form field for the many small editors in these consoles. */
export function Field({ label, htmlFor, hint, children, className }: { label: string; htmlFor?: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/** Compact definition row. */
export function KeyValue({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-[15px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

/** Download a generated CSV from the browser. Used by ledger, revenue and tax exports. */
export function downloadCsv(filename: string, rows: string[][]) {
  const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const csv = rows.map((r) => r.map(escape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return csv.length;
}
