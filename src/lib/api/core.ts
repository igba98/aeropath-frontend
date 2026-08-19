import { getData, useStore, type StoreData } from "../store";
import type { AuditLog, ItemStatus, LedgerEntry, Notification, RoleId, TimelineEvent, User } from "../domain/types";
import { ROLE_LABELS } from "../domain/permissions";

export const nowIso = () => new Date().toISOString();

let localSeq = 0;
export function genId(prefix: string): string {
  localSeq += 1;
  return `${prefix}_${Date.now().toString(36)}${localSeq.toString(36)}`;
}

export function genReference(draft: StoreData, prefix = "AP"): string {
  draft.counters = { ...draft.counters, booking: draft.counters.booking + 1 };
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let x = (draft.counters.booking * 2654435761 + Date.now()) >>> 0;
  let out = "";
  for (let i = 0; i < 5; i++) {
    out += alphabet[x % alphabet.length];
    x = Math.floor(x / alphabet.length) + 11;
  }
  return `${prefix}-${out}`;
}

export function mutate(fn: (draft: StoreData) => void) {
  useStore.getState().patch(fn);
}

export function currentUser(d: StoreData = getData()): User | undefined {
  const id = d.session.impersonatingUserId ?? d.session.userId;
  return id ? d.users[id] : undefined;
}

export function actor(d: StoreData = getData()): { id: string; name: string; role: RoleId } {
  const u = d.session.userId ? d.users[d.session.userId] : undefined;
  return { id: u?.id ?? "guest", name: u?.name ?? "Guest", role: d.session.roleId };
}

export function writeAudit(draft: StoreData, entry: Omit<AuditLog, "id" | "createdAt" | "ip" | "requestId" | "actorUserId" | "actorName" | "roleUsed"> & Partial<Pick<AuditLog, "actorUserId" | "actorName" | "roleUsed">>) {
  const a = actor(draft);
  draft.audit = [
    { id: genId("au"), createdAt: nowIso(), ip: "41.59.12.99", requestId: genId("req").toUpperCase(), actorUserId: entry.actorUserId ?? a.id, actorName: entry.actorName ?? a.name, roleUsed: entry.roleUsed ?? a.role, ...entry },
    ...draft.audit,
  ];
}

export function addTimeline(draft: StoreData, ev: Omit<TimelineEvent, "id" | "at" | "actorName" | "actorRole"> & Partial<Pick<TimelineEvent, "at" | "actorName" | "actorRole">>) {
  const a = actor(draft);
  draft.timeline = [...draft.timeline, { id: genId("ev"), at: ev.at ?? nowIso(), actorName: ev.actorName ?? a.name, actorRole: ev.actorRole ?? a.role, ...ev }];
}

export function notify(draft: StoreData, n: Omit<Notification, "id" | "createdAt" | "read">) {
  draft.notifications = [{ id: genId("nt"), createdAt: nowIso(), read: false, ...n }, ...draft.notifications];
}

export function postLedger(draft: StoreData, lines: Array<Omit<LedgerEntry, "id" | "entryGroupId" | "entryDate">>, entryDate = nowIso()) {
  const group = genId("lg");
  const debit = lines.reduce((s, l) => s + l.debitMinor, 0);
  const credit = lines.reduce((s, l) => s + l.creditMinor, 0);
  if (debit !== credit) throw new Error(`Unbalanced ledger entry group: ${debit} vs ${credit}`);
  draft.ledger = [...draft.ledger, ...lines.map((l) => ({ ...l, id: genId("le"), entryGroupId: group, entryDate }))];
}

export function roleLabel(r: RoleId) {
  return ROLE_LABELS[r];
}

export const isTerminal = (s: ItemStatus) => ["expired", "payment_failed", "used", "cancelled", "refunded", "approval_rejected"].includes(s);
