"use client";

import { Clock, TimerOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { countdown } from "@/lib/format";
import { useMillisUntil } from "@/hooks/use-now";

/** Live hold expiry, announced politely for screen readers (WCAG 4.1.3). */
export function HoldCountdown({ expiresAt, className, label = "Held for" }: { expiresAt?: string; className?: string; label?: string }) {
  const left = useMillisUntil(expiresAt);

  if (!expiresAt || left === null) return null;
  const expired = left <= 0;
  const urgent = left > 0 && left < 3 * 60_000;

  return (
    <span
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] tabular-nums",
        // A hold with hours left is information, not an alarm — only paint a chip when it is close.
        expired || urgent
          ? "rounded-full bg-destructive/10 px-2.5 py-1 font-medium text-destructive"
          : "text-muted-foreground",
        className,
      )}
    >
      {expired ? <TimerOff className="size-3.5" aria-hidden /> : <Clock className="size-3.5" aria-hidden />}
      {expired ? "Hold expired" : `${label} ${countdown(left)}`}
    </span>
  );
}

/** SLA countdown for supplier confirmation; counts up once the deadline passes. */
export function SlaCountdown({ deadlineAt, className }: { deadlineAt?: string; className?: string }) {
  const left = useMillisUntil(deadlineAt);

  if (!deadlineAt || left === null) return null;
  const breached = left <= 0;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap text-[13px] tabular-nums",
        // Paint a chip only once the SLA is actually breached; until then it is just a time.
        breached ? "rounded-full bg-destructive/10 px-2.5 py-1 font-medium text-destructive" : "text-muted-foreground",
        className,
      )}
    >
      <Clock className="size-3.5" aria-hidden />
      {breached ? `SLA breached by ${countdown(-left)}` : `${countdown(left)} to SLA`}
    </span>
  );
}
