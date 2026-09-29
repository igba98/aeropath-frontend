# Aeropath Back Office — Frontend Prototype Build Spec

> **Audience:** Claude Code (or any developer) working inside the existing Aeropath Next.js project.
> **Goal:** Replace the current marketplace prototype with a simple, staff-only back office for an air-ticketing travel agency. It must be a **working frontend prototype with no database**: all state lives in the browser, but the code is structured so that a real database and the Amadeus Enterprise APIs can be plugged in later without rewriting screens.
> **Owner:** Centered Studios · Version 1.0 · 28 Sep 2026

---

## 0. How to use this document

1. Read the whole document once before changing any code.
2. Before deleting anything, create a git branch `archive/marketplace-prototype` from the current state and push it.
3. Work through the milestones in **§17** in order. Finish each milestone's acceptance checks before starting the next one.
4. All business rules live in `src/domain/` as pure, tested TypeScript. Screens call **commands** and **selectors** and never mutate state directly.
5. When this spec is silent, choose the simplest option that keeps the domain layer pure and the data normalised like database tables.
6. Do not invent features that are not in this spec. Where something is marked **Stretch**, build it only after everything else passes.

---

## 1. Product summary

Aeropath is an air-ticketing travel agency in Dar es Salaam. Clients walk in, call, send a WhatsApp message or email. **Staff** create the booking on the client's behalf, book in Amadeus (today through the Amadeus terminal, later through the APIs), collect payment, pay suppliers and track the business.

The back office must answer five questions at any moment:

1. What have we booked, and for whom?
2. Who has paid, and who still owes us?
3. What do we owe suppliers (airlines through BSP or a consolidator, hotels, car hire and others)?
4. What did we spend?
5. How much did we make?

### Design principles

- **Few roles:** Agent, Accountant and Manager. Nothing else.
- **One booking, one screen:** everything about a trip lives on the booking file page.
- **Money is always visible:** every booking, client and supplier shows a balance chip.
- **Attention first:** the home screen lists what needs action today, not vanity charts.
- **Amadeus-shaped data:** flights are stored the way Amadeus represents them, so API data maps 1:1 later.
- **Simple on the surface, rigorous underneath:** a double-entry ledger, a state machine and an audit log run invisibly.

---

## 2. What to remove, and what to keep

### 2.1 Remove completely

This is a staff-only system, so all public and customer-facing routes and code go:

- Public site: `/`, `/stays`, `/flights`, `/tours`, `/transfers`, `/destinations/*`, `/collections/*`, `/cart`, `/trips`, `/about`
- Supplier side: `/partner/*`, supplier onboarding, supplier console, product listing, availability calendars and supplier payouts
- Back office modules that do not apply: product approval queue, content editor (landing pages, home rails, promos), commission terms, SLA confirmation queue, support tickets, customer impersonation
- Consumer mechanics: cart, 15-minute holds, instant vouchers, traveller accounts, phone OTP login
- The persona list with 14 personas and the role builder
- Seed data for lodges, safaris, destinations and supplier products

### 2.2 Keep and adapt (the good engineering)

- **Double-entry ledger** where every entry group balances to zero. Adapt it to the chart of accounts in §8.4.
- **State machine** that rejects illegal transitions. Adapt it to the line machine in §7.1.
- **Policy snapshot idea.** Refunds are quoted from data saved on the line, not recomputed from current settings.
- **Role and scope permissions** enforced in the domain layer, not by hiding buttons.
- **Payment simulator and failure modes.** These become the Amadeus mock error simulator (§11.3).
- **Approval thresholds.** The idea of approving refunds up to TZS 500,000 at a lower level is kept.
- **Browser-held state with a reset.** Keep "Reset demo data".
- **Brand colour** `#488FF5`, currency toggle and the mobile money payment method list.

---

## 3. Tech and architecture

### 3.1 Stack

Use what already exists in the project. Add only what is missing:

| Concern | Library |
|---|---|
| Framework | Next.js App Router with TypeScript (strict mode) |
| Styling | Tailwind CSS, plus shadcn/ui components if they are not already present |
| State | `zustand` with the `persist` middleware (localStorage) and `immer` |
| Forms and validation | `react-hook-form` and `zod` |
| Dates | `date-fns` and `date-fns-tz` (display timezone `Africa/Dar_es_Salaam`) |
| Charts | `recharts` |
| Command palette | `cmdk` |
| Toasts | `sonner` |
| Icons | `lucide-react` |
| IDs | `nanoid` |
| Tests | `vitest` (domain layer and PNR parser) |

### 3.2 Folder structure

```
src/
  app/
    (auth)/login/page.tsx
    (app)/layout.tsx                 # sidebar, top bar, auth guard, command palette
    (app)/page.tsx                   # Home (dashboard)
    (app)/bookings/page.tsx
    (app)/bookings/new/page.tsx
    (app)/bookings/[id]/page.tsx     # tabs via ?tab=
    (app)/clients/page.tsx
    (app)/clients/new/page.tsx
    (app)/clients/[id]/page.tsx
    (app)/payments/page.tsx          # tabs: received | refunds | unverified
    (app)/money-out/page.tsx         # tabs: suppliers | supplier-payments | expenses
    (app)/money-out/suppliers/[id]/page.tsx
    (app)/reports/page.tsx
    (app)/reports/[slug]/page.tsx
    (app)/settings/[[...tab]]/page.tsx
    (app)/forbidden/page.tsx
    print/[doc]/[id]/page.tsx        # invoice | receipt | itinerary | statement | quote
  domain/
    types.ts
    money.ts
    pricing.ts
    numbering.ts
    permissions.ts
    status/line-machine.ts
    status/file-status.ts
    status/payment-status.ts
    ledger/accounts.ts
    ledger/postings.ts
    commands/*.ts                    # one file per command (§6.3)
    selectors/*.ts                   # fileTotals, attention, balances, reports
    audit.ts
    __tests__/*.test.ts
  providers/
    types.ts                         # TravelProvider, PnrSnapshot
    manual.ts
    amadeus-mock/index.ts
    amadeus-mock/fixtures/*.json
    amadeus/README.md                # placeholder only: how the real adapter will plug in
    pnr-parser/parse.ts
    pnr-parser/samples/*.txt
    pnr-parser/__tests__/parse.test.ts
    mappers/pnr-to-flight-line.ts
  store/
    index.ts                         # zustand store: DbState + dispatch()
    seed/generate.ts                 # seed generator, dates relative to "now"
    seed/reference.ts                # airports, airlines, expense categories
  components/
    ui/  layout/  bookings/  clients/  payments/  money-out/  reports/  settings/  print/  shared/
  lib/
    csv.ts  format.ts  dates.ts  whatsapp.ts  cn.ts
```

### 3.3 Data layer: shaped like a database

The store holds **normalised tables**, one per future database table. No nested ownership: service lines are not stored inside files.

```ts
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
  ledger: LedgerEntry[];
  audit: AuditEvent[];
  settings: Settings;
  counters: Record<NumberSeries, number>;   // numbering series
  session: { userId: ID | null };
}
```

- The persist key is `aeropath-bo-v1`. On first load, if storage is empty, run `seed/generate.ts`.
- Keep the seed modest (§14) so it stays well under the localStorage limit.
- Add a `migrate` function keyed on `schemaVersion` for future changes.

### 3.4 Commands: the only way to change state

```ts
type Ctx = { user: User; now: Date; settings: Settings };
type CommandResult =
  | { ok: true; state: DbState; audit: AuditEvent[]; toast?: string }
  | { ok: false; error: DomainError };            // { code, message, field? }

type Command<I> = (state: DbState, input: I, ctx: Ctx) => CommandResult;
```

Every command does the following, in order:

1. **Permission check** via `can(ctx.user, action, resource)`. On failure, return the error code `FORBIDDEN`.
2. **Input validation** with a zod schema.
3. **State machine and business rules.**
4. **Ledger postings**, if the command moves money.
5. **Audit events.**
6. Return a new state. Commands are pure functions: no side effects and no `Date.now()` inside; use `ctx.now`.

The store exposes `dispatch(command, input)`. It builds `ctx`, runs the command, commits the state, appends the audit events and shows a toast (success or error).

**Why this matters:** when the database arrives, the same commands move into server actions or API routes behind a repository interface, and the screens do not change.

### 3.5 Providers: where Amadeus plugs in

All booking-source integration goes through `TravelProvider` (§11). Screens never import the Amadeus code directly. Three implementations:

- `manual`: forms only. This is the default today.
- `amadeus-mock`: returns fixtures with latency and simulated errors, to demo the future flow.
- `amadeus`: not built yet. Only a README placeholder describing the mapping.

---

## 4. Roles and permissions

### 4.1 Roles

| Role | Who | In one line |
|---|---|---|
| **Agent** | Ticketing and sales staff | Serves clients: creates bookings, records payments received, issues tickets |
| **Accountant** | Finance | Controls money: verifies payments, pays suppliers, records expenses, approves refunds up to the limit |
| **Manager** | Owner or lead | Everything, plus approvals above the limit, overrides, users, settings and integrations |

### 4.2 Access-control matrix

✓ = allowed · — = not allowed · 👁 = view only

| Action / resource | Agent | Accountant | Manager |
|---|:-:|:-:|:-:|
| Home dashboard (role-specific view) | ✓ | ✓ | ✓ |
| View bookings and clients (all) | ✓ | 👁 | ✓ |
| Create and edit clients and travellers | ✓ | ✓ | ✓ |
| Set a corporate credit limit and payment terms | — | — | ✓ |
| Create bookings and add or edit service lines | ✓ | — | ✓ |
| Set the selling price at or above cost | ✓ | — | ✓ |
| Sell below cost (price override) | — | — | ✓ |
| Transition a line: book, issue, complete, cancel | ✓ | — | ✓ |
| Void a flight (within the void window) | ✓ | — | ✓ |
| Request a refund or exchange | ✓ | — | ✓ |
| Approve or reject a refund at or below the limit | — | ✓ | ✓ |
| Approve or reject a refund above the limit | — | — | ✓ |
| Pay out an approved client refund | — | ✓ | ✓ |
| Record a payment received | ✓ | ✓ | ✓ |
| Verify a payment | — | ✓ | ✓ |
| Reverse a payment | — | ✓ | ✓ |
| Issue an invoice or quote; print or share documents | ✓ | ✓ | ✓ |
| Money out: supplier balances and supplier payments | — | ✓ | ✓ |
| Record expenses | — | ✓ | ✓ |
| Reports: "My sales" | ✓ | ✓ | ✓ |
| Reports: all others | — | ✓ | ✓ |
| Audit log | — | 👁 | ✓ |
| Settings: company, fees, tax, FX, numbering, money accounts | — | 👁 | ✓ |
| Settings: users, integrations (Amadeus), reset demo data | — | — | ✓ |
| Reassign a booking to another agent | — | — | ✓ |

### 4.3 Enforcement

- `domain/permissions.ts` exports `can(user, action, resource?) => boolean` and a typed `Action` union.
- Resource-aware rules live here. For example, `refund.approve` checks the refund amount against `settings.refundApprovalLimit`, converted to TZS.
- **Routes:** `(app)/layout.tsx` checks route-level access with a map from route to action. On failure, redirect to `/forbidden`, which offers a friendly "Ask your manager" message and a link back home.
- **UI:** buttons for disallowed actions are hidden, **and** the command still rejects them. Test this.

---

## 5. Navigation and screens

### 5.1 App shell

- **Left sidebar** (collapsible, icons plus labels):
  1. Home
  2. Bookings
  3. Clients
  4. Payments
  5. Money out
  6. Reports
  7. Settings

  Hide the items a role cannot open.
- **Top bar:**
  - Global search, opened with ⌘K or Ctrl+K
  - A "New booking" button (primary; Agent and Manager)
  - A TZS/USD display toggle, which affects totals only
  - The user menu: name, role, "Switch user (demo)" and "Sign out"
- **Keyboard shortcuts:** `N` opens a new booking, `P` records a payment, `/` focuses search.
- **Responsive:** desktop first, but every screen must work at 390 px wide. On mobile the sidebar becomes a bottom sheet or menu.

### 5.2 Login (`/login`)

- An email and password form. For the prototype, any password works for the seeded emails.
- Below the form, a **"Demo users"** card lists the seeded users (§14) with their roles. Clicking a user signs in as them.
- After sign-in, go to `/`.

### 5.3 Global search and command palette

- **Searches:**
  - File number (`AP-2026-000123`)
  - Client name, phone or email
  - Traveller surname
  - PNR (6 characters)
  - Ticket number (13 digits, with or without the dash)
  - Invoice or receipt number
- Results are grouped as Bookings, Clients and Documents.
- **Actions:** "New booking", "Record payment", "Paste PNR", "New client", "Record expense" (role-filtered).

---

## 6. Domain model

### 6.1 Core types (`domain/types.ts`)

```ts
export type ID = string;                 // prefixed nanoid, e.g. "fil_8kJ2..."
export type ISODate = string;            // "2026-10-12"
export type ISODateTime = string;        // UTC "2026-09-28T09:12:00Z"
export type LocalDateTime = string;      // airport-local, no zone: "2026-10-12T16:50"
export type Currency = 'TZS' | 'USD';
export interface Money { amountMinor: number; currency: Currency } // integers only; exponent 2 for both

export type Role = 'agent' | 'accountant' | 'manager';

export interface User {
  id: ID; name: string; initials: string; email: string; phone?: string;
  role: Role; active: boolean; createdAt: ISODateTime;
}

export interface Client {
  id: ID; type: 'individual' | 'corporate';
  name: string;                         // person or company name
  phone: string; email?: string; address?: string;
  tin?: string; vrn?: string;           // corporates
  contactPerson?: string;               // corporates
  creditLimit?: Money;                  // corporates, Manager only
  paymentTermsDays?: number;            // corporates, e.g. 30
  defaultCurrency: Currency;
  source?: 'walk_in' | 'phone' | 'whatsapp' | 'email' | 'referral';
  notes?: string; tags: string[];
  createdAt: ISODateTime; createdBy: ID; archived: boolean;
}

export type PaxType = 'ADT' | 'CHD' | 'INF';
export type Title = 'MR' | 'MRS' | 'MS' | 'MSTR' | 'MISS';

export interface Traveller {
  id: ID; clientId: ID;
  title: Title; givenName: string; surname: string;   // stored UPPERCASE as in passport
  paxType: PaxType; dateOfBirth?: ISODate; gender?: 'M' | 'F';
  nationality?: string;                 // ISO-3166 alpha-2
  passportNumber?: string; passportExpiry?: ISODate; passportCountry?: string;
  frequentFlyer: { airline: string; number: string }[];
  phone?: string; email?: string;
}

export type SupplierKind =
  | 'air_settlement'   // BSP Tanzania or the consolidator: where ticket money goes
  | 'hotel' | 'car_rental' | 'transfer' | 'tour' | 'visa' | 'insurance' | 'other';

export interface Supplier {
  id: ID; name: string; kind: SupplierKind; currency: Currency;
  contactName?: string; phone?: string; email?: string;
  paymentTermsDays: number; notes?: string; active: boolean;
}

export interface MoneyAccount {
  id: ID; name: string;                 // "CRDB USD", "M-Pesa Till 123456", "Cash box"
  kind: 'cash' | 'bank' | 'mobile_money' | 'card';
  currency: Currency; openingBalance: Money; active: boolean;
}

export interface BookingFile {
  id: ID; number: string;               // AP-2026-000123
  clientId: ID; title: string;          // "Dar → Dubai · Mwakalinga family"
  ownerId: ID;                          // agent responsible
  currency: Currency;                   // invoicing currency of the file
  source: 'walk_in' | 'phone' | 'whatsapp' | 'email' | 'corporate';
  travellerIds: ID[];
  notes?: string; tags: string[];
  cancelledAt?: ISODateTime;
  createdAt: ISODateTime; createdBy: ID; updatedAt: ISODateTime;
  // status, totals and travel dates are DERIVED (selectors), never stored
}
```

### 6.2 Service lines

```ts
export type LineType =
  | 'flight' | 'hotel' | 'car' | 'transfer' | 'tour'
  | 'visa' | 'insurance' | 'service_fee' | 'other';

export type LineStatus =
  | 'quoted' | 'booked' | 'issued' | 'completed'
  | 'cancelled' | 'voided' | 'refund_pending' | 'refunded' | 'exchanged';

export interface Pricing {
  currency: Currency;
  cost: Money;          // net payable to the supplier (for flights: totalFare − commission)
  markup: Money;        // agency markup included in the selling price
  serviceFee: Money;    // visible agency service fee
  vat: Money;           // computed per settings.vatBase (§8.2)
  sell: Money;          // cost + markup + serviceFee + vat (computed, never typed)
  overrideBelowCost?: { by: ID; at: ISODateTime; reason: string };
}

export interface ExternalRef {
  provider: 'amadeus';
  officeId?: string;
  recordLocator?: string;
  externalIds: Record<string, string>;  // e.g. { tst: "1", queue: "50C0" }
  rawPayload?: string;                  // original PNR text or JSON, kept for debugging
  lastSyncedAt?: ISODateTime;
  syncStatus?: 'ok' | 'drift' | 'error';
}

interface LineBase {
  id: ID; fileId: ID; type: LineType; status: LineStatus;
  supplierId: ID; travellerIds: ID[];
  description: string;                  // one-line human summary, auto-generated
  pricing: Pricing;
  source: 'manual' | 'amadeus';
  external?: ExternalRef;
  supplierPaidMinor: number;            // derived cache, updated by supplier payments
  notes?: string;
  createdAt: ISODateTime; createdBy: ID; updatedAt: ISODateTime;
  statusHistory: { from: LineStatus | null; to: LineStatus; at: ISODateTime; by: ID; note?: string }[];
}

export type ServiceLine =
  | (LineBase & { type: 'flight'; details: FlightDetails })
  | (LineBase & { type: 'hotel'; details: HotelDetails })
  | (LineBase & { type: 'car'; details: CarDetails })
  | (LineBase & { type: 'transfer'; details: TransferDetails })
  | (LineBase & { type: 'tour'; details: TourDetails })
  | (LineBase & { type: 'visa'; details: VisaDetails })
  | (LineBase & { type: 'insurance'; details: InsuranceDetails })
  | (LineBase & { type: 'service_fee'; details: { reason: string } })
  | (LineBase & { type: 'other'; details: { label: string } });
```

#### Flight details (Amadeus-shaped)

```ts
export type SegmentStatus = 'HK' | 'KK' | 'TK' | 'HL' | 'UN' | 'UC' | 'NO' | 'HX' | 'XX';

export interface FlightSegment {
  segmentNo: number;                    // element number as in the PNR
  carrier: string;                      // IATA 2-char, marketing
  operatingCarrier?: string;
  flightNumber: string;                 // "726"
  bookingClass: string;                 // RBD, e.g. "Y", "K"
  cabin: 'economy' | 'premium_economy' | 'business' | 'first';
  origin: string; destination: string;  // IATA 3-letter
  departureLocal: LocalDateTime; arrivalLocal: LocalDateTime;
  arrivalDayOffset: 0 | 1 | 2;
  statusCode: SegmentStatus; seats: number;
  equipment?: string;
}

export interface FlightPassenger {
  travellerId: ID;
  nameInPnr: string;                    // "MWAKALINGA/PETER MR"
  paxType: PaxType;
  pnrPaxNo?: number;                    // P1, P2…
  ticketNumber?: string;                // "176-2401234567" (3-digit airline prefix + 10 digits)
  emdNumbers: string[];
  fareAmount?: Money;                   // per-passenger total fare, if known
}

export interface FlightDetails {
  recordLocator: string;                // 6 chars, e.g. "Z8K4QM"
  airlineLocator?: string;              // airline's own locator, if different
  officeId?: string;                    // e.g. "DARTZ2100"
  validatingCarrier: string;            // plating carrier
  tripType: 'one_way' | 'return' | 'multi_city';
  segments: FlightSegment[];
  passengers: FlightPassenger[];
  fare: {
    currency: Currency;
    baseFare: Money;
    taxes: { code: string; amount: Money }[];   // YQ, TZ, etc.; optional detail
    totalFare: Money;                           // base + taxes (all passengers)
    commissionPct: number;                      // usually 0
    fareBasis?: string;
  };
  baggage?: string;                             // "2PC", "30K"
  ticketingTimeLimit?: ISODateTime;             // from TK TL; drives the attention list
  issuedAt?: ISODateTime;
  voidDeadline?: ISODateTime;                   // computed at issue from settings.voidWindow
  exchangedFromLineId?: ID; exchangedToLineId?: ID;
}
```

#### Other details

```ts
export interface HotelDetails {
  hotelName: string; city: string;
  checkIn: ISODate; checkOut: ISODate;
  rooms: { roomType: string; board: 'RO' | 'BB' | 'HB' | 'FB' | 'AI'; adults: number; children: number }[];
  confirmationNumber?: string;
  cancellationPolicy?: string; freeCancelUntil?: ISODateTime;   // snapshot at booking
}
export interface CarDetails {
  company: string; carClass: string; withDriver: boolean;
  pickupLocation: string; pickupAt: ISODateTime;
  dropoffLocation: string; dropoffAt: ISODateTime;
  confirmationNumber?: string;
}
export interface TransferDetails {
  from: string; to: string; at: ISODateTime; vehicle: string; pax: number;
  flightRef?: string; confirmationNumber?: string;
}
export interface TourDetails { name: string; startDate: ISODate; endDate: ISODate; pax: number; inclusions?: string; confirmationNumber?: string }
export interface VisaDetails { country: string; visaType: string; submittedAt?: ISODate; decision: 'pending' | 'approved' | 'rejected'; reference?: string }
export interface InsuranceDetails { provider: string; plan: string; coverStart: ISODate; coverEnd: ISODate; policyNumber?: string }
```

#### Money movements, documents and records

```ts
export type PaymentMethod =
  | 'cash' | 'bank_transfer' | 'mpesa' | 'airtel_money' | 'mixx' | 'halopesa' | 'card' | 'cheque';

export interface Payment {
  id: ID; number: string;               // RCT-2026-00045 (in) or RFD-2026-00007 (out)
  direction: 'in' | 'out';              // out = client refund payout
  clientId: ID;
  amount: Money;                        // in the currency actually received
  allocations: { fileId: ID; amount: Money /* in the file's currency */ }[];
  fxRate?: number;                      // captured if payment currency ≠ file currency
  method: PaymentMethod; accountId: ID;
  reference?: string;                   // required for all methods except cash
  fiscalReceiptNo?: string;             // TRA EFD/VFD receipt number, entered manually for now
  receivedAt: ISODateTime;
  status: 'recorded' | 'verified' | 'reversed';
  recordedBy: ID; verifiedBy?: ID; verifiedAt?: ISODateTime;
  reversal?: { by: ID; at: ISODateTime; reason: string };
  refundRequestId?: ID;                 // for direction 'out'
  note?: string;
}

export interface RefundRequest {
  id: ID; number: string;               // RFQ-2026-00012
  fileId: ID; lineId: ID;
  kind: 'refund' | 'exchange';
  reason: string;
  quote: {
    currency: Currency;
    supplierPenalty: Money;             // what the airline or supplier keeps
    agencyFee: Money;                   // our refund-handling fee
    vatOnAgencyFee: Money;
    supplierCredit: Money;              // = line cost − supplierPenalty
    clientRefund: Money;                // = sell − supplierPenalty − agencyFee − vat − markup − serviceFee (unless waived, §8.5)
    waiveOriginalFees: boolean;         // Manager only: return the original markup and service fee to the client
  };
  status: 'requested' | 'approved' | 'rejected' | 'paid' | 'closed';
  requestedBy: ID; requestedAt: ISODateTime;
  decidedBy?: ID; decidedAt?: ISODateTime; decisionNote?: string;
  payoutPaymentId?: ID;
}

export interface SupplierPayment {
  id: ID; number: string;               // SPY-2026-00020
  supplierId: ID; amount: Money; accountId: ID;
  allocations: { lineId: ID; amount: Money }[];
  paidAt: ISODateTime; reference?: string; note?: string; recordedBy: ID;
}

export type ExpenseCategory =
  | 'rent' | 'salaries' | 'utilities' | 'internet_phone' | 'marketing' | 'transport'
  | 'office_supplies' | 'bank_charges' | 'gds_fees' | 'taxes_licences' | 'other';

export interface Expense {
  id: ID; number: string;               // EXP-2026-00031
  category: ExpenseCategory; payee: string; amount: Money; accountId: ID;
  paidAt: ISODate; note?: string; attachmentName?: string;   // file name only in the prototype
  recordedBy: ID;
}

export interface Invoice {
  id: ID; number: string;               // INV-2026-00088 or QUO-2026-00030
  kind: 'invoice' | 'quote';
  fileId: ID; issuedAt: ISODateTime; dueAt: ISODate;
  snapshot: {                           // frozen at issue time
    lines: { lineId: ID; description: string; travellers: string[]; sell: Money; serviceFee: Money; vat: Money }[];
    subtotal: Money; vat: Money; total: Money; currency: Currency;
    clientBlock: { name: string; phone: string; email?: string; tin?: string; address?: string };
  };
  status: 'issued' | 'superseded' | 'void';
  issuedBy: ID;
}

export interface LedgerEntry {
  id: ID; groupId: ID; at: ISODateTime;
  account: AccountCode;
  sub?: { type: 'client' | 'supplier' | 'money_account'; id: ID };
  fileId?: ID; lineId?: ID;
  debitMinor: number; creditMinor: number; currency: Currency;
  memo: string;
  ref: { entity: 'line' | 'payment' | 'refund' | 'supplier_payment' | 'expense'; id: ID };
}

export interface AuditEvent {
  id: ID; at: ISODateTime; actorId: ID;
  action: string;                       // "line.issued", "payment.verified"…
  entity: string; entityId: ID;
  summary: string;                      // human readable
  fileId?: ID;
}

export interface Settings {
  company: { name: string; tin: string; vrn?: string; address: string; phone: string; email: string; logoDataUrl?: string };
  baseCurrency: 'TZS';
  fx: { USD_TZS: number; updatedAt: ISODateTime; updatedBy: ID };
  vatRate: number;                                        // 0.18
  vatBase: 'service_fee' | 'service_fee_and_markup';      // default 'service_fee' — confirm with the accountant
  defaultServiceFee: Partial<Record<LineType, Money>>;
  refundApprovalLimit: Money;                             // TZS 500,000
  voidWindow: 'same_day' | { hours: number };             // default same_day (before 23:59 local)
  airSettlement: { mode: 'bsp' | 'consolidator'; supplierId: ID };
  defaultPaymentTermsDays: number;                        // corporates, 30
  numbering: Record<NumberSeries, { prefix: string; pad: number }>;
  paymentInstructions: string;                            // printed on invoices: bank and mobile money details
  integrations: {
    amadeus: {
      mode: 'off' | 'mock' | 'live';                      // 'live' disabled in the prototype
      environment: 'test' | 'production';
      officeId: string;
      mock: { latencyMs: number; failure: 'none' | 'timeout' | 'not_found' | 'auth_error' | 'random' };
    };
  };
}

export type NumberSeries = 'file' | 'invoice' | 'quote' | 'receipt' | 'refund_payout' | 'refund_request' | 'supplier_payment' | 'expense';
```

### 6.3 Commands to implement

| Command | Who | Notes |
|---|---|---|
| `createClient`, `updateClient`, `archiveClient` | A, Acc, M | Credit and terms fields are Manager only |
| `upsertTraveller`, `removeTraveller` | A, Acc, M | Cannot remove a traveller used on an issued line |
| `createBookingFile` | A, M | Assigns the next `file` number |
| `updateBookingFile` | A, M | Title, notes, tags, travellers |
| `reassignFile` | M | |
| `cancelBookingFile` | A, M | Only if no line is `issued` or `refund_pending`; cancels all quoted and booked lines |
| `addServiceLine`, `updateServiceLine` | A, M | Pricing recomputed; below-cost pricing needs Manager and a reason |
| `transitionLine` | A, M | Validated by the line machine (§7.1); posts to the ledger on `issued` |
| `voidLine` | A, M | Flight, `issued`, before `voidDeadline`; reverses postings |
| `requestRefund` | A, M | Creates a RefundRequest; line → `refund_pending` |
| `decideRefund` | Acc, M | Limit check; approve → line `refunded` (or `exchanged`) and postings; reject → line back to its previous status |
| `payRefund` | Acc, M | Creates a Payment with `direction: 'out'`; refund → `paid` |
| `exchangeFlight` | A, M | Via an approved exchange request: creates a new flight line linked both ways (§8.6) |
| `recordPayment` | A, Acc, M | Allocations must sum to the amount (after FX); posts to the ledger |
| `verifyPayment` | Acc, M | Flag only |
| `reversePayment` | Acc, M | Reason required; posts reversing entries |
| `issueInvoice`, `issueQuote` | A, Acc, M | Supersedes the previous open invoice for the file |
| `recordSupplierPayment` | Acc, M | Allocations to open supplier lines |
| `recordExpense`, `updateExpense`, `deleteExpense` | Acc, M | Delete = reversing entries plus an audit event |
| `updateSettings`, `upsertUser`, `upsertMoneyAccount`, `upsertSupplier` | M | Accountant can create suppliers too |
| `importFromProvider` | A, M | Creates or updates a flight line from a `PnrSnapshot` (§11) |
| `resetDemoData` | M | Reseeds everything |

---

## 7. State machines and derived statuses

### 7.1 Service line machine (`status/line-machine.ts`)

```
quoted ──► booked ──► issued ──► completed
  │          │          │  │  └─► refund_pending ──► refunded
  ▼          ▼          │  └──► voided        (flight only, before voidDeadline)
cancelled  cancelled    └────► refund_pending ──► exchanged (flight, via exchange request)
                                      │
                                      └─► back to issued/completed (refund rejected)
```

| From | To | Guard (must be true) |
|---|---|---|
| — | `quoted` | Line created with a supplier and pricing |
| `quoted` | `booked` | **Flight:** `recordLocator` (6 chars) and at least 1 segment with status HK/KK/TK. **Hotel/car/transfer/tour:** supplier confirmation number optional. **Visa/insurance/service fee/other:** always allowed |
| `quoted`, `booked` | `cancelled` | No ledger impact (nothing was posted) |
| `booked` | `issued` | **Flight:** a valid ticket number for every passenger (`^\d{3}-?\d{10}$`), validating carrier set, total fare > 0. **Hotel/car/transfer/tour:** confirmation number required. **Visa:** reference optional. Sets `issuedAt`; for flights, sets `voidDeadline`. **Posts the issue group (§8.4)** |
| `issued` | `completed` | Manual, or automatic in a selector when the last travel date is in the past. There is no stored flip: `completed` is written only by an explicit action; the UI shows "Travelled" when the dates have passed |
| `issued` | `voided` | Flight only; `now ≤ voidDeadline`. **Posts the reversal of the issue group** |
| `issued`, `completed` | `refund_pending` | Through `requestRefund` only |
| `refund_pending` | `refunded` | Through `decideRefund` (approve, kind `refund`). Posts §8.5 |
| `refund_pending` | `exchanged` | Through `decideRefund` (approve, kind `exchange`). Posts §8.6 |
| `refund_pending` | previous status | Through `decideRefund` (reject) |

Any other transition returns `ILLEGAL_TRANSITION`. Unit-test every row, including the rejections.

### 7.2 Booking file status (derived, `status/file-status.ts`)

Let `active = lines not in {cancelled, voided, refunded, exchanged}`.

| Status | Rule |
|---|---|
| `draft` | No lines, or every active line is `quoted` |
| `confirmed` | Any active line is `booked`, `issued` or `refund_pending`, and the last travel date is today or later (or unknown) |
| `travelled` | Every active line is `issued` or `completed` and the last travel date has passed |
| `closed` | `travelled` **and** the balance is 0 |
| `cancelled` | The file has lines but none are active, **or** `cancelledAt` is set |

Travel dates are derived from the earliest and latest segment or service dates across active lines.

### 7.3 Payment status of a file (derived, `status/payment-status.ts`)

Computed from `fileTotals` (§8.3):

| Chip | Rule | Colour |
|---|---|---|
| `—` | charges = 0 | grey |
| **Unpaid** | received = 0 and charges > 0 | red |
| **Partial** | 0 < received < charges | amber |
| **Paid** | received = charges | green |
| **Credit** | received > charges (money is owed back to the client) | violet |

Add an **Overdue** badge when balance > 0 and `dueAt` has passed. Rules for `dueAt`:
- **Individuals:** the earlier of the ticketing time limit and the first travel date, otherwise the invoice date.
- **Corporates:** invoice date + `paymentTermsDays`.

---

## 8. Money rules

### 8.1 Money helpers (`domain/money.ts`)

- Integers only (`amountMinor`). Never use floats for stored money.
- Helpers: `add`, `sub`, `mul(money, factor)` (rounds half-up to the minor unit), `isZero`, `compare`, `sum(list)`, `convert(money, to, fxRate)`, `format(money)`.
- **Formatting:** TZS with no decimals and thousands separators (`TZS 1,250,000`); USD with 2 decimals (`USD 1,450.00`).
- Mixed-currency arithmetic throws unless converted first.
- **FX:** a single `USD_TZS` rate in settings. Every conversion that affects stored data captures the rate used (for example `Payment.fxRate`). Reports that total across currencies convert at the **current** rate and show "Converted at 1 USD = TZS 2,xxx".

### 8.2 Pricing (`domain/pricing.ts`)

```
flight cost  = fare.totalFare − (fare.totalFare × commissionPct)   // non-flight: cost is typed
vatBase      = serviceFee (+ markup, if settings.vatBase = 'service_fee_and_markup')
vat          = round(vatBase × vatRate)
sell         = cost + markup + serviceFee + vat
margin       = markup + serviceFee   (VAT is not margin)
```

- A line's pricing currency is usually the supplier's currency; a flight's is its fare currency. The file has one invoicing currency. Totals in the file's currency convert lines at the rate saved on the line when it was priced (`pricing.fxToFile`, add this field if the currencies differ).
- `serviceFee` defaults from `settings.defaultServiceFee[type]` when a line is created, and can be edited.
- If `sell < cost` (only possible with a negative markup), only a Manager can save, and a reason is required (`overrideBelowCost`).

### 8.3 File totals (`selectors/fileTotals.ts`)

```
charges  = Σ sell of lines in {booked, issued, completed, refund_pending}
         + Σ retained charges from approved refunds (supplierPenalty + agencyFee + vat [+ original markup + fee if not waived])
received = Σ allocations to this file from payments (in, not reversed)
         − Σ allocations from payments (out, not reversed)
balance  = charges − received          // > 0 client owes us; < 0 we owe client
cost     = Σ cost of the same lines (+ supplierPenalty for refunded lines)
margin   = Σ (markup + serviceFee) of the same lines + agencyFee from refunds
supplierOwed = Σ cost of issued/completed lines − Σ supplier payment allocations
```

Quoted lines appear on quotes but never in `charges`.

### 8.4 Ledger (`domain/ledger/*`)

The ledger is hidden from agents. It is the accounting truth for issued business and must always balance.

**Chart of accounts**

| Code | Name | Subledger |
|---|---|---|
| 1100 | Cash, bank and mobile money | money_account |
| 1200 | Client receivables | client |
| 2100 | Supplier payables | supplier |
| 2300 | VAT payable | — |
| 4100 | Service fee revenue | — |
| 4200 | Markup revenue | — |
| 4300 | Refund and change fee revenue | — |
| 5xxx | Expenses (one code per `ExpenseCategory`, e.g. 5100 rent … 5900 other) | — |

**Posting rules.** Each row is one balanced entry group, in the transaction's currency.

| Event | Debit | Credit |
|---|---|---|
| Line **issued** | 1200 client: `sell` | 2100 supplier: `cost` · 4200: `markup` · 4100: `serviceFee` · 2300: `vat` |
| Payment **in** recorded | 1100 account: amount | 1200 client: amount |
| Payment **out** (client refund) | 1200 client | 1100 account |
| Payment **reversed** | exact mirror of the original group | |
| Line **voided** | exact mirror of the issue group | |
| Refund **approved** | (a) mirror of the issue group, then (b) 1200 client: `supplierPenalty + agencyFee + vatOnAgencyFee (+ markup + serviceFee if not waived)` | (b) 2100 supplier: `supplierPenalty` · 4300: `agencyFee` · 2300: `vatOnAgencyFee` · (if not waived) 4200: `markup`, 4100: `serviceFee` |
| Supplier payment | 2100 supplier | 1100 account |
| Expense | 5xxx category | 1100 account |

**Invariant tests** (must pass):
- Every group: Σ debit = Σ credit per currency.
- Client balance from the ledger (1200 by client, issued business only) matches `fileTotals` for fully issued files.
- A void followed by the ledger view nets the line to zero.

**Receivables vs. commercial balance.** A client can pay a deposit before a ticket is issued. The ledger shows this as a credit on 1200; the booking screen shows it through `fileTotals`. Both are correct views; label them clearly in reports.

### 8.5 Refund calculation

A refund is created from an issued (or completed) line. The agent enters:

- `supplierPenalty`: from the airline's fare rules; in the future, from Amadeus.
- `agencyFee`: defaults to `settings.defaultServiceFee.service_fee`, editable.
- `waiveOriginalFees`: Manager only; default false.

```
vatOnAgencyFee = round(agencyFee × vatRate)
supplierCredit = cost − supplierPenalty
retained       = supplierPenalty + agencyFee + vatOnAgencyFee + (waive ? 0 : markup + serviceFee + vat)
clientRefund   = sell − retained     // must be ≥ 0; if negative, block with an explanation
```

Approval limit: convert `clientRefund` to TZS. If it is at or below `refundApprovalLimit`, an Accountant or Manager can approve; above it, only a Manager. Show who can approve on the request.

### 8.6 Exchange (date or route change)

1. The agent creates an exchange request on an issued flight: new segments, `supplierPenalty` (the airline change fee), additional fare collection and an agency change fee.
2. On approval:
   - The original line → `exchanged`. **No reversal**: the original ticket value stays and is carried into the new ticket.
   - A new flight line is created with `exchangedFromLineId` set. Its `cost = additionalFare + supplierPenalty`, its service fee is the agency change fee, and it starts `booked`. The agent then enters the new ticket number and issues it, which posts normally.

---

## 9. Screen specifications

General rules for all screens:
- Every list shows **empty states** with a primary action.
- Every table has a search box, filters, column sorting, pagination (25 rows) and **Export CSV** (roles permitting).
- All forms use zod schemas and inline errors, and disable submit while invalid.
- Every destructive action (void, cancel, reverse, delete) opens a confirm dialog that repeats the consequences in plain words, including amounts.

### 9.1 Home (`/`)

A role-specific layout. It always starts with a **"Needs attention"** list: each item shows an icon, one sentence, the related booking and a one-click action.

**Attention rules** (`selectors/attention.ts`):

| Rule | Shown to |
|---|---|
| Ticketing time limit within 48 h on a `booked` flight | Agent (own files), Manager |
| Departure within 7 days and balance > 0 | Agent (own), Accountant, Manager |
| Quote older than 3 days, still `draft` | Agent (own) |
| Payment `recorded` but not verified for more than 24 h | Accountant, Manager |
| Refund request awaiting a decision (split by limit) | Accountant (≤ limit), Manager (all) |
| Approved refund not yet paid out | Accountant, Manager |
| Supplier lines unpaid past the supplier's terms | Accountant, Manager |
| Corporate client over their credit limit | Accountant, Manager |
| Issued flight inside its void window (today) | Agent (own) — information: "Void closes at 23:59" |
| Invoice outdated (lines changed after the invoice was issued) | Agent (own) |

**Below the list, by role:**
- **Agent:** my sales this month (count, value, margin), my open bookings, quick actions (New booking, Paste PNR, Record payment).
- **Accountant:** cash position per money account (from the ledger plus opening balances), total receivables and overdue, total payables, today's receipts by method.
- **Manager:** KPI cards (sales, margin, cash, receivables, payables, this month vs. last month), a 30-day sales and margin line chart, sales by agent (bar chart), top clients, plus everything the accountant sees.

### 9.2 Bookings list (`/bookings`)

- **Quick tabs:** All · Drafts · Confirmed · Unpaid · Departing soon (7 days) · Travelled · Cancelled
- **Columns:**
  - File no.
  - Client
  - Title/route
  - Services (small type icons with a count)
  - Travel dates
  - Agent
  - Status chip
  - Total
  - Balance chip (payment status)
- **Filters:** agent, service type, payment status, date range (created or travel), source.
- Clicking a row opens the booking.

### 9.3 New booking (`/bookings/new`)

A three-step wizard. **"Save as draft"** is available on every step.

1. **Client**
   - Search an existing client by name or phone, or create one inline (name, phone and type are the minimum).
   - Select travellers from the client's list, or add new ones (title, given name, surname, pax type; passport optional).
   - Pick the file currency (defaults to the client's default).
   - Pick the source.
2. **Services**
   - Add one or more lines. For flights, three options:
     - **Enter manually:** a form.
     - **Paste PNR:** a textarea with a parse preview (§11.4).
     - **Fetch from Amadeus:** enabled only when `integrations.amadeus.mode ≠ 'off'`; the agent enters a record locator and the provider fills the form.
   - A running total panel shows cost, markup, service fee, VAT, sell and margin.
3. **Review and deposit**
   - A summary of everything.
   - An optional "Record deposit now", which opens the same form as §9.8.
   - Choose "Create quote" or "Create booking". Both create the file; "Create quote" also issues a Quote document and offers Print or WhatsApp.

### 9.4 Booking detail (`/bookings/[id]`)

**Header:**
- File number, client (linked), title (editable inline), agent avatar, status chip, payment chip, travel dates.
- **Primary actions:** Record payment · Add service · Issue invoice · More.
- **More menu:** Print itinerary, Print quote, Share on WhatsApp, Reassign (Manager), Cancel booking.

**Right rail (sticky on desktop):**
- Money summary: charges, received, balance (large), margin, supplier owed.
- Due date and an overdue badge.
- Ticketing time limit countdown, if any flight is `booked`.

**Tabs:**

1. **Services** (default)
   - One card per line, in chronological order of service date.
   - **Flight card:**
     - A segment timeline (carrier logo placeholder, flight number, city pair, local times, +1 marker, class, status code).
     - PNR with a copy button, office ID, validating carrier.
     - A passenger list with ticket numbers.
     - Fare summary, baggage.
     - A **source badge** (Manual / Amadeus) and last synced time.
   - **Hotel, car and other cards:** key fields, confirmation number, dates, supplier.
   - Every card shows a status chip and a pricing row (expand for the breakdown), plus **context actions by status**:
     - `quoted`: Edit · Mark booked · Cancel
     - `booked`: Edit · Issue (flight: opens a ticket number entry per passenger) · Cancel
     - `issued`: Void (flight, window open, with a countdown) · Request refund · Request exchange (flight) · Mark completed
     - `refund_pending`: View request
     - Terminal statuses: view only, with a status history popover.
   - A line editor opens in a **right drawer** with the type-specific form.
2. **Travellers:** the travellers on the file, with passport expiry warnings (under 6 months from the return date) and quick edit.
3. **Payments:** all allocations to this file (in and out), each showing its number, method, reference, status chip (recorded / verified / reversed) and actions by role. Refund requests are listed here too.
4. **Documents:** issued invoices and quotes (current and superseded), receipts, itinerary. Each has Print, Download PDF (browser print to PDF) and Share on WhatsApp.
5. **Activity:** the audit events for this file, newest first.

### 9.5 Line editor forms (drawer)

- **Flight:**
  - Record locator, office ID (defaults from settings), validating carrier.
  - Segments as a repeatable group; airport and airline fields autocomplete from the reference data.
  - Passengers mapped from the file's travellers; `nameInPnr` is auto-generated as `SURNAME/GIVEN TITLE` and editable.
  - Fare: base fare, taxes (optional rows), total, commission %.
  - Baggage, ticketing time limit.
  - Pricing: markup, service fee; VAT, sell and margin are read-only.
- **Hotel:** hotel, city, check-in and check-out (nights computed), rooms repeater, board, confirmation number, cancellation policy text and free-cancel-until date, supplier, pricing.
- **Car, transfer, tour, visa and insurance:** the fields from §6.2, plus supplier and pricing.
- **Service fee:** reason and amount. Cost = 0; everything is margin.

### 9.6 Clients (`/clients`, `/clients/[id]`)

- **List columns:** name, type, phone, bookings count, last booking, balance chip. Tabs: All · Individuals · Corporates · Owing.
- **Client detail:**
  - Profile card (editable).
  - For corporates, a credit usage bar (outstanding vs. limit).
  - **Travellers** sub-list.
  - **Bookings** table.
  - **Statement:** a chronological list of invoice-issue events and payments with a running balance, a date range filter, and "Print statement".

### 9.7 Payments (`/payments`)

- **Tabs:**
  - **Received** (direction `in`)
  - **Refunds** (refund requests and payouts)
  - **Unverified** (Accountant and Manager landing tab)
- **Received columns:** receipt no., date, client, booking(s), method, account, reference, amount, status, recorded by.
- **Refund requests list:** request no., booking, line summary, client refund amount, "Needs Manager" badge if above the limit, status, requested by, age.
  - **Decide drawer:** shows the quote breakdown, the original line pricing, supplier penalty, retained amount and client refund; Approve / Reject with a note.
  - Rows that are approved but unpaid show a **"Pay out"** button, which opens a payment-out form (account, method, reference).

### 9.8 Record payment (modal, available everywhere)

- **Client** (required).
- **Allocations:**
  - For **individuals**, pick one booking; the default amount is the balance.
  - For **corporates**, an allocation table lists all open bookings with their balances: tick bookings and type amounts, or click "Auto-allocate oldest first". This is how a corporate pays a whole statement in one payment.
- **Amount and currency.** If the currency differs from a booking's currency, show the FX rate used (editable by Accountant or Manager only) and the converted amount.
- **Method, account** (filtered by currency; mobile money methods suggest mobile money accounts), **reference** (required unless cash), date and time, fiscal receipt no. (optional), note.
- **Footer:** "Balance before → after" for each allocated booking.
- **On save:** show the receipt number, with **Print receipt** and **Share on WhatsApp** buttons.

### 9.9 Money out (`/money-out`)

- **Suppliers tab:**
  - Columns: supplier, kind, currency, owed, overdue, last payment.
  - A banner at the top for the air settlement supplier (BSP Tanzania or the consolidator per settings) showing tickets issued this period, their value, voids, refunds and net owed.
- **Supplier detail** (`/money-out/suppliers/[id]`):
  - **Open items** (issued lines with unpaid cost, oldest first): booking, line, service date, cost, paid, remaining, days outstanding.
  - A **"Pay supplier"** form with allocation (same pattern as §9.8).
  - Payment history.
- **Supplier payments tab:** a list of all supplier payments.
- **Expenses tab:**
  - List with filters: category, account, date range, payee.
  - **"Record expense"** form: category, payee, amount, currency, account, date, note, attachment (file name only, with a note that uploads will be stored once the backend exists).
  - A monthly total per category is shown above the list.

### 9.10 Reports (`/reports`, `/reports/[slug]`)

The index is a grid of report cards. Every report has a date range (presets: Today, This week, This month, Last month, This year, Custom), an agent filter where relevant, a currency display toggle, a summary strip, a chart where useful, a table, **Export CSV** and **Print**.

| Slug | Report | Contents |
|---|---|---|
| `my-sales` | My sales (all roles; agents see only their own) | Files and lines issued in the period: count, sell, margin; by service type |
| `sales` | Sales | Issued lines by day/week/month; breakdowns by agent, service type, client, airline. Bar and line charts |
| `profit` | Profit by booking | Per file: charges, cost, margin, margin %; totals; sortable to find thin or negative margin |
| `airline-sales` | Airline sales | By validating carrier: tickets issued, voided, refunded, fare total, commission, net. Feeds BSP or consolidator settlement |
| `receivables` | Who owes us (aging) | Per client and file: balance by bucket (Not due, 0–30, 31–60, 61–90, 90+ days past due); totals; click through to the client |
| `payables` | What we owe | Per supplier: open cost by aging bucket |
| `cash-book` | Cash book | Per money account: opening, money in, money out, closing; transaction list with a running balance |
| `receipts` | Receipts by method | Totals by payment method and by account; verification status |
| `voids-refunds` | Voids and refunds | Every void, refund and exchange: dates, amounts, penalties, agency fees, who approved |
| `expenses` | Expenses | By category and month; bar chart; list |
| `pnl` | Simple profit and loss | Revenue (4100 + 4200 + 4300) − expenses (5xxx) = net, by month. VAT excluded. Labelled "management view, not statutory accounts" |
| `bsp-period` | Air settlement period | Tickets issued, voided and refunded in a chosen settlement period, with document numbers. **Stretch:** upload a BSP billing CSV and match it by ticket number, highlighting mismatches |

### 9.11 Settings (`/settings/[tab]`)

Tabs, visible by role:

- **Company:** name, TIN, VRN, address, phone, email, logo upload (stored as a data URL), and the payment instructions text printed on invoices.
- **Users:** list, add, edit role, deactivate (Manager). Signing in as a deactivated user is blocked.
- **Money accounts:** add or edit accounts and opening balances.
- **Suppliers:** full list with add and edit (also reachable from Money out). Choose which supplier is the **air settlement** supplier and whether the mode is BSP or consolidator.
- **Fees and tax:** VAT rate, VAT base, default service fee per line type, refund approval limit, void window.
- **Currency:** the USD→TZS rate, with its last-updated time and user.
- **Numbering:** a prefix and padding per series, with a preview.
- **Integrations:** the Amadeus card:
  - Mode selector: Off / Mock / Live (Live disabled, with a "Available after API contract" tooltip).
  - Environment, Office ID.
  - Mock options: latency slider (0–3000 ms) and failure mode.
  - A **"Test connection"** button that calls `provider.ping()`.
  - A read-only table showing the planned Amadeus operation for each back-office action (from §11.5).
- **Audit log:** a filterable list of all audit events (actor, action, entity, date).
- **Demo data:** "Reset demo data" (Manager) with a confirm dialog.

### 9.12 Print documents (`/print/[doc]/[id]`)

A clean A4 layout using print CSS (`@page { size: A4; margin: 14mm }`). It auto-opens `window.print()` when `?autoprint=1` is set. Documents:

- **Quote** and **Invoice:**
  - Header: logo, company details, TIN and VRN.
  - Document number, dates, due date.
  - Client block.
  - Lines: description, travellers, amount.
  - Subtotal, service fees, VAT, total, paid to date, **balance due**.
  - Payment instructions.
  - Footer: "Prices subject to availability until ticketed" (quotes only).
- **Receipt:** receipt number, date, client, amount in figures and words, method and reference, allocated bookings, balance remaining, fiscal receipt no. (if entered), received by.
- **Itinerary** (the agency's e-ticket summary):
  - Travellers and ticket numbers, PNR.
  - Each segment with local times, terminal placeholder, baggage.
  - Hotels, transfers and cars, each with its confirmation number.
  - Agency 24/7 contact line.
- **Client statement:** period, opening balance, transactions, closing balance.

**WhatsApp share** (`lib/whatsapp.ts`): opens `https://wa.me/<E.164 phone without +>?text=<encoded>` with a short message. For example: *"Hello Peter, your booking AP-2026-000123 (Dar → Dubai, 12 Oct) is confirmed. Balance due: USD 1,120.00. Receipt RCT-2026-00045."* In the prototype there are no document links (no hosting); add a TODO to include signed PDF links once the backend exists.

---

## 10. Key flows (step by step)

### Flow A: walk-in client, flight booked in the Amadeus terminal
1. The agent presses **N**, searches for the client by phone and creates them if new.
2. The agent adds a flight line with **Paste PNR**: they copy the PNR display from the Amadeus terminal and paste it. The parser previews the passengers, segments and ticketing time limit; the agent maps the passengers to travellers and confirms.
3. The agent sets markup and service fee; sell and margin update live.
4. The line goes straight to `booked`, because the PNR has HK segments.
5. The agent records a deposit (M-Pesa, with reference). The payment chip becomes **Partial**.
6. The agent issues the invoice and shares it on WhatsApp.
7. Once paid, the agent issues the ticket in Amadeus, then clicks **Issue** on the line and enters the ticket numbers (or re-pastes the PNR, which now contains FA lines, and the numbers fill in). The line becomes `issued` and the ledger posts.
8. The accountant sees the payment under Unverified, checks the M-Pesa statement and verifies it.

### Flow B: same-day void
The agent opens an issued flight whose void window is still open and clicks **Void**. The confirm dialog shows the amount that will be reversed. The line becomes `voided`, the charges drop, and if the client has paid, the chip shows **Credit**. The attention list then prompts: "Refund client or keep as credit".

### Flow C: refund above the limit
The agent requests a refund on an issued ticket (USD 1,450, penalty USD 200, agency fee TZS 50,000 converted to USD). The client refund is above TZS 500,000, so the request shows a "Needs Manager" badge. The accountant can see it but not approve it. The manager approves it; the line becomes `refunded` and the ledger posts. The accountant pays it out from CRDB USD. The file balance returns to 0 and the status is `cancelled` (or `closed`).

### Flow D: corporate on credit
A corporate client has four confirmed files this month. Its credit usage shows at 80%. At month end, the accountant records one bank transfer and auto-allocates it oldest first across the four files. The aging report and the client statement update.

### Flow E: paying the air settlement supplier
At the end of the settlement period, the accountant opens the BSP/consolidator supplier, reviews the open ticket lines, and pays the net amount with allocations. Payables drop and the cash book shows the payment.

### Flow F: expense
The accountant records office rent, internet and GDS fees. The expenses report and the P&L update.

### Flow G: Amadeus mock
The manager sets Integrations to **Mock**. The agent chooses **Fetch from Amadeus** and enters `Z8K4QM`; after the simulated latency the form is filled from the fixture, with the source badge "Amadeus". With failure mode `not_found`, a friendly error appears with **Retry** and **Enter manually instead**. `timeout` and `auth_error` show their own messages.

---

## 11. Provider layer (Amadeus-ready)

### 11.1 Interface (`providers/types.ts`)

```ts
export interface PnrSnapshot {
  recordLocator: string;
  officeId?: string;
  createdAt?: ISODateTime;
  passengers: { pnrPaxNo: number; surname: string; givenName: string; title?: Title; paxType: PaxType; dateOfBirth?: ISODate }[];
  segments: (Omit<FlightSegment, 'cabin'> & { cabin?: FlightSegment['cabin'] })[];
  ticketingTimeLimit?: ISODateTime;
  tickets: { pnrPaxNo: number; ticketNumber: string; carrier: string; currency?: Currency; amount?: number; issuedAt?: ISODate }[];
  contacts: { type: 'phone' | 'email'; value: string }[];
  raw: string;                          // original text or payload
  warnings: string[];                   // parse warnings shown to the user
}

export interface TravelProvider {
  readonly id: 'manual' | 'amadeus-mock' | 'amadeus';
  ping(): Promise<{ ok: boolean; message: string }>;
  retrievePnr(recordLocator: string): Promise<PnrSnapshot>;
  // Stubs in the prototype: throw NOT_SUPPORTED with a clear message, except in the mock
  issueTicket(recordLocator: string): Promise<{ tickets: PnrSnapshot['tickets'] }>;
  voidDocument(documentNumber: string): Promise<{ ok: true }>;
  refundQuote(ticketNumber: string): Promise<{ supplierPenalty: Money; refundable: Money }>;
  readQueue(queue: string): Promise<{ recordLocator: string; reason: string }[]>;
}

export class ProviderError extends Error {
  constructor(public code: 'NOT_FOUND' | 'TIMEOUT' | 'AUTH' | 'NOT_SUPPORTED' | 'UNKNOWN', message: string) { super(message); }
}
```

`getProvider(settings)` returns the implementation for `settings.integrations.amadeus.mode`.

### 11.2 Manual provider
`retrievePnr` throws `NOT_SUPPORTED("Amadeus is not connected. Use Paste PNR or enter the flight manually.")`. `ping` returns `{ ok: false, message: 'Manual mode' }`.

### 11.3 Amadeus mock provider
- Loads fixtures from `providers/amadeus-mock/fixtures/*.json`, keyed by record locator. Include at least 4 fixtures:
  - a booked return trip (no tickets)
  - a ticketed family trip (three passengers, including a child)
  - a multi-city trip with a connection
  - a PNR containing an infant
- Applies `mock.latencyMs` and `mock.failure`. `random` fails about 30% of calls with a random code.
- `issueTicket` returns generated ticket numbers using the airline's 3-digit prefix (reference data) and a random 10-digit serial, which is useful for demos.
- `voidDocument` succeeds; `refundQuote` returns a penalty of 15% of the fare; `readQueue` returns 2–3 locators from the fixtures.

### 11.4 PNR paste parser (`providers/pnr-parser/parse.ts`)

`parsePnr(text: string, now: Date): PnrSnapshot` is a pure function that tolerates messy input (extra spaces, lower case, pagination lines, `)>` prompts). It never throws: unknown lines are ignored, and missing essentials produce `warnings`.

**Sample input** (store as `samples/ticketed-family.txt`; also create `booked-return.txt`, `multi-city.txt` and `infant.txt`):

```
RP/DARTZ2100/DARTZ2100            GK/SU  28SEP26/0812Z   Z8K4QM
  1.MWAKALINGA/PETER MR   2.MWAKALINGA/ANNA MRS
  3.MWAKALINGA/DAVID MSTR(CHD/12MAR17)
  4  EK 726 Y 12OCT 1 DARDXB HK3  1650 2305   12OCT  E  EK/Z8K4QM
  5  EK 725 Y 26OCT 1 DXBDAR HK3  1020 1500   26OCT  E  EK/Z8K4QM
  6 AP DAR 255754000111 - H
  7 APE PETER@EXAMPLE.COM
  8 TK OK28SEP/DARTZ2100
  9 FA PAX 176-2401234567/ETEK/USD1450.00/28SEP26/DARTZ2100/00000000/S4-5/P1
 10 FA PAX 176-2401234568/ETEK/USD1450.00/28SEP26/DARTZ2100/00000000/S4-5/P2
 11 FA PAX 176-2401234569/ETEK/USD1120.00/28SEP26/DARTZ2100/00000000/S4-5/P3
```

A booked, unticketed PNR has `TK TL05OCT/DARTZ2100` instead of `TK OK…` and has no FA lines.

**Extraction rules** (implement with regexes plus line classification):

| Element | Pattern (indicative) | Output |
|---|---|---|
| Header | `^RP\/([A-Z0-9]{9})\/` and the last 6-character token of the line | `officeId`, `recordLocator` |
| Names | `(\d+)\.([A-Z' -]+)\/([A-Z ]+?)\s+(MR\|MRS\|MS\|MSTR\|MISS)?(\((CHD\|INF)[^)]*\))?` — several per line | passengers with a sequential `pnrPaxNo`; CHD date in `(CHD/12MAR17)` → `dateOfBirth`; `(INF…)` inside a name → an additional INF passenger |
| Air segment | `^\s*(\d+)\s+([A-Z0-9]{2})\s?(\d{1,4}[A-Z]?)\s+([A-Z])\s+(\d{2}[A-Z]{3})\s+\d\s+([A-Z]{3})([A-Z]{3})\s+([A-Z]{2})(\d{1,2})\s+(\d{4})\s+(\d{4})(\+\d)?` | a segment; date without a year → the **next occurrence** on or after the PNR creation date (or `now`) |
| Ticketing | `TK TL(\d{2}[A-Z]{3})` → time limit (end of day local) · `TK OK` → already ticketed | `ticketingTimeLimit` |
| Tickets | `FA PAX (\d{3})-?(\d{10})\/ET([A-Z0-9]{2})\/([A-Z]{3})([\d.]+)\/(\d{2}[A-Z]{3}\d{2}).*\/P(\d+)` | tickets mapped to `pnrPaxNo` |
| Contacts | `AP[EM]?\s+(.+)` | contacts |

**Mapper** (`mappers/pnr-to-flight-line.ts`):
- Converts a `PnrSnapshot` into a draft `FlightDetails`.
- Infers the cabin from the booking class, using an editable map in reference data (F/A → first; J/C/D/I/Z → business; W/P → premium economy; everything else economy).
- Infers `tripType`: return if the first origin equals the last destination; multi-city if there is more than one gap; otherwise one-way.
- Sets `validatingCarrier` from the FA line, otherwise the first segment's carrier.
- The UI then asks the agent to **map each PNR passenger to a traveller** (auto-matched on surname and given name, or created as new).

**Preview UI:** before saving, show the parsed table (passengers, segments, tickets), any warnings in amber, and a "Raw text" disclosure. The agent can edit before confirming. `external.rawPayload` stores the original text.

**Tests:** each sample file has a snapshot test. Add edge cases: lower-case input, extra blank lines, a missing header (warning), a segment crossing midnight (`+1`), and an infant.

> The indicative patterns above must be validated against real PNR displays from the agency's own Amadeus terminal before go-live. Keep all patterns in one file with tests, so adjusting them is cheap.

### 11.5 Future mapping to the real Amadeus Enterprise APIs

For `providers/amadeus/README.md` and the Integrations table. Confirm the exact operation names and versions against the Enterprise documentation provided under the contract.

| Back-office action | Planned Amadeus operation (Enterprise, SOAP) |
|---|---|
| Fetch PNR / refresh line | `PNR_Retrieve` |
| Create or modify booking elements | `PNR_AddMultiElements` |
| Price and store fare | `Fare_PricePNRWithBookingClass` → `Ticket_CreateTSTFromPricing` |
| Issue ticket | `DocIssuance_IssueTicket` |
| Display ticket / history | `Ticket_ProcessEDoc` / `Ticket_DisplayTST` |
| Void | `Ticket_CancelDocument` |
| Refund quote and process | Automated refund (ATC Refund) family: initiate, update and process refund |
| Exchange eligibility and reissue | ATC eligibility check and ATC reissue family |
| Queue polling (no webhooks) | `Queue_List` and queue processing, on a scheduled job |
| Flight search (Phase 3) | `Fare_MasterPricerTravelBoardSearch` → `Air_SellFromRecommendation` |
| Alternative data feed | **AIR files** (Amadeus Interface Records) pushed on issuance → importer → `importFromProvider` |

**Rules the real adapter must follow later:**
- Run only on the server (credentials and session handling). Screens keep calling the same `TravelProvider` methods through server actions.
- Every sync writes `external.lastSyncedAt` and `syncStatus`, and never silently overwrites agent-edited pricing. If the airline data differs, set `syncStatus: 'drift'` and show a "Review changes" diff.
- Imports are idempotent: ticket numbers are unique across all lines, and a duplicate import updates the existing line rather than creating a new one.

---

## 12. UX and visual design

- **Tone:** calm, dense and professional. It is a tool people use for eight hours a day.
- **Colour:**
  - Primary `#488FF5`.
  - Neutral slate greys.
  - Status colours: green = paid or issued; amber = partial or pending; red = unpaid, overdue or error; violet = credit; grey = draft or cancelled.
  - Support light and dark mode through CSS variables.
- **Type:** the existing font, or Inter. Tabular numerals (`font-variant-numeric: tabular-nums`) for every amount column.
- **Amounts:** right-aligned, always with the currency code.
- **Dates:** `12 Oct 2026`, times `16:50`. Flight times are always shown airport-local, labelled with the airport code.
- **Chips:** one component (`StatusChip`) used everywhere, driven by a status → style map.
- **Drawers vs. pages:** create and edit service lines and payments in drawers or modals; full pages for lists and details.
- **Feedback:** toasts for success, and inline banners for blocking errors with the reason in plain words (for example: *"Only a Manager can approve refunds above TZS 500,000."*).
- **Speed:** optimistic UI is unnecessary because everything is local; keep interactions instant.
- **Accessibility:**
  - Full keyboard navigation and visible focus rings.
  - Labels on every input.
  - Contrast AA.
  - Chips carry text, not only colour.
- **Empty states:** a friendly line and a primary action (for example "No bookings yet — Create the first one").

---

## 13. Reference data (`store/seed/reference.ts`)

- **Airports** (code, city, country, timezone): Tanzania: DAR, ZNZ, JRO, ARK, MWZ, DOD, TBO, MYW. Region and beyond: NBO, MBA (Mombasa), EBB, KGL, ADD, JNB, DXB, DOH, IST, AMS, LHR, CDG, FRA, BOM, CAN, JED, MCT, CAI. *Validate every code and timezone before seeding; remove any you cannot confirm.*
- **Airlines** (code, name, 3-digit ticket prefix where known): TC Air Tanzania, PW Precision Air, KQ Kenya Airways (706), ET Ethiopian (071), QR Qatar Airways (157), EK Emirates (176), TK Turkish Airlines (235), KL KLM (074), MS EgyptAir (077), WB RwandAir, FZ flydubai. *Leave prefixes blank where unconfirmed; the Manager can edit them in Settings (add an "Airlines" sub-tab).*
- **Booking class → cabin map** (§11.4).
- **Expense categories** with account codes (§8.4).
- **Payment methods** with labels: Cash, Bank transfer, M-Pesa, Airtel Money, Mixx by Yas, HaloPesa, Card, Cheque.

---

## 14. Seed data (`store/seed/generate.ts`)

All dates are **relative to the moment of seeding**, so the demo always looks current (for example, `addDays(now, 5)`). Use a fixed random seed so every reset produces the same data.

- **Users (4):**
  - Neema Mushi — Agent
  - Baraka Lema — Agent
  - Peter Mwakalinga — Accountant
  - Grace Kimaro — Manager

  Emails `firstname@aeropath.co.tz`; any password.
- **Company:** Aeropath Travel Ltd, Dar es Salaam, placeholder TIN and VRN (`000-000-000`), payment instructions text.
- **Settings:** FX `USD_TZS = 2,600` (editable; mark it as a demo value), VAT 18% on the service fee, refund limit TZS 500,000, same-day void, air settlement = consolidator (change to BSP in Settings), Amadeus mode `off`.
- **Money accounts (7):** Cash box TZS, Cash box USD, CRDB TZS, CRDB USD, NMB TZS, M-Pesa Till (TZS), Airtel Money (TZS), each with an opening balance.
- **Suppliers (10):** the air consolidator (air settlement), BSP Tanzania (inactive until mode = BSP), 3 hotels (Dar, Zanzibar, Arusha), 2 car hire companies, 1 transfer company, 1 visa agent, 1 insurance provider.
- **Clients (15):** 12 individuals and 3 corporates (one with its credit limit nearly used, one overdue, one healthy). Each has 1–4 travellers, some with passports expiring soon.
- **Bookings (~28),** covering every state:
  - 4 drafts (quotes), one older than 3 days
  - 5 booked flights, 2 with a ticketing time limit inside 48 h
  - 8 issued and fully paid; 3 issued and partially paid; 2 issued and unpaid, departing within 7 days
  - 3 travelled and closed
  - 1 voided today (client in credit)
  - 1 refund pending above the limit; 1 refund approved but not paid out; 1 refunded and paid
  - 1 exchanged flight with its replacement issued
  - At least 4 multi-service files (flight + hotel + transfer), 2 hotel-only, 1 car-only, 1 visa + insurance
  - Flights split roughly 60% USD and 40% TZS; hotels mostly USD; transfers TZS
- **Payments:** about 40 in, across all methods; 3 unverified for more than 24 h; 1 reversed. One corporate bulk payment allocated across 3 files.
- **Supplier payments:** about 8, including one consolidator settlement.
- **Expenses:** about 25 over the last 3 months across categories.
- **Ledger and audit:** generate them by running the **real commands** in sequence from the seed script, not by writing entries directly. This proves that the commands and postings work together.

---

## 15. Validation rules (zod), summarised

- **Phone:** E.164 or local Tanzanian format (`0XXXXXXXXX` → `+255XXXXXXXXX`); store normalised.
- **Record locator:** `^[A-Z0-9]{6}$` (uppercase automatically).
- **Ticket number:** `^\d{3}-?\d{10}$`; store as `ddd-dddddddddd`. It must be unique across all lines, excluding voided lines, whose numbers remain reserved and appear in search.
- **IATA codes:** airport `^[A-Z]{3}$` and airline `^[A-Z0-9]{2}$`, validated against the reference data (with a warning, not a block, if unknown).
- **Names on travellers:** uppercase letters, spaces, hyphens and apostrophes.
- **Money:** amounts ≥ 0, except markup, which may be negative only with a Manager override.
- **Dates:** check-out after check-in; arrival after departure (allowing a day offset); passport expiry warning if under 6 months from the last travel date.
- **Payment allocations:** the sum must equal the payment amount after FX, within 1 minor unit.

---

## 16. Testing

**Domain tests (vitest), required:**
- The line machine: every allowed and every forbidden transition.
- Pricing, VAT and rounding.
- Every ledger posting and the balance invariant.
- `fileTotals` across all seeded files.
- Refund calculation, including the limit rules.
- The permission matrix: one test per matrix row per role.
- The PNR parser: all sample files and edge cases.
- The seed runs clean, with zero failed commands.

**UI smoke tests:** optional (Playwright) for Flows A, C and D.

---

## 17. Build milestones and acceptance

Complete these in order. Each milestone ends with a short summary of what changed and how to verify it.

| # | Milestone | Done when |
|---|---|---|
| **M0** | Archive branch and cleanup | The `archive/marketplace-prototype` branch exists; all routes and code in §2.1 are removed; the app builds with no dead imports; `/` redirects to `/login` |
| **M1** | Domain layer | Types, money, pricing, machines, ledger, permissions and commands are implemented; the §16 domain tests pass |
| **M2** | Store and seed | Zustand store with persist; the seed generator runs the real commands; "Reset demo data" works; the seed produces zero command errors |
| **M3** | Shell | Login with demo users, sidebar, top bar, route guards, `/forbidden`, command palette and global search |
| **M4** | Clients | List, detail, create and edit, travellers, statement |
| **M5** | Bookings | List with tabs and filters, the three-step wizard, detail page with all tabs, line drawers for every type, transitions, the PNR paste parser with preview |
| **M6** | Payments and documents | Record payment (single and corporate allocation, FX), verify, reverse; invoice, quote and receipt issuance; print pages; WhatsApp share |
| **M7** | Voids, refunds and exchanges | Void with countdown, refund request and approval with limits, payout, the exchange flow |
| **M8** | Money out | Supplier balances, supplier detail with open items, pay supplier with allocation, expenses |
| **M9** | Home and reports | Role dashboards, attention rules, all reports in §9.10 with CSV export and print |
| **M10** | Settings and integrations | All settings tabs, the Amadeus mock provider with failure modes and the mapping table, the audit log |
| **M11** | Polish | Empty states, mobile at 390 px, keyboard shortcuts, dark mode, accessibility pass |

### Final acceptance: demo script (must all work end to end)

1. As **Neema (Agent)**, create a booking for a new walk-in client, paste `ticketed-family.txt` with the tickets removed, set the fee, and record an M-Pesa deposit → the file is **Partial**.
2. Issue the invoice and open the WhatsApp share.
3. Issue the ticket numbers → the line is `issued`; the ledger groups balance.
4. As **Peter (Accountant)**, verify the payment, record the final payment in USD cash with FX → **Paid**; print the receipt.
5. As Neema, void a ticket issued today → charges drop and the file shows **Credit**.
6. As Neema, request a refund above the limit → Peter can see it but **cannot** approve; as **Grace (Manager)**, approve it; as Peter, pay it out → the balance is 0.
7. As Peter, allocate one corporate bank transfer across three files; the aging report updates.
8. As Peter, pay the consolidator for open ticket lines; the payables and cash book reports update.
9. As Peter, record an expense; the P&L updates.
10. As Neema, try to open `/money-out` and the reports other than My sales → `/forbidden`; try to price below cost → blocked.
11. As Grace, switch Amadeus to Mock, then as Neema **Fetch from Amadeus** `Z8K4QM` → the line is prefilled with an "Amadeus" badge; set failure = `timeout` → a friendly error with Retry and a manual fallback.
12. As Grace, choose Reset demo data → everything returns to the seed.

---

## 18. Out of scope for this prototype (do not build)

- A real database, authentication, email or SMS sending, file uploads
- Real Amadeus calls (mock only), and flight search or shopping
- A customer-facing site or portal
- Supplier portal or logins
- Real TRA EFD/VFD integration (a manual receipt number field only)
- Statutory accounting (the P&L is a management view only)
- Multi-branch or multi-company support

## 19. Notes for the backend phase (for later, not now)

- Move `DbState` tables to Postgres (recommended for ledger integrity), with one table per record type; `LedgerEntry` becomes append-only.
- Commands become server actions or API handlers behind a repository interface. Keep the same inputs and outputs.
- Add real authentication (email and password with TOTP for staff), row-level audit, and file storage for attachments and PDFs.
- Replace `amadeus-mock` with the server-side `amadeus` provider, plus a scheduled worker for queue polling and AIR file import.
- Integrate TRA VFD for fiscal receipts, and mobile money collection APIs if wanted.
