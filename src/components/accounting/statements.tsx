"use client";

import * as React from "react";

import type { StatementRow } from "@/domain/accounting";
import { balanceSheet, comparativeOf, fyStart, profitAndLoss, statementCsvRows, trialBalance, vatReturn, type VatDocument, type VatReturn } from "@/domain/accounting";
import { useApp } from "@/store";
import { fmtDate } from "@/lib/dates";

import { Amount } from "@/components/shared/amount";
import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState, Section, Segmented } from "@/components/shared/page";
import { FilterSelect } from "@/components/shared/filter-select";
import { StatusChip } from "@/components/shared/status-chip";
import { FileNo } from "@/components/reports/cells";
import { AsAtPicker, BalanceChip, PeriodPicker, StatementFrame, StatementTable, ViewSwitch, longDate, periodLabel, periodSentence, useAcctPageSize, useAcctParams } from "./shared";

// ───────────────────────────── Trial balance ─────────────────────────────

export function TrialBalanceView() {
  const db = useApp((s) => s.db)!;
  const p = useAcctParams({ period: "year" });
  const mode = p.sp.get("mode") === "movements" ? "movements" : "balances";
  const to = mode === "movements" ? p.period.to : p.asAt;
  const from = mode === "movements" ? p.period.from : fyStart(p.asAt);
  const tb = React.useMemo(() => trialBalance(db, { from, to, view: p.view }), [db, from, to, p.view]);
  const cur = tb.currency;
  const rows: StatementRow[] = tb.rows.map((r) => ({
    key: r.code,
    code: r.code,
    label: r.name,
    style: "line",
    values: mode === "movements" ? [r.periodDebit, r.periodCredit, r.net] : [r.debit, r.credit],
    drill: { kind: "ledger", account: r.code, from, to },
  }));
  if (tb.rounding !== 0)
    rows.push({ key: "rounding", label: "Currency conversion rounding", style: "line", values: mode === "movements" ? [0, 0, -tb.rounding] : [Math.max(-tb.rounding, 0), Math.max(tb.rounding, 0)] });
  rows.push({
    key: "total",
    label: "Total",
    style: "grand",
    values: mode === "movements" ? [tb.totals.periodDebit, tb.totals.periodCredit, 0] : [tb.totals.debit, tb.totals.credit],
  });
  const columns =
    mode === "movements"
      ? [
          { key: "d", label: "Debits", sub: `${cur} · in period` },
          { key: "c", label: "Credits", sub: `${cur} · in period` },
          { key: "n", label: "Balance at end", sub: "credits in brackets" },
        ]
      : [
          { key: "d", label: "Debit", sub: cur },
          { key: "c", label: "Credit", sub: cur },
        ];
  const ok = mode === "movements" ? tb.totals.periodDebit === tb.totals.periodCredit && tb.balanced : tb.balanced;
  const periodText = mode === "movements" ? periodSentence(p.period, p.today) : `As at ${longDate(p.asAt)}`;
  return (
    <StatementFrame
      pageTitle="Trial balance"
      title="Trial balance"
      periodText={periodText}
      view={p.view}
      converted={tb.converted}
      rate={tb.rate}
      status={<BalanceChip ok={ok} diff={tb.totals.debit - tb.totals.credit} currency={cur} okLabel="Debits equal credits" />}
      controls={
        <>
          <Segmented
            label="Trial balance view"
            value={mode}
            onChange={(v) => p.set({ mode: v === "balances" ? null : v })}
            options={[
              { value: "balances", label: "Balances" },
              { value: "movements", label: "Movements" },
            ]}
          />
          {mode === "movements" ? <PeriodPicker p={p} /> : <AsAtPicker p={p} compare={false} />}
          <ViewSwitch p={p} />
        </>
      }
      csv={{
        name: `trial-balance-${to}`,
        headers: mode === "movements" ? ["Code", "Account", "Debits", "Credits", "Balance at end"] : ["Code", "Account", "Debit", "Credit"],
        rows: () => statementCsvRows({ rows }),
      }}
      notes={[
        "Income and expense accounts show the financial year to date; profits of earlier years sit in 3200 Retained earnings.",
        "Money-account opening balances from Settings are included, against 3300 Opening balance equity.",
        "Click an account to open its general ledger.",
      ]}
    >
      {tb.rows.length ? (
        <StatementTable rows={rows} columns={columns} currency={cur} view={p.view} showCodes firstHeader="Account" minWidth={mode === "movements" ? "min-w-[680px]" : "min-w-[520px]"} />
      ) : (
        <EmptyState title="No postings yet" body="The trial balance fills as bookings are issued, payments recorded and journals posted." />
      )}
    </StatementFrame>
  );
}

// ───────────────────────────── Profit or loss ─────────────────────────────

export function ProfitAndLossView() {
  const db = useApp((s) => s.db)!;
  const p = useAcctParams({ period: "month" });
  const pnl = React.useMemo(() => profitAndLoss(db, { period: p.period, compare: p.cmpPrev ? comparativeOf(p.period) : undefined, view: p.view }), [db, p.period, p.cmpPrev, p.view]);
  const compare = pnl.periods[1];
  const cur = pnl.currency;
  const columns = [{ key: "cur", label: periodLabel(p.period), sub: cur }, ...(compare ? [{ key: "cmp", label: periodLabel(compare), sub: `${cur} · comparative` }] : [])];
  const margin = pnl.revenue[0] ? `${((pnl.profitBeforeTax[0] / pnl.revenue[0]) * 100).toFixed(1).replace("-", "−")}% of revenue` : undefined;
  return (
    <StatementFrame
      pageTitle="Profit or loss"
      title="Statement of profit or loss"
      periodText={periodSentence(p.period, p.today)}
      meta={
        margin && (
          <>
            <span aria-hidden>·</span>
            <span className="tnum">Profit before tax {margin}</span>
          </>
        )
      }
      view={p.view}
      converted={pnl.converted}
      rate={pnl.rate}
      controls={
        <>
          <PeriodPicker p={p} />
          <FilterSelect
            label="Comparative"
            value={p.cmpPrev ? "prev" : "none"}
            unset="__never"
            onChange={(v) => p.set({ cmp: v === "prev" ? null : "none" })}
            options={[
              { value: "prev", label: "With previous period" },
              { value: "none", label: "No comparative" },
            ]}
          />
          <ViewSwitch p={p} />
        </>
      }
      csv={{ name: `profit-or-loss-${p.period.from}-${p.period.to}`, headers: ["Code", "Line", ...columns.map((c) => `${c.label} (${cur})`)], rows: () => statementCsvRows(pnl) }}
      notes={pnl.notes}
    >
      <StatementTable rows={pnl.rows} columns={columns} currency={cur} view={p.view} compareFrom={1} />
    </StatementFrame>
  );
}

// ───────────────────────────── Balance sheet ─────────────────────────────

export function BalanceSheetView() {
  const db = useApp((s) => s.db)!;
  const p = useAcctParams();
  const bs = React.useMemo(() => balanceSheet(db, { asAt: p.asAt, compareAt: p.compareAt, view: p.view }), [db, p.asAt, p.compareAt, p.view]);
  const cur = bs.currency;
  const columns = bs.dates.map((d, i) => ({ key: d + i, label: fmtDate(d), sub: i ? `${cur} · comparative` : cur }));
  return (
    <StatementFrame
      pageTitle="Balance sheet"
      title="Statement of financial position"
      periodText={`As at ${longDate(p.asAt)}`}
      view={p.view}
      converted={bs.converted}
      rate={bs.rate}
      status={<BalanceChip ok={bs.balanced} diff={bs.difference[0]} currency={cur} okLabel="Assets equal equity and liabilities" />}
      controls={
        <>
          <AsAtPicker p={p} />
          <ViewSwitch p={p} />
        </>
      }
      csv={{ name: `balance-sheet-${p.asAt}`, headers: ["Code", "Line", ...bs.dates.map((d) => `${d} (${cur})`)], rows: () => statementCsvRows(bs) }}
      notes={bs.notes}
    >
      <StatementTable rows={bs.rows} columns={columns} currency={cur} view={p.view} compareFrom={1} />
    </StatementFrame>
  );
}

// ───────────────────────────── VAT return ─────────────────────────────

export function VatReturnView() {
  const db = useApp((s) => s.db)!;
  const p = useAcctParams({ period: "month" });
  const v = React.useMemo(() => vatReturn(db, p.period), [db, p.period]);
  const control: StatementRow[] = [
    { key: "o", label: `VAT payable at ${fmtDate(addDay(p.period.from, -1))}`, style: "line", values: [v.control.opening], indent: 0 },
    { key: "out", label: "Add output tax for the period", style: "line", values: [v.control.outputTax], indent: 0 },
    { key: "in", label: "Less input tax claimed", style: "line", values: [-v.control.inputTax], indent: 0 },
    { key: "pay", label: "Less payments to TRA", style: "line", values: [-v.control.paymentsToTra], indent: 0, hint: "Journals debiting VAT against a money account" },
    ...(v.control.otherAdjustments ? [{ key: "adj", label: "Other adjustments", style: "line" as const, values: [v.control.otherAdjustments], indent: 0 as const }] : []),
    { key: "c", label: `VAT payable at ${fmtDate(p.period.to)}`, style: "grand", values: [v.control.closing], drill: { kind: "ledger", account: "2300", from: p.period.from, to: p.period.to } },
    { key: "chk", label: "Difference from the ledger balance of 2300", style: "check", values: [v.control.closing - v.control.closingPerLedger] },
  ];
  return (
    <StatementFrame
      pageTitle="VAT return"
      title="VAT return"
      periodText={periodSentence(p.period, p.today)}
      meta={
        <>
          <span aria-hidden>·</span>
          <span className="tnum">Due {fmtDate(v.dueDate)}</span>
        </>
      }
      view="base"
      converted={v.converted}
      rate={v.rate}
      status={
        <StatusChip tone={v.netPayable > 0 ? "amber" : "green"} label={v.netPayable > 0 ? `Pay TRA TZS ${(v.netPayable / 100).toLocaleString("en-US")} by ${fmtDate(v.dueDate)}` : "Nothing to pay"} />
      }
      controls={<PeriodPicker p={p} presets={["month", "last_month", "quarter", "last_quarter"]} />}
      csv={{
        name: `vat-return-${p.period.from}-${p.period.to}`,
        headers: ["Line", "Description", "Value (TZS)", "VAT (TZS)"],
        rows: () => v.rows.map((r) => [r.style === "heading" ? "" : r.key, r.label, ...(r.values ?? []).map((x, i) => (r.blank?.includes(i) ? "" : x / 100))]),
      }}
      notes={v.notes}
      after={
        <>
          <Section title="VAT control account (2300)" description="Opening balance, the period's tax and payments, and the closing balance, agreed to the ledger.">
            <div className="-mx-5 -mb-5 overflow-x-auto border-t border-rule">
              <StatementTable rows={control} columns={[{ key: "a", label: "Amount", sub: "TZS" }]} currency="TZS" view="base" minWidth="min-w-[420px]" />
            </div>
          </Section>
          <Section title="Supplies in the return" count={v.documents.length} description="Each issued service or credit note that carried the agency's fee.">
            <VatDocuments v={v} from={p.period.from} />
          </Section>
        </>
      }
    >
      <StatementTable
        rows={v.rows}
        columns={[
          { key: "value", label: "Value", sub: "TZS" },
          { key: "vat", label: "VAT", sub: "TZS" },
        ]}
        currency="TZS"
        view="base"
      />
    </StatementFrame>
  );
}

/** The supplies behind a VAT return (all rows when printing). */
function VatDocuments({ v, from }: { v: VatReturn; from: string }) {
  const db = useApp((s) => s.db)!;
  const pageSize = useAcctPageSize();
  const t = (n: number) => ({ amountMinor: n, currency: "TZS" as const });
  const docCols: Column<VatDocument>[] = [
    { key: "day", header: "Date", sort: (d) => d.day, csv: (d) => d.day, cell: (d) => <span className="tnum whitespace-nowrap">{fmtDate(d.day)}</span> },
    {
      key: "memo",
      header: "Supply",
      mobile: "title",
      csv: (d) => d.memo,
      cell: (d) => (
        <span className="block min-w-0 leading-tight">
          <span className="block truncate text-ink">{d.memo}</span>
          <span className="text-[13px] text-ink-3">{d.kind === "credit_note" ? "Credit note" : "Tax invoice"}</span>
        </span>
      ),
    },
    {
      key: "file",
      header: "Booking",
      hideBelow: "xl",
      csv: (d) => (d.fileId ? db.files[d.fileId]?.number : ""),
      cell: (d) => (d.fileId && db.files[d.fileId] ? <FileNo id={d.fileId} number={db.files[d.fileId].number} /> : null),
    },
    { key: "cur", header: "Billed in", hideBelow: "2xl", csv: (d) => d.currency, cell: (d) => <span className="text-ink-3">{d.currency}</span> },
    { key: "value", header: "Taxable value", align: "right", sort: (d) => d.value, csv: (d) => d.value / 100, cell: (d) => <Amount value={t(d.value)} /> },
    { key: "vat", header: "VAT", align: "right", mobile: "aside", sort: (d) => d.vat, csv: (d) => d.vat / 100, cell: (d) => <Amount value={t(d.vat)} className="font-medium text-ink" /> },
  ];
  return (
    <DataTable
      rows={v.documents}
      columns={docCols}
      rowKey={(d) => d.groupId}
      rowHref={(d) => (d.fileId ? `/bookings/${d.fileId}` : undefined)}
      search={(d) => [d.memo, d.fileId ? db.files[d.fileId]?.number : ""].join(" ")}
      searchPlaceholder="Search supplies"
      exportName={`vat-supplies-${from}`}
      initialSort={{ key: "day", dir: "asc" }}
      pageSize={pageSize}
      dense
      empty={<EmptyState title="No taxable supplies in this period" body="Issued services with a service fee show here with their VAT." />}
    />
  );
}

function addDay(d: string, n: number): string {
  return new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}
