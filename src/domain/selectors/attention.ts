import type { BookingFile, Client, DbState, FlightLine, ID, Role, ServiceLine, User } from "../types";
import { format, zero } from "../money";
import { darToday, diffDaysISO, shortDate, toDarDate, toDarLocal } from "../dates";
import { refundNeedsManager } from "../permissions";
import { currentInvoice, isInvoiceOutdated } from "./core";
import { fileStatus, travelDates } from "../status/file-status";
import { isVoidWindowOpen } from "../status/line-machine";
import { METHOD_LABELS } from "../commands/recordPayment";
import { clientCreditUsage, supplierOpenItems } from "./balances";
import { addIn, linesByFile, totalsOf } from "./reports/common";

/**
 * "Needs attention" (spec §9.1). Every rule with its audience; agents see only their own files where the spec says
 * "own". Sorted most urgent first: red, amber, info; then by due date.
 *
 * | Rule                                                        | Shown to                                   |
 * | Ticketing time limit within 48 h on a booked flight         | owner, Manager                             |
 * | Departure within 7 days and balance > 0                     | owner, Accountant, Manager                 |
 * | Quote older than 3 days, still draft                        | owner                                      |
 * | Payment recorded, not verified for more than 24 h           | Accountant, Manager                        |
 * | Refund request awaiting a decision (split by limit)         | Accountant (≤ limit), Manager (all)        |
 * | Approved refund not yet paid out                            | Accountant, Manager                        |
 * | Supplier lines unpaid past the supplier's terms             | Accountant, Manager                        |
 * | Corporate client over their credit limit                    | Accountant, Manager                        |
 * | Issued flight inside its void window                        | owner (information)                        |
 * | Invoice outdated                                            | owner                                      |
 * | Client credit (balance < 0), e.g. after a void (Flow B)     | owner, Accountant, Manager                 |
 *
 * "owner" is the file's agent (a Manager who owns a file sees its owner items too).
 */

export type AttentionKind =
  | "ttl"
  | "departing_unpaid"
  | "stale_quote"
  | "unverified_payment"
  | "refund_decision"
  | "refund_payout"
  | "supplier_overdue"
  | "credit_limit"
  | "void_window"
  | "invoice_outdated"
  | "client_credit";

export type AttentionSeverity = "red" | "amber" | "info";

export interface AttentionItem {
  id: string;
  kind: AttentionKind;
  severity: AttentionSeverity;
  /** One plain sentence. */
  sentence: string;
  /** ISO date or instant the item is about (for the due column). */
  due?: string;
  fileId?: ID;
  clientId?: ID;
  supplierId?: ID;
  refundId?: ID;
  paymentId?: ID;
  lineId?: ID;
  action: { label: string; href: string };
}

export const ATTENTION_KIND_LABELS: Record<AttentionKind, string> = {
  ttl: "Ticketing time limit",
  departing_unpaid: "Departing, not paid",
  stale_quote: "Quote waiting",
  unverified_payment: "Payment to verify",
  refund_decision: "Refund decision",
  refund_payout: "Refund to pay out",
  supplier_overdue: "Supplier overdue",
  credit_limit: "Over credit limit",
  void_window: "Void window open",
  invoice_outdated: "Invoice outdated",
  client_credit: "Client credit",
};

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const SEVERITY_RANK: Record<AttentionSeverity, number> = { red: 0, amber: 1, info: 2 };
const FINANCE: Role[] = ["accountant", "manager"];

/** "30 Sep, 23:59" in Dar es Salaam time. */
const whenDar = (iso: string) => {
  const local = toDarLocal(iso);
  return `${shortDate(local)}, ${local.slice(11, 16)}`;
};

/** The people a file is for: the part after "·" in the title ("Dar → Dubai · Mwakalinga family"), else the client name. */
function whoOf(file: BookingFile, client?: Client): string {
  const parts = file.title.split(" · ");
  return parts.length > 1 ? parts[parts.length - 1].trim() : (client?.name ?? file.title);
}

/** "EK 726" for the first segment, else "flight <PNR>". */
function flightLabel(line: FlightLine): string {
  const s = [...line.details.segments].sort((a, b) => a.segmentNo - b.segmentNo)[0];
  return s ? `${s.carrier} ${s.flightNumber}` : `flight ${line.details.recordLocator}`;
}

const bookingHref = (fileId: ID, q?: string) => `/bookings/${fileId}${q ? `?${q}` : ""}`;

export function attentionItems(db: DbState, user: User, now: Date): AttentionItem[] {
  const role = user.role;
  const isFinance = FINANCE.includes(role);
  const isManager = role === "manager";
  const today = darToday(now);
  const t = now.getTime();
  const items: AttentionItem[] = [];

  // ── File-based rules ──
  for (const file of Object.values(db.files)) {
    if (file.cancelledAt) continue;
    const own = file.ownerId === user.id;
    const client = db.clients[file.clientId];
    const who = whoOf(file, client);
    const lines: ServiceLine[] = linesByFile(db).get(file.id) ?? [];
    const status = fileStatus(db, file.id, now);
    if (status === "cancelled" && !lines.length) continue;
    const totals = totalsOf(db, file.id);
    const base = { fileId: file.id, clientId: file.clientId };

    // Ticketing time limit within 48 h on a booked flight — owner, Manager.
    if (own || isManager) {
      for (const line of lines) {
        if (line.type !== "flight" || line.status !== "booked" || !line.details.ticketingTimeLimit) continue;
        const ttl = line.details.ticketingTimeLimit;
        const left = Date.parse(ttl) - t;
        if (left > 48 * HOUR) continue;
        items.push({
          ...base,
          id: `ttl:${line.id}`,
          kind: "ttl",
          severity: left < 24 * HOUR ? "red" : "amber",
          lineId: line.id,
          due: ttl,
          sentence:
            left < 0
              ? `The time limit to issue ticket ${flightLabel(line)} for ${who} passed on ${whenDar(ttl)}. Issue now or check the booking is still held.`
              : `Ticket ${flightLabel(line)} for ${who} must be issued by ${whenDar(ttl)}.`,
          action: { label: "Issue tickets", href: bookingHref(file.id, `action=issue&line=${line.id}`) },
        });
      }
    }

    // Departure within 7 days and balance > 0 — owner, Accountant, Manager.
    if ((own || isFinance) && status === "confirmed" && totals.balance.amountMinor > 0) {
      const { start } = travelDates(db, file.id);
      if (start) {
        const days = diffDaysISO(today, start);
        if (days >= 0 && days <= 7) {
          const when = days === 0 ? "today" : days === 1 ? "tomorrow" : `on ${shortDate(start)}`;
          items.push({
            ...base,
            id: `departing:${file.id}`,
            kind: "departing_unpaid",
            severity: days <= 2 ? "red" : "amber",
            due: start,
            sentence: `${file.number} for ${who} departs ${when} with ${format(totals.balance)} still unpaid.`,
            action: { label: "Record payment", href: bookingHref(file.id, "action=payment") },
          });
        }
      }
    }

    // Quote older than 3 days, still draft — owner.
    if (own && status === "draft") {
      const quoted = lines.filter((l) => l.status === "quoted");
      if (quoted.length) {
        const quote = currentInvoice(db, file.id, "quote");
        const since = quote?.issuedAt ?? quoted.map((l) => l.createdAt).sort()[0];
        const age = t - Date.parse(since);
        if (age > 3 * DAY) {
          const days = Math.floor(age / DAY);
          items.push({
            ...base,
            id: `quote:${file.id}`,
            kind: "stale_quote",
            severity: "info",
            due: since,
            sentence: quote
              ? `Quote ${quote.number} for ${who} is ${days} days old and not booked yet. Follow up with the client.`
              : `The quote on ${file.number} for ${who} is ${days} days old and not booked yet. Follow up with the client.`,
            action: { label: "Open booking", href: bookingHref(file.id) },
          });
        }
      }
    }

    // Issued flight inside its void window — owner (information).
    if (own) {
      for (const line of lines) {
        if (line.type !== "flight" || !isVoidWindowOpen(line, now)) continue;
        const deadline = line.details.voidDeadline!;
        const sameDay = toDarDate(deadline) === today;
        items.push({
          ...base,
          id: `void:${line.id}`,
          kind: "void_window",
          severity: "info",
          lineId: line.id,
          due: deadline,
          sentence: `Ticket ${flightLabel(line)} for ${who} can still be voided. Void closes at ${sameDay ? `${toDarLocal(deadline).slice(11, 16)} today` : whenDar(deadline)}.`,
          action: { label: "Open booking", href: bookingHref(file.id) },
        });
      }
    }

    // Invoice outdated — owner.
    if (own && isInvoiceOutdated(db, file.id, "invoice")) {
      const inv = currentInvoice(db, file.id, "invoice");
      items.push({
        ...base,
        id: `invoice:${file.id}`,
        kind: "invoice_outdated",
        severity: "amber",
        due: inv?.issuedAt,
        sentence: `${inv ? `Invoice ${inv.number}` : "The invoice"} for ${who} no longer matches the booking. Issue a new invoice before sharing it.`,
        action: { label: "Issue invoice", href: bookingHref(file.id, "action=invoice") },
      });
    }

    // Client credit (Flow B) — owner, Accountant, Manager. Skipped while an approved refund waits for payout.
    if ((own || isFinance) && totals.balance.amountMinor < 0) {
      const payoutPending = Object.values(db.refunds).some((r) => r.fileId === file.id && r.kind === "refund" && r.status === "approved");
      if (!payoutPending) {
        const credit = { ...totals.balance, amountMinor: -totals.balance.amountMinor };
        items.push({
          ...base,
          id: `credit:${file.id}`,
          kind: "client_credit",
          severity: "amber",
          due: file.updatedAt,
          sentence: `${client?.name ?? who} has a credit of ${format(credit)} on ${file.number}. Refund the client or keep it as credit.`,
          action: { label: "Open booking", href: bookingHref(file.id) },
        });
      }
    }
  }

  // ── Finance rules ──
  if (isFinance) {
    // Payment recorded but not verified for more than 24 h.
    for (const p of Object.values(db.payments)) {
      if (p.direction !== "in" || p.status !== "recorded") continue;
      const age = t - Date.parse(p.receivedAt);
      if (age <= 24 * HOUR) continue;
      const days = Math.floor(age / DAY);
      const client = db.clients[p.clientId];
      items.push({
        id: `verify:${p.id}`,
        kind: "unverified_payment",
        severity: age > 3 * DAY ? "red" : "amber",
        paymentId: p.id,
        clientId: p.clientId,
        fileId: p.allocations.length === 1 ? p.allocations[0].fileId : undefined,
        due: p.receivedAt,
        sentence: `Receipt ${p.number} of ${format(p.amount)} (${METHOD_LABELS[p.method]}) from ${client?.name ?? "a client"} has waited ${days === 1 ? "a day" : `${days} days`} for verification.`,
        action: { label: "Verify", href: `/payments?tab=unverified&open=${p.id}` },
      });
    }

    for (const r of Object.values(db.refunds)) {
      const file = db.files[r.fileId];
      const client = file ? db.clients[file.clientId] : undefined;
      const who = file ? whoOf(file, client) : "the client";
      const base = { refundId: r.id, fileId: r.fileId, clientId: file?.clientId, lineId: r.lineId };
      // Refund request awaiting a decision — Accountant (≤ limit), Manager (all).
      if (r.status === "requested") {
        const needsManager = r.kind === "refund" && refundNeedsManager(r.quote.clientRefund, db.settings);
        if (needsManager && !isManager) continue;
        const what =
          r.kind === "exchange"
            ? `Exchange request ${r.number} for ${who} needs a decision.`
            : `Refund request ${r.number} for ${who} (client refund ${format(r.quote.clientRefund)}) needs ${needsManager ? "a Manager's" : "a"} decision.`;
        items.push({
          ...base,
          id: `decide:${r.id}`,
          kind: "refund_decision",
          severity: t - Date.parse(r.requestedAt) > 2 * DAY ? "red" : "amber",
          due: r.requestedAt,
          sentence: what,
          action: { label: "Decide", href: `/payments?tab=refunds&open=${r.id}` },
        });
      }
      // Approved refund not yet paid out.
      if (r.status === "approved" && r.kind === "refund" && r.quote.clientRefund.amountMinor > 0) {
        items.push({
          ...base,
          id: `payout:${r.id}`,
          kind: "refund_payout",
          severity: "amber",
          due: r.decidedAt,
          sentence: `Approved refund ${r.number} of ${format(r.quote.clientRefund)} for ${who} is not paid out yet.`,
          action: { label: "Pay out", href: `/payments?tab=refunds&open=${r.id}` },
        });
      }
    }

    // Supplier lines unpaid past the supplier's terms (one item per supplier).
    for (const supplier of Object.values(db.suppliers)) {
      const overdue = supplierOpenItems(db, supplier.id, now).filter((i) => i.overdue);
      if (!overdue.length) continue;
      const total = overdue.reduce((acc, i) => addIn(db, acc, i.remaining), zero(supplier.currency));
      const oldest = overdue[0];
      items.push({
        id: `supplier:${supplier.id}`,
        kind: "supplier_overdue",
        severity: "red",
        supplierId: supplier.id,
        due: oldest.dueDate,
        sentence: `${supplier.name} is owed ${format(total)} past its ${supplier.paymentTermsDays}-day terms on ${overdue.length} ${overdue.length === 1 ? "service" : "services"}.`,
        action: { label: "Pay supplier", href: `/money-out/suppliers/${supplier.id}` },
      });
    }

    // Corporate client over their credit limit.
    for (const client of Object.values(db.clients)) {
      if (client.type !== "corporate" || client.archived || !client.creditLimit) continue;
      const usage = clientCreditUsage(db, client.id, now);
      if (!usage?.limit || usage.used.amountMinor <= usage.limit.amountMinor) continue;
      items.push({
        id: `credit-limit:${client.id}`,
        kind: "credit_limit",
        severity: "red",
        clientId: client.id,
        sentence: `${client.name} is over its credit limit: ${format(usage.used)} used of ${format(usage.limit)} (${Math.round(usage.pct)} %).`,
        action: { label: "Open client", href: `/clients/${client.id}` },
      });
    }
  }
  return items.sort(compareAttention);
}

/** Most urgent first: severity, then due (earliest first, undated last), then id. */
export function compareAttention(a: AttentionItem, b: AttentionItem): number {
  const s = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
  if (s) return s;
  if (a.due && b.due && a.due !== b.due) return a.due < b.due ? -1 : 1;
  if (a.due && !b.due) return -1;
  if (!a.due && b.due) return 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
