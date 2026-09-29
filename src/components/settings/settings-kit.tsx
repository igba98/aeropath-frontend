"use client";

import * as React from "react";
import Link from "next/link";
import { Lock } from "lucide-react";

import type { Settings, User } from "@/domain/types";
import { canAccessRoute } from "@/domain/permissions";
import { updateSettings, type UpdateSettingsInput } from "@/domain/commands";
import { useApp, useDispatch } from "@/store";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";

// ───────────────────────────── Tabs ─────────────────────────────

export type SettingsTabId =
  | "company"
  | "users"
  | "money-accounts"
  | "suppliers"
  | "fees"
  | "currency"
  | "numbering"
  | "airlines"
  | "integrations"
  | "audit"
  | "demo";

export const SETTINGS_TABS: { id: SettingsTabId; label: string }[] = [
  { id: "company", label: "Company" },
  { id: "users", label: "Users" },
  { id: "money-accounts", label: "Money accounts" },
  { id: "suppliers", label: "Suppliers" },
  { id: "fees", label: "Fees and tax" },
  { id: "currency", label: "Currency" },
  { id: "numbering", label: "Numbering" },
  { id: "airlines", label: "Airlines" },
  { id: "integrations", label: "Integrations" },
  { id: "audit", label: "Audit log" },
  { id: "demo", label: "Demo data" },
];

/** Tabs the user may open, in display order. */
export function visibleTabs(user: Pick<User, "role" | "active">) {
  return SETTINGS_TABS.filter((t) => canAccessRoute(user, `/settings/${t.id}`));
}

/** Left index on desktop (rounded rows, count at the right); a horizontal scroll of tabs on phones. */
export function SettingsNav({ tabs, active, counts }: { tabs: typeof SETTINGS_TABS; active: SettingsTabId; counts?: Partial<Record<SettingsTabId, number>> }) {
  return (
    <>
      <nav aria-label="Settings" className="no-scrollbar -mx-4 mb-6 overflow-x-auto px-4 lg:hidden">
        <ul className="flex min-w-max items-end gap-5 border-b border-rule">
          {tabs.map((t) => {
            const on = t.id === active;
            return (
              <li key={t.id}>
                <Link
                  href={`/settings/${t.id}`}
                  scroll={false}
                  aria-current={on ? "page" : undefined}
                  className={cn(
                    "relative -mb-px flex h-11 items-center border-b-2 text-[15px] font-semibold whitespace-nowrap transition-colors",
                    on ? "border-primary text-ink" : "border-transparent text-ink-3 hover:border-rule-2 hover:text-ink",
                  )}
                >
                  {t.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <nav aria-label="Settings" className="sticky top-20 hidden self-start lg:block">
        <ul className="space-y-0.5">
          {tabs.map((t) => {
            const on = t.id === active;
            const n = counts?.[t.id];
            return (
              <li key={t.id}>
                <Link
                  href={`/settings/${t.id}`}
                  scroll={false}
                  aria-current={on ? "page" : undefined}
                  className={cn(
                    "flex h-10 items-center justify-between gap-3 rounded-lg px-3 text-[15px] transition-colors",
                    on ? "bg-band font-semibold text-brand-700 dark:text-brand-200" : "font-medium text-ink-2 hover:bg-canvas-2 hover:text-ink",
                  )}
                >
                  <span className="truncate">{t.label}</span>
                  {n !== undefined && <span className={cn("tnum rounded-full px-1.5 text-xs font-semibold", on ? "bg-paper text-brand-700 dark:text-brand-200" : "bg-canvas-2 text-ink-3")}>{n}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </>
  );
}

// ───────────────────────────── Pieces ─────────────────────────────

/** Quiet note for roles that may look but not change. */
export function ViewOnlyNote({ className, who = "a Manager" }: { className?: string; who?: string }) {
  return (
    <p className={cn("flex items-center gap-1.5 text-[13.5px] text-ink-3", className)}>
      <Lock className="size-3.5 shrink-0" aria-hidden />
      View only — ask {who} to change this.
    </p>
  );
}

/** Tab heading: title on a rule, one line of description, optional actions. */
export function TabHeading({ title, description, actions, viewOnly }: { title: string; description?: React.ReactNode; actions?: React.ReactNode; viewOnly?: boolean }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-rule pb-3">
      <div className="min-w-0">
        <h2 className="text-[17px] leading-6 font-semibold text-ink">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-ink-3">{description}</p>}
        {viewOnly && <ViewOnlyNote className="mt-1.5" />}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Sticky save bar that appears only when there are unsaved changes. */
export function SaveBar({ dirty, onDiscard, onSave, saving, error }: { dirty: boolean; onDiscard: () => void; onSave: () => void; saving?: boolean; error?: string | null }) {
  if (!dirty) return null;
  return (
    <div role="region" aria-label="Unsaved changes" className="sticky bottom-0 z-20 -mx-4 mt-8 border-t border-rule-2 bg-paper px-4 py-2.5 sm:mx-0 sm:px-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {error ? (
          <p role="alert" className="min-w-0 flex-1 text-sm text-[var(--st-red-fg)]">
            {error}
          </p>
        ) : (
          <p className="flex items-center gap-2 text-sm text-ink-2">
            <span aria-hidden className="size-1.5 rounded-[1px] bg-[var(--st-amber-fg)]" />
            Unsaved changes
          </p>
        )}
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={onDiscard} disabled={saving}>
            Discard
          </Button>
          <Button type="button" onClick={onSave} loading={saving}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────── Draft state ─────────────────────────────

/** JSON with sorted keys, so two equal objects always compare equal. */
export function stableKey(v: unknown): string {
  return JSON.stringify(v, (_k, val) =>
    val && typeof val === "object" && !Array.isArray(val) ? Object.fromEntries(Object.entries(val as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))) : val,
  );
}

/**
 * A local, editable copy of part of Settings. Resets to the saved value whenever the saved value changes
 * (after Save, or when someone else changes it). `save(patch)` dispatches updateSettings.
 */
export function useSettingsDraft<T>(select: (s: Settings) => T) {
  const settings = useApp((s) => s.db!.settings);
  const dispatch = useDispatch();
  const source = select(settings);
  const key = stableKey(source);
  const [base, setBase] = React.useState(key);
  const [draft, setDraft] = React.useState<T>(source);
  if (base !== key) {
    setBase(key);
    setDraft(source);
  }
  const dirty = stableKey(draft) !== key;
  const discard = React.useCallback(() => setDraft(JSON.parse(key) as T), [key]);
  /** Errors come back in the result (no toast) so the Save bar can show them. */
  const save = React.useCallback((patch: UpdateSettingsInput["patch"]) => dispatch(updateSettings, { patch }, { quietErrors: true }), [dispatch]);
  return { draft, setDraft, dirty, discard, save, settings };
}
