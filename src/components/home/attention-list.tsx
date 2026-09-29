"use client";

import * as React from "react";
import Link from "next/link";
import { BadgeCheck, CheckCheck, Clock, CreditCard, FileWarning, Gauge, HandCoins, Hourglass, PlaneTakeoff, Receipt, Truck, Undo2, type LucideIcon } from "lucide-react";

import type { AttentionItem, AttentionKind } from "@/domain/selectors/attention";
import { ATTENTION_KIND_LABELS } from "@/domain/selectors/attention";
import { useApp } from "@/store";
import { daysUntil, fmtDay, fmtRelative, fmtTime, splitLocal } from "@/lib/dates";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";

const ICON: Record<AttentionKind, LucideIcon> = {
  ttl: Hourglass,
  departing_unpaid: PlaneTakeoff,
  stale_quote: Clock,
  unverified_payment: BadgeCheck,
  refund_decision: Undo2,
  refund_payout: HandCoins,
  supplier_overdue: Truck,
  credit_limit: Gauge,
  void_window: Receipt,
  invoice_outdated: FileWarning,
  client_credit: CreditCard,
};

const TONE: Record<AttentionItem["severity"], string> = {
  red: "bg-[var(--st-red-bg)] text-[var(--st-red-fg)]",
  amber: "bg-[var(--st-amber-bg)] text-[var(--st-amber-fg)]",
  info: "bg-[var(--st-blue-bg)] text-[var(--st-blue-fg)]",
};

function dueLabel(due: string | undefined, now: Date): { text: string; sub?: string } {
  if (!due) return { text: "" };
  if (due.length === 10) {
    const d = splitLocal(due + "T00:00");
    const days = daysUntil(due, now);
    return {
      text: days === 0 ? "Today" : days === 1 ? "Tomorrow" : days === -1 ? "Yesterday" : days < 0 ? `${-days} days ago` : `In ${days} days`,
      sub: `${d.weekday} ${d.date}`,
    };
  }
  const rel = fmtRelative(due, now);
  return { text: rel.charAt(0).toUpperCase() + rel.slice(1), sub: `${fmtDay(due)}, ${fmtTime(due)}` };
}

/** "Needs attention": what to do next, most urgent first, each with its one-click action. */
export function AttentionList({ items, now, limit = 8 }: { items: AttentionItem[]; now: Date; limit?: number }) {
  const db = useApp((s) => s.db)!;
  const [all, setAll] = React.useState(false);
  const shown = all ? items : items.slice(0, limit);

  if (!items.length) {
    return (
      <div className="flex items-center gap-3 rounded-lg bg-[var(--st-green-bg)] px-4 py-4 text-[15px] text-[var(--st-green-fg)]">
        <CheckCheck className="size-5 shrink-0" />
        <span>
          <span className="font-semibold">Nothing needs you right now.</span> New time limits, unpaid departures and approvals will show up here.
        </span>
      </div>
    );
  }

  return (
    <div>
      <ul className="-mx-5 divide-y divide-rule border-t border-rule">
        {shown.map((it) => {
          const Icon = ICON[it.kind];
          const due = dueLabel(it.due, now);
          const file = it.fileId ? db.files[it.fileId] : undefined;
          const client = it.clientId ? db.clients[it.clientId] : file ? db.clients[file.clientId] : undefined;
          return (
            <li key={it.id} className="flex flex-wrap items-start gap-x-4 gap-y-3 px-5 py-4 transition-colors hover:bg-band-hover sm:flex-nowrap sm:items-center">
              <span className={cn("grid size-10 shrink-0 place-items-center rounded-full", TONE[it.severity])}>
                <Icon className="size-[18px]" />
              </span>
              <div className="min-w-0 flex-1 basis-[calc(100%-3.5rem)] sm:basis-auto">
                <p className="text-[15px] leading-6 text-ink">{it.sentence}</p>
                <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-ink-3">
                  <span className="font-medium">{ATTENTION_KIND_LABELS[it.kind]}</span>
                  {file && (
                    <>
                      <span aria-hidden>·</span>
                      <Link href={`/bookings/${file.id}`} className="tnum font-medium text-ink-2 hover:underline">
                        {file.number}
                      </Link>
                    </>
                  )}
                  {client && (
                    <>
                      <span aria-hidden>·</span>
                      <span className="truncate">{client.name}</span>
                    </>
                  )}
                </p>
              </div>
              <div className="ml-14 flex shrink-0 items-center gap-4 sm:ml-0">
                {due.text && (
                  <span className="text-right leading-tight">
                    <span
                      className={cn(
                        "tnum block text-sm font-semibold",
                        it.severity === "red" ? "text-[var(--st-red-fg)]" : it.severity === "amber" ? "text-[var(--st-amber-fg)]" : "text-ink-2",
                      )}
                    >
                      {due.text}
                    </span>
                    {due.sub && <span className="tnum block text-xs text-ink-4">{due.sub}</span>}
                  </span>
                )}
                <Button asChild size="sm" variant={it.severity === "red" ? "default" : "outline"} className="min-w-[104px]">
                  <Link href={it.action.href}>{it.action.label}</Link>
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      {items.length > limit && (
        <div className="-mx-5 -mb-5 border-t border-rule px-5 py-3">
          <Button variant="ghost" size="sm" onClick={() => setAll((a) => !a)} className="-ml-2">
            {all ? "Show fewer" : `Show all ${items.length}`}
          </Button>
        </div>
      )}
    </div>
  );
}
