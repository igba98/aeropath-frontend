"use client";

import * as React from "react";

import type { Currency, Money } from "@/domain/types";
import type { Breakdown, SaleRow } from "@/domain/selectors/reports";
import { fmtDate } from "@/lib/dates";

import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/page";
import { StatusChip } from "@/components/shared/status-chip";
import { Amount } from "@/components/shared/amount";
import { LINE_ICON, LINE_LABEL, UserMark } from "@/components/shared/bits";
import { countCol, FileNo, moneyCol, pct, Totals } from "./cells";
import { usePageSize } from "./report-frame";

/** Issued services, one row per line, with a double-ruled total. */
export function SaleRowsTable({ rows, currency, exportName, showAgent }: { rows: SaleRow[]; currency: Currency; exportName: string; showAgent?: boolean }) {
  const pageSize = usePageSize();
  const columns: Column<SaleRow>[] = [
    {
      key: "issued",
      header: "Issued",
      sort: (r) => r.issuedAt,
      csv: (r) => r.issuedAt.slice(0, 10),
      cell: (r) => <span className="tnum whitespace-nowrap text-ink">{fmtDate(r.issuedAt)}</span>,
    },
    { key: "file", header: "File no.", sort: (r) => r.file.number, csv: (r) => r.file.number, cell: (r) => <FileNo id={r.file.id} number={r.file.number} /> },
    {
      key: "service",
      header: "Service",
      sort: (r) => r.type,
      csv: (r) => `${LINE_LABEL[r.type]}: ${r.line.description}`,
      className: "max-w-[320px]",
      cell: (r) => {
        const Icon = LINE_ICON[r.type];
        return (
          <span className="flex min-w-0 items-center gap-2">
            <Icon className="size-3.5 shrink-0 text-ink-3" aria-hidden />
            <span className="min-w-0 truncate text-ink">{r.line.description}</span>
            {r.status !== "issued" && r.status !== "completed" && <StatusChip status={`line.${r.status}`} size="xs" />}
          </span>
        );
      },
    },
    { key: "client", header: "Client", sort: (r) => r.client?.name, csv: (r) => r.client?.name, hideBelow: "md", cell: (r) => <span className="block max-w-[200px] truncate">{r.client?.name ?? "—"}</span> },
    ...(showAgent
      ? [{ key: "agent", header: "Agent", sort: (r: SaleRow) => r.agent?.name, csv: (r: SaleRow) => r.agent?.name, hideBelow: "xl" as const, align: "center" as const, cell: (r: SaleRow) => <UserMark user={r.agent} /> }]
      : []),
    moneyCol<SaleRow>("sell", `Sell (${currency})`, (r) => r.sell),
    moneyCol<SaleRow>("margin", `Margin (${currency})`, (r) => r.margin, { hideBelow: "sm" }),
  ];
  const sum = (k: "sell" | "margin"): Money => ({ amountMinor: rows.reduce((s, r) => s + r[k].amountMinor, 0), currency });
  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(r) => r.id}
      search={(r) => [r.file.number, r.client?.name, r.line.description, r.agent?.name, r.carrier].filter(Boolean).join(" ")}
      searchPlaceholder="Search file no., client, service"
      exportName={exportName}
      initialSort={{ key: "issued", dir: "desc" }}
      pageSize={pageSize}
      dense
      empty={<EmptyState title="Nothing issued in this period" body="Try a longer period, or another agent." />}
      footer={rows.length ? <Totals columns={columns} values={{ sell: <Amount value={sum("sell")} />, margin: <Amount value={sum("margin")} /> }} /> : undefined}
    />
  );
}

/** A breakdown (by agent, type, client, airline) as a small timetable. */
export function BreakdownTable({ rows, currency, label, exportName }: { rows: Breakdown[]; currency: Currency; label: string; exportName: string }) {
  const pageSize = usePageSize();
  const columns: Column<Breakdown>[] = [
    { key: "label", header: label, sort: (r) => r.label, csv: (r) => r.label, cell: (r) => <span className="text-ink">{r.label}</span> },
    countCol<Breakdown>("count", "Services", (r) => r.count),
    moneyCol<Breakdown>("sell", `Sell (${currency})`, (r) => r.sell),
    moneyCol<Breakdown>("margin", `Margin (${currency})`, (r) => r.margin, { hideBelow: "sm" }),
    {
      key: "marginPct",
      header: "Margin %",
      align: "right",
      hideBelow: "md",
      sort: (r) => (r.sell.amountMinor ? r.margin.amountMinor / r.sell.amountMinor : 0),
      csv: (r) => (r.sell.amountMinor ? ((r.margin.amountMinor / r.sell.amountMinor) * 100).toFixed(1) : ""),
      cell: (r) => <span className="tnum text-ink-2">{pct(r.sell.amountMinor ? r.margin.amountMinor / r.sell.amountMinor : null)}</span>,
    },
    {
      key: "share",
      header: "Share",
      align: "right",
      sort: (r) => r.share,
      csv: (r) => (r.share * 100).toFixed(1),
      cell: (r) => (
        <span className="inline-flex items-center justify-end gap-2">
          <span className="hidden h-1 w-16 overflow-hidden rounded-full bg-canvas-2 sm:block" aria-hidden>
            <span className="block h-full bg-[var(--chart-1)]" style={{ width: `${Math.round(r.share * 100)}%` }} />
          </span>
          <span className="tnum w-12 text-ink-2">{pct(r.share)}</span>
        </span>
      ),
    },
  ];
  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(r) => r.key}
      exportName={exportName}
      initialSort={{ key: "sell", dir: "desc" }}
      pageSize={pageSize}
      dense
      empty={<EmptyState title="Nothing issued in this period" />}
    />
  );
}
