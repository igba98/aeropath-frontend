"use client";

import * as React from "react";

import { airlineSalesReport, voidsRefundsReport, type AirlineRow, type ReportDef, type VoidRefundRow } from "@/domain/selectors/reports";
import { useApp } from "@/store";
import { fmtDate } from "@/lib/dates";

import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState, QuickTabs, Section } from "@/components/shared/page";
import { StatusChip } from "@/components/shared/status-chip";
import { Amount } from "@/components/shared/amount";
import { countCol, FileNo, Mono, moneyCol, Totals } from "./cells";
import { ReportFrame, usePageSize } from "./report-frame";
import type { ReportState } from "./use-report-params";

interface ViewProps {
  def: ReportDef;
  state: ReportState;
}

export function AirlineSalesView({ def, state }: ViewProps) {
  const db = useApp((s) => s.db)!;
  const pageSize = usePageSize();
  const r = React.useMemo(() => airlineSalesReport(db, state.params), [db, state.params]);
  const c = r.currency;
  const columns: Column<AirlineRow>[] = [
    {
      key: "carrier",
      header: "Airline",
      sort: (x) => x.carrier,
      csv: (x) => `${x.carrier} ${x.name}`,
      cell: (x) => (
        <span className="flex items-baseline gap-2">
          <Mono className="font-semibold">{x.carrier}</Mono>
          <span className="truncate text-ink-2">{x.name !== x.carrier ? x.name : ""}</span>
        </span>
      ),
    },
    countCol<AirlineRow>("issued", "Issued", (x) => x.ticketsIssued),
    countCol<AirlineRow>("voided", "Voided", (x) => x.ticketsVoided, "sm"),
    countCol<AirlineRow>("refunded", "Refunded", (x) => x.ticketsRefunded, "sm"),
    moneyCol<AirlineRow>("fare", `Fare (${c})`, (x) => x.fare, {
      hideBelow: "md",
    }),
    moneyCol<AirlineRow>("commission", `Commission (${c})`, (x) => x.commission, { hideBelow: "xl" }),
    moneyCol<AirlineRow>("voidedAmt", `Voids (${c})`, (x) => x.voided, {
      hideBelow: "xl",
    }),
    moneyCol<AirlineRow>("refundedAmt", `Refund credits (${c})`, (x) => x.refunded, { hideBelow: "xl" }),
    moneyCol<AirlineRow>("net", `Net (${c})`, (x) => x.net),
  ];
  const t = r.totals!;
  return (
    <ReportFrame def={def} state={state} result={r}>
      <Section title="By validating carrier" count={r.rows.length} description="Net = fare − commission − voids − refund credits: what the settlement owes the airlines for the period.">
        <DataTable
          rows={r.rows}
          columns={columns}
          rowKey={(x) => x.id}
          exportName="airline-sales"
          initialSort={{ key: "fare", dir: "desc" }}
          pageSize={pageSize}
          dense
          empty={<EmptyState title="No tickets issued, voided or refunded in this period" />}
          footer={
            r.rows.length ? (
              <Totals
                columns={columns}
                values={{
                  issued: <span className="tnum">{t.ticketsIssued}</span>,
                  voided: <span className="tnum">{t.ticketsVoided}</span>,
                  refunded: <span className="tnum">{t.ticketsRefunded}</span>,
                  fare: <Amount value={t.fare} />,
                  commission: <Amount value={t.commission} />,
                  voidedAmt: <Amount value={t.voided} />,
                  refundedAmt: <Amount value={t.refunded} />,
                  net: <Amount value={t.net} />,
                }}
              />
            ) : undefined
          }
        />
      </Section>
    </ReportFrame>
  );
}

type Kind = "all" | VoidRefundRow["kind"];
const KIND_LABEL: Record<VoidRefundRow["kind"], string> = {
  void: "Void",
  refund: "Refund",
  exchange: "Exchange",
};

export function VoidsRefundsView({ def, state }: ViewProps) {
  const db = useApp((s) => s.db)!;
  const pageSize = usePageSize();
  const [kind, setKind] = React.useState<Kind>("all");
  const r = React.useMemo(() => voidsRefundsReport(db, state.params), [db, state.params]);
  const c = r.currency;
  const rows = kind === "all" ? r.rows : r.rows.filter((x) => x.kind === kind);
  const count = (k: VoidRefundRow["kind"]) => r.rows.filter((x) => x.kind === k).length;
  const columns: Column<VoidRefundRow>[] = [
    {
      key: "at",
      header: "Date",
      sort: (x) => x.at,
      csv: (x) => x.at.slice(0, 10),
      cell: (x) => <span className="tnum whitespace-nowrap">{fmtDate(x.at)}</span>,
    },
    {
      key: "kind",
      header: "Event",
      sort: (x) => x.kind,
      csv: (x) => `${KIND_LABEL[x.kind]}${x.number ? ` ${x.number}` : ""}`,
      cell: (x) => (
        <span className="block leading-tight">
          <span className="block text-ink">{KIND_LABEL[x.kind]}</span>
          {x.number && <Mono className="text-xs text-ink-3">{x.number}</Mono>}
        </span>
      ),
    },
    {
      key: "file",
      header: "File no.",
      sort: (x) => x.file.number,
      csv: (x) => x.file.number,
      cell: (x) => <FileNo id={x.file.id} number={x.file.number} />,
    },
    {
      key: "service",
      header: "Service",
      sort: (x) => x.line.description,
      csv: (x) => `${x.line.description}${x.tickets.length ? ` (${x.tickets.join(" ")})` : ""}`,
      hideBelow: "md",
      className: "max-w-[280px]",
      cell: (x) => (
        <span className="block min-w-0 leading-tight">
          <span className="block truncate text-ink">{x.client?.name ?? "—"}</span>
          <span className="block truncate text-[13px] text-ink-3">{x.line.description}</span>
          {x.tickets.length > 0 && <Mono className="block truncate text-xs text-ink-3">{x.tickets.join(", ")}</Mono>}
        </span>
      ),
    },
    moneyCol<VoidRefundRow>("amount", `Amount (${c})`, (x) => x.amount),
    moneyCol<VoidRefundRow>("penalty", `Penalty (${c})`, (x) => x.penalty, {
      hideBelow: "xl",
    }),
    moneyCol<VoidRefundRow>("fee", `Agency fee (${c})`, (x) => x.agencyFee, {
      hideBelow: "xl",
    }),
    {
      key: "status",
      header: "Status",
      sort: (x) => x.status,
      csv: (x) => x.status,
      hideBelow: "sm",
      cell: (x) => <StatusChip status={x.kind === "void" ? "line.voided" : `refund.${x.status}`} size="xs" />,
    },
    {
      key: "who",
      header: "Requested · decided",
      sort: (x) => x.decidedBy?.name ?? x.requestedBy?.name,
      csv: (x) => [x.requestedBy?.name, x.decidedBy?.name].filter(Boolean).join(" / "),
      hideBelow: "2xl",
      cell: (x) => (
        <span className="block text-[13px] leading-tight text-ink-2">
          <span className="block">{x.requestedBy?.name ?? "—"}</span>
          {x.decidedBy && <span className="block text-ink-3">Decided by {x.decidedBy.name}</span>}
        </span>
      ),
    },
  ];
  return (
    <ReportFrame def={def} state={state} result={r}>
      <Section
        id="air-events"
        title="Voids, refunds and exchanges"
        count={rows.length}
        actions={
          <QuickTabs<Kind>
            controls="air-events"
            value={kind}
            onChange={setKind}
            className="no-print"
            options={[
              { value: "all", label: "All", count: r.rows.length },
              { value: "void", label: "Voids", count: count("void") },
              { value: "refund", label: "Refunds", count: count("refund") },
              {
                value: "exchange",
                label: "Exchanges",
                count: count("exchange"),
              },
            ]}
          />
        }
        description="Amount: the sale reversed for a void, the client refund for a refund, the extra fare and change fee for an exchange."
      >
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(x) => x.id}
          rowHref={(x) => `/bookings/${x.file.id}`}
          search={(x) => [x.number, x.file.number, x.client?.name, x.line.description, ...x.tickets].filter(Boolean).join(" ")}
          searchPlaceholder="Search file no., ticket, client"
          exportName="voids-refunds"
          initialSort={{ key: "at", dir: "desc" }}
          pageSize={pageSize}
          dense
          empty={<EmptyState title="No voids, refunds or exchanges in this period" />}
        />
      </Section>
    </ReportFrame>
  );
}
