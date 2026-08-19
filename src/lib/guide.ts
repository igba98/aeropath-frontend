/**
 * The in-product user guide.
 *
 * One entry per console screen, written for the person who has to use it rather than the person
 * who built it: what the screen is for, what each control actually does, what the table columns
 * mean, and where the sharp edges are. The console header reads this by route, so the help a
 * user sees is always the help for the screen they are on.
 */

export interface GuideAction {
  /** The control as it is labelled on screen. */
  label: string;
  /** What pressing it does, in plain language. */
  does: string;
  /** Who is allowed, when it differs from simply being on the screen. */
  who?: string;
}

export interface GuideColumn {
  header: string;
  means: string;
}

export interface GuideEntry {
  /** Route this describes. */
  href: string;
  title: string;
  /** One sentence: why this screen exists. */
  purpose: string;
  /** How to read the screen, top to bottom. */
  reading?: string[];
  actions?: GuideAction[];
  columns?: GuideColumn[];
  /** Things that surprise people. */
  watchOut?: string[];
}

export interface GuideSection {
  id: string;
  title: string;
  blurb: string;
  entries: GuideEntry[];
}

export const GUIDE: GuideSection[] = [
  {
    id: "operations",
    title: "Operations",
    blurb:
      "Everything that needs a human between a payment landing and a traveller boarding. Operations owns the gap between what the customer has paid for and what the supplier has confirmed.",
    entries: [
      {
        href: "/admin",
        title: "Ops dashboard",
        purpose: "The single view of everything the operations desk owes someone an answer on today.",
        reading: [
          "The nine tiles are live counts from the booking store, not cached figures. A number in red or amber is past a deadline.",
          "The table beneath is the same queue as the Booking queue screen, cut to the most urgent items.",
          "Urgency is the supplier SLA deadline first, then hold expiry, then travel date — so the thing that goes wrong soonest is always on top.",
        ],
        actions: [
          { label: "Open the queue", does: "Goes to the full booking queue with no filter applied." },
          { label: "New manual booking", does: "Starts a booking on behalf of a walk-in or telephone customer." },
          { label: "Any tile", does: "Opens the queue already filtered to that tile's items." },
        ],
        watchOut: [
          "Counts include items from every supplier and channel. Filter on the queue screen if you only own one region.",
        ],
      },
      {
        href: "/admin/ops/queue",
        title: "Booking queue",
        purpose: "The working list. Every item that cannot proceed without a person doing something.",
        columns: [
          { header: "Booking", means: "The reference the customer quotes, plus who booked and through which channel." },
          { header: "Item", means: "The specific product and rate plan — one booking can have several items in the queue." },
          { header: "Status", means: "Where this item is in the booking state machine." },
          { header: "Also", means: "Any extra reason it is queued that the status does not already say. An em-dash means the status is the whole story." },
          { header: "Goes late", means: "When it breaches. Plain text while there is time, red once breached or within three minutes." },
          { header: "Travel", means: "The travel date — an item breaching today for travel tomorrow is far more urgent than one for next month." },
          { header: "Value", means: "The sell price of the item, so you can triage by exposure." },
        ],
        actions: [
          { label: "Filter chips", does: "Narrows to one reason. The count on each chip is live.", who: "Anyone with queue access." },
          { label: "Chase", does: "Sends the supplier a reminder against that item and records it on the booking timeline.", who: "Only enabled for items still waiting on a supplier." },
          { label: "A row", does: "Opens the full booking, where you can force confirm, amend, cancel or refund." },
        ],
        watchOut: [
          "Chasing does not extend the SLA. If the supplier has gone quiet, escalate rather than chasing twice.",
        ],
      },
      {
        href: "/admin/ops/manual",
        title: "Manual booking",
        purpose: "Take a booking for someone who phoned, walked in or emailed, using the same inventory and pricing as the website.",
        reading: [
          "The steps run in the same order as the customer's own checkout, so the price you quote is the price they would have seen.",
          "Settlement records how the money actually arrived — cash at the desk, a transfer, or a card taken over the phone.",
        ],
        watchOut: [
          "A manual booking still holds real inventory. Abandoning one half-finished leaves stock held until the hold expires.",
        ],
      },
      {
        href: "/admin/ops/exceptions",
        title: "Exception board",
        purpose: "Everything that fell outside the happy path: partial bookings, expired holds, unmatched payments and failing integrations.",
        watchOut: [
          "A partial booking means the customer has paid for a trip they are only partly getting. These are the ones that generate complaints, so they outrank almost everything else.",
        ],
      },
    ],
  },
  {
    id: "supply",
    title: "Supply",
    blurb:
      "The catalogue and the people behind it. Aeropath contracts lodges, camps and operators directly; flights and car rental come from Amadeus and are not managed here.",
    entries: [
      {
        href: "/admin/supply/products",
        title: "Product approvals",
        purpose: "The gate between what a supplier submits and what a traveller can find. Nothing reaches search without a decision here.",
        reading: [
          "The left pane is the queue. The right shows the listing exactly as a traveller would see it, beside a completeness checklist.",
          "The checklist is advisory: you can approve a listing that fails a check if you are satisfied, but it usually produces a better listing to send it back.",
        ],
        actions: [
          { label: "Approve and publish", does: "Makes the product searchable within about a minute and notifies the supplier.", who: "Supply Manager, Platform Admin or Super Admin." },
          { label: "Request changes", does: "Returns it to the supplier with your comments. They can fix and resubmit." },
          { label: "Reject", does: "Ends the submission. The supplier cannot resubmit without you." },
        ],
        watchOut: [
          "Approving is what makes it sellable. There is no second review before a customer can buy it.",
        ],
      },
      {
        href: "/admin/supply/onboarding",
        title: "Onboarding queue",
        purpose: "Supplier applications waiting on document checks and a commission agreement.",
        actions: [
          { label: "Document ticks", does: "Records that you have seen each document. They are your own checklist, not a legal control." },
          { label: "Approve supplier", does: "Grants partner portal access so they can start loading products.", who: "Supply Manager and above." },
        ],
        watchOut: [
          "Approving a supplier does not publish anything. Their products still go through product approval.",
        ],
      },
      {
        href: "/admin/supply/performance",
        title: "Supplier performance",
        purpose: "How reliably each supplier actually confirms, so contract conversations are about evidence rather than impressions.",
        columns: [
          { header: "Confirmation rate", means: "Share of bookings the supplier accepted rather than rejected." },
          { header: "Avg confirm", means: "How long they take to answer. This is the number a customer feels." },
          { header: "Rejection rate", means: "How often they turn business away after the customer has paid." },
          { header: "Guest score", means: "Review score from travellers who stayed." },
        ],
      },
    ],
  },
  {
    id: "finance",
    title: "Finance",
    blurb:
      "Money in, money out, and the journal that proves the two agree. Every figure here is derived from the ledger rather than stored separately.",
    entries: [
      {
        href: "/admin/finance",
        title: "Finance dashboard",
        purpose: "Position at a glance: what is cash, what is still owed, and what needs a decision.",
        watchOut: [
          "Gross bookings and cash are deliberately different numbers. Gross counts a sale the moment it is made; cash only moves when a payment settles, and even then it is customer deposits owed to suppliers until confirmation recognises revenue.",
        ],
      },
      {
        href: "/admin/finance/reconciliation",
        title: "Reconciliation",
        purpose: "Match payments the provider says happened against payments we recorded.",
        reading: [
          "Anything listed here is money the customer believes they have paid and we cannot yet see.",
          "Most entries are lost provider callbacks rather than genuine failures.",
        ],
        watchOut: [
          "Before marking a payment received, check the provider reference. Confirming one that never arrived creates a hole in the ledger that only shows up at payout.",
        ],
      },
      {
        href: "/admin/finance/ledger",
        title: "Ledger",
        purpose: "The double-entry journal. Every financial movement in the platform, grouped so each entry balances to zero.",
        reading: [
          "Entries are grouped by transaction. A group that does not balance is flagged and should never occur.",
          "The right rail shows a running balance per account.",
        ],
        watchOut: [
          "The ledger is append only. Corrections are new entries, never edits — so a mistake stays visible and is corrected in the open.",
        ],
      },
      {
        href: "/admin/finance/payouts",
        title: "Supplier payouts",
        purpose: "Pay suppliers what they are owed, net of commission.",
        actions: [
          { label: "Submit for approval", does: "Moves a draft run to the approval queue." },
          { label: "Approve run", does: "Authorises the run.", who: "Finance Manager or Super Admin." },
          { label: "Execute payment", does: "Marks it paid and writes the balanced ledger entries.", who: "Finance Manager or Super Admin." },
        ],
        watchOut: [
          "Approval and execution are separate on purpose, so no single person can both authorise and move money.",
        ],
      },
      {
        href: "/admin/finance/refunds",
        title: "Refunds",
        purpose: "Approve refunds that fall outside the automatic free-cancellation window.",
        watchOut: [
          "Free-window refunds never appear here — they process themselves. Anything on this screen is a judgement call, and the approval threshold rises with the amount.",
        ],
      },
    ],
  },
  {
    id: "support",
    title: "Support",
    blurb: "Answering the customer, with enough context to answer properly the first time.",
    entries: [
      {
        href: "/admin/support",
        title: "Ticket inbox",
        purpose: "Every question a customer has asked, across SMS, WhatsApp, email and in-app.",
      },
      {
        href: "/admin/support/customer/AP-3B8QX",
        title: "Customer 360",
        purpose: "Everything about one customer in one place: bookings, payments, tickets, notes and lifetime value.",
        reading: [
          "Works from either a user account or a booking reference, because most bookings in this market are made by guests who never create an account.",
        ],
      },
      {
        href: "/admin/support/impersonate",
        title: "Impersonation",
        purpose: "See exactly what a customer sees, when a description over the phone is not getting you there.",
        watchOut: [
          "Read only, capped at thirty minutes, shown to the customer's session as a banner, and every request is audited with both your name and theirs.",
          "Never available for anyone holding a finance or admin role — impersonating them would be a privilege escalation path, not a support tool.",
        ],
      },
    ],
  },
  {
    id: "administration",
    title: "Administration",
    blurb: "Who can do what, what the platform is configured to do, and the record of everything that was done.",
    entries: [
      {
        href: "/admin/settings/roles",
        title: "Role grants",
        purpose: "Give someone a role within a specific scope.",
        reading: [
          "A user record carries no role of its own. Every permission comes from a grant that links a person to a role inside a scope — an organisation, a supplier, a region, or the whole platform.",
        ],
        watchOut: [
          "Platform scope is unrestricted. Keep that list short, and prefer a scoped grant wherever the work is scoped.",
          "Temporary elevation should always carry an expiry date.",
        ],
      },
      {
        href: "/admin/settings/audit",
        title: "Audit log",
        purpose: "The record of every privileged action, with who did it, which role they used, and what changed.",
        watchOut: ["Append only, written in the same transaction as the action itself, so it cannot drift from what actually happened."],
      },
      {
        href: "/admin/settings/system",
        title: "System settings",
        purpose: "Platform-wide values — currency, tax, hold lifetimes, SLA thresholds — held as data so changing one does not need a deploy.",
        actions: [
          { label: "Payment simulator", does: "Decides how the next payment behaves: success, timeout, lost callback, duplicate callback or outright failure. This is how you demonstrate the recovery paths." },
          { label: "Supplier auto-confirm", does: "When off, suppliers sit in the SLA queue so you can show the awaiting-supplier state and the escalation." },
        ],
        watchOut: ["The simulators exist because a demo that only shows the happy path hides the hard parts."],
      },
      {
        href: "/admin/settings/flags",
        title: "Feature flags",
        purpose: "Turn behaviour on and off without a release.",
        watchOut: [
          "Toggling a payment rail kill switch immediately changes what the traveller checkout offers. That is the intended response when a provider degrades.",
          "Release and experiment flags carry an expiry, because flag debt compounds faster than code debt.",
        ],
      },
    ],
  },
];

/** The guide entry for a route, if there is one. Falls back to the closest parent section. */
export function guideFor(pathname: string): GuideEntry | undefined {
  const all = GUIDE.flatMap((s) => s.entries);
  return (
    all.find((e) => e.href === pathname) ??
    all.filter((e) => pathname.startsWith(e.href) && e.href !== "/admin").sort((a, b) => b.href.length - a.href.length)[0]
  );
}
