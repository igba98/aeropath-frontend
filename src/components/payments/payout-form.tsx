"use client";

import * as React from "react";
import type { Currency, ID, Money, PaymentMethod, RefundRequest } from "@/domain/types";
import { payRefund } from "@/domain/commands";
import { convert } from "@/domain/money";
import { toFileMoney } from "@/domain/pricing";
import { PAYMENT_METHODS } from "@/store/seed/reference";
import { useApp, useDispatch } from "@/store";
import { fromDarInput, toDarInput } from "@/lib/dates";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Amount } from "@/components/shared/amount";
import { Field, FieldGrid, FormSection } from "@/components/shared/field";
import { Segmented } from "@/components/shared/page";
import { MOBILE_METHODS } from "./payment-rows";

/** Payout of an approved client refund (payRefund). Accounts are filtered by the currency paid in. */
export function PayoutForm({ refund, onPaid }: { refund: RefundRequest; onPaid: (paymentId: ID) => void }) {
  const db = useApp((s) => s.db)!;
  const dispatch = useDispatch();
  const rate = db.settings.fx.USD_TZS;
  const file = db.files[refund.fileId];
  const line = db.lines[refund.lineId];
  const clientRefund = refund.quote.clientRefund;

  const currencies = React.useMemo(() => [...new Set<Currency>([clientRefund.currency, file?.currency ?? clientRefund.currency])], [clientRefund.currency, file?.currency]);
  const [currency, setCurrency] = React.useState<Currency>(clientRefund.currency);
  const accounts = Object.values(db.moneyAccounts).filter((a) => a.active && a.currency === currency);
  const [method, setMethod] = React.useState<PaymentMethod>("bank_transfer");
  const pick = React.useCallback(
    (m: PaymentMethod, c: Currency) => {
      const list = Object.values(db.moneyAccounts).filter((a) => a.active && a.currency === c);
      const kind = MOBILE_METHODS.includes(m) ? "mobile_money" : m === "cash" ? "cash" : m === "card" ? "card" : "bank";
      return (list.find((a) => a.kind === kind) ?? list[0])?.id;
    },
    [db.moneyAccounts],
  );
  const [accountId, setAccountId] = React.useState<ID | undefined>(() => pick("bank_transfer", clientRefund.currency));
  const [reference, setReference] = React.useState("");
  const [paidAt, setPaidAt] = React.useState(() => toDarInput(new Date()));
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  // Same rule as payRefund: pay the refund's own currency, or the file-currency allocation, else convert.
  const amount: Money | undefined = React.useMemo(() => {
    if (!file || !line) return undefined;
    if (currency === clientRefund.currency) return clientRefund;
    if (currency === file.currency) return toFileMoney(clientRefund, file.currency, line.pricing.fxToFile, rate);
    return convert(clientRefund, currency, rate);
  }, [currency, clientRefund, file, line, rate]);

  // TZS per USD actually used: the rate saved on the line when paying in the file currency, else today's rate.
  const fx = line?.pricing.fxToFile;
  const usedRate = fx && currency === file?.currency ? (clientRefund.currency === "USD" ? fx : 1 / fx) : rate;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!accountId) er.account = `No active ${currency} account. A Manager can add one in Settings → Money accounts.`;
    if (method !== "cash" && !reference.trim()) er.reference = "Enter the transfer or transaction reference. Only cash payouts can go without one.";
    if (!paidAt) er.paidAt = "Enter when the money was sent.";
    setErrors(er);
    if (Object.keys(er).length) return;
    const r = dispatch(payRefund, { refundId: refund.id, accountId: accountId!, method, reference: reference.trim() || undefined, paidAt: fromDarInput(paidAt) });
    if (r.ok) onPaid((r.result as { paymentId: ID }).paymentId);
  };

  return (
    <FormSection title="Pay out" description="Record the money sent back to the client. Payouts are recorded as verified.">
      <form onSubmit={submit} noValidate className="space-y-3.5">
        {currencies.length > 1 && (
          <Field label="Pay in">
            <Segmented
              label="Payout currency"
              value={currency}
              onChange={(c) => {
                setCurrency(c);
                setAccountId(pick(method, c));
              }}
              options={currencies.map((c) => ({ value: c, label: c }))}
            />
          </Field>
        )}
        <div className="flex items-baseline justify-between border-y border-rule py-2 text-sm">
          <span className="text-ink-3">Amount to send</span>
          <span className="flex flex-col items-end">
            <Amount value={amount} size="lg" />
            {amount && amount.currency !== clientRefund.currency && (
              <span className="text-xs text-ink-3">
                Refund <Amount value={clientRefund} size="sm" /> · converted at 1 USD = TZS {usedRate.toLocaleString("en-US", { maximumFractionDigits: 2 })}
              </span>
            )}
          </span>
        </div>
        <FieldGrid cols={2}>
          <Field label="Method">
            <Select
              value={method}
              onValueChange={(v) => {
                setMethod(v as PaymentMethod);
                setAccountId(pick(v as PaymentMethod, currency));
              }}
            >
              <SelectTrigger aria-label="Payout method">
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
          <Field label="From account" error={errors.account}>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger aria-label="Pay from account" aria-invalid={Boolean(errors.account) || undefined}>
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
          <Field label="Reference" htmlFor="po-ref" required={method !== "cash"} optional={method === "cash"} error={errors.reference}>
            <Input id="po-ref" value={reference} onChange={(e) => setReference(e.target.value.toUpperCase())} className="font-mono" aria-invalid={Boolean(errors.reference) || undefined} />
          </Field>
          <Field label="Paid" htmlFor="po-at" error={errors.paidAt}>
            <Input id="po-at" type="datetime-local" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} className="tnum" />
          </Field>
        </FieldGrid>
        <div className="flex justify-end">
          <Button type="submit">Record payout</Button>
        </div>
      </form>
    </FormSection>
  );
}
