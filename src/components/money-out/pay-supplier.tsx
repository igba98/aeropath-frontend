"use client";

import * as React from "react";
import { Wand2 } from "lucide-react";

import type { Currency, ID, Money } from "@/domain/types";
import { recordSupplierPayment } from "@/domain/commands";
import { allocationsMatchAmount } from "@/domain/allocations";
import { convert, format } from "@/domain/money";
import { supplierOpenItems } from "@/domain/selectors/balances";
import { useApp, useDispatch } from "@/store";
import { fromDarInput, toDarInput } from "@/lib/dates";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Amount } from "@/components/shared/amount";
import { Banner, Field, FieldGrid } from "@/components/shared/field";
import { MoneyInput } from "@/components/shared/money-input";
import { Segmented } from "@/components/shared/page";
import { AllocationTable } from "./pay-supplier-lines";

/** "Pay supplier" drawer with allocation to open lines (spec §9.9, same pattern as Record payment §9.8). */
export function PaySupplierSheet({ open, onOpenChange, supplierId, preselect }: { open: boolean; onOpenChange: (o: boolean) => void; supplierId: ID; preselect?: ID[] }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-[760px]">{open && <PaySupplierForm supplierId={supplierId} preselect={preselect} onDone={() => onOpenChange(false)} />}</SheetContent>
    </Sheet>
  );
}

function PaySupplierForm({ supplierId, preselect, onDone }: { supplierId: ID; preselect?: ID[]; onDone: () => void }) {
  const db = useApp((s) => s.db)!;
  const dispatch = useDispatch();
  const now = React.useMemo(() => new Date(), []);
  const rate = db.settings.fx.USD_TZS;
  const supplier = db.suppliers[supplierId];

  const all = React.useMemo(() => supplierOpenItems(db, supplierId, now), [db, supplierId, now]);
  const items = all.filter((i) => i.remaining.amountMinor > 0);
  const credits = all.filter((i) => i.remaining.amountMinor < 0);

  const [currency, setCurrency] = React.useState<Currency>(supplier?.currency ?? "USD");
  const [alloc, setAlloc] = React.useState<Record<ID, number | null>>(() =>
    Object.fromEntries(items.filter((i) => preselect?.includes(i.line.id)).map((i) => [i.line.id, i.remaining.amountMinor])),
  );
  const [typed, setTyped] = React.useState<number | null>(null);
  const [touched, setTouched] = React.useState(false);
  const accountsFor = React.useCallback((c: Currency) => Object.values(db.moneyAccounts).filter((a) => a.active && a.currency === c), [db.moneyAccounts]);
  const accounts = accountsFor(currency);
  const pickAccount = (c: Currency) => {
    const list = accountsFor(c);
    return (list.find((a) => a.kind === "bank") ?? list[0])?.id;
  };
  const [accountId, setAccountId] = React.useState<ID | undefined>(() => pickAccount(supplier?.currency ?? "USD"));
  const [paidAt, setPaidAt] = React.useState(toDarInput(now));
  const [reference, setReference] = React.useState("");
  const [note, setNote] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const allocations = items.filter((i) => (alloc[i.line.id] ?? 0) > 0).map((i) => ({ lineId: i.line.id, amount: { amountMinor: alloc[i.line.id]!, currency: i.remaining.currency } as Money }));
  const allocatedInPay = allocations.reduce((s, a) => s + convert(a.amount, currency, rate).amountMinor, 0);
  const amount = touched ? (typed ?? 0) : allocatedInPay;
  const matches = allocations.length > 0 && allocationsMatchAmount({ amountMinor: amount, currency }, allocations.map((a) => a.amount), rate);
  const gap = amount - allocatedInPay;
  const crossCurrency = allocations.some((a) => a.amount.currency !== currency);

  const autoAllocate = (budget: number) => {
    let left = budget;
    const next: Record<ID, number | null> = {};
    for (const i of items) {
      if (left <= 0) break;
      const dueInPay = convert(i.remaining, currency, rate).amountMinor;
      const take = Math.min(left, dueInPay);
      next[i.line.id] = take === dueInPay ? i.remaining.amountMinor : Math.min(i.remaining.amountMinor, convert({ amountMinor: take, currency }, i.remaining.currency, rate).amountMinor);
      left -= take;
    }
    setAlloc(next);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!allocations.length) er.alloc = "Tick at least one line to pay for.";
    const over = items.find((i) => (alloc[i.line.id] ?? 0) > i.remaining.amountMinor);
    if (over) er.alloc = `Only ${format(over.remaining)} is still owed for ${over.line.description}.`;
    if (!amount || amount <= 0) er.amount = "Enter the amount paid, or tick lines to fill it in.";
    else if (allocations.length && !matches) er.alloc = `The lines add up to ${format({ amountMinor: allocatedInPay, currency })} but the payment is ${format({ amountMinor: amount, currency })}. Make them equal or use auto-allocate.`;
    if (!accountId) er.account = `No active ${currency} account. A Manager can add one in Settings → Money accounts.`;
    if (!paidAt) er.paidAt = "Pick when the money left the account.";
    setErrors(er);
    if (Object.keys(er).length) return;
    const r = dispatch(recordSupplierPayment, {
      supplierId,
      amount: { amountMinor: amount, currency },
      accountId: accountId!,
      allocations,
      paidAt: fromDarInput(paidAt),
      reference: reference.trim() || undefined,
      note: note.trim() || undefined,
    });
    if (r.ok) onDone();
  };

  if (!supplier) return null;

  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
      <SheetHeader>
        <SheetTitle>Pay {supplier.name}</SheetTitle>
        <SheetDescription>Tick the lines this payment covers. Payables drop and the cash book shows the payment.</SheetDescription>
      </SheetHeader>
      <SheetBody className="space-y-5">
        <FieldGrid cols={3}>
          <Field label="Pay in">
            <Segmented<Currency>
              label="Payment currency"
              value={currency}
              onChange={(c) => {
                setCurrency(c);
                setAccountId(pickAccount(c));
                if (touched && typed) setTyped(convert({ amountMinor: typed, currency }, c, rate).amountMinor);
              }}
              options={[{ value: "TZS", label: "TZS" }, { value: "USD", label: "USD" }]}
            />
          </Field>
          <Field label="Amount paid" htmlFor="sp-amount" error={errors.amount} hint={touched ? undefined : "Follows the lines you tick. Type to set it yourself."} className="sm:col-span-2">
            <MoneyInput
              id="sp-amount"
              value={amount || null}
              onChange={(v) => {
                setTouched(v !== null);
                setTyped(v);
              }}
              currency={currency}
              invalid={Boolean(errors.amount)}
            />
          </Field>
        </FieldGrid>

        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[13px] font-medium text-ink-2">
              Open lines, oldest first <span className="tnum text-ink-3">({items.length})</span>
            </span>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={() => setAlloc(Object.fromEntries(items.map((i) => [i.line.id, i.remaining.amountMinor])))} disabled={!items.length}>
                Select all
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => autoAllocate(amount)} disabled={!touched || !amount}>
                <Wand2 /> Auto-allocate oldest first
              </Button>
            </div>
          </div>
          <AllocationTable items={items} alloc={alloc} setAlloc={setAlloc} />
          {touched && allocations.length > 0 && (
            <div className={cn("mt-2 flex items-center justify-between rounded-md px-3 py-2 text-[13.5px]", matches ? "bg-[var(--st-green-bg)] text-[var(--st-green-fg)]" : "bg-canvas text-ink-2")}>
              <span>{matches ? "Fully allocated" : gap > 0 ? "Left to allocate" : "Over-allocated by"}</span>
              <Amount value={{ amountMinor: Math.abs(matches ? amount : gap), currency }} className="font-semibold" />
            </div>
          )}
          {errors.alloc && <p role="alert" className="mt-1 text-[13px] text-[var(--st-red-fg)]">{errors.alloc}</p>}
          {crossCurrency && <p className="mt-2 text-[13px] text-ink-3">Lines in another currency convert at 1 USD = TZS {rate.toLocaleString("en-US")}.</p>}
          {credits.length > 0 && (
            <Banner tone="info" className="mt-3">
              {supplier.name} also owes the agency {credits.map((c) => format({ amountMinor: -c.remaining.amountMinor, currency: c.remaining.currency })).join(" + ")} in refund credits. Credits reduce what is owed but cannot be allocated here; agree the offset with the supplier and pay the difference.
            </Banner>
          )}
        </div>

        <FieldGrid cols={2}>
          <Field label="Paid from" error={errors.account}>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger aria-label="Money account">
                <SelectValue placeholder={`No ${currency} account`} />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Paid on" htmlFor="sp-at" error={errors.paidAt}>
            <Input id="sp-at" type="datetime-local" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} className="tnum" />
          </Field>
          <Field label="Reference" htmlFor="sp-ref" optional hint="Bank transfer or BSP remittance reference">
            <Input id="sp-ref" value={reference} onChange={(e) => setReference(e.target.value.toUpperCase())} className="font-mono" />
          </Field>
          <Field label="Note" htmlFor="sp-note" optional>
            <Textarea id="sp-note" rows={1} value={note} onChange={(e) => setNote(e.target.value)} className="min-h-8" />
          </Field>
        </FieldGrid>
      </SheetBody>
      <SheetFooter>
        <span className="mr-auto hidden text-sm text-ink-2 sm:inline">
          {allocations.length} line{allocations.length === 1 ? "" : "s"} · <Amount value={{ amountMinor: amount, currency }} className="font-semibold text-ink" />
        </span>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" disabled={!items.length}>
          Record payment
        </Button>
      </SheetFooter>
    </form>
  );
}
