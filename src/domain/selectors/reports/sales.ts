import type { BookingFile, Client, Currency, DbState, ID, ISODate, ISODateTime, LineStatus, LineType, Money, ServiceLine, User } from "../../types";
import { add, mul, zero } from "../../money";
import { addDaysISO, darToday, toDarDate } from "../../dates";
import { LINE_TYPE_LABELS } from "../../describe";
import { WAS_ISSUED_STATUSES } from "../../status/line-statuses";
import { cached, daysOf, inPeriod, lineIssuedAt, monthsOf, previousPeriod, toChart, toCur, totalsOf, trendOf, weekStart, type Period } from "./common";
import type { Breakdown, ChartSpec, ReportParams, ReportResult, SummaryItem } from "./types";

/**
 * Sales = lines ISSUED in the period (by issue date, Dar calendar), excluding voided lines (a void nets the sale to
 * zero). Refunds and exchanges keep the original sale; they are reported in voids-refunds. My sales = files the agent
 * owns. Amounts convert into the display currency at the current rate.
 */

export interface SaleRow {
  id: ID;
  line: ServiceLine;
  file: BookingFile;
  client?: Client;
  agent?: User;
  issuedAt: ISODateTime;
  type: LineType;
  status: LineStatus;
  /** Validating carrier for flights. */
  carrier?: string;
  tickets: number;
  /** Display currency. */
  sell: Money;
  cost: Money;
  margin: Money;
  /** The line's own selling price (line currency). */
  original: Money;
}

interface RawSale {
  line: ServiceLine;
  file: BookingFile;
  issuedAt: ISODateTime;
}

function allSales(db: DbState): RawSale[] {
  return cached(db, "allSales", () => {
    const out: RawSale[] = [];
    for (const line of Object.values(db.lines)) {
      if (!WAS_ISSUED_STATUSES.includes(line.status) || line.status === "voided") continue;
      const issuedAt = lineIssuedAt(line);
      const file = db.files[line.fileId];
      if (!issuedAt || !file) continue;
      out.push({ line, file, issuedAt });
    }
    return out.sort((a, b) => a.issuedAt.localeCompare(b.issuedAt));
  });
}

/** Sales in a period, optionally for one agent (file owner), in `currency`. */
export function salesRows(db: DbState, period: Period, currency: Currency, agentId?: ID): SaleRow[] {
  return allSales(db)
    .filter((s) => inPeriod(s.issuedAt, period) && (!agentId || s.file.ownerId === agentId))
    .map(({ line, file, issuedAt }) => {
      const p = line.pricing;
      return {
        id: line.id,
        line,
        file,
        client: db.clients[file.clientId],
        agent: db.users[file.ownerId],
        issuedAt,
        type: line.type,
        status: line.status,
        carrier: line.type === "flight" ? line.details.validatingCarrier || undefined : undefined,
        tickets: line.type === "flight" ? line.details.passengers.filter((x) => x.ticketNumber).length : 0,
        sell: toCur(db, p.sell, currency),
        cost: toCur(db, p.cost, currency),
        margin: toCur(db, add(p.markup, p.serviceFee), currency),
        original: p.sell,
      };
    });
}

const sumOf = (rows: SaleRow[], k: "sell" | "margin" | "cost", c: Currency): Money => rows.reduce((acc, r) => add(acc, r[k]), zero(c));
const mixed = (rows: { original: Money }[]) => new Set(rows.map((r) => r.original.currency)).size > 1;

export const pctText = (part: Money, whole: Money): string => (whole.amountMinor ? `${((part.amountMinor / whole.amountMinor) * 100).toFixed(1)} %` : "—");

/** Groups sale rows into a breakdown sorted by sell. */
export function breakdown(rows: SaleRow[], currency: Currency, keyOf: (r: SaleRow) => { key: string; label: string } | null): Breakdown[] {
  const m = new Map<string, Breakdown>();
  let total = 0;
  for (const r of rows) {
    const k = keyOf(r);
    if (!k) continue;
    const b = m.get(k.key) ?? { key: k.key, label: k.label, count: 0, sell: zero(currency), margin: zero(currency), share: 0 };
    b.count += 1;
    b.sell = add(b.sell, r.sell);
    b.margin = add(b.margin, r.margin);
    m.set(k.key, b);
    total += r.sell.amountMinor;
  }
  return [...m.values()].map((b) => ({ ...b, share: total ? b.sell.amountMinor / total : 0 })).sort((a, b) => b.sell.amountMinor - a.sell.amountMinor);
}

const byType = (r: SaleRow) => ({ key: r.type, label: LINE_TYPE_LABELS[r.type] });
const byAgent = (r: SaleRow) => ({ key: r.file.ownerId, label: r.agent?.name ?? "Unknown agent" });
const byClient = (r: SaleRow) => ({ key: r.file.clientId, label: r.client?.name ?? "Unknown client" });
const byAirline = (db: DbState) => (r: SaleRow) =>
  r.carrier ? { key: r.carrier, label: `${r.carrier} · ${db.settings.airlines.find((a) => a.code === r.carrier)?.name ?? r.carrier}` } : null;

function salesSummary(db: DbState, p: ReportParams, rows: SaleRow[]): SummaryItem[] {
  const c = p.displayCurrency;
  const prev = salesRows(db, previousPeriod(p), c, p.agentId);
  const sell = sumOf(rows, "sell", c);
  const margin = sumOf(rows, "margin", c);
  const files = new Set(rows.map((r) => r.file.id)).size;
  const prevFiles = new Set(prev.map((r) => r.file.id)).size;
  return [
    { label: "Bookings", value: files, trend: trendOf(files, prevFiles) },
    { label: "Services issued", value: rows.length, trend: trendOf(rows.length, prev.length) },
    { label: "Sales", value: sell, trend: trendOf(sell.amountMinor, sumOf(prev, "sell", c).amountMinor) },
    { label: "Margin", value: margin, trend: trendOf(margin.amountMinor, sumOf(prev, "margin", c).amountMinor) },
    { label: "Margin %", value: pctText(margin, sell) },
  ];
}

function breakdownChart(title: string, b: Breakdown[], c: Currency): ChartSpec {
  return {
    kind: "bar",
    title,
    xKey: "label",
    xFormat: "text",
    horizontal: true,
    unit: c,
    data: b.map((x) => ({ label: x.label, sell: toChart(x.sell), margin: toChart(x.margin) })),
    series: [
      { key: "sell", label: "Sales", color: 1 },
      { key: "margin", label: "Margin", color: 2 },
    ],
  };
}

// ───────────────────────────── My sales ─────────────────────────────

export interface MySalesReport extends ReportResult<SaleRow, { sell: Money; margin: Money }> {
  byType: Breakdown[];
}

export function mySalesReport(db: DbState, p: ReportParams): MySalesReport {
  const c = p.displayCurrency;
  const rows = salesRows(db, p, c, p.agentId);
  const types = breakdown(rows, c, byType);
  return {
    summary: salesSummary(db, p, rows),
    charts: [breakdownChart("Sales by service type", types, c)],
    rows,
    byType: types,
    totals: { sell: sumOf(rows, "sell", c), margin: sumOf(rows, "margin", c) },
    currency: c,
    fxRate: db.settings.fx.USD_TZS,
    converted: mixed(rows),
  };
}

// ───────────────────────────── Sales ─────────────────────────────

export type SalesGrouping = "day" | "week" | "month";

export interface SalesReport extends ReportResult<SaleRow, { sell: Money; margin: Money }> {
  grouping: SalesGrouping;
  byAgent: Breakdown[];
  byType: Breakdown[];
  byClient: Breakdown[];
  byAirline: Breakdown[];
}

/** Day buckets up to 31 days, weeks up to ~4 months, months beyond. */
export function autoGrouping(p: Period): SalesGrouping {
  const n = daysOf(p).length;
  return n <= 31 ? "day" : n <= 120 ? "week" : "month";
}

function timeSeries(rows: SaleRow[], p: Period, c: Currency, grouping: SalesGrouping): ChartSpec {
  const keyOf = (d: ISODate) => (grouping === "day" ? d : grouping === "week" ? weekStart(d) : d.slice(0, 7));
  const keys = grouping === "month" ? monthsOf(p) : [...new Set(daysOf(p).map(keyOf))];
  const acc = new Map(keys.map((k) => [k, { sell: 0, margin: 0 }]));
  for (const r of rows) {
    const a = acc.get(keyOf(toDarDate(r.issuedAt)));
    if (!a) continue;
    a.sell += toChart(r.sell);
    a.margin += toChart(r.margin);
  }
  return {
    kind: "composed",
    title: `Sales and margin by ${grouping}`,
    xKey: "period",
    xFormat: grouping === "month" ? "month" : "date",
    unit: c,
    data: keys.map((k) => ({ period: k, sell: Math.round(acc.get(k)!.sell * 100) / 100, margin: Math.round(acc.get(k)!.margin * 100) / 100 })),
    series: [
      { key: "sell", label: "Sales", color: 1, mark: "bar" },
      { key: "margin", label: "Margin", color: 2, mark: "line" },
    ],
  };
}

export function salesReport(db: DbState, p: ReportParams & { grouping?: SalesGrouping }): SalesReport {
  const c = p.displayCurrency;
  const rows = salesRows(db, p, c, p.agentId);
  const grouping = p.grouping ?? autoGrouping(p);
  const agents = breakdown(rows, c, byAgent);
  const types = breakdown(rows, c, byType);
  return {
    summary: salesSummary(db, p, rows),
    charts: [timeSeries(rows, p, c, grouping), breakdownChart("Sales by agent", agents, c)],
    rows,
    grouping,
    byAgent: agents,
    byType: types,
    byClient: breakdown(rows, c, byClient),
    byAirline: breakdown(rows, c, byAirline(db)),
    totals: { sell: sumOf(rows, "sell", c), margin: sumOf(rows, "margin", c) },
    currency: c,
    fxRate: db.settings.fx.USD_TZS,
    converted: mixed(rows),
  };
}

// ───────────────────────────── Profit by booking ─────────────────────────────

export interface ProfitRow {
  id: ID;
  file: BookingFile;
  client?: Client;
  agent?: User;
  /** Display currency (file totals converted at the current rate). */
  charges: Money;
  cost: Money;
  margin: Money;
  /** margin ÷ charges as a fraction (as margin % everywhere else); null when there are no charges. */
  marginPct: number | null;
  fileCurrency: Currency;
}

export function profitReport(db: DbState, p: ReportParams): ReportResult<ProfitRow, { charges: Money; cost: Money; margin: Money }> {
  const c = p.displayCurrency;
  const fileIds = new Set(salesRows(db, p, c, p.agentId).map((r) => r.file.id));
  const rows: ProfitRow[] = [...fileIds].map((id) => {
    const file = db.files[id];
    const t = totalsOf(db, id);
    return {
      id,
      file,
      client: db.clients[file.clientId],
      agent: db.users[file.ownerId],
      charges: toCur(db, t.charges, c),
      cost: toCur(db, t.cost, c),
      margin: toCur(db, t.margin, c),
      marginPct: t.charges.amountMinor ? t.margin.amountMinor / t.charges.amountMinor : null,
      fileCurrency: file.currency,
    };
  });
  rows.sort((a, b) => (a.marginPct ?? 0) - (b.marginPct ?? 0));
  const total = (k: "charges" | "cost" | "margin") => rows.reduce((acc, r) => add(acc, r[k]), zero(c));
  const charges = total("charges");
  const margin = total("margin");
  const thin = rows.filter((r) => r.marginPct !== null && r.marginPct < 0.03).length;
  return {
    summary: [
      { label: "Bookings", value: rows.length },
      { label: "Charges", value: charges },
      { label: "Cost", value: total("cost") },
      { label: "Margin", value: margin },
      { label: "Margin %", value: pctText(margin, charges) },
      { label: "Thin or negative (< 3 %)", value: thin },
    ],
    charts: [],
    rows,
    totals: { charges, cost: total("cost"), margin },
    currency: c,
    fxRate: db.settings.fx.USD_TZS,
    converted: new Set(rows.map((r) => r.fileCurrency)).size > 1 || rows.some((r) => r.fileCurrency !== c),
    notes: ["Bookings with at least one service issued in the period. Charges include every booked and issued service on the booking."],
  };
}

// ───────────────────────────── Home helpers ─────────────────────────────

export interface SalesPoint {
  date: ISODate;
  sell: Money;
  margin: Money;
  count: number;
}

/** Daily sales and margin for the last `days` days including today (TZS by default), for the Manager home chart. */
export function salesSeries(db: DbState, days: number, now: Date, currency: Currency = "TZS"): SalesPoint[] {
  const to = darToday(now);
  const period = { from: addDaysISO(to, -(days - 1)), to };
  const rows = salesRows(db, period, currency);
  const acc = new Map<ISODate, SalesPoint>(daysOf(period).map((d) => [d, { date: d, sell: zero(currency), margin: zero(currency), count: 0 }]));
  for (const r of rows) {
    const pt = acc.get(toDarDate(r.issuedAt));
    if (!pt) continue;
    pt.sell = add(pt.sell, r.sell);
    pt.margin = add(pt.margin, r.margin);
    pt.count += 1;
  }
  return [...acc.values()];
}

export interface AgentSales {
  agent: User;
  files: number;
  lines: number;
  sell: Money;
  margin: Money;
}

/** Sales per agent (file owner) in a period, TZS by default; active agents with no sales are included at zero. */
export function salesByAgent(db: DbState, from: ISODate, to: ISODate, currency: Currency = "TZS"): AgentSales[] {
  const rows = salesRows(db, { from, to }, currency);
  const m = new Map<ID, AgentSales & { fileSet: Set<ID> }>();
  for (const u of Object.values(db.users)) {
    if (u.active && u.role === "agent") m.set(u.id, { agent: u, files: 0, lines: 0, sell: zero(currency), margin: zero(currency), fileSet: new Set() });
  }
  for (const r of rows) {
    const u = db.users[r.file.ownerId];
    if (!u) continue;
    const a = m.get(u.id) ?? { agent: u, files: 0, lines: 0, sell: zero(currency), margin: zero(currency), fileSet: new Set<ID>() };
    a.lines += 1;
    a.fileSet.add(r.file.id);
    a.sell = add(a.sell, r.sell);
    a.margin = add(a.margin, r.margin);
    m.set(u.id, a);
  }
  return [...m.values()]
    .map(({ fileSet, ...a }) => ({ ...a, files: fileSet.size }))
    .sort((a, b) => b.sell.amountMinor - a.sell.amountMinor || a.agent.name.localeCompare(b.agent.name));
}

export interface ClientSales {
  client: Client;
  files: number;
  lines: number;
  sell: Money;
  margin: Money;
}

/** Top `n` clients by sales in a period (TZS by default). */
export function topClients(db: DbState, from: ISODate, to: ISODate, n: number, currency: Currency = "TZS"): ClientSales[] {
  const rows = salesRows(db, { from, to }, currency);
  const m = new Map<ID, ClientSales & { fileSet: Set<ID> }>();
  for (const r of rows) {
    if (!r.client) continue;
    const a = m.get(r.client.id) ?? { client: r.client, files: 0, lines: 0, sell: zero(currency), margin: zero(currency), fileSet: new Set<ID>() };
    a.lines += 1;
    a.fileSet.add(r.file.id);
    a.sell = add(a.sell, r.sell);
    a.margin = add(a.margin, r.margin);
    m.set(r.client.id, a);
  }
  return [...m.values()]
    .map(({ fileSet, ...a }) => ({ ...a, files: fileSet.size }))
    .sort((a, b) => b.sell.amountMinor - a.sell.amountMinor)
    .slice(0, n);
}

/** Airline commission on a fare (fare × commissionPct, rounded half-up). */
export const commissionOf = (fare: Money, pct: number): Money => mul(fare, pct || 0);
