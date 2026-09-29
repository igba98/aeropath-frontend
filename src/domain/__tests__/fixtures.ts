import type { Command, CommandResult, Ctx, DbState, ID, MoneyAccount, Supplier, User } from "../types";
import { createEmptyDb } from "../defaults";
import { runCommand } from "../commands/run";

/** Test world: empty DB with default settings, the four demo users, a few suppliers and accounts, deterministic ids. */

export const NOW = new Date("2026-09-28T09:00:00.000Z"); // 12:00 in Dar es Salaam

export type UserKey = "neema" | "baraka" | "peter" | "grace";

export interface World {
  db: DbState;
  users: Record<UserKey, User>;
  newId: (prefix: string) => ID;
  now: Date;
  sup: { consolidator: ID; hotel: ID; transfer: ID };
  acc: { cashTzs: ID; crdbUsd: ID; crdbTzs: ID; mpesa: ID };
}

export function makeIdFactory(): (prefix: string) => ID {
  let n = 0;
  return (prefix) => `${prefix}_${String(++n).padStart(5, "0")}`;
}

const user = (id: ID, name: string, role: User["role"]): User => ({
  id,
  name,
  initials: name
    .split(" ")
    .map((w) => w[0])
    .join(""),
  email: `${name.split(" ")[0].toLowerCase()}@aeropath.co.tz`,
  role,
  active: true,
  createdAt: NOW.toISOString(),
});

const supplier = (id: ID, name: string, kind: Supplier["kind"], currency: Supplier["currency"]): Supplier => ({ id, name, kind, currency, paymentTermsDays: 30, active: true });

const account = (id: ID, name: string, kind: MoneyAccount["kind"], currency: MoneyAccount["currency"]): MoneyAccount => ({
  id,
  name,
  kind,
  currency,
  openingBalance: { amountMinor: 0, currency },
  active: true,
});

export function createWorld(now: Date = NOW): World {
  const db = createEmptyDb(now);
  const users: Record<UserKey, User> = {
    neema: user("usr_neema", "Neema Mushi", "agent"),
    baraka: user("usr_baraka", "Baraka Lema", "agent"),
    peter: user("usr_peter", "Peter Mwakalinga", "accountant"),
    grace: user("usr_grace", "Grace Kimaro", "manager"),
  };
  for (const u of Object.values(users)) db.users[u.id] = u;

  const sup = { consolidator: "sup_air", hotel: "sup_hotel", transfer: "sup_transfer" };
  db.suppliers[sup.consolidator] = supplier(sup.consolidator, "Air Consolidator", "air_settlement", "USD");
  db.suppliers[sup.hotel] = supplier(sup.hotel, "Serena Hotel", "hotel", "USD");
  db.suppliers[sup.transfer] = supplier(sup.transfer, "Dar Transfers", "transfer", "TZS");
  db.settings.airSettlement.supplierId = sup.consolidator;

  const acc = { cashTzs: "acc_cash_tzs", crdbUsd: "acc_crdb_usd", crdbTzs: "acc_crdb_tzs", mpesa: "acc_mpesa" };
  db.moneyAccounts[acc.cashTzs] = account(acc.cashTzs, "Cash box TZS", "cash", "TZS");
  db.moneyAccounts[acc.crdbUsd] = account(acc.crdbUsd, "CRDB USD", "bank", "USD");
  db.moneyAccounts[acc.crdbTzs] = account(acc.crdbTzs, "CRDB TZS", "bank", "TZS");
  db.moneyAccounts[acc.mpesa] = account(acc.mpesa, "M-Pesa Till", "mobile_money", "TZS");

  return { db, users, newId: makeIdFactory(), now, sup, acc };
}

export function ctxFor(w: World, who: UserKey, now: Date = w.now): Ctx {
  return { user: w.users[who], now, settings: w.db.settings, newId: w.newId };
}

/** Runs a command against the world without applying it. */
export function attempt<I, R>(w: World, cmd: Command<I, R>, input: I, who: UserKey, now?: Date): CommandResult<R> {
  return runCommand(w.db, cmd, input, ctxFor(w, who, now));
}

/** Runs a command, applies the new state to the world and returns its result. Throws on failure. */
export function run<I, R>(w: World, cmd: Command<I, R>, input: I, who: UserKey, now?: Date): R {
  const r = attempt(w, cmd, input, who, now);
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}${r.error.field ? ` [${r.error.field}]` : ""}`);
  w.db = r.state;
  return r.result as R;
}

/** Error of a failed command (throws when it unexpectedly succeeded). */
export function errorOf<R>(r: CommandResult<R>) {
  if (r.ok) throw new Error("Expected the command to fail, but it succeeded");
  return r.error;
}
