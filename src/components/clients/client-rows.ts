import type { BookingFile, Client, DbState, ID } from "@/domain/types";
import { clientBalance, clientCreditUsage, type ClientBalance, type CreditUsage } from "@/domain/selectors/balances";

/** One row of the clients list, derived from the normalised tables. */
export interface ClientRow {
  id: ID;
  client: Client;
  bookings: number;
  lastFile?: BookingFile;
  bal: ClientBalance;
  state: "owing" | "credit" | "settled";
  credit: CreditUsage | null;
}

export type BalanceState = ClientRow["state"];

export const balanceState = (b: ClientBalance): BalanceState => (b.balance.amountMinor > 0 ? "owing" : b.balance.amountMinor < 0 ? "credit" : "settled");

export function clientRows(db: DbState, now: Date): ClientRow[] {
  const byClient = new Map<ID, BookingFile[]>();
  for (const f of Object.values(db.files)) {
    const list = byClient.get(f.clientId);
    if (list) list.push(f);
    else byClient.set(f.clientId, [f]);
  }
  return Object.values(db.clients).map((client) => {
    const files = byClient.get(client.id) ?? [];
    const lastFile = files.reduce<BookingFile | undefined>((a, f) => (!a || f.createdAt > a.createdAt ? f : a), undefined);
    const bal = clientBalance(db, client.id, now);
    return { id: client.id, client, bookings: files.length, lastFile, bal, state: balanceState(bal), credit: clientCreditUsage(db, client.id, now) };
  });
}

/** Chip for a client balance: Overdue (hatched) beats Owing; Credit; Settled. */
export function balanceChip(b: ClientBalance): { status: string; label?: string } {
  const s = balanceState(b);
  if (s === "owing") return b.overdue.amountMinor > 0 ? { status: "pay.overdue" } : { status: "pay.owed", label: "Owing" };
  if (s === "credit") return { status: "pay.credit" };
  return { status: "pay.settled" };
}
