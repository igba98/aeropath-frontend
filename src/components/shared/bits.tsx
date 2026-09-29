"use client";

import * as React from "react";
import {
  BadgePercent,
  BedDouble,
  Car,
  Check,
  Copy,
  Map,
  Package,
  Plane,
  ShieldCheck,
  Stamp,
  Van,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import type { LineType, User } from "@/domain/types";
import { cn } from "@/lib/utils";

/** Machine code (PNR, ticket, file no.) in mono, optionally copyable. */
export function Code({ children, copy, className, strong }: { children: string; copy?: boolean; className?: string; strong?: boolean }) {
  const [done, setDone] = React.useState(false);
  const text = (
    <span className={cn("font-mono text-[13.5px] tracking-[0.01em] whitespace-nowrap text-ink", strong && "font-semibold", className)}>{children}</span>
  );
  if (!copy) return text;
  return (
    <span className="inline-flex items-center gap-1">
      {text}
      <button
        type="button"
        data-no-row
        onClick={async (e) => {
          e.stopPropagation();
          try {
            await navigator.clipboard.writeText(children);
            setDone(true);
            toast.success(`Copied ${children}`);
            setTimeout(() => setDone(false), 1400);
          } catch {
            toast.error("Couldn't copy. Select the text and copy it instead.");
          }
        }}
        className="grid size-5 place-items-center rounded-[3px] text-ink-4 transition-colors hover:bg-canvas-2 hover:text-ink"
        aria-label={`Copy ${children}`}
      >
        {done ? <Check className="size-3" /> : <Copy className="size-3" />}
      </button>
    </span>
  );
}

/** DAR → DXB → DAR, the arrow in brand blue. */
export function Route({ codes, className, size = "md" }: { codes: string[]; className?: string; size?: "sm" | "md" | "lg" }) {
  if (!codes.length) return <span className="text-ink-4">—</span>;
  return (
    <span
      className={cn(
        "inline-flex flex-wrap items-center gap-x-1 font-mono font-semibold tracking-[0.02em] text-ink",
        size === "sm" && "text-xs",
        size === "md" && "text-[13.5px]",
        size === "lg" && "text-base",
        className,
      )}
    >
      {codes.map((c, i) => (
        <React.Fragment key={i}>
          {i > 0 && (
            <span aria-hidden className="font-sans font-normal text-brand">
              →
            </span>
          )}
          <span>{c}</span>
        </React.Fragment>
      ))}
      <span className="sr-only">{codes.join(" to ")}</span>
    </span>
  );
}

export const LINE_ICON: Record<LineType, LucideIcon> = {
  flight: Plane,
  hotel: BedDouble,
  car: Car,
  transfer: Van,
  tour: Map,
  visa: Stamp,
  insurance: ShieldCheck,
  service_fee: BadgePercent,
  other: Package,
};

export const LINE_LABEL: Record<LineType, string> = {
  flight: "Flight",
  hotel: "Hotel",
  car: "Car hire",
  transfer: "Transfer",
  tour: "Tour",
  visa: "Visa",
  insurance: "Insurance",
  service_fee: "Service fee",
  other: "Other",
};

/** Small service-type icons with a count, for list rows. */
export function ServiceIcons({ types, className }: { types: LineType[]; className?: string }) {
  const counts = types.reduce<Partial<Record<LineType, number>>>((acc, t) => ({ ...acc, [t]: (acc[t] ?? 0) + 1 }), {});
  const entries = Object.entries(counts) as [LineType, number][];
  if (!entries.length) return <span className="text-[13px] text-ink-4">None</span>;
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      {entries.map(([t, n]) => {
        const I = LINE_ICON[t];
        return (
          <span key={t} className="inline-flex items-center gap-0.5 text-ink-3" title={`${n} × ${LINE_LABEL[t]}`}>
            <I className="size-3.5" aria-hidden />
            {n > 1 && <span className="tnum text-xs">{n}</span>}
            <span className="sr-only">
              {n} {LINE_LABEL[t]}
            </span>
          </span>
        );
      })}
    </span>
  );
}

/** Initials avatar for staff. */
export function UserMark({ user, size = "sm", className }: { user?: Pick<User, "initials" | "name"> | null; size?: "xs" | "sm" | "md"; className?: string }) {
  if (!user) return <span className="text-ink-4">—</span>;
  return (
    <span
      title={user.name}
      className={cn(
        "inline-grid shrink-0 place-items-center rounded-full bg-canvas-2 font-semibold text-ink-2 ring-1 ring-rule-2",
        size === "xs" && "size-5 text-[9.5px]",
        size === "sm" && "size-6 text-[11px]",
        size === "md" && "size-8 text-[13px]",
        className,
      )}
    >
      {user.initials}
    </span>
  );
}

export function Kbd({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        "inline-grid h-[18px] min-w-[18px] place-items-center rounded-[3px] border border-rule-2 bg-paper px-1 font-sans text-[11px] font-semibold text-ink-3 shadow-[inset_0_-1px_0_var(--rule-2)]",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

/** Definition list: label column + value column, hairline between rows. */
export function KeyValues({ items, className, cols = 1 }: { items: { label: React.ReactNode; value: React.ReactNode; hidden?: boolean }[]; className?: string; cols?: 1 | 2 }) {
  return (
    <dl className={cn("grid gap-x-6", cols === 2 ? "sm:grid-cols-2" : "grid-cols-1", className)}>
      {items
        .filter((i) => !i.hidden)
        .map((it, i) => (
          <div key={i} className="flex items-baseline justify-between gap-4 border-b border-rule py-2 text-sm last:border-b-0">
            <dt className="shrink-0 text-ink-3">{it.label}</dt>
            <dd className="min-w-0 text-right text-ink">{it.value}</dd>
          </div>
        ))}
    </dl>
  );
}
