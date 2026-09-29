"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { AGING_BUCKETS, type AgingBucket } from "@/domain/selectors/balances";
import {
  cashBookReport,
  LEDGER_KIND_LABELS,
  payablesReport,
  receivablesReport,
  type CashAccountSummary,
  type CashBookRow,
  type PayableReportRow,
  type ReceivableReportRow,
  type ReportDef,
} from "@/domain/selectors/reports";
import { useApp } from "@/store";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";

import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState, Section } from "@/components/shared/page";
import { StatusChip } from "@/components/shared/status-chip";
import { Amount } from "@/components/shared/amount";
import { UserMark } from "@/components/shared/bits";
import { FilterSelect } from "@/components/shared/filter-select";
import { countCol, FileNo, moneyCol, Totals } from "./cells";
import { ReportFrame, usePageSize } from "./report-frame";
import type { ReportState } from "./use-report-params";

interface ViewProps {
  def: ReportDef;
  state: ReportState;
}

const BUCKET_SHORT: Record<AgingBucket, string> = { notDue: "Not due", d0_30: "0–30", d31_60: "31–60", d61_90: "61–90", d90plus: "90+" };

export function ReceivablesView({ def, state }: ViewProps) {
  const db = useApp((s) => s.db)!;
  const pageSize = usePageSize();
  const r = React.useMemo(() => receivablesReport(db, state.params), [db, state.params]);
  const c = r.currency;
  const rate = db.settings.fx.USD_TZS;
  const columns: Column<ReceivableReportRow>[] = [
    {
      key: "client",
      header: "Client",
      sort: (x) => x.client.name,
      csv: (x) => x.client.name,
      className: "max-w-[240px]",
      cell: (x) => (
        <span className="block min-w-0 leading-tight">
          <Link href={`/clients/${x.client.id}`} className="block truncate text-ink hover:text-link hover:underline">
            {x.client.name}
          </Link>
          {x.client.type === "corporate" && <span className="block text-xs text-ink-3">Corporate</span>}
        </span>
      ),
    },
    { key: "file", header: "File no.", sort: (x) => x.file.number, csv: (x) => x.file.number, cell: (x) => <FileNo id={x.file.id} number={x.file.number} /> },
    { key: "agent", header: "Agent", sort: (x) => x.agent?.name, csv: (x) => x.agent?.name, hideBelow: "2xl", align: "center", cell: (x) => <UserMark user={x.agent} /> },
    {
      key: "due",
      header: "Due",
      sort: (x) => x.dueAt ?? "",
      csv: (x) => x.dueAt ?? "",
      hideBelow: "sm",
      cell: (x) => (
        <span className="block leading-tight whitespace-nowrap">
          <span className="tnum block text-ink">{fmtDate(x.dueAt)}</span>
          {x.daysPastDue > 0 && <span className="tnum block text-xs text-ink-3">{x.daysPastDue} days late</span>}
        </span>
      ),
    },
    ...AGING_BUCKETS.map((b) => moneyCol<ReceivableReportRow>(b.key, BUCKET_SHORT[b.key], (x) => (x.bucket === b.key ? x.balance : undefined), { hideBelow: "xl", rate, mixed: true })),
    {
      key: "balance",
      header: `Balance (${c})`,
      align: "right",
      sort: (x) => x.balanceDisplay.amountMinor,
      csv: (x) => x.balanceDisplay.amountMinor / 100,
      cell: (x) => (
        <span className="flex flex-col items-end gap-1">
          <Amount value={x.balanceDisplay} />
          {x.bucket === "notDue" ? <span className="text-xs text-ink-3 lg:hidden">Not due</span> : <StatusChip status="pay.overdue" label={`${BUCKET_SHORT[x.bucket]} days`} size="xs" className="lg:hidden" />}
        </span>
      ),
    },
  ];
  const t = r.totals!;
  return (
    <ReportFrame def={def} state={state} result={r}>
      <Section title="Balances by age" count={r.rows.length} description="Click a row to open the client. Bucket columns are in each booking's currency; totals are converted.">
        <DataTable
          rows={r.rows}
          columns={columns}
          rowKey={(x) => x.id}
          rowHref={(x) => `/clients/${x.client.id}`}
          search={(x) => [x.client.name, x.client.phone, x.file.number, x.agent?.name].filter(Boolean).join(" ")}
          searchPlaceholder="Search client, file no."
          exportName="receivables-aging"
          initialSort={{ key: "due", dir: "asc" }}
          pageSize={pageSize}
          dense
          empty={<EmptyState title="Nobody owes us anything" body="Every booking is paid up." />}
          footer={
            r.rows.length ? (
              <Totals columns={columns} label={`Total (${c})`} values={{ ...Object.fromEntries(AGING_BUCKETS.map((b) => [b.key, <Amount key={b.key} value={t.buckets[b.key]} />])), balance: <Amount value={t.total} /> }} />
            ) : undefined
          }
        />
      </Section>
    </ReportFrame>
  );
}

export function PayablesView({ def, state }: ViewProps) {
  const db = useApp((s) => s.db)!;
  const pageSize = usePageSize();
  const r = React.useMemo(() => payablesReport(db, state.params), [db, state.params]);
  const c = r.currency;
  const rate = db.settings.fx.USD_TZS;
  const columns: Column<PayableReportRow>[] = [
    {
      key: "supplier",
      header: "Supplier",
      sort: (x) => x.supplier.name,
      csv: (x) => x.supplier.name,
      cell: (x) => (
        <Link href={`/money-out/suppliers/${x.supplier.id}`} className="text-ink hover:text-link hover:underline">
          {x.supplier.name}
        </Link>
      ),
    },
    countCol<PayableReportRow>("items", "Open", (x) => x.openItems, "sm"),
    { key: "oldest", header: "Oldest", align: "right", hideBelow: "md", sort: (x) => x.oldestDays, csv: (x) => x.oldestDays, cell: (x) => <span className="tnum text-ink-2">{x.oldestDays} d</span> },
    ...AGING_BUCKETS.map((b) => moneyCol<PayableReportRow>(b.key, BUCKET_SHORT[b.key], (x) => x.buckets[b.key], { hideBelow: "xl", rate, mixed: true })),
    moneyCol<PayableReportRow>("total", "Owed", (x) => x.total, { rate, mixed: true, hideBelow: "sm" }),
    moneyCol<PayableReportRow>("totalDisplay", `Owed (${c})`, (x) => x.totalDisplay),
  ];
  const t = r.totals!;
  return (
    <ReportFrame def={def} state={state} result={r}>
      <Section title="By supplier" count={r.rows.length} description="Days past the supplier's payment terms, counted from the issue date. Click a row to pay the supplier.">
        <DataTable
          rows={r.rows}
          columns={columns}
          rowKey={(x) => x.id}
          rowHref={(x) => `/money-out/suppliers/${x.supplier.id}`}
          search={(x) => x.supplier.name}
          searchPlaceholder="Search supplier"
          exportName="payables-aging"
          initialSort={{ key: "totalDisplay", dir: "desc" }}
          pageSize={pageSize}
          dense
          empty={<EmptyState title="We owe no supplier anything" body="Every issued service is paid for." />}
          footer={
            r.rows.length ? (
              <Totals columns={columns} label={`Total (${c})`} values={{ ...Object.fromEntries(AGING_BUCKETS.map((b) => [b.key, <Amount key={b.key} value={t.buckets[b.key]} />])), totalDisplay: <Amount value={t.total} /> }} />
            ) : undefined
          }
        />
      </Section>
    </ReportFrame>
  );
}

export function CashBookView({ def, state }: ViewProps) {
  const db = useApp((s) => s.db)!;
  const sp = useSearchParams();
  const pageSize = usePageSize();
  const accountId = sp.get("account") ?? undefined;
  const r = React.useMemo(() => cashBookReport(db, { ...state.params, accountId }), [db, state.params, accountId]);
  const c = r.currency;
  const accounts = Object.values(db.moneyAccounts).sort((a, b) => a.name.localeCompare(b.name));

  const sumCols: Column<CashAccountSummary>[] = [
    { key: "account", header: "Account", sort: (x) => x.account.name, csv: (x) => x.account.name, cell: (x) => <span className={cn("text-ink", !x.account.active && "text-ink-3")}>{x.account.name}</span> },
    moneyCol<CashAccountSummary>("opening", "Opening", (x) => x.opening, { hideBelow: "sm", mixed: true, muteZero: false }),
    moneyCol<CashAccountSummary>("in", "Money in", (x) => x.moneyIn, { mixed: true }),
    moneyCol<CashAccountSummary>("out", "Money out", (x) => x.moneyOut, { mixed: true }),
    moneyCol<CashAccountSummary>("closing", "Closing", (x) => x.closing, { mixed: true, muteZero: false }),
  ];
  const txCols: Column<CashBookRow>[] = [
    { key: "at", header: "Date", sort: (x) => x.at, csv: (x) => x.at, cell: (x) => <span className="tnum whitespace-nowrap" title={fmtDateTime(x.at)}>{fmtDate(x.at)}</span> },
    { key: "account", header: "Account", sort: (x) => x.account.name, csv: (x) => x.account.name, hideBelow: "md", cell: (x) => <span className="whitespace-nowrap text-ink-2">{x.account.name}</span> },
    {
      key: "memo",
      header: "Movement",
      sort: (x) => x.memo,
      csv: (x) => x.memo,
      className: "max-w-[360px]",
      cell: (x) => (
        <span className="block min-w-0 leading-tight">
          <span className="block truncate text-ink">{x.memo}</span>
          {x.kind && <span className="block text-xs text-ink-3">{LEDGER_KIND_LABELS[x.kind]}</span>}
        </span>
      ),
    },
    moneyCol<CashBookRow>("in", "In", (x) => (x.moneyIn.amountMinor ? x.moneyIn : undefined), { mixed: true }),
    moneyCol<CashBookRow>("out", "Out", (x) => (x.moneyOut.amountMinor ? x.moneyOut : undefined), { mixed: true }),
    moneyCol<CashBookRow>("balance", "Balance", (x) => x.balance, { hideBelow: "sm", mixed: true, muteZero: false }),
  ];
  const t = r.totals!;
  return (
    <ReportFrame
      def={def}
      state={state}
      result={r}
      controls={
        <FilterSelect label="Account" value={accountId ?? "all"} onChange={(v) => state.set({ account: v === "all" ? null : v })} options={[{ value: "all", label: "All accounts" }, ...accounts.map((a) => ({ value: a.id, label: a.name }))]} />
      }
    >
      <Section title="Accounts" count={r.accounts.length} description="Opening balance plus the ledger's money movements; each account in its own currency.">
        <DataTable
          rows={r.accounts}
          columns={sumCols}
          rowKey={(x) => x.account.id}
          onRowClick={(x) => state.set({ account: x.account.id })}
          exportName="cash-book-accounts"
          pageSize={pageSize}
          dense
          empty={<EmptyState title="No money accounts yet" body="A Manager adds them in Settings → Money accounts." />}
          footer={
            r.accounts.length > 1 ? (
              <Totals columns={sumCols} label={`Total (${c})`} values={{ opening: <Amount value={t.opening} />, in: <Amount value={t.moneyIn} />, out: <Amount value={t.moneyOut} />, closing: <Amount value={t.closing} /> }} />
            ) : undefined
          }
        />
      </Section>
      <Section title="Movements" count={r.rows.length} description={accountId ? "Running balance after each movement." : "Pick one account to read its running balance."}>
        <DataTable
          rows={r.rows}
          columns={accountId ? txCols : txCols.filter((col) => col.key !== "balance")}
          rowKey={(x) => x.id}
          rowHref={(x) => (x.fileId ? `/bookings/${x.fileId}` : undefined)}
          search={(x) => [x.memo, x.account.name, x.kind ? LEDGER_KIND_LABELS[x.kind] : ""].join(" ")}
          searchPlaceholder="Search receipts, payments, expenses"
          exportName="cash-book"
          initialSort={{ key: "at", dir: "asc" }}
          pageSize={pageSize}
          dense
          empty={<EmptyState title="No money moved in this period" />}
        />
      </Section>
    </ReportFrame>
  );
}
