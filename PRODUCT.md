# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Staff of Aeropath Travel Ltd, an air-ticketing travel agency in Dar es Salaam. Three roles only:

- **Agent** (ticketing and sales): serves walk-in, phone, WhatsApp and email clients; creates bookings, records payments received, issues tickets. Books in the Amadeus terminal first, then copies the PNR display into the back office. Paste PNR is the primary way flights enter the system; manual entry is the fallback.
- **Accountant** (finance): verifies payments, pays suppliers, records expenses, approves refunds up to the limit.
- **Manager** (owner or lead): everything, plus approvals above the limit, overrides, users, settings and integrations.

They use it all working day, mostly on office desktops, sometimes on a phone (must work at 390 px).

## Product Purpose

A staff-only back office that answers five questions at any moment: what have we booked and for whom; who has paid and who still owes us; what do we owe suppliers (BSP or consolidator, hotels, car hire, others); what did we spend; how much did we make.

This phase is a working frontend prototype with no database: all state lives in the browser, but domain logic (commands, state machine, double-entry ledger, permissions) is structured so a real database and the Amadeus Enterprise APIs can plug in later without rewriting screens. Full build spec: `aeropath-backoffice-spec.md`.

## Positioning

Amadeus-shaped from the ground up: flights are stored the way Amadeus represents them (record locator, segments with status codes, FA ticket lines), so a pasted terminal PNR today and an API response tomorrow map 1:1 into the same booking file. Simple on the surface, rigorous underneath: a double-entry ledger, a line state machine and an audit log run invisibly.

## Operating Context

- Clients walk in, call, WhatsApp or email; staff act on their behalf.
- Flights are booked in the Amadeus terminal, then the PNR text is pasted in; ticket numbers come from FA lines or are typed.
- Money: TZS and USD, one editable USD→TZS rate; cash, bank transfer, M-Pesa, Airtel Money, Mixx by Yas, HaloPesa, card, cheque.
- Documents go to clients by print (A4) and WhatsApp share links (`wa.me`).
- Air settlement goes to BSP Tanzania or a consolidator; refunds above TZS 500,000 need a Manager.
- Timezone Africa/Dar_es_Salaam; flight times are airport-local.

## Capabilities and Constraints

- Next.js App Router (this repo's version has breaking changes; read `node_modules/next/dist/docs/`), TypeScript strict, Tailwind v4, shadcn/radix, zustand persist, react-hook-form + zod, date-fns, cmdk, sonner, lucide.
- No backend, no real auth, no uploads, no real Amadeus calls (mock provider only), no customer-facing site, no supplier portal, no statutory accounting.
- Permissions are enforced in the domain layer, not only by hiding buttons.
- Every destructive action confirms in plain words with amounts.
- Seed data is demo data and must be labelled as such (FX rate, TIN/VRN placeholders).

## Brand Commitments

- Name: Aeropath (company: Aeropath Travel Ltd). Owner: Centered Studios.
- Brand colour `#488FF5`, neutral slate greys, status colours: green paid/issued, amber partial/pending, red unpaid/overdue/error, violet credit, grey draft/cancelled.
- Tone: calm, dense and professional; a tool people use for eight hours a day.
- Light and dark mode via CSS variables. Tabular numerals on every amount; amounts right-aligned with the currency code.
- Dates `12 Oct 2026`, times `16:50`.

## Evidence on Hand

- Spec with sample PNR (`Z8K4QM`, Mwakalinga family, EK 726/725 DAR–DXB), seeded users (Neema Mushi, Baraka Lema, Peter Mwakalinga, Grace Kimaro), seeded suppliers, accounts and clients (all synthetic).
- No real client data, logos of airlines, or real TIN/VRN; placeholders only.

## Product Principles

1. Attention first: the home screen lists what needs action today, each with a one-click action.
2. One booking, one screen: everything about a trip lives on the booking file.
3. Money is always visible: every booking, client and supplier shows a balance.
4. Fast capture: the fewest fields to get started, sensible defaults, paste over typing.
5. Plain-words safety: illegal actions are blocked with the reason and who can do it.

## Accessibility & Inclusion

Full keyboard navigation with visible focus, labels on every input, WCAG AA contrast, chips carry text not only colour. Keyboard shortcuts: N new booking, P record payment, / search, ⌘K palette.
