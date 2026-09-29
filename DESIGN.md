---
name: Aeropath Back Office
description: Staff back office for an air-ticketing agency, built as a category-standard shadcn dashboard at Stripe, Linear and Vercel craft.
colors:
  brand-50: "#eef4fe"
  brand-100: "#dce9fd"
  brand-200: "#bbd4fb"
  brand-300: "#8db8f8"
  brand-400: "#488ff5"
  brand-500: "#2a78ea"
  brand-600: "#1b64d1"
  brand-700: "#1752ab"
  brand-800: "#16438a"
  brand-900: "#142f5c"
  paper: "#ffffff"
  canvas: "#f4f6f9"
  canvas-2: "#edf0f4"
  sidebar-accent: "rgb(255 255 255 / 0.1)"
  table-head: "#f8fafc"
  band: "#eef4fe"
  band-hover: "#f7f9fc"
  ink: "#0f172a"
  ink-2: "#334155"
  ink-3: "#52607a"
  ink-4: "#626e84"
  rule: "#e6e9ef"
  rule-2: "#d6dce5"
  rule-strong: "#cfd6e0"
  destructive: "#c4321f"
  destructive-hover: "#a8281a"
  st-green-bg: "#e8f7ef"
  st-green-fg: "#127347"
  st-green-bd: "#c6ebd6"
  st-amber-bg: "#fff4e0"
  st-amber-fg: "#8a4f00"
  st-amber-bd: "#f6dcae"
  st-red-bg: "#fdecec"
  st-red-fg: "#b42318"
  st-red-bd: "#f7cdca"
  st-violet-bg: "#f3effe"
  st-violet-fg: "#5b3cc4"
  st-violet-bd: "#ddd3fa"
  st-grey-bg: "#f1f4f8"
  st-grey-fg: "#475569"
  st-grey-bd: "#e0e5ec"
  st-blue-bg: "#eaf2fe"
  st-blue-fg: "#1752ab"
  st-blue-bd: "#cadcfb"
  chart-1: "#488ff5"
  chart-2: "#1e3a8a"
  chart-3: "#93b4e6"
  chart-4: "#12a26a"
  chart-5: "#e0a100"
typography:
  headline:
    fontFamily: "Montserrat, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif"
    fontSize: "26px"
    fontWeight: 700
    lineHeight: "36px"
    letterSpacing: "-0.02em"
  kpi-value:
    fontFamily: "Montserrat, ui-sans-serif, system-ui, sans-serif"
    fontSize: "26px"
    fontWeight: 700
    lineHeight: "32px"
    letterSpacing: "-0.02em"
    fontFeature: "\"tnum\", \"lnum\""
  title:
    fontFamily: "Montserrat, ui-sans-serif, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 600
    lineHeight: "24px"
    letterSpacing: "-0.015em"
  body:
    fontFamily: "Montserrat, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.55
  control:
    fontFamily: "Montserrat, ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: "20px"
  label:
    fontFamily: "Montserrat, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: "20px"
    letterSpacing: "0"
  badge:
    fontFamily: "Montserrat, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: 1
  code:
    fontFamily: "JetBrains Mono, ui-monospace, SF Mono, Menlo, monospace"
    fontSize: "13.5px"
    fontWeight: 400
    letterSpacing: "0.01em"
    fontFeature: "\"zero\""
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "12px"
  2xl: "16px"
  full: "9999px"
spacing:
  card-inset: "20px"
  page-x-phone: "16px"
  page-x-tablet: "24px"
  page-x-desktop: "32px"
  page-x-wide: "40px"
  section-gap: "24px"
  section-gap-desktop: "32px"
  header-height: "64px"
  control-height: "36px"
  row-height: "56px"
  row-height-dense: "48px"
  table-head-height: "44px"
components:
  button-primary:
    backgroundColor: "{colors.brand-600}"
    textColor: "{colors.paper}"
    typography: "{typography.control}"
    rounded: "{rounded.lg}"
    padding: "0 16px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "{colors.brand-700}"
  button-outline:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "0 16px"
    height: "36px"
  button-outline-hover:
    backgroundColor: "{colors.canvas}"
  button-secondary:
    backgroundColor: "{colors.canvas-2}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    height: "36px"
  button-ghost-hover:
    backgroundColor: "{colors.canvas-2}"
    textColor: "{colors.ink}"
  button-destructive:
    backgroundColor: "{colors.destructive}"
    textColor: "{colors.paper}"
    rounded: "{rounded.lg}"
    height: "36px"
  input:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.lg}"
    padding: "4px 12px"
    height: "36px"
  input-readonly:
    backgroundColor: "{colors.canvas}"
  filter-select-applied:
    backgroundColor: "{colors.band}"
    textColor: "{colors.brand-700}"
    rounded: "{rounded.lg}"
    height: "32px"
  card:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "20px"
  card-title:
    typography: "{typography.title}"
    textColor: "{colors.ink}"
  table-head-row:
    backgroundColor: "{colors.table-head}"
    textColor: "{colors.ink-3}"
    typography: "{typography.label}"
    height: "44px"
  table-row-hover:
    backgroundColor: "{colors.band-hover}"
  table-row-selected:
    backgroundColor: "{colors.band}"
  tabs-pill-track:
    backgroundColor: "{colors.canvas-2}"
    textColor: "{colors.ink-3}"
    rounded: "{rounded.xl}"
    padding: "4px"
  tabs-pill-active:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    height: "36px"
  tabs-line-active:
    textColor: "{colors.ink}"
    height: "44px"
  segmented-track:
    backgroundColor: "{colors.canvas-2}"
    rounded: "{rounded.lg}"
    padding: "4px"
  segmented-active:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "28px"
  status-chip-green:
    backgroundColor: "{colors.st-green-bg}"
    textColor: "{colors.st-green-fg}"
    typography: "{typography.badge}"
    rounded: "{rounded.full}"
    height: "24px"
    padding: "0 10px"
  status-chip-amber:
    backgroundColor: "{colors.st-amber-bg}"
    textColor: "{colors.st-amber-fg}"
    rounded: "{rounded.full}"
  status-chip-red:
    backgroundColor: "{colors.st-red-bg}"
    textColor: "{colors.st-red-fg}"
    rounded: "{rounded.full}"
  status-chip-violet:
    backgroundColor: "{colors.st-violet-bg}"
    textColor: "{colors.st-violet-fg}"
    rounded: "{rounded.full}"
  status-chip-grey:
    backgroundColor: "{colors.st-grey-bg}"
    textColor: "{colors.st-grey-fg}"
    rounded: "{rounded.full}"
  status-chip-blue:
    backgroundColor: "{colors.st-blue-bg}"
    textColor: "{colors.st-blue-fg}"
    rounded: "{rounded.full}"
  badge-count:
    backgroundColor: "{colors.canvas-2}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  nav-item:
    textColor: "{colors.ink-2}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    height: "40px"
  nav-item-active:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
  stat-card:
    backgroundColor: "{colors.paper}"
    rounded: "{rounded.xl}"
    padding: "20px"
  stat-card-value:
    typography: "{typography.kpi-value}"
    textColor: "{colors.ink}"
---

# Design System: Aeropath Back Office

## Overview

**Creative North Star: "The Well-Run Counter"**

Aeropath is the category-standard SaaS dashboard, done with care: an inset shadcn sidebar sitting on a soft cool-grey canvas, content in one white inset panel, and white cards with a hairline border, a 12px radius and a shadow you only notice when it's missing. The craft references are the shadcn dashboard blocks, Stripe Dashboard, Linear and the Vercel dashboard. The form is Canon: familiar on purpose. Agents, accountants and a manager spend their whole working day in it, so anything they have to learn is a cost.

Type is comfortable, not cramped. Montserrat carries every word at 15px body, 14px in tables and controls, and 26px bold for page titles. Money is what the page is about: every amount is right-aligned, uses tabular figures and carries a small, quieter currency code. Colour is rationed. Brand blue marks the primary action, focus, the active tab line and applied filters. The six status tones always mean a state (pills, trend badges, notices, severity icons), never decoration.

The system is responsive by construction rather than by exception. No list ever scrolls sideways. Tables become labelled cards below `lg` and gain columns at `xl` and `2xl`, and filters move into a bottom sheet on small screens. Light and dark themes share one set of role tokens.

**Key Characteristics:**
- A Route Blue app shell (the inset sidebar and the frame around the content), with the white inset panel floating on it; the panel has a sticky, translucent 64px header.
- White cards (12px radius, 1px rule, near-flat shadow, 20px insets) on the cool-grey canvas.
- Montserrat for all UI, and JetBrains Mono only for machine codes.
- Tabular, right-aligned amounts with a small currency code.
- A status on a record is always a tinted pill with a dot and a text label. Colour never carries meaning on its own.
- Every table reflows into labelled cards below `lg`.

## Colors

A cool slate neutral system carrying one saturated blue, with six soft status tints kept inside badges.

### Primary
- **Route Blue** (brand-400): the brand hue. Used for the focus ring, the input caret, the focused-input border and chart series 1. In dark theme it becomes the primary fill.
- **Deep Route Blue** (brand-600): the primary fill in light theme (buttons, primary badge, user avatar tile, active nav icon, selected check). It is one step deeper than the brand so that white labels pass AA.
- **Deep Route Blue Hover** (brand-700): primary hover. Also the text of an applied filter and of an active tab's count.
- **Selection Band** (band): the tint behind an applied filter, a selected row, a focused select item and an active tab's count.

### Neutral
- **Canvas** (canvas): the app background under the sidebar, read-only and disabled fields, the search trigger and outline-button hover.
- **Canvas 2** (canvas-2): pill-tab and segmented tracks, secondary buttons, count badges, ghost hover and empty-state icon circles.
- **Paper** (paper): the inset panel, cards, inputs, popovers and the active pill.
- **Table Head** (table-head): the soft band behind table header rows and totals rows.
- **Band Hover** (band-hover): hover on clickable table rows and linked stat cards.
- **Ink** (ink): headings, values and primary text.
- **Ink 2** (ink-2): secondary text, nav labels and ghost buttons.
- **Ink 3** (ink-3): muted text such as column heads, descriptions, page meta and currency codes. It was darkened to reach 4.5:1 on paper and canvas.
- **Ink 4** (ink-4): placeholders, phone-card field labels and the empty-amount dash. It was also darkened to reach 4.5:1.
- **Rule** (rule): card borders, row dividers, the header's bottom edge and the line under tab lists.
- **Rule 2** (rule-2): input and outline-button borders, popover borders and the totals-row top rule.

### Status tones
Each tone is a bg / fg / bd triplet (green, amber, red, violet, grey, blue). They are used in Badge variants, in Notice callouts (info=blue, warn=amber, error=red, success=green, each with a 1px tone border and an 8px radius), in the severity icon circles of the attention list, in allocation-check strips and in the day tiles of departing trips. Green means paid, issued, verified or settled. Amber means partial, pending, unverified or owed. Red means unpaid, overdue or error. Violet means credit or needs a manager. Grey means draft, cancelled or neutral. Blue means booked, confirmed or current. **Destructive** (destructive, with destructive-hover) is the fill for destructive buttons and the red of invalid fields.

### Charts
Chart series come from chart-1 to chart-5 (brand blue, navy, pale blue, green, amber). In dark theme chart-2 and chart-3 are re-stepped for contrast. Series are identified with round 10px legend dots.

### Dark theme
The same role names are remapped under `.dark` (full values are in the sidecar). The canvas is near-black navy, paper is a raised navy, and ink runs light. Primary becomes Route Blue with dark (#0b1220) label text, and links become brand-300. Status tones flip to dark tinted fills with light foregrounds.

### Named Rules
**The State-Only Colour Rule.** A status tone always states something: a record's status (pill), a change (trend badge), a message (Notice), an urgency (attention icon, overdue age or amount, warn/bad KPI value). It is never decorative, and a card or table row is never flooded with a status fill. The state is always also written in words.

**The Deep-Fill Rule.** Primary fills with white text use brand-600, never brand-400, in light theme. Brand-400 belongs to focus, charts and the dark theme.

## Typography

**Body Font:** Montserrat (weights 400, 500, 600 and 700), falling back to ui-sans-serif and system-ui
**Mono Font:** JetBrains Mono (weights 400, 500 and 600), falling back to ui-monospace, SF Mono and Menlo

**Character:** a geometric sans used at comfortable sizes, with a clear weight ladder. Hierarchy comes from weight and size, never from uppercase or tracking. Mono is a tool for codes, not a voice.

### Hierarchy
- **Headline** (700, 26px/36px, -0.02em): page titles and the home greeting. There is one per screen.
- **KPI value** (700, 26px/32px, tabular): stat-card figures from `sm` up. On phones they drop to 17px/24px.
- **Title** (600, 17px/24px): card and section titles, drawer and standalone-table headings.
- **Body** (400, 15px, 1.55): base text, page meta, phone-card lead lines and line tabs (600).
- **Control** (400 to 600, 14px/20px): table cells, inputs, selects, buttons (600), pill tabs and card descriptions.
- **Label** (600, 13px/20px, ink-3, sentence case): table column heads and select group labels. KPI labels are 13 to 14px at 500.
- **Badge** (600, 12px): status pills and trend badges. The plain Badge base is 13px at 500.
- **Code** (JetBrains Mono, 13.5px, +0.01em, slashed zero, no ligatures): file numbers, PNRs, ticket numbers, receipt numbers and IATA routes. It is always `whitespace-nowrap`.

### Named Rules
**The Sentence-Case Rule.** Column heads, labels, tabs and buttons are in sentence case at their natural tracking. Nothing in the UI chrome is uppercase.

**The Machine-Code Rule.** JetBrains Mono is used only for codes a machine issued (file no., PNR, ticket, receipt, IATA) and for inputs that take such codes. It never wraps. Prose, names and amounts stay in Montserrat.

**The Tabular Money Rule.** Every figure that lines up (amounts, counts, trends, pagination) uses tabular lining numerals.

## Layout

**Shell.** A shadcn Sidebar (inset variant, 15.5rem wide, collapsible to icons, a sheet on phones) on the Route Blue shell (`--sidebar` #123f86; navy #0b1b3a in dark). Content lives in a white inset panel that from `md` has an 8px margin, a 12px radius and a soft deep shadow instead of a border. The panel's header is sticky and 64px tall, with paper at 90% opacity and a backdrop blur. It holds, from left to right: the sidebar toggle, the section name (`lg` and up), the search trigger (⌘K), the TZS/USD switch (`md` and up), Record payment (`lg` and up, hidden where the page owns that action) and New booking.

**Page rhythm.** Main padding is 16px on phones, 24px from `sm`, 32px from `lg` and 40px at `2xl`. Top padding is 24px, or 32px from `lg`. Pages stack their blocks with a 24px gap, or 32px from `lg`. The page header has 24px beneath it and holds the title, one meta line and actions aligned to the bottom right.

**Using the width.** Dashboards use a 1-column grid that becomes three columns at `xl`, with the main card spanning two. KPI cards sit two per row on phones, then three or four at `xl`, and six across at `2xl`.

### Named Rules
**The No-Sideways-Scroll Rule.** Below `lg` every DataTable renders each row as a labelled card. The lead column sits top left and the right-aligned amount top right; the other columns form a two-column `dl` with 12px ink-4 labels. From `lg` it is a real table, and columns marked `hideBelow: "xl" | "2xl"` appear as the screen widens. Print always shows every column.

**The Filters-Sheet Rule.** Table filters sit inline from `lg`. Below `lg` they collapse behind one outline "Filters" button with a brand count, which opens a bottom sheet (16px top radius) with full-width controls, "Clear filters" and "Show results".

**The Stacked-Meta Rule.** Page meta items sit in a row separated by aria-hidden dots. On phones (below `sm`) they stack one per line and the dots are hidden.

**The One-Currency-Switch Rule.** The header's TZS/USD segmented switch is the single source of truth for display currency. Totals and KPIs read it from the shared store. Where the header hides it (reports on phones), a mirror switch writes the same setting. Per-record currency pickers in forms are data entry, not display.

## Elevation & Depth

This is a flat, tonal system with whisper shadows. Depth comes mostly from paper on canvas and a 1px rule. Shadows only confirm the layer.

### Shadow Vocabulary
- **Card** (`0 1px 2px rgb(15 23 42 / 0.04), 0 1px 1px rgb(15 23 42 / 0.02)`): every card, stat card and the inset panel's rest state.
- **Pop** (`0 4px 6px -2px rgb(15 23 42 / 0.05), 0 12px 32px -8px rgb(15 23 42 / 0.18)`): select menus, dropdowns and popovers.
- **Drawer** (`-16px 0 48px -16px rgb(15 23 42 / 0.24)`): right-side sheets and drawers.
- **Control lift** (`0 1px 2px rgb(15 23 42 / 0.04–0.05)`): inputs and outline buttons. The primary button adds an inner bottom edge of `inset 0 -1px 0 rgb(0 0 0 / 0.12)`.
- **Active pill** (`0 1px 3px rgb(15 23 42 / 0.12)`): the active pill tab and segmented option.

### Named Rules
**The Whisper Rule.** Resting surfaces never cast a visible drop shadow. Only floating layers (popovers and drawers) use a real one.

## Shapes

The corners are soft and consistent. Cards, the inset panel, the pill-tab track and dropdown menus use 12px (xl). Buttons, inputs, selects, pill triggers and the segmented track use 10px (lg). Small buttons, icon buttons and segmented options use 8px (md). Bottom sheets use a 16px top radius. Badges, status pills, count badges, avatars and legend dots are fully round. Borders are 1px throughout. The line-tab indicator is a 2px bottom border, and the totals row has a 2px top rule.

## Components

### Buttons
Buttons are confident and quiet.
- **Shape:** 10px radius, 36px tall. Small buttons are 32px with an 8px radius, extra-small 28px, and large 44px at 15px.
- **Primary:** Deep Route Blue fill, white label at 14px/600, with a 1px drop and an inner bottom edge. Hover goes to brand-700.
- **Outline:** paper with a rule-2 border and a control lift. Hover goes to canvas and active to canvas-2. This is the default for secondary page actions such as Paste PNR and Export CSV.
- **Secondary / Ghost:** secondary is canvas-2 fill. Ghost is ink-2 text with a canvas-2 hover and is used for card-header links like "All →". Danger-ghost is destructive text on a red tint.
- **Focus:** a 2px outline in Route Blue, offset 2px. Disabled is 45% opacity.

### Status chips
Status chips are Badge tones with a dot. They are 24px tall, fully round, 12px/600, with a tinted fill, a matching 1px border, the tone's foreground and a 6px `currentColor` dot before the label. Cancelled, void and reversed states strike through their label. One namespaced map (`line.*`, `file.*`, `pay.*`, `payment.*`, `refund.*`, `doc.*`) drives every label and tone.

### Trend badges
Trend badges are also Badge tones: 24px, 12px/600, with an arrow icon (up-right, down-right or a minus when flat). Green means the move is good, red that it is bad, and grey is flat or neutral. `invert` flips the meaning for payables, where up is bad. `neutral` greys out figures that are neither, such as receivables. The format is "+12%" or "−4.5%" with a true minus sign, one decimal under 100% and whole numbers from 100% up. Each badge carries an sr-only comparison label.

### Amounts
Amounts are tabular and nowrap, with the currency code first at 0.78em, 500 weight, wide tracking and ink-3, so the figures line up. Amount columns are right-aligned, and the totals row repeats them in 600. The `auto` tone turns negatives to the red status foreground. A missing value shows an ink-4 dash.

### Cards / Containers
- **Corner Style:** 12px.
- **Background:** paper on canvas (or on the paper inset panel, separated by the rule).
- **Shadow Strategy:** Card shadow (see Elevation).
- **Border:** 1px rule.
- **Internal Padding:** 20px on all sides. The header wraps its actions under the title when space runs out.
- **Section:** a card with a 17px title, an optional count badge, an optional description and actions at the right. A DataTable inside a Section renders flush to the card edges rather than nesting a second card.
- **Stat card:** a 13 to 14px ink-3 label with an optional icon, the KPI value and the trend badge at the top right, plus a 13px footnote. When linked, hover shifts the border to rule-2 and the fill to band-hover. Padding is 14px on phones.

### Tables
Tables are roomy and in the Stripe manner. The header row sits on the table-head band at 44px with 13px/600 ink-3 sentence-case heads, and sortable heads show an arrow on hover. Rows are 56px (48px dense), with 1px rule dividers and 20px outer insets. Clickable rows get a band-hover hover and a band focus/selected state. Pages hold 25 rows, with a "Showing 1–25 of N" footer and outline icon pagination. The toolbar holds a 320px search input with an icon, filters and a right-aligned outline "Export CSV".

### Tabs
- **Line variant (page sections):** a full-width row with a rule underline and a 24px gap. Triggers are 44px at 15px/600, and the active tab gets a 2px primary bottom border and ink text. Counts sit in a count badge that turns band / brand-700 when active. The active tab syncs to `?tab=`.
- **Pill variant (quick views):** a canvas-2 track with a 12px radius and 4px padding. Triggers are 36px at 14px/600, and the active one is a white pill with the active-pill shadow. Counts are plain tabular 13px ink-4 figures. Pill tabs filter a list elsewhere on the page through `aria-controls`.
- **Segmented control:** a smaller cousin of the pill tabs (28px options) for two to four choices, such as TZS | USD, period or currency.

### Inputs / Fields
- **Style:** paper, 1px input (rule-2) border, 10px radius, 36px tall, 14px text, ink-4 placeholder, control lift. Hover tints the border towards ink-4. Read-only and disabled fields sit on canvas.
- **Focus:** the border goes to Route Blue with a 3px Route Blue halo at 22%.
- **Error:** a destructive border with a 3px destructive halo at 16%.
- **Applied filter:** a filter select or date button moved off "all" takes a brand-300 border, band fill, 600 weight and brand-700 text, so applied filters read at a glance.

### Navigation
**Sidebar.** The sidebar sits on Route Blue.
- **Header:** the Aeropath logo (`public/aeropathlogo.png`, the round sky-blue badge with the "A", plane and wave) at 36px with a 2px white ring and a soft shadow, then "Aeropath" in white 16px/700 and "Travel back office" in sidebar-muted.
- **Groups:** Workspace, Finance and Admin, with 11px/600 uppercase labels at 0.06em in sidebar-muted.
- **Items:** 40px at 15px/500 in sidebar-foreground with 18px sidebar-muted icons. Hover gives a 10% white wash. The active item is a white pill with brand-800 600 text, a brand-600 icon and a small drop shadow.
- **Counts:** 15% white badges that turn brand-50 / brand-700 on the active item.
- **Sections with sub-pages** (Accounting) open as a Collapsible dropdown with a rotating chevron. Sub-items are 32px at 14px on a hairline rail; the active one is a white pill. The dropdown is open while you are inside the section. When the sidebar is collapsed to icons, the section becomes a plain link.
- **Footer:** the demo-data note on an 8% white chip, and the user menu with a white initials tile.

**Breadcrumbs** (shadcn Breadcrumb) replace back links on every page: Home (house icon) › section › … › the current page.
- The crumbs are 14px/500 ink-3 links that hover to brand-700. The current page is 600 ink-2, and the separators are ink-4 chevrons.
- `PageHeader` works the trail out from the URL, the sidebar map and its `back` prop; pages pass `crumbs` when they need a deeper trail. On phones the middle crumbs hide, leaving Home › parent › page.

**Sign in.** The left half is a photo showcase:
- Travel photographs crossfade every 7 seconds with a slow zoom, under a Route Blue wash (bottom-up gradient to #07193d).
- The logo sits at 48px with a white ring. One headline and one line of product promise per slide, in white at 36px/700, with pill dot controls.
- The zoom and auto-advance stop under reduced motion and pause on hover.
- On phones, a 160px photo banner with the logo sits above the form.

**Logo and icons.** `BrandMark` renders the logo everywhere: the sidebar, sign-in, loading screens and printed documents (when no company logo is uploaded in Settings). The favicon (`src/app/favicon.ico`, 16/32/48), `icon.png` and `apple-icon.png` are the same badge.

### Empty states
Empty states show a 48px canvas-2 circle with an ink-3 icon, one 15px/600 line, an optional 14px ink-3 body and the action that fixes it.

### Search and book (consumer patterns)
The `/book` flow is built for someone who has never seen a PNR, so it borrows the airline and hotel app patterns and keeps the back-office tokens.
- **Search tiles:** each search field is a 68px tile with a 12px radius and a rule-2 border. It has an ink-3 icon, a 12px/600 label and the value at 16px/600, with a 13px sub-line underneath. The field opens a popover: the airport or place list (Tanzania first), a calendar (two months from md), or +/− counters. Five tiles share one row from lg; trip type and the 48px Search button sit on the row below.
- **Flight result:** a boarding-card layout on a 16px-radius card:
  - the airline logo tile (white, rule border) with the airline name and aircraft, and the duration top-right;
  - departure and arrival times at 28px/600 tabular with the plane between them, and the codes and cities beneath;
  - a dashed rule, then the date and stops on the left and the price on the right.
  - Tag badges (Best value violet, Cheapest green, Fastest blue) sit beside the price. Low seat counts show in red under it.
- **Date strip:** seven day buttons showing the lowest fare for each day. The cheapest day's price is in green, and the selected day uses the band and brand ring.
- **Details sheet:** a right sheet (full screen on phones). It shows:
  - a centred logo, the big times and a dashed timeline showing the duration;
  - a four-cell facts grid;
  - legs with layovers in an amber note;
  - fare radio cards (band fill and brand ring when chosen) listing bags, changes and refund;
  - one full-width primary button that names the next step and the price.
- **Steps:** numbered progress (a green check when done, a primary circle for the current step). On phones it collapses to "Step n of N · name".
- **Checkout:** cards for the chosen trip, the client (existing or new) and the travellers, with a sticky price card on the right from lg. The travellers card offers saved travellers as chips and asks for the title explicitly. The price card lists fare, fee, VAT and total, has an invoice-currency switch and a full-width "Book now · amount".
- **Booked:** a green check circle, one headline sentence, the reference numbers in mono, the deadline in an amber note (a green note for free cancellation), the next actions as large buttons, and a cross-sell card (hotel after a flight, flight after a hotel).

## Do's and Don'ts

### Do:
- **Do** put content on paper cards (12px, 1px rule, Card shadow, 20px insets) inside the white inset panel.
- **Do** build every list with DataTable, with `hideBelow: "xl" | "2xl"` on secondary columns and `mobile: "title" | "aside"` where the defaults guess wrong.
- **Do** wrap table filters in ResponsiveFilters and use FilterSelect so that applied filters get the brand tint.
- **Do** use line tabs for page sections and pill tabs for quick views of one list.
- **Do** render every amount through Amount (right-aligned, tabular, small code first) and every state through StatusChip.
- **Do** read display currency from the header switch's store value.
- **Do** keep column heads at 13px/600 ink-3 in sentence case.

### Don't:
- **Don't** let a table scroll sideways on any screen.
- **Don't** use a status tone as decoration or as a whole card or table-row fill. Put the state in a pill or Notice, with words.
- **Don't** set UI labels, column heads or tabs in uppercase or tracked out. The only natively tracked text is the small currency code, and uppercase appears only in passport-style traveller names and code inputs.
- **Don't** use JetBrains Mono for names, prose or amounts, and don't let a code wrap.
- **Don't** use brand-400 as a fill behind white text in light theme.
- **Don't** add a second display-currency control that keeps its own state.
- **Don't** give resting surfaces a visible drop shadow.
