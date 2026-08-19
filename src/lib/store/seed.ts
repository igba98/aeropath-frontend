import type {
  AmendmentRequest, ApprovalRequest, AuditLog, Booking, BookingItem, BuyerType, Currency, Extra, ItemStatus, LedgerEntry, Notification, OpsTask,
  Pax, Payment, PaymentRail, Payout, Refund, RoleId, SavedTraveller, TimelineEvent, User,
} from "../domain/types";
import { computePrice } from "../domain/pricing";
import { deriveBookingStatus, SUPPLIER_SLA_SECONDS } from "../domain/state-machine";
import { requiredApprover } from "../domain/refunds";
import { cancellationPolicies } from "../fixtures/policies";
import { organisations } from "../fixtures/organisations";
import { users } from "../fixtures/users";
import { products, ratePlans, extrasCatalogue } from "../fixtures/products";
import { contentPages, featureFlags, integrations, notificationTemplates, promos, reviews, tickets } from "../fixtures/misc";
import { daysFromNow, hoursFromNow, iso, ymd } from "../fixtures/helpers";
import type { StoreData } from "./index";

const byId = <T extends { id: string }>(arr: T[]) => Object.fromEntries(arr.map((x) => [x.id, x])) as Record<string, T>;
const byKey = <T>(arr: T[], key: (t: T) => string) => Object.fromEntries(arr.map((x) => [key(x), x])) as Record<string, T>;

let n = 0;
const nid = (p: string) => `${p}_${(++n).toString(36).padStart(4, "0")}`;

interface SeedItemSpec {
  ratePlanId: string;
  from: number; // days from now
  nights?: number;
  quantity?: number;
  pax?: Pax;
  status: ItemStatus;
  supplierReference?: string;
  rejectionReason?: string;
  specialRequests?: string;
}
interface SeedBookingSpec {
  reference: string;
  buyerType: BuyerType;
  buyerUserId: string;
  organisationId?: string;
  clientOrgName?: string;
  createdVia?: Booking["createdVia"];
  lead: SavedTraveller;
  travellers?: SavedTraveller[];
  extras?: Extra[];
  rail?: PaymentRail;
  paymentStatus?: Booking["paymentStatus"];
  markupPct?: number;
  costCentre?: string;
  projectCode?: string;
  justification?: string;
  createdDaysAgo: number;
  items: SeedItemSpec[];
  paidAt?: number; // hours ago
  notes?: Booking["internalNotes"];
  currency?: Currency;
}

function seedBooking(spec: SeedBookingSpec, out: { bookings: Booking[]; items: BookingItem[]; timeline: TimelineEvent[]; payments: Payment[]; ledger: LedgerEntry[] }): Booking {
  const bookingId = nid("bk");
  const createdAt = iso(daysFromNow(-spec.createdDaysAgo, 10));
  const items: BookingItem[] = [];
  let subtotal = 0, tax = 0, fee = 0, markup = 0;
  for (const s of spec.items) {
    const rp = ratePlans.find((r) => r.id === s.ratePlanId)!;
    const product = products.find((p) => p.id === rp.productId)!;
    const nights = s.nights ?? (product.vertical === "stay" ? 2 : 1);
    const dateFrom = ymd(daysFromNow(s.from));
    const dateTo = ymd(daysFromNow(s.from + (product.vertical === "stay" ? nights : (Number(product.attributes.durationDays) || 1) - 1)));
    const pax = s.pax ?? { adults: 2, children: 0, infants: 0 };
    const price = computePrice({ vertical: product.vertical, ratePlan: rp, nights, quantity: s.quantity ?? 1, pax, buyerType: spec.buyerType, markupPct: spec.markupPct, extras: items.length === 0 ? spec.extras : [] });
    const policy = cancellationPolicies.find((c) => c.id === rp.cancellationPolicyId)!;
    const freeTier = policy.tiers.find((t) => t.refundPct === 100);
    const item: BookingItem = {
      id: nid("bi"), bookingId, vertical: product.vertical, productId: product.id, ratePlanId: rp.id, supplierId: product.supplierId, status: s.status,
      travelDateFrom: dateFrom, travelDateTo: dateTo, quantity: s.quantity ?? 1, pax,
      netCostMinor: price.netMinor ?? 0, sellPriceMinor: price.totalMinor, markupMinor: price.markupMinor, commissionMinor: price.commissionMinor ?? 0, taxMinor: price.taxMinor, feeMinor: price.feeMinor,
      supplierReference: s.supplierReference, rejectionReason: s.rejectionReason, specialRequests: s.specialRequests,
      cancellationPolicySnapshot: { policyId: policy.id, name: policy.name, summary: policy.summary, tiers: policy.tiers, freeCancellationUntil: freeTier ? iso(daysFromNow(s.from - freeTier.daysBefore)) : undefined },
      productSnapshot: { title: product.title, city: product.location.city, region: product.location.region, ratePlanName: rp.name, tone: product.media[0]?.tone, summary: product.description.slice(0, 120) },
      slaDeadlineAt: s.status === "awaiting_supplier" ? iso(new Date(Date.now() - (spec.paidAt ?? 1) * 3_600_000 + SUPPLIER_SLA_SECONDS * 1000)) : undefined,
      createdAt, updatedAt: createdAt,
    };
    items.push(item);
    subtotal += price.baseMinor; tax += price.taxMinor; fee += price.feeMinor; markup += price.markupMinor;
  }
  const total = subtotal + tax + fee + markup;
  const status = deriveBookingStatus(items.map((i) => i.status));
  const booking: Booking = {
    id: bookingId, reference: spec.reference, buyerType: spec.buyerType, buyerUserId: spec.buyerUserId, organisationId: spec.organisationId, clientOrgName: spec.clientOrgName,
    status, currency: spec.currency ?? "TZS", subtotalMinor: subtotal, taxMinor: tax, feeMinor: fee, discountMinor: 0, markupMinor: markup, totalMinor: total,
    paymentStatus: spec.paymentStatus ?? (spec.rail ? "succeeded" : "unpaid"), paymentRail: spec.rail,
    leadTraveller: spec.lead, travellers: spec.travellers ?? [spec.lead], extras: spec.extras ?? [], costCentre: spec.costCentre, projectCode: spec.projectCode, justification: spec.justification,
    markupPct: spec.markupPct, createdBy: spec.buyerUserId, createdVia: spec.createdVia ?? "web", internalNotes: spec.notes ?? [], createdAt, updatedAt: createdAt,
  };
  out.bookings.push(booking);
  out.items.push(...items);

  // timeline
  const t = (event: string, at: string, opts: Partial<TimelineEvent> = {}) =>
    out.timeline.push({ id: nid("ev"), bookingId, at, event, actorName: "System", actorRole: "system", visibility: ["customer", "supplier", "internal"], ...opts });
  t("Booking created", createdAt, { actorName: spec.lead.firstName + " " + spec.lead.lastName, actorRole: "traveller" });
  for (const it of items) t("Inventory held", createdAt, { itemId: it.id, to: "held", visibility: ["customer", "internal"] });
  if (spec.rail && spec.paymentStatus !== "pending" && spec.paymentStatus !== "reconciliation_pending") {
    const paidAt = iso(hoursFromNow(-(spec.paidAt ?? spec.createdDaysAgo * 24 - 0.5)));
    const payment: Payment = { id: nid("pay"), bookingId, rail: spec.rail, provider: spec.rail === "mpesa" ? "Vodacom M-Pesa" : spec.rail === "card" ? "DPO Pay" : spec.rail, amountMinor: total, currency: booking.currency, providerReference: spec.rail === "mpesa" ? `R${spec.reference.slice(3)}Q9` : undefined, idempotencyKey: `idem_${bookingId}`, status: "succeeded", callbackReceivedAt: paidAt, reconciledAt: paidAt, createdAt: paidAt, updatedAt: paidAt };
    out.payments.push(payment);
    t("Payment received", paidAt, { to: "paid", note: `${spec.rail.toUpperCase()} · ${payment.providerReference ?? payment.provider}` });
    const grp = nid("lg");
    out.ledger.push(
      { id: nid("le"), entryGroupId: grp, bookingId, account: `cash.${spec.rail}`, debitMinor: total, creditMinor: 0, currency: booking.currency, description: `Payment ${spec.reference}`, entryDate: paidAt },
      { id: nid("le"), entryGroupId: grp, bookingId, account: "liability.customer_deposits", debitMinor: 0, creditMinor: total, currency: booking.currency, description: `Payment ${spec.reference}`, entryDate: paidAt },
    );
    for (const it of items) {
      if (["awaiting_supplier", "confirmed", "used", "supplier_rejected", "cancelled", "refunded", "amended"].includes(it.status)) t("Confirmation requested from supplier", paidAt, { itemId: it.id, to: "awaiting_supplier", visibility: ["supplier", "internal"] });
      if (["confirmed", "used", "cancelled", "refunded", "amended"].includes(it.status)) {
        const confAt = iso(new Date(new Date(paidAt).getTime() + 47 * 60_000));
        t("Supplier confirmed", confAt, { itemId: it.id, to: "confirmed", actorName: organisations.find((o) => o.id === it.supplierId)?.contactName ?? "Supplier", actorRole: "supplier_admin", note: it.supplierReference ? `Ref ${it.supplierReference}` : undefined });
        const g2 = nid("lg");
        out.ledger.push(
          { id: nid("le"), entryGroupId: g2, bookingId, account: "liability.customer_deposits", debitMinor: it.sellPriceMinor, creditMinor: 0, currency: booking.currency, description: `Recognise ${spec.reference} · ${it.productSnapshot.title}`, entryDate: confAt },
          { id: nid("le"), entryGroupId: g2, bookingId, account: "liability.supplier_payable", debitMinor: 0, creditMinor: it.netCostMinor, currency: booking.currency, description: `Supplier payable · ${it.productSnapshot.title}`, entryDate: confAt },
          { id: nid("le"), entryGroupId: g2, bookingId, account: "revenue.commission", debitMinor: 0, creditMinor: it.commissionMinor + it.markupMinor, currency: booking.currency, description: `Commission · ${spec.reference}`, entryDate: confAt },
          { id: nid("le"), entryGroupId: g2, bookingId, account: "liability.vat_payable", debitMinor: 0, creditMinor: it.taxMinor, currency: booking.currency, description: `VAT · ${spec.reference}`, entryDate: confAt },
          { id: nid("le"), entryGroupId: g2, bookingId, account: "revenue.service_fee", debitMinor: 0, creditMinor: it.sellPriceMinor - it.netCostMinor - it.commissionMinor - it.markupMinor - it.taxMinor, currency: booking.currency, description: `Service fee · ${spec.reference}`, entryDate: confAt },
        );
      }
      if (it.status === "supplier_rejected" || (it.status === "refunded" && it.rejectionReason)) {
        const rejAt = iso(new Date(new Date(paidAt).getTime() + 95 * 60_000));
        t("Supplier rejected", rejAt, { itemId: it.id, to: "supplier_rejected", actorName: organisations.find((o) => o.id === it.supplierId)?.contactName ?? "Supplier", actorRole: "supplier_admin", note: it.rejectionReason });
        t("Automatic refund initiated", rejAt, { itemId: it.id, note: "Full refund · no approval required" });
      }
      if (it.status === "used") t("Travel completed", iso(daysFromNow(spec.items[0].from + 1)), { itemId: it.id, to: "used" });
      if (it.status === "cancelled" || (it.status === "refunded" && !it.rejectionReason)) t("Cancelled by traveller", iso(daysFromNow(-Math.max(1, spec.createdDaysAgo - 3))), { itemId: it.id, to: "cancelled", actorName: spec.lead.firstName + " " + spec.lead.lastName, actorRole: "traveller" });
      if (it.status === "refunded") t("Refund processed", iso(daysFromNow(-Math.max(0, spec.createdDaysAgo - 4))), { itemId: it.id, to: "refunded" });
    }
  }
  return booking;
}

export function buildSeed(): StoreData {
  n = 0;
  const amina = users.find((u) => u.id === "usr_traveller")!;
  const out = { bookings: [] as Booking[], items: [] as BookingItem[], timeline: [] as TimelineEvent[], payments: [] as Payment[], ledger: [] as LedgerEntry[] };
  const T = (o: Partial<SavedTraveller> & Pick<SavedTraveller, "firstName" | "lastName">): SavedTraveller => ({ id: nid("st"), title: "Mr", dateOfBirth: "1988-01-01", nationality: "TZ", phone: "+255700000000", email: `${o.firstName.toLowerCase()}@example.com`, ...o });
  const stayExtras = extrasCatalogue.stay;

  // 1 · Amina · Serena confirmed, upcoming
  const b1 = seedBooking({ reference: "AP-7K2M9", buyerType: "consumer", buyerUserId: amina.id, lead: amina.savedTravellers[0], travellers: amina.savedTravellers, extras: [stayExtras[0]], rail: "mpesa", createdDaysAgo: 12, paidAt: 12 * 24 - 1, items: [{ ratePlanId: "rp_serena_std_flex", from: 18, nights: 3, status: "confirmed", supplierReference: "SER-88213", specialRequests: "Ground floor room if possible, celebrating anniversary" }] }, out);
  // 2 · Ruth (guest) · Gran Melia, payment reconciliation pending
  const b2 = seedBooking({ reference: "AP-3B8QX", buyerType: "consumer", buyerUserId: "guest", lead: T({ title: "Mrs", firstName: "Ruth", lastName: "Mahenge", phone: "+255713998877", email: "ruth.mahenge@example.com" }), rail: "mpesa", paymentStatus: "reconciliation_pending", createdDaysAgo: 0, items: [{ ratePlanId: "rp_melia_std", from: 2, nights: 1, status: "pending_payment", pax: { adults: 1, children: 0, infants: 0 } }] }, out);
  out.payments.push({ id: nid("pay"), bookingId: b2.id, rail: "mpesa", provider: "Vodacom M-Pesa", amountMinor: b2.totalMinor, currency: "TZS", customerReference: "RJ7X21LMQ", idempotencyKey: `idem_${b2.id}`, status: "reconciliation_pending", phone: "+255713998877", createdAt: iso(hoursFromNow(-5)), updatedAt: iso(hoursFromNow(-4.9)) });
  out.timeline.push({ id: nid("ev"), bookingId: b2.id, at: iso(hoursFromNow(-5)), event: "M-Pesa push sent", actorName: "System", actorRole: "system", visibility: ["customer", "internal"] });
  out.timeline.push({ id: nid("ev"), bookingId: b2.id, at: iso(hoursFromNow(-4.95)), event: "Payment timed out · no callback", actorName: "System", actorRole: "system", visibility: ["internal"] });
  out.timeline.push({ id: nid("ev"), bookingId: b2.id, at: iso(hoursFromNow(-4.9)), event: "Customer entered M-Pesa reference RJ7X21LMQ", actorName: "Ruth Mahenge", actorRole: "guest", visibility: ["customer", "internal"], note: "Reconciliation pending · hold extended" });
  for (const it of out.items.filter((i) => i.bookingId === b2.id)) it.holdExpiresAt = iso(hoursFromNow(20));
  // 3 · Kevin · past spice tour, used
  seedBooking({ reference: "AP-9PL2W", buyerType: "consumer", buyerUserId: "guest", lead: T({ firstName: "Kevin", lastName: "Otieno", nationality: "KE", phone: "+254722001122", email: "kevin.otieno@example.com" }), rail: "card", createdDaysAgo: 20, paidAt: 20 * 24 - 2, items: [{ ratePlanId: "rp_tour_spice", from: -6, status: "used", supplierReference: "ZC-1180", pax: { adults: 2, children: 1, infants: 0 } }] }, out);
  // 5 · Amina · Kubu + flight, processing
  void seedBooking({ reference: "AP-Q4WZ8", buyerType: "consumer", buyerUserId: amina.id, lead: amina.savedTravellers[0], travellers: amina.savedTravellers, rail: "mpesa", createdDaysAgo: 0, paidAt: 0.6, items: [
    { ratePlanId: "rp_kubu_tent", from: 40, nights: 2, status: "awaiting_supplier" },
    { ratePlanId: "rp_fl_seu_znz", from: 42, status: "confirmed", supplierReference: "CQ-PNR-8H2K" },
  ] }, out);
  // 6 · Amina · past cancelled + refunded Zuri
  seedBooking({ reference: "AP-2NX4C", buyerType: "consumer", buyerUserId: amina.id, lead: amina.savedTravellers[0], rail: "mpesa", createdDaysAgo: 60, paidAt: 60 * 24 - 1, items: [{ ratePlanId: "rp_zuri_garden", from: -25, nights: 4, status: "refunded" }] }, out);
  // 7 · Overseas visitor · flights + transfer, confirmed
  const b7 = seedBooking({ reference: "AP-8H2K9", buyerType: "consumer", buyerUserId: "guest", lead: T({ firstName: "James", lastName: "Thompson", nationality: "GB", phone: "+447700900123", email: "james.t@example.co.uk", passportNumber: "GB5521139", passportExpiry: "2030-04-11" }), travellers: [T({ firstName: "James", lastName: "Thompson", nationality: "GB", phone: "+447700900123", email: "james.t@example.co.uk" }), T({ title: "Mrs", firstName: "Elena", lastName: "Thompson", nationality: "GB", phone: "+447700900124", email: "elena.t@example.co.uk" })], rail: "bank", createdDaysAgo: 5, paidAt: 5 * 24 - 2, createdVia: "web", items: [
    { ratePlanId: "rp_fl_dar_jro_flex", from: 22, status: "confirmed", supplierReference: "PW-PNR-2X9L" },
    { ratePlanId: "rp_xfer_jro_4x4", from: 22, status: "confirmed", supplierReference: "AAC-2210" },
  ] }, out);
  // 9 · Joseph · partial: farmhouse rejected + transfer confirmed
  const b9 = seedBooking({ reference: "AP-P4RT1", buyerType: "consumer", buyerUserId: "guest", lead: T({ firstName: "Joseph", lastName: "Mally", phone: "+255765112233", email: "joseph.mally@example.com" }), rail: "airtel", createdDaysAgo: 1, paidAt: 22, items: [
    { ratePlanId: "rp_farm_cottage", from: 6, nights: 2, status: "supplier_rejected", rejectionReason: "Overbooked · maintenance closure on the garden cottages" },
    { ratePlanId: "rp_xfer_jro_sedan", from: 6, status: "confirmed", supplierReference: "AAC-2251" },
  ] }, out);
  // 10 · Sarah · Kubu awaiting supplier past SLA
  const b10 = seedBooking({ reference: "AP-K9SLA", buyerType: "consumer", buyerUserId: "guest", lead: T({ title: "Ms", firstName: "Sarah", lastName: "Chen", nationality: "US", phone: "+14155550123", email: "sarah.chen@example.com" }), rail: "card", createdDaysAgo: 0, paidAt: 3.4, items: [{ ratePlanId: "rp_kubu_tent_gd", from: 15, nights: 3, status: "awaiting_supplier" }] }, out);
  // 11 · volume bookings for revenue and payouts (past, used)
  const pastSpecs: Array<[string, string, number, number, string, PaymentRail]> = [
    ["AP-U1A2B", "rp_serena_std_flex", -30, 2, "SER-87001", "mpesa"], ["AP-U1A3C", "rp_serena_suite", -26, 3, "SER-87044", "card"], ["AP-U1A4D", "rp_serena_std_nr", -19, 2, "SER-87102", "mpesa"],
    ["AP-U2B1E", "rp_zuri_ocean", -22, 5, "ZZ-5510", "card"], ["AP-U2B2F", "rp_zuri_garden", -14, 3, "ZZ-5544", "tigopesa"],
    ["AP-U3C1G", "rp_tour_northern_std", -21, 1, "KE-TOUR-118", "card"], ["AP-U3C2H", "rp_tour_kili_group", -35, 1, "KE-CLIMB-77", "card"],
    ["AP-U4D1J", "rp_melia_std", -9, 1, "GM-76900", "mpesa"], ["AP-U4D2K", "rp_melia_exec", -4, 2, "GM-77080", "bank"],
    ["AP-U5E1L", "rp_xfer_dar_sedan", -3, 1, "AAC-2199", "mpesa"], ["AP-U5E2M", "rp_xfer_znz_van", -8, 1, "ZCH-410", "airtel"],
    ["AP-U6F1N", "rp_kubu_tent", -12, 2, "KK-3301", "card"], ["AP-U6F2P", "rp_hyatt_king", -6, 2, "PH-9021", "card"],
  ];
  const names = ["Grace Mushi", "Tom Baker", "Aisha Omar", "Liam Walsh", "Fatuma Ali", "Noah Klein", "Zainab Juma", "Ethan Cole", "Halima Said", "Marta Rossi", "Yusuf Kombo", "Ines Duarte", "Peter Mkumbo"];
  pastSpecs.forEach(([ref, rp, from, nights, sref, rail], i) => {
    const [fn, ln] = names[i].split(" ");
    seedBooking({ reference: ref, buyerType: "consumer", buyerUserId: "guest", lead: T({ firstName: fn, lastName: ln }), rail, createdDaysAgo: -from + 10, paidAt: (-from + 10) * 24 - 3, items: [{ ratePlanId: rp, from, nights, status: from < -1 ? "used" : "confirmed", supplierReference: sref }] }, out);
  });
  // 12 · upcoming confirmed for suppliers' dashboards
  const upcoming: Array<[string, string, number, number, string, PaymentRail]> = [
    ["AP-N1QW2", "rp_serena_std_flex", 3, 2, "SER-88240", "mpesa"], ["AP-N1QW3", "rp_serena_suite", 1, 1, "SER-88251", "card"], ["AP-N2ER4", "rp_zuri_ocean_nr", 4, 6, "ZZ-5601", "card"],
    ["AP-N3TY5", "rp_kubu_tent", 2, 2, "KK-3388", "mpesa"], ["AP-N4UI6", "rp_melia_std", 0, 1, "GM-77190", "mpesa"], ["AP-N5OP7", "rp_xfer_jro_van", 0, 1, "AAC-2260", "mpesa"],
    ["AP-N6AS8", "rp_tour_balloon", 1, 1, "KK-BAL-12", "card"], ["AP-N7DF9", "rp_xfer_arusha_ser", 0, 1, "AAC-2261", "card"],
  ];
  upcoming.forEach(([ref, rp, from, nights, sref, rail], i) => {
    const [fn, ln] = names[(i + 5) % names.length].split(" ");
    seedBooking({ reference: ref, buyerType: "consumer", buyerUserId: "guest", lead: T({ firstName: fn, lastName: ln }), rail, createdDaysAgo: 6 + i, paidAt: (6 + i) * 24 - 2, items: [{ ratePlanId: rp, from, nights, status: "confirmed", supplierReference: sref }] }, out);
  });
  // 13 · new unconfirmed booking for Serena inbox (within SLA)
  seedBooking({ reference: "AP-S3NEW", buyerType: "consumer", buyerUserId: "guest", lead: T({ title: "Dr", firstName: "Miriam", lastName: "Kessy", phone: "+255784556677", email: "miriam.k@example.com" }), rail: "mpesa", createdDaysAgo: 0, paidAt: 0.4, items: [{ ratePlanId: "rp_serena_std_flex", from: 12, nights: 2, status: "awaiting_supplier", specialRequests: "Vegetarian meals, late arrival ~19:00" }] }, out);
  // 14 · cancelled outside free window, refund pending manager approval
  const b14 = seedBooking({ reference: "AP-R2FND", buyerType: "consumer", buyerUserId: "guest", lead: T({ firstName: "Brian", lastName: "Mwenda", phone: "+255756443322", email: "brian.m@example.com" }), rail: "card", createdDaysAgo: 20, paidAt: 20 * 24 - 1, items: [{ ratePlanId: "rp_ngoro_suite", from: 10, nights: 2, status: "cancelled" }] }, out);
  // 15 · Overseas visitor · northern circuit, draft

  const bookings = byId(out.bookings);
  const items = byId(out.items);

  /* refunds */
  const refunds: Refund[] = [];
  const b9Rej = out.items.find((i) => i.bookingId === b9.id && i.status === "supplier_rejected")!;
  refunds.push({ id: nid("rf"), bookingId: b9.id, itemId: b9Rej.id, paymentId: out.payments.find((p) => p.bookingId === b9.id)?.id, amountMinor: b9Rej.sellPriceMinor, currency: "TZS", reason: "Supplier rejected · automatic full refund", reasonCode: "supplier_rejected", status: "auto_approved", requiredApprover: "none", approvals: [], createdAt: iso(hoursFromNow(-20)), updatedAt: iso(hoursFromNow(-20)) });
  const b14It = out.items.find((i) => i.bookingId === b14.id)!;
  const b14Amt = Math.round(b14It.sellPriceMinor * 0.25);
  refunds.push({ id: nid("rf"), bookingId: b14.id, itemId: b14It.id, paymentId: out.payments.find((p) => p.bookingId === b14.id)?.id, amountMinor: b14Amt, currency: "TZS", reason: "Cancelled 10 days before travel · Strict policy · 25% refund", reasonCode: "policy_partial", status: "pending_approval", requiredApprover: requiredApprover(b14Amt, false), approvals: [], createdAt: iso(hoursFromNow(-30)), updatedAt: iso(hoursFromNow(-30)) });
  refunds.push({ id: nid("rf"), bookingId: out.bookings.find((b) => b.reference === "AP-2NX4C")!.id, itemId: out.items.find((i) => i.bookingId === out.bookings.find((b) => b.reference === "AP-2NX4C")!.id)!.id, amountMinor: out.bookings.find((b) => b.reference === "AP-2NX4C")!.totalMinor, currency: "TZS", reason: "Cancelled within free window", reasonCode: "free_window", status: "processed", requiredApprover: "none", approvals: [], createdAt: iso(daysFromNow(-57)), updatedAt: iso(daysFromNow(-56)) });
  refunds.push({ id: nid("rf"), bookingId: out.bookings.find((b) => b.reference === "AP-U4D1J")!.id, amountMinor: 120_000, currency: "TZS", reason: "Goodwill · room not ready until 17:00, guest complaint", reasonCode: "goodwill", status: "pending_approval", requiredApprover: "manager", approvals: [], createdAt: iso(hoursFromNow(-6)), updatedAt: iso(hoursFromNow(-6)) });
  refunds.push({ id: nid("rf"), bookingId: out.bookings.find((b) => b.reference === "AP-U5E2M")!.id, amountMinor: 45_000, currency: "TZS", reason: "Driver 40 minutes late · partial refund agreed by ops", reasonCode: "goodwill", status: "pending_approval", requiredApprover: "officer", approvals: [], createdAt: iso(hoursFromNow(-2)), updatedAt: iso(hoursFromNow(-2)) });

  /* approvals */
  const approvals: ApprovalRequest[] = [
  ];


  /* payouts */
  const usedSerena = out.items.filter((i) => i.supplierId === "sup_serena" && i.status === "used");
  const sum = (arr: BookingItem[], k: keyof BookingItem) => arr.reduce((a, i) => a + (i[k] as number), 0);
  const payouts: Payout[] = [
    { id: nid("po"), supplierId: "sup_serena", periodLabel: "Jul 2026", periodFrom: ymd(daysFromNow(-48)), periodTo: ymd(daysFromNow(-18)), grossMinor: 4_120_000, commissionMinor: 618_000, netMinor: 3_502_000, currency: "TZS", status: "executed", itemIds: [], approvedBy: "Catherine Mollel", executedAt: iso(daysFromNow(-15)), createdAt: iso(daysFromNow(-17)) },
    { id: nid("po"), supplierId: "sup_serena", periodLabel: "1–15 Aug 2026", periodFrom: ymd(daysFromNow(-17)), periodTo: ymd(daysFromNow(-3)), grossMinor: sum(usedSerena, "sellPriceMinor") - sum(usedSerena, "taxMinor") - sum(usedSerena, "feeMinor"), commissionMinor: sum(usedSerena, "commissionMinor"), netMinor: sum(usedSerena, "netCostMinor"), currency: "TZS", status: "pending_approval", itemIds: usedSerena.map((i) => i.id), createdAt: iso(daysFromNow(-2)) },
    { id: nid("po"), supplierId: "sup_kubu", periodLabel: "1–15 Aug 2026", periodFrom: ymd(daysFromNow(-17)), periodTo: ymd(daysFromNow(-3)), grossMinor: 1_040_000, commissionMinor: 187_200, netMinor: 852_800, currency: "TZS", status: "pending_approval", itemIds: [], createdAt: iso(daysFromNow(-2)) },
    { id: nid("po"), supplierId: "sup_zanzibar", periodLabel: "Jul 2026", periodFrom: ymd(daysFromNow(-48)), periodTo: ymd(daysFromNow(-18)), grossMinor: 8_320_000, commissionMinor: 1_248_000, netMinor: 7_072_000, currency: "TZS", status: "approved", itemIds: [], approvedBy: "Catherine Mollel", createdAt: iso(daysFromNow(-16)) },
    { id: nid("po"), supplierId: "sup_kili_exp", periodLabel: "Jul 2026", periodFrom: ymd(daysFromNow(-48)), periodTo: ymd(daysFromNow(-18)), grossMinor: 23_200_000, commissionMinor: 4_640_000, netMinor: 18_560_000, currency: "TZS", status: "executed", itemIds: [], approvedBy: "Catherine Mollel", executedAt: iso(daysFromNow(-15)), createdAt: iso(daysFromNow(-17)) },
    { id: nid("po"), supplierId: "sup_arusha_cabs", periodLabel: "Week 33", periodFrom: ymd(daysFromNow(-9)), periodTo: ymd(daysFromNow(-3)), grossMinor: 640_000, commissionMinor: 96_000, netMinor: 544_000, currency: "TZS", status: "draft", itemIds: [], createdAt: iso(daysFromNow(-1)) },
  ];

  /* ops tasks */
  const opsTasks: OpsTask[] = [
    { id: nid("ot"), kind: "reconciliation", bookingId: b2.id, bookingReference: b2.reference, title: "Manual M-Pesa reference entered", detail: "Customer reports TZS " + b2.totalMinor.toLocaleString() + " left account, ref RJ7X21LMQ. Verify with provider and match.", status: "open", slaDueAt: iso(hoursFromNow(1)), createdAt: iso(hoursFromNow(-4.9)) },
    { id: nid("ot"), kind: "partial_booking", bookingId: b9.id, bookingReference: b9.reference, itemId: b9Rej.id, title: "Partial booking · lodge rejected, transfer confirmed", detail: "Ngorongoro Farm House rejected (overbooked). Refund auto issued. Offer alternative for 2 nights from " + b9Rej.travelDateFrom + ".", status: "open", slaDueAt: iso(hoursFromNow(4)), assigneeName: "Frank Mushi", createdAt: iso(hoursFromNow(-19)) },
    { id: nid("ot"), kind: "supplier_timeout", bookingId: b10.id, bookingReference: b10.reference, itemId: out.items.find((i) => i.bookingId === b10.id)!.id, title: "Kubu Kubu · no response in 2h SLA", detail: "Paid 3h24m ago. Chase supplier or force confirm.", status: "open", slaDueAt: iso(hoursFromNow(-1.4)), createdAt: iso(hoursFromNow(-1.4)) },
    { id: nid("ot"), kind: "orphaned_hold", title: "3 holds past expiry not released", detail: "Sweeper found holds older than TTL on prd_zuri. Release and reindex.", status: "in_progress", slaDueAt: iso(hoursFromNow(0.5)), assigneeName: "Frank Mushi", createdAt: iso(hoursFromNow(-0.7)) },
    { id: nid("ot"), kind: "integration_failure", title: "Flight aggregator returning 502", detail: "Duffel connector down for 18 minutes. Flights search degraded to fixtures.", status: "open", slaDueAt: iso(hoursFromNow(0.2)), createdAt: iso(hoursFromNow(-0.3)) },
    { id: nid("ot"), kind: "amendment", bookingId: b1.id, bookingReference: b1.reference, title: "Amendment · add 1 night at Serena", detail: "Amina Hassan requests +1 night, same room. Fare difference computed.", status: "open", slaDueAt: iso(hoursFromNow(6)), createdAt: iso(hoursFromNow(-2)) },
    { id: nid("ot"), kind: "supplier_rejected", bookingId: b9.id, bookingReference: b9.reference, title: "Call customer with alternatives", detail: "Joseph Mally · offer Ngorongoro Farm House family cottage or Kilimamoja.", status: "resolved", slaDueAt: iso(hoursFromNow(-10)), assigneeName: "Frank Mushi", createdAt: iso(hoursFromNow(-19)), resolvedAt: iso(hoursFromNow(-15)) },
  ];

  /* amendments */
  const b1It = out.items.find((i) => i.bookingId === b1.id)!;
  const amendments: AmendmentRequest[] = [
    { id: nid("am"), bookingId: b1.id, bookingReference: b1.reference, itemId: b1It.id, kind: "date_change", detail: "Extend by one night · check out " + ymd(daysFromNow(22)), fareDifferenceMinor: 466_000, currency: "TZS", status: "requested", requestedByName: "Amina Hassan", createdAt: iso(hoursFromNow(-2)) },
    { id: nid("am"), bookingId: b7.id, bookingReference: b7.reference, itemId: out.items.find((i) => i.bookingId === b7.id)!.id, kind: "pax_change", detail: "Passenger name correction · Elena Thompson (was Elana)", fareDifferenceMinor: 0, currency: "TZS", status: "approved", requestedByName: "Neema Kileo", createdAt: iso(daysFromNow(-3)), decidedAt: iso(daysFromNow(-3)) },
  ];

  /* notifications */
  const notifications: Notification[] = [
    { id: nid("nt"), userId: amina.id, audience: "customer", channel: "sms", title: "Payment received · AP-Q4WZ8", body: "We're confirming with Kubu Kubu Tented Camp, usually under 2 hours.", bookingReference: "AP-Q4WZ8", read: false, createdAt: iso(hoursFromNow(-0.6)) },
    { id: nid("nt"), userId: amina.id, audience: "customer", channel: "whatsapp", title: "Serena confirmed · AP-7K2M9", body: "Your voucher is ready in My Trips.", bookingReference: "AP-7K2M9", read: true, createdAt: iso(daysFromNow(-12)) },
    { id: nid("nt"), userId: "usr_supplier_admin", audience: "supplier", channel: "whatsapp", title: "New booking AP-S3NEW", body: "Standard Rondavel · 2 nights · please confirm within 2 hours.", bookingReference: "AP-S3NEW", read: false, createdAt: iso(hoursFromNow(-0.4)) },
    { id: nid("nt"), userId: "usr_supplier_staff", audience: "supplier", channel: "whatsapp", title: "SLA breach AP-K9SLA", body: "Booking awaiting your confirmation for over 2 hours.", bookingReference: "AP-K9SLA", read: false, createdAt: iso(hoursFromNow(-1.4)) },
  ];

  /* audit */
  const audit: AuditLog[] = [
    { id: nid("au"), actorUserId: "usr_supply", actorName: "Ibrahim Nassor", roleUsed: "supply_manager", scope: "platform", action: "PRODUCT_APPROVED", resourceType: "product", resourceId: "prd_tour_balloon", before: { status: "pending_review" }, after: { status: "live" }, ip: "41.59.12.10", requestId: "01J9X2M4K8N3P7Q", createdAt: iso(daysFromNow(-3)) },
    { id: nid("au"), actorUserId: "usr_finance_manager", actorName: "Catherine Mollel", roleUsed: "finance_manager", scope: "platform", action: "PAYOUT_APPROVED", resourceType: "payout", resourceId: payouts[3].id, before: { status: "pending_approval" }, after: { status: "approved" }, ip: "41.59.12.11", requestId: "01J9X2M4K8N3P7R", createdAt: iso(daysFromNow(-2)) },
    { id: nid("au"), actorUserId: "usr_ops_manager", actorName: "Lightness Mbwana", roleUsed: "ops_manager", scope: "platform", action: "BOOKING_FORCE_CONFIRMED", resourceType: "booking_item", resourceId: out.items.find((i) => i.bookingId === out.bookings.find((b) => b.reference === "AP-N3TY5")!.id)!.id, before: { status: "awaiting_supplier" }, after: { status: "confirmed" }, ip: "41.59.12.12", requestId: "01J9X2M4K8N3P7S", createdAt: iso(daysFromNow(-1)) },
    { id: nid("au"), actorUserId: "usr_support", actorName: "Zawadi Komba", roleUsed: "support", scope: "platform", action: "IMPERSONATION_STARTED", resourceType: "user", resourceId: amina.id, ip: "41.59.12.13", requestId: "01J9X2M4K8N3P7T", createdAt: iso(hoursFromNow(-3)) },
    { id: nid("au"), actorUserId: "usr_finance_officer", actorName: "Peter Mwakalinga", roleUsed: "finance_officer", scope: "platform", action: "PERMISSION_DENIED", resourceType: "REFUND:issue_high", resourceId: refunds[1].id, ip: "41.59.12.15", requestId: "01J9X2M4K8N3P7V", createdAt: iso(hoursFromNow(-5)) },
    { id: nid("au"), actorUserId: "usr_super_admin", actorName: "Ignas Bangi", roleUsed: "super_admin", scope: "platform", action: "SETTINGS_CHANGED", resourceType: "settings", resourceId: "hold_ttl", before: { minutes: 10 }, after: { minutes: 15 }, ip: "41.59.12.16", requestId: "01J9X2M4K8N3P7W", createdAt: iso(daysFromNow(-20)) },
  ];

  /* inventory overrides */
  const inventory: Record<string, ReturnType<typeof mkUnit>> = {};
  function mkUnit(productId: string, date: string, capacityTotal: number, sold: number, stopSell = false) {
    return { id: `${productId}:${date}`, productId, date, capacityTotal, capacityHeld: 0, capacitySold: sold, stopSell };
  }
  for (let d = 0; d < 3; d++) { const dt = ymd(daysFromNow(25 + d)); inventory[`prd_serena_lodge:${dt}`] = mkUnit("prd_serena_lodge", dt, 12, 12); }
  for (let d = 0; d < 2; d++) { const dt = ymd(daysFromNow(30 + d)); inventory[`prd_zuri:${dt}`] = mkUnit("prd_zuri", dt, 10, 0, true); }
  { const dt = ymd(daysFromNow(18)); inventory[`prd_serena_lodge:${dt}`] = mkUnit("prd_serena_lodge", dt, 12, 11); }

  const orgs = organisations;

  return {
    version: 1,
    seededAt: iso(new Date()),
    session: { userId: null, roleId: "guest", currency: "TZS" },
    users: byId(users),
    organisations: byId(orgs),
    products: byId(products),
    ratePlans: byId(ratePlans),
    inventory,
    bookings,
    items,
    timeline: out.timeline,
    payments: byId(out.payments),
    refunds: byId(refunds),
    ledger: out.ledger,
    audit,
    approvals: byId(approvals),
    tickets: byId(tickets),
    payouts: byId(payouts),
    reviews: byId(reviews),
    promos: byId(promos),
    content: byId(contentPages),
    notifications,
    opsTasks: byId(opsTasks),
    amendments: byId(amendments),
    flags: byKey(featureFlags, (f) => f.key),
    integrations: byId(integrations),
    templates: byId(notificationTemplates),
    wishlists: { [amina.id]: [{ productId: "prd_zuri", addedAt: iso(daysFromNow(-5)), priceAtSaveMinor: 880_000 }, { productId: "prd_tour_balloon", addedAt: iso(daysFromNow(-2)), priceAtSaveMinor: 1_694_000 }] },
    carts: {},
    simulator: { paymentMode: "success", supplierAutoConfirm: false },
    settings: { holdTtlMinutes: 15, approvalHoldHours: 4, supplierSlaHours: 2, vatPct: 18, serviceFeePct: 3, fxUsdTzs: 2600 },
    counters: { booking: 100, quote: 10, ticket: 10430, payout: 10, misc: 1 },
  };
}
export type { RoleId, User };
