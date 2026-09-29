"use client";

import * as React from "react";
import { flushSync } from "react-dom";
import { Printer } from "lucide-react";

import type { ReportDef, ReportResult, SummaryItem } from "@/domain/selectors/reports";
import { useApp, useUi } from "@/store";
import { useNow } from "@/lib/use-now";
import { fmtDateTime, fmtRange } from "@/lib/dates";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { PageHeader, QuickTabs, Segmented } from "@/components/shared/page";
import { FilterSelect } from "@/components/shared/filter-select";
import { SummaryStrip } from "./summary-strip";
import { ReportChart } from "./report-chart";
import type { PeriodChoice, ReportState } from "./use-report-params";
import { FxNote } from "@/components/shared/fx-note";

/** True while the page is being printed: tables show every row instead of 25-row pages. */
const PrintingContext = React.createContext(false);
export const usePrinting = () => React.useContext(PrintingContext);
/** Page size for report tables: 25 on screen, everything on paper. */
export const usePageSize = () => (usePrinting() ? 100_000 : 25);

const CHOICES: { value: PeriodChoice; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
  { value: "month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "year", label: "This year" },
  { value: "custom", label: "Custom" },
];

export { FxNote };

type FrameResult = Pick<ReportResult<unknown, unknown>, "charts" | "currency" | "fxRate" | "converted" | "notes"> & { summary: SummaryItem[] };

export function ReportFrame({
  def,
  state,
  result,
  controls,
  children,
}: {
  def: ReportDef;
  state: ReportState;
  result: FrameResult;
  /** Extra filters for this report (e.g. account, grouping). */
  controls?: React.ReactNode;
  children: React.ReactNode;
}) {
  const db = useApp((s) => s.db)!;
  const now = useNow();
  const [printing, setPrinting] = React.useState(false);
  const { params, choice, set, ownOnly } = state;
  const setCur = useUi((s) => s.setDisplayCurrency);

  React.useEffect(() => {
    const before = () => flushSync(() => setPrinting(true));
    const after = () => setPrinting(false);
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);

  const print = () => {
    flushSync(() => setPrinting(true));
    window.print();
  };

  const agents = Object.values(db.users)
    .filter((u) => u.role !== "accountant")
    .sort((a, b) => a.name.localeCompare(b.name));
  const agentName = params.agentId ? db.users[params.agentId]?.name : undefined;
  const asOf = def.range === "asOf";

  return (
    <PrintingContext.Provider value={printing}>
      <div data-print-report className="space-y-6">
        <PageHeader
          back={{ href: "/reports", label: "Reports" }}
          title={def.name}
          meta={
            <>
              <span className="tnum">{asOf ? `Balances as of ${fmtDateTime(now)}` : fmtRange(params.from, params.to)}</span>
              {agentName && (
                <>
                  <span aria-hidden>·</span>
                  <span>{ownOnly ? "Your bookings" : agentName}</span>
                </>
              )}
              <span aria-hidden>·</span>
              <span>In {params.displayCurrency}</span>
              {result.converted && (
                <>
                  <span aria-hidden>·</span>
                  <FxNote rate={result.fxRate} />
                </>
              )}
            </>
          }
          actions={
            <Button variant="outline" size="sm" onClick={print} className="no-print">
              <Printer /> Print
            </Button>
          }
        >
          <p className="mt-1 hidden text-xs text-ink-3 print:block">
            {db.settings.company.name} · printed {fmtDateTime(now)}
          </p>
        </PageHeader>

        <div className="no-print -mt-2 flex flex-wrap items-center gap-2">
          {!asOf && (
            <QuickTabs<PeriodChoice>
              controls="report-body"
              value={choice}
              onChange={(v) =>
                set(
                  v === "custom"
                    ? { period: v, from: params.from, to: params.to }
                    : {
                        period: v === "month" ? null : v,
                        from: null,
                        to: null,
                      },
                )
              }
              options={CHOICES}
            />
          )}
          {!asOf && choice === "custom" && (
            <div className="flex items-center gap-1.5">
              <Input type="date" aria-label="From" value={params.from} max={params.to} onChange={(e) => e.target.value && set({ from: e.target.value })} className="h-9 w-[160px]" />
              <span className="text-ink-4" aria-hidden>
                –
              </span>
              <Input type="date" aria-label="To" value={params.to} min={params.from} onChange={(e) => e.target.value && set({ to: e.target.value })} className="h-9 w-[160px]" />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
            {controls}
            {def.agentFilter && !ownOnly && (
              <FilterSelect
                label="Agent"
                value={state.agent}
                onChange={(v) => set({ agent: v === "all" ? null : v })}
                options={[{ value: "all", label: "All agents" }, ...agents.map((u) => ({ value: u.id, label: u.name }))]}
              />
            )}
            {/* The header carries this toggle from md up; phones get it here. Both write the same setting. */}
            <Segmented
              label="Report currency"
              value={params.displayCurrency}
              onChange={setCur}
              options={[
                { value: "TZS", label: "TZS" },
                { value: "USD", label: "USD" },
              ]}
              className="md:hidden"
            />
          </div>
        </div>

        <div id="report-body" className="space-y-6">
          <SummaryStrip items={result.summary} />

          {result.charts.length > 0 && (
            <div className={result.charts.length > 1 ? "grid items-start gap-6 xl:grid-cols-2" : undefined}>
              {result.charts.map((c) => (
                <Card key={c.title} className="block p-5">
                  <ReportChart spec={c} />
                </Card>
              ))}
            </div>
          )}

          {children}
        </div>

        {result.notes?.length ? (
          <div className="space-y-1 border-t border-rule pt-3 text-[13px] text-ink-3">
            {result.notes.map((n) => (
              <p key={n}>{n}</p>
            ))}
          </div>
        ) : null}
      </div>
    </PrintingContext.Provider>
  );
}
