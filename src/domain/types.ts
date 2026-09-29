/**
 * Aeropath back office — domain types.
 * Shaped like database tables (spec §3.3, §6). Money is always integer minor units.
 */

export type ID = string; // prefixed nanoid, e.g. "fil_8kJ2..."
export type ISODate = string; // "2026-10-12"
export type ISODateTime = string; // UTC "2026-09-28T09:12:00.000Z"
export type LocalDateTime = string; // airport-local, no zone: "2026-10-12T16:50"
export type Currency = "TZS" | "USD";
export interface Money {
  amountMinor: number;
  currency: Currency;
} // integers only; exponent 2 for both

export type Role = "agent" | "accountant" | "manager";

export interface User {
  id: ID;
  name: string;
  initials: string;
  email: string;
  phone?: string;
  role: Role;
  active: boolean;
  createdAt: ISODateTime;
}

export type ClientSource = "walk_in" | "phone" | "whatsapp" | "email" | "referral";

export type OrgType = "company" | "government" | "ngo" | "embassy" | "education" | "other";

export interface ClientContact {
  id: ID;
  name: string;
  role?: string; // "Travel coordinator", "Finance manager"
  phone?: string; // E.164
  email?: string;
  primary?: boolean;
  /** May request bookings on the organisation's account. */
  canBook?: boolean;
}

export interface TravelPolicy {
  cabin: "economy" | "premium_economy" | "business";
  /** Bookings wait for the organisation's approver before ticketing. */
  approvalRequired: boolean;
  approver?: string;
  notes?: string;
}

export interface Client {
  id: ID;
  type: "individual" | "corporate";
  name: string; // person or company name
  phone: string; // E.164, normalised
  email?: string;
  address?: string;
  tin?: string;
  vrn?: string; // corporates
  contactPerson?: string; // corporates
  creditLimit?: Money; // corporates, Manager only
  paymentTermsDays?: number; // corporates, e.g. 30
  defaultCurrency: Currency;
  source?: ClientSource;
  notes?: string;
  tags: string[];
  createdAt: ISODateTime;
  createdBy: ID;
  archived: boolean;
  // ── Organisations (type "corporate"): all optional so older data stays valid ──
  orgType?: OrgType;
  /** Industry or sector, e.g. "Mining", "Health", "Government". */
  sector?: string;
  /** BRELA or other registration number. */
  registrationNumber?: string;
  website?: string;
  /** Where invoices and statements go, when not the main email. */
  billingEmail?: string;
  postalAddress?: string; // "P.O. Box 1234"
  city?: string;
  region?: string;
  country?: string; // ISO-3166 alpha-2
  /** People at the organisation: bookers, approvers, finance. */
  contacts?: ClientContact[];
  /** Departments or cost centres bookings can be charged to. */
  departments?: string[];
  travelPolicy?: TravelPolicy;
  /** Every booking needs the client's purchase order or reference number. */
  poRequired?: boolean;
  // ── Individuals ──
  dateOfBirth?: ISODate;
  gender?: "M" | "F";
  nationality?: string; // ISO-3166 alpha-2
  idType?: "nida" | "passport" | "driving_licence" | "voter_id";
  idNumber?: string;
  occupation?: string;
  employer?: string;
  emergencyContact?: { name: string; phone: string; relation?: string };
  preferences?: { seat?: "window" | "aisle" | "any"; meal?: string; notes?: string };
}

export type PaxType = "ADT" | "CHD" | "INF";
export type Title = "MR" | "MRS" | "MS" | "MSTR" | "MISS";

export interface Traveller {
  id: ID;
  clientId: ID;
  title: Title;
  givenName: string;
  surname: string; // stored UPPERCASE as in passport
  paxType: PaxType;
  dateOfBirth?: ISODate;
  gender?: "M" | "F";
  nationality?: string; // ISO-3166 alpha-2
  passportNumber?: string;
  passportExpiry?: ISODate;
  passportCountry?: string;
  frequentFlyer: { airline: string; number: string }[];
  phone?: string;
  email?: string;
}

export type SupplierKind =
  | "air_settlement" // BSP Tanzania or the consolidator: where ticket money goes
  | "hotel"
  | "car_rental"
  | "transfer"
  | "tour"
  | "visa"
  | "insurance"
  | "other";

export interface Supplier {
  id: ID;
  name: string;
  kind: SupplierKind;
  currency: Currency;
  contactName?: string;
  phone?: string;
  email?: string;
  paymentTermsDays: number;
  notes?: string;
  active: boolean;
}

export interface MoneyAccount {
  id: ID;
  name: string; // "CRDB USD", "M-Pesa Till 123456", "Cash box"
  kind: "cash" | "bank" | "mobile_money" | "card";
  currency: Currency;
  openingBalance: Money;
  active: boolean;
}

export type FileSource = "walk_in" | "phone" | "whatsapp" | "email" | "corporate";

export interface BookingFile {
  id: ID;
  number: string; // AP-2026-000123
  clientId: ID;
  title: string; // "Dar → Dubai · Mwakalinga family"
  ownerId: ID; // agent responsible
  currency: Currency; // invoicing currency of the file
  source: FileSource;
  travellerIds: ID[];
  /** Organisation bookings: the client's purchase order or reference number. */
  reference?: string;
  /** Organisation bookings: department or cost centre charged. */
  costCentre?: string;
  notes?: string;
  tags: string[];
  cancelledAt?: ISODateTime;
  createdAt: ISODateTime;
  createdBy: ID;
  updatedAt: ISODateTime;
  // status, totals and travel dates are DERIVED (selectors), never stored
}

// ───────────────────────────── Service lines ─────────────────────────────

export type LineType = "flight" | "hotel" | "car" | "transfer" | "tour" | "visa" | "insurance" | "service_fee" | "other";

export type LineStatus =
  | "quoted"
  | "booked"
  | "issued"
  | "completed"
  | "cancelled"
  | "voided"
  | "refund_pending"
  | "refunded"
  | "exchanged";

export interface Pricing {
  currency: Currency;
  cost: Money; // net payable to the supplier (for flights: totalFare − commission)
  markup: Money; // agency markup included in the selling price
  serviceFee: Money; // visible agency service fee
  vat: Money; // computed per settings.vatBase (§8.2)
  sell: Money; // cost + markup + serviceFee + vat (computed, never typed)
  /** Rate used to convert this line into its file's currency, captured when priced (only when currencies differ). File-currency units per 1 line-currency unit. */
  fxToFile?: number;
  overrideBelowCost?: { by: ID; at: ISODateTime; reason: string };
}

export interface ExternalRef {
  provider: "amadeus";
  officeId?: string;
  recordLocator?: string;
  externalIds: Record<string, string>; // e.g. { tst: "1", queue: "50C0" }
  rawPayload?: string; // original PNR text or JSON, kept for debugging
  lastSyncedAt?: ISODateTime;
  syncStatus?: "ok" | "drift" | "error";
}

export interface StatusHistoryEntry {
  from: LineStatus | null;
  to: LineStatus;
  at: ISODateTime;
  by: ID;
  note?: string;
}

interface LineBase {
  id: ID;
  fileId: ID;
  type: LineType;
  status: LineStatus;
  supplierId: ID;
  travellerIds: ID[];
  description: string; // one-line human summary, auto-generated
  pricing: Pricing;
  source: "manual" | "amadeus";
  external?: ExternalRef;
  supplierPaidMinor: number; // derived cache, updated by supplier payments
  notes?: string;
  createdAt: ISODateTime;
  createdBy: ID;
  updatedAt: ISODateTime;
  statusHistory: StatusHistoryEntry[];
}

export type SegmentStatus = "HK" | "KK" | "TK" | "HL" | "UN" | "UC" | "NO" | "HX" | "XX";
export type Cabin = "economy" | "premium_economy" | "business" | "first";

export interface FlightSegment {
  segmentNo: number; // element number as in the PNR
  carrier: string; // IATA 2-char, marketing
  operatingCarrier?: string;
  flightNumber: string; // "726"
  bookingClass: string; // RBD, e.g. "Y", "K"
  cabin: Cabin;
  origin: string;
  destination: string; // IATA 3-letter
  departureLocal: LocalDateTime;
  arrivalLocal: LocalDateTime;
  arrivalDayOffset: 0 | 1 | 2;
  statusCode: SegmentStatus;
  seats: number;
  equipment?: string;
}

export interface FlightPassenger {
  travellerId: ID;
  nameInPnr: string; // "MWAKALINGA/PETER MR"
  paxType: PaxType;
  pnrPaxNo?: number; // P1, P2…
  ticketNumber?: string; // "176-2401234567"
  emdNumbers: string[];
  fareAmount?: Money; // per-passenger total fare, if known
}

export interface FlightDetails {
  recordLocator: string; // 6 chars, e.g. "Z8K4QM"
  airlineLocator?: string;
  officeId?: string; // e.g. "DARTZ2100"
  validatingCarrier: string; // plating carrier
  tripType: "one_way" | "return" | "multi_city";
  segments: FlightSegment[];
  passengers: FlightPassenger[];
  fare: {
    currency: Currency;
    baseFare: Money;
    taxes: { code: string; amount: Money }[];
    totalFare: Money; // base + taxes (all passengers)
    commissionPct: number; // usually 0; fraction e.g. 0.05 = 5%
    fareBasis?: string;
  };
  baggage?: string; // "2PC", "30K"
  ticketingTimeLimit?: ISODateTime; // from TK TL; drives the attention list
  issuedAt?: ISODateTime;
  voidDeadline?: ISODateTime; // computed at issue from settings.voidWindow
  exchangedFromLineId?: ID;
  exchangedToLineId?: ID;
}

export type Board = "RO" | "BB" | "HB" | "FB" | "AI";

export interface HotelDetails {
  hotelName: string;
  city: string;
  checkIn: ISODate;
  checkOut: ISODate;
  rooms: { roomType: string; board: Board; adults: number; children: number }[];
  confirmationNumber?: string;
  cancellationPolicy?: string;
  freeCancelUntil?: ISODateTime; // snapshot at booking
}
export interface CarDetails {
  company: string;
  carClass: string;
  withDriver: boolean;
  pickupLocation: string;
  pickupAt: ISODateTime;
  dropoffLocation: string;
  dropoffAt: ISODateTime;
  confirmationNumber?: string;
}
export interface TransferDetails {
  from: string;
  to: string;
  at: ISODateTime;
  vehicle: string;
  pax: number;
  flightRef?: string;
  confirmationNumber?: string;
}
export interface TourDetails {
  name: string;
  startDate: ISODate;
  endDate: ISODate;
  pax: number;
  inclusions?: string;
  confirmationNumber?: string;
}
export interface VisaDetails {
  country: string;
  visaType: string;
  submittedAt?: ISODate;
  decision: "pending" | "approved" | "rejected";
  reference?: string;
}
export interface InsuranceDetails {
  provider: string;
  plan: string;
  coverStart: ISODate;
  coverEnd: ISODate;
  policyNumber?: string;
}

export type FlightLine = LineBase & { type: "flight"; details: FlightDetails };
export type HotelLine = LineBase & { type: "hotel"; details: HotelDetails };
export type CarLine = LineBase & { type: "car"; details: CarDetails };
export type TransferLine = LineBase & { type: "transfer"; details: TransferDetails };
export type TourLine = LineBase & { type: "tour"; details: TourDetails };
export type VisaLine = LineBase & { type: "visa"; details: VisaDetails };
export type InsuranceLine = LineBase & { type: "insurance"; details: InsuranceDetails };
export type ServiceFeeLine = LineBase & { type: "service_fee"; details: { reason: string } };
export type OtherLine = LineBase & { type: "other"; details: { label: string } };

export type ServiceLine =
  | FlightLine
  | HotelLine
  | CarLine
  | TransferLine
  | TourLine
  | VisaLine
  | InsuranceLine
  | ServiceFeeLine
  | OtherLine;

export type LineDetailsByType = {
  flight: FlightDetails;
  hotel: HotelDetails;
  car: CarDetails;
  transfer: TransferDetails;
  tour: TourDetails;
  visa: VisaDetails;
  insurance: InsuranceDetails;
  service_fee: { reason: string };
  other: { label: string };
};

// ─────────────────────── Money movements and documents ───────────────────────

export type PaymentMethod = "cash" | "bank_transfer" | "mpesa" | "airtel_money" | "mixx" | "halopesa" | "card" | "cheque";

export interface PaymentAllocation {
  fileId: ID;
  amount: Money; // in the file's currency
}

export interface Payment {
  id: ID;
  number: string; // RCT-2026-00045 (in) or RFD-2026-00007 (out)
  direction: "in" | "out"; // out = client refund payout
  clientId: ID;
  amount: Money; // in the currency actually received
  allocations: PaymentAllocation[];
  fxRate?: number; // captured if payment currency ≠ file currency (TZS per 1 USD)
  method: PaymentMethod;
  accountId: ID;
  reference?: string; // required for all methods except cash
  fiscalReceiptNo?: string; // TRA EFD/VFD receipt number, entered manually for now
  receivedAt: ISODateTime;
  status: "recorded" | "verified" | "reversed";
  recordedBy: ID;
  verifiedBy?: ID;
  verifiedAt?: ISODateTime;
  reversal?: { by: ID; at: ISODateTime; reason: string };
  refundRequestId?: ID; // for direction 'out'
  note?: string;
}

export interface RefundQuote {
  currency: Currency;
  supplierPenalty: Money; // what the airline or supplier keeps
  agencyFee: Money; // our refund-handling fee
  vatOnAgencyFee: Money;
  supplierCredit: Money; // = line cost − supplierPenalty
  clientRefund: Money; // = sell − retained (§8.5)
  waiveOriginalFees: boolean; // Manager only
}

export interface ExchangeDetails {
  newSegments: FlightSegment[];
  additionalFare: Money; // extra fare collected by the airline
  changeFee: Money; // agency change fee (becomes the new line's service fee)
  newLineId?: ID; // set on approval
}

export interface RefundRequest {
  id: ID;
  number: string; // RFQ-2026-00012
  fileId: ID;
  lineId: ID;
  kind: "refund" | "exchange";
  reason: string;
  quote: RefundQuote;
  exchange?: ExchangeDetails; // kind === 'exchange'
  previousStatus: LineStatus; // restored on reject
  status: "requested" | "approved" | "rejected" | "paid" | "closed";
  requestedBy: ID;
  requestedAt: ISODateTime;
  decidedBy?: ID;
  decidedAt?: ISODateTime;
  decisionNote?: string;
  payoutPaymentId?: ID;
}

export interface SupplierPayment {
  id: ID;
  number: string; // SPY-2026-00020
  supplierId: ID;
  amount: Money;
  accountId: ID;
  allocations: { lineId: ID; amount: Money }[];
  paidAt: ISODateTime;
  reference?: string;
  note?: string;
  recordedBy: ID;
}

export type ExpenseCategory =
  | "rent"
  | "salaries"
  | "utilities"
  | "internet_phone"
  | "marketing"
  | "transport"
  | "office_supplies"
  | "bank_charges"
  | "gds_fees"
  | "taxes_licences"
  | "other";

export interface Expense {
  id: ID;
  number: string; // EXP-2026-00031
  category: ExpenseCategory;
  payee: string;
  amount: Money;
  accountId: ID;
  paidAt: ISODate;
  note?: string;
  attachmentName?: string; // file name only in the prototype
  recordedBy: ID;
  deletedAt?: ISODateTime; // soft delete; reversing entries posted
}

export interface InvoiceSnapshotLine {
  lineId: ID;
  description: string;
  travellers: string[];
  sell: Money;
  serviceFee: Money;
  vat: Money;
}

export interface Invoice {
  id: ID;
  number: string; // INV-2026-00088 or QUO-2026-00030
  kind: "invoice" | "quote";
  fileId: ID;
  issuedAt: ISODateTime;
  dueAt: ISODate;
  snapshot: {
    lines: InvoiceSnapshotLine[];
    subtotal: Money;
    vat: Money;
    total: Money;
    currency: Currency;
    clientBlock: { name: string; phone: string; email?: string; tin?: string; address?: string };
    /** Fingerprint of the lines at issue time; differs from the live one when the invoice is outdated. */
    fingerprint: string;
  };
  status: "issued" | "superseded" | "void";
  issuedBy: ID;
}

export type AccountCode =
  | "1100"
  | "1200"
  | "1300"
  | "1400"
  | "1500"
  | "1510"
  | "2100"
  | "2200"
  | "2300"
  | "2400"
  | "2500"
  | "3100"
  | "3200"
  | "3300"
  | "4100"
  | "4200"
  | "4300"
  | "5100"
  | "5200"
  | "5300"
  | "5400"
  | "5500"
  | "5600"
  | "5700"
  | "5750"
  | "5800"
  | "5850"
  | "5900"
  | "4900"
  | "5950"
  | "5960";

/** What kind of event produced a ledger group (lets void/refund/reversal find the exact group to mirror, and feeds reports). */
export type LedgerKind =
  | "line_issue"
  | "line_void"
  | "refund_reversal"
  | "refund_retained"
  | "payment_in"
  | "payment_out"
  | "payment_reversal"
  | "supplier_payment"
  | "expense"
  | "expense_reversal"
  | "journal"
  | "journal_reversal"
  | "transfer";

export interface LedgerEntry {
  id: ID;
  groupId: ID;
  /** Added by the domain layer; optional so older persisted data stays valid. */
  kind?: LedgerKind;
  at: ISODateTime;
  account: AccountCode;
  sub?: { type: "client" | "supplier" | "money_account"; id: ID };
  fileId?: ID;
  lineId?: ID;
  debitMinor: number;
  creditMinor: number;
  currency: Currency;
  memo: string;
  ref: { entity: "line" | "payment" | "refund" | "supplier_payment" | "expense" | "journal"; id: ID };
}

export interface AuditEvent {
  id: ID;
  at: ISODateTime;
  actorId: ID;
  action: string; // "line.issued", "payment.verified"…
  entity: string;
  entityId: ID;
  summary: string; // human readable
  fileId?: ID;
}

export type NumberSeries =
  | "file"
  | "invoice"
  | "quote"
  | "receipt"
  | "refund_payout"
  | "refund_request"
  | "supplier_payment"
  | "expense"
  | "journal";

export type VoidWindow = "same_day" | { hours: number };

export interface AirlineRef {
  code: string; // IATA 2-char
  name: string;
  ticketPrefix?: string; // 3-digit, blank where unconfirmed
}

export interface Settings {
  company: {
    name: string;
    tin: string;
    vrn?: string;
    address: string;
    phone: string;
    email: string;
    logoDataUrl?: string;
  };
  baseCurrency: "TZS";
  fx: { USD_TZS: number; updatedAt: ISODateTime; updatedBy: ID };
  vatRate: number; // 0.18
  vatBase: "service_fee" | "service_fee_and_markup";
  defaultServiceFee: Partial<Record<LineType, Money>>;
  refundApprovalLimit: Money; // TZS 500,000
  voidWindow: VoidWindow;
  airSettlement: { mode: "bsp" | "consolidator"; supplierId: ID };
  defaultPaymentTermsDays: number; // corporates, 30
  numbering: Record<NumberSeries, { prefix: string; pad: number }>;
  paymentInstructions: string; // printed on invoices
  /** Editable airline list (Settings → Airlines); seeded from reference data. */
  airlines: AirlineRef[];
  /** Client messaging: sender identities, automatic messages and templates. */
  comms: CommsSettings;
  integrations: {
    amadeus: {
      mode: "off" | "mock" | "live"; // 'live' disabled in the prototype
      environment: "test" | "production";
      officeId: string;
      mock: {
        latencyMs: number;
        failure: "none" | "timeout" | "not_found" | "auth_error" | "random";
      };
    };
  };
}

// ─────────────────────────────── Communications ───────────────────────────────

export type MessageChannel = "sms" | "whatsapp" | "email";

export type MessageTemplateKey =
  | "booking_confirmation"
  | "eticket"
  | "itinerary"
  | "flight_reminder"
  | "payment_reminder"
  | "payment_receipt"
  | "invoice"
  | "quote"
  | "hotel_voucher"
  | "statement"
  | "ttl_reminder"
  | "custom";

export interface MessageAttachment {
  kind: "invoice" | "quote" | "receipt" | "itinerary" | "eticket" | "statement" | "voucher" | "file";
  /** The invoice, payment, file or line the document is printed from. */
  refId?: ID;
  label: string;
  /** Print route or data URL. */
  url?: string;
}

export interface Message {
  id: ID;
  channel: MessageChannel;
  clientId?: ID;
  fileId?: ID;
  /** E.164 phone for SMS and WhatsApp, an address for email. */
  to: string;
  toName?: string;
  subject?: string;
  body: string;
  attachments: MessageAttachment[];
  template?: MessageTemplateKey;
  status: "sent" | "scheduled" | "failed";
  /** Sent by an automatic rule rather than by a person. */
  auto: boolean;
  scheduledFor?: ISODateTime;
  sentAt?: ISODateTime;
  createdAt: ISODateTime;
  createdBy: ID;
}

export type AutoRule = "booking_confirmation" | "ticket_issued" | "payment_receipt" | "payment_reminder" | "flight_reminder" | "ttl_reminder";

export interface CommsSettings {
  senderName: string;
  /** Alphanumeric SMS sender ID registered with TCRA, e.g. "AEROPATH". */
  smsSenderId: string;
  whatsappNumber: string; // E.164
  emailFrom: string;
  emailSignature: string;
  auto: Record<AutoRule, { enabled: boolean; channels: MessageChannel[]; leadHours?: number }>;
  templates: Partial<Record<MessageTemplateKey, { subject?: string; body: string }>>;
}

// ─────────────────────────────── Accounting ───────────────────────────────

export interface JournalLine {
  account: AccountCode;
  sub?: LedgerEntry["sub"];
  debitMinor: number;
  creditMinor: number;
  memo?: string;
}

/** A manual journal voucher (JV) or a transfer between money accounts. Posted to the ledger as one balanced group. */
export interface JournalEntry {
  id: ID;
  number: string; // JV-2026-00001
  date: ISODate;
  memo: string;
  currency: Currency;
  lines: JournalLine[];
  source: "manual" | "transfer" | "petty_cash" | "opening_balance";
  status: "posted" | "reversed";
  reversedAt?: ISODateTime;
  reversedBy?: ID;
  createdAt: ISODateTime;
  createdBy: ID;
}

/** Matching a money account's ledger movements to its bank or mobile-money statement. */
export interface BankReconciliation {
  id: ID;
  moneyAccountId: ID;
  statementDate: ISODate;
  /** Closing balance on the statement, minor units of the account currency. */
  statementBalanceMinor: number;
  /** Ledger entry ids ticked as appearing on the statement. */
  clearedEntryIds: ID[];
  status: "draft" | "completed";
  notes?: string;
  completedAt?: ISODateTime;
  completedBy?: ID;
  createdAt: ISODateTime;
  createdBy: ID;
}

export interface DbState {
  schemaVersion: 1;
  users: Record<ID, User>;
  clients: Record<ID, Client>;
  travellers: Record<ID, Traveller>;
  suppliers: Record<ID, Supplier>;
  moneyAccounts: Record<ID, MoneyAccount>;
  files: Record<ID, BookingFile>;
  lines: Record<ID, ServiceLine>;
  payments: Record<ID, Payment>;
  refunds: Record<ID, RefundRequest>;
  supplierPayments: Record<ID, SupplierPayment>;
  expenses: Record<ID, Expense>;
  invoices: Record<ID, Invoice>;
  messages: Record<ID, Message>;
  journals: Record<ID, JournalEntry>;
  reconciliations: Record<ID, BankReconciliation>;
  ledger: LedgerEntry[];
  audit: AuditEvent[];
  settings: Settings;
  counters: Record<NumberSeries, number>; // numbering series (per year handled by prefix/year in format)
  session: { userId: ID | null };
}

// ─────────────────────────────── Commands ───────────────────────────────

export type DomainErrorCode =
  | "FORBIDDEN"
  | "VALIDATION"
  | "ILLEGAL_TRANSITION"
  | "NOT_FOUND"
  | "CONFLICT"
  | "BELOW_COST"
  | "LIMIT_EXCEEDED"
  | "UNBALANCED";

export interface DomainError {
  code: DomainErrorCode;
  message: string; // plain words, shown to staff
  field?: string;
}

export interface Ctx {
  user: User;
  now: Date;
  settings: Settings;
  /** ID factory, injected so commands stay pure and the seed stays deterministic. newId('fil') → "fil_…" */
  newId: (prefix: string) => ID;
}

export type CommandResult<R = unknown> =
  | { ok: true; state: DbState; audit: AuditEvent[]; toast?: string; result?: R }
  | { ok: false; error: DomainError };

export type Command<I, R = unknown> = (state: DbState, input: I, ctx: Ctx) => CommandResult<R>;
