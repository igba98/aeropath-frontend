import { z } from "zod";
import type { CommandResult, Ctx, DbState, ID, Invoice, InvoiceSnapshotLine } from "../types";
import { makeAudit } from "../audit";
import { darToday } from "../dates";
import { travellerDisplayName } from "../describe";
import { format, sub, sum } from "../money";
import { chargeItems, fingerprintOf, type DocumentKind } from "../selectors/charges";
import { fileDueAt } from "../status/payment-status";
import { denied, fail, nowIso, ok, parse, produce, takeNumber } from "./_helpers";
import { zId, zOptISODate } from "./_schemas";

export interface IssueDocumentResult {
  invoiceId: ID;
  number: string;
}

const schema = z.object({ fileId: zId, dueAt: zOptISODate });

/**
 * Issues an invoice or a quote for a file. The snapshot is frozen at issue time, in the file currency:
 * invoices take the chargeable lines (and retained refund charges), quotes take quoted and booked lines.
 * The previous open document of the same kind is superseded.
 */
export function issueDocument(state: DbState, input: { fileId: ID; dueAt?: string }, ctx: Ctx, kind: DocumentKind): CommandResult<IssueDocumentResult> {
  const no = denied(ctx, "document.issue");
  if (no) return no;
  const parsed = parse(schema, input);
  if (!parsed.ok) return parsed;
  const f = parsed.data;

  const file = state.files[f.fileId];
  if (!file) return fail("NOT_FOUND", "This booking could not be found.", "fileId");
  if (file.cancelledAt) return fail("CONFLICT", `Booking ${file.number} is cancelled.`);
  const client = state.clients[file.clientId];
  if (!client) return fail("NOT_FOUND", "The client for this booking could not be found.");

  const items = chargeItems(state, file.id, kind);
  if (!items.length) {
    return fail(
      "VALIDATION",
      kind === "invoice" ? "There is nothing to invoice yet. Mark at least one service as booked first." : "There is nothing to quote. Add a quoted or booked service first.",
    );
  }

  const c = file.currency;
  const lines: InvoiceSnapshotLine[] = items.map((i) => ({
    lineId: i.lineId,
    description: i.description,
    travellers: i.travellerIds.map((id) => state.travellers[id]).filter(Boolean).map(travellerDisplayName),
    sell: i.sell,
    serviceFee: i.serviceFee,
    vat: i.vat,
  }));
  const total = sum(
    items.map((i) => i.sell),
    c,
  );
  const vat = sum(
    items.map((i) => i.vat),
    c,
  );

  const today = darToday(ctx.now);
  const dueAt = f.dueAt ?? fileDueAt(state, file.id, { invoiceDate: today }) ?? today;
  const { number, counters } = takeNumber(state, kind === "invoice" ? "invoice" : "quote", ctx);
  const id = ctx.newId("inv");
  const clientBlock: Invoice["snapshot"]["clientBlock"] = { name: client.name, phone: client.phone };
  if (client.email) clientBlock.email = client.email;
  if (client.tin) clientBlock.tin = client.tin;
  if (client.address) clientBlock.address = client.address;

  const doc: Invoice = {
    id,
    number,
    kind,
    fileId: file.id,
    issuedAt: nowIso(ctx),
    dueAt,
    snapshot: { lines, subtotal: sub(total, vat), vat, total, currency: c, clientBlock, fingerprint: fingerprintOf(items) },
    status: "issued",
    issuedBy: ctx.user.id,
  };

  const superseded = Object.values(state.invoices).filter((i) => i.fileId === file.id && i.kind === kind && i.status === "issued");
  const next = produce(state, (d) => {
    for (const s of superseded) d.invoices[s.id].status = "superseded";
    d.invoices[id] = doc;
    d.counters = counters;
  });
  const word = kind === "invoice" ? "Invoice" : "Quote";
  const replaced = superseded.length ? ` (replaces ${superseded.map((s) => s.number).join(", ")})` : "";
  return ok(
    next,
    [makeAudit(ctx, `${kind}.issued`, "invoice", id, `${word} ${number} issued for ${format(total)}${replaced}`, file.id)],
    { invoiceId: id, number },
    `${word} ${number} issued`,
  );
}
