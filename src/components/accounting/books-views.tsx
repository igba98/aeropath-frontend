"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeftRight, ChevronRight, Download, NotebookPen, Plus, Printer, Scale } from "lucide-react";

import type { AccountCode, Currency, JournalEntry } from "@/domain/types";
import { ACCOUNTS, type AccountKind } from "@/domain/ledger/accounts";
import { can } from "@/domain/permissions";
import { ACCOUNT_LIST, SUBLEDGER_LABEL, entrySource, fyStart, generalLedger, isDebitNormal, journalTotal, subName, trialBalance, type GlRow } from "@/domain/accounting";
import { useApp, useMe } from "@/store";
import { fmtDate } from "@/lib/dates";
import { downloadCsv } from "@/lib/csv";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Amount } from "@/components/shared/amount";
import { Code, UserMark } from "@/components/shared/bits";
import { DataTable, TotalsRow, type Column } from "@/components/shared/data-table";
import { EmptyState, PageHeader, QuickTabs, Section } from "@/components/shared/page";
import { FxNote } from "@/components/shared/fx-note";
import { StatusChip } from "@/components/shared/status-chip";
import { JournalSheet } from "./journal-sheet";
import { JournalDetailSheet, SOURCE_LABEL, TransferDialog } from "./dialogs";
import { AccountSelect, KIND_LABEL, SubSelect } from "./pickers";
import { Letterhead, PeriodPicker, SourceLink, ViewSwitch, ledgerHref, longDate, periodSentence, useAcctParams, usePrinting } from "./shared";

/** A balance with Dr or Cr after it, as ledgers print them. */
export function DrCr({ minor, currency, className }: { minor: number; currency: Currency; className?: string }) {
  if (minor === 0) return <span className={cn("tnum text-ink-4", className)}>–</span>;
  return (
    <span className={cn("inline-flex items-baseline gap-1 whitespace-nowrap", className)}>
      <Amount value={{ amountMinor: Math.abs(minor), currency }} />
      <span className="text-[11px] font-semibold tracking-wide text-ink-3">{minor > 0 ? "Dr" : "Cr"}</span>
    </span>
  );
}

// ───────────────────────────── General ledger ─────────────────────────────

type GlLine = GlRow & { bf?: boolean };

export function GeneralLedgerView() {
  const db = useApp((s) => s.db)!;
  const [printing, print] = usePrinting();
  const pageSize = printing ? 100_000 : 25;
  const p = useAcctParams({ period: "month" });
  const raw = p.sp.get("account");
  const account: AccountCode = raw && ACCOUNTS[raw as AccountCode] ? (raw as AccountCode) : "1100";
  const def = ACCOUNTS[account];
  const subId = def.subledger ? (p.sp.get("sub") ?? "") : "";
  const gl = React.useMemo(() => generalLedger(db, { account, subId: subId || undefined, from: p.period.from, to: p.period.to, view: p.view }), [db, account, subId, p.period, p.view]);
  const cur = gl.currency;
  const t = (n: number) => ({ amountMinor: n, currency: cur });
  const lines: GlLine[] = [{ id: "bf", day: p.period.from, at: "", memo: "Balance brought forward", debit: 0, credit: 0, balance: gl.opening, bf: true }, ...gl.rows];

  const columns: Column<GlLine>[] = [
    { key: "day", header: "Date", csv: (r) => r.day, cell: (r) => <span className="tnum whitespace-nowrap text-ink-2">{fmtDate(r.day)}</span> },
    {
      key: "details",
      header: "Details",
      mobile: "title",
      csv: (r) => r.memo,
      className: "w-full max-w-0",
      cell: (r) =>
        r.bf ? (
          <span className="font-medium text-ink">Balance brought forward</span>
        ) : (
          <span className="block min-w-0 leading-tight">
            <span className="block truncate text-ink" title={r.memo}>
              {r.memo}
            </span>
            <span className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
              <SourceLink src={entrySource(db, r)} />
              {!subId && r.sub && <span className="text-[13px] text-ink-3">· {subName(db, r.sub)}</span>}
              {r.original && (
                <span className="text-[13px] text-ink-4">
                  · <Amount value={{ ...r.original, amountMinor: Math.abs(r.original.amountMinor) }} size="sm" className="text-ink-4" />
                </span>
              )}
            </span>
          </span>
        ),
    },
    { key: "debit", header: "Debit", align: "right", csv: (r) => (r.debit ? r.debit / 100 : ""), cell: (r) => (r.debit ? <Amount value={t(r.debit)} /> : null) },
    { key: "credit", header: "Credit", align: "right", csv: (r) => (r.credit ? r.credit / 100 : ""), cell: (r) => (r.credit ? <Amount value={t(r.credit)} /> : null) },
    { key: "balance", header: "Balance", align: "right", mobile: "aside", csv: (r) => r.balance / 100, cell: (r) => <DrCr minor={r.balance} currency={cur} className={cn(r.bf && "font-semibold")} /> },
  ];

  return (
    <div data-print-report className="space-y-6">
      <div className="hidden print:block">
        <Letterhead
          title={`General ledger: ${def.code} ${def.name}${subId ? ` · ${subName(db, { type: def.subledger!, id: subId })}` : ""}`}
          periodText={periodSentence(p.period, p.today)}
          view={p.view}
          converted={gl.converted}
          rate={gl.rate}
        />
      </div>
      <PageHeader
        className="no-print"
        title="General ledger"
        meta={
          <>
            <span className="tnum">{periodSentence(p.period, p.today)}</span>
            <span aria-hidden>·</span>
            <span>{p.view === "base" ? "In TZS" : `${p.view} books`}</span>
            {gl.converted && (
              <>
                <span aria-hidden>·</span>
                <FxNote rate={gl.rate} />
              </>
            )}
          </>
        }
        actions={
          <Button variant="outline" size="sm" onClick={print}>
            <Printer /> Print
          </Button>
        }
      />
      <div className="no-print -mt-2 flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-[340px]">
          <AccountSelect value={account} onChange={(c) => p.set({ account: c, sub: null })} />
        </div>
        {def.subledger && (
          <div className="w-full sm:w-[260px]">
            <SubSelect type={def.subledger} value={subId} onChange={(id) => p.set({ sub: id || null })} allowAll />
          </div>
        )}
        <PeriodPicker p={p} />
        <ViewSwitch p={p} />
      </div>

      <Card className="block p-5">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-[17px] leading-6 font-semibold text-ink">
              <span className="font-mono text-[15px] text-ink-3">{def.code}</span> {def.name}
            </p>
            <p className="mt-0.5 text-[13px] text-ink-3">
              {KIND_LABEL[def.kind]} · normal balance {isDebitNormal(def.code) ? "debit" : "credit"}
              {def.subledger && ` · kept by ${SUBLEDGER_LABEL[def.subledger].toLowerCase()}`}
              {subId && ` · ${subName(db, { type: def.subledger!, id: subId })}`}
            </p>
          </div>
          <dl className="grid w-full grid-cols-2 gap-x-6 gap-y-3 xl:w-auto xl:grid-cols-4">
            {[
              ["Brought forward", <DrCr key="o" minor={gl.opening} currency={cur} />],
              ["Debits", <Amount key="d" value={t(gl.totals.debit)} />],
              ["Credits", <Amount key="c" value={t(gl.totals.credit)} />],
              ["Carried forward", <DrCr key="cl" minor={gl.closing} currency={cur} className="font-semibold text-ink" />],
            ].map(([label, value]) => (
              <div key={label as string} className="min-w-0 xl:text-right">
                <dt className="text-[13px] font-medium text-ink-3">{label}</dt>
                <dd className="mt-0.5 text-[15px] text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Card>

      <Section title="Postings" count={gl.rows.length} description={`Newest last, with the running balance. ${periodSentence(p.period, p.today)}.`}>
        <DataTable
          rows={lines}
          columns={columns}
          rowKey={(r) => r.id}
          search={(r) => [r.memo, r.sub ? subName(db, r.sub) : "", entrySource(db, r).number ?? ""].join(" ")}
          searchPlaceholder="Search memo, document no., client"
          exportName={`ledger-${account}${subId ? `-${subId}` : ""}-${p.period.from}-${p.period.to}`}
          pageSize={pageSize}
          dense
          rowClassName={(r) => (r.bf ? "bg-table-head/60" : r.virtual ? "text-ink-3" : undefined)}
          footer={
            <TotalsRow
              cells={[
                { content: "Carried forward", colSpan: 2 },
                { content: <Amount value={t(gl.totals.debit)} />, align: "right" },
                { content: <Amount value={t(gl.totals.credit)} />, align: "right" },
                { content: <DrCr minor={gl.closing} currency={cur} />, align: "right" },
              ]}
            />
          }
          empty={<EmptyState title="No postings in this period" body="Widen the period or pick another account." />}
        />
      </Section>
    </div>
  );
}

// ───────────────────────────── Chart of accounts ─────────────────────────────

const CLASSES: { kind: AccountKind; title: string; description: string }[] = [
  { kind: "asset", title: "Assets", description: "1xxx · what the agency owns and is owed" },
  { kind: "liability", title: "Liabilities", description: "2xxx · what the agency owes" },
  { kind: "equity", title: "Equity", description: "3xxx · the owners' stake" },
  { kind: "revenue", title: "Income", description: "4xxx · the agency's own earnings, year to date" },
  { kind: "expense", title: "Expenses", description: "5xxx · running costs, year to date" },
];

interface CoaRow {
  code: AccountCode;
  name: string;
  subledger?: string;
  net: number;
}

export function ChartOfAccountsView() {
  const db = useApp((s) => s.db)!;
  const me = useMe();
  const p = useAcctParams();
  const [opening, setOpening] = React.useState(false);
  const [journal, setJournal] = React.useState(false);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const tb = React.useMemo(() => trialBalance(db, { from: fyStart(p.today), to: p.today, view: "base", includeZero: true }), [db, p.today]);
  const byCode = new Map(tb.rows.map((r) => [r.code, r.net]));
  const canPost = can(me, "journal.post");
  const columns: Column<CoaRow>[] = [
    { key: "code", header: "Code", width: "96px", sort: (r) => r.code, csv: (r) => r.code, cell: (r) => <Code className="text-ink-2">{r.code}</Code> },
    {
      key: "name",
      header: "Account",
      mobile: "title",
      sort: (r) => r.name,
      csv: (r) => r.name,
      cell: (r) => (
        <span className="block leading-tight">
          <span className="block text-ink">{r.name}</span>
          {r.subledger && <span className="block text-[13px] text-ink-3">By {r.subledger.toLowerCase()}</span>}
        </span>
      ),
    },
    {
      key: "normal",
      header: "Normal balance",
      hideBelow: "xl",
      csv: (r) => (isDebitNormal(r.code) ? "Debit" : "Credit"),
      cell: (r) => <span className="text-ink-3">{isDebitNormal(r.code) ? "Debit" : "Credit"}</span>,
    },
    { key: "balance", header: "Balance today", align: "right", sort: (r) => r.net, csv: (r) => r.net / 100, cell: (r) => <DrCr minor={r.net} currency="TZS" /> },
    { key: "go", header: <span className="sr-only">Open ledger</span>, width: "36px", mobile: false, cell: () => <ChevronRight className="size-4 text-ink-4" aria-hidden /> },
  ];
  return (
    <div className="space-y-6 lg:space-y-8">
      <PageHeader
        title="Chart of accounts"
        meta={
          <>
            <span className="tnum">Balances as at {longDate(p.today)}</span>
            <span aria-hidden>·</span>
            <span>In TZS</span>
            {tb.converted && (
              <>
                <span aria-hidden>·</span>
                <FxNote />
              </>
            )}
          </>
        }
        actions={
          <>
            <Button
              variant="outline"
              onClick={() =>
                downloadCsv(
                  `chart-of-accounts-${p.today}`,
                  ["Code", "Account", "Class", "Kept by", "Normal balance", "Balance today (TZS, debit positive)"],
                  ACCOUNT_LIST.map((a) => [
                    a.code,
                    a.name,
                    KIND_LABEL[a.kind],
                    a.subledger ? SUBLEDGER_LABEL[a.subledger] : "",
                    isDebitNormal(a.code) ? "Debit" : "Credit",
                    (byCode.get(a.code) ?? 0) / 100,
                  ]),
                )
              }
            >
              <Download /> Export CSV
            </Button>
            {canPost && (
              <>
                <Button variant="outline" onClick={() => setOpening(true)}>
                  <Scale /> Opening balances
                </Button>
                <Button onClick={() => setJournal(true)}>
                  <Plus /> New journal entry
                </Button>
              </>
            )}
          </>
        }
      />
      <p className="-mt-2 max-w-3xl text-sm text-ink-3">
        A Tanzanian SME chart laid out for IFRS for SMEs. Cash, clients and suppliers are control accounts: every posting names the money account, client or supplier. Click an account to open its
        ledger.
      </p>
      {CLASSES.map((c) => {
        const rows: CoaRow[] = ACCOUNT_LIST.filter((a) => a.kind === c.kind).map((a) => ({
          code: a.code,
          name: a.name,
          subledger: a.subledger ? SUBLEDGER_LABEL[a.subledger] : undefined,
          net: byCode.get(a.code) ?? 0,
        }));
        const total = rows.reduce((s, r) => s + r.net, 0);
        return (
          <Section key={c.kind} title={c.title} count={rows.length} description={c.description}>
            <DataTable
              rows={rows}
              columns={columns}
              rowKey={(r) => r.code}
              rowHref={(r) => ledgerHref({ account: r.code, from: fyStart(p.today), to: p.today })}
              dense
              footer={
                <TotalsRow
                  cells={[{ content: `Total ${c.title.toLowerCase()}`, colSpan: 2 }, { className: "hidden xl:table-cell" }, { content: <DrCr minor={total} currency="TZS" />, align: "right" }, {}]}
                />
              }
            />
          </Section>
        );
      })}
      <JournalSheet open={opening} onOpenChange={setOpening} mode="opening" onPosted={setOpenId} />
      <JournalSheet open={journal} onOpenChange={setJournal} onPosted={setOpenId} />
      <JournalDetailSheet journalId={openId} onOpenChange={(o) => !o && setOpenId(null)} />
    </div>
  );
}

// ───────────────────────────── Journals ─────────────────────────────

type JournalFilter = "all" | JournalEntry["source"] | "reversed";

export function JournalsView() {
  const db = useApp((s) => s.db)!;
  const me = useMe();
  const p = useAcctParams();
  const [filter, setFilter] = React.useState<JournalFilter>("all");
  const [newOpen, setNewOpen] = React.useState(false);
  const [openingOpen, setOpeningOpen] = React.useState(false);
  const [transferOpen, setTransferOpen] = React.useState(false);
  const openId = p.sp.get("open");
  const canPost = can(me, "journal.post");
  const all = React.useMemo(() => Object.values(db.journals ?? {}).sort((a, b) => b.date.localeCompare(a.date) || b.number.localeCompare(a.number)), [db.journals]);
  const count = (f: JournalFilter) => all.filter((j) => (f === "all" ? true : f === "reversed" ? j.status === "reversed" : j.source === f)).length;
  const rows = all.filter((j) => (filter === "all" ? true : filter === "reversed" ? j.status === "reversed" : j.source === filter));
  const accountsOf = (j: JournalEntry) => [...new Set(j.lines.map((l) => `${l.account} ${ACCOUNTS[l.account]?.name ?? ""}`))];

  const columns: Column<JournalEntry>[] = [
    {
      key: "date",
      header: "Date",
      sort: (j) => j.date + j.number,
      csv: (j) => j.date,
      cell: (j) => (
        <span className="block leading-tight whitespace-nowrap">
          <span className="tnum block text-ink">{fmtDate(j.date)}</span>
          <Code className="text-xs text-ink-4">{j.number}</Code>
        </span>
      ),
    },
    {
      key: "memo",
      header: "Narration",
      mobile: "title",
      sort: (j) => j.memo,
      csv: (j) => j.memo,
      className: "max-w-[420px]",
      cell: (j) => (
        <span className="block min-w-0 leading-tight">
          <span className={cn("block truncate text-ink", j.status === "reversed" && "text-ink-3 line-through")}>{j.memo}</span>
          <span className="block truncate text-[13px] text-ink-3">{accountsOf(j).join(" · ")}</span>
        </span>
      ),
    },
    { key: "number", header: "Number", hidden: true, csv: (j) => j.number, cell: () => null },
    { key: "source", header: "Type", hideBelow: "xl", sort: (j) => j.source, csv: (j) => SOURCE_LABEL[j.source], cell: (j) => <span className="text-ink-2">{SOURCE_LABEL[j.source]}</span> },
    { key: "by", header: "By", align: "center", hideBelow: "2xl", csv: (j) => db.users[j.createdBy]?.name, cell: (j) => <UserMark user={db.users[j.createdBy]} /> },
    {
      key: "status",
      header: "Status",
      sort: (j) => j.status,
      csv: (j) => j.status,
      cell: (j) => <StatusChip tone={j.status === "reversed" ? "grey" : "green"} label={j.status === "reversed" ? "Reversed" : "Posted"} size="xs" />,
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      sort: (j) => journalTotal(j.lines) * (j.currency === "USD" ? db.settings.fx.USD_TZS : 1),
      csv: (j) => `${j.currency} ${(journalTotal(j.lines) / 100).toFixed(2)}`,
      cell: (j) => <Amount value={{ amountMinor: journalTotal(j.lines), currency: j.currency }} className="font-medium text-ink" />,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Journal entries"
        meta={
          <>
            <span className="tnum">{all.filter((j) => j.status === "posted").length} posted</span>
            <span aria-hidden>·</span>
            <span className="tnum">{count("reversed")} reversed</span>
          </>
        }
        actions={
          canPost && (
            <>
              <Button variant="outline" onClick={() => setOpeningOpen(true)}>
                <Scale /> Opening balances
              </Button>
              <Button variant="outline" onClick={() => setTransferOpen(true)}>
                <ArrowLeftRight /> Transfer money
              </Button>
              <Button onClick={() => setNewOpen(true)}>
                <Plus /> New journal entry
              </Button>
            </>
          )
        }
      />
      <QuickTabs<JournalFilter>
        controls="journal-list"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: "All", count: count("all") },
          { value: "manual", label: "Manual", count: count("manual") },
          { value: "transfer", label: "Transfers", count: count("transfer") },
          { value: "petty_cash", label: "Petty cash", count: count("petty_cash") },
          { value: "opening_balance", label: "Opening balances", count: count("opening_balance") },
          { value: "reversed", label: "Reversed", count: count("reversed") },
        ]}
      />
      <DataTable
        id="journal-list"
        rows={rows}
        columns={columns}
        rowKey={(j) => j.id}
        onRowClick={(j) => p.set({ open: j.id })}
        selectedKey={openId ?? undefined}
        search={(j) => [j.number, j.memo, ...accountsOf(j), ...j.lines.map((l) => [l.memo, subName(db, l.sub)].join(" "))].join(" ")}
        searchPlaceholder="Search JV no., narration, account"
        exportName="journals"
        initialSort={{ key: "date", dir: "desc" }}
        empty={
          all.length ? (
            <EmptyState
              title="No journals of this kind"
              action={
                <Button variant="outline" size="sm" onClick={() => setFilter("all")}>
                  Show all journals
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={NotebookPen}
              title="No journal entries yet"
              body="Journals record what no other screen does: accruals, depreciation, loan interest, corrections and transfers between accounts."
              action={canPost && <Button onClick={() => setNewOpen(true)}>New journal entry</Button>}
            />
          )
        }
      />
      <p className="text-[13px] text-ink-3">
        Receipts, supplier payments, expenses and issued services post to the ledger by themselves; find them in the{" "}
        <Link href="/accounting/ledger" className="text-link hover:underline">
          general ledger
        </Link>
        .
      </p>
      <JournalSheet open={newOpen} onOpenChange={setNewOpen} onPosted={(id) => p.set({ open: id })} />
      <JournalSheet open={openingOpen} onOpenChange={setOpeningOpen} mode="opening" onPosted={(id) => p.set({ open: id })} />
      <TransferDialog open={transferOpen} onOpenChange={setTransferOpen} />
      <JournalDetailSheet journalId={openId} onOpenChange={(o) => !o && p.set({ open: null })} />
    </div>
  );
}
