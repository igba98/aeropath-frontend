"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

import type { DbState, Money } from "@/domain/types";
import { can } from "@/domain/permissions";
import {
  airlineSalesReport,
  bspPeriodReport,
  cashBookReport,
  expensesReport,
  mySalesReport,
  payablesReport,
  pnlReport,
  presetPeriod,
  receiptsReport,
  receivablesReport,
  REPORTS,
  voidsRefundsReport,
  type ReportDef,
  type ReportParams,
  type ReportSlug,
} from "@/domain/selectors/reports";
import { useApp, useMe, useUi } from "@/store";
import { useNow } from "@/lib/use-now";
import { darToday, fmtRange } from "@/lib/dates";

import { PageHeader, Section } from "@/components/shared/page";
import { Amount } from "@/components/shared/amount";
import { FxNote } from "@/components/reports/report-frame";

type Figure = { label: string; value: Money | number };

/** One cheap headline per report for this month (balances as of today). */
function quickFigure(slug: ReportSlug, db: DbState, p: ReportParams, meId: string): Figure | null {
  switch (slug) {
    case "my-sales":
      return { label: "Your sales", value: mySalesReport(db, { ...p, agentId: meId }).totals!.sell };
    case "sales":
      return { label: "Sales", value: mySalesReport(db, p).totals!.sell };
    case "profit":
      return { label: "Margin", value: mySalesReport(db, p).totals!.margin };
    case "airline-sales":
      return { label: "Tickets issued", value: airlineSalesReport(db, p).totals!.ticketsIssued };
    case "voids-refunds":
      return { label: "Voids and refunds", value: voidsRefundsReport(db, p).rows.length };
    case "receivables":
      return { label: "Outstanding", value: receivablesReport(db, p).totals!.total };
    case "payables":
      return { label: "We owe", value: payablesReport(db, p).totals!.total };
    case "receipts":
      return { label: "Received", value: receiptsReport(db, p).totals!.amount };
    case "cash-book":
      return { label: "Cash now", value: cashBookReport(db, p).totals!.closing };
    case "expenses":
      return { label: "Spent", value: expensesReport(db, p).totals!.amount };
    case "pnl":
      return { label: "Net", value: pnlReport(db, p).totals!.net };
    case "bsp-period":
      return { label: "Net to settle", value: bspPeriodReport(db, p).totals!.net };
  }
}

const GROUPS: ReportDef["group"][] = ["Sales", "Money in and out", "Accounts"];

export default function ReportsIndexPage() {
  const me = useMe();
  const db = useApp((s) => s.db)!;
  const now = useNow();
  const cur = useUi((s) => s.displayCurrency);
  const today = darToday(now);

  const visible = REPORTS.filter((r) => can(me, r.permission));
  const month = presetPeriod("month", now);

  const figures = React.useMemo(() => {
    const at = new Date(`${today}T09:00:00Z`);
    const p: ReportParams = { ...presetPeriod("month", at), displayCurrency: cur, now: at };
    const out: Partial<Record<ReportSlug, Figure | null>> = {};
    for (const r of visible) {
      try {
        out[r.slug] = quickFigure(r.slug, db, p, me.id);
      } catch {
        out[r.slug] = null;
      }
    }
    return out;
    // Recompute when the data, the day or the currency changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, today, cur, me.id, visible.length]);

  return (
    <>
      <PageHeader
        title="Reports"
        meta={
          <>
            <span className="tnum">This month: {fmtRange(month.from, month.to)}</span>
            <span aria-hidden>·</span>
            <span>In {cur}</span>
            <span aria-hidden>·</span>
            <FxNote rate={db.settings.fx.USD_TZS} />
          </>
        }
      />

      {!can(me, "report.view") && <p className="-mt-2 mb-6 text-[15px] text-ink-3">Your reports cover the bookings you own. Finance staff see the company-wide reports.</p>}

      <div className="grid items-start gap-6 2xl:grid-cols-2">
        {GROUPS.map((g) => {
          const list = visible.filter((r) => r.group === g);
          if (!list.length) return null;
          return (
            <Section key={g} title={g} count={list.length}>
              <ul aria-label={`${g} reports`} className="-mx-5 -mb-5 divide-y divide-rule border-t border-rule">
                {list.map((r) => {
                  const f = figures[r.slug];
                  return (
                    <li key={r.slug}>
                      <Link href={`/reports/${r.slug}`} className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-band-hover">
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15px] font-semibold text-ink group-hover:text-brand-700 dark:group-hover:text-brand-200">{r.name}</span>
                          <span className="mt-0.5 block text-sm leading-5 text-ink-3">{r.description}</span>
                        </span>
                        {f && (
                          <span className="shrink-0 text-right leading-tight">
                            <span className="block text-xs font-medium text-ink-3">{f.label}</span>
                            {typeof f.value === "number" ? (
                              <span className="tnum mt-0.5 block text-[15px] font-semibold text-ink">{f.value.toLocaleString("en-US")}</span>
                            ) : (
                              <Amount value={f.value} className="mt-0.5 flex justify-end text-[15px] font-semibold text-ink" />
                            )}
                          </span>
                        )}
                        <ChevronRight className="size-4 shrink-0 text-ink-4 transition-transform group-hover:translate-x-0.5 group-hover:text-ink" aria-hidden />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </Section>
          );
        })}
      </div>
    </>
  );
}
