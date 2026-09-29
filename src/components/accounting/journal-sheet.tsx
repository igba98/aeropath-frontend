"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";

import type { AccountCode, Currency, DbState, ID } from "@/domain/types";
import { ACCOUNTS } from "@/domain/ledger/accounts";
import { postJournal, recordOpeningBalances, type JournalLineInput } from "@/domain/commands";
import { isPnlAccount } from "@/domain/accounting";
import { format } from "@/domain/money";
import { toDarDate } from "@/domain/dates";
import { useApp, useDispatch } from "@/store";
import { darToday } from "@/lib/dates";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Banner, Field, FieldGrid } from "@/components/shared/field";
import { MoneyInput } from "@/components/shared/money-input";
import { Segmented } from "@/components/shared/page";
import { StatusChip } from "@/components/shared/status-chip";
import { Amount } from "@/components/shared/amount";
import { AccountSelect, SubSelect } from "./pickers";

type Mode = "journal" | "opening";

interface Row {
  key: number;
  account?: AccountCode;
  subId?: ID;
  debit: number | null;
  credit: number | null;
  memo: string;
}

let seq = 0;
const blank = (): Row => ({ key: ++seq, debit: null, credit: null, memo: "" });
const isEmpty = (r: Row) => !r.account && !r.debit && !r.credit && !r.memo.trim();

/** New journal entry, or the opening balance sheet (balanced automatically to 3300). */
export function JournalSheet({ open, onOpenChange, mode = "journal", onPosted }: { open: boolean; onOpenChange: (o: boolean) => void; mode?: Mode; onPosted?: (journalId: ID) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[960px]">
        {open && (
          <JournalForm
            mode={mode}
            onDone={(id) => {
              onOpenChange(false);
              if (id) onPosted?.(id);
            }}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

/** Earliest ledger instant: the day the books start, a sensible default date for opening balances. */
const firstBookDay = (db: DbState): string | null => (db.ledger.length ? db.ledger.reduce((m, e) => (e.at < m ? e.at : m), db.ledger[0].at) : null);

function JournalForm({ mode, onDone }: { mode: Mode; onDone: (id: ID | null) => void }) {
  const db = useApp((s) => s.db)!;
  const dispatch = useDispatch();
  const opening = mode === "opening";
  const today = darToday();
  const [date, setDate] = React.useState(() => {
    if (!opening) return today;
    const first = firstBookDay(db);
    return first ? toDarDate(first) : today;
  });
  const [memo, setMemo] = React.useState(opening ? "Opening balances" : "");
  const [currency, setCurrency] = React.useState<Currency>("TZS");
  const [rows, setRows] = React.useState<Row[]>(() => (opening ? [blank(), blank(), blank()] : [blank(), blank()]));
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);

  const accountFilter = React.useCallback((code: AccountCode) => (opening ? code !== "1100" && code !== "3300" && !isPnlAccount(code) : true), [opening]);
  const used = rows.filter((r) => !isEmpty(r));
  const debits = used.reduce((s, r) => s + (r.debit ?? 0), 0);
  const credits = used.reduce((s, r) => s + (r.credit ?? 0), 0);
  const diff = debits - credits;
  const balancing = opening ? -diff : 0; // + credit to 3300
  const existingOpening = opening ? Object.values(db.journals ?? {}).find((j) => j.source === "opening_balance" && j.status === "posted" && j.currency === currency) : undefined;
  const moneyOpenings = Object.values(db.moneyAccounts).filter((a) => a.currency === currency && a.openingBalance.amountMinor !== 0);

  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const setAccount = (key: number, account: AccountCode) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, account, subId: r.account && ACCOUNTS[r.account].subledger === ACCOUNTS[account].subledger ? r.subId : undefined } : r)));
  const changeCurrency = (c: Currency) => {
    setCurrency(c);
    setRows((rs) => rs.map((r) => (r.account === "1100" && r.subId && db.moneyAccounts[r.subId]?.currency !== c ? { ...r, subId: undefined } : r)));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const er: Record<string, string> = {};
    if (!date) er.date = "Pick the journal date.";
    if (!memo.trim()) er.memo = "Say what the journal is for.";
    const list = rows.map((r, i) => ({ r, i })).filter(({ r }) => !isEmpty(r));
    for (const { r } of list) {
      if (!r.account) er[`${r.key}.account`] = "Choose an account.";
      else if (ACCOUNTS[r.account].subledger && !r.subId) er[`${r.key}.sub`] = `Choose the ${ACCOUNTS[r.account].subledger === "money_account" ? "money account" : ACCOUNTS[r.account].subledger}.`;
      if (!r.debit && !r.credit) er[`${r.key}.debit`] = "Enter a debit or a credit.";
    }
    if (!opening && list.length < 2) er.lines = "A journal needs at least two lines.";
    if (opening && list.length < 1) er.lines = "Enter at least one opening balance.";
    if (!opening && list.length >= 2 && diff !== 0) er.lines = `Debits and credits differ by ${format({ amountMinor: Math.abs(diff), currency })}.`;
    setErrors(er);
    if (Object.keys(er).length) return;
    const lines: JournalLineInput[] = list.map(({ r }) => {
      const l: JournalLineInput = { account: r.account!, debitMinor: r.debit ?? 0, creditMinor: r.credit ?? 0 };
      const sl = ACCOUNTS[r.account!].subledger;
      if (sl && r.subId) l.sub = { type: sl, id: r.subId };
      if (r.memo.trim()) l.memo = r.memo.trim();
      return l;
    });
    const res = opening
      ? dispatch(recordOpeningBalances, { date, currency, memo: memo.trim(), lines }, { quietErrors: true })
      : dispatch(postJournal, { date, memo: memo.trim(), currency, lines }, { quietErrors: true });
    if (res.ok) {
      onDone((res.result as { journalId: ID }).journalId);
      return;
    }
    const f = res.error.field;
    const m = f?.match(/^lines\.(\d+)\.(\w+)$/);
    if (m) {
      const row = list[Number(m[1])]?.r;
      if (row) setErrors({ [`${row.key}.${m[2] === "debitMinor" || m[2] === "creditMinor" ? "debit" : m[2]}`]: res.error.message });
    } else if (f === "date" || f === "memo") setErrors({ [f]: res.error.message });
    setFormError(res.error.message);
  };

  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
      <SheetHeader>
        <SheetTitle>{opening ? "Opening balances" : "New journal entry"}</SheetTitle>
        <SheetDescription>
          {opening
            ? "The balance sheet the books start from: equipment, receivables and payables brought forward, loans, share capital. The difference goes to 3300 Opening balance equity."
            : "A journal voucher (JV). Debits must equal credits; cash, clients and suppliers need the account, client or supplier."}
        </SheetDescription>
      </SheetHeader>
      <SheetBody className="space-y-5">
        <FieldGrid cols={3}>
          <Field label="Date" htmlFor="jv-date" required error={errors.date}>
            <Input id="jv-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="tnum" aria-invalid={Boolean(errors.date) || undefined} />
          </Field>
          <Field label="Narration" htmlFor="jv-memo" required error={errors.memo} className="sm:col-span-1">
            <Input
              id="jv-memo"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="e.g. Accrue September rent…"
              aria-invalid={Boolean(errors.memo) || undefined}
              autoFocus={!opening}
            />
          </Field>
          <Field label="Currency" hint="One currency per journal.">
            <Segmented<Currency>
              label="Journal currency"
              value={currency}
              onChange={changeCurrency}
              options={[
                { value: "TZS", label: "TZS" },
                { value: "USD", label: "USD" },
              ]}
            />
          </Field>
        </FieldGrid>

        {opening && existingOpening && (
          <Banner tone="warn" title={`Opening balances in ${currency} are already recorded (${existingOpening.number}).`}>
            Reverse that journal in Journal entries before entering corrected balances.
          </Banner>
        )}
        {opening && moneyOpenings.length > 0 && (
          <Banner tone="info" title="Money accounts are already in">
            {moneyOpenings.map((a) => `${a.name} (${format(a.openingBalance)})`).join(" · ")} come from Settings → Money accounts and sit against 3300 already.
          </Banner>
        )}

        <div>
          <div className="mb-2 hidden grid-cols-[minmax(0,1.5fr)_minmax(0,1.2fr)_136px_136px_minmax(0,1fr)_32px] gap-2 lg:grid">
            {["Account", "Sub-ledger", "Debit", "Credit", "Line memo", ""].map((h, i) => (
              <span key={i} className={cn("col-head", i === 2 || i === 3 ? "pr-3 text-right" : "pl-3")}>
                {h}
              </span>
            ))}
          </div>
          <ol className="space-y-3 lg:space-y-2" aria-label="Journal lines">
            {rows.map((r, i) => {
              const sl = r.account ? ACCOUNTS[r.account].subledger : undefined;
              const e = (k: string) => errors[`${r.key}.${k}`];
              return (
                <li
                  key={r.key}
                  className="rounded-lg border border-rule p-3 lg:grid lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1.2fr)_136px_136px_minmax(0,1fr)_32px] lg:items-start lg:gap-2 lg:border-0 lg:p-0"
                >
                  <div className="mb-2 flex items-center justify-between lg:hidden">
                    <span className="text-[13px] font-semibold text-ink-3">Line {i + 1}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                      disabled={rows.length <= (opening ? 1 : 2)}
                      aria-label={`Remove line ${i + 1}`}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs font-medium text-ink-4 lg:hidden">Account</span>
                    <AccountSelect value={r.account} onChange={(c) => setAccount(r.key, c)} filter={accountFilter} invalid={Boolean(e("account"))} />
                    {e("account") && <p className="text-[13px] text-[var(--st-red-fg)]">{e("account")}</p>}
                  </div>
                  <div className={cn("mt-2 space-y-1 lg:mt-0", !sl && "max-lg:hidden")}>
                    <span className="text-xs font-medium text-ink-4 lg:hidden">{sl === "client" ? "Client" : sl === "supplier" ? "Supplier" : "Money account"}</span>
                    {sl ? (
                      <SubSelect type={sl} value={r.subId} onChange={(id) => update(r.key, { subId: id })} currency={sl === "money_account" ? currency : undefined} invalid={Boolean(e("sub"))} />
                    ) : (
                      <span className="hidden h-9 items-center px-3 text-[13px] text-ink-4 lg:flex">{r.account ? "Not needed" : ""}</span>
                    )}
                    {e("sub") && <p className="text-[13px] text-[var(--st-red-fg)]">{e("sub")}</p>}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 lg:contents">
                    <div className="space-y-1 lg:mt-0">
                      <span className="text-xs font-medium text-ink-4 lg:hidden">Debit</span>
                      <MoneyInput
                        value={r.debit}
                        onChange={(v) => update(r.key, { debit: v, credit: v ? null : r.credit })}
                        currency={currency}
                        aria-label={`Debit, line ${i + 1}`}
                        invalid={Boolean(e("debit"))}
                      />
                    </div>
                    <div className="space-y-1 lg:mt-0">
                      <span className="text-xs font-medium text-ink-4 lg:hidden">Credit</span>
                      <MoneyInput
                        value={r.credit}
                        onChange={(v) => update(r.key, { credit: v, debit: v ? null : r.debit })}
                        currency={currency}
                        aria-label={`Credit, line ${i + 1}`}
                        invalid={Boolean(e("debit"))}
                      />
                    </div>
                    {e("debit") && <p className="col-span-2 text-[13px] text-[var(--st-red-fg)] lg:hidden">{e("debit")}</p>}
                  </div>
                  <div className="mt-2 space-y-1 lg:mt-0">
                    <span className="text-xs font-medium text-ink-4 lg:hidden">Line memo</span>
                    <Input value={r.memo} onChange={(ev) => update(r.key, { memo: ev.target.value })} placeholder="Optional…" aria-label={`Memo, line ${i + 1}`} />
                    {e("debit") && <p className="hidden text-[13px] text-[var(--st-red-fg)] lg:block">{e("debit")}</p>}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="mt-0.5 hidden lg:inline-flex"
                    onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                    disabled={rows.length <= (opening ? 1 : 2)}
                    aria-label={`Remove line ${i + 1}`}
                  >
                    <Trash2 />
                  </Button>
                </li>
              );
            })}
            {opening && balancing !== 0 && (
              <li className="rounded-lg border border-dashed border-rule-2 bg-canvas p-3 lg:grid lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1.2fr)_136px_136px_minmax(0,1fr)_32px] lg:items-center lg:gap-2">
                <span className="text-sm font-medium text-ink">3300 · Opening balance equity</span>
                <span className="text-[13px] text-ink-3">Balancing figure, added for you</span>
                <span className="tnum text-right text-sm">{balancing < 0 ? <Amount value={{ amountMinor: -balancing, currency }} /> : null}</span>
                <span className="tnum text-right text-sm">{balancing > 0 ? <Amount value={{ amountMinor: balancing, currency }} /> : null}</span>
              </li>
            )}
          </ol>
          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => setRows((rs) => [...rs, blank()])}>
            <Plus /> Add line
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg bg-table-head px-4 py-3 text-sm" aria-live="polite">
          <span className="inline-flex items-center gap-2">
            <span className="text-ink-3">Debits</span> <Amount value={{ amountMinor: debits + Math.max(-balancing, 0), currency }} className="font-semibold text-ink" />
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="text-ink-3">Credits</span> <Amount value={{ amountMinor: credits + Math.max(balancing, 0), currency }} className="font-semibold text-ink" />
          </span>
          <span className="sm:ml-auto">
            {opening || diff === 0 ? (
              <StatusChip tone={debits + credits ? "green" : "grey"} label={debits + credits ? "Balanced" : "Nothing entered yet"} />
            ) : (
              <StatusChip tone="amber" label={`Out by ${format({ amountMinor: Math.abs(diff), currency })}`} />
            )}
          </span>
        </div>
        {errors.lines && (
          <p className="text-[13px] text-[var(--st-red-fg)]" role="alert">
            {errors.lines}
          </p>
        )}
        {formError && !errors.lines && <Banner tone="error">{formError}</Banner>}
      </SheetBody>
      <SheetFooter>
        <Button type="button" variant="outline" onClick={() => onDone(null)}>
          Cancel
        </Button>
        <Button type="submit">{opening ? "Record opening balances" : "Post journal"}</Button>
      </SheetFooter>
    </form>
  );
}
