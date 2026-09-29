import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

/** "1 Departure · 2 Return · 3 Travellers" progress, so the agent always knows how far they are. */
export function Steps({ steps, current, className }: { steps: string[]; current: number; className?: string }) {
  return (
    <>
      <p className={cn("text-sm sm:hidden", className)}>
        <span className="font-semibold text-brand-700 dark:text-brand-300">
          Step {current} of {steps.length}
        </span>{" "}
        <span className="text-ink-3">·</span> <span className="font-semibold text-ink">{steps[current - 1]}</span>
      </p>
      <ol className={cn("hidden flex-wrap items-center gap-x-2 gap-y-2 text-sm sm:flex", className)} aria-label="Booking steps">
      {steps.map((s, i) => {
        const n = i + 1;
        const done = n < current;
        const on = n === current;
        return (
          <li key={s} className="flex items-center gap-2" aria-current={on ? "step" : undefined}>
            <span
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold",
                done ? "bg-[var(--st-green-bg)] text-[var(--st-green-fg)]" : on ? "bg-primary text-primary-foreground" : "bg-canvas-2 text-ink-3",
              )}
            >
              {done ? <Check className="size-3.5" strokeWidth={3} /> : n}
            </span>
            <span className={cn("font-semibold", on ? "text-ink" : done ? "text-ink-2" : "text-ink-3")}>{s}</span>
            {i < steps.length - 1 && <span aria-hidden className="mx-1 h-px w-6 bg-rule-2 sm:w-10" />}
          </li>
        );
      })}
      </ol>
    </>
  );
}
