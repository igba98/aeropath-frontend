"use client";

import { cn } from "@/lib/utils";
import type { TimelineEvent } from "@/lib/domain/types";
import { formatDateTime } from "@/lib/format";

/** One timeline component; the same events with visibility filtered by role (tech spec §31.1). */
export function BookingTimeline({ events, audience, className }: { events: TimelineEvent[]; audience: "customer" | "supplier" | "internal"; className?: string }) {
  const visible = events.filter((e) => e.visibility.includes(audience)).sort((a, b) => b.at.localeCompare(a.at));
  if (!visible.length) return <p className="text-sm text-muted-foreground">No activity recorded yet.</p>;
  return (
    <ol className={cn("relative space-y-4 border-l pl-5", className)}>
      {visible.map((e) => (
        <li key={e.id} className="relative">
          <span className="absolute -left-[25px] top-1.5 size-2.5 rounded-full border-2 border-background bg-brand-400" aria-hidden />
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
            <p className="text-sm font-medium">{e.event}</p>
            <time className="font-mono text-[11px] text-muted-foreground" dateTime={e.at}>{formatDateTime(e.at)}</time>
          </div>
          <p className="text-xs text-muted-foreground">
            {e.actorName}
            {e.from && e.to ? <span className="ml-1.5 font-mono text-[11px]">{e.from} → {e.to}</span> : null}
          </p>
          {e.note ? <p className="mt-1 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">{e.note}</p> : null}
        </li>
      ))}
    </ol>
  );
}
