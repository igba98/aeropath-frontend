"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Undo2 } from "lucide-react";

import type { ExpenseCategory, ID, ISODate } from "@/domain/types";
import { ACCOUNTS } from "@/domain/ledger/accounts";
import { can } from "@/domain/permissions";
import { recordExpense, reverseJournal, transferMoney } from "@/domain/commands";
import { bookBalanceAt, journalTotal, subName } from "@/domain/accounting";
import { format } from "@/domain/money";
import { EXPENSE_CATEGORIES } from "@/store/seed/reference";
import { useApp, useDispatch, useMe } from "@/store";
import { darToday, fmtDate, fmtDateTime } from "@/lib/dates";

import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Amount } from "@/components/shared/amount";
import { Code, UserMark } from "@/components/shared/bits";
import { ConfirmDialog, Consequences } from "@/components/shared/confirm-dialog";
import { Banner, Field, FieldGrid } from "@/components/shared/field";
import { MoneyInput } from "@/components/shared/money-input";
import { StatusChip } from "@/components/shared/status-chip";
import { FormSelect, ledgerHref } from "./shared";

// ───────────────────────────── Transfer ─────────────────────────────

export interface TransferDefaults {
  fromId?: ID;
  toId?: ID;
  amountMinor?: number;
  memo?: string;
}

/** Move money between two accounts of the same currency (petty cash top-up, banking cash, M-Pesa float). */
export function TransferDialog({ open, onOpenChange, defaults }: { open: boolean; onOpenChange: (o: boolean) => void; defaults?: TransferDefaults }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">{open && <TransferForm defaults={defaults} onDone={() => onOpenChange(false)} />}</DialogContent>
    </Dialog>
  );
}

function TransferForm({ defaults, onDone }: { defaults?: TransferDefaults; onDone: () => void }) {
  const db = useApp((s) => s.db)!;
  const dispatch = useDispatch();
  const today = darToday();
  const accounts = Object.values(db.moneyAccounts)
    .filter((a) => a.active)
    .sort((a, b) => a.name.localeCompare(b.name));
  const [fromId, setFromId] = React.useState<ID | undefined>(defaults?.fromId ?? accounts.find((a) => a.kind === "bank" && a.currency === "TZS")?.id);
  const from = fromId ? db.moneyAccounts[fromId] : undefined;
  const targets = accounts.filter((a) => a.id !== fromId && (!from || a.currency === from.currency));
  const [pickedTo, setToId] = React.useState<ID | undefined>(defaults?.toId);
  const toId = pickedTo && targets.some((a) => a.id === pickedTo) ? pickedTo : undefined;
  const to = toId ? db.moneyAccounts[toId] : undefined;
  const [amount, setAmount] = React.useState<number | null>(defaults?.amountMinor || null);
  const [date, setDate] = React.useState<ISODate>(today);
  const [memo, setMemo] = React.useState(defaults?.memo ?? "");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const cur = from?.currency ?? "TZS";
  const fromBal = from ? bookBalanceAt(db, from.id, date || today) : 0;
  const toBal = to ? bookBalanceAt(db, to.id, date || today) : 0;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!from) er.fromAccountId = "Choose the account the money leaves.";
    if (!to) er.toAccountId = "Choose the account the money goes into.";
    if (!amount || amount <= 0) er.amount = "Enter the amount moved.";
    if (!date) er.date = "Pick the date.";
    setErrors(er);
    if (Object.keys(er).length) return;
    const r = dispatch(transferMoney, { fromAccountId: from!.id, toAccountId: to!.id, amount: { amountMinor: amount!, currency: cur }, date, memo: memo.trim() || undefined }, { quietErrors: true });
    if (r.ok) onDone();
    else setErrors({ [r.error.field ?? "form"]: r.error.message });
  };

  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-col">
      <DialogHeader>
        <DialogTitle>Transfer money</DialogTitle>
        <DialogDescription>Between two of the agency&apos;s own accounts in the same currency. It posts as a journal (JV) and shows in both cash books.</DialogDescription>
      </DialogHeader>
      <DialogBody className="space-y-4">
        <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-[1fr_auto_1fr]">
          <Field label="From" error={errors.fromAccountId} hint={from ? `Balance ${format({ amountMinor: fromBal, currency: cur })}` : undefined}>
            <FormSelect
              label="From account"
              value={fromId}
              onChange={setFromId}
              options={accounts.map((a) => ({ value: a.id, label: `${a.name} (${a.currency})` }))}
              placeholder="Choose an account"
              invalid={Boolean(errors.fromAccountId)}
            />
          </Field>
          <ArrowRight className="mt-9 hidden size-4 text-ink-4 sm:block" aria-hidden />
          <Field label="To" error={errors.toAccountId} hint={to ? `Balance ${format({ amountMinor: toBal, currency: cur })}` : `Only ${cur} accounts`}>
            <FormSelect
              label="To account"
              value={toId}
              onChange={setToId}
              options={targets.map((a) => ({ value: a.id, label: a.name }))}
              placeholder="Choose an account"
              invalid={Boolean(errors.toAccountId)}
            />
          </Field>
        </div>
        <FieldGrid cols={2}>
          <Field label="Amount" htmlFor="tr-amount" required error={errors.amount}>
            <MoneyInput id="tr-amount" value={amount} onChange={setAmount} currency={cur} invalid={Boolean(errors.amount)} autoFocus />
          </Field>
          <Field label="Date" htmlFor="tr-date" required error={errors.date}>
            <Input id="tr-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="tnum" />
          </Field>
        </FieldGrid>
        <Field label="Narration" htmlFor="tr-memo" optional hint="e.g. the cheque or bank reference">
          <Input id="tr-memo" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder={from && to ? `Transfer from ${from.name} to ${to.name}` : "Petty cash top-up…"} />
        </Field>
        {from && amount && amount > fromBal && (from.kind === "cash" || from.kind === "mobile_money") && (
          <Banner tone="warn">
            This is more than the {format({ amountMinor: fromBal, currency: cur })} the books show in {from.name}.
          </Banner>
        )}
        {errors.form && <Banner tone="error">{errors.form}</Banner>}
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">Transfer {amount ? format({ amountMinor: amount, currency: cur }) : ""}</Button>
      </DialogFooter>
    </form>
  );
}

// ───────────────────────────── Quick expense (petty cash voucher, bank charge) ─────────────────────────────

/**
 * An expense paid from one fixed account, through the existing recordExpense command (numbered in the expense
 * series): a petty cash voucher, or a bank charge found on a statement.
 */
export function QuickExpenseDialog({
  open,
  onOpenChange,
  accountId,
  title,
  description,
  category: initialCategory = "office_supplies",
  lockCategory,
  payee: initialPayee = "",
  date: initialDate,
  submitLabel,
  onRecorded,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  accountId: ID;
  title: string;
  description: string;
  category?: ExpenseCategory;
  lockCategory?: boolean;
  payee?: string;
  date?: ISODate;
  submitLabel: string;
  onRecorded?: (expenseId: ID) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        {open && (
          <QuickExpenseForm
            accountId={accountId}
            title={title}
            description={description}
            initialCategory={initialCategory}
            lockCategory={lockCategory}
            initialPayee={initialPayee}
            initialDate={initialDate}
            submitLabel={submitLabel}
            onDone={(id) => {
              onOpenChange(false);
              if (id) onRecorded?.(id);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function QuickExpenseForm(p: {
  accountId: ID;
  title: string;
  description: string;
  initialCategory: ExpenseCategory;
  lockCategory?: boolean;
  initialPayee: string;
  initialDate?: ISODate;
  submitLabel: string;
  onDone: (id: ID | null) => void;
}) {
  const db = useApp((s) => s.db)!;
  const dispatch = useDispatch();
  const account = db.moneyAccounts[p.accountId];
  const [category, setCategory] = React.useState<ExpenseCategory>(p.initialCategory);
  const [payee, setPayee] = React.useState(p.initialPayee);
  const [amount, setAmount] = React.useState<number | null>(null);
  const [paidAt, setPaidAt] = React.useState<ISODate>(p.initialDate ?? darToday());
  const [note, setNote] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const cur = account?.currency ?? "TZS";
  const balance = account ? bookBalanceAt(db, account.id, paidAt || darToday()) : 0;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!payee.trim()) er.payee = "Who was paid?";
    if (!amount || amount <= 0) er.amount = "Enter the amount paid.";
    if (!paidAt) er.paidAt = "Pick the date.";
    setErrors(er);
    if (Object.keys(er).length) return;
    const r = dispatch(
      recordExpense,
      { category, payee: payee.trim(), amount: { amountMinor: amount!, currency: cur }, accountId: p.accountId, paidAt, note: note.trim() || undefined },
      { quietErrors: true },
    );
    if (r.ok) p.onDone(r.result!.expenseId);
    else setErrors({ [r.error.field ?? "form"]: r.error.message });
  };

  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-col">
      <DialogHeader>
        <DialogTitle>{p.title}</DialogTitle>
        <DialogDescription>{p.description}</DialogDescription>
      </DialogHeader>
      <DialogBody className="space-y-4">
        <p className="text-sm text-ink-3">
          Paid from <span className="font-medium text-ink">{account?.name}</span> · balance <Amount value={{ amountMinor: balance, currency: cur }} className="text-ink" />
        </p>
        <FieldGrid cols={2}>
          <Field label="Category">
            {p.lockCategory ? (
              <Input value={EXPENSE_CATEGORIES.find((c) => c.value === category)?.label ?? category} readOnly />
            ) : (
              <FormSelect label="Category" value={category} onChange={(v) => setCategory(v as ExpenseCategory)} options={EXPENSE_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))} />
            )}
          </Field>
          <Field label="Paid to" htmlFor="qe-payee" required error={errors.payee}>
            <Input
              id="qe-payee"
              value={payee}
              onChange={(e) => setPayee(e.target.value)}
              placeholder="e.g. Bajaji driver, stationers…"
              autoFocus={!p.initialPayee}
              aria-invalid={Boolean(errors.payee) || undefined}
            />
          </Field>
          <Field label="Amount" htmlFor="qe-amount" required error={errors.amount}>
            <MoneyInput id="qe-amount" value={amount} onChange={setAmount} currency={cur} invalid={Boolean(errors.amount)} autoFocus={Boolean(p.initialPayee)} />
          </Field>
          <Field label="Date" htmlFor="qe-date" required error={errors.paidAt}>
            <Input id="qe-date" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} className="tnum" />
          </Field>
        </FieldGrid>
        <Field label="Details" htmlFor="qe-note" optional>
          <Textarea id="qe-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What it was for, receipt number…" />
        </Field>
        {account?.kind === "cash" && amount !== null && amount > balance && (
          <Banner tone="warn">This is more than the {format({ amountMinor: balance, currency: cur })} the books show in the box. Top it up first.</Banner>
        )}
        {(errors.form || errors.accountId) && <Banner tone="error">{errors.form ?? errors.accountId}</Banner>}
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => p.onDone(null)}>
          Cancel
        </Button>
        <Button type="submit">{p.submitLabel}</Button>
      </DialogFooter>
    </form>
  );
}

// ───────────────────────────── Journal detail ─────────────────────────────

export const SOURCE_LABEL = { manual: "Manual", transfer: "Transfer", petty_cash: "Petty cash", opening_balance: "Opening balances" } as const;

/** A posted journal: its lines, totals, who posted it, and Reverse. */
export function JournalDetailSheet({ journalId, onOpenChange }: { journalId: ID | null; onOpenChange: (o: boolean) => void }) {
  const db = useApp((s) => s.db)!;
  const me = useMe();
  const dispatch = useDispatch();
  const [reversing, setReversing] = React.useState(false);
  const j = journalId ? db.journals?.[journalId] : undefined;
  const total = j ? { amountMinor: journalTotal(j.lines), currency: j.currency } : undefined;
  const reversal = j?.status === "reversed" ? db.ledger.find((e) => e.kind === "journal_reversal" && e.ref.entity === "journal" && e.ref.id === j.id) : undefined;
  return (
    <>
      <Sheet open={Boolean(j)} onOpenChange={onOpenChange}>
        <SheetContent className="sm:max-w-[720px]">
          {j && total && (
            <div className="flex min-h-0 flex-1 flex-col">
              <SheetHeader>
                <SheetTitle className="flex flex-wrap items-center gap-2">
                  <Code strong>{j.number}</Code>
                  <StatusChip tone={j.status === "reversed" ? "grey" : "green"} label={j.status === "reversed" ? "Reversed" : "Posted"} />
                </SheetTitle>
                <SheetDescription>
                  {SOURCE_LABEL[j.source]} journal · {j.memo}
                </SheetDescription>
              </SheetHeader>
              <SheetBody className="space-y-5">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-xs font-medium text-ink-4">Date</dt>
                    <dd className="tnum mt-0.5 text-ink">{fmtDate(j.date)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-ink-4">Amount</dt>
                    <dd className="mt-0.5">
                      <Amount value={total} className="font-semibold text-ink" />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-ink-4">Posted by</dt>
                    <dd className="mt-0.5 flex items-center gap-1.5 text-ink">
                      <UserMark user={db.users[j.createdBy]} /> {db.users[j.createdBy]?.name ?? "Unknown"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-ink-4">Posted</dt>
                    <dd className="tnum mt-0.5 text-ink">{fmtDateTime(j.createdAt)}</dd>
                  </div>
                </dl>
                <div className="-mx-5 overflow-x-auto border-y border-rule">
                  <Table className="min-w-[560px]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Account</TableHead>
                        <TableHead className="text-right">Debit</TableHead>
                        <TableHead className="text-right">Credit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {j.lines.map((l, i) => (
                        <TableRow key={i}>
                          <TableCell className="py-2.5">
                            <Link href={ledgerHref({ account: l.account, subId: l.sub?.id })} className="block leading-tight hover:underline">
                              <span className="font-mono text-[13px] text-ink-3">{l.account}</span> <span className="text-ink">{ACCOUNTS[l.account]?.name}</span>
                            </Link>
                            {(l.sub || l.memo) && <span className="block text-[13px] text-ink-3">{[subName(db, l.sub), l.memo].filter(Boolean).join(" · ")}</span>}
                          </TableCell>
                          <TableCell className="tnum text-right">{l.debitMinor ? <Amount value={{ amountMinor: l.debitMinor, currency: j.currency }} /> : null}</TableCell>
                          <TableCell className="tnum text-right">{l.creditMinor ? <Amount value={{ amountMinor: l.creditMinor, currency: j.currency }} /> : null}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow className="border-t-2 border-rule-2">
                        <TableCell className="h-11 font-semibold">Total</TableCell>
                        <TableCell className="tnum text-right font-semibold">
                          <Amount value={total} />
                        </TableCell>
                        <TableCell className="tnum text-right font-semibold">
                          <Amount value={total} />
                        </TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
                {j.status === "reversed" && (
                  <Banner tone="info" title="Reversed">
                    {db.users[j.reversedBy ?? ""]?.name ?? "Someone"} reversed this journal on {fmtDateTime(j.reversedAt)}
                    {reversal ? `, with mirror entries dated ${fmtDate(reversal.at)}` : ""}. {reversal?.memo.includes(":") ? reversal.memo.slice(reversal.memo.indexOf(":") + 1).trim() : ""}
                  </Banner>
                )}
              </SheetBody>
              <SheetFooter>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                  Close
                </Button>
                {j.status === "posted" && can(me, "journal.post") && (
                  <Button type="button" variant="danger-ghost" onClick={() => setReversing(true)}>
                    <Undo2 /> Reverse journal
                  </Button>
                )}
              </SheetFooter>
            </div>
          )}
        </SheetContent>
      </Sheet>
      <ConfirmDialog
        open={reversing && Boolean(j)}
        onOpenChange={setReversing}
        title={j ? `Reverse ${j.number}?` : "Reverse journal?"}
        confirmLabel="Reverse journal"
        reason={{ label: "Reason", required: true, placeholder: "e.g. Posted to the wrong account" }}
        onConfirm={(reason) => (j ? dispatch(reverseJournal, { journalId: j.id, reason }).ok : false)}
      >
        {j && total && (
          <Consequences
            items={[
              `Mirror entries dated today cancel every line of ${j.number} (${format(total)}). The original stays in the books, marked reversed.`,
              j.source === "transfer" ? "The money goes back to the account it came from in both cash books." : "Balances, the trial balance and the statements move back from today.",
              "Your reason is kept in the audit log.",
            ]}
          />
        )}
      </ConfirmDialog>
    </>
  );
}
