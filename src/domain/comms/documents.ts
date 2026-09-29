import type { DbState, ID, MessageAttachment, MessageTemplateKey } from "../types";
import { invoicesOfFile, linesOfFile, paymentsOfFile } from "../selectors/core";
import { format } from "../money";
import { dayLabel } from "./render";

/**
 * Documents a message can carry. Each points at its print route (src/app/print/[doc]/[id]); e-tickets and hotel
 * vouchers are sections of the booking's itinerary, so they open the itinerary with the line named.
 */

export interface DocumentOption {
  /** Stable key: kind:refId. */
  key: string;
  group: "Invoices and quotes" | "Receipts" | "Travel documents" | "Account";
  attachment: MessageAttachment;
  /** Quiet detail beside the name: amount, status, route. */
  hint?: string;
  /** A superseded invoice or quote: listed, but not suggested. */
  stale?: boolean;
}

export const attachmentKey = (a: Pick<MessageAttachment, "kind" | "refId" | "label">): string => `${a.kind}:${a.refId ?? a.label}`;

/** Every document of the booking (and the client's statement), in the order staff expect to find them. */
export function documentOptions(db: DbState, opts: { clientId?: ID; fileId?: ID }): DocumentOption[] {
  const out: DocumentOption[] = [];
  const file = opts.fileId ? db.files[opts.fileId] : undefined;
  const clientId = opts.clientId ?? file?.clientId;

  if (file) {
    const docs = invoicesOfFile(db, file.id)
      .filter((d) => d.status !== "void")
      .sort((a, b) => (a.status === b.status ? b.issuedAt.localeCompare(a.issuedAt) : a.status === "issued" ? -1 : 1));
    for (const d of docs) {
      const kind = d.kind === "invoice" ? "invoice" : "quote";
      const attachment: MessageAttachment = { kind, refId: d.id, label: `${d.kind === "invoice" ? "Invoice" : "Quote"} ${d.number}`, url: `/print/${d.kind}/${d.id}` };
      out.push({ key: attachmentKey(attachment), group: "Invoices and quotes", attachment, hint: d.status === "superseded" ? "Superseded" : format(d.snapshot.total), stale: d.status !== "issued" });
    }

    // Newest receipt first.
    for (const p of [...paymentsOfFile(db, file.id)].reverse()) {
      if (p.direction !== "in" || p.status === "reversed") continue;
      const attachment: MessageAttachment = { kind: "receipt", refId: p.id, label: `Receipt ${p.number}`, url: `/print/receipt/${p.id}` };
      out.push({ key: attachmentKey(attachment), group: "Receipts", attachment, hint: format(p.amount) });
    }

    const itinerary: MessageAttachment = { kind: "itinerary", refId: file.id, label: `Itinerary ${file.number}`, url: `/print/itinerary/${file.id}` };
    out.push({ key: attachmentKey(itinerary), group: "Travel documents", attachment: itinerary });

    for (const line of linesOfFile(db, file.id)) {
      if (line.type === "flight" && ["issued", "completed"].includes(line.status)) {
        const segs = [...line.details.segments].sort((a, b) => a.segmentNo - b.segmentNo);
        const route = segs.length ? [segs[0].origin, ...segs.map((s) => s.destination)].filter((c, i, arr) => i === 0 || c !== arr[i - 1]).join("-") : "";
        const pnr = line.details.recordLocator;
        const attachment: MessageAttachment = { kind: "eticket", refId: line.id, label: `E-ticket ${pnr || route}`.trim(), url: `/print/itinerary/${file.id}?line=${line.id}` };
        out.push({ key: attachmentKey(attachment), group: "Travel documents", attachment, hint: [route, segs[0] ? dayLabel(segs[0].departureLocal) : ""].filter(Boolean).join(" · ") });
      }
      if (line.type === "hotel" && ["booked", "issued", "completed"].includes(line.status)) {
        const d = line.details;
        const attachment: MessageAttachment = { kind: "voucher", refId: line.id, label: `Hotel voucher ${d.hotelName}`, url: `/print/itinerary/${file.id}?line=${line.id}` };
        out.push({ key: attachmentKey(attachment), group: "Travel documents", attachment, hint: `${dayLabel(d.checkIn)} - ${dayLabel(d.checkOut)}` });
      }
    }
  }

  const client = clientId ? db.clients[clientId] : undefined;
  if (client) {
    const attachment: MessageAttachment = { kind: "statement", refId: client.id, label: `Statement of account`, url: `/print/statement/${client.id}` };
    out.push({ key: attachmentKey(attachment), group: "Account", attachment, hint: client.name });
  }
  return out;
}

/** The documents a template is usually sent with, chosen from what the booking has. */
export function suggestedDocuments(key: MessageTemplateKey, options: DocumentOption[]): DocumentOption[] {
  const fresh = options.filter((o) => !o.stale);
  const of = (kind: MessageAttachment["kind"]) => fresh.filter((o) => o.attachment.kind === kind);
  const first = (kind: MessageAttachment["kind"]) => of(kind).slice(0, 1);
  const tickets = () => (of("eticket").length ? of("eticket") : first("itinerary"));
  switch (key) {
    case "booking_confirmation":
    case "itinerary":
      return first("itinerary");
    case "eticket":
    case "flight_reminder":
      return tickets();
    case "payment_reminder":
    case "invoice":
    case "ttl_reminder":
      return first("invoice");
    case "quote":
      return first("quote");
    case "payment_receipt":
      return first("receipt");
    case "hotel_voucher":
      return of("voucher").length ? of("voucher") : first("itinerary");
    case "statement":
      return first("statement");
    default:
      return [];
  }
}

/** The template that goes with a single document, e.g. when "Send" is pressed beside it. */
export function templateForAttachment(kind: MessageAttachment["kind"]): MessageTemplateKey {
  switch (kind) {
    case "invoice":
      return "invoice";
    case "quote":
      return "quote";
    case "receipt":
      return "payment_receipt";
    case "eticket":
      return "eticket";
    case "voucher":
      return "hotel_voucher";
    case "statement":
      return "statement";
    case "itinerary":
      return "itinerary";
    default:
      return "custom";
  }
}
