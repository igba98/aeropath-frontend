import { z } from "zod";
import type { Command, Currency, ID, MoneyAccount } from "../types";
import { makeAudit } from "../audit";
import { format, zero } from "../money";
import { denied, fail, ok, parse, produce } from "./_helpers";
import { zCurrency, zMoney, zText } from "./_schemas";

export interface UpsertMoneyAccountInput {
  account: Partial<MoneyAccount> & { name: string; kind: MoneyAccount["kind"]; currency: Currency };
}

export interface UpsertMoneyAccountResult {
  accountId: ID;
}

const schema = z.object({
  id: z.preprocess((v) => (v === "" || v === null ? undefined : v), z.string().optional()),
  name: zText("Account name"),
  kind: z.enum(["cash", "bank", "mobile_money", "card"]),
  currency: zCurrency,
  openingBalance: zMoney.optional(),
  active: z.boolean().optional(),
});

/** Manager only. The opening balance defaults to zero; the currency cannot change once money has moved. */
export const upsertMoneyAccount: Command<UpsertMoneyAccountInput, UpsertMoneyAccountResult> = (state, input, ctx) => {
  const no = denied(ctx, "money_account.manage");
  if (no) return no;
  const parsed = parse(schema, input?.account, "account");
  if (!parsed.ok) return parsed;
  const f = parsed.data;

  const existing = f.id ? state.moneyAccounts[f.id] : undefined;
  if (f.id && !existing) return fail("NOT_FOUND", "This account could not be found.", "account.id");
  const opening = f.openingBalance ?? existing?.openingBalance ?? zero(f.currency);
  if (opening.currency !== f.currency) return fail("VALIDATION", `Enter the opening balance in ${f.currency}.`, "account.openingBalance");
  if (existing && existing.currency !== f.currency) {
    const used = state.ledger.some((e) => e.sub?.type === "money_account" && e.sub.id === existing.id);
    if (used) {
      return fail("CONFLICT", `${existing.name} already has transactions in ${existing.currency}, so its currency cannot change. Create a new account instead.`, "account.currency");
    }
  }

  const id = existing?.id ?? ctx.newId("acc");
  const account: MoneyAccount = { id, name: f.name, kind: f.kind, currency: f.currency, openingBalance: opening, active: f.active ?? existing?.active ?? true };
  const next = produce(state, (d) => {
    d.moneyAccounts[id] = account;
  });
  const what = existing ? `Money account ${account.name} updated${account.active ? "" : " (inactive)"}` : `Money account ${account.name} added (opening balance ${format(opening)})`;
  const action = existing ? "money_account.updated" : "money_account.created";
  return ok(next, [makeAudit(ctx, action, "money_account", id, what)], { accountId: id }, existing ? "Account saved" : `${account.name} added`);
};
