import type { Client, DbState, ID, Invoice, Payment } from "@/domain/types";
import { format } from "@/domain/money";
import { fileTotals } from "@/domain/selectors/fileTotals";
import { linesOfFile } from "@/domain/selectors/core";
import { travelDates } from "@/domain/status/file-status";
import { cityOf } from "@/store/seed/reference";
import { routeOfLines } from "@/lib/view-models";
import { fmtDate, fmtDay } from "@/lib/dates";
import { periodLabel } from "@/components/clients/statement";
import { firstName } from "@/lib/whatsapp";

/**
 * Short WhatsApp messages for documents (spec §9.12), e.g.
 * "Hello Peter, your booking AP-2026-000123 (Dar → Dubai, 12 Oct) is confirmed. Balance due: USD 1,120.00. Receipt RCT-2026-00045."
 * TODO(backend): signed PDF links — append a link to the hosted document once the backend exists.
 */

const SHORT_CITY: Record<string, string> = { "Dar es Salaam": "Dar" };
const city = (code: string) => {
  const c = cityOf(code);
  return SHORT_CITY[c] ?? c;
};

/** "Dar → Dubai, 12 Oct" — first flight's outbound, else the file title; plus the first travel date. */
export function tripSummary(db: DbState, fileId: ID): string {
  const file = db.files[fileId];
  if (!file) return "";
  const route = routeOfLines(linesOfFile(db, fileId));
  let where = file.title;
  if (route.length >= 2) {
    const round = route.length > 2 && route[route.length - 1] === route[0];
    const dest = round ? route[Math.floor((route.length - 1) / 2)] ?? route[1] : route[route.length - 1];
    where = `${city(route[0])} → ${city(dest)}`;
  }
  const { start } = travelDates(db, fileId);
  return start ? `${where}, ${fmtDay(start)}` : where;
}

/** Who we greet: the contact person for corporates, else the client's first name. */
export function greetName(client?: Client): string {
  if (!client) return "";
  return firstName(client.type === "corporate" ? client.contactPerson || client.name : client.name);
}

const sign = (db: DbState) => db.settings.company.name;

export function bookingMessage(db: DbState, fileId: ID): string {
  const file = db.files[fileId];
  if (!file) return "";
  const client = db.clients[file.clientId];
  const t = fileTotals(db, fileId);
  const due = t.balance.amountMinor > 0 ? ` Balance due: ${format(t.balance)}.` : "";
  return `Hello ${greetName(client)}, your booking ${file.number} (${tripSummary(db, fileId)}) is confirmed.${due} — ${sign(db)}`;
}

export function invoiceMessage(db: DbState, inv: Invoice): string {
  const file = db.files[inv.fileId];
  const client = file ? db.clients[file.clientId] : undefined;
  const trip = file ? ` for booking ${file.number} (${tripSummary(db, file.id)})` : "";
  if (inv.kind === "quote") {
    return `Hello ${greetName(client)}, here is your quote ${inv.number}${trip}: ${format(inv.snapshot.total)}. Prices are subject to availability until ticketed. — ${sign(db)}`;
  }
  const t = file ? fileTotals(db, file.id) : undefined;
  const due = t && t.balance.amountMinor > 0 ? ` Balance due: ${format(t.balance)} by ${fmtDate(inv.dueAt)}.` : " Fully paid, thank you.";
  return `Hello ${greetName(client)}, your invoice ${inv.number}${trip} is ${format(inv.snapshot.total)}.${due} — ${sign(db)}`;
}

export function receiptMessage(db: DbState, p: Payment): string {
  const client = db.clients[p.clientId];
  const files = p.allocations.map((a) => db.files[a.fileId]).filter(Boolean);
  if (p.direction === "out") {
    return `Hello ${greetName(client)}, we have sent your refund of ${format(p.amount)}${files[0] ? ` for booking ${files[0].number}` : ""}. Reference ${p.number}. — ${sign(db)}`;
  }
  const first = files[0];
  const trip = first ? ` for booking ${files.map((f) => f.number).join(", ")}${files.length === 1 ? ` (${tripSummary(db, first.id)})` : ""}` : "";
  const bal = files.length === 1 ? fileTotals(db, first.id).balance : undefined;
  const due = bal ? (bal.amountMinor > 0 ? ` Balance due: ${format(bal)}.` : " Fully paid, thank you.") : "";
  return `Hello ${greetName(client)}, we have received ${format(p.amount)}${trip}.${due} Receipt ${p.number}. — ${sign(db)}`;
}

export function statementMessage(db: DbState, client: Client, closing: string, from?: string, to?: string): string {
  const period = from || to ? ` (${periodLabel(from, to)})` : "";
  return `Hello ${greetName(client)}, here is your statement${period}. Closing balance: ${closing}. — ${sign(db)}`;
}
