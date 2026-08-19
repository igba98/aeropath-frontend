"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useSession } from "@/hooks/use-session";
import { cn } from "@/lib/utils";

/** A panel with a heading — the recurring container in the back office. */
export function Panel({ title, description, actions, children, className, icon: Icon }: {
  title?: string; description?: string; actions?: React.ReactNode; children: React.ReactNode; className?: string; icon?: LucideIcon;
}) {
  return (
    <section className={cn("rounded-xl border bg-card p-4", className)}>
      {title ? (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 font-display text-base">
              {Icon ? <Icon className="size-4 text-muted-foreground" aria-hidden /> : null}
              {title}
            </h2>
            {description ? <p className="mt-0.5 text-xs text-muted-foreground">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** Label + value row, used all over the detail screens. */
export function Detail({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

/**
 * An action the current role may or may not be allowed to take.
 * We never silently hide the control: a disabled button with the reason is far more useful to a
 * back office user than an interface that quietly changes shape per role (flow spec §2.4).
 */
export function GatedAction({
  permission, onClick, children, variant = "outline", size = "sm", icon: Icon, blockedReason, className, title,
}: {
  permission: string;
  onClick: () => void;
  children: React.ReactNode;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  icon?: LucideIcon;
  /** a non-permission reason the action cannot run right now, e.g. an illegal state transition */
  blockedReason?: string;
  className?: string;
  title?: string;
}) {
  const { can, roleLabel } = useSession();
  const allowed = can(permission);
  const disabled = !allowed || Boolean(blockedReason);
  const reason = !allowed
    ? `Needs the ${permission} permission. You are signed in as ${roleLabel}, which does not have it.`
    : blockedReason;

  const button = (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={className}
      disabled={disabled}
      aria-disabled={disabled}
      title={disabled ? undefined : title}
      onClick={disabled ? undefined : onClick}
    >
      {!allowed ? <Lock aria-hidden /> : Icon ? <Icon aria-hidden /> : null}
      {children}
    </Button>
  );

  if (!disabled) return button;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex cursor-not-allowed">{button}</span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">{reason}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/** Horizontal filter chips. Simpler and denser than a tab bar when the counts matter. */
export function FilterChips<T extends string>({ options, value, onChange, ariaLabel }: {
  options: Array<{ id: T; label: string; count?: number }>;
  value: T;
  onChange: (id: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(o.id)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              active ? "border-brand-300 bg-brand-50 text-brand-text-strong" : "bg-card text-muted-foreground hover:bg-muted",
            )}
          >
            {o.label}
            {o.count != null ? (
              <span className={cn("rounded-full px-1.5 py-px text-[10px] tabular-nums", active ? "bg-brand-500 text-white" : "bg-muted text-muted-foreground")}>{o.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** Placeholder shown while the persisted store rehydrates, so server and client markup agree. */
export function ConsoleLoading({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-live="polite">
      <Skeleton className="h-8 w-64" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
      <Skeleton className="h-64 rounded-xl" />
      <span className="sr-only">Loading {rows} rows…</span>
    </div>
  );
}

/** Booking reference rendered as a link into the ops detail screen. */
export function BookingRef({ id, reference, className }: { id: string; reference: string; className?: string }) {
  return (
    <Link href={`/admin/ops/bookings/${id}`} className={cn("font-mono text-xs font-medium text-brand-text hover:underline", className)}>
      {reference}
    </Link>
  );
}
