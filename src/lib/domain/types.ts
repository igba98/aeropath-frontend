/**
 * Aeropath · core domain types.
 * Mirrors the contracts in travel-platform-technical-spec.md §15–§19.
 * Money is ALWAYS integer minor units (TZS has 0 minor digits, USD has 2).
 */

export type Currency = "TZS" | "USD";
export type Vertical = "stay" | "flight" | "tour" | "transfer";
/** Aeropath sells to travellers directly; it is itself the agent earning commission. */
export type BuyerType = "consumer";
export type CreatedVia = "web" | "partner" | "admin" | "mobile" | "api";

export type ProductStatus = "draft" | "pending_review" | "changes_requested" | "live" | "paused" | "archived" | "rejected";

export type ItemStatus =
  | "draft"
  | "held"
  | "expired"
  | "pending_payment"
  | "payment_failed"
  | "paid"
  | "awaiting_supplier"
  | "confirmed"
  | "supplier_rejected"
  | "amended"
  | "used"
  | "cancelled"
  | "refunded"
  | "pending_approval"
  | "approval_rejected";

export type BookingStatus =
  | "draft"
  | "pending_approval"
  | "processing"
  | "confirmed"
  | "partial"
  | "cancelled"
  | "refunded"
  | "expired";

/** Aeropath sells to travellers directly, so every rail here is one a person can pay on. */
export type PaymentRail = "mpesa" | "tigopesa" | "airtel" | "halopesa" | "card" | "bank";
export type PaymentStatus = "pending" | "succeeded" | "failed" | "reconciliation_pending" | "refunded" | "cancelled";

/* ── Catalogue ─────────────────────────────────────────────── */

export interface Media {
  url: string;
  alt: string;
  isCover?: boolean;
  /** Tailwind gradient class used by the prototype in lieu of real photos */
  tone?: string;
}

export interface CancellationPolicy {
  id: string;
  name: string;
  /** Plain language summary shown to the customer */
  summary: string;
  /** Ordered tiers: refund percentage if cancelled at least `daysBefore` days before travel */
  tiers: Array<{ daysBefore: number; refundPct: number }>;
}

export interface Product {
  id: string;
  supplierId: string;
  vertical: Vertical;
  status: ProductStatus;
  title: string;
  slug: string;
  description: string;
  media: Media[];
  location: { lat: number; lng: number; countryCode: string; region: string; city: string };
  starRating?: number;
  reviewScore?: number;
  reviewCount?: number;
  amenities: string[];
  tags: string[];
  /** Vertical specific attributes — schemaless at storage, validated per vertical */
  attributes: Record<string, unknown>;
  cancellationPolicyId: string;
  childPolicy?: string;
  enteredBy: "supplier" | "backoffice";
  freeCancellation: boolean;
  instantConfirm: boolean;
  /** indicative price for search cards, all-in, minor units */
  priceFromMinor: number;
  currency: Currency;
  completeness: number; // 0..10
  reviewNotes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RatePlan {
  id: string;
  productId: string;
  name: string;
  currency: Currency;
  /** base price per unit (room/night, seat, vehicle, person) */
  baseMinor: number;
  basis: "per_unit_night" | "per_person" | "per_vehicle" | "per_passenger";
  inclusions: string[];
  cancellationPolicyId: string;
  /** Percentage of base that the platform takes as commission (snapshotted onto items) */
  commissionPct: number;
  /** Optional occupancy uplift for stays: extra per additional adult */
  extraAdultMinor?: number;
  refundable: boolean;
  minStay?: number;
  label?: string; // e.g. "Best flexible", "Non refundable"
}

export interface InventoryUnit {
  id: string;
  productId: string;
  ratePlanId?: string;
  date: string; // ISO date yyyy-mm-dd
  capacityTotal: number;
  capacityHeld: number;
  capacitySold: number;
  stopSell: boolean;
  minStay?: number;
}

/* ── Actors ────────────────────────────────────────────────── */

export type OrgType = "agent" | "corporate" | "supplier";

export interface TravelPolicy {
  stayCapPerNightMinor: number;
  flightCabin: "economy" | "premium" | "business";
  advancePurchaseDays: number;
  preferredSupplierIds: string[];
  requireApprovalAboveMinor: number;
}

export interface Organisation {
  id: string;
  type: OrgType;
  name: string;
  countryCode: string;
  city: string;
  status: "active" | "pending" | "suspended";
  /* agent */
  creditLimitMinor?: number;
  creditUsedMinor?: number;
  defaultMarkupPct?: number;
  markupMinPct?: number;
  markupMaxPct?: number;
  brandColor?: string;
  /* corporate */
  travelPolicy?: TravelPolicy;
  costCentres?: Array<{ code: string; name: string; budgetMinor: number; ownerName: string }>;
  approverUserIds?: string[];
  /* supplier */
  tin?: string;
  licenceNo?: string;
  commissionPct?: number;
  payoutTermsDays?: number;
  bankName?: string;
  bankAccountMasked?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  performance?: { confirmationRatePct: number; avgConfirmMinutes: number; rejectionRatePct: number; reviewScore: number; cancellationRatePct: number };
  onboardingStep?: number;
  createdAt: string;
}

export type RoleId =
  | "guest"
  | "traveller"
  | "supplier_staff"
  | "supplier_admin"
  | "support"
  | "ops_officer"
  | "ops_manager"
  | "supply_manager"
  | "content_editor"
  | "finance_officer"
  | "finance_manager"
  | "auditor"
  | "platform_admin"
  | "super_admin";

export type Scope =
  | { kind: "platform" }
  | { kind: "organisation"; id: string }
  | { kind: "supplier"; id: string }
  | { kind: "region"; id: string };

export interface RoleGrant {
  roleId: RoleId;
  scope: Scope;
  expiresAt?: string | null;
}

export interface SavedTraveller {
  id: string;
  title: "Mr" | "Mrs" | "Ms" | "Dr";
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  nationality: string;
  passportNumber?: string;
  passportExpiry?: string;
  phone: string;
  email: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  locale: string;
  avatarTone: string;
  grants: RoleGrant[];
  organisationId?: string;
  savedTravellers: SavedTraveller[];
  status: "active" | "invited" | "suspended";
  lastActiveAt: string;
  createdAt: string;
  /** free text for demo persona picker */
  personaHint?: string;
}

/* ── Booking ───────────────────────────────────────────────── */

export interface Pax {
  adults: number;
  children: number;
  infants: number;
}

export interface PriceLine {
  label: string;
  amountMinor: number;
  kind: "base" | "tax" | "fee" | "discount" | "markup" | "extra";
}

export interface PriceBreakdownData {
  currency: Currency;
  lines: PriceLine[];
  baseMinor: number;
  taxMinor: number;
  feeMinor: number;
  discountMinor: number;
  markupMinor: number;
  totalMinor: number;
  /** agent only */
  netMinor?: number;
  commissionMinor?: number;
}

export interface CancellationPolicySnapshot {
  policyId: string;
  name: string;
  summary: string;
  tiers: Array<{ daysBefore: number; refundPct: number }>;
  freeCancellationUntil?: string; // ISO datetime
}

export interface BookingItem {
  id: string;
  bookingId: string;
  vertical: Vertical;
  productId: string;
  ratePlanId: string;
  supplierId: string;
  status: ItemStatus;
  travelDateFrom: string;
  travelDateTo: string;
  quantity: number;
  pax: Pax;
  netCostMinor: number;
  sellPriceMinor: number;
  markupMinor: number;
  commissionMinor: number;
  taxMinor: number;
  feeMinor: number;
  supplierReference?: string;
  cancellationPolicySnapshot: CancellationPolicySnapshot;
  productSnapshot: { title: string; city: string; region: string; ratePlanName: string; tone?: string; summary?: string };
  holdExpiresAt?: string;
  slaDeadlineAt?: string;
  rejectionReason?: string;
  specialRequests?: string;
  policyCheck?: { inPolicy: boolean; reason?: string; capMinor?: number };
  /** Flight ancillaries, priced separately from the fare (Amadeus sells these as their own offers). */
  seats?: SeatAssignment[];
  bags?: BagSelection[];
  /** Seats + bags, kept apart from the fare so re-pricing one never corrupts the other. */
  ancillaryMinor?: number;
  createdAt: string;
  updatedAt: string;
}

/* ── Flight ancillaries ──────────────────────────────────────────────────────
   Modelled the way a GDS sells them: the fare buys the flight, and seats and
   bags are separate priced offers attached per passenger per leg. */

export type SeatClass = "extra_legroom" | "standard" | "occupied";

export interface SeatAssignment {
  /** Index into the booking's travellers array. */
  travellerIndex: number;
  /** "out" for the outbound leg, "in" for the return. */
  leg: "out" | "in";
  /** e.g. "31A" */
  seat: string;
  priceMinor: number;
}

export type BagKind = "cabin" | "checked";

export interface BagOffer {
  id: string;
  kind: BagKind;
  label: string;
  weightKg: number;
  /** e.g. "40x20x25 cm" */
  dimensions: string;
  priceMinor: number;
  /** At most one free option per kind, already included in the fare. */
  includedInFare?: boolean;
}

export interface BagSelection {
  travellerIndex: number;
  offerId: string;
  quantity: number;
}

/** One row of the cabin, as the seat map renders it. */
export interface SeatRow {
  row: number;
  /** null marks the aisle gap. */
  seats: Array<{ letter: string; klass: SeatClass; priceMinor: number } | null>;
  exit?: boolean;
}

export interface Extra {
  id: string;
  label: string;
  description: string;
  amountMinor: number;
  perPerson: boolean;
  defaultChecked: boolean;
  category: "insurance" | "park_fee" | "meal" | "assistance" | "other";
}

export interface Booking {
  id: string;
  reference: string;
  buyerType: BuyerType;
  buyerUserId: string;
  organisationId?: string;
  clientOrgName?: string; // agent bookings: the client attributed
  status: BookingStatus;
  currency: Currency;
  subtotalMinor: number;
  taxMinor: number;
  feeMinor: number;
  discountMinor: number;
  markupMinor: number;
  totalMinor: number;
  paymentStatus: PaymentStatus | "unpaid";
  paymentRail?: PaymentRail;
  leadTraveller?: SavedTraveller;
  travellers: SavedTraveller[];
  extras: Extra[];
  costCentre?: string;
  projectCode?: string;
  justification?: string;
  approvalId?: string;
  promoCode?: string;
  markupPct?: number;
  createdBy: string;
  createdVia: CreatedVia;
  internalNotes: Array<{ id: string; authorName: string; text: string; at: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface TimelineEvent {
  id: string;
  bookingId: string;
  itemId?: string;
  at: string;
  event: string;
  from?: ItemStatus | BookingStatus;
  to?: ItemStatus | BookingStatus;
  actorName: string;
  actorRole?: RoleId | "system";
  /** which roles can see this event */
  visibility: Array<"customer" | "supplier" | "internal">;
  note?: string;
}

export interface Payment {
  id: string;
  bookingId: string;
  rail: PaymentRail;
  provider: string;
  amountMinor: number;
  currency: Currency;
  providerReference?: string;
  customerReference?: string;
  idempotencyKey: string;
  status: PaymentStatus;
  phone?: string;
  callbackReceivedAt?: string;
  reconciledAt?: string;
  reconciledBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Refund {
  id: string;
  bookingId: string;
  itemId?: string;
  paymentId?: string;
  amountMinor: number;
  currency: Currency;
  reason: string;
  reasonCode: "free_window" | "supplier_rejected" | "policy_partial" | "goodwill" | "duplicate" | "other";
  status: "auto_approved" | "pending_approval" | "approved" | "rejected" | "processed";
  requiredApprover: "none" | "officer" | "manager" | "dual";
  approvals: Array<{ userId: string; name: string; role: RoleId; at: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface LedgerEntry {
  id: string;
  entryGroupId: string;
  bookingId?: string;
  payoutId?: string;
  account: string;
  debitMinor: number;
  creditMinor: number;
  currency: Currency;
  description: string;
  entryDate: string;
}

export interface AuditLog {
  id: string;
  actorUserId: string;
  actorName: string;
  roleUsed: RoleId | "system";
  scope: string;
  action: string;
  resourceType: string;
  resourceId: string;
  before?: unknown;
  after?: unknown;
  ip: string;
  requestId: string;
  createdAt: string;
}

/* ── Overlays and consoles ─────────────────────────────────── */


export interface ApprovalRequest {
  id: string;
  bookingId: string;
  organisationId: string;
  requesterUserId: string;
  requesterName: string;
  approverUserId: string;
  approverName: string;
  travellerName: string;
  justification: string;
  policyDelta: { capMinor: number; actualMinor: number; reason: string };
  alternatives: Array<{ productId: string; title: string; priceMinor: number }>;
  status: "pending" | "approved" | "rejected" | "approved_with_note";
  note?: string;
  decidedAt?: string;
  createdAt: string;
}

export interface Ticket {
  id: string;
  reference: string;
  bookingReference?: string;
  customerName: string;
  customerPhone: string;
  channel: "whatsapp" | "phone" | "email" | "in_app";
  subject: string;
  status: "open" | "pending" | "resolved";
  priority: "low" | "normal" | "high";
  slaDueAt: string;
  assigneeName?: string;
  messages: Array<{ id: string; from: "customer" | "agent"; text: string; at: string }>;
  createdAt: string;
}

export interface Payout {
  id: string;
  supplierId: string;
  periodLabel: string;
  periodFrom: string;
  periodTo: string;
  grossMinor: number;
  commissionMinor: number;
  netMinor: number;
  currency: Currency;
  status: "draft" | "pending_approval" | "approved" | "executed" | "failed";
  itemIds: string[];
  approvedBy?: string;
  executedAt?: string;
  createdAt: string;
}

export interface Review {
  id: string;
  productId: string;
  supplierId: string;
  authorName: string;
  rating: number;
  title: string;
  body: string;
  status: "published" | "pending" | "flagged";
  response?: { text: string; at: string };
  createdAt: string;
}

export interface PromoCode {
  id: string;
  code: string;
  description: string;
  discountType: "pct" | "fixed";
  discountValue: number;
  verticals: Vertical[];
  budgetMinor: number;
  usedMinor: number;
  usageLimit: number;
  usedCount: number;
  validFrom: string;
  validTo: string;
  status: "active" | "scheduled" | "expired" | "paused";
}

export interface ContentPage {
  id: string;
  kind: "destination" | "collection" | "landing";
  slug: string;
  title: string;
  subtitle: string;
  heroTone: string;
  status: "draft" | "published";
  blocks: Array<{ id: string; type: "hero" | "rail" | "editorial" | "faq" | "cta"; title?: string; body?: string; productIds?: string[] }>;
  seo: { title: string; description: string };
  updatedAt: string;
}

export interface Notification {
  id: string;
  userId?: string;
  audience: "customer" | "supplier" | "internal" | "approver";
  channel: "sms" | "email" | "whatsapp" | "in_app";
  title: string;
  body: string;
  bookingReference?: string;
  read: boolean;
  createdAt: string;
}

export interface OpsTask {
  id: string;
  kind: "partial_booking" | "supplier_timeout" | "reconciliation" | "orphaned_hold" | "integration_failure" | "amendment" | "supplier_rejected" | "payment_failed";
  bookingId?: string;
  bookingReference?: string;
  itemId?: string;
  title: string;
  detail: string;
  status: "open" | "in_progress" | "resolved";
  slaDueAt: string;
  assigneeName?: string;
  createdAt: string;
  resolvedAt?: string;
}

export interface AmendmentRequest {
  id: string;
  bookingId: string;
  bookingReference: string;
  itemId: string;
  kind: "date_change" | "pax_change" | "room_change";
  detail: string;
  fareDifferenceMinor: number;
  currency: Currency;
  status: "requested" | "approved" | "declined";
  requestedByName: string;
  createdAt: string;
  decidedAt?: string;
}

export interface FeatureFlag {
  key: string;
  description: string;
  kind: "release" | "experiment" | "permission" | "kill_switch";
  enabled: boolean;
  expiresAt?: string;
}

export interface Integration {
  id: string;
  name: string;
  kind: "payment" | "supplier" | "messaging" | "search" | "storage";
  status: "healthy" | "degraded" | "down";
  lastCheckAt: string;
  successRatePct: number;
  keyMasked: string;
}

export interface NotificationTemplate {
  id: string;
  event: string;
  channel: "sms" | "email" | "whatsapp";
  locale: "en" | "sw";
  subject?: string;
  body: string;
}

export interface WishlistItem {
  productId: string;
  addedAt: string;
  priceAtSaveMinor: number;
}
