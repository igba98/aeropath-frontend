import type { DbState, ID } from "@/domain/types";

/**
 * Global search (spec §5.3): file number, client name/phone/email, traveller surname,
 * PNR (6 chars), ticket number (13 digits, dash optional), invoice or receipt number.
 */

export interface SearchHit {
  kind: "booking" | "client" | "document";
  id: ID;
  href: string;
  title: string;
  subtitle: string;
  /** Why it matched, e.g. "PNR Z8K4QM" */
  match?: string;
  score: number;
}

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
const digits = (s: string) => s.replace(/\D/g, "");

export function searchDb(db: DbState, raw: string, limit = 8): { bookings: SearchHit[]; clients: SearchHit[]; documents: SearchHit[] } {
  const q = norm(raw.trim());
  const out = { bookings: [] as SearchHit[], clients: [] as SearchHit[], documents: [] as SearchHit[] };
  if (q.length < 2) return out;
  const qDigits = digits(q);
  const terms = q.split(/\s+/).filter(Boolean);

  const bookingHits = new Map<ID, SearchHit>();
  const addBooking = (fileId: ID, score: number, match?: string) => {
    const f = db.files[fileId];
    if (!f) return;
    const prev = bookingHits.get(fileId);
    if (prev && prev.score >= score) return;
    const c = db.clients[f.clientId];
    bookingHits.set(fileId, {
      kind: "booking",
      id: fileId,
      href: `/bookings/${fileId}`,
      title: f.number,
      subtitle: `${f.title}${c && !f.title.includes(c.name) ? " · " + c.name : ""}`,
      match,
      score,
    });
  };

  for (const f of Object.values(db.files)) {
    const num = norm(f.number);
    if (num === q || num.endsWith(q) || (qDigits.length >= 3 && digits(num).endsWith(qDigits))) addBooking(f.id, 100, undefined);
    else if (terms.every((t) => norm(f.title).includes(t))) addBooking(f.id, 55);
  }

  // PNR and tickets
  const pnrLike = /^[a-z0-9]{6}$/.test(q);
  const ticketLike = qDigits.length >= 10 && qDigits.length <= 13;
  for (const l of Object.values(db.lines)) {
    if (l.type !== "flight") continue;
    const d = l.details;
    if (pnrLike && (norm(d.recordLocator) === q || norm(d.airlineLocator ?? "") === q)) addBooking(l.fileId, 95, `PNR ${d.recordLocator}`);
    if (ticketLike) {
      for (const p of d.passengers) {
        if (p.ticketNumber && digits(p.ticketNumber).endsWith(qDigits)) addBooking(l.fileId, 95, `Ticket ${p.ticketNumber}${l.status === "voided" ? " (voided)" : ""}`);
      }
    }
  }

  // Travellers by surname / given name → their files
  const travellerFiles = new Map<ID, ID[]>();
  for (const f of Object.values(db.files)) for (const t of f.travellerIds) travellerFiles.set(t, [...(travellerFiles.get(t) ?? []), f.id]);
  for (const t of Object.values(db.travellers)) {
    const name = norm(`${t.givenName} ${t.surname}`);
    if (terms.every((x) => name.includes(x))) {
      for (const fid of travellerFiles.get(t.id) ?? []) addBooking(fid, 60, `Traveller ${t.surname}/${t.givenName}`);
    }
  }

  // Clients
  for (const c of Object.values(db.clients)) {
    const name = norm(c.name);
    let score = 0;
    let match: string | undefined;
    if (name === q) score = 100;
    else if (terms.every((t) => name.includes(t))) score = name.startsWith(terms[0]) ? 80 : 65;
    else if (qDigits.length >= 4 && digits(c.phone).includes(qDigits.replace(/^0/, ""))) {
      score = 85;
      match = c.phone;
    } else if (c.email && norm(c.email).includes(q)) {
      score = 80;
      match = c.email;
    } else if (c.contactPerson && terms.every((t) => norm(c.contactPerson!).includes(t))) {
      score = 50;
      match = `Contact ${c.contactPerson}`;
    }
    if (score)
      out.clients.push({
        kind: "client",
        id: c.id,
        href: `/clients/${c.id}`,
        title: c.name,
        subtitle: `${c.type === "corporate" ? "Corporate" : "Individual"} · ${c.phone}`,
        match,
        score: score - (c.archived ? 30 : 0),
      });
  }

  // Documents: invoices, quotes, receipts, refund payouts
  for (const inv of Object.values(db.invoices)) {
    if (norm(inv.number).includes(q) || (qDigits.length >= 3 && digits(inv.number).endsWith(qDigits) && /[a-z]/.test(q))) {
      const f = db.files[inv.fileId];
      out.documents.push({
        kind: "document",
        id: inv.id,
        href: `/bookings/${inv.fileId}?tab=documents`,
        title: inv.number,
        subtitle: `${inv.kind === "invoice" ? "Invoice" : "Quote"} · ${f?.number ?? ""}`,
        score: norm(inv.number) === q ? 100 : 70,
      });
    }
  }
  for (const p of Object.values(db.payments)) {
    if (norm(p.number).includes(q) || (p.reference && norm(p.reference) === q)) {
      const c = db.clients[p.clientId];
      out.documents.push({
        kind: "document",
        id: p.id,
        href: p.allocations[0] ? `/bookings/${p.allocations[0].fileId}?tab=payments` : `/payments`,
        title: p.number,
        subtitle: `${p.direction === "in" ? "Receipt" : "Refund payout"} · ${c?.name ?? ""}`,
        match: p.reference && norm(p.reference) === q ? `Ref ${p.reference}` : undefined,
        score: norm(p.number) === q ? 100 : 70,
      });
    }
  }

  out.bookings = [...bookingHits.values()].sort((a, b) => b.score - a.score || b.title.localeCompare(a.title)).slice(0, limit);
  out.clients = out.clients.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title)).slice(0, limit);
  out.documents = out.documents.sort((a, b) => b.score - a.score).slice(0, limit);
  return out;
}
