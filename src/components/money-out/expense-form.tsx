"use client";

import * as React from "react";
import { Paperclip } from "lucide-react";

import type { Currency, Expense, ExpenseCategory, ID } from "@/domain/types";
import { recordExpense, updateExpense } from "@/domain/commands";
import { EXPENSE_CATEGORIES } from "@/store/seed/reference";
import { useApp, useDispatch } from "@/store";
import { useModals } from "@/store/modals";
import { darToday } from "@/lib/dates";

import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldGrid } from "@/components/shared/field";
import { MoneyInput } from "@/components/shared/money-input";
import { FilterSelect } from "@/components/shared/filter-select";

/** Record or edit an expense (spec §9.9). Attachments keep the file name only until the backend exists. */
export function ExpenseDialogBody({ existing, onDone }: { existing?: Expense; onDone: (id: ID | null) => void }) {
  const db = useApp((s) => s.db)!;
  const dispatch = useDispatch();
  const [category, setCategory] = React.useState<ExpenseCategory>(existing?.category ?? "office_supplies");
  const [payee, setPayee] = React.useState(existing?.payee ?? "");
  const [currency, setCurrency] = React.useState<Currency>(existing?.amount.currency ?? "TZS");
  const [amount, setAmount] = React.useState<number | null>(existing?.amount.amountMinor ?? null);
  const accounts = Object.values(db.moneyAccounts).filter((a) => a.active && a.currency === currency);
  const [pickedAccount, setAccountId] = React.useState<ID | undefined>(existing?.accountId);
  const accountId = pickedAccount && db.moneyAccounts[pickedAccount]?.currency === currency ? pickedAccount : (accounts.find((a) => a.kind === "bank")?.id ?? accounts[0]?.id);
  const [paidAt, setPaidAt] = React.useState(existing?.paidAt ?? darToday());
  const [note, setNote] = React.useState(existing?.note ?? "");
  const [attachment, setAttachment] = React.useState(existing?.attachmentName ?? "");
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!payee.trim()) er.payee = "Who was paid?";
    if (!amount || amount <= 0) er.amount = "Enter the amount paid.";
    if (!accountId) er.account = `No ${currency} account. A Manager can add one in Settings → Money accounts.`;
    if (!paidAt) er.paidAt = "Pick the date paid.";
    setErrors(er);
    if (Object.keys(er).length) return;
    const fields = {
      category,
      payee: payee.trim(),
      amount: { amountMinor: amount!, currency },
      accountId: accountId!,
      paidAt,
      note: note.trim() || undefined,
      attachmentName: attachment || undefined,
    };
    const r = existing ? dispatch(updateExpense, { expenseId: existing.id, patch: fields }) : dispatch(recordExpense, fields);
    if (r.ok) onDone(existing ? existing.id : (r.result as { expenseId: ID }).expenseId);
  };

  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-col">
      <DialogHeader>
        <DialogTitle>{existing ? `Edit ${existing.number}` : "Record expense"}</DialogTitle>
        <DialogDescription>Money the agency spent. It posts to the ledger and shows in the P&amp;L.</DialogDescription>
      </DialogHeader>
      <DialogBody className="space-y-4">
        <FieldGrid cols={2}>
          <Field label="Category">
            <FilterSelect label="Category" value={category} onChange={(v) => setCategory(v as ExpenseCategory)} options={EXPENSE_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))} full />
          </Field>
          <Field label="Payee" htmlFor="ex-payee" required error={errors.payee}>
            <Input id="ex-payee" value={payee} onChange={(e) => setPayee(e.target.value)} autoFocus placeholder="e.g. TTCL, landlord, Amadeus" aria-invalid={Boolean(errors.payee) || undefined} />
          </Field>
          <Field label="Amount" htmlFor="ex-amount" required error={errors.amount}>
            <MoneyInput id="ex-amount" value={amount} onChange={setAmount} currency={currency} onCurrencyChange={setCurrency} invalid={Boolean(errors.amount)} />
          </Field>
          <Field label="Paid from" error={errors.account}>
            <FilterSelect label="Account" value={accountId ?? "all"} onChange={(v) => setAccountId(v)} options={accounts.map((a) => ({ value: a.id, label: a.name }))} full />
          </Field>
          <Field label="Date paid" htmlFor="ex-date" required error={errors.paidAt}>
            <Input id="ex-date" type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} className="tnum" />
          </Field>
          <Field label="Attachment" htmlFor="ex-file" optional hint="File name only for now; uploads arrive with the backend.">
            <label className="flex h-8 cursor-pointer items-center gap-2 rounded-md border border-dashed border-rule-2 px-2.5 text-sm text-ink-3 hover:border-ink-4/50 hover:text-ink">
              <Paperclip className="size-3.5 shrink-0" />
              <span className="truncate">{attachment || "Choose a receipt or invoice"}</span>
              <input id="ex-file" type="file" className="sr-only" onChange={(e) => setAttachment(e.target.files?.[0]?.name ?? "")} />
            </label>
          </Field>
        </FieldGrid>
        <Field label="Note" htmlFor="ex-note" optional>
          <Textarea id="ex-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={() => onDone(null)}>
          Cancel
        </Button>
        <Button type="submit">{existing ? "Save changes" : "Record expense"}</Button>
      </DialogFooter>
    </form>
  );
}

export function RecordExpenseModal() {
  const st = useModals((s) => s.expense);
  const close = useModals((s) => s.close);
  return (
    <Dialog open={st.open} onOpenChange={(o) => !o && close("expense")}>
      <DialogContent className="sm:max-w-[560px]">{st.open && <ExpenseDialogBody onDone={() => close("expense")} />}</DialogContent>
    </Dialog>
  );
}
