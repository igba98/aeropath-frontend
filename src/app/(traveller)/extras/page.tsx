"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Info, ShieldQuestion } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckoutSteps } from "@/features/traveller/checkout-steps";
import { useCart } from "@/features/traveller/use-cart";
import { PriceBreakdown } from "@/components/shared/price-breakdown";
import { EmptyState } from "@/components/shared/empty-state";
import { MoneyText } from "@/components/shared/money-text";
import { cart } from "@/lib/api";
import { extrasCatalogue } from "@/lib/fixtures/products";
import { cn } from "@/lib/utils";
import type { Extra } from "@/lib/domain/types";
import { Armchair } from "lucide-react";
import { AncillariesDialog, type FlightLeg } from "@/features/flights/ancillaries-dialog";
import { ancillaries } from "@/lib/api";
import { useStore } from "@/lib/store";
import type { Booking, BookingItem } from "@/lib/domain/types";

/**
 * T12 · Extras and add-ons.
 * Insurance is unchecked by default — a deliberate decision (flow spec §5.3): a lower attach
 * rate, and no regulatory liability from a pre-ticked insurance sale.
 */
export default function ExtrasPage() {
  const router = useRouter();
  const { hydrated, booking, items, breakdown, paxCount } = useCart();
  // What the traveller has explicitly ticked or unticked this visit; everything else falls back
  // to the booking's saved extras, or the catalogue default. Derived rather than copied into an
  // effect, so the correct boxes are ticked on the very first paint.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  const verticals = Array.from(new Set(items.map((i) => i.vertical)));
  const offered: Extra[] = Array.from(
    new Map(verticals.flatMap((v) => extrasCatalogue[v] ?? []).map((e) => [e.id, e] as const)).values(),
  );

  const alreadyChosen = new Set((booking?.extras ?? []).map((e) => e.id));
  const selected: Record<string, boolean> = Object.fromEntries(
    offered.map((e) => [
      e.id,
      e.id in overrides ? overrides[e.id] : alreadyChosen.size ? alreadyChosen.has(e.id) : e.defaultChecked,
    ]),
  );

  if (!hydrated) return <Shell><div className="h-40 animate-pulse rounded-xl bg-muted" /></Shell>;
  if (!booking || !items.length) return <Shell><EmptyState title="Your trip is empty" action={<Button asChild><Link href="/stays">Find something to book</Link></Button>} /></Shell>;

  function toggle(id: string, on: boolean) {
    const next = { ...selected, [id]: on };
    setOverrides((prev) => ({ ...prev, [id]: on }));
    cart.update({ extras: offered.filter((e) => next[e.id]) });
  }

  const requiredExtras = offered.filter((e) => e.category === "park_fee");

  return (
    <Shell>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <div>
            <h1 className="font-display text-2xl">Add-ons</h1>
            <p className="text-sm text-muted-foreground">Everything you tick is included in the total you pay. Nothing is added later.</p>
          </div>

          <FlightAncillaries booking={booking} items={items} />

          {requiredExtras.length ? (
            <Alert>
              <Info className="size-4" />
              <AlertTitle>Park fees are payable either way</AlertTitle>
              <AlertDescription>
                National park entry is collected at the gate by TANAPA. Paying here means the price you see is the price of the whole trip,
                and you skip the queue with a pre-paid permit.
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-3">
            {offered.map((e) => {
              const amount = e.perPerson ? e.amountMinor * paxCount : e.amountMinor;
              const on = Boolean(selected[e.id]);
              return (
                <label
                  key={e.id}
                  className={cn("flex cursor-pointer items-start gap-3 rounded-xl border bg-card p-4 transition-colors", on && "border-brand-400 bg-brand-50/50")}
                >
                  <Checkbox checked={on} onCheckedChange={(c) => toggle(e.id, Boolean(c))} className="mt-0.5" aria-describedby={`${e.id}-desc`} />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{e.label}</span>
                      <span className="text-right">
                        <MoneyText minor={amount} currency="TZS" convert size="md" />
                        {e.perPerson ? <span className="block text-[11px] text-muted-foreground">{paxCount} × {new Intl.NumberFormat("en-TZ").format(e.amountMinor)}</span> : null}
                      </span>
                    </span>
                    <span id={`${e.id}-desc`} className="mt-0.5 block text-sm text-muted-foreground">{e.description}</span>
                    {e.category === "insurance" ? (
                      <span className="mt-1.5 flex items-start gap-1.5 text-[11px] text-muted-foreground">
                        <ShieldQuestion className="mt-0.5 size-3 shrink-0" aria-hidden />
                        Underwritten by our insurance partner. Optional, never pre-selected.
                      </span>
                    ) : null}
                  </span>
                </label>
              );
            })}
          </div>

          {!offered.length ? (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              No add-ons apply to this trip. Continue to review.
            </p>
          ) : null}
        </div>

        <aside>
          <div className="sticky top-20 space-y-3">
            <PriceBreakdown data={breakdown} title="Trip total" />
            <Button className="w-full gap-2" size="lg" onClick={() => router.push("/review")}>
              Continue to review <ArrowRight className="size-4" aria-hidden />
            </Button>
          </div>
        </aside>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-[1200px] px-4 py-6"><CheckoutSteps />{children}</div>;
}

/**
 * Seats and baggage for any flight in the trip.
 *
 * Only rendered when the trip actually contains a flight — a lodge booking should never be asked
 * about legroom. Each flight leg becomes a section in the picker.
 */
function FlightAncillaries({ booking, items }: { booking: Booking; items: BookingItem[] }) {
  const [open, setOpen] = useState(false);
  const products = useStore((s) => s.products);
  const flights = items.filter((i) => i.vertical === "flight");
  if (!flights.length) return null;

  const travellers = booking.travellers.length
    ? booking.travellers.map((t) => ({ label: `${t.title} ${t.firstName} ${t.lastName}`.trim() }))
    : Array.from({ length: Math.max(1, flights[0].pax.adults + flights[0].pax.children) }, (_, i) => ({ label: `Passenger ${i + 1}` }));

  const legs: FlightLeg[] = flights.map((i, idx) => {
    const a = products[i.productId]?.attributes as { from?: string; to?: string; fromCity?: string; toCity?: string } | undefined;
    return {
      id: i.productId,
      leg: idx === 0 ? "out" : "in",
      from: a?.from ?? "—",
      to: a?.to ?? "—",
      fromCity: a?.fromCity ?? i.productSnapshot.city,
      toCity: a?.toCity ?? "—",
      date: i.travelDateFrom,
    };
  });

  const seats = flights.flatMap((i) => i.seats ?? []);
  const bags = flights.flatMap((i) => i.bags ?? []);
  const extraMinor = flights.reduce((sum, i) => sum + (i.ancillaryMinor ?? 0), 0);
  const seatCount = seats.length;

  return (
    <>
      <section className="rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 font-medium">
              <Armchair className="size-4 text-brand-text" aria-hidden /> Seats and baggage
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {seatCount
                ? `${seatCount} seat${seatCount === 1 ? "" : "s"} chosen${extraMinor ? "" : " · no extra charge"}`
                : "Pick where you sit and what you bring. Standard seats and a cabin bag are free."}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {extraMinor ? <MoneyText minor={extraMinor} currency="TZS" size="md" /> : null}
            <Button variant="outline" onClick={() => setOpen(true)}>
              {seatCount ? "Change" : "Choose seats"}
            </Button>
          </div>
        </div>
      </section>

      <AncillariesDialog
        open={open}
        onOpenChange={setOpen}
        legs={legs}
        travellers={travellers}
        seats={seats}
        bags={bags}
        onSave={({ seats: nextSeats, bags: nextBags }) => {
          // Ancillaries belong to the leg they were chosen on.
          for (const [idx, item] of flights.entries()) {
            const leg = idx === 0 ? "out" : "in";
            ancillaries.set(item.id, {
              seats: nextSeats.filter((a) => a.leg === leg),
              bags: idx === 0 ? nextBags : [],
            });
          }
        }}
      />
    </>
  );
}
