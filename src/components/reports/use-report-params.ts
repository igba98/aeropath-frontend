"use client";

import * as React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { Currency, ID } from "@/domain/types";
import { can } from "@/domain/permissions";
import { presetPeriod, type PeriodPreset, type ReportDef, type ReportParams } from "@/domain/selectors/reports";
import { useMe, useUi } from "@/store";
import { useNow } from "@/lib/use-now";
import { darToday } from "@/lib/dates";

export type PeriodChoice = PeriodPreset | "custom";

const PRESETS: PeriodChoice[] = ["today", "week", "month", "last_month", "year", "custom"];
const isDate = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export interface ReportState {
  params: ReportParams;
  choice: PeriodChoice;
  /** The agent filter as chosen ("all" when none). */
  agent: string;
  /** True when the signed-in user may only see their own figures (agents on My sales). */
  ownOnly: boolean;
  set: (patch: Record<string, string | null>) => void;
}

/** Replace several query params at once, without scrolling. */
export function useSetParams() {
  const sp = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  return React.useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(sp.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null || v === "") next.delete(k);
        else next.set(k, v);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [sp, pathname, router],
  );
}

/**
 * Report filters synced to the URL: ?period=month|today|week|last_month|year|custom&from=&to=&agent=
 * Currency always follows the global TZS/USD toggle in the header, so the two can never disagree.
 */
export function useReportParams(def: ReportDef): ReportState {
  const sp = useSearchParams();
  const me = useMe();
  const now = useNow();
  const globalCur = useUi((s) => s.displayCurrency);
  const set = useSetParams();

  const today = darToday(now);
  const raw = sp.get("period");
  const choice: PeriodChoice = raw && (PRESETS as string[]).includes(raw) ? (raw as PeriodChoice) : "month";
  const cur: Currency = globalCur;
  const ownOnly = def.slug === "my-sales" && !can(me, "report.view");
  const agentParam = sp.get("agent");
  const agentId: ID | undefined = ownOnly ? me.id : def.agentFilter && agentParam && agentParam !== "all" ? agentParam : undefined;
  const fromParam = sp.get("from");
  const toParam = sp.get("to");

  const params = React.useMemo<ReportParams>(() => {
    const at = new Date(`${today}T09:00:00Z`);
    let range = presetPeriod(choice === "custom" ? "month" : choice, at);
    if (choice === "custom") {
      const from = isDate(fromParam) ? fromParam : range.from;
      const to = isDate(toParam) ? toParam : range.to;
      range = from <= to ? { from, to } : { from: to, to: from };
    }
    return { ...range, agentId, displayCurrency: cur, now };
    // `now` refreshes each minute; recompute on the day or the filters changing, and on data changes via db.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today, choice, fromParam, toParam, agentId, cur]);

  return { params, choice, agent: agentParam ?? "all", ownOnly, set };
}
