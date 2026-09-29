"use client";

import * as React from "react";

import type { AccountCode, Currency, DbState, ID } from "@/domain/types";
import type { Subledger } from "@/domain/ledger/accounts";
import { ACCOUNT_LIST, SUBLEDGER_LABEL } from "@/domain/accounting";
import { useApp } from "@/store";
import { Combobox, type ComboOption } from "@/components/shared/combobox";

export const KIND_LABEL = { asset: "Asset", liability: "Liability", equity: "Equity", revenue: "Income", expense: "Expense" } as const;

export function accountOptions(filter?: (code: AccountCode) => boolean): ComboOption[] {
  return ACCOUNT_LIST.filter((a) => !filter || filter(a.code)).map((a) => ({
    value: a.code,
    label: `${a.code} · ${a.name}`,
    hint: KIND_LABEL[a.kind],
    keywords: [a.kind, a.subledger ?? ""],
  }));
}

/** Searchable chart-of-accounts picker. */
export function AccountSelect({
  id,
  value,
  onChange,
  filter,
  invalid,
  size,
  placeholder = "Choose an account",
}: {
  id?: string;
  value: AccountCode | null | undefined;
  onChange: (code: AccountCode) => void;
  filter?: (code: AccountCode) => boolean;
  invalid?: boolean;
  size?: "default" | "sm";
  placeholder?: string;
}) {
  const options = React.useMemo(() => accountOptions(filter), [filter]);
  return <Combobox id={id} value={value} onChange={(v) => onChange(v as AccountCode)} options={options} placeholder={placeholder} searchPlaceholder="Code or name" invalid={invalid} size={size} />;
}

export function subOptions(db: DbState, type: Subledger, currency?: Currency): ComboOption[] {
  if (type === "client")
    return Object.values(db.clients)
      .filter((c) => !c.archived)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((c) => ({ value: c.id, label: c.name, hint: c.type === "corporate" ? "Organisation" : undefined, keywords: [c.phone] }));
  if (type === "supplier")
    return Object.values(db.suppliers)
      .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name))
      .map((s) => ({ value: s.id, label: s.name, hint: s.currency }));
  return Object.values(db.moneyAccounts)
    .filter((a) => a.active && (!currency || a.currency === currency))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((a) => ({ value: a.id, label: a.name, hint: a.currency }));
}

/** Client, supplier or money-account picker for a control account. */
export function SubSelect({
  id,
  type,
  value,
  onChange,
  currency,
  invalid,
  size,
  allowAll,
}: {
  id?: string;
  type: Subledger;
  value: ID | null | undefined;
  onChange: (id: ID) => void;
  /** Money accounts only: limit to one currency. */
  currency?: Currency;
  invalid?: boolean;
  size?: "default" | "sm";
  /** Offer "All …" (value ""), for reports. */
  allowAll?: boolean;
}) {
  const db = useApp((s) => s.db)!;
  const options = React.useMemo(() => {
    const list = subOptions(db, type, currency);
    return allowAll ? [{ value: "__all", label: `All ${SUBLEDGER_LABEL[type].toLowerCase()}s` }, ...list] : list;
  }, [db, type, currency, allowAll]);
  return (
    <Combobox
      id={id}
      value={allowAll && !value ? "__all" : value}
      onChange={(v) => onChange(v === "__all" ? "" : v)}
      options={options}
      placeholder={`Choose a ${SUBLEDGER_LABEL[type].toLowerCase()}`}
      searchPlaceholder={`Search ${SUBLEDGER_LABEL[type].toLowerCase()}s`}
      invalid={invalid}
      size={size}
    />
  );
}
