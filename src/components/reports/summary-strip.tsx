import type { Money } from "@/domain/types";
import type { SummaryItem } from "@/domain/selectors/reports";
import { cn } from "@/lib/utils";
import { Amount } from "@/components/shared/amount";
import { TrendBadge } from "@/components/shared/trend";
import { Card } from "@/components/ui/card";

const isMoney = (v: SummaryItem["value"]): v is Money => typeof v === "object" && v !== null && "amountMinor" in v;

export { fmtTrend } from "@/components/shared/trend";

export function Trend({ value, invert, label = "vs previous period" }: { value?: number; invert?: boolean; label?: string }) {
  if (value === undefined || !Number.isFinite(value)) return <span className="text-xs text-ink-4">No earlier figure</span>;
  return <TrendBadge value={value} invert={invert} label={label} />;
}

/** The report's key figures as a row of stat cards, with the trend against the previous period where it is a KPI. */
export function SummaryStrip({ items, className }: { items: SummaryItem[]; className?: string }) {
  if (!items.length) return null;
  const cols = items.length >= 5 ? "lg:grid-cols-5" : items.length === 4 ? "lg:grid-cols-4" : items.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2";
  return (
    <dl className={cn("grid grid-cols-2 gap-3 sm:gap-4", cols, className)}>
      {items.map((it, i) => (
        <Card key={it.label} className={cn("block p-4 sm:p-5", items.length % 2 === 1 && i === items.length - 1 && "col-span-2 lg:col-span-1")}>
          <dt className="truncate text-[13px] font-medium text-ink-3 sm:text-sm">{it.label}</dt>
          <dd className="mt-2 text-lg leading-7 font-bold tracking-[-0.01em] text-ink sm:text-[22px]">
            {isMoney(it.value) ? <Amount value={it.value} codeClassName="text-[0.6em] font-semibold" /> : <span className="tnum">{typeof it.value === "number" ? it.value.toLocaleString("en-US") : it.value}</span>}
          </dd>
          {"trend" in it ? (
            <dd className="mt-1.5">
              <Trend value={it.trend} invert={it.invertTrend} />
            </dd>
          ) : it.hint ? (
            <dd className="tnum mt-1.5 text-[13px] text-ink-3">{it.hint}</dd>
          ) : null}
        </Card>
      ))}
    </dl>
  );
}
