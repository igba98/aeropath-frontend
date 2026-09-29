"use client";

import * as React from "react";
import { Landmark, Plus } from "lucide-react";

import type { Currency, Money, MoneyAccount } from "@/domain/types";
import { can } from "@/domain/permissions";
import { upsertMoneyAccount } from "@/domain/commands";
import { accountBalance } from "@/domain/selectors/balances";
import { useApp, useDispatch, useMe } from "@/store";
import { sumIn } from "@/lib/view-models";

import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { DataTable, TotalsRow, type Column } from "@/components/shared/data-table";
import { EmptyState, Segmented } from "@/components/shared/page";
import { StatusChip } from "@/components/shared/status-chip";
import { Amount } from "@/components/shared/amount";
import { Field, FieldGrid } from "@/components/shared/field";
import { FilterSelect } from "@/components/shared/filter-select";
import { MoneyInput } from "@/components/shared/money-input";
import { TabHeading } from "./settings-kit";

export const ACCOUNT_KINDS: { value: MoneyAccount["kind"]; label: string }[] = [
  { value: "bank", label: "Bank" },
  { value: "mobile_money", label: "Mobile money" },
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card terminal" },
];
const kindLabel = (k: MoneyAccount["kind"]) => ACCOUNT_KINDS.find((x) => x.value === k)?.label ?? k;

interface Row {
  account: MoneyAccount;
  balance: Money;
}

/** Settings → Money accounts. Manager edits; Accountant views. */
export function MoneyAccountsTab() {
  const me = useMe();
  const db = useApp((s) => s.db)!;
  const canEdit = can(me, "money_account.manage");
  const [editing, setEditing] = React.useState<MoneyAccount | "new" | null>(null);
  const rate = db.settings.fx.USD_TZS;

  const rows: Row[] = React.useMemo(() => Object.values(db.moneyAccounts).map((account) => ({ account, balance: accountBalance(db, account) })), [db]);
  const totalTzs: Money = sumIn(rows.filter((r) => r.account.active).map((r) => r.balance), "TZS", rate);

  const columns: Column<Row>[] = [
    {
      key: "name",
      header: "Account",
      sort: (r) => r.account.name,
      csv: (r) => r.account.name,
      cell: (r) => (
        <span className="block leading-tight">
          <span className="block font-medium text-ink">{r.account.name}</span>
          <span className="block text-[13px] text-ink-3 sm:hidden">{kindLabel(r.account.kind)}</span>
        </span>
      ),
    },
    { key: "kind", header: "Kind", sort: (r) => r.account.kind, csv: (r) => kindLabel(r.account.kind), hideBelow: "sm", cell: (r) => <span className="text-ink-2">{kindLabel(r.account.kind)}</span> },
    { key: "currency", header: "Currency", sort: (r) => r.account.currency, csv: (r) => r.account.currency, hideBelow: "md", cell: (r) => <span className="text-[13px] font-semibold tracking-wide text-ink-2">{r.account.currency}</span> },
    {
      key: "opening",
      header: "Opening",
      align: "right",
      hideBelow: "md",
      sort: (r) => r.account.openingBalance.amountMinor * (r.account.currency === "USD" ? rate : 1),
      csv: (r) => r.account.openingBalance.amountMinor / 100,
      cell: (r) => <Amount value={r.account.openingBalance} tone="muted" />,
    },
    {
      key: "balance",
      header: "Balance now",
      align: "right",
      sort: (r) => r.balance.amountMinor * (r.balance.currency === "USD" ? rate : 1),
      csv: (r) => r.balance.amountMinor / 100,
      cell: (r) => <Amount value={r.balance} tone="auto" className="font-medium text-ink" />,
    },
    { key: "status", header: "Status", sort: (r) => (r.account.active ? 0 : 1), csv: (r) => (r.account.active ? "Active" : "Inactive"), hideBelow: "sm", cell: (r) => <StatusChip status={r.account.active ? "user.active" : "user.inactive"} label={r.account.active ? "Active" : "Inactive"} /> },
  ];

  return (
    <div>
      <TabHeading
        title="Money accounts"
        description="Where money is received and paid from. Balances are the opening balance plus every recorded movement."
        viewOnly={!canEdit}
        actions={
          canEdit && (
            <Button onClick={() => setEditing("new")}>
              <Plus /> Add account
            </Button>
          )
        }
      />
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.account.id}
        onRowClick={canEdit ? (r) => setEditing(r.account) : undefined}
        exportName="money-accounts"
        initialSort={{ key: "status", dir: "asc" }}
        footer={
          rows.length > 0 && (
            <TotalsRow
              cells={[
                { content: "Active accounts" },
                { className: "hidden sm:table-cell" },
                { className: "hidden md:table-cell" },
                { className: "hidden md:table-cell" },
                { content: <Amount value={totalTzs} />, align: "right" },
                { className: "hidden sm:table-cell" },
              ]}
            />
          )
        }
        empty={<EmptyState icon={Landmark} title="No money accounts yet" body="Add the bank accounts, tills and cash box the agency uses." action={canEdit && <Button onClick={() => setEditing("new")}><Plus /> Add the first account</Button>} />}
      />
      {rows.some((r) => r.account.currency === "USD") && (
        <p className="mt-2 text-[13px] text-ink-3">
          Total converted at 1 USD = TZS {rate.toLocaleString("en-US")}.
        </p>
      )}
      <MoneyAccountDialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} account={editing && editing !== "new" ? editing : undefined} />
    </div>
  );
}

function MoneyAccountDialog({ open, onOpenChange, account }: { open: boolean; onOpenChange: (o: boolean) => void; account?: MoneyAccount }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">{open && <AccountForm account={account} onDone={() => onOpenChange(false)} />}</DialogContent>
    </Dialog>
  );
}

function AccountForm({ account, onDone }: { account?: MoneyAccount; onDone: () => void }) {
  const dispatch = useDispatch();
  const [name, setName] = React.useState(account?.name ?? "");
  const [kind, setKind] = React.useState<MoneyAccount["kind"]>(account?.kind ?? "bank");
  const [currency, setCurrency] = React.useState<Currency>(account?.currency ?? "TZS");
  const [opening, setOpening] = React.useState<number | null>(account?.openingBalance.amountMinor ?? 0);
  const [active, setActive] = React.useState(account?.active ?? true);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return setErrors({ name: "Name the account the way staff know it, e.g. CRDB USD or M-Pesa till." });
    const r = dispatch(
      upsertMoneyAccount,
      { account: { id: account?.id, name: name.trim(), kind, currency, openingBalance: { amountMinor: opening ?? 0, currency }, active } },
      { quietErrors: true },
    );
    if (r.ok) return onDone();
    const field = r.error.field?.split(".").pop();
    setErrors(field && ["name", "currency", "openingBalance"].includes(field) ? { [field]: r.error.message } : { form: r.error.message });
  };

  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-col">
      <DialogHeader>
        <DialogTitle>{account ? `Edit ${account.name}` : "Add money account"}</DialogTitle>
        <DialogDescription>Payments in, supplier payments and expenses each name the account the money moved through.</DialogDescription>
      </DialogHeader>
      <DialogBody className="space-y-4">
        <FieldGrid cols={2}>
          <Field label="Name" htmlFor="acc-name" required error={errors.name} className="sm:col-span-2">
            <Input id="acc-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="e.g. CRDB TZS, M-Pesa till 123456, Cash box" aria-invalid={Boolean(errors.name) || undefined} />
          </Field>
          <Field label="Kind">
            <FilterSelect label="Kind" value={kind} onChange={(v) => setKind(v as MoneyAccount["kind"])} options={ACCOUNT_KINDS} full />
          </Field>
          <Field label="Currency" error={errors.currency} hint={account ? "Fixed once money has moved through the account." : undefined}>
            <Segmented<Currency>
              label="Currency"
              value={currency}
              onChange={(c) => {
                setCurrency(c);
              }}
              options={[
                { value: "TZS", label: "TZS" },
                { value: "USD", label: "USD" },
              ]}
            />
          </Field>
          <Field label="Opening balance" htmlFor="acc-open" error={errors.openingBalance} hint="What the account held when you started using Aeropath." className="sm:col-span-2">
            <MoneyInput id="acc-open" value={opening} onChange={setOpening} currency={currency} className="sm:max-w-[240px]" />
          </Field>
        </FieldGrid>
        {account && (
          <label className="flex items-start gap-3 border-t border-rule pt-4">
            <Switch checked={active} onCheckedChange={setActive} className="mt-0.5" />
            <span className="text-sm leading-5">
              <span className="block font-medium text-ink">Active</span>
              <span className="block text-ink-3">Inactive accounts keep their history but can&rsquo;t be chosen for new payments or expenses.</span>
            </span>
          </label>
        )}
        {errors.form && <p role="alert" className="text-sm text-[var(--st-red-fg)]">{errors.form}</p>}
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">{account ? "Save changes" : "Add account"}</Button>
      </DialogFooter>
    </form>
  );
}
