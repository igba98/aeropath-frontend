import type { CreditUsage } from "@/domain/selectors/balances";
import type { ISODate } from "@/domain/types";
import { daysUntil } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Amount } from "@/components/shared/amount";
import { StatusChip } from "@/components/shared/status-chip";

/** Small neutral tag beside an organisation's name (type "corporate"). */
export function CorporateTag({ className }: { className?: string }) {
  return <span className={cn("shrink-0 rounded-[3px] border border-rule-2 px-1 text-[11px] leading-4 font-medium text-ink-3", className)}>Organisation</span>;
}

/**
 * Credit usage for a corporate: a thin rule with the used share filled, and the figures beside it.
 * Amber above 80 %, red above 100 % (Flow D).
 */
export function CreditUsageBar({ usage, termsDays, className }: { usage: CreditUsage; termsDays?: number; className?: string }) {
  const pct = usage.pct;
  const tone = pct > 100 ? "red" : pct > 80 ? "amber" : "ink";
  const fill = tone === "red" ? "bg-[var(--st-red-fg)]" : tone === "amber" ? "bg-[var(--st-amber-fg)]" : "bg-ink-2";
  if (!usage.limit) {
    return (
      <div className={cn("text-sm text-ink-3", className)}>
        No credit limit set. Outstanding <Amount value={usage.used} className="font-medium text-ink" />
        {termsDays !== undefined && ` · ${termsDays}-day terms`}
      </div>
    );
  }
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
        <span className="text-ink-2">
          <Amount value={usage.used} className="font-semibold text-ink" /> <span className="text-ink-3">of</span> <Amount value={usage.limit} className="text-ink-2" /> credit used
        </span>
        <span className="flex items-center gap-2">
          <span className="tnum font-semibold text-ink">{Math.round(pct)}%</span>
          {tone === "red" && <StatusChip status="pay.overdue" label="Over limit" size="xs" />}
          {tone === "amber" && <StatusChip label="Near limit" tone="amber" size="xs" />}
        </span>
      </div>
      <div
        role="meter"
        aria-label="Credit used"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, Math.round(pct))}
        className="relative h-[3px] w-full bg-rule"
      >
        <div className={cn("absolute inset-y-0 left-0", fill)} style={{ width: `${Math.min(100, pct)}%` }} />
        <div aria-hidden className="absolute -top-1 h-[11px] w-px bg-ink-4" style={{ left: "80%" }} />
      </div>
      <p className="text-xs text-ink-3">
        {pct > 100 ? "Over the limit: collect before booking more on credit." : pct > 80 ? "Close to the limit: chase open invoices." : termsDays !== undefined ? `${termsDays}-day payment terms` : "Within the limit"}
      </p>
    </div>
  );
}

/** Passport expiry flag: expired (red) or under six months (amber). Nothing when fine. */
export function PassportChip({ expiry, now }: { expiry?: ISODate; now: Date }) {
  if (!expiry) return null;
  const d = daysUntil(expiry, now);
  if (d < 0) return <StatusChip label="Expired" tone="red" size="xs" />;
  if (d < 183) return <StatusChip label={`${d} d left`} tone="amber" size="xs" title="Many countries need six months of validity" />;
  return null;
}
