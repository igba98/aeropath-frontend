"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeftRight, ArrowRight, BookOpenCheck, FileSpreadsheet, HandCoins, Landmark, NotebookPen, Receipt, Scale, Wallet } from "lucide-react";

import type { JournalEntry } from "@/domain/types";
import { can } from "@/domain/permissions";
import { accountingOverview, journalTotal } from "@/domain/accounting";
import { useApp, useMe } from "@/store";
import { useModals } from "@/store/modals";
import { useNow } from "@/lib/use-now";
import { fmtDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Amount } from "@/components/shared/amount";
import { Code } from "@/components/shared/bits";
import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState, PageHeader, Section, StatCard } from "@/components/shared/page";
import { FxNote } from "@/components/shared/fx-note";
import { StatusChip } from "@/components/shared/status-chip";
import { JournalSheet } from "./journal-sheet";
import { JournalDetailSheet, SOURCE_LABEL, TransferDialog } from "./dialogs";
import { ledgerHref } from "./shared";

const tzs = (amountMinor: number) => ({ amountMinor, currency: "TZS" as const });

/** Accounting home: the key balances, quick actions, recent journals and where each bank account is reconciled to. */
export function AccountingOverview() {
  const me = useMe();
  const db = useApp((s) => s.db)!;
  const now = useNow();
  const openExpense = useModals((s) => s.openExpense);
  const o = React.useMemo(() => accountingOverview(db, now), [db, now]);
  const [journalOpen, setJournalOpen] = React.useState(false);
  const [transferOpen, setTransferOpen] = React.useState(false);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const canPost = can(me, "journal.post");
  const trend = o.profitLastMonth ? (o.profitMonth - o.profitLastMonth) / Math.abs(o.profitLastMonth) : null;

  const actions: { label: string; hint: string; icon: React.ComponentType<{ className?: string }>; onClick?: () => void; href?: string; show: boolean }[] = [
    { label: "New journal entry", hint: "Accruals, corrections, depreciation", icon: NotebookPen, onClick: () => setJournalOpen(true), show: canPost },
    { label: "Transfer money", hint: "Bank to cash box, M-Pesa float", icon: ArrowLeftRight, onClick: () => setTransferOpen(true), show: canPost },
    { label: "Record petty cash", hint: "Vouchers, top-ups, cash count", icon: HandCoins, href: "/accounting/petty-cash", show: can(me, "pettycash.record") },
    { label: "Reconcile a bank account", hint: "Tick items off the statement", icon: Landmark, href: "/accounting/reconciliation", show: can(me, "bank.reconcile") },
    { label: "Record expense", hint: "Rent, internet, GDS fees", icon: Receipt, onClick: openExpense, show: can(me, "expense.record") },
  ];

  const journalCols: Column<JournalEntry>[] = [
    {
      key: "date",
      header: "Date",
      cell: (j) => (
        <span className="block leading-tight whitespace-nowrap">
          <span className="tnum block text-ink">{fmtDate(j.date)}</span>
          <Code className="text-xs text-ink-4">{j.number}</Code>
        </span>
      ),
    },
    { key: "memo", header: "Narration", mobile: "title", cell: (j) => <span className={cn("line-clamp-2 text-ink", j.status === "reversed" && "text-ink-3 line-through")}>{j.memo}</span> },
    { key: "source", header: "Type", hideBelow: "xl", cell: (j) => <span className="text-ink-2">{SOURCE_LABEL[j.source]}</span> },
    { key: "amount", header: "Amount", align: "right", cell: (j) => <Amount value={{ amountMinor: journalTotal(j.lines), currency: j.currency }} className="font-medium text-ink" /> },
  ];

  return (
    <div className="space-y-6 lg:space-y-8">
      <PageHeader
        title="Accounting"
        meta={
          <>
            <span>Books in TZS, financial year January to December</span>
            {o.converted && (
              <>
                <span aria-hidden>·</span>
                <FxNote />
              </>
            )}
          </>
        }
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/accounting/balance-sheet">
                <Scale /> Balance sheet
              </Link>
            </Button>
            {canPost && (
              <Button onClick={() => setJournalOpen(true)}>
                <NotebookPen /> New journal entry
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-6">
        <div className="grid lg:col-span-2">
          <StatCard label="Cash and bank" icon={Wallet} value={tzs(o.cash)} href={ledgerHref({ account: "1100" })} footer="Every bank, mobile-money and cash account" />
        </div>
        <div className="grid lg:col-span-2">
          <StatCard label="Receivables" icon={BookOpenCheck} value={tzs(o.receivables)} href={ledgerHref({ account: "1200" })} footer="Clients who owe us, per the ledger" />
        </div>
        <div className="grid lg:col-span-2">
          <StatCard label="Payables" icon={FileSpreadsheet} value={tzs(o.payables)} href={ledgerHref({ account: "2100" })} footer="What we owe airlines and suppliers" />
        </div>
        <div className="grid lg:col-span-3">
          <StatCard label="VAT payable" icon={Receipt} value={tzs(o.vatPayable)} href="/accounting/vat" footer="Balance on 2300, due to TRA by the 20th of next month" />
        </div>
        <div className="col-span-2 grid lg:col-span-3">
          <StatCard
            label="Profit this month"
            icon={Scale}
            value={tzs(o.profitMonth)}
            tone={o.profitMonth < 0 ? "bad" : "default"}
            trend={trend}
            trendLabel="vs the same days last month"
            href="/accounting/profit-and-loss"
          />
        </div>
      </div>

      <Section title="Quick actions">
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {actions
            .filter((a) => a.show)
            .map((a) => {
              const inner = (
                <>
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-band text-brand-700 dark:text-brand-300">
                    <a.icon className="size-[18px]" />
                  </span>
                  <span className="min-w-0 text-left">
                    <span className="block text-sm font-semibold text-ink">{a.label}</span>
                    <span className="block text-[13px] leading-5 text-ink-3">{a.hint}</span>
                  </span>
                </>
              );
              const cls =
                "flex h-full w-full items-center gap-3 rounded-lg border border-rule bg-paper p-3 transition-colors hover:border-rule-2 hover:bg-band-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";
              return (
                <li key={a.label}>
                  {a.href ? (
                    <Link href={a.href} className={cls}>
                      {inner}
                    </Link>
                  ) : (
                    <button type="button" onClick={a.onClick} className={cls}>
                      {inner}
                    </button>
                  )}
                </li>
              );
            })}
        </ul>
      </Section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Section
          title="Recent journals"
          count={Object.keys(db.journals ?? {}).length}
          className="xl:col-span-2"
          actions={
            <Button variant="ghost" size="sm" asChild>
              <Link href="/accounting/journals">
                All journals <ArrowRight />
              </Link>
            </Button>
          }
        >
          <DataTable
            rows={o.recentJournals}
            columns={journalCols}
            rowKey={(j) => j.id}
            onRowClick={(j) => setOpenId(j.id)}
            dense
            empty={
              <EmptyState
                icon={NotebookPen}
                title="No journals yet"
                body="Post accruals, depreciation and corrections as journal vouchers. Transfers between accounts land here too."
                action={canPost && <Button onClick={() => setJournalOpen(true)}>New journal entry</Button>}
                className="py-8"
              />
            }
          />
        </Section>

        <Section title="Bank reconciliation" description="Where each account is reconciled to.">
          <ul className="-mx-5 -mb-5 divide-y divide-rule border-t border-rule">
            {o.reconciliations
              .filter((r) => r.account.kind !== "cash")
              .map((r) => (
                <li key={r.account.id}>
                  <Link href={`/accounting/reconciliation?account=${r.account.id}`} className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-band-hover">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink">{r.account.name}</span>
                      <span className="block text-[13px] text-ink-3">
                        {r.lastCompleted ? `Reconciled to ${fmtDate(r.lastCompleted.statementDate)}` : "Never reconciled"} · {r.uncleared} uncleared
                      </span>
                    </span>
                    {r.draft ? (
                      <StatusChip tone="blue" label="In progress" size="xs" />
                    ) : r.lastCompleted ? (
                      <StatusChip tone={r.uncleared > 15 ? "amber" : "green"} label={r.uncleared > 15 ? "Due" : "Up to date"} size="xs" />
                    ) : (
                      <StatusChip tone="amber" label="Not started" size="xs" />
                    )}
                  </Link>
                </li>
              ))}
          </ul>
        </Section>
      </div>

      <Section title="Statements and books">
        <ul className="grid grid-cols-1 gap-x-6 sm:grid-cols-2 xl:grid-cols-3">
          {[
            { href: "/accounting/trial-balance", title: "Trial balance", body: "Every account's debit or credit balance; proves the books agree." },
            { href: "/accounting/profit-and-loss", title: "Profit or loss", body: "Revenue, operating expenses and profit before tax, with the previous period." },
            { href: "/accounting/balance-sheet", title: "Balance sheet", body: "Statement of financial position under IFRS for SMEs." },
            { href: "/accounting/vat", title: "VAT return", body: "Output and input tax for the month, laid out like the TRA return." },
            { href: "/accounting/ledger", title: "General ledger", body: "Every posting to an account with a running balance." },
            { href: "/accounting/accounts", title: "Chart of accounts", body: "The accounts by class, with their balances today." },
          ].map((l) => (
            <li key={l.href} className="border-b border-rule last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0 xl:[&:nth-last-child(-n+3)]:border-b-0">
              <Link href={l.href} className="group flex items-start justify-between gap-3 py-3">
                <span>
                  <span className="block text-sm font-semibold text-ink group-hover:underline">{l.title}</span>
                  <span className="block text-[13px] leading-5 text-ink-3">{l.body}</span>
                </span>
                <ArrowRight className="mt-0.5 size-4 shrink-0 text-ink-4 group-hover:text-ink" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      <JournalSheet open={journalOpen} onOpenChange={setJournalOpen} onPosted={setOpenId} />
      <TransferDialog open={transferOpen} onOpenChange={setTransferOpen} />
      <JournalDetailSheet journalId={openId} onOpenChange={(o) => !o && setOpenId(null)} />
    </div>
  );
}
