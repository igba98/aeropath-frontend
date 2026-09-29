"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, MessageCircle, Printer, Wand2 } from "lucide-react";

import type { Currency, ID, Money, PaymentMethod } from "@/domain/types";
import { can } from "@/domain/permissions";
import { recordPayment } from "@/domain/commands";
import { fileTotals } from "@/domain/selectors/fileTotals";
import { fileStatus } from "@/domain/status/file-status";
import { convert, format } from "@/domain/money";
import { PAYMENT_METHODS } from "@/store/seed/reference";
import { useApp, useDispatch, useMe } from "@/store";
import { useModals } from "@/store/modals";
import { fmtDate, fromDarInput, toDarInput } from "@/lib/dates";
import { firstName, openWhatsApp } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Amount } from "@/components/shared/amount";
import { Combobox } from "@/components/shared/combobox";
import { Banner, Field, FieldGrid } from "@/components/shared/field";
import { MoneyInput } from "@/components/shared/money-input";

const MOBILE: PaymentMethod[] = ["mpesa", "airtel_money", "mixx", "halopesa"];

/** Convert with an explicit TZS-per-USD rate. */
const conv = (m: Money, to: Currency, rate: number): Money => convert(m, to, rate);

interface OpenFile {
  id: ID;
  number: string;
  title: string;
  currency: Currency;
  balance: Money;
  createdAt: string;
}

/** Global "Record payment" modal (spec §9.8). */
export function RecordPaymentModal() {
  const state = useModals((s) => s.payment);
  const close = useModals((s) => s.close);
  return (
    <Dialog open={state.open} onOpenChange={(o) => !o && close("payment")}>
      <DialogContent className="sm:max-w-[680px]">
        {state.open && <RecordPaymentForm key={`${state.clientId}-${state.fileId}`} clientId={state.clientId} fileId={state.fileId} onDone={() => close("payment")} />}
      </DialogContent>
    </Dialog>
  );
}

function RecordPaymentForm({ clientId: initialClient, fileId: initialFile, onDone }: { clientId?: ID; fileId?: ID; onDone: () => void }) {
  const me = useMe();
  const db = useApp((s) => s.db)!;
  const dispatch = useDispatch();
  const settings = db.settings;
  const now = React.useMemo(() => new Date(), []);

  const startClient = initialClient ?? (initialFile ? db.files[initialFile]?.clientId : undefined);
  const [clientId, setClientId] = React.useState<ID | undefined>(startClient);
  const client = clientId ? db.clients[clientId] : undefined;
  const corporate = client?.type === "corporate";

  const openFiles: OpenFile[] = React.useMemo(() => {
    if (!clientId) return [];
    return Object.values(db.files)
      .filter((f) => f.clientId === clientId)
      .map((f) => {
        const t = fileTotals(db, f.id);
        return { id: f.id, number: f.number, title: f.title, currency: f.currency, balance: t.balance, createdAt: f.createdAt, status: fileStatus(db, f.id, now) };
      })
      .filter((f) => f.status !== "cancelled" || f.balance.amountMinor !== 0)
      .filter((f) => f.balance.amountMinor > 0 || f.id === initialFile || f.status === "draft" || f.status === "confirmed")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [db, clientId, initialFile, now]);

  const firstFile = initialFile && openFiles.some((f) => f.id === initialFile) ? initialFile : openFiles.find((f) => f.balance.amountMinor > 0)?.id ?? openFiles[0]?.id;
  const [singleFile, setSingleFile] = React.useState<ID | undefined>(firstFile);
  const single = openFiles.find((f) => f.id === singleFile);

  const [currency, setCurrency] = React.useState<Currency>(single?.currency ?? client?.defaultCurrency ?? "TZS");
  const [amount, setAmount] = React.useState<number | null>(single && single.balance.amountMinor > 0 ? single.balance.amountMinor : null);
  const [rate, setRate] = React.useState<number>(settings.fx.USD_TZS);
  const [alloc, setAlloc] = React.useState<Record<ID, number | null>>({}); // corporate: file currency minor units
  const [method, setMethod] = React.useState<PaymentMethod>("mpesa");
  const accounts = Object.values(db.moneyAccounts).filter((a) => a.active && a.currency === currency);
  const suggestAccount = React.useCallback(
    (m: PaymentMethod, c: Currency) => {
      const list = Object.values(db.moneyAccounts).filter((a) => a.active && a.currency === c);
      const kind = MOBILE.includes(m) ? "mobile_money" : m === "cash" ? "cash" : m === "card" ? "card" : "bank";
      const byName = m === "mpesa" ? list.find((a) => /m-?pesa/i.test(a.name)) : m === "airtel_money" ? list.find((a) => /airtel/i.test(a.name)) : undefined;
      return (byName ?? list.find((a) => a.kind === kind) ?? list.find((a) => a.kind === "bank") ?? list[0])?.id;
    },
    [db.moneyAccounts],
  );
  const [pickedAccount, setAccountId] = React.useState<ID | undefined>(undefined);
  const [reference, setReference] = React.useState("");
  const [receivedAt, setReceivedAt] = React.useState(toDarInput(now));
  const [fiscal, setFiscal] = React.useState("");
  const [note, setNote] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [done, setDone] = React.useState<{ paymentId: ID; number: string } | null>(null);

  // The picked account while it matches the currency; otherwise the best match for the method.
  const accountId = pickedAccount && db.moneyAccounts[pickedAccount]?.currency === currency ? pickedAccount : suggestAccount(method, currency);

  const canFx = can(me, "fx.override");
  const mixed = corporate ? openFiles.some((f) => alloc[f.id] && f.currency !== currency) : single ? single.currency !== currency : false;

  // Allocations in file currency.
  const allocations: { fileId: ID; amount: Money }[] = React.useMemo(() => {
    if (!amount) return [];
    if (!corporate) {
      if (!single) return [];
      return [{ fileId: single.id, amount: conv({ amountMinor: amount, currency }, single.currency, rate) }];
    }
    return openFiles.filter((f) => (alloc[f.id] ?? 0) > 0).map((f) => ({ fileId: f.id, amount: { amountMinor: alloc[f.id]!, currency: f.currency } }));
  }, [amount, corporate, single, currency, rate, openFiles, alloc]);

  const allocatedInPaymentCur = allocations.reduce((s, a) => s + conv(a.amount, currency, rate).amountMinor, 0);
  const unallocated = (amount ?? 0) - allocatedInPaymentCur;

  const autoAllocate = () => {
    let left = amount ?? 0;
    const next: Record<ID, number | null> = {};
    for (const f of openFiles) {
      if (left <= 0 || f.balance.amountMinor <= 0) continue;
      const balInPay = conv(f.balance, currency, rate).amountMinor;
      const take = Math.min(left, balInPay);
      next[f.id] = take === balInPay ? f.balance.amountMinor : conv({ amountMinor: take, currency }, f.currency, rate).amountMinor;
      left -= take;
    }
    setAlloc(next);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!clientId) er.client = "Pick the client who paid.";
    if (!amount || amount <= 0) er.amount = "Enter the amount received.";
    if (!accountId) er.account = `No ${currency} account is set up. A Manager can add one in Settings → Money accounts.`;
    if (method !== "cash" && !reference.trim()) er.reference = "Enter the transaction reference (e.g. the M-Pesa code). Only cash can go without one.";
    if (!allocations.length) er.alloc = corporate ? "Tick at least one booking and give it an amount." : "Pick the booking this pays for.";
    if (corporate && Math.abs(unallocated) > 1) er.alloc = `Allocations must add up to the amount. ${format({ amountMinor: Math.abs(unallocated), currency })} ${unallocated > 0 ? "is not allocated yet" : "too much allocated"}.`;
    setErrors(er);
    if (Object.keys(er).length) return;
    const r = dispatch(recordPayment, {
      clientId: clientId!,
      amount: { amountMinor: amount!, currency },
      allocations,
      fxRate: mixed ? rate : undefined,
      method,
      accountId: accountId!,
      reference: reference.trim() || undefined,
      fiscalReceiptNo: fiscal.trim() || undefined,
      receivedAt: fromDarInput(receivedAt),
      note: note.trim() || undefined,
    });
    if (r.ok) setDone(r.result as { paymentId: ID; number: string });
  };

  if (done) {
    const p = db.payments[done.paymentId];
    const fileNos = allocations.map((a) => db.files[a.fileId]?.number).filter(Boolean);
    const firstAlloc = allocations[0] ? db.files[allocations[0].fileId] : undefined;
    const after = firstAlloc ? fileTotals(db, firstAlloc.id).balance : undefined;
    return (
      <>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="size-4 text-[var(--st-green-fg)]" /> Payment recorded
          </DialogTitle>
          <DialogDescription>
            Receipt <span className="font-mono whitespace-nowrap font-semibold text-ink">{done.number}</span> for {client?.name}.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3 text-sm">
          <div className="flex items-baseline justify-between border-b border-rule pb-2">
            <span className="text-ink-3">Amount</span>
            <Amount value={p?.amount} size="lg" />
          </div>
          <div className="flex items-baseline justify-between border-b border-rule pb-2">
            <span className="text-ink-3">Allocated to</span>
            <span className="font-mono text-[13.5px]">{fileNos.join(", ")}</span>
          </div>
          {after && (
            <div className="flex items-baseline justify-between">
              <span className="text-ink-3">Balance now{allocations.length > 1 ? ` (${firstAlloc?.number})` : ""}</span>
              <Amount value={after} tone="balance" />
            </div>
          )}
          <p className="text-[13px] text-ink-3">An Accountant will verify it against the {PAYMENT_METHODS.find((m) => m.value === method)?.label} statement.</p>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" asChild>
            <Link href={`/print/receipt/${done.paymentId}?autoprint=1`} target="_blank">
              <Printer /> Print receipt
            </Link>
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              openWhatsApp(
                client?.phone,
                `Hello ${firstName(client?.contactPerson || client?.name || "")}, we have received ${p ? format(p.amount) : ""} for booking ${fileNos.join(", ")}. Receipt ${done.number}.${after ? ` Balance due: ${format(after)}.` : ""} Thank you — Aeropath Travel`,
              )
            }
          >
            <MessageCircle /> Share on WhatsApp
          </Button>
          <Button onClick={onDone}>Done</Button>
        </DialogFooter>
      </>
    );
  }

  const clientOptions = Object.values(db.clients)
    .filter((c) => !c.archived)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => ({ value: c.id, label: c.name, hint: c.phone, keywords: [c.email ?? "", c.contactPerson ?? ""] }));

  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-col">
      <DialogHeader>
        <DialogTitle>Record payment</DialogTitle>
        <DialogDescription>Money received from a client. It shows as unverified until an Accountant checks the statement.</DialogDescription>
      </DialogHeader>
      <DialogBody className="space-y-4">
        <Field label="Client" required error={errors.client}>
          <Combobox
            value={clientId}
            onChange={(v) => {
              setClientId(v);
              setAlloc({});
              const c = db.clients[v];
              const files = Object.values(db.files).filter((f) => f.clientId === v).map((f) => ({ f, b: fileTotals(db, f.id).balance })).filter((x) => x.b.amountMinor > 0).sort((a, b) => a.f.createdAt.localeCompare(b.f.createdAt));
              const f0 = files[0];
              setSingleFile(f0?.f.id);
              const cur = f0?.f.currency ?? c?.defaultCurrency ?? "TZS";
              setCurrency(cur);
              setAmount(c?.type === "corporate" ? null : (f0?.b.amountMinor ?? null));
            }}
            options={clientOptions}
            placeholder="Search by name or phone"
            autoFocus={!clientId}
            invalid={Boolean(errors.client)}
          />
        </Field>

        {client && !corporate && (
          <Field label="Booking" error={errors.alloc}>
            {openFiles.length ? (
              <Select
                value={singleFile}
                onValueChange={(v) => {
                  setSingleFile(v);
                  const f = openFiles.find((x) => x.id === v);
                  if (f) {
                    setCurrency(f.currency);
                    setAmount(f.balance.amountMinor > 0 ? f.balance.amountMinor : null);
                  }
                }}
              >
                <SelectTrigger aria-label="Booking">
                  <SelectValue placeholder="Pick a booking" />
                </SelectTrigger>
                <SelectContent>
                  {openFiles.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      <span className="font-mono whitespace-nowrap text-[13px]">{f.number}</span>
                      <span className="max-w-[220px] truncate text-ink-3">{f.title}</span>
                      <span className="tnum ml-auto text-[13px] text-ink-3">{format(f.balance)} due</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-sm text-ink-3">This client has no open bookings.</p>
            )}
          </Field>
        )}

        <FieldGrid cols={2}>
          <Field label="Amount received" htmlFor="pay-amount" required error={errors.amount}>
            <MoneyInput
              id="pay-amount"
              value={amount}
              onChange={setAmount}
              currency={currency}
              onCurrencyChange={(c) => {
                setCurrency(c);
                if (amount) setAmount(conv({ amountMinor: amount, currency }, c, rate).amountMinor);
              }}
              invalid={Boolean(errors.amount)}
              autoFocus={Boolean(clientId)}
            />
          </Field>
          <Field label="Received" htmlFor="pay-at">
            <Input id="pay-at" type="datetime-local" value={receivedAt} onChange={(e) => setReceivedAt(e.target.value)} className="tnum" />
          </Field>
        </FieldGrid>

        {mixed && (
          <div className="flex flex-wrap items-end gap-3 rounded-md border border-rule bg-canvas p-3">
            <Field label="Rate (TZS per 1 USD)" htmlFor="pay-rate" hint={canFx ? `Settings rate ${settings.fx.USD_TZS.toLocaleString("en-US")}` : "Only an Accountant or Manager can change the rate."} className="w-52">
              <Input id="pay-rate" type="number" inputMode="decimal" value={rate} readOnly={!canFx} onChange={(e) => setRate(Math.max(1, Number(e.target.value) || settings.fx.USD_TZS))} className="tnum text-right" />
            </Field>
            {!corporate && single && amount ? (
              <p className="pb-5 text-sm text-ink-2">
                Credits <Amount value={conv({ amountMinor: amount, currency }, single.currency, rate)} className="font-semibold text-ink" /> to {single.number}
              </p>
            ) : null}
          </div>
        )}

        {client && corporate && (
          <div>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[13px] font-medium text-ink-2">Allocate to bookings</span>
              <Button type="button" variant="outline" size="sm" onClick={autoAllocate} disabled={!amount}>
                <Wand2 /> Auto-allocate oldest first
              </Button>
            </div>
            <Table className="min-w-[520px]">
              <TableHeader>
                <TableRow className="rule-head border-0">
                  <TableHead className="h-auto w-7 px-0 pb-1.5 first:pl-0" />
                  <TableHead className="h-auto px-0 pb-1.5">Booking</TableHead>
                  <TableHead className="h-auto px-0 pb-1.5 text-right">Balance</TableHead>
                  <TableHead className="h-auto w-44 px-0 pb-1.5 text-right">Allocate</TableHead>
                  <TableHead className="h-auto pr-0 pb-1.5 pl-3 text-right last:pr-0">After</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {openFiles.map((f) => {
                  const a = alloc[f.id] ?? null;
                  const on = (a ?? 0) > 0;
                  const after = { amountMinor: f.balance.amountMinor - (a ?? 0), currency: f.currency };
                  return (
                    <TableRow key={f.id}>
                      <TableCell className="px-0 py-2 first:pl-0">
                        <Checkbox
                          checked={on}
                          aria-label={`Allocate to ${f.number}`}
                          onCheckedChange={(v) => setAlloc((x) => ({ ...x, [f.id]: v === true ? Math.max(0, f.balance.amountMinor) || null : null }))}
                        />
                      </TableCell>
                      <TableCell className="px-0 py-2">
                        <span className="block font-mono whitespace-nowrap text-[13.5px] font-semibold">{f.number}</span>
                        <span className="block max-w-[200px] truncate text-xs text-ink-3">
                          {f.title} · {fmtDate(f.createdAt)}
                        </span>
                      </TableCell>
                      <TableCell className="px-0 py-2 text-right">
                        <Amount value={f.balance} tone="balance" />
                      </TableCell>
                      <TableCell className="py-2 pr-0 pl-3">
                        <MoneyInput value={a} onChange={(v) => setAlloc((x) => ({ ...x, [f.id]: v }))} currency={f.currency} aria-label={`Amount for ${f.number}`} className="h-7" />
                      </TableCell>
                      <TableCell className="py-2 pr-0 pl-3 text-right last:pr-0">
                        <Amount value={after} tone="balance" className={cn(!on && "text-ink-4")} />
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
            <div className={cn("mt-2 flex items-center justify-between rounded-md px-3 py-2 text-[13.5px]", Math.abs(unallocated) <= 1 ? "bg-[var(--st-green-bg)] text-[var(--st-green-fg)]" : "bg-canvas text-ink-2")}>
              <span>{Math.abs(unallocated) <= 1 ? "Fully allocated" : unallocated > 0 ? "Left to allocate" : "Over-allocated by"}</span>
              <Amount value={{ amountMinor: Math.abs(unallocated), currency }} className="font-semibold" />
            </div>
            {errors.alloc && <p className="mt-1 text-[13px] text-[var(--st-red-fg)]">{errors.alloc}</p>}
          </div>
        )}

        <FieldGrid cols={2}>
          <Field label="Method">
            <Select
              value={method}
              onValueChange={(v) => {
                setMethod(v as PaymentMethod);
                setAccountId(undefined);
              }}
            >
              <SelectTrigger aria-label="Payment method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Into account" error={errors.account}>
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
          <Field label="Reference" htmlFor="pay-ref" required={method !== "cash"} optional={method === "cash"} error={errors.reference} hint={MOBILE.includes(method) ? "The transaction code from the SMS" : undefined}>
            <Input id="pay-ref" value={reference} onChange={(e) => setReference(e.target.value.toUpperCase())} className="font-mono" placeholder={MOBILE.includes(method) ? "e.g. SJK4H7T2QX" : ""} aria-invalid={Boolean(errors.reference) || undefined} />
          </Field>
          <Field label="Fiscal receipt no." htmlFor="pay-efd" optional hint="TRA EFD/VFD number, if issued">
            <Input id="pay-efd" value={fiscal} onChange={(e) => setFiscal(e.target.value)} className="font-mono" />
          </Field>
        </FieldGrid>
        <Field label="Note" htmlFor="pay-note" optional>
          <Textarea id="pay-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>

        {allocations.length > 0 && (
          <div className="border-t border-rule pt-3">
            <div className="col-head mb-1.5">Balance before → after</div>
            <ul className="space-y-1 text-sm">
              {allocations.map((a) => {
                const f = openFiles.find((x) => x.id === a.fileId);
                if (!f) return null;
                return (
                  <li key={a.fileId} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono whitespace-nowrap text-[13.5px]">{f.number}</span>
                    <span className="flex items-center gap-2">
                      <Amount value={f.balance} tone="balance" />
                      <ArrowRight className="size-3.5 text-brand" />
                      <Amount value={{ amountMinor: f.balance.amountMinor - a.amount.amountMinor, currency: f.currency }} tone="balance" className="font-semibold" />
                    </span>
                  </li>
                );
              })}
            </ul>
            {allocations.some((a) => {
              const f = openFiles.find((x) => x.id === a.fileId);
              return f && a.amount.amountMinor > f.balance.amountMinor;
            }) && (
              <Banner tone="info" className="mt-2">
                This pays more than is due. The extra stays on the booking as client credit.
              </Banner>
            )}
          </div>
        )}
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">Record payment</Button>
      </DialogFooter>
    </form>
  );
}
