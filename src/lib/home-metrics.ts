import type { Currency, DbState, ID, Money, PaymentMethod, ServiceLine } from "@/domain/types";
import { convert } from "@/domain/money";
import { margin } from "@/domain/pricing";
import { darToday } from "./dates";

/** Figures for the role dashboards (spec §9.1). All amounts converted to one display currency at the current rate. */

const issuedAt = (l: ServiceLine): string | undefined => [...l.statusHistory].reverse().find((h) => h.to === "issued")?.at;
const COUNTED = new Set(["issued", "completed", "refund_pending", "refunded", "exchanged"]);

function monthBounds(now: Date, offset = 0, sameDays = false): { from: string; to: string } {
  const today = darToday(now);
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7)) - 1 + offset;
  const start = new Date(Date.UTC(y, m, 1));
  let end = new Date(Date.UTC(y, m + 1, 1));
  if (sameDays) {
    // Month-to-date: the same number of days as today into the month.
    const cut = new Date(Date.UTC(y, m, Number(today.slice(8, 10)) + 1));
    if (cut < end) end = cut;
  }
  return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}

const inRange = (iso: string | undefined, r: { from: string; to: string }) => Boolean(iso && iso.slice(0, 10) >= r.from && iso.slice(0, 10) < r.to);

export interface SalesFigure {
  count: number;
  sell: Money;
  margin: Money;
}

/** Lines issued in a month (voided ones excluded), optionally for one agent's files. */
export function salesFor(db: DbState, now: Date, cur: Currency, opts?: { ownerId?: ID; monthOffset?: number; sameDays?: boolean }): SalesFigure {
  const r = monthBounds(now, opts?.monthOffset ?? 0, opts?.sameDays);
  const rate = db.settings.fx.USD_TZS;
  let count = 0;
  let sell = 0;
  let mar = 0;
  for (const l of Object.values(db.lines)) {
    if (!COUNTED.has(l.status)) continue;
    if (opts?.ownerId && db.files[l.fileId]?.ownerId !== opts.ownerId) continue;
    if (!inRange(issuedAt(l), r)) continue;
    count++;
    sell += convert(l.pricing.sell, cur, rate).amountMinor;
    mar += convert(margin(l.pricing), cur, rate).amountMinor;
  }
  return { count, sell: { amountMinor: sell, currency: cur }, margin: { amountMinor: mar, currency: cur } };
}

/** Money received (payments in, not reversed) in a month. */
export function cashInFor(db: DbState, now: Date, cur: Currency, monthOffset = 0): Money {
  const r = monthBounds(now, monthOffset);
  const rate = db.settings.fx.USD_TZS;
  let v = 0;
  for (const p of Object.values(db.payments)) {
    if (p.direction !== "in" || p.status === "reversed" || !inRange(p.receivedAt, r)) continue;
    v += convert(p.amount, cur, rate).amountMinor;
  }
  return { amountMinor: v, currency: cur };
}

/** Daily sell and margin for the last `days` days (Dar dates), for the manager chart. */
export function salesSeries(db: DbState, now: Date, cur: Currency, days = 30): { date: string; sell: number; margin: number }[] {
  const rate = db.settings.fx.USD_TZS;
  const today = darToday(now);
  const out = new Map<string, { sell: number; margin: number }>();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.parse(today + "T00:00:00Z") - i * 86_400_000).toISOString().slice(0, 10);
    out.set(d, { sell: 0, margin: 0 });
  }
  for (const l of Object.values(db.lines)) {
    if (!COUNTED.has(l.status)) continue;
    const at = issuedAt(l);
    if (!at) continue;
    const d = darToday(new Date(at));
    const slot = out.get(d);
    if (!slot) continue;
    slot.sell += convert(l.pricing.sell, cur, rate).amountMinor / 100;
    slot.margin += convert(margin(l.pricing), cur, rate).amountMinor / 100;
  }
  return [...out.entries()].map(([date, v]) => ({ date, ...v }));
}

export function salesByAgent(db: DbState, now: Date, cur: Currency): { name: string; initials: string; sell: number; margin: number }[] {
  return Object.values(db.users)
    .filter((u) => u.role !== "accountant")
    .map((u) => {
      const f = salesFor(db, now, cur, { ownerId: u.id });
      return { name: u.name, initials: u.initials, sell: f.sell.amountMinor / 100, margin: f.margin.amountMinor / 100 };
    })
    .sort((a, b) => b.sell - a.sell);
}

export function topClients(db: DbState, now: Date, cur: Currency, n = 5): { clientId: ID; name: string; sell: Money; files: number }[] {
  const r = monthBounds(now, 0);
  const r3 = { from: monthBounds(now, -2).from, to: r.to };
  const rate = db.settings.fx.USD_TZS;
  const acc = new Map<ID, { sell: number; files: Set<ID> }>();
  for (const l of Object.values(db.lines)) {
    if (!COUNTED.has(l.status) || !inRange(issuedAt(l), r3)) continue;
    const f = db.files[l.fileId];
    if (!f) continue;
    const a = acc.get(f.clientId) ?? { sell: 0, files: new Set<ID>() };
    a.sell += convert(l.pricing.sell, cur, rate).amountMinor;
    a.files.add(f.id);
    acc.set(f.clientId, a);
  }
  return [...acc.entries()]
    .map(([clientId, a]) => ({ clientId, name: db.clients[clientId]?.name ?? "—", sell: { amountMinor: a.sell, currency: cur }, files: a.files.size }))
    .sort((a, b) => b.sell.amountMinor - a.sell.amountMinor)
    .slice(0, n);
}

/** Today's receipts grouped by payment method. */
export function receiptsToday(db: DbState, now: Date, cur: Currency): { method: PaymentMethod; count: number; amount: Money }[] {
  const today = darToday(now);
  const rate = db.settings.fx.USD_TZS;
  const acc = new Map<PaymentMethod, { count: number; v: number }>();
  for (const p of Object.values(db.payments)) {
    if (p.direction !== "in" || p.status === "reversed" || darToday(new Date(p.receivedAt)) !== today) continue;
    const a = acc.get(p.method) ?? { count: 0, v: 0 };
    a.count++;
    a.v += convert(p.amount, cur, rate).amountMinor;
    acc.set(p.method, a);
  }
  return [...acc.entries()].map(([method, a]) => ({ method, count: a.count, amount: { amountMinor: a.v, currency: cur } })).sort((a, b) => b.amount.amountMinor - a.amount.amountMinor);
}

/** Percent change, or null when there's nothing to compare against. */
export function trend(cur: number, prev: number): number | null {
  if (!prev) return cur ? null : 0;
  return Math.round(((cur - prev) / Math.abs(prev)) * 100);
}
