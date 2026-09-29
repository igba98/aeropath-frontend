import type { ISODate } from "../types";
import { addDaysISO, darToday } from "../dates";
import { monthEnd, monthStart, previousPeriod, shiftMonth, type Period } from "../selectors/reports/common";

/** Accounting periods: calendar months, quarters and the financial year (January to December). */

export type AcctPreset = "month" | "last_month" | "quarter" | "last_quarter" | "year" | "last_year";

export const ACCT_PRESETS: { value: AcctPreset; label: string }[] = [
  { value: "month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "quarter", label: "This quarter" },
  { value: "last_quarter", label: "Last quarter" },
  { value: "year", label: "This year" },
  { value: "last_year", label: "Last year" },
];

export const isAcctPreset = (v: string | null | undefined): v is AcctPreset => ACCT_PRESETS.some((p) => p.value === v);

const quarterStart = (d: ISODate): ISODate => {
  const m = Number(d.slice(5, 7));
  const q = Math.floor((m - 1) / 3) * 3 + 1;
  return `${d.slice(0, 4)}-${String(q).padStart(2, "0")}-01`;
};

/** Date range of a preset in Dar es Salaam calendar days. "This …" periods run to their natural end. */
export function acctPeriod(preset: AcctPreset, now: Date): Period {
  const today = darToday(now);
  switch (preset) {
    case "month":
      return { from: monthStart(today), to: monthEnd(today) };
    case "last_month": {
      const from = shiftMonth(monthStart(today), -1);
      return { from, to: monthEnd(from) };
    }
    case "quarter": {
      const from = quarterStart(today);
      return { from, to: monthEnd(shiftMonth(from, 2)) };
    }
    case "last_quarter": {
      const from = shiftMonth(quarterStart(today), -3);
      return { from, to: monthEnd(shiftMonth(from, 2)) };
    }
    case "year":
      return { from: `${today.slice(0, 4)}-01-01`, to: `${today.slice(0, 4)}-12-31` };
    case "last_year": {
      const y = Number(today.slice(0, 4)) - 1;
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    }
  }
}

/** Whole calendar months covered by a period, or 0 when it does not start on a 1st and end on a month end. */
export function wholeMonths(p: Period): number {
  if (p.from !== monthStart(p.from) || p.to !== monthEnd(p.to)) return 0;
  const [fy, fm] = p.from.split("-").map(Number);
  const [ty, tm] = p.to.split("-").map(Number);
  return (ty - fy) * 12 + (tm - fm) + 1;
}

/** The comparative period: the same number of calendar months before (a month, a quarter, a year), else the same number of days. */
export function comparativeOf(p: Period): Period {
  const n = wholeMonths(p);
  if (n > 0) {
    const from = shiftMonth(p.from, -n);
    return { from, to: monthEnd(shiftMonth(from, n - 1)) };
  }
  return previousPeriod(p);
}

/** Comparative dates for an "as at" statement. */
export type AsAtCompare = "prior_year_end" | "prior_month_end" | "none";

export const AS_AT_COMPARES: { value: AsAtCompare; label: string }[] = [
  { value: "prior_year_end", label: "Last year end" },
  { value: "prior_month_end", label: "Last month end" },
  { value: "none", label: "No comparative" },
];

export const isAsAtCompare = (v: string | null | undefined): v is AsAtCompare => AS_AT_COMPARES.some((c) => c.value === v);

export function compareDate(asAt: ISODate, c: AsAtCompare): ISODate | undefined {
  if (c === "none") return undefined;
  if (c === "prior_year_end") return `${Number(asAt.slice(0, 4)) - 1}-12-31`;
  return addDaysISO(monthStart(asAt), -1);
}

/** Day before a date. */
export const dayBefore = (d: ISODate): ISODate => addDaysISO(d, -1);

export { monthEnd, monthStart, type Period };
