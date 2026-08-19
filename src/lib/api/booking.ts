import { getData, type StoreData } from "../store";
import type { BagSelection, Booking, BookingItem, BuyerType, Pax, PaymentRail, Refund, RoleId, SavedTraveller, SeatAssignment } from "../domain/types";
import { canTransition, deriveBookingStatus, holdTtlSeconds, APPROVAL_HOLD_SECONDS, SUPPLIER_SLA_SECONDS, type ItemEvent } from "../domain/state-machine";
import { computePrice, nightsBetween } from "../domain/pricing";
import { quoteRefund, requiredApprover } from "../domain/refunds";
import { cancellationPolicies } from "../fixtures/policies";
import { bagsTotalMinor } from "@/features/flights/baggage-picker";
import { actor, addTimeline, genId, genReference, mutate, notify, nowIso, postLedger, writeAudit } from "./core";
import { availabilityFor, datesBetween, unitFor } from "./catalog";

export const cartKey = (d: StoreData) => d.session.userId ?? "guest";

/** Aeropath sells to travellers only; it is itself the agent earning commission upstream. */
export function buyerTypeFor(): BuyerType {
  return "consumer";
}

export function itemsOf(d: StoreData, bookingId: string): BookingItem[] {
  return Object.values(d.items).filter((i) => i.bookingId === bookingId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

/** The single place item status changes. Throws on illegal transitions. */
export function transition(d: StoreData, itemId: string, event: ItemEvent, opts: { note?: string; visibility?: Array<"customer" | "supplier" | "internal">; actorName?: string; actorRole?: RoleId | "system"; silent?: boolean } = {}): BookingItem {
  const item = d.items[itemId];
  if (!item) throw new Error(`Unknown item ${itemId}`);
  const t = canTransition(item.status, event);
  if (!t) throw new Error(`Illegal transition ${item.status} --${event}--> (item ${itemId})`);
  const next: BookingItem = { ...item, status: t.to, updatedAt: nowIso() };
  d.items = { ...d.items, [itemId]: next };
  if (!opts.silent) {
    addTimeline(d, { bookingId: item.bookingId, itemId, event: EVENT_LABELS[event] ?? event, from: item.status, to: t.to, note: opts.note, visibility: opts.visibility ?? ["customer", "supplier", "internal"], actorName: opts.actorName, actorRole: opts.actorRole });
  }
  // effects
  for (const eff of t.effects) applyEffect(d, next, eff);
  syncBooking(d, item.bookingId);
  return next;
}

const EVENT_LABELS: Record<ItemEvent, string> = {
  HOLD: "Inventory held", EXPIRE: "Hold expired", INITIATE_PAYMENT: "Payment initiated", PAYMENT_CONFIRMED: "Payment received", PAYMENT_FAILED: "Payment failed",
  SUPPLIER_REQUESTED: "Confirmation requested from supplier", SUPPLIER_CONFIRMED: "Supplier confirmed", SUPPLIER_REJECTED: "Supplier rejected", AMEND: "Amended", CANCEL: "Cancelled",
  TRAVEL_COMPLETED: "Travel completed", REFUND_PROCESSED: "Refund processed", SUBMIT_FOR_APPROVAL: "Submitted for approval", APPROVAL_GRANTED: "Approved", APPROVAL_REJECTED: "Approval rejected", RETRY_PAYMENT: "Payment retried",
};

function applyEffect(d: StoreData, item: BookingItem, effect: string) {
  switch (effect) {
    case "reserveInventory": {
      const p = d.products[item.productId];
      const dates = p?.vertical === "stay" ? datesBetween(item.travelDateFrom, item.travelDateTo) : [item.travelDateFrom];
      const inv = { ...d.inventory };
      for (const dt of dates) {
        const u = unitFor(d, item.productId, dt);
        inv[`${item.productId}:${dt}`] = { ...u, capacityHeld: u.capacityHeld + item.quantity };
      }
      d.inventory = inv;
      break;
    }
    case "releaseInventory": {
      const p = d.products[item.productId];
      const dates = p?.vertical === "stay" ? datesBetween(item.travelDateFrom, item.travelDateTo) : [item.travelDateFrom];
      const inv = { ...d.inventory };
      for (const dt of dates) {
        const u = unitFor(d, item.productId, dt);
        // if it was sold, release from sold; else from held
        const wasSold = ["paid", "awaiting_supplier", "confirmed", "amended", "supplier_rejected", "cancelled"].includes(item.status) || item.status === "refunded";
        inv[`${item.productId}:${dt}`] = wasSold
          ? { ...u, capacitySold: Math.max(0, u.capacitySold - item.quantity) }
          : { ...u, capacityHeld: Math.max(0, u.capacityHeld - item.quantity) };
      }
      d.inventory = inv;
      d.items = { ...d.items, [item.id]: { ...d.items[item.id], holdExpiresAt: undefined } };
      break;
    }
    case "scheduleExpiry": {
      const ttl = holdTtlSeconds(item.vertical);
      d.items = { ...d.items, [item.id]: { ...d.items[item.id], holdExpiresAt: ttl ? new Date(Date.now() + ttl * 1000).toISOString() : undefined } };
      break;
    }
    case "extendHold": {
      d.items = { ...d.items, [item.id]: { ...d.items[item.id], holdExpiresAt: new Date(Date.now() + 30 * 60_000).toISOString() } };
      break;
    }
    case "extendHold4h": {
      d.items = { ...d.items, [item.id]: { ...d.items[item.id], holdExpiresAt: new Date(Date.now() + APPROVAL_HOLD_SECONDS * 1000).toISOString() } };
      break;
    }
    case "startSlaTimer": {
      d.items = { ...d.items, [item.id]: { ...d.items[item.id], slaDeadlineAt: new Date(Date.now() + SUPPLIER_SLA_SECONDS * 1000).toISOString() } };
      break;
    }
    case "stopSlaTimer": {
      d.items = { ...d.items, [item.id]: { ...d.items[item.id], slaDeadlineAt: undefined } };
      break;
    }
    case "writeLedger": {
      // handled by callers with amounts (payment / refund) — no-op here
      break;
    }
    default:
      break;
  }
}

/** Recompute parent booking totals and derived status */
export function syncBooking(d: StoreData, bookingId: string) {
  const b = d.bookings[bookingId];
  if (!b) return;
  const items = itemsOf(d, bookingId);
  const live = items.filter((i) => !["expired", "payment_failed", "approval_rejected"].includes(i.status));
  const subtotal = live.reduce((s, i) => s + (i.sellPriceMinor - i.taxMinor - i.feeMinor - i.markupMinor), 0);
  const tax = live.reduce((s, i) => s + i.taxMinor, 0);
  const fee = live.reduce((s, i) => s + i.feeMinor, 0);
  const markup = live.reduce((s, i) => s + i.markupMinor, 0);
  const paxCount = Math.max(1, b.travellers.length || (items[0]?.pax.adults ?? 1) + (items[0]?.pax.children ?? 0));
  const extras = b.extras.reduce((s, e) => s + (e.perPerson ? e.amountMinor * paxCount : e.amountMinor), 0);
  const promo = b.promoCode ? Object.values(d.promos).find((p) => p.code === b.promoCode) : undefined;
  const discount = promo ? Math.min(subtotal, promo.discountType === "pct" ? Math.round((subtotal * promo.discountValue) / 100) : promo.discountValue) : 0;
  const status = deriveBookingStatus(items.map((i) => i.status));
  d.bookings = { ...d.bookings, [bookingId]: { ...b, subtotalMinor: subtotal + extras, taxMinor: tax, feeMinor: fee, markupMinor: markup, discountMinor: discount, totalMinor: subtotal + extras + tax + fee + markup - discount, status, updatedAt: nowIso() } };
}

function priceItem(d: StoreData, b: Booking, item: Pick<BookingItem, "vertical" | "ratePlanId" | "travelDateFrom" | "travelDateTo" | "quantity" | "pax">) {
  const rp = d.ratePlans[item.ratePlanId];
  const nights = item.vertical === "stay" ? nightsBetween(item.travelDateFrom, item.travelDateTo) : 1;
  return computePrice({ vertical: item.vertical, ratePlan: rp, nights, quantity: item.quantity, pax: item.pax, buyerType: b.buyerType });
}

export const cart = {
  get(d: StoreData = getData()): Booking | undefined {
    const id = d.carts[cartKey(d)];
    const b = id ? d.bookings[id] : undefined;
    return b && b.status === "draft" ? b : undefined;
  },
  items(d: StoreData = getData()): BookingItem[] {
    const b = cart.get(d);
    return b ? itemsOf(d, b.id) : [];
  },
  ensure(d: StoreData): Booking {
    const existing = cart.get(d);
    if (existing) return existing;
    const a = actor(d);
    const buyerType = buyerTypeFor();
    const user = d.session.userId ? d.users[d.session.userId] : undefined;
    const org = user?.organisationId ? d.organisations[user.organisationId] : undefined;
    const b: Booking = {
      id: genId("bk"), reference: genReference(d), buyerType, buyerUserId: a.id, organisationId: org?.id, clientOrgName: d.session.agentClientName,
      status: "draft", currency: "TZS", subtotalMinor: 0, taxMinor: 0, feeMinor: 0, discountMinor: 0, markupMinor: 0, totalMinor: 0, paymentStatus: "unpaid",
      travellers: [], extras: [],
      createdBy: a.id, createdVia: "web", internalNotes: [], createdAt: nowIso(), updatedAt: nowIso(),
    };
    d.bookings = { ...d.bookings, [b.id]: b };
    d.carts = { ...d.carts, [cartKey(d)]: b.id };
    addTimeline(d, { bookingId: b.id, event: "Booking created", visibility: ["customer", "internal"] });
    return b;
  },
  /** Add a product to the trip. Holds inventory immediately. Returns item id or throws with a remediation code. */
  add(input: { productId: string; ratePlanId: string; dateFrom: string; dateTo: string; quantity?: number; pax: Pax; specialRequests?: string }): string {
    let itemId = "";
    mutate((d) => {
      const p = d.products[input.productId];
      const rp = d.ratePlans[input.ratePlanId];
      if (!p || !rp) throw Object.assign(new Error("Product not found"), { code: "NOT_FOUND" });
      const qty = input.quantity ?? 1;
      const av = availabilityFor(d, p, input.dateFrom, input.dateTo, qty);
      if (!av.available) throw Object.assign(new Error(`Only ${av.unitsLeft} left for the selected dates`), { code: "INVENTORY_UNAVAILABLE", remediation: "SELECT_DIFFERENT_DATES" });
      const b = cart.ensure(d);
      const policy = cancellationPolicies.find((c) => c.id === rp.cancellationPolicyId)!;
      const freeTier = policy.tiers.find((t) => t.refundPct === 100);
      const price = priceItem(d, b, { vertical: p.vertical, ratePlanId: rp.id, travelDateFrom: input.dateFrom, travelDateTo: input.dateTo, quantity: qty, pax: input.pax });
      itemId = genId("bi");
      const item: BookingItem = {
        id: itemId, bookingId: b.id, vertical: p.vertical, productId: p.id, ratePlanId: rp.id, supplierId: p.supplierId, status: "draft",
        travelDateFrom: input.dateFrom, travelDateTo: input.dateTo, quantity: qty, pax: input.pax,
        netCostMinor: price.netMinor ?? 0, sellPriceMinor: price.totalMinor, markupMinor: price.markupMinor, commissionMinor: price.commissionMinor ?? 0, taxMinor: price.taxMinor, feeMinor: price.feeMinor,
        cancellationPolicySnapshot: { policyId: policy.id, name: policy.name, summary: policy.summary, tiers: policy.tiers, freeCancellationUntil: freeTier ? new Date(new Date(input.dateFrom + "T00:00:00Z").getTime() - freeTier.daysBefore * 86_400_000).toISOString() : undefined },
        productSnapshot: { title: p.title, city: p.location.city, region: p.location.region, ratePlanName: rp.name, tone: p.media[0]?.tone, summary: p.description.slice(0, 140) },
        specialRequests: input.specialRequests,
        createdAt: nowIso(), updatedAt: nowIso(),
      };
      d.items = { ...d.items, [itemId]: item };
      transition(d, itemId, "HOLD", { visibility: ["customer", "internal"] });
    });
    return itemId;
  },
  remove(itemId: string) {
    mutate((d) => {
      const it = d.items[itemId];
      if (!it) return;
      if (it.status === "held") transition(d, itemId, "EXPIRE", { note: "Removed from trip", silent: true });
      const { [itemId]: _x, ...rest } = d.items;
      void _x;
      d.items = rest;
      syncBooking(d, it.bookingId);
    });
  },
  update(patch: Partial<Pick<Booking, "travellers" | "leadTraveller" | "extras" | "costCentre" | "projectCode" | "justification" | "promoCode">>) {
    mutate((d) => {
      const b = cart.get(d);
      if (!b) return;
      const next = { ...b, ...patch };
      d.bookings = { ...d.bookings, [b.id]: next };
      syncBooking(d, b.id);
    });
  },
  clear() {
    mutate((d) => {
      d.carts = { ...d.carts, [cartKey(d)]: null };
    });
  },
  /** Release expired holds (sweeper). Safe to call often. */
  sweep() {
    const d = getData();
    const now = Date.now();
    const expired = Object.values(d.items).filter((i) => (i.status === "held" || i.status === "pending_approval") && i.holdExpiresAt && new Date(i.holdExpiresAt).getTime() < now);
    if (!expired.length) return 0;
    mutate((dd) => {
      for (const it of expired) {
        if (dd.items[it.id]?.status === "held" || dd.items[it.id]?.status === "pending_approval") transition(dd, it.id, "EXPIRE", { actorName: "System", actorRole: "system", visibility: ["customer", "internal"] });
      }
    });
    return expired.length;
  },
};

/* ── Checkout / payments ───────────────────────────────────── */

export const RAIL_LABELS: Record<PaymentRail, string> = { mpesa: "M-Pesa", tigopesa: "Tigo Pesa", airtel: "Airtel Money", halopesa: "Halopesa", card: "Card", bank: "Bank transfer" };

export const checkout = {
  /** Creates a payment intent and moves items to pending_payment. Simulator decides the outcome. */
  initiate(bookingId: string, rail: PaymentRail, opts: { phone?: string; cardLast4?: string } = {}): string {
    let paymentId = "";
    mutate((d) => {
      const b = d.bookings[bookingId];
      if (!b) throw new Error("Booking not found");
      const items = itemsOf(d, bookingId).filter((i) => i.status === "held" || i.status === "payment_failed" || i.status === "pending_payment");
      if (!items.length) throw new Error("Nothing to pay for");
      paymentId = genId("pay");
      const mode = d.simulator.paymentMode;
      const instant = rail === "bank";
      d.payments = { ...d.payments, [paymentId]: {
        id: paymentId, bookingId, rail, provider: rail === "mpesa" ? "Vodacom M-Pesa" : rail === "tigopesa" ? "Tigo Pesa" : rail === "airtel" ? "Airtel Money" : rail === "halopesa" ? "Halopesa" : rail === "card" ? "DPO Pay" : rail === "bank" ? "Bank transfer" : "Bank transfer",
        amountMinor: b.totalMinor, currency: b.currency, idempotencyKey: `idem_${bookingId}_${Date.now()}`, status: "pending", phone: opts.phone, createdAt: nowIso(), updatedAt: nowIso(),
        // prototype-only simulator hints
        ...({ simOutcome: instant ? "success" : mode, simFireAt: new Date(Date.now() + (instant ? 0 : 4000)).toISOString() } as object),
      } };
      d.bookings = { ...d.bookings, [bookingId]: { ...b, paymentRail: rail, paymentStatus: "pending" } };
      for (const it of items) {
        if (it.status === "payment_failed") transition(d, it.id, "RETRY_PAYMENT", { silent: true });
        if (d.items[it.id].status === "held") transition(d, it.id, "INITIATE_PAYMENT", { note: RAIL_LABELS[rail], visibility: ["customer", "internal"] });
      }
      addTimeline(d, { bookingId, event: rail === "mpesa" || rail === "tigopesa" || rail === "airtel" || rail === "halopesa" ? "Mobile money push sent" : rail === "card" ? "Card authorisation requested" : `${RAIL_LABELS[rail]} selected`, visibility: ["customer", "internal"], note: opts.phone });
      d.carts = { ...d.carts, [cartKey(d)]: null };
    });
    // A bank transfer settles out of band, so it confirms immediately in the prototype.
    if (rail === "bank") checkout.confirmPayment(paymentId, "BANK-TRANSFER");
    return paymentId;
  },

  /** Poll from T15. Applies the simulated provider outcome when due. Returns payment status. */
  poll(paymentId: string) {
    const d = getData();
    const p = d.payments[paymentId] as (typeof d.payments)[string] & { simOutcome?: string; simFireAt?: string };
    if (!p) return "missing" as const;
    if (p.status !== "pending") return p.status;
    if (p.simFireAt && new Date(p.simFireAt).getTime() <= Date.now()) {
      const outcome = p.simOutcome ?? "success";
      if (outcome === "success") checkout.confirmPayment(paymentId, `MP${Date.now().toString(36).toUpperCase().slice(-8)}`);
      else if (outcome === "fail") checkout.failPayment(paymentId, "Insufficient funds (customer)");
      else if (outcome === "duplicate_callback") {
        const ref = `MP${Date.now().toString(36).toUpperCase().slice(-8)}`;
        checkout.confirmPayment(paymentId, ref);
        checkout.confirmPayment(paymentId, ref); // duplicate delivered by provider — must be idempotent
      }
      // timeout / lost_callback: do nothing, UI times out
    }
    return getData().payments[paymentId]?.status ?? "missing";
  },

  /** Idempotent payment confirmation. A duplicate callback produces one transition and one ledger entry. */
  confirmPayment(paymentId: string, providerReference: string) {
    mutate((d) => {
      const p = d.payments[paymentId];
      if (!p) return;
      if (p.status === "succeeded") {
        addTimeline(d, { bookingId: p.bookingId, event: "Duplicate payment callback ignored", note: `Idempotency key ${p.idempotencyKey} already processed`, visibility: ["internal"], actorName: "System", actorRole: "system" });
        return;
      }
      const b = d.bookings[p.bookingId];
      d.payments = { ...d.payments, [paymentId]: { ...p, status: "succeeded", providerReference, callbackReceivedAt: nowIso(), reconciledAt: nowIso(), updatedAt: nowIso() } };
      d.bookings = { ...d.bookings, [p.bookingId]: { ...b, paymentStatus: "succeeded", paymentRail: p.rail } };
      const cashAccount = `cash.${p.rail}`;
      postLedger(d, [
        { bookingId: b.id, account: cashAccount, debitMinor: p.amountMinor, creditMinor: 0, currency: b.currency, description: `Payment ${b.reference} · ${providerReference}` },
        { bookingId: b.id, account: "liability.customer_deposits", debitMinor: 0, creditMinor: p.amountMinor, currency: b.currency, description: `Payment ${b.reference}` },
      ]);
      // move inventory held → sold
      for (const it of itemsOf(d, b.id)) {
        if (it.status !== "pending_payment") continue;
        const prod = d.products[it.productId];
        const dates = prod?.vertical === "stay" ? datesBetween(it.travelDateFrom, it.travelDateTo) : [it.travelDateFrom];
        const inv = { ...d.inventory };
        for (const dt of dates) { const u = unitFor(d, it.productId, dt); inv[`${it.productId}:${dt}`] = { ...u, capacityHeld: Math.max(0, u.capacityHeld - it.quantity), capacitySold: u.capacitySold + it.quantity }; }
        d.inventory = inv;
        transition(d, it.id, "PAYMENT_CONFIRMED", { note: `${RAIL_LABELS[p.rail]} · ${providerReference}`, actorName: "System", actorRole: "system" });
        d.items = { ...d.items, [it.id]: { ...d.items[it.id], holdExpiresAt: undefined } };
        if (prod?.instantConfirm) {
          transition(d, it.id, "SUPPLIER_CONFIRMED", { note: "Instant confirmation", actorName: "System", actorRole: "system" });
          const ref = `${(prod.title.match(/[A-Z]{2}\s?\d{3}/)?.[0] ?? prod.supplierId.replace("sup_", "").toUpperCase().slice(0, 3))}-${Date.now().toString(36).toUpperCase().slice(-6)}`;
          d.items = { ...d.items, [it.id]: { ...d.items[it.id], supplierReference: ref } };
          recogniseRevenue(d, d.items[it.id]);
        } else {
          transition(d, it.id, "SUPPLIER_REQUESTED", { visibility: ["supplier", "internal"], actorName: "System", actorRole: "system" });
          const supplierUsers = Object.values(d.users).filter((u) => u.organisationId === it.supplierId);
          for (const su of supplierUsers) notify(d, { userId: su.id, audience: "supplier", channel: "whatsapp", title: `New booking ${b.reference}`, body: `${it.productSnapshot.title} · ${it.travelDateFrom} → ${it.travelDateTo}. Please confirm within 2 hours.`, bookingReference: b.reference });
        }
      }
      const lead = b.leadTraveller;
      notify(d, { userId: b.buyerUserId, audience: "customer", channel: "sms", title: `Payment received · ${b.reference}`, body: `TZS ${p.amountMinor.toLocaleString()} received. We're confirming with the supplier, usually under 2 hours.${lead ? "" : ""}`, bookingReference: b.reference });
      // resolve any reconciliation task
      for (const t of Object.values(d.opsTasks)) if (t.kind === "reconciliation" && t.bookingId === b.id && t.status !== "resolved") d.opsTasks = { ...d.opsTasks, [t.id]: { ...t, status: "resolved", resolvedAt: nowIso() } };
    });
  },

  failPayment(paymentId: string, reason: string) {
    mutate((d) => {
      const p = d.payments[paymentId];
      if (!p || p.status !== "pending") return;
      const b = d.bookings[p.bookingId];
      d.payments = { ...d.payments, [paymentId]: { ...p, status: "failed", updatedAt: nowIso() } };
      d.bookings = { ...d.bookings, [p.bookingId]: { ...b, paymentStatus: "failed" } };
      for (const it of itemsOf(d, b.id)) if (it.status === "pending_payment") transition(d, it.id, "PAYMENT_FAILED", { note: reason, actorName: "System", actorRole: "system", visibility: ["customer", "internal"] });
      // restore cart so the user can retry
      d.carts = { ...d.carts, [cartKey(d)]: null };
    });
  },

  /** T15 fallback: customer enters the mobile money reference manually */
  enterManualReference(paymentId: string, reference: string) {
    mutate((d) => {
      const p = d.payments[paymentId];
      if (!p) return;
      const b = d.bookings[p.bookingId];
      d.payments = { ...d.payments, [paymentId]: { ...p, status: "reconciliation_pending", customerReference: reference, updatedAt: nowIso() } };
      d.bookings = { ...d.bookings, [b.id]: { ...b, paymentStatus: "reconciliation_pending" } };
      for (const it of itemsOf(d, b.id)) if (it.status === "pending_payment") d.items = { ...d.items, [it.id]: { ...it, holdExpiresAt: new Date(Date.now() + 24 * 3_600_000).toISOString() } };
      addTimeline(d, { bookingId: b.id, event: `Customer entered ${RAIL_LABELS[p.rail]} reference ${reference}`, note: "Reconciliation pending · hold extended 24h", visibility: ["customer", "internal"] });
      const task = { id: genId("ot"), kind: "reconciliation" as const, bookingId: b.id, bookingReference: b.reference, title: `Manual ${RAIL_LABELS[p.rail]} reference entered`, detail: `Customer reports TZS ${p.amountMinor.toLocaleString()} left account, ref ${reference}. Verify with provider and match.`, status: "open" as const, slaDueAt: new Date(Date.now() + 3_600_000).toISOString(), createdAt: nowIso() };
      d.opsTasks = { ...d.opsTasks, [task.id]: task };
      notify(d, { userId: "usr_ops_officer", audience: "internal", channel: "in_app", title: `Reconciliation needed · ${b.reference}`, body: `Ref ${reference} · TZS ${p.amountMinor.toLocaleString()}`, bookingReference: b.reference });
    });
  },

  /** F02: ops queries the provider by reference and matches or rejects */
  reconcile(paymentId: string, found: boolean, providerReference?: string) {
    const d = getData();
    const p = d.payments[paymentId];
    if (!p) return;
    if (found) {
      checkout.confirmPayment(paymentId, providerReference ?? p.customerReference ?? "MANUAL");
      mutate((dd) => {
        const pp = dd.payments[paymentId];
        dd.payments = { ...dd.payments, [paymentId]: { ...pp, reconciledBy: actor(dd).name } };
        writeAudit(dd, { scope: "platform", action: "PAYMENT_MANUAL_MATCH", resourceType: "payment", resourceId: paymentId, before: { status: "reconciliation_pending" }, after: { status: "succeeded", providerReference } });
      });
    } else {
      mutate((dd) => {
        const pp = dd.payments[paymentId];
        const b = dd.bookings[pp.bookingId];
        dd.payments = { ...dd.payments, [paymentId]: { ...pp, status: "failed", reconciledBy: actor(dd).name, updatedAt: nowIso() } };
        dd.bookings = { ...dd.bookings, [b.id]: { ...b, paymentStatus: "failed" } };
        for (const it of itemsOf(dd, b.id)) if (it.status === "pending_payment") transition(dd, it.id, "EXPIRE", { note: "Payment not found at provider · hold released", visibility: ["customer", "internal"] });
        addTimeline(dd, { bookingId: b.id, event: "Reconciliation · payment not found", note: "Customer advised; if debited, refund instruction sent to provider", visibility: ["customer", "internal"] });
        for (const t of Object.values(dd.opsTasks)) if (t.kind === "reconciliation" && t.bookingId === b.id) dd.opsTasks = { ...dd.opsTasks, [t.id]: { ...t, status: "resolved", resolvedAt: nowIso() } };
        writeAudit(dd, { scope: "platform", action: "PAYMENT_RECONCILE_NOT_FOUND", resourceType: "payment", resourceId: paymentId });
        notify(dd, { userId: b.buyerUserId, audience: "customer", channel: "sms", title: `Payment not found · ${b.reference}`, body: "We could not find your payment. If money left your account it will be reversed by your provider within 24 hours.", bookingReference: b.reference });
      });
    }
  },
};

/** On supplier confirmation move deposits → payable / revenue */
function recogniseRevenue(d: StoreData, it: BookingItem) {
  const b = d.bookings[it.bookingId];
  const svc = it.sellPriceMinor - it.netCostMinor - it.commissionMinor - it.markupMinor - it.taxMinor;
  postLedger(d, [
    { bookingId: b.id, account: "liability.customer_deposits", debitMinor: it.sellPriceMinor, creditMinor: 0, currency: b.currency, description: `Recognise ${b.reference} · ${it.productSnapshot.title}` },
    { bookingId: b.id, account: "liability.supplier_payable", debitMinor: 0, creditMinor: it.netCostMinor, currency: b.currency, description: `Supplier payable · ${it.productSnapshot.title}` },
    { bookingId: b.id, account: "revenue.commission", debitMinor: 0, creditMinor: it.commissionMinor + it.markupMinor, currency: b.currency, description: `Commission · ${b.reference}` },
    { bookingId: b.id, account: "liability.vat_payable", debitMinor: 0, creditMinor: it.taxMinor, currency: b.currency, description: `VAT · ${b.reference}` },
    { bookingId: b.id, account: "revenue.service_fee", debitMinor: 0, creditMinor: svc, currency: b.currency, description: `Service fee · ${b.reference}` },
  ]);
}

/* ── Supplier and operations actions ─────────────────────── */

export const bookingOps = {
  supplierConfirm(itemId: string, supplierReference: string) {
    mutate((d) => {
      const it = d.items[itemId];
      const b = d.bookings[it.bookingId];
      d.items = { ...d.items, [itemId]: { ...it, supplierReference } };
      transition(d, itemId, "SUPPLIER_CONFIRMED", { note: `Ref ${supplierReference}` });
      recogniseRevenue(d, d.items[itemId]);
      notify(d, { userId: b.buyerUserId, audience: "customer", channel: "whatsapp", title: `${it.productSnapshot.title} confirmed · ${b.reference}`, body: "Your voucher is ready in My Trips.", bookingReference: b.reference });
      for (const t of Object.values(d.opsTasks)) if (t.itemId === itemId && t.kind === "supplier_timeout" && t.status !== "resolved") d.opsTasks = { ...d.opsTasks, [t.id]: { ...t, status: "resolved", resolvedAt: nowIso() } };
      writeAudit(d, { scope: `supplier:${it.supplierId}`, action: "SUPPLIER_CONFIRMED", resourceType: "booking_item", resourceId: itemId, after: { supplierReference } });
    });
  },
  supplierReject(itemId: string, reason: string) {
    mutate((d) => {
      const it = d.items[itemId];
      const b = d.bookings[it.bookingId];
      d.items = { ...d.items, [itemId]: { ...it, rejectionReason: reason } };
      transition(d, itemId, "SUPPLIER_REJECTED", { note: reason });
      // auto refund
      const payment = Object.values(d.payments).find((p) => p.bookingId === b.id && p.status === "succeeded");
      const refund: Refund = { id: genId("rf"), bookingId: b.id, itemId, paymentId: payment?.id, amountMinor: it.sellPriceMinor, currency: b.currency, reason: "Supplier rejected · automatic full refund", reasonCode: "supplier_rejected", status: "processed", requiredApprover: "none", approvals: [], createdAt: nowIso(), updatedAt: nowIso() };
      d.refunds = { ...d.refunds, [refund.id]: refund };
      postLedger(d, [
        { bookingId: b.id, account: "liability.customer_deposits", debitMinor: it.sellPriceMinor, creditMinor: 0, currency: b.currency, description: `Refund ${b.reference} · supplier rejected` },
        { bookingId: b.id, account: payment ? `cash.${payment.rail}` : "cash.mpesa", debitMinor: 0, creditMinor: it.sellPriceMinor, currency: b.currency, description: `Refund ${b.reference}` },
      ]);
      transition(d, itemId, "REFUND_PROCESSED", { note: "Automatic full refund", actorName: "System", actorRole: "system" });
      const others = itemsOf(d, b.id).filter((i) => i.id !== itemId);
      const task = { id: genId("ot"), kind: (others.length ? "partial_booking" : "supplier_rejected") as "partial_booking" | "supplier_rejected", bookingId: b.id, bookingReference: b.reference, itemId, title: others.length ? `Partial booking · ${it.productSnapshot.title} rejected` : `Supplier rejected · offer alternative`, detail: `${reason}. Refund auto issued (TZS ${it.sellPriceMinor.toLocaleString()}). Offer an alternative for ${it.travelDateFrom}.`, status: "open" as const, slaDueAt: new Date(Date.now() + 4 * 3_600_000).toISOString(), createdAt: nowIso() };
      d.opsTasks = { ...d.opsTasks, [task.id]: task };
      notify(d, { userId: b.buyerUserId, audience: "customer", channel: "email", title: `We couldn't confirm ${it.productSnapshot.title}`, body: `Full refund of TZS ${it.sellPriceMinor.toLocaleString()} issued automatically. Our team will call with alternatives.`, bookingReference: b.reference });
      writeAudit(d, { scope: `supplier:${it.supplierId}`, action: "SUPPLIER_REJECTED", resourceType: "booking_item", resourceId: itemId, after: { reason } });
    });
  },
  forceConfirm(itemId: string, note: string) {
    mutate((d) => {
      const it = d.items[itemId];
      d.items = { ...d.items, [itemId]: { ...it, supplierReference: it.supplierReference ?? `FORCE-${Date.now().toString(36).toUpperCase().slice(-5)}` } };
      transition(d, itemId, "SUPPLIER_CONFIRMED", { note: `Force confirmed by operations · ${note}` });
      recogniseRevenue(d, d.items[itemId]);
      for (const t of Object.values(d.opsTasks)) if (t.itemId === itemId && t.status !== "resolved") d.opsTasks = { ...d.opsTasks, [t.id]: { ...t, status: "resolved", resolvedAt: nowIso() } };
      writeAudit(d, { scope: "platform", action: "BOOKING_FORCE_CONFIRMED", resourceType: "booking_item", resourceId: itemId, before: { status: it.status }, after: { status: "confirmed", note } });
    });
  },
  chaseSupplier(itemId: string) {
    mutate((d) => {
      const it = d.items[itemId];
      const b = d.bookings[it.bookingId];
      addTimeline(d, { bookingId: b.id, itemId, event: "Supplier chased", visibility: ["supplier", "internal"], note: "Reminder sent via WhatsApp and email" });
      for (const su of Object.values(d.users).filter((u) => u.organisationId === it.supplierId)) notify(d, { userId: su.id, audience: "supplier", channel: "whatsapp", title: `Reminder · ${b.reference} awaiting confirmation`, body: `${it.productSnapshot.title} · please confirm or reject now.`, bookingReference: b.reference });
    });
  },
  /** Traveller / agent / ops cancels an item. Refund per snapshot; approval per ladder. */
  cancel(itemId: string, opts: { goodwill?: boolean; reason?: string } = {}) {
    let refundId = "";
    mutate((d) => {
      const it = d.items[itemId];
      const b = d.bookings[it.bookingId];
      const q = quoteRefund(it.cancellationPolicySnapshot, it.sellPriceMinor, it.travelDateFrom);
      transition(d, itemId, "CANCEL", { note: `${q.tierLabel} · refund TZS ${q.refundMinor.toLocaleString()}` });
      const approver = requiredApprover(q.refundMinor, q.withinFreeWindow, opts.goodwill);
      const payment = Object.values(d.payments).find((p) => p.bookingId === b.id && p.status === "succeeded");
      refundId = genId("rf");
      const auto = approver === "none" && q.refundMinor > 0;
      const refund: Refund = { id: refundId, bookingId: b.id, itemId, paymentId: payment?.id, amountMinor: q.refundMinor, currency: b.currency, reason: opts.reason ?? (q.withinFreeWindow ? "Cancelled within free window" : `${q.tierLabel}`), reasonCode: opts.goodwill ? "goodwill" : q.withinFreeWindow ? "free_window" : "policy_partial", status: auto ? "processed" : q.refundMinor === 0 ? "processed" : "pending_approval", requiredApprover: approver, approvals: [], createdAt: nowIso(), updatedAt: nowIso() };
      d.refunds = { ...d.refunds, [refundId]: refund };
      if (auto) {
        postLedger(d, [
          { bookingId: b.id, account: "liability.customer_deposits", debitMinor: q.refundMinor, creditMinor: 0, currency: b.currency, description: `Refund ${b.reference} · free window` },
          { bookingId: b.id, account: payment ? `cash.${payment.rail}` : "cash.mpesa", debitMinor: 0, creditMinor: q.refundMinor, currency: b.currency, description: `Refund ${b.reference}` },
        ]);
        transition(d, itemId, "REFUND_PROCESSED", { note: "Automatic · within free cancellation window", actorName: "System", actorRole: "system" });
        notify(d, { userId: b.buyerUserId, audience: "customer", channel: "sms", title: `Refund of TZS ${q.refundMinor.toLocaleString()} on its way`, body: `${b.reference} cancelled within the free window. Refund to your ${payment ? RAIL_LABELS[payment.rail] : "original payment method"} within 3 business days.`, bookingReference: b.reference });
      } else if (q.refundMinor > 0) {
        notify(d, { userId: "usr_finance_officer", audience: "internal", channel: "in_app", title: `Refund pending approval · ${b.reference}`, body: `TZS ${q.refundMinor.toLocaleString()} · requires ${approver}`, bookingReference: b.reference });
      }
      writeAudit(d, { scope: "platform", action: "BOOKING_ITEM_CANCELLED", resourceType: "booking_item", resourceId: itemId, after: { refundMinor: q.refundMinor, approver } });
    });
    return refundId;
  },
  approveRefund(refundId: string) {
    mutate((d) => {
      const r = d.refunds[refundId];
      const a = actor(d);
      const approvals = [...r.approvals, { userId: a.id, name: a.name, role: a.role, at: nowIso() }];
      const needed = r.requiredApprover === "dual" ? 2 : 1;
      const done = approvals.length >= needed;
      d.refunds = { ...d.refunds, [refundId]: { ...r, approvals, status: done ? "approved" : "pending_approval", updatedAt: nowIso() } };
      writeAudit(d, { scope: "platform", action: "REFUND_APPROVED", resourceType: "refund", resourceId: refundId, after: { approvals: approvals.length, needed } });
    });
  },
  rejectRefund(refundId: string, reason: string) {
    mutate((d) => {
      const r = d.refunds[refundId];
      d.refunds = { ...d.refunds, [refundId]: { ...r, status: "rejected", reason: `${r.reason} · rejected: ${reason}`, updatedAt: nowIso() } };
      writeAudit(d, { scope: "platform", action: "REFUND_REJECTED", resourceType: "refund", resourceId: refundId, after: { reason } });
    });
  },
  processRefund(refundId: string) {
    mutate((d) => {
      const r = d.refunds[refundId];
      const b = d.bookings[r.bookingId];
      const payment = r.paymentId ? d.payments[r.paymentId] : undefined;
      d.refunds = { ...d.refunds, [refundId]: { ...r, status: "processed", updatedAt: nowIso() } };
      postLedger(d, [
        { bookingId: b.id, account: "liability.customer_deposits", debitMinor: r.amountMinor, creditMinor: 0, currency: b.currency, description: `Refund ${b.reference} · ${r.reasonCode}` },
        { bookingId: b.id, account: payment ? `cash.${payment.rail}` : "cash.mpesa", debitMinor: 0, creditMinor: r.amountMinor, currency: b.currency, description: `Refund ${b.reference}` },
      ]);
      if (r.itemId && d.items[r.itemId]?.status === "cancelled") transition(d, r.itemId, "REFUND_PROCESSED", { note: `TZS ${r.amountMinor.toLocaleString()} refunded` });
      else addTimeline(d, { bookingId: b.id, event: `Refund processed · TZS ${r.amountMinor.toLocaleString()}`, note: r.reason, visibility: ["customer", "internal"] });
      notify(d, { userId: b.buyerUserId, audience: "customer", channel: "sms", title: `Refund processed · ${b.reference}`, body: `TZS ${r.amountMinor.toLocaleString()} sent to your ${payment ? RAIL_LABELS[payment.rail] : "payment method"}.`, bookingReference: b.reference });
      writeAudit(d, { scope: "platform", action: "REFUND_PROCESSED", resourceType: "refund", resourceId: refundId, after: { amountMinor: r.amountMinor } });
    });
  },
  requestGoodwillRefund(bookingId: string, amountMinor: number, reason: string) {
    mutate((d) => {
      const b = d.bookings[bookingId];
      const payment = Object.values(d.payments).find((p) => p.bookingId === b.id && p.status === "succeeded");
      const id = genId("rf");
      d.refunds = { ...d.refunds, [id]: { id, bookingId, paymentId: payment?.id, amountMinor, currency: b.currency, reason: `Goodwill · ${reason}`, reasonCode: "goodwill", status: "pending_approval", requiredApprover: "manager", approvals: [], createdAt: nowIso(), updatedAt: nowIso() } };
      addTimeline(d, { bookingId, event: `Goodwill refund requested · TZS ${amountMinor.toLocaleString()}`, note: reason, visibility: ["internal"] });
      writeAudit(d, { scope: "platform", action: "REFUND_GOODWILL_REQUESTED", resourceType: "booking", resourceId: bookingId, after: { amountMinor, reason } });
    });
  },
  requestAmendment(itemId: string, kind: "date_change" | "pax_change" | "room_change", detail: string, fareDifferenceMinor: number) {
    mutate((d) => {
      const it = d.items[itemId];
      const b = d.bookings[it.bookingId];
      const id = genId("am");
      d.amendments = { ...d.amendments, [id]: { id, bookingId: b.id, bookingReference: b.reference, itemId, kind, detail, fareDifferenceMinor, currency: b.currency, status: "requested", requestedByName: actor(d).name, createdAt: nowIso() } };
      const task = { id: genId("ot"), kind: "amendment" as const, bookingId: b.id, bookingReference: b.reference, itemId, title: `Amendment · ${detail}`, detail: `Fare difference TZS ${fareDifferenceMinor.toLocaleString()}`, status: "open" as const, slaDueAt: new Date(Date.now() + 6 * 3_600_000).toISOString(), createdAt: nowIso() };
      d.opsTasks = { ...d.opsTasks, [task.id]: task };
      addTimeline(d, { bookingId: b.id, itemId, event: "Amendment requested", note: detail, visibility: ["customer", "internal"] });
    });
  },
  decideAmendment(amendmentId: string, approve: boolean, note?: string) {
    mutate((d) => {
      const am = d.amendments[amendmentId];
      const b = d.bookings[am.bookingId];
      d.amendments = { ...d.amendments, [amendmentId]: { ...am, status: approve ? "approved" : "declined", decidedAt: nowIso() } };
      if (approve) {
        const it = d.items[am.itemId];
        if (it && (it.status === "confirmed")) {
          transition(d, am.itemId, "AMEND", { note: am.detail });
          d.items = { ...d.items, [am.itemId]: { ...d.items[am.itemId], sellPriceMinor: it.sellPriceMinor + am.fareDifferenceMinor } };
          transition(d, am.itemId, "SUPPLIER_CONFIRMED", { note: "Amendment confirmed with supplier", silent: true });
          syncBooking(d, b.id);
        }
      } else addTimeline(d, { bookingId: b.id, itemId: am.itemId, event: "Amendment declined", note, visibility: ["customer", "internal"] });
      for (const t of Object.values(d.opsTasks)) if (t.kind === "amendment" && t.bookingId === b.id && t.status !== "resolved") d.opsTasks = { ...d.opsTasks, [t.id]: { ...t, status: "resolved", resolvedAt: nowIso() } };
      writeAudit(d, { scope: "platform", action: approve ? "AMENDMENT_APPROVED" : "AMENDMENT_DECLINED", resourceType: "amendment", resourceId: amendmentId, after: { note } });
    });
  },
  addNote(bookingId: string, text: string) {
    mutate((d) => {
      const b = d.bookings[bookingId];
      d.bookings = { ...d.bookings, [bookingId]: { ...b, internalNotes: [...b.internalNotes, { id: genId("nt"), authorName: actor(d).name, text, at: nowIso() }] } };
    });
  },
  markTravelled(itemId: string) {
    mutate((d) => { transition(d, itemId, "TRAVEL_COMPLETED"); });
  },
  /** O04 manual booking created by operations on behalf of a customer */
  createManual(input: { lead: SavedTraveller; productId: string; ratePlanId: string; dateFrom: string; dateTo: string; quantity: number; pax: Pax; rail: PaymentRail; note?: string }): string {
    let bookingId = "";
    mutate((d) => {
      const p = d.products[input.productId];
      const rp = d.ratePlans[input.ratePlanId];
      const a = actor(d);
      const policy = cancellationPolicies.find((c) => c.id === rp.cancellationPolicyId)!;
      bookingId = genId("bk");
      const b: Booking = { id: bookingId, reference: genReference(d), buyerType: "consumer", buyerUserId: "guest", status: "draft", currency: "TZS", subtotalMinor: 0, taxMinor: 0, feeMinor: 0, discountMinor: 0, markupMinor: 0, totalMinor: 0, paymentStatus: "unpaid", leadTraveller: input.lead, travellers: [input.lead], extras: [], createdBy: a.id, createdVia: "admin", internalNotes: input.note ? [{ id: genId("nt"), authorName: a.name, text: input.note, at: nowIso() }] : [], createdAt: nowIso(), updatedAt: nowIso() };
      d.bookings = { ...d.bookings, [bookingId]: b };
      const price = priceItem(d, b, { vertical: p.vertical, ratePlanId: rp.id, travelDateFrom: input.dateFrom, travelDateTo: input.dateTo, quantity: input.quantity, pax: input.pax });
      const itemId = genId("bi");
      d.items = { ...d.items, [itemId]: { id: itemId, bookingId, vertical: p.vertical, productId: p.id, ratePlanId: rp.id, supplierId: p.supplierId, status: "draft", travelDateFrom: input.dateFrom, travelDateTo: input.dateTo, quantity: input.quantity, pax: input.pax, netCostMinor: price.netMinor ?? 0, sellPriceMinor: price.totalMinor, markupMinor: 0, commissionMinor: price.commissionMinor ?? 0, taxMinor: price.taxMinor, feeMinor: price.feeMinor, cancellationPolicySnapshot: { policyId: policy.id, name: policy.name, summary: policy.summary, tiers: policy.tiers }, productSnapshot: { title: p.title, city: p.location.city, region: p.location.region, ratePlanName: rp.name, tone: p.media[0]?.tone }, createdAt: nowIso(), updatedAt: nowIso() } };
      addTimeline(d, { bookingId, event: "Manual booking created by operations", visibility: ["customer", "internal"] });
      transition(d, itemId, "HOLD", { visibility: ["internal"] });
      writeAudit(d, { scope: "platform", action: "MANUAL_BOOKING_CREATED", resourceType: "booking", resourceId: bookingId, after: { productId: p.id, rail: input.rail } });
    });
    const payId = checkout.initiate(bookingId, input.rail);
    checkout.confirmPayment(payId, `${input.rail.toUpperCase()}-OFFLINE-${Date.now().toString(36).toUpperCase().slice(-5)}`);
    return bookingId;
  },
};

/* ── Corporate approval flow ──────────────────────────────── */

/* ── Wishlist ─────────────────────────────────────────────── */

/**
 * Saved products, keyed by signed-in user or by "guest" for this browser. The price at the
 * moment of saving is captured so the wishlist can show whether it has moved since.
 */
export const wishlist = {
  key(d: StoreData) {
    return d.session.userId ?? "guest";
  },
  has(d: StoreData, productId: string) {
    return (d.wishlists[wishlist.key(d)] ?? []).some((w) => w.productId === productId);
  },
  toggle(productId: string) {
    mutate((d) => {
      const key = wishlist.key(d);
      const current = d.wishlists[key] ?? [];
      const existing = current.find((w) => w.productId === productId);
      const next = existing
        ? current.filter((w) => w.productId !== productId)
        : [...current, { productId, addedAt: nowIso(), priceAtSaveMinor: d.products[productId]?.priceFromMinor ?? 0 }];
      d.wishlists = { ...d.wishlists, [key]: next };
    });
  },
};

/* ── Flight ancillaries ───────────────────────────────────────── */

/**
 * Seats and bags are priced on top of the fare and re-synced into the booking total, the way a
 * GDS attaches ancillary offers to a flight segment. They are stored on the item so they survive
 * into the voucher and the boarding pass.
 */
export const ancillaries = {
  set(itemId: string, next: { seats?: SeatAssignment[]; bags?: BagSelection[] }) {
    mutate((d) => {
      const item = d.items[itemId];
      if (!item) return;
      const seats = next.seats ?? item.seats ?? [];
      const bags = next.bags ?? item.bags ?? [];
      const cabin = (d.products[item.productId]?.attributes as { cabin?: string } | undefined)?.cabin === "business" ? "business" : "economy";
      const extraMinor = seats.reduce((sum, a) => sum + a.priceMinor, 0) + bagsTotalMinor(bags, cabin);
      const fareMinor = item.sellPriceMinor - (item.ancillaryMinor ?? 0);

      d.items = {
        ...d.items,
        [itemId]: { ...item, seats, bags, ancillaryMinor: extraMinor, sellPriceMinor: fareMinor + extraMinor, updatedAt: nowIso() },
      };
      syncBooking(d, item.bookingId);
    });
  },
};
