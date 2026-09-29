"use client";

import * as React from "react";
import { CheckCircle2, Landmark, Plus, Trash2 } from "lucide-react";

import type { BankReconciliation, Currency, ID, MoneyAccount } from "@/domain/types";
import { can } from "@/domain/permissions";
import { completeReconciliation, discardReconciliation, saveReconciliation } from "@/domain/commands";
import { draftOf, entrySource, lastCompletedOf, reconciliationSummary, reconciliationsOf, type ReconItem, type StatementRow } from "@/domain/accounting";
import { useApp, useDispatch, useMe } from "@/store";
import { useNow } from "@/lib/use-now";
import { darToday, fmtDate, fmtDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Amount } from "@/components/shared/amount";
import { UserMark } from "@/components/shared/bits";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { DataTable, type Column } from "@/components/shared/data-table";
import { Banner, Field } from "@/components/shared/field";
import { MoneyInput } from "@/components/shared/money-input";
import { EmptyState, PageHeader, Section } from "@/components/shared/page";
import { StatusChip } from "@/components/shared/status-chip";
import { useSetParams } from "@/components/reports/use-report-params";
import { useSearchParams } from "next/navigation";
import { QuickExpenseDialog } from "./dialogs";
import { FormSelect, SourceLink, StatementTable } from "./shared";

const KIND_ORDER = { bank: 0, mobile_money: 1, card: 2, cash: 3 } as const;

/** Bank reconciliation: pick an account, enter the statement, tick what cleared, complete at a nil difference. */
export function ReconciliationView() {
  const db = useApp((s) => s.db)!;
  const sp = useSearchParams();
  const set = useSetParams();
  const accounts = Object.values(db.moneyAccounts)
    .filter((a) => a.kind !== "cash" && (a.active || db.ledger.some((e) => e.sub?.id === a.id)))
    .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.name.localeCompare(b.name));
  const raw = sp.get("account");
  const account = (raw && db.moneyAccounts[raw]) || accounts[0];
  const draft = account ? draftOf(db, account.id) : undefined;
  const last = account ? lastCompletedOf(db, account.id) : undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bank reconciliation"
        meta={
          account && (
            <>
              <span>{account.name}</span>
              <span aria-hidden>·</span>
              <span className="tnum">{last ? `Reconciled to ${fmtDate(last.statementDate)}` : "Never reconciled"}</span>
              {draft && (
                <>
                  <span aria-hidden>·</span>
                  <span>Draft in progress</span>
                </>
              )}
            </>
          )
        }
      />
      {!account ? (
        <EmptyState icon={Landmark} title="No bank or mobile-money accounts" body="A Manager adds them in Settings → Money accounts." />
      ) : (
        <Workspace key={`${account.id}:${draft?.id ?? "new"}:${last?.id ?? "none"}`} account={account} accounts={accounts} draft={draft} onAccount={(id) => set({ account: id })} />
      )}
      {account && <History account={account} />}
    </div>
  );
}

function Workspace({ account, accounts, draft, onAccount }: { account: MoneyAccount; accounts: MoneyAccount[]; draft?: BankReconciliation; onAccount: (id: ID) => void }) {
  const db = useApp((s) => s.db)!;
  const me = useMe();
  const now = useNow();
  const dispatch = useDispatch();
  const canRec = can(me, "bank.reconcile");
  const [statementDate, setStatementDate] = React.useState(draft?.statementDate ?? darToday(now));
  const [balance, setBalance] = React.useState<number | null>(draft ? draft.statementBalanceMinor : null);
  const [ticked, setTicked] = React.useState<Set<ID>>(() => new Set(draft?.clearedEntryIds ?? []));
  const [notes, setNotes] = React.useState(draft?.notes ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const [charge, setCharge] = React.useState(false);
  const [discarding, setDiscarding] = React.useState(false);
  const cur: Currency = account.currency;
  const t = (n: number) => ({ amountMinor: n, currency: cur });
  const s = React.useMemo(
    () =>
      reconciliationSummary(db, {
        accountId: account.id,
        statementDate: statementDate || darToday(now),
        statementBalanceMinor: balance ?? 0,
        clearedEntryIds: [...ticked],
        reconciliationId: draft?.id,
      })!,
    [db, account.id, statementDate, balance, ticked, draft?.id, now],
  );
  const ins = s.items.filter((i) => i.moneyIn > 0);
  const outs = s.items.filter((i) => i.moneyOut > 0);
  const toggle = (id: ID, on: boolean) =>
    setTicked((cur) => {
      const n = new Set(cur);
      if (on) n.add(id);
      else n.delete(id);
      return n;
    });
  const setMany = (ids: ID[], on: boolean) =>
    setTicked((cur) => {
      const n = new Set(cur);
      for (const id of ids) {
        if (on) n.add(id);
        else n.delete(id);
      }
      return n;
    });
  const payload = () => ({
    reconciliationId: draft?.id,
    moneyAccountId: account.id,
    statementDate,
    statementBalanceMinor: balance ?? 0,
    clearedEntryIds: s.items.filter((i) => i.cleared).map((i) => i.id),
    notes: notes.trim() || undefined,
  });
  const save = () => {
    setError(null);
    if (balance === null) return setError("Enter the closing balance shown on the statement.");
    dispatch(saveReconciliation, payload());
  };
  const complete = () => {
    setError(null);
    if (balance === null) return setError("Enter the closing balance shown on the statement.");
    const r = dispatch(completeReconciliation, payload(), { quietErrors: true, toast: `${account.name} reconciled to ${fmtDate(statementDate)}` });
    if (!r.ok) setError(r.error.message);
  };
  const diffOk = balance !== null && s.difference === 0;
  const brs: StatementRow[] = [
    { key: "bank", label: `Balance per statement at ${fmtDate(statementDate)}`, style: "line", values: [balance ?? 0], indent: 0 },
    { key: "dit", label: "Add deposits in transit", hint: `${ins.filter((i) => !i.cleared).length} items`, style: "line", values: [s.outstandingIn], indent: 1 },
    { key: "unp", label: "Less unpresented payments", hint: `${outs.filter((i) => !i.cleared).length} items`, style: "line", values: [-s.outstandingOut], indent: 1 },
    { key: "adj", label: "Adjusted bank balance", style: "subtotal", values: [s.adjustedBankBalance] },
    { key: "book", label: "Balance per cash book", style: "grand", values: [s.bookBalance] },
    { key: "chk", label: "Unexplained difference", style: "check", values: [s.adjustedBankBalance - s.bookBalance] },
  ];

  return (
    <>
      <Card className="block p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Account">
            <FormSelect label="Account" value={account.id} onChange={onAccount} options={accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.currency})` }))} />
          </Field>
          <Field label="Statement date" htmlFor="rec-date" required hint={s.lastCompleted ? `Last reconciled to ${fmtDate(s.lastCompleted.statementDate)}` : "First reconciliation of this account"}>
            <Input id="rec-date" type="date" value={statementDate} min={s.lastCompleted?.statementDate} onChange={(e) => setStatementDate(e.target.value)} className="tnum" />
          </Field>
          <Field label="Closing balance on the statement" htmlFor="rec-bal" required>
            <MoneyInput id="rec-bal" value={balance} onChange={setBalance} currency={cur} allowNegative placeholder="From the statement" />
          </Field>
          <Field label="Notes" htmlFor="rec-notes" optional>
            <Input id="rec-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Statement page, reference…" />
          </Field>
        </div>
      </Card>

      <dl className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5" aria-live="polite">
        {[
          { label: "Beginning balance", value: s.beginning, hint: s.lastCompleted ? "Last reconciled balance" : "Opening balance" },
          { label: "Cleared balance", value: s.clearedBalance, hint: `${s.clearedCount} items ticked` },
          { label: "Statement balance", value: balance, hint: `At ${fmtDate(statementDate)}` },
          {
            label: "Difference",
            value: balance === null ? null : s.difference,
            hint: diffOk ? "Ready to complete" : "Must be nil to complete",
            tone: balance === null ? undefined : diffOk ? "good" : "bad",
          },
          { label: "Book balance", value: s.bookBalance, hint: "Cash book at the statement date" },
        ].map((x, i) => (
          <Card key={x.label} className={cn("block p-4 sm:p-5", i === 4 && "col-span-2 lg:col-span-1")}>
            <dt className="text-[13px] font-medium text-ink-3 sm:text-sm">{x.label}</dt>
            <dd
              className={cn(
                "mt-2 text-lg leading-7 font-bold tracking-[-0.01em] sm:text-[22px]",
                x.tone === "bad" ? "text-[var(--st-red-fg)]" : x.tone === "good" ? "text-[var(--st-green-fg)]" : "text-ink",
              )}
            >
              {x.value === null ? <span className="text-ink-4">—</span> : <Amount value={t(x.value)} className="text-current" codeClassName="text-[0.6em] font-semibold" />}
            </dd>
            <dd className="mt-1 text-[13px] text-ink-3">
              {x.tone === "good" ? (
                <span className="inline-flex items-center gap-1 text-[var(--st-green-fg)]">
                  <CheckCircle2 className="size-3.5" aria-hidden /> {x.hint}
                </span>
              ) : (
                x.hint
              )}
            </dd>
          </Card>
        ))}
      </dl>

      {error && <Banner tone="error">{error}</Banner>}

      <div className="flex flex-wrap items-center gap-2">
        {canRec && (
          <>
            <Button onClick={complete}>
              <CheckCircle2 /> Complete reconciliation
            </Button>
            <Button variant="outline" onClick={save}>
              Save draft
            </Button>
            <Button variant="outline" onClick={() => setCharge(true)}>
              <Plus /> Add a bank charge
            </Button>
            {draft && (
              <Button variant="danger-ghost" onClick={() => setDiscarding(true)} className="sm:ml-auto">
                <Trash2 /> Discard draft
              </Button>
            )}
          </>
        )}
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <TickList title="Money in" hint="Receipts and transfers in" items={ins} side="in" currency={cur} onToggle={toggle} onMany={setMany} />
        <TickList title="Money out" hint="Payments, expenses, charges and transfers out" items={outs} side="out" currency={cur} onToggle={toggle} onMany={setMany} />
      </div>

      <Section title="Bank reconciliation statement" description={`${account.name} at ${fmtDate(statementDate)}: how the statement agrees with the cash book.`}>
        <div className="-mx-5 -mb-5 overflow-x-auto border-t border-rule">
          <StatementTable rows={brs} columns={[{ key: "a", label: "Amount", sub: cur }]} currency={cur} view={cur === "USD" ? "USD" : "TZS"} minWidth="min-w-[420px]" />
        </div>
      </Section>

      <QuickExpenseDialog
        open={charge}
        onOpenChange={setCharge}
        accountId={account.id}
        title="Add a bank charge"
        description="A charge on the statement that is not in the books yet. It is recorded as an expense (bank charges) paid from this account and ticked straight away."
        category="bank_charges"
        lockCategory
        payee={account.name}
        date={statementDate}
        submitLabel="Record bank charge"
        onRecorded={(expenseId) => {
          const e = useApp.getState().db?.ledger.find((x) => x.account === "1100" && x.ref.entity === "expense" && x.ref.id === expenseId && x.kind === "expense");
          if (e) toggle(e.id, true);
        }}
      />
      <ConfirmDialog
        open={discarding}
        onOpenChange={setDiscarding}
        title="Discard this draft?"
        confirmLabel="Discard draft"
        onConfirm={() => (draft ? dispatch(discardReconciliation, { reconciliationId: draft.id }).ok : false)}
      >
        <p className="text-sm text-ink-2">The statement balance and the {draft?.clearedEntryIds.length ?? 0} ticked items are dropped. Nothing in the books changes.</p>
      </ConfirmDialog>
    </>
  );
}

function TickList({
  title,
  hint,
  items,
  side,
  currency,
  onToggle,
  onMany,
}: {
  title: string;
  hint: string;
  items: ReconItem[];
  side: "in" | "out";
  currency: Currency;
  onToggle: (id: ID, on: boolean) => void;
  onMany: (ids: ID[], on: boolean) => void;
}) {
  const db = useApp((s) => s.db)!;
  const amount = (i: ReconItem) => (side === "in" ? i.moneyIn : i.moneyOut);
  const cleared = items.filter((i) => i.cleared);
  const allOn = items.length > 0 && cleared.length === items.length;
  const total = cleared.reduce((s, i) => s + amount(i), 0);
  return (
    <Section
      title={title}
      count={items.length}
      description={hint}
      actions={
        items.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              onMany(
                items.map((i) => i.id),
                !allOn,
              )
            }
          >
            {allOn ? "Untick all" : "Tick all"}
          </Button>
        )
      }
    >
      {items.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-3">Nothing {side === "in" ? "received" : "paid"} to tick up to the statement date.</p>
      ) : (
        <ul className="-mx-5 divide-y divide-rule border-y border-rule">
          {items.map((i) => {
            const src = entrySource(db, i);
            return (
              <li key={i.id} className={cn("transition-colors", i.cleared && "bg-band/50")}>
                <label className="flex cursor-pointer items-start gap-3 px-5 py-3 hover:bg-band-hover">
                  <Checkbox checked={i.cleared} onCheckedChange={(v) => onToggle(i.id, v === true)} className="mt-1" aria-label={`Cleared: ${i.memo}`} />
                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="block truncate text-sm text-ink" title={i.memo}>
                      {i.memo}
                    </span>
                    <span className="mt-0.5 flex flex-wrap items-baseline gap-x-2 text-[13px] text-ink-3">
                      <span className="tnum">{fmtDate(i.day)}</span>
                      <SourceLink src={src} />
                    </span>
                  </span>
                  <Amount value={{ amountMinor: amount(i), currency }} className={cn("shrink-0 pt-0.5 font-medium", i.cleared ? "text-ink" : "text-ink-2")} />
                </label>
              </li>
            );
          })}
        </ul>
      )}
      <div className="-mb-1 flex items-center justify-between pt-3 text-[13px] text-ink-3">
        <span className="tnum">
          {cleared.length} of {items.length} ticked
        </span>
        <span className="inline-flex items-center gap-1.5">
          Cleared <Amount value={{ amountMinor: total, currency }} className="font-semibold text-ink" />
        </span>
      </div>
    </Section>
  );
}

function History({ account }: { account: MoneyAccount }) {
  const db = useApp((s) => s.db)!;
  const rows = reconciliationsOf(db, account.id).filter((r) => r.status === "completed");
  const columns: Column<BankReconciliation>[] = [
    { key: "date", header: "Statement date", sort: (r) => r.statementDate, csv: (r) => r.statementDate, cell: (r) => <span className="tnum text-ink">{fmtDate(r.statementDate)}</span> },
    { key: "items", header: "Items cleared", align: "right", csv: (r) => r.clearedEntryIds.length, cell: (r) => <span className="tnum">{r.clearedEntryIds.length}</span> },
    { key: "notes", header: "Notes", hideBelow: "xl", csv: (r) => r.notes ?? "", cell: (r) => <span className="text-ink-3">{r.notes ?? ""}</span> },
    {
      key: "by",
      header: "Completed",
      csv: (r) => r.completedAt ?? "",
      cell: (r) => (
        <span className="inline-flex items-center gap-2 text-ink-2">
          <UserMark user={db.users[r.completedBy ?? ""]} /> <span className="tnum">{fmtDateTime(r.completedAt)}</span>
        </span>
      ),
    },
    { key: "status", header: "Status", mobile: false, cell: () => <StatusChip tone="green" label="Reconciled" size="xs" /> },
    {
      key: "bal",
      header: "Statement balance",
      align: "right",
      mobile: "aside",
      sort: (r) => r.statementBalanceMinor,
      csv: (r) => r.statementBalanceMinor / 100,
      cell: (r) => <Amount value={{ amountMinor: r.statementBalanceMinor, currency: account.currency }} className="font-medium text-ink" />,
    },
  ];
  return (
    <Section title="Completed reconciliations" count={rows.length} description={`${account.name}, newest first.`}>
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        exportName={`reconciliations-${account.name}`}
        initialSort={{ key: "date", dir: "desc" }}
        dense
        empty={<EmptyState title="No completed reconciliations yet" body="Complete one above and it is kept here as the record." />}
      />
    </Section>
  );
}
