"use client";

import * as React from "react";
import { ArrowDownToLine, HandCoins, Plus, Printer } from "lucide-react";

import type { Currency, ID } from "@/domain/types";
import { can } from "@/domain/permissions";
import { recordCashCount } from "@/domain/commands";
import { EXPENSE_CATEGORY_LABELS } from "@/domain/ledger/accounts";
import { PETTY_ROW_LABELS, defaultPettyCashAccount, pettyCashAccounts, pettyCashBook, type PettyRow } from "@/domain/accounting";
import { format } from "@/domain/money";
import { useApp, useDispatch, useMe } from "@/store";
import { fmtDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Amount } from "@/components/shared/amount";
import { Code } from "@/components/shared/bits";
import { DataTable, TotalsRow, type Column } from "@/components/shared/data-table";
import { Banner } from "@/components/shared/field";
import { FilterSelect } from "@/components/shared/filter-select";
import { MoneyInput } from "@/components/shared/money-input";
import { EmptyState, PageHeader, Section, StatCard } from "@/components/shared/page";
import { StatusChip } from "@/components/shared/status-chip";
import { QuickExpenseDialog, TransferDialog, type TransferDefaults } from "./dialogs";
import { Letterhead, PeriodPicker, periodSentence, useAcctParams, usePrinting } from "./shared";

const DENOMS: Record<Currency, number[]> = {
  TZS: [10_000, 5_000, 2_000, 1_000, 500, 200, 100, 50],
  USD: [100, 50, 20, 10, 5, 1],
};

type BookLine = PettyRow & { bf?: boolean };

/** Petty cash book (imprest): float, top-ups, vouchers, running balance, analysis and the cash count. */
export function PettyCashView() {
  const db = useApp((s) => s.db)!;
  const me = useMe();
  const p = useAcctParams({ period: "month" });
  const [printing, print] = usePrinting();
  const accounts = pettyCashAccounts(db);
  const raw = p.sp.get("account");
  const account = (raw && db.moneyAccounts[raw]?.kind === "cash" ? db.moneyAccounts[raw] : undefined) ?? defaultPettyCashAccount(db);
  const [voucher, setVoucher] = React.useState(false);
  const [topUp, setTopUp] = React.useState<TransferDefaults | null>(null);
  const book = React.useMemo(() => (account ? pettyCashBook(db, { accountId: account.id, from: p.period.from, to: p.period.to, today: p.today }) : null), [db, account, p.period, p.today]);
  if (!account || !book)
    return (
      <>
        <PageHeader title="Petty cash" />
        <EmptyState icon={HandCoins} title="No cash account" body="A Manager adds a cash box in Settings → Money accounts; its opening balance becomes the petty cash float." />
      </>
    );
  const cur = account.currency;
  const t = (n: number) => ({ amountMinor: n, currency: cur });
  const canRecord = can(me, "pettycash.record") && can(me, "expense.record");
  const bank = Object.values(db.moneyAccounts).find((a) => a.active && a.kind === "bank" && a.currency === cur);
  const lines: BookLine[] = [{ id: "bf", day: p.period.from, at: "", type: "other", details: "Balance brought forward", received: 0, paid: 0, balance: book.opening, bf: true }, ...book.rows];

  const columns: Column<BookLine>[] = [
    { key: "day", header: "Date", csv: (r) => r.day, cell: (r) => <span className="tnum whitespace-nowrap text-ink-2">{fmtDate(r.day)}</span> },
    {
      key: "details",
      header: "Details",
      mobile: "title",
      csv: (r) => r.details,
      className: "w-full max-w-0",
      cell: (r) =>
        r.bf ? (
          <span className="font-medium text-ink">Balance brought forward</span>
        ) : (
          <span className="block min-w-0 leading-tight">
            <span className={cn("block truncate text-ink", r.type === "voucher_cancelled" && "text-ink-3 line-through")} title={r.details}>
              {r.details}
            </span>
            <span className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-[13px] text-ink-3">
              <span>{PETTY_ROW_LABELS[r.type]}</span>
              {r.number && <Code className="text-[12.5px] text-ink-2">{r.number}</Code>}
              {r.category && <span>· {EXPENSE_CATEGORY_LABELS[r.category]}</span>}
            </span>
          </span>
        ),
    },
    { key: "no", header: "Voucher no.", hidden: true, csv: (r) => r.number ?? "", cell: () => null },
    { key: "received", header: "Received", align: "right", csv: (r) => (r.received ? r.received / 100 : ""), cell: (r) => (r.received ? <Amount value={t(r.received)} /> : null) },
    { key: "paid", header: "Paid", align: "right", csv: (r) => (r.paid ? r.paid / 100 : ""), cell: (r) => (r.paid ? <Amount value={t(r.paid)} /> : null) },
    {
      key: "balance",
      header: "Balance",
      align: "right",
      mobile: "aside",
      csv: (r) => r.balance / 100,
      cell: (r) => <Amount value={t(r.balance)} tone="auto" className={cn(r.bf && "font-semibold")} />,
    },
  ];

  return (
    <div data-print-report className="space-y-6">
      <div className="hidden print:block">
        <Letterhead title={`Petty cash book: ${account.name}`} periodText={periodSentence(p.period, p.today)} view={cur === "USD" ? "USD" : "TZS"} />
      </div>
      <PageHeader
        className="no-print"
        title="Petty cash"
        meta={
          <>
            <span>{account.name}</span>
            <span aria-hidden>·</span>
            <span className="tnum">{periodSentence(p.period, p.today)}</span>
          </>
        }
        actions={
          <>
            <Button variant="outline" size="sm" onClick={print}>
              <Printer /> Print
            </Button>
            {canRecord && (
              <>
                <Button variant="outline" onClick={() => setTopUp({ fromId: bank?.id, toId: account.id, amountMinor: book.topUpToFloat, memo: `Petty cash top-up: ${account.name}` })}>
                  <ArrowDownToLine /> Top up
                </Button>
                <Button onClick={() => setVoucher(true)}>
                  <Plus /> New voucher
                </Button>
              </>
            )}
          </>
        }
      />
      <div className="no-print -mt-2 flex flex-wrap items-center gap-2">
        {accounts.length > 1 && (
          <FilterSelect
            label="Cash account"
            value={account.id}
            unset="__never"
            onChange={(v) => p.set({ account: v })}
            options={accounts.map((a) => ({ value: a.id, label: `${a.name}${a.active ? "" : " (inactive)"}` }))}
          />
        )}
        <PeriodPicker p={p} presets={["month", "last_month", "quarter", "year"]} />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard label="Float" value={t(book.float)} footer="The imprest: opening balance in Settings" />
        <StatCard
          label="Cash in the box"
          value={t(book.balanceToday)}
          tone={book.balanceToday < 0 ? "bad" : book.balanceToday < book.float * 0.25 ? "warn" : "default"}
          footer={book.topUpToFloat ? `${format(t(book.topUpToFloat))} tops it up to the float` : "At or above the float"}
        />
        <StatCard label="Paid out" value={t(book.totals.vouchers)} footer={`${book.totals.voucherCount} vouchers in the period`} />
        <StatCard label="Topped up" value={t(book.totals.topUps)} footer="Transfers in from the bank" />
      </div>

      <div className="grid grid-cols-1 items-start gap-6 2xl:grid-cols-3">
        <Section title="Petty cash book" count={book.rows.length} className="2xl:col-span-2" description="Every movement of the box with the running balance.">
          <DataTable
            rows={lines}
            columns={columns}
            rowKey={(r) => r.id}
            search={(r) => [r.details, r.number ?? "", PETTY_ROW_LABELS[r.type]].join(" ")}
            searchPlaceholder="Search details or voucher no."
            exportName={`petty-cash-${p.period.from}-${p.period.to}`}
            pageSize={printing ? 100_000 : 25}
            dense
            rowClassName={(r) => (r.bf ? "bg-table-head/60" : undefined)}
            footer={
              <TotalsRow
                cells={[
                  { content: "Carried forward", colSpan: 2 },
                  { content: <Amount value={t(book.totals.received)} />, align: "right" },
                  { content: <Amount value={t(book.totals.paid)} />, align: "right" },
                  { content: <Amount value={t(book.closing)} tone="auto" />, align: "right" },
                ]}
              />
            }
          />
        </Section>
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2 2xl:grid-cols-1">
          {canRecord && <CashCount accountId={account.id} currency={cur} bookBalance={book.balanceToday} today={p.today} />}
          <Section title="Analysis by category" description="Vouchers in the period.">
            {book.byCategory.length ? (
              <ul className="-mx-5 -mb-5 divide-y divide-rule border-t border-rule">
                {book.byCategory.map((c) => (
                  <li key={c.category} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                    <span className="text-ink">
                      {c.label} <span className="tnum text-[13px] text-ink-4">× {c.count}</span>
                    </span>
                    <Amount value={t(c.amount)} className="font-medium text-ink" />
                  </li>
                ))}
                <li className="flex items-center justify-between gap-3 border-t-2 border-rule-2 bg-table-head px-5 py-2.5 text-sm font-semibold">
                  <span>Total vouchers</span>
                  <Amount value={t(book.totals.vouchers)} />
                </li>
              </ul>
            ) : (
              <p className="py-4 text-center text-sm text-ink-3">No vouchers in this period.</p>
            )}
          </Section>
        </div>
      </div>

      <QuickExpenseDialog
        open={voucher}
        onOpenChange={setVoucher}
        accountId={account.id}
        title="Petty cash voucher"
        description="Cash paid out of the box. It is recorded as an expense paid from this cash account and numbered in the expense series."
        category="transport"
        submitLabel="Record voucher"
      />
      <TransferDialog open={Boolean(topUp)} onOpenChange={(o) => !o && setTopUp(null)} defaults={topUp ?? undefined} />
    </div>
  );
}

/** Count the box by denomination (or type the total) and post any over or short. */
function CashCount({ accountId, currency, bookBalance, today }: { accountId: ID; currency: Currency; bookBalance: number; today: string }) {
  const dispatch = useDispatch();
  const [counts, setCounts] = React.useState<Record<number, string>>({});
  const [typed, setTyped] = React.useState<number | null>(null);
  const [note, setNote] = React.useState("");
  const denoms = DENOMS[currency];
  const fromNotes = denoms.reduce((s, d) => s + (Number(counts[d]) || 0) * d * 100, 0);
  const anyNotes = denoms.some((d) => Number(counts[d]) > 0);
  const counted = typed ?? (anyNotes ? fromNotes : null);
  const diff = counted === null ? null : counted - bookBalance;
  const t = (n: number) => ({ amountMinor: n, currency });
  const post = () => {
    if (counted === null) return;
    const r = dispatch(recordCashCount, { accountId, countedMinor: counted, date: today, note: note.trim() || undefined });
    if (r.ok) {
      setCounts({});
      setTyped(null);
      setNote("");
    }
  };
  return (
    <Section title="Cash count" description="Count the box and compare it with the book.">
      <div className="grid grid-cols-2 gap-x-3 gap-y-2">
        {denoms.map((d) => (
          <label key={d} className="flex items-center gap-2 text-sm">
            <span className="tnum w-16 shrink-0 text-right text-ink-2">{d.toLocaleString("en-US")}</span>
            <span className="text-ink-4" aria-hidden>
              ×
            </span>
            <Input
              type="number"
              inputMode="numeric"
              min={0}
              value={counts[d] ?? ""}
              onChange={(e) => {
                setTyped(null);
                setCounts((c) => ({ ...c, [d]: e.target.value }));
              }}
              aria-label={`Number of ${currency} ${d.toLocaleString("en-US")}`}
              className="tnum h-8 text-right"
              placeholder="0"
            />
          </label>
        ))}
      </div>
      <div className="mt-4 space-y-3">
        <div>
          <label htmlFor="cc-total" className="text-[13px] font-medium text-ink-3">
            Or enter the total counted
          </label>
          <MoneyInput id="cc-total" value={typed ?? (anyNotes ? fromNotes : null)} onChange={setTyped} currency={currency} className="mt-1" />
        </div>
        <dl className="space-y-1.5 rounded-lg bg-table-head px-3 py-2.5 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-ink-3">Book balance today</dt>
            <dd>
              <Amount value={t(bookBalance)} className="text-ink" />
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-ink-3">Counted</dt>
            <dd>{counted === null ? <span className="text-ink-4">—</span> : <Amount value={t(counted)} className="text-ink" />}</dd>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-rule-2 pt-1.5 font-semibold">
            <dt>Over or (short)</dt>
            <dd className="flex items-center gap-2">
              {diff !== null && <StatusChip size="xs" tone={diff === 0 ? "green" : diff < 0 ? "red" : "amber"} label={diff === 0 ? "Agrees" : diff < 0 ? "Short" : "Over"} />}
              {diff === null ? <span className="text-ink-4">—</span> : <Amount value={t(diff)} tone="auto" />}
            </dd>
          </div>
        </dl>
        {diff !== null && diff !== 0 && (
          <>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why, if known (e.g. change not returned)…" aria-label="Note on the difference" />
            <Banner tone={diff < 0 ? "warn" : "info"}>
              Posting makes the book agree with the box: {diff < 0 ? `a shortage of ${format(t(-diff))} goes to Other expenses (5900)` : `an overage of ${format(t(diff))} goes to Other income (4900)`}
              , as a petty cash journal.
            </Banner>
            <Button className="w-full" onClick={post}>
              Post the {diff < 0 ? "shortage" : "overage"}
            </Button>
          </>
        )}
      </div>
    </Section>
  );
}
