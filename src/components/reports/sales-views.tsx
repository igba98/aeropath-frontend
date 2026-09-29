"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";

import { mySalesReport, profitReport, salesReport, type ProfitRow, type ReportDef, type SalesGrouping } from "@/domain/selectors/reports";
import { useApp } from "@/store";

import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState, QuickTabs, Section } from "@/components/shared/page";
import { StatusChip } from "@/components/shared/status-chip";
import { Amount } from "@/components/shared/amount";
import { UserMark } from "@/components/shared/bits";
import { FilterSelect } from "@/components/shared/filter-select";
import { FileNo, moneyCol, pct, Totals } from "./cells";
import { ReportFrame, usePageSize } from "./report-frame";
import { BreakdownTable, SaleRowsTable } from "./sales-tables";
import type { ReportState } from "./use-report-params";

interface ViewProps {
  def: ReportDef;
  state: ReportState;
}

export function MySalesView({ def, state }: ViewProps) {
  const db = useApp((s) => s.db)!;
  const r = React.useMemo(() => mySalesReport(db, state.params), [db, state.params]);
  const c = r.currency;
  return (
    <ReportFrame def={def} state={state} result={r}>
      <Section title="By service type" count={r.byType.length}>
        <BreakdownTable rows={r.byType} currency={c} label="Service type" exportName="my-sales-by-type" />
      </Section>
      <Section title="Services issued" count={r.rows.length}>
        <SaleRowsTable rows={r.rows} currency={c} exportName="my-sales" />
      </Section>
    </ReportFrame>
  );
}

type By = "agent" | "type" | "client" | "airline";

export function SalesView({ def, state }: ViewProps) {
  const db = useApp((s) => s.db)!;
  const sp = useSearchParams();
  const grouping = (["day", "week", "month"].includes(sp.get("group") ?? "") ? sp.get("group") : undefined) as SalesGrouping | undefined;
  const by = ((["agent", "type", "client", "airline"] as By[]).find((b) => b === sp.get("by")) ?? "agent") as By;
  const r = React.useMemo(() => salesReport(db, { ...state.params, grouping }), [db, state.params, grouping]);
  const c = r.currency;
  const breakdowns: Record<By, { rows: typeof r.byAgent; label: string }> = {
    agent: { rows: r.byAgent, label: "Agent" },
    type: { rows: r.byType, label: "Service type" },
    client: { rows: r.byClient, label: "Client" },
    airline: { rows: r.byAirline, label: "Airline" },
  };
  return (
    <ReportFrame
      def={def}
      state={state}
      result={r}
      controls={
        <FilterSelect
          label="Group by"
          value={grouping ?? "auto"}
          unset="auto"
          onChange={(v) => state.set({ group: v === "auto" ? null : v })}
          options={[
            { value: "auto", label: `By ${r.grouping} (auto)` },
            { value: "day", label: "By day" },
            { value: "week", label: "By week" },
            { value: "month", label: "By month" },
          ]}
        />
      }
    >
      <Section
        id="sales-breakdown"
        title="Breakdown"
        actions={
          <QuickTabs<By>
            controls="sales-breakdown"
            value={by}
            onChange={(v) => state.set({ by: v === "agent" ? null : v })}
            options={[
              { value: "agent", label: "By agent", count: r.byAgent.length },
              {
                value: "type",
                label: "By service type",
                count: r.byType.length,
              },
              { value: "client", label: "By client", count: r.byClient.length },
              {
                value: "airline",
                label: "By airline",
                count: r.byAirline.length,
              },
            ]}
            className="no-print"
          />
        }
      >
        <BreakdownTable rows={breakdowns[by].rows} currency={c} label={breakdowns[by].label} exportName={`sales-by-${by}`} />
      </Section>
      <Section title="Services issued" count={r.rows.length}>
        <SaleRowsTable rows={r.rows} currency={c} exportName="sales" showAgent />
      </Section>
    </ReportFrame>
  );
}

export function ProfitView({ def, state }: ViewProps) {
  const db = useApp((s) => s.db)!;
  const pageSize = usePageSize();
  const r = React.useMemo(() => profitReport(db, state.params), [db, state.params]);
  const c = r.currency;
  const columns: Column<ProfitRow>[] = [
    {
      key: "file",
      header: "File no.",
      sort: (x) => x.file.number,
      csv: (x) => x.file.number,
      cell: (x) => <FileNo id={x.file.id} number={x.file.number} />,
    },
    {
      key: "title",
      header: "Booking",
      sort: (x) => x.client?.name,
      csv: (x) => x.client?.name,
      csvHeader: "Client",
      className: "max-w-[280px]",
      cell: (x) => (
        <span className="block min-w-0 leading-tight">
          <span className="block truncate text-ink">{x.client?.name ?? "—"}</span>
          <span className="block truncate text-[13px] text-ink-3">{x.file.title}</span>
        </span>
      ),
    },
    {
      key: "agent",
      header: "Agent",
      sort: (x) => x.agent?.name,
      csv: (x) => x.agent?.name,
      hideBelow: "xl",
      align: "center",
      cell: (x) => <UserMark user={x.agent} />,
    },
    moneyCol<ProfitRow>("charges", `Charges (${c})`, (x) => x.charges, {
      hideBelow: "md",
    }),
    moneyCol<ProfitRow>("cost", `Cost (${c})`, (x) => x.cost, {
      hideBelow: "md",
    }),
    moneyCol<ProfitRow>("margin", `Margin (${c})`, (x) => x.margin, {
      tone: "auto",
    }),
    {
      key: "marginPct",
      header: "Margin %",
      align: "right",
      sort: (x) => x.marginPct,
      csv: (x) => (x.marginPct === null ? "" : (x.marginPct * 100).toFixed(1)),
      cell: (x) => (
        <span className="inline-flex items-center justify-end gap-2">
          {x.marginPct !== null && x.marginPct < 0 && <StatusChip label="Negative" tone="red" size="xs" />}
          {x.marginPct !== null && x.marginPct >= 0 && x.marginPct < 0.03 && <StatusChip label="Thin" tone="amber" size="xs" />}
          <span className="tnum text-ink">{pct(x.marginPct)}</span>
        </span>
      ),
    },
  ];
  return (
    <ReportFrame def={def} state={state} result={r}>
      <Section title="Bookings" count={r.rows.length} description="Lowest margin first. Click a column to sort.">
        <DataTable
          rows={r.rows}
          columns={columns}
          rowKey={(x) => x.id}
          rowHref={(x) => `/bookings/${x.file.id}`}
          search={(x) => [x.file.number, x.file.title, x.client?.name, x.agent?.name].filter(Boolean).join(" ")}
          searchPlaceholder="Search file no., client"
          exportName="profit-by-booking"
          initialSort={{ key: "marginPct", dir: "asc" }}
          pageSize={pageSize}
          dense
          empty={<EmptyState title="No bookings with services issued in this period" body="Try a longer period, or another agent." />}
          footer={
            r.rows.length && r.totals ? (
              <Totals
                columns={columns}
                values={{
                  charges: <Amount value={r.totals.charges} />,
                  cost: <Amount value={r.totals.cost} />,
                  margin: <Amount value={r.totals.margin} tone="auto" />,
                  marginPct: <span className="tnum">{pct(r.totals.charges.amountMinor ? r.totals.margin.amountMinor / r.totals.charges.amountMinor : null)}</span>,
                }}
              />
            ) : undefined
          }
        />
      </Section>
    </ReportFrame>
  );
}
