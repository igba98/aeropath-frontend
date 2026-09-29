import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

/** "+12.5%" / "−4%" / "0%": one decimal under 100%, whole numbers from 100% up. */
export function fmtTrend(t: number): string {
  const pct = t * 100;
  const abs = Math.abs(pct);
  const shown = abs >= 100 ? Math.round(abs).toLocaleString("en-US") : (Math.round(abs * 10) / 10).toLocaleString("en-US", { maximumFractionDigits: 1 });
  if (shown === "0") return "0%";
  return `${pct > 0 ? "+" : "−"}${shown}%`;
}

/**
 * Change against the previous period as a small badge.
 * Green when the move is good, red when it is bad; `invert` for figures where up is bad (what we owe),
 * `neutral` for figures that are neither (what clients owe us).
 */
export function TrendBadge({
  value,
  invert,
  neutral,
  label = "vs previous period",
  className,
}: {
  /** Fractional change: 0.12 = +12%. */
  value: number;
  invert?: boolean;
  neutral?: boolean;
  label?: string;
  className?: string;
}) {
  const flat = Math.abs(value) <= 0.0005;
  const Icon = flat ? Minus : value > 0 ? ArrowUpRight : ArrowDownRight;
  const good = invert ? value < 0 : value > 0;
  const tone = flat || neutral ? "grey" : good ? "green" : "red";
  return (
    <Badge variant={tone} title={label} className={cn("h-6 gap-1 px-2 text-xs font-semibold [&>svg]:size-3.5", className)}>
      <Icon aria-hidden />
      <span className="tnum">{fmtTrend(value)}</span>
      <span className="sr-only"> {label}</span>
    </Badge>
  );
}
