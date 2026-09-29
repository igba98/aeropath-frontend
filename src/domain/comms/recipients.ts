import type { DbState, ID, MessageChannel } from "../types";

/** Who at a client can be messaged: the client, an organisation's contacts and billing address, and travellers. */

export interface Recipient {
  /** "client", "billing", "contact:<id>" or "traveller:<id>". */
  id: string;
  name: string;
  /** Role or relationship, shown beside the name. */
  role?: string;
  phone?: string;
  email?: string;
}

const titleCase = (s: string) =>
  s
    .toLowerCase()
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");

export function recipientsOf(db: DbState, clientId: ID | undefined): Recipient[] {
  const client = clientId ? db.clients[clientId] : undefined;
  if (!client) return [];
  const out: Recipient[] = [];
  const org = client.type === "corporate";
  out.push({
    id: "client",
    name: org ? client.contactPerson || client.name : client.name,
    role: org ? (client.contactPerson ? "Main contact" : "Main line") : undefined,
    phone: client.phone || undefined,
    email: client.email || undefined,
  });
  if (client.billingEmail && client.billingEmail !== client.email) {
    out.push({ id: "billing", name: `${client.name} accounts`, role: "Invoices and statements", email: client.billingEmail });
  }
  for (const c of client.contacts ?? []) {
    if (!c.phone && !c.email) continue;
    out.push({ id: `contact:${c.id}`, name: c.name, role: c.role, phone: c.phone || undefined, email: c.email || undefined });
  }
  for (const t of Object.values(db.travellers)) {
    if (t.clientId !== client.id || (!t.phone && !t.email)) continue;
    out.push({ id: `traveller:${t.id}`, name: titleCase(`${t.givenName} ${t.surname}`), role: "Traveller", phone: t.phone || undefined, email: t.email || undefined });
  }
  return out;
}

/** The recipient to start with: the organisation's primary contact, else the client. */
export function defaultRecipient(db: DbState, clientId: ID | undefined): Recipient | undefined {
  const list = recipientsOf(db, clientId);
  const primary = clientId ? db.clients[clientId]?.contacts?.find((c) => c.primary && (c.phone || c.email)) : undefined;
  return (primary && list.find((r) => r.id === `contact:${primary.id}`)) || list[0];
}

/** Channels a recipient can receive: a phone for SMS and WhatsApp, an address for email. */
export function channelsFor(r: Pick<Recipient, "phone" | "email"> | undefined): MessageChannel[] {
  if (!r) return [];
  const out: MessageChannel[] = [];
  if (r.phone) out.push("sms", "whatsapp");
  if (r.email) out.push("email");
  return out;
}

export const addressFor = (r: Pick<Recipient, "phone" | "email"> | undefined, channel: MessageChannel): string => (channel === "email" ? (r?.email ?? "") : (r?.phone ?? ""));
