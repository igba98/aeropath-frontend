"use client";

import Link from "next/link";
import { ArrowRight, Beaker, CircleCheck, CircleDashed, Map, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pill } from "@/components/shared/status-chip";
import { PERSONA_IDS, users } from "@/lib/fixtures/users";
import { ROLE_LABELS } from "@/lib/domain/permissions";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";

/** The prototype's front door: what it is, who to sign in as, and what is real versus simulated. */

const FLOWS = [
  {
    title: "Book a lodge and pay by mobile money",
    who: "Any traveller, signed in or not",
    steps: ["Search stays", "Pick a room", "Hold for 15 minutes", "Enter travellers", "Pay with M-Pesa", "Voucher issued"],
    start: { href: "/stays", label: "Start at search" },
  },
  {
    title: "A payment that goes wrong, and recovers",
    who: "Set the simulator first",
    steps: ["Set payment mode to Lost callback", "Book anything", "Wait out the 120 second timer", "Enter the provider reference by hand", "Finance reconciles it"],
    start: { href: "/admin/settings/system", label: "Set the simulator" },
  },
  {
    title: "A supplier lists a room and it goes live",
    who: "Supplier, then back office",
    steps: ["Sign in as a supplier", "Create a product", "Submit for review", "Approve it in the back office", "It becomes searchable"],
    start: { href: "/admin/supply/products", label: "Open the approval queue" },
  },
  {
    title: "A cancellation and its refund",
    who: "Any traveller with a booking",
    steps: ["Open a trip", "Choose Cancel", "See the exact refund from the policy snapshot", "Confirm", "Finance approves if outside the free window"],
    start: { href: "/trips", label: "Open My Trips" },
  },
];

const REAL = [
  "Every price is computed from rate plans, occupancy, taxes and fees — nothing is hard coded",
  "Holds expire on a real 15 minute timer and are swept",
  "Refunds are quoted from the cancellation policy snapshotted at booking time",
  "The ledger is double entry and every entry group balances to zero",
  "Permissions are enforced by role and scope, not hidden in the UI",
  "The booking state machine rejects illegal transitions",
];

const FAKED = [
  ["Payment gateway", "A local simulator with every callback failure mode"],
  ["Supplier confirmation", "A back office button standing in for an integration"],
  ["Flight inventory", "Static fixtures with realistic fare families"],
  ["Search relevance", "Rating and price sort, no ranking model"],
  ["FX rates", "A fixed table, editable in system settings"],
  ["Vouchers and invoices", "Confirmed by toast, not a generated PDF"],
];

export default function AboutPage() {
  const personas = PERSONA_IDS.map((id) => users.find((u) => u.id === id)).filter(Boolean);

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-10">
      <header className="max-w-2xl">
        <Pill tone="brand">Prototype notes</Pill>
        <h1 className="mt-3 font-display text-4xl">Aeropath</h1>
        <p className="mt-3 text-base leading-relaxed text-muted-foreground">
          A working front end for a multi-vertical travel platform in Tanzania — lodges, safaris, flights and transfers,
          sold to travellers, travel agents and corporate accounts, and run from a back office. Everything you can click
          is driven by a real domain model in the browser: pricing, holds, the booking state machine, refunds, the ledger
          and the permission system. There is no server.
        </p>
      </header>

      <section className="mt-10">
        <h2 className="flex items-center gap-2 font-display text-2xl"><Map className="size-5 text-brand-text" aria-hidden /> Six flows worth walking</h2>
        <p className="mt-1 text-sm text-muted-foreground">Each one crosses a boundary between actors — that is where the design decisions live.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {FLOWS.map((f) => (
            <article key={f.title} className="flex flex-col rounded-2xl border bg-card p-5">
              <h3 className="font-display text-lg leading-snug">{f.title}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">{f.who}</p>
              <ol className="mt-3 flex-1 space-y-1.5">
                {f.steps.map((s, i) => (
                  <li key={s} className="flex gap-2.5 text-sm">
                    <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold tabular-nums text-muted-foreground">{i + 1}</span>
                    <span className="text-muted-foreground">{s}</span>
                  </li>
                ))}
              </ol>
              <Button asChild variant="outline" size="sm" className="mt-4 w-fit gap-1.5">
                <Link href={f.start.href}>{f.start.label} <ArrowRight className="size-3.5" aria-hidden /></Link>
              </Button>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="flex items-center gap-2 font-display text-2xl"><Users className="size-5 text-brand-text" aria-hidden /> Who you can be</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Switching persona changes what you can see and do — the consoles are gated by role and scope, not by hiding buttons.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {personas.map((p) => (
            <div key={p!.id} className="flex items-center gap-3 rounded-xl border bg-card p-3">
              <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-[11px] font-semibold text-white", p!.avatarTone)}>
                {initials(p!.name)}
              </span>
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">{p!.name}</span>
                <span className="block truncate text-xs text-muted-foreground">{ROLE_LABELS[p!.grants[0]?.roleId ?? "traveller"]}</span>
              </span>
            </div>
          ))}
        </div>
        <Button asChild className="mt-4 gap-1.5"><Link href="/login">Pick a persona <ArrowRight className="size-4" aria-hidden /></Link></Button>
      </section>

      <section className="mt-10 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border bg-card p-5">
          <h2 className="flex items-center gap-2 font-medium"><CircleCheck className="size-4 text-success" aria-hidden /> Genuinely modelled</h2>
          <ul className="mt-3 space-y-2">
            {REAL.map((r) => (
              <li key={r} className="flex gap-2 text-sm text-muted-foreground">
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> {r}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border bg-card p-5">
          <h2 className="flex items-center gap-2 font-medium"><CircleDashed className="size-4 text-muted-foreground" aria-hidden /> Deliberately faked</h2>
          <ul className="mt-3 space-y-2">
            {FAKED.map(([k, v]) => (
              <li key={k} className="flex gap-2 text-sm">
                <CircleDashed className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span><span className="font-medium">{k}</span> <span className="text-muted-foreground">— {v}</span></span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mt-10 rounded-2xl border border-brand-300 bg-brand-50/40 p-6">
        <h2 className="flex items-center gap-2 font-medium text-brand-text-strong"><Beaker className="size-4" aria-hidden /> Driving the failure paths</h2>
        <p className="mt-1.5 text-sm text-muted-foreground">
          A demo that only shows the happy path hides the hard parts. System settings has simulators for the payment
          gateway — success, timeout, lost callback, duplicate callback, outright failure — and a switch for whether
          suppliers confirm instantly or sit in the SLA queue. Set one, then book something and watch what the customer sees.
        </p>
        <Button asChild variant="outline" className="mt-4 gap-1.5">
          <Link href="/admin/settings/system">Open the simulators <ArrowRight className="size-4" aria-hidden /></Link>
        </Button>
      </section>

      <p className="mt-10 text-xs text-muted-foreground">
        State lives in your browser. Clearing site data resets everything to the seeded fixtures.
      </p>
    </div>
  );
}
