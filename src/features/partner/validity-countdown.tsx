"use client";

import { Clock, TimerOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { countdown } from "@/lib/format";
import { useMillisUntil } from "@/hooks/use-now";

/** Quote validity, ticking. Mirrors HoldCountdown but speaks in quote language. */
export function ValidityCountdown({ validUntil, className, size = "md" }: { validUntil: string; className?: string; size?: "sm" | "md" }) {
  const left = useMillisUntil(validUntil);
  if (left === null) return null;

  const expired = left <= 0;
  const urgent = !expired && left < 6 * 3_600_000;
  return (
    <span
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium tabular-nums",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        expired ? "border-destructive/30 bg-destructive/10 text-destructive" : urgent ? "border-warning/40 bg-warning/12 text-warning-foreground" : "border-success/30 bg-success/12 text-success-foreground",
        className,
      )}
    >
      {expired ? <TimerOff className="size-3.5" aria-hidden /> : <Clock className="size-3.5" aria-hidden />}
      {expired ? "Expired" : `Valid ${countdown(left)}`}
    </span>
  );
}
