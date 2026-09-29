"use client";

import * as React from "react";
import { Info } from "lucide-react";

import { METHOD_LABELS } from "@/domain/commands/recordPayment";
import { expensesReport, pnlReport, receiptsReport, type ExpenseRow, type PnlRow, type ReceiptGroup, type ReceiptRow, type ReportDef } from "@/domain/selectors/reports";
import { useApp } from "@/store";
import { fmtDate, fmtDateTime } from "@/lib/dates";

import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState, QuickTabs, Section } from "@/components/shared/page";
import { StatusChip } from "@/components/shared/status-chip";
import { Amount } from "@/components/shared/amount";
import { Mono, countCol, moneyCol, pct, Totals } from "./cells";
import { ReportFrame, usePageSize } from "./report-frame";
import type { ReportState } from "./use-report-params";

interface ViewProps {
  def: ReportDef;
  state: ReportState;
}

function GroupTable({ rows, label, currency, exportName }: { rows: ReceiptGroup[]; label: string; currency: string; exportName: string }) {
  const pageSize = usePageSize();
  const columns: Column<ReceiptGroup>[] = [
    {
      key: "label",
      header: label,
      sort: (g) => g.label,
      csv: (g) => g.label,
      cell: (g) => <span className="text-ink">{g.label}</span>,
    },
    countCol<ReceiptGroup>("count", "Receipts", (g) => g.count),
    countCol<ReceiptGroup>("verified", "Verified", (g) => g.verified, "sm"),
    countCol<ReceiptGroup>("unverified", "Unverified", (g) => g.unverified, "sm"),
    moneyCol<ReceiptGroup>("amount", `Received (${currency})`, (g) => g.amount),
  ];
  return (
    <DataTable
      rows={rows}
      columns={columns}
      rowKey={(g) => g.key}
      exportName={exportName}
      initialSort={{ key: "amount", dir: "desc" }}
      pageSize={pageSize}
      dense
      empty={<EmptyState title="Nothing received in this period" />}
    />
  );
}

export function ReceiptsView({ def, state }: ViewProps) {
  const db = useApp((s) => s.db)!;
  const pageSize = usePageSize();
  const [by, setBy] = React.useState<"method" | "account">("method");
  const r = React.useMemo(() => receiptsReport(db, state.params), [db, state.params]);
  const c = r.currency;
  const columns: Column<ReceiptRow>[] = [
    {
      key: "number",
      header: "Receipt",
      sort: (x) => x.payment.number,
      csv: (x) => x.payment.number,
      cell: (x) => (
        <span className="block leading-tight">
          <Mono className="block font-semibold">{x.payment.number}</Mono>
          <span className="tnum block text-xs text-ink-4">{fmtDateTime(x.payment.receivedAt)}</span>
        </span>
      ),
    },
    {
      key: "client",
      header: "Client",
      sort: (x) => x.client?.name,
      csv: (x) => x.client?.name,
      className: "max-w-[220px]",
      cell: (x) => <span className="block truncate text-ink">{x.client?.name ?? "—"}</span>,
    },
    {
      key: "method",
      header: "Method",
      sort: (x) => x.payment.method,
      csv: (x) => METHOD_LABELS[x.payment.method],
      hideBelow: "sm",
      cell: (x) => <span className="text-ink-2">{METHOD_LABELS[x.payment.method]}</span>,
    },
    {
      key: "account",
      header: "Account",
      sort: (x) => x.account?.name,
      csv: (x) => x.account?.name,
      hideBelow: "xl",
      cell: (x) => <span className="text-ink-2">{x.account?.name ?? "—"}</span>,
    },
    {
      key: "ref",
      header: "Reference",
      sort: (x) => x.payment.reference,
      csv: (x) => x.payment.reference,
      hideBelow: "2xl",
      cell: (x) => (x.payment.reference ? <Mono className="text-ink-2">{x.payment.reference}</Mono> : <span className="text-ink-4">—</span>),
    },
    {
      key: "status",
      header: "Status",
      sort: (x) => x.payment.status,
      csv: (x) => x.payment.status,
      hideBelow: "md",
      cell: (x) => <StatusChip status={`payment.${x.payment.status}`} size="xs" />,
    },
    {
      key: "by",
      header: "Recorded by",
      sort: (x) => x.recordedBy?.name,
      csv: (x) => x.recordedBy?.name,
      hideBelow: "2xl",
      cell: (x) => <span className="text-[13px] text-ink-2">{x.recordedBy?.name ?? "—"}</span>,
    },
    moneyCol<ReceiptRow>("amount", "Amount", (x) => x.amount, {
      mixed: true,
      rate: db.settings.fx.USD_TZS,
    }),
  ];
  return (
    <ReportFrame def={def} state={state} result={r}>
      <Section
        id="receipts-breakdown"
        title="Totals"
        actions={
          <QuickTabs
            controls="receipts-breakdown"
            value={by}
            onChange={setBy}
            className="no-print"
            options={[
              { value: "method", label: "By method", count: r.byMethod.length },
              {
                value: "account",
                label: "By account",
                count: r.byAccount.length,
              },
            ]}
          />
        }
        description="Reversed receipts are counted but not added to the amount."
      >
        <GroupTable rows={by === "method" ? r.byMethod : r.byAccount} label={by === "method" ? "Method" : "Account"} currency={c} exportName={`receipts-by-${by}`} />
      </Section>
      <Section title="Receipts" count={r.rows.length}>
        <DataTable
          rows={r.rows}
          columns={columns}
          rowKey={(x) => x.id}
          rowHref={(x) => `/payments?tab=received&open=${x.payment.id}`}
          search={(x) => [x.payment.number, x.client?.name, x.payment.reference, x.account?.name, METHOD_LABELS[x.payment.method]].filter(Boolean).join(" ")}
          searchPlaceholder="Search receipt, client, reference"
          exportName="receipts"
          initialSort={{ key: "number", dir: "desc" }}
          pageSize={pageSize}
          rowClassName={(x) => (x.payment.status === "reversed" ? "text-ink-3" : undefined)}
          dense
          empty={<EmptyState title="Nothing received in this period" />}
          footer={r.rows.length && r.totals ? <Totals columns={columns} label={`Received (${c})`} values={{ amount: <Amount value={r.totals.amount} /> }} /> : undefined}
        />
      </Section>
    </ReportFrame>
  );
}

export function ExpensesView({ def, state }: ViewProps) {
  const db = useApp((s) => s.db)!;
  const pageSize = usePageSize();
  const r = React.useMemo(() => expensesReport(db, state.params), [db, state.params]);
  const c = r.currency;
  type Cat = ExpensesReport["byCategory"][number];
  const catCols: Column<Cat>[] = [
    {
      key: "label",
      header: "Category",
      sort: (g) => g.label,
      csv: (g) => g.label,
      cell: (g) => <span className="text-ink">{g.label}</span>,
    },
    countCol<Cat>("count", "Expenses", (g) => g.count, "sm"),
    moneyCol<Cat>("amount", `Spent (${c})`, (g) => g.amount),
    {
      key: "share",
      header: "Share",
      align: "right",
      sort: (g) => g.share,
      csv: (g) => (g.share * 100).toFixed(1),
      cell: (g) => <span className="tnum text-ink-2">{pct(g.share)}</span>,
    },
  ];
  const columns: Column<ExpenseRow>[] = [
    {
      key: "date",
      header: "Paid",
      sort: (x) => x.expense.paidAt,
      csv: (x) => x.expense.paidAt,
      cell: (x) => <span className="tnum whitespace-nowrap">{fmtDate(x.expense.paidAt)}</span>,
    },
    {
      key: "number",
      header: "Expense no.",
      sort: (x) => x.expense.number,
      csv: (x) => x.expense.number,
      hideBelow: "md",
      cell: (x) => <Mono>{x.expense.number}</Mono>,
    },
    {
      key: "category",
      header: "Category",
      sort: (x) => x.categoryLabel,
      csv: (x) => x.categoryLabel,
      cell: (x) => <span className="text-ink-2">{x.categoryLabel}</span>,
    },
    {
      key: "payee",
      header: "Payee",
      sort: (x) => x.expense.payee,
      csv: (x) => x.expense.payee,
      hideBelow: "sm",
      className: "max-w-[260px]",
      cell: (x) => (
        <span className="block min-w-0 leading-tight">
          <span className="block truncate text-ink">{x.expense.payee}</span>
          {x.expense.note && <span className="block truncate text-xs text-ink-3">{x.expense.note}</span>}
        </span>
      ),
    },
    {
      key: "account",
      header: "Paid from",
      sort: (x) => x.account?.name,
      csv: (x) => x.account?.name,
      hideBelow: "xl",
      cell: (x) => <span className="text-ink-2">{x.account?.name ?? "—"}</span>,
    },
    moneyCol<ExpenseRow>("amount", "Amount", (x) => x.amount, {
      mixed: true,
      rate: db.settings.fx.USD_TZS,
    }),
  ];
  return (
    <ReportFrame def={def} state={state} result={r}>
      <Section title="By category" count={r.byCategory.length}>
        <DataTable
          rows={r.byCategory}
          columns={catCols}
          rowKey={(g) => g.category}
          exportName="expenses-by-category"
          initialSort={{ key: "amount", dir: "desc" }}
          pageSize={pageSize}
          dense
          empty={<EmptyState title="No expenses in this period" />}
          footer={r.byCategory.length && r.totals ? <Totals columns={catCols} values={{ amount: <Amount value={r.totals.amount} /> }} /> : undefined}
        />
      </Section>
      <Section title="Expenses" count={r.rows.length}>
        <DataTable
          rows={r.rows}
          columns={columns}
          rowKey={(x) => x.id}
          search={(x) => [x.expense.number, x.expense.payee, x.categoryLabel, x.expense.note, x.account?.name].filter(Boolean).join(" ")}
          searchPlaceholder="Search payee, category, number"
          exportName="expenses"
          initialSort={{ key: "date", dir: "desc" }}
          pageSize={pageSize}
          dense
          empty={<EmptyState title="No expenses in this period" />}
        />
      </Section>
    </ReportFrame>
  );
}

type ExpensesReport = ReturnType<typeof expensesReport>;

const monthName = (ym: string) =>
  new Date(`${ym}-15T12:00:00Z`).toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

export function PnlView({ def, state }: ViewProps) {
  const db = useApp((s) => s.db)!;
  const pageSize = usePageSize();
  const r = React.useMemo(() => pnlReport(db, state.params), [db, state.params]);
  const c = r.currency;
  const t = r.totals!;
  const columns: Column<PnlRow>[] = [
    {
      key: "month",
      header: "Month",
      sort: (x) => x.month,
      csv: (x) => x.month,
      cell: (x) => <span className="whitespace-nowrap text-ink">{monthName(x.month)}</span>,
    },
    moneyCol<PnlRow>("serviceFees", "Service fees 4100", (x) => x.serviceFees, {
      hideBelow: "xl",
    }),
    moneyCol<PnlRow>("markup", "Markup 4200", (x) => x.markup, {
      hideBelow: "xl",
    }),
    moneyCol<PnlRow>("refundFees", "Refund fees 4300", (x) => x.refundFees, {
      hideBelow: "xl",
    }),
    moneyCol<PnlRow>("revenue", "Revenue", (x) => x.revenue),
    moneyCol<PnlRow>("expenses", "Expenses 5xxx", (x) => x.expenses, {
      hideBelow: "sm",
    }),
    moneyCol<PnlRow>("net", "Net", (x) => x.net, { tone: "auto" }),
  ];
  return (
    <ReportFrame def={def} state={state} result={{ ...r, notes: r.notes?.slice(1) }}>
      <p className="flex items-start gap-2 border-y border-rule py-2.5 text-sm text-ink-2">
        <Info className="mt-0.5 size-4 shrink-0 text-ink-3" aria-hidden />
        <span>
          <span className="font-semibold text-ink">Management view, not statutory accounts.</span> Revenue is service fees (4100), markup (4200) and refund and change fees (4300) from the ledger, less
          expenses (5xxx). VAT is excluded; amounts in {c}.
        </span>
      </p>
      <Section title="By month" count={r.rows.length}>
        <DataTable
          rows={r.rows}
          columns={columns}
          rowKey={(x) => x.id}
          exportName="profit-and-loss"
          initialSort={{ key: "month", dir: "asc" }}
          pageSize={pageSize}
          dense
          footer={
            r.rows.length ? (
              <Totals
                columns={columns}
                values={{
                  serviceFees: <Amount value={t.serviceFees} />,
                  markup: <Amount value={t.markup} />,
                  refundFees: <Amount value={t.refundFees} />,
                  revenue: <Amount value={t.revenue} />,
                  expenses: <Amount value={t.expenses} />,
                  net: <Amount value={t.net} tone="auto" />,
                }}
              />
            ) : undefined
          }
        />
      </Section>
      {r.expenseLines.length > 0 && (
        <Section title="Expenses by account" count={r.expenseLines.length}>
          <DataTable
            rows={r.expenseLines}
            columns={[
              {
                key: "code",
                header: "Account",
                sort: (x) => x.code,
                csv: (x) => `${x.code} ${x.label}`,
                cell: (x) => (
                  <span className="text-ink">
                    <Mono className="mr-2 text-ink-3">{x.code}</Mono>
                    {x.label}
                  </span>
                ),
              },
              moneyCol("amount", `Amount (${c})`, (x: (typeof r.expenseLines)[number]) => x.amount),
            ]}
            rowKey={(x) => x.code}
            exportName="pnl-expenses"
            pageSize={pageSize}
            dense
          />
        </Section>
      )}
    </ReportFrame>
  );
}
