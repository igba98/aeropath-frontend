import type { Client, Currency, DbState, ID, ISODate, ISODateTime, Money } from "@/domain/types";
import { add, money, sub, zero } from "@/domain/money";
import { toDarDate } from "@/domain/dates";
import { fileTotals } from "@/domain/selectors/fileTotals";
import { PAYMENT_METHODS } from "@/store/seed/reference";
import { fmtDate, fmtRange } from "@/lib/dates";

/**
 * Client statement (spec §9.6, §9.12): issued invoices (debit) and payments (credit; refund payouts debit) in time
 * order with a running balance, in ONE currency — a client with USD and TZS bookings gets one statement per currency,
 * so nothing is converted. Superseded/void invoices and reversed payments are listed struck and do not count.
 */

export interface StatementRow {
  id: string;
  at: ISODateTime;
  date: ISODate;
  kind: "invoice" | "payment_in" | "payment_out";
  /** INV-/RCT-/RFD- number. */
  number: string;
  description: string;
  fileIds: ID[];
  debit?: Money;
  credit?: Money;
  struck: boolean;
  note?: string;
  /** Running balance after this row (counted rows only). */
  balance?: Money;
  /** Where the reference links to: the printed invoice or the payment drawer. */
  href: string;
}

export interface Statement {
  client: Client;
  currency: Currency;
  /** Currencies the client has bookings in (default currency first). */
  currencies: Currency[];
  from?: ISODate;
  to?: ISODate;
  opening: Money;
  closing: Money;
  totalDebit: Money;
  totalCredit: Money;
  rows: StatementRow[];
  /** Live balance of the client's bookings in this currency (fileTotals). */
  liveBalance: Money;
  /** liveBalance − all-time statement balance: charges not on a current invoice yet (or credits not re-invoiced). */
  unbilled: Money;
}

/** "1–30 Sep 2026", "From 1 Sep 2026", "Up to 30 Sep 2026", or "All dates". */
export function periodLabel(from?: string | null, to?: string | null): string {
  if (from && to) return fmtRange(from, to);
  if (from) return `From ${fmtDate(from)}`;
  if (to) return `Up to ${fmtDate(to)}`;
  return "All dates";
}

const METHOD = Object.fromEntries(PAYMENT_METHODS.map((m) => [m.value, m.label])) as Record<string, string>;

export function statementCurrencies(db: DbState, clientId: ID): Currency[] {
  const client = db.clients[clientId];
  const set = new Set<Currency>(Object.values(db.files).filter((f) => f.clientId === clientId).map((f) => f.currency));
  const def = client?.defaultCurrency ?? "TZS";
  if (!set.size) return [def];
  return [...set].sort((a, b) => (a === def ? -1 : b === def ? 1 : a.localeCompare(b)));
}

export function clientStatement(db: DbState, clientId: ID, opts: { from?: string | null; to?: string | null; currency?: string | null } = {}): Statement | null {
  const client = db.clients[clientId];
  if (!client) return null;
  const currencies = statementCurrencies(db, clientId);
  const currency: Currency = currencies.includes(opts.currency as Currency) ? (opts.currency as Currency) : currencies[0];
  const from = opts.from || undefined;
  const to = opts.to || undefined;

  const files = Object.values(db.files).filter((f) => f.clientId === clientId && f.currency === currency);
  const fileIds = new Set(files.map((f) => f.id));
  const events: StatementRow[] = [];

  const invoices = Object.values(db.invoices).filter((i) => i.kind === "invoice" && fileIds.has(i.fileId));
  for (const inv of invoices) {
    const file = db.files[inv.fileId]!;
    let note: string | undefined;
    if (inv.status === "superseded") {
      const next = invoices.filter((o) => o.fileId === inv.fileId && o.issuedAt > inv.issuedAt).sort((a, b) => a.issuedAt.localeCompare(b.issuedAt))[0];
      note = next ? `Replaced by ${next.number}` : "Replaced";
    } else if (inv.status === "void") note = "Void (booking cancelled)";
    events.push({
      id: inv.id,
      at: inv.issuedAt,
      date: toDarDate(inv.issuedAt),
      kind: "invoice",
      number: inv.number,
      description: `Invoice · ${file.number} ${file.title}`,
      fileIds: [file.id],
      debit: inv.snapshot.total,
      struck: inv.status !== "issued",
      note,
      href: `/print/invoice/${inv.id}`,
    });
  }

  for (const p of Object.values(db.payments)) {
    const allocs = p.allocations.filter((a) => fileIds.has(a.fileId));
    if (!allocs.length) continue;
    const amount = money(
      allocs.reduce((s, a) => s + a.amount.amountMinor, 0),
      currency,
    );
    const nums = [...new Set(allocs.map((a) => db.files[a.fileId]?.number).filter(Boolean))].join(", ");
    const out = p.direction === "out";
    events.push({
      id: p.id,
      at: p.receivedAt,
      date: toDarDate(p.receivedAt),
      kind: out ? "payment_out" : "payment_in",
      number: p.number,
      description: out ? `Refund paid · ${nums}` : `Payment · ${METHOD[p.method] ?? p.method}${p.reference ? ` ${p.reference}` : ""} · ${nums}`,
      fileIds: allocs.map((a) => a.fileId),
      debit: out ? amount : undefined,
      credit: out ? undefined : amount,
      struck: p.status === "reversed",
      note: p.status === "reversed" && p.reversal ? `Reversed ${fmtDate(p.reversal.at)}: ${p.reversal.reason}` : undefined,
      href: `/payments?tab=received&open=${p.id}`,
    });
  }

  events.sort((a, b) => a.at.localeCompare(b.at) || (a.kind === "invoice" ? -1 : 1));

  const z = zero(currency);
  let running = z;
  let opening = z;
  let totalDebit = z;
  let totalCredit = z;
  const rows: StatementRow[] = [];
  for (const e of events) {
    const delta = e.struck ? z : sub(e.debit ?? z, e.credit ?? z);
    running = add(running, delta);
    if (from && e.date < from) {
      opening = running;
      continue;
    }
    if (to && e.date > to) continue;
    if (!e.struck) {
      if (e.debit) totalDebit = add(totalDebit, e.debit);
      if (e.credit) totalCredit = add(totalCredit, e.credit);
    }
    rows.push({ ...e, balance: e.struck ? undefined : add(opening, sub(totalDebit, totalCredit)) });
  }
  const allTime = running;
  const liveBalance = files.reduce((acc, f) => add(acc, fileTotals(db, f.id).balance), z);

  return {
    client,
    currency,
    currencies,
    from,
    to,
    opening,
    closing: add(opening, sub(totalDebit, totalCredit)),
    totalDebit,
    totalCredit,
    rows,
    liveBalance,
    unbilled: sub(liveBalance, allTime),
  };
}
