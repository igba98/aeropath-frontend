---
version: 1
slug: "src-app"
primary_target: "src/app"
related_targets: []
---

# Surface brief: Aeropath back office (whole app shell and screens)

Scope: every staff screen under src/app (login, home, bookings, clients, payments, money out, reports, settings, print). Mode: Operate.

Audience and job: Agents, Accountants and a Manager at an air-ticketing agency in Dar es Salaam, all day on office desktops (often wide monitors), sometimes a phone. Jobs: capture a booking fast (Paste PNR leads), take money, see who owes what, pay suppliers, read the business.

Constraints: brand #488FF5, slate neutrals, status colours per PRODUCT.md, light and dark, tabular numerals, amounts right-aligned with the currency code, dates 12 Oct 2026, times 16:50 airport-local.

User-pinned (2026-09-29, replaces the Timetable Grid world after "the ui design is really bad"): shadcn components throughout (Sidebar, Card, Table, Badge, Tabs, Chart), Montserrat from Google Fonts, comfortable larger text (body 15px, tables 14px, page titles 26px), tables that become readable cards on phones, layouts that use the width of large screens. Keep the current shadcn setup (no re-init). Craft bar: shadcn dashboard blocks, Stripe Dashboard, Linear, Vercel dashboard.

## Direction contract

THESIS: The category standard, executed at the craft level of Stripe, Linear, Vercel and the shadcn dashboard blocks: an inset sidebar app with white cards on a soft grey canvas, clear hierarchy, generous comfortable type, and money that reads at a glance. It refuses the cramped 13px sheet, hairline-only screens and horizontal-scrolling tables of the previous build.

OWN-WORLD: Soft cool-grey canvas (#f4f6f9) with the shadcn sidebar on the canvas and content in a white inset panel; white cards with a 1px slate border, 12px radius and a barely-there shadow; Montserrat for all text (600-700 headings, 500 labels, 400 body) with tabular figures on amounts; JetBrains Mono only for PNR, ticket and IATA codes; brand #488FF5 as the primary fill family (#1b64d1 for AA with white text), focus ring and active nav; status as rounded pill badges with a dot (green, amber, red, violet, grey, blue).

STORY: Staff land on a dashboard that shows today's work and the numbers that matter, move through a sidebar that never gets in the way, and every list reads like Stripe: scannable table on desktop, tidy cards on a phone, with actions exactly where the eye expects them.

FIRST VIEWPORT: Inset shadcn sidebar (brand, seven sections with counts, user at the foot). Header row with sidebar toggle, breadcrumb, search (⌘K), TZS/USD toggle and New booking. Home: greeting and quick actions, a row of four to six KPI cards (label, big tabular value, trend badge, one-line footnote), then a two-column grid on wide screens: "Needs attention" card (two thirds) beside "Departing in 7 days" and "Today's receipts" cards (one third).

FORM: Canon (user-chosen category standard, pinned by the user's brief; no roll). Reference products: shadcn dashboard blocks, Stripe Dashboard, Linear, Vercel dashboard. Previous seed key ef4ea0d5 retired. Signature interaction: data tables that reflow into labelled cards below md and add columns as width grows, so no screen ever scrolls sideways.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Unresolved

- Airline ticket prefixes for TC, PW, WB, FZ left blank until confirmed.
