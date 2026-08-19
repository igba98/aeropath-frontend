/**
 * Shared derivations for the Operations, Support and Supply consoles.
 * Pure functions over StoreData — no writes, no React. Writes always go through @/lib/api.
 */
import type { StoreData } from "@/lib/store";
import type {
  AmendmentRequest, Booking, BookingItem, ItemStatus, Organisation, Payment, PriceBreakdownData, PriceLine, Product, Vertical,
} from "@/lib/domain/types";

/* ── Money ─────────────────────────────────────────────────── */

/**
 * Build a PriceBreakdownData from the amounts SNAPSHOTTED on the item.
 * We never recompute from the rate plan here: the item is the contract with the customer.
 */
export function breakdownFromItem(item: BookingItem): PriceBreakdownData {
  const base = item.sellPriceMinor - item.taxMinor - item.feeMinor - item.markupMinor;
  const nights = Math.max(1, Math.round((new Date(item.travelDateTo + "T00:00:00Z").getTime() - new Date(item.travelDateFrom + "T00:00:00Z").getTime()) / 86_400_000));
  const unitLabel =
    item.vertical === "stay"
      ? `${item.quantity} × ${nights} night${nights === 1 ? "" : "s"}`
      : item.vertical === "transfer"
        ? `${item.quantity} vehicle${item.quantity === 1 ? "" : "s"}`
        : `${item.pax.adults + item.pax.children} traveller${item.pax.adults + item.pax.children === 1 ? "" : "s"}`;

  const lines: PriceLine[] = [{ label: `${item.productSnapshot.ratePlanName} · ${unitLabel}`, amountMinor: base, kind: "base" }];
  if (item.markupMinor) lines.push({ label: "Agency markup", amountMinor: item.markupMinor, kind: "markup" });
  if (item.taxMinor) lines.push({ label: "Taxes and levies", amountMinor: item.taxMinor, kind: "tax" });
  if (item.feeMinor) lines.push({ label: "Service fee", amountMinor: item.feeMinor, kind: "fee" });

  return {
    currency: "TZS",
    lines,
    baseMinor: base,
    taxMinor: item.taxMinor,
    feeMinor: item.feeMinor,
    discountMinor: 0,
    markupMinor: item.markupMinor,
    totalMinor: item.sellPriceMinor,
    netMinor: item.netCostMinor,
    commissionMinor: item.commissionMinor,
  };
}

/* ── Ops worklist ──────────────────────────────────────────── */

export type QueueBucket = "awaiting_supplier" | "supplier_rejected" | "payment_failed" | "amendment" | "partial";

export const QUEUE_BUCKETS: Array<{ id: QueueBucket; label: string; description: string }> = [
  { id: "awaiting_supplier", label: "Awaiting supplier", description: "Paid, the supplier has not confirmed yet. Chase or force confirm before the SLA runs out." },
  { id: "supplier_rejected", label: "Supplier rejected", description: "The supplier declined. The refund is automatic — offer the customer an alternative." },
  { id: "payment_failed", label: "Payment failed", description: "Money is in flight or the charge failed. Reconcile against the provider before the hold expires." },
  { id: "amendment", label: "Amendment requested", description: "A change was requested. Price the difference and approve or decline." },
  { id: "partial", label: "Partial", description: "Part of a multi item booking failed. The customer is travelling with a gap in their trip." },
];

export interface QueueRow {
  item: BookingItem;
  booking: Booking;
  buckets: QueueBucket[];
  /** epoch ms the work becomes late — lower is more urgent */
  dueAt: number;
  amendment?: AmendmentRequest;
}

const PAYMENT_STUCK: Array<Booking["paymentStatus"]> = ["failed", "reconciliation_pending", "pending", "unpaid"];

export function queueRows(d: StoreData): QueueRow[] {
  const amendmentsByItem = new Map<string, AmendmentRequest>();
  for (const a of Object.values(d.amendments)) if (a.status === "requested") amendmentsByItem.set(a.itemId, a);

  const rows: QueueRow[] = [];
  for (const item of Object.values(d.items)) {
    const booking = d.bookings[item.bookingId];
    if (!booking) continue;
    const buckets: QueueBucket[] = [];

    if (item.status === "awaiting_supplier" || item.status === "paid") buckets.push("awaiting_supplier");
    if (item.status === "supplier_rejected") buckets.push("supplier_rejected");
    if (item.status === "payment_failed" || (item.status === "pending_payment" && PAYMENT_STUCK.includes(booking.paymentStatus))) buckets.push("payment_failed");
    const amendment = amendmentsByItem.get(item.id);
    if (amendment) buckets.push("amendment");
    if (booking.status === "partial" && item.status !== "refunded") buckets.push("partial");

    if (!buckets.length) continue;
    rows.push({ item, booking, buckets, amendment, dueAt: dueAtOf(item, amendment) });
  }
  return rows.sort((a, b) => a.dueAt - b.dueAt);
}

export function dueAtOf(item: BookingItem, amendment?: AmendmentRequest): number {
  if (item.slaDeadlineAt) return new Date(item.slaDeadlineAt).getTime();
  if (item.holdExpiresAt) return new Date(item.holdExpiresAt).getTime();
  if (amendment) return new Date(amendment.createdAt).getTime() + 6 * 3_600_000;
  return new Date(item.travelDateFrom + "T00:00:00Z").getTime();
}

/** Items the supplier still owes us an answer on (O05). */
export function awaitingSupplierItems(d: StoreData): BookingItem[] {
  return Object.values(d.items)
    .filter((i) => i.status === "awaiting_supplier" || i.status === "paid")
    .sort((a, b) => dueAtOf(a) - dueAtOf(b));
}

export function slaBreachedItems(d: StoreData): BookingItem[] {
  const now = Date.now();
  return awaitingSupplierItems(d).filter((i) => i.slaDeadlineAt && new Date(i.slaDeadlineAt).getTime() < now);
}

/** Payments that never settled cleanly (O01 tile, O07 board, §7.7 recovery flow). */
export function failedPayments(d: StoreData): Payment[] {
  return Object.values(d.payments)
    .filter((p) => p.status === "failed" || p.status === "reconciliation_pending")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function unconfirmedBookings(d: StoreData): Booking[] {
  return Object.values(d.bookings)
    .filter((b) => b.status === "processing" || b.status === "partial")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** O08 · operational day view. Items travelling today through `days` ahead. */
export function departuresWithin(d: StoreData, days: number): BookingItem[] {
  const from = new Date().toISOString().slice(0, 10);
  const to = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
  const live: ItemStatus[] = ["confirmed", "amended", "awaiting_supplier", "paid", "used"];
  return Object.values(d.items)
    .filter((i) => live.includes(i.status) && i.travelDateFrom >= from && i.travelDateFrom <= to)
    .sort((a, b) => a.travelDateFrom.localeCompare(b.travelDateFrom) || a.productSnapshot.title.localeCompare(b.productSnapshot.title));
}

export const VERTICAL_LABELS: Record<Vertical, string> = { stay: "Stay", flight: "Flight", tour: "Tour", transfer: "Transfer" };

/* ── Customer identity (U02 / U03) ─────────────────────────── */

export interface CustomerRecord {
  /** route key: a user id when we have an account, otherwise the lead traveller's email */
  key: string;
  name: string;
  email: string;
  phone: string;
  userId?: string;
  bookings: Booking[];
}

function leadIdentity(b: Booking): { name: string; email: string; phone: string } {
  const l = b.leadTraveller;
  return {
    name: l ? `${l.firstName} ${l.lastName}` : "Unnamed traveller",
    email: l?.email ?? "",
    phone: l?.phone ?? "",
  };
}

/** Every distinct customer we can open a 360 view for: account holders plus guest lead travellers. */
export function customerIndex(d: StoreData): CustomerRecord[] {
  const byKey = new Map<string, CustomerRecord>();
  for (const b of Object.values(d.bookings)) {
    const user = b.buyerUserId !== "guest" ? d.users[b.buyerUserId] : undefined;
    const lead = leadIdentity(b);
    const key = user ? user.id : lead.email || b.reference;
    const existing = byKey.get(key);
    if (existing) {
      existing.bookings.push(b);
      continue;
    }
    byKey.set(key, {
      key,
      name: user?.name ?? lead.name,
      email: user?.email ?? lead.email,
      phone: user?.phone ?? lead.phone,
      userId: user?.id,
      bookings: [b],
    });
  }
  for (const rec of byKey.values()) rec.bookings.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function findCustomer(d: StoreData, key: string): CustomerRecord | undefined {
  return customerIndex(d).find((c) => c.key === key);
}

/** Realised value: what the customer has actually travelled on or holds confirmed. */
export function lifetimeValueMinor(d: StoreData, bookings: Booking[]): number {
  const good: ItemStatus[] = ["confirmed", "amended", "used"];
  let total = 0;
  for (const b of bookings) for (const i of Object.values(d.items)) if (i.bookingId === b.id && good.includes(i.status)) total += i.sellPriceMinor;
  return total;
}

/* ── Supply ────────────────────────────────────────────────── */

export function supplierProducts(d: StoreData, supplierId: string): Product[] {
  return Object.values(d.products).filter((p) => p.supplierId === supplierId);
}

export function supplierItems(d: StoreData, supplierId: string): BookingItem[] {
  return Object.values(d.items).filter((i) => i.supplierId === supplierId);
}

export interface LivePerformance {
  requested: number;
  confirmed: number;
  rejected: number;
  cancelled: number;
  confirmationRatePct: number | null;
  rejectionRatePct: number | null;
  cancellationRatePct: number | null;
  grossMinor: number;
}

/** Performance recomputed from real booking items, next to the contracted figures on the org. */
export function livePerformance(d: StoreData, supplierId: string): LivePerformance {
  const items = supplierItems(d, supplierId);
  const decided: ItemStatus[] = ["confirmed", "amended", "used", "supplier_rejected"];
  const requested = items.filter((i) => decided.includes(i.status)).length;
  const confirmed = items.filter((i) => i.status === "confirmed" || i.status === "amended" || i.status === "used").length;
  const rejected = items.filter((i) => i.status === "supplier_rejected").length;
  const cancelled = items.filter((i) => i.status === "cancelled" || i.status === "refunded").length;
  const grossMinor = items.filter((i) => i.status === "used" || i.status === "confirmed" || i.status === "amended").reduce((s, i) => s + i.sellPriceMinor, 0);
  const rate = (n: number, total: number) => (total ? Math.round((n / total) * 1000) / 10 : null);
  return {
    requested, confirmed, rejected, cancelled, grossMinor,
    confirmationRatePct: rate(confirmed, requested),
    rejectionRatePct: rate(rejected, requested),
    cancellationRatePct: rate(cancelled, items.length),
  };
}

/** Composite 0–100 score used in the supplier directory. */
export function performanceScore(org: Organisation): number {
  const p = org.performance;
  if (!p) return 0;
  const speed = Math.max(0, 100 - p.avgConfirmMinutes / 2);
  return Math.round(p.confirmationRatePct * 0.4 + (p.reviewScore / 5) * 100 * 0.3 + speed * 0.2 + Math.max(0, 100 - p.rejectionRatePct * 10) * 0.1);
}

/**
 * P06 · a stand-in for a rate shopping feed. Deterministic per product id so the board is stable
 * between renders, spread ±15% around our own all-in price.
 */
export function marketReferenceMinor(product: Product): number {
  let h = 2166136261;
  for (const c of product.id) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
  const swing = ((h % 3001) / 3000) * 0.3 - 0.15; // −15% … +15%
  return Math.round(product.priceFromMinor * (1 + swing));
}

export function verticalMix(products: Product[]): Array<{ vertical: Vertical; count: number }> {
  const counts = new Map<Vertical, number>();
  for (const p of products) counts.set(p.vertical, (counts.get(p.vertical) ?? 0) + 1);
  return [...counts.entries()].map(([vertical, count]) => ({ vertical, count })).sort((a, b) => b.count - a.count);
}

/** P02 · document checklist derived from what the applicant has actually supplied. */
export function onboardingChecklist(org: Organisation): Array<{ label: string; done: boolean; detail: string }> {
  return [
    { label: "Company name and trading address", done: Boolean(org.name && org.city), detail: `${org.name} · ${org.city}, ${org.countryCode}` },
    { label: "TIN certificate", done: Boolean(org.tin), detail: org.tin ? `TIN ${org.tin}` : "Not supplied" },
    { label: "Tourism licence", done: Boolean(org.licenceNo), detail: org.licenceNo ?? "Not supplied" },
    { label: "Primary contact", done: Boolean(org.contactName && org.contactPhone), detail: org.contactName ? `${org.contactName} · ${org.contactPhone ?? "no phone"}` : "Not supplied" },
    { label: "Bank details for payouts", done: Boolean(org.bankName && org.bankAccountMasked), detail: org.bankName ? `${org.bankName} ${org.bankAccountMasked}` : "Not supplied" },
    { label: "Commission and payout terms agreed", done: org.commissionPct != null && org.payoutTermsDays != null, detail: org.commissionPct != null ? `${org.commissionPct}% · net ${org.payoutTermsDays} days` : "Not agreed" },
  ];
}

/** P04 · what the supply reviewer checks before a product goes live. */
export function submissionChecklist(product: Product, ratePlanCount: number): Array<{ label: string; done: boolean; detail: string }> {
  return [
    { label: "Title and description", done: product.description.length > 80, detail: `${product.description.length} characters of description` },
    { label: "At least 5 photographs", done: product.media.length >= 5, detail: `${product.media.length} uploaded` },
    { label: "Location set", done: Boolean(product.location.city), detail: `${product.location.city}, ${product.location.region}` },
    { label: "Amenities or inclusions", done: product.amenities.length >= 3, detail: `${product.amenities.length} listed` },
    { label: "Cancellation policy attached", done: Boolean(product.cancellationPolicyId), detail: product.cancellationPolicyId },
    { label: "At least one rate plan", done: ratePlanCount > 0, detail: `${ratePlanCount} rate plan${ratePlanCount === 1 ? "" : "s"}` },
  ];
}
