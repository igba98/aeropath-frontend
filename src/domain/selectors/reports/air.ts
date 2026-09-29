import type { BookingFile, Client, Currency, DbState, FlightLine, ID, ISODateTime, Money, RefundRequest, ServiceLine, User } from "../../types";
import { add, money, neg, sub, zero } from "../../money";
import { normaliseTicket } from "../../validation";
import { WAS_ISSUED_STATUSES } from "../../status/line-statuses";
import { flightCost } from "../../pricing";
import { inPeriod, lineEventAt, lineIssuedAt, toChart, toCur } from "./common";
import { commissionOf } from "./sales";
import type { ChartSpec, ReportParams, ReportResult } from "./types";

/** Airline sales, voids and refunds, and the air settlement (BSP / consolidator) period (spec §9.10). */

const flights = (db: DbState): FlightLine[] => Object.values(db.lines).filter((l): l is FlightLine => l.type === "flight");

/** The approved refund (kind refund) of a line, if any. */
const refundOfLine = (db: DbState, lineId: ID): RefundRequest | undefined =>
  Object.values(db.refunds).find((r) => r.lineId === lineId && r.kind === "refund" && (r.status === "approved" || r.status === "paid" || r.status === "closed"));

const ownerOk = (db: DbState, line: ServiceLine, agentId?: ID) => !agentId || db.files[line.fileId]?.ownerId === agentId;

// ───────────────────────────── Airline sales ─────────────────────────────

export interface AirlineRow {
  id: string;
  carrier: string;
  name: string;
  ticketsIssued: number;
  ticketsVoided: number;
  ticketsRefunded: number;
  /** Display currency. */
  fare: Money;
  commission: Money;
  /** Net cost of voided tickets (reversed). */
  voided: Money;
  /** Supplier credit on refunded tickets (fare returned by the airline less its penalty). */
  refunded: Money;
  /** fare − commission − voided − refunded: what the settlement owes the airline for the period. */
  net: Money;
}

export function airlineSalesReport(db: DbState, p: ReportParams): ReportResult<AirlineRow, Omit<AirlineRow, "id" | "carrier" | "name">> {
  const c = p.displayCurrency;
  const m = new Map<string, AirlineRow>();
  const currencies = new Set<Currency>();
  const row = (carrier: string): AirlineRow => {
    let r = m.get(carrier);
    if (!r) {
      const z = zero(c);
      r = { id: carrier, carrier, name: db.settings.airlines.find((a) => a.code === carrier)?.name ?? carrier, ticketsIssued: 0, ticketsVoided: 0, ticketsRefunded: 0, fare: z, commission: z, voided: z, refunded: z, net: z };
      m.set(carrier, r);
    }
    return r;
  };
  for (const line of flights(db)) {
    if (!WAS_ISSUED_STATUSES.includes(line.status) || !ownerOk(db, line, p.agentId)) continue;
    const d = line.details;
    const carrier = d.validatingCarrier || d.segments[0]?.carrier || "—";
    const tickets = d.passengers.filter((x) => x.ticketNumber).length;
    const fare = d.fare.totalFare;
    currencies.add(fare.currency);
    if (inPeriod(lineIssuedAt(line), p)) {
      const r = row(carrier);
      r.ticketsIssued += tickets;
      r.fare = add(r.fare, toCur(db, fare, c));
      r.commission = add(r.commission, toCur(db, commissionOf(fare, d.fare.commissionPct), c));
    }
    if (line.status === "voided" && inPeriod(lineEventAt(line, "voided"), p)) {
      const r = row(carrier);
      r.ticketsVoided += tickets;
      r.voided = add(r.voided, toCur(db, flightCost(d.fare), c));
    }
    if (line.status === "refunded" && inPeriod(lineEventAt(line, "refunded"), p)) {
      const r = row(carrier);
      r.ticketsRefunded += tickets;
      const refund = refundOfLine(db, line.id);
      if (refund) r.refunded = add(r.refunded, toCur(db, refund.quote.supplierCredit, c));
    }
  }
  const rows = [...m.values()].map((r) => ({ ...r, net: sub(sub(sub(r.fare, r.commission), r.voided), r.refunded) })).sort((a, b) => b.fare.amountMinor - a.fare.amountMinor);
  const z = zero(c);
  const totals = rows.reduce(
    (t, r) => ({
      ticketsIssued: t.ticketsIssued + r.ticketsIssued,
      ticketsVoided: t.ticketsVoided + r.ticketsVoided,
      ticketsRefunded: t.ticketsRefunded + r.ticketsRefunded,
      fare: add(t.fare, r.fare),
      commission: add(t.commission, r.commission),
      voided: add(t.voided, r.voided),
      refunded: add(t.refunded, r.refunded),
      net: add(t.net, r.net),
    }),
    { ticketsIssued: 0, ticketsVoided: 0, ticketsRefunded: 0, fare: z, commission: z, voided: z, refunded: z, net: z },
  );
  const chart: ChartSpec = {
    kind: "bar",
    title: "Fare by airline",
    xKey: "label",
    xFormat: "text",
    horizontal: true,
    unit: c,
    data: rows.slice(0, 12).map((r) => ({ label: r.carrier, fare: toChart(r.fare), net: toChart(r.net) })),
    series: [
      { key: "fare", label: "Fare", color: 1 },
      { key: "net", label: "Net", color: 2 },
    ],
  };
  return {
    summary: [
      { label: "Tickets issued", value: totals.ticketsIssued },
      { label: "Voided", value: totals.ticketsVoided },
      { label: "Refunded", value: totals.ticketsRefunded },
      { label: "Fare total", value: totals.fare },
      { label: "Commission", value: totals.commission },
      { label: "Net to settle", value: totals.net },
    ],
    charts: rows.length ? [chart] : [],
    rows,
    totals,
    currency: c,
    fxRate: db.settings.fx.USD_TZS,
    converted: currencies.size > 1 || [...currencies].some((x) => x !== c),
  };
}

// ───────────────────────────── Voids and refunds ─────────────────────────────

export interface VoidRefundRow {
  id: string;
  kind: "void" | "refund" | "exchange";
  /** Refund request number (RFQ-…) for refunds and exchanges. */
  number?: string;
  /** Void date, or the date the request was made. */
  at: ISODateTime;
  file: BookingFile;
  client?: Client;
  line: ServiceLine;
  tickets: string[];
  /** Void: sell reversed · refund: client refund · exchange: additional fare + change fee. Display currency. */
  amount: Money;
  penalty: Money;
  agencyFee: Money;
  /** 'voided' or the refund request status. */
  status: string;
  requestedBy?: User;
  decidedBy?: User;
  decidedAt?: ISODateTime;
  /** Line currency amount behind `amount`. */
  original: Money;
}

const ticketsOf = (line: ServiceLine) => (line.type === "flight" ? line.details.passengers.map((x) => x.ticketNumber).filter((t): t is string => !!t) : []);

export function voidsRefundsReport(db: DbState, p: ReportParams): ReportResult<VoidRefundRow, { amount: Money; penalty: Money; agencyFee: Money }> {
  const c = p.displayCurrency;
  const rows: VoidRefundRow[] = [];
  for (const line of Object.values(db.lines)) {
    if (line.status !== "voided" || !ownerOk(db, line, p.agentId)) continue;
    const at = lineEventAt(line, "voided");
    const file = db.files[line.fileId];
    if (!at || !file || !inPeriod(at, p)) continue;
    const h = line.statusHistory.find((x) => x.to === "voided");
    rows.push({
      id: `void:${line.id}`,
      kind: "void",
      at,
      file,
      client: db.clients[file.clientId],
      line,
      tickets: ticketsOf(line),
      amount: toCur(db, line.pricing.sell, c),
      penalty: zero(c),
      agencyFee: zero(c),
      status: "voided",
      requestedBy: h ? db.users[h.by] : undefined,
      original: line.pricing.sell,
    });
  }
  for (const r of Object.values(db.refunds)) {
    const line = db.lines[r.lineId];
    const file = db.files[r.fileId];
    if (!line || !file || !ownerOk(db, line, p.agentId)) continue;
    if (!inPeriod(r.requestedAt, p) && !inPeriod(r.decidedAt, p)) continue;
    const original = r.kind === "exchange" && r.exchange ? add(r.exchange.additionalFare, r.exchange.changeFee) : r.quote.clientRefund;
    rows.push({
      id: `refund:${r.id}`,
      kind: r.kind,
      number: r.number,
      at: r.requestedAt,
      file,
      client: db.clients[file.clientId],
      line,
      tickets: ticketsOf(line),
      amount: toCur(db, original, c),
      penalty: toCur(db, r.quote.supplierPenalty, c),
      agencyFee: toCur(db, r.quote.agencyFee, c),
      status: r.status,
      requestedBy: db.users[r.requestedBy],
      decidedBy: r.decidedBy ? db.users[r.decidedBy] : undefined,
      decidedAt: r.decidedAt,
      original,
    });
  }
  rows.sort((a, b) => b.at.localeCompare(a.at));
  const sum = (list: VoidRefundRow[], k: "amount" | "penalty" | "agencyFee") => list.reduce((acc, r) => add(acc, r[k]), zero(c));
  const voids = rows.filter((r) => r.kind === "void");
  const refunds = rows.filter((r) => r.kind === "refund");
  const exchanges = rows.filter((r) => r.kind === "exchange");
  return {
    summary: [
      { label: "Voids", value: voids.length },
      { label: "Voided value", value: sum(voids, "amount") },
      { label: "Refunds", value: refunds.length },
      { label: "Client refunds", value: sum(refunds.filter((r) => r.status !== "rejected"), "amount") },
      { label: "Exchanges", value: exchanges.length },
      { label: "Penalties", value: sum(rows.filter((r) => r.status !== "rejected"), "penalty") },
      { label: "Agency fees", value: sum(rows.filter((r) => r.status !== "rejected"), "agencyFee") },
      { label: "Awaiting decision", value: rows.filter((r) => r.status === "requested").length },
    ],
    charts: [],
    rows,
    totals: { amount: sum(rows, "amount"), penalty: sum(rows, "penalty"), agencyFee: sum(rows, "agencyFee") },
    currency: c,
    fxRate: db.settings.fx.USD_TZS,
    converted: new Set(rows.map((r) => r.original.currency)).size > 1 || rows.some((r) => r.original.currency !== c),
  };
}

// ───────────────────────────── Air settlement period (BSP) ─────────────────────────────

export interface BspRow {
  id: string;
  ticketNumber: string;
  event: "issued" | "voided" | "refunded";
  at: ISODateTime;
  carrier: string;
  recordLocator: string;
  passenger: string;
  file: BookingFile;
  line: FlightLine;
  /** Per-ticket amounts in the fare currency; negative for voids and refunds. */
  fare: Money;
  commission: Money;
  net: Money;
  /** net in the display currency. */
  netDisplay: Money;
}

/** Splits a line amount across its ticketed passengers (the last one absorbs rounding). */
function perTicket(total: Money, n: number, i: number): Money {
  if (n <= 1) return total;
  const each = Math.trunc(total.amountMinor / n);
  return money(i === n - 1 ? total.amountMinor - each * (n - 1) : each, total.currency);
}

export function bspPeriodReport(db: DbState, p: ReportParams): ReportResult<BspRow, { issued: Money; voided: Money; refunded: Money; net: Money }> & { supplierName?: string } {
  const c = p.displayCurrency;
  const settlementId = db.settings.airSettlement.supplierId;
  const settlement = settlementId ? db.suppliers[settlementId] : undefined;
  const rows: BspRow[] = [];
  for (const line of flights(db)) {
    if (!WAS_ISSUED_STATUSES.includes(line.status)) continue;
    if (settlement && line.supplierId !== settlement.id) continue;
    if (!ownerOk(db, line, p.agentId)) continue;
    const file = db.files[line.fileId];
    if (!file) continue;
    const d = line.details;
    const pax = d.passengers.filter((x) => x.ticketNumber);
    const fare = d.fare.totalFare;
    const commission = commissionOf(fare, d.fare.commissionPct);
    const push = (event: BspRow["event"], at: ISODateTime | undefined, sign: 1 | -1, lineNet?: Money) => {
      if (!at || !inPeriod(at, p)) return;
      const net = lineNet ?? sub(fare, commission);
      pax.forEach((x, i) => {
        const f = perTicket(fare, pax.length, i);
        const cm = lineNet ? zero(fare.currency) : perTicket(commission, pax.length, i);
        const n = perTicket(net, pax.length, i);
        rows.push({
          id: `${event}:${line.id}:${x.travellerId}`,
          ticketNumber: x.ticketNumber!,
          event,
          at,
          carrier: d.validatingCarrier,
          recordLocator: d.recordLocator,
          passenger: x.nameInPnr,
          file,
          line,
          fare: sign === 1 ? f : neg(f),
          commission: sign === 1 ? cm : neg(cm),
          net: sign === 1 ? n : neg(n),
          netDisplay: toCur(db, sign === 1 ? n : neg(n), c),
        });
      });
    };
    push("issued", lineIssuedAt(line), 1);
    if (line.status === "voided") push("voided", lineEventAt(line, "voided"), -1);
    if (line.status === "refunded") {
      const refund = refundOfLine(db, line.id);
      if (refund) push("refunded", lineEventAt(line, "refunded"), -1, refund.quote.supplierCredit);
    }
  }
  rows.sort((a, b) => a.at.localeCompare(b.at) || a.ticketNumber.localeCompare(b.ticketNumber));
  const sumEvent = (e?: BspRow["event"]) => rows.filter((r) => !e || r.event === e).reduce((acc, r) => add(acc, r.netDisplay), zero(c));
  const count = (e: BspRow["event"]) => rows.filter((r) => r.event === e).length;
  const totals = { issued: sumEvent("issued"), voided: sumEvent("voided"), refunded: sumEvent("refunded"), net: sumEvent() };
  return {
    summary: [
      { label: "Tickets issued", value: count("issued") },
      { label: "Issued (net)", value: totals.issued },
      { label: "Voided", value: count("voided") },
      { label: "Refunded", value: count("refunded") },
      { label: "Voids and refunds", value: add(totals.voided, totals.refunded) },
      { label: "Net to settle", value: totals.net },
    ],
    charts: [],
    rows,
    totals,
    currency: c,
    fxRate: db.settings.fx.USD_TZS,
    converted: rows.some((r) => r.net.currency !== c),
    supplierName: settlement?.name,
  };
}

// ───────────────────────────── BSP billing match (stretch) ─────────────────────────────

export interface BspMatchRow {
  ticketNumber: string;
  ours?: Money;
  theirs?: number;
  status: "match" | "amount_mismatch" | "missing_in_billing" | "missing_in_ours";
}

/**
 * Matches a BSP billing CSV ("ticket number, amount" per line, header optional, amounts in major units) against the
 * period's tickets by ticket number. A ticket matches when the billed amount equals our fare or our net (±0.01).
 */
export function matchBspBilling(rows: BspRow[], csvText: string): BspMatchRow[] {
  const billed = new Map<string, number>();
  for (const raw of csvText.split(/\r?\n/)) {
    const cells = raw.split(/[,;\t]/).map((s) => s.trim().replace(/^"|"$/g, ""));
    if (cells.length < 2) continue;
    const ticket = normaliseTicket(cells[0]);
    const amount = Number(cells[1].replace(/[^\d.-]/g, ""));
    if (!ticket || !Number.isFinite(amount)) continue;
    billed.set(ticket, (billed.get(ticket) ?? 0) + amount);
  }
  const ours = new Map<string, { fare: Money; net: Money }>();
  for (const r of rows) {
    const t = normaliseTicket(r.ticketNumber) ?? r.ticketNumber;
    const cur = ours.get(t);
    ours.set(t, cur ? { fare: add(cur.fare, r.fare), net: add(cur.net, r.net) } : { fare: r.fare, net: r.net });
  }
  const out: BspMatchRow[] = [];
  for (const [ticket, o] of ours) {
    const theirs = billed.get(ticket);
    if (theirs === undefined) {
      out.push({ ticketNumber: ticket, ours: o.net, status: "missing_in_billing" });
      continue;
    }
    const close = (m: Money) => Math.abs(Math.round(theirs * 100) - m.amountMinor) <= 1;
    out.push({ ticketNumber: ticket, ours: o.net, theirs, status: close(o.net) || close(o.fare) ? "match" : "amount_mismatch" });
  }
  for (const [ticket, theirs] of billed) if (!ours.has(ticket)) out.push({ ticketNumber: ticket, theirs, status: "missing_in_ours" });
  const rank = { amount_mismatch: 0, missing_in_ours: 1, missing_in_billing: 2, match: 3 } as const;
  return out.sort((a, b) => rank[a.status] - rank[b.status] || a.ticketNumber.localeCompare(b.ticketNumber));
}
