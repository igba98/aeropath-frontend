"use client";

import { cn } from "@/lib/utils";

/**
 * The ticket shape used across the flight surfaces.
 *
 * The notches and the dashed tear line are drawn with CSS rather than images so they stay crisp
 * at any width and cost nothing to download. `notch` puts the punch-outs where the stub divides.
 */
export function Ticket({
  children,
  className,
  interactive,
  selected,
}: {
  children: React.ReactNode;
  className?: string;
  interactive?: boolean;
  selected?: boolean;
}) {
  return (
    <article
      className={cn(
        "relative rounded-2xl bg-card shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,38,96,0.18)] transition-shadow",
        interactive && "hover:shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_-12px_rgba(0,38,96,0.28)]",
        selected && "ring-2 ring-brand-500",
        className,
      )}
    >
      {children}
    </article>
  );
}

/**
 * The tear line, with a notch bitten out of each side. `top` is the distance from the top of the
 * ticket so the stub can sit wherever the content needs it.
 */
export function TicketPerforation({ className }: { className?: string }) {
  return (
    <div className={cn("relative", className)} aria-hidden>
      <span className="absolute -left-2 top-1/2 size-4 -translate-y-1/2 rounded-full bg-neutral-25" />
      <span className="absolute -right-2 top-1/2 size-4 -translate-y-1/2 rounded-full bg-neutral-25" />
      <div className="mx-5 border-t border-dashed border-border" />
    </div>
  );
}

/** The flight-path graphic: two times with a dashed line and a plane between them. */
export function FlightPath({
  departTime,
  arriveTime,
  from,
  to,
  fromCity,
  toCity,
  duration,
  stops,
  size = "md",
}: {
  departTime: string;
  arriveTime: string;
  from: string;
  to: string;
  fromCity?: string;
  toCity?: string;
  duration: string;
  stops?: number;
  size?: "sm" | "md";
}) {
  const code = size === "sm" ? "text-2xl" : "text-[40px]";
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground tabular-nums">{departTime}</p>
        <p className={cn("font-display font-semibold leading-none tracking-tight", code)}>{from}</p>
        {fromCity ? <p className="mt-1.5 truncate text-sm text-muted-foreground">{fromCity}</p> : null}
      </div>

      <div className="flex min-w-0 flex-1 flex-col items-center pt-5">
        <div className="flex w-full items-center gap-1.5" aria-hidden>
          <span className="h-px flex-1 border-t border-dashed border-brand-300" />
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-50">
            <PlaneMark />
          </span>
          <span className="h-px flex-1 border-t border-dashed border-brand-300" />
        </div>
        <p className="mt-1.5 whitespace-nowrap text-sm tabular-nums">{duration}</p>
        {stops !== undefined ? (
          <p className="text-xs text-muted-foreground">{stops === 0 ? "Direct" : `${stops} stop${stops === 1 ? "" : "s"}`}</p>
        ) : null}
      </div>

      <div className="min-w-0 text-right">
        <p className="text-sm text-muted-foreground tabular-nums">{arriveTime}</p>
        <p className={cn("font-display font-semibold leading-none tracking-tight", code)}>{to}</p>
        {toCity ? <p className="mt-1.5 truncate text-sm text-muted-foreground">{toCity}</p> : null}
      </div>
    </div>
  );
}

function PlaneMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 text-brand-500" fill="currentColor" aria-hidden>
      <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5L21 16Z" />
    </svg>
  );
}

/** "Cheapest" / "Fastest" style marker. */
export function TicketBadge({ tone, children }: { tone: "cheapest" | "fastest" | "neutral"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-lg px-3 py-1.5 text-sm font-medium",
        tone === "cheapest" && "bg-success text-white",
        tone === "fastest" && "bg-warning text-white",
        tone === "neutral" && "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}
