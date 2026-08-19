"use client";

import { use, Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Briefcase, Clock, Luggage, Plane, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { AddToTrip } from "@/features/traveller/add-to-trip";
import { MoneyText } from "@/components/shared/money-text";
import { Pill } from "@/components/shared/status-chip";
import { EmptyState } from "@/components/shared/empty-state";
import { useStore } from "@/lib/store";
import { catalog } from "@/lib/api";
import { computePrice } from "@/lib/domain/pricing";
import { cancellationPolicies } from "@/lib/fixtures/policies";
import { searchValuesFromParams } from "@/components/shared/search-widget";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AirlineLogo } from "@/components/shared/airline-logo";

/** T07 · Product detail, flight. Itinerary, fare families, baggage, fare rules. */
export default function FlightDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  return <Suspense><Body slug={use(params).slug} /></Suspense>;
}

function Body({ slug }: { slug: string }) {
  const sp = useSearchParams();
  const data = useStore((st) => st);
  const hydrated = useStore((st) => st.hydrated);
  const product = hydrated ? catalog.productBySlug(slug, data) : undefined;
  const values = searchValuesFromParams(new URLSearchParams(sp.toString()), "flight");
  const [planId, setPlanId] = useState<string | undefined>(sp.get("rate") ?? undefined);

  if (!hydrated) return <div className="mx-auto max-w-[1100px] px-4 py-10"><div className="h-56 animate-pulse rounded-2xl bg-muted" /></div>;
  if (!product) return <div className="mx-auto max-w-[1100px] px-4 py-16"><EmptyState title="Flight not found" action={<Link href="/flights" className="text-sm text-brand-text underline">Back to flights</Link>} /></div>;

  const a = product.attributes as { carrier: string; carrierCode: string; flightNo: string; from: string; to: string; fromCity: string; toCity: string; departTime: string; arriveTime: string; durationMinutes: number; aircraft: string; cabin: string; stops: number };
  const plans = catalog.ratePlansFor(product.id, data);
  const plan = plans.find((p) => p.id === planId) ?? plans[0];
  const pax = { adults: values.adults, children: values.children, infants: values.infants };
  const price = computePrice({ vertical: "flight", ratePlan: plan, nights: 1, quantity: 1, pax });
  const availability = catalog.availability(data, product, values.dateFrom, values.dateFrom, pax.adults + pax.children);

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-5">
      <nav className="mb-3 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground" aria-label="Breadcrumb">
        <Link href="/" className="hover:text-brand-text">Home</Link><span>/</span>
        <Link href="/flights" className="hover:text-brand-text">Flights</Link><span>/</span>
        <span className="text-foreground">{a.fromCity} to {a.toCity}</span>
      </nav>

      <h1 className="font-display text-3xl">{a.fromCity} → {a.toCity}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{formatDate(values.dateFrom)} · {pax.adults + pax.children + pax.infants} passenger{pax.adults + pax.children + pax.infants === 1 ? "" : "s"}</p>

      <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-6">
          {/* Itinerary */}
          <section className="rounded-2xl border bg-card p-5">
            <div className="flex flex-wrap items-center gap-3">
              <AirlineLogo carrier={a.carrier} code={a.carrierCode} size="lg" />
              <div>
                <p className="font-medium">{a.carrier}</p>
                <p className="font-mono text-xs text-muted-foreground">{a.flightNo} · {a.aircraft}</p>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <Badge variant="secondary">{a.cabin === "business" ? "Business" : "Economy"}</Badge>
                {a.stops === 0 ? <Pill tone="success">Direct</Pill> : <Pill tone="warning">{a.stops} stop</Pill>}
              </div>
            </div>

            <div className="mt-5 grid grid-cols-[auto_1fr] gap-x-4">
              <div className="flex flex-col items-center pt-1.5">
                <span className="size-2.5 rounded-full border-2 border-brand-500" />
                <span className="my-1 w-px flex-1 bg-border" />
                <span className="size-2.5 rounded-full bg-brand-500" />
              </div>
              <div className="space-y-6">
                <div>
                  <p className="font-display text-2xl tabular-nums">{a.departTime}</p>
                  <p className="text-sm">{a.fromCity} <span className="font-mono text-xs text-muted-foreground">({a.from})</span></p>
                  <p className="text-xs text-muted-foreground">{formatDate(values.dateFrom)}</p>
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Clock className="size-3.5" aria-hidden /> {Math.floor(a.durationMinutes / 60)}h {a.durationMinutes % 60 ? `${a.durationMinutes % 60}m` : ""} flight time
                  </p>
                </div>
                <div>
                  <p className="font-display text-2xl tabular-nums">{a.arriveTime}</p>
                  <p className="text-sm">{a.toCity} <span className="font-mono text-xs text-muted-foreground">({a.to})</span></p>
                  <p className="text-xs text-muted-foreground">{formatDate(values.dateFrom)}</p>
                </div>
              </div>
            </div>
          </section>

          {/* Fare families */}
          <section>
            <h2 className="font-display text-xl">Fare families</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {plans.map((p) => {
                const pp = computePrice({ vertical: "flight", ratePlan: p, nights: 1, quantity: 1, pax });
                const active = p.id === plan.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => setPlanId(p.id)}
                    aria-pressed={active}
                    className={cn("rounded-xl border p-4 text-left transition-all", active ? "border-brand-400 bg-brand-50 ring-1 ring-brand-300" : "bg-card hover:border-brand-300")}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-medium">{p.name}</p>
                      {p.label ? <Pill tone="brand">{p.label}</Pill> : null}
                    </div>
                    <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {p.inclusions.map((i) => (
                        <li key={i} className="flex items-center gap-1.5">
                          {i.toLowerCase().includes("bag") ? <Luggage className="size-3" aria-hidden /> : <Briefcase className="size-3" aria-hidden />} {i}
                        </li>
                      ))}
                      <li className={cn("flex items-center gap-1.5", p.refundable ? "text-success-foreground" : "")}>
                        <ShieldCheck className="size-3" aria-hidden /> {p.refundable ? "Refundable per fare rules" : "Non refundable"}
                      </li>
                    </ul>
                    <MoneyText minor={pp.totalMinor} currency={p.currency} convert size="md" className="mt-3 block" />
                    <p className="text-[11px] text-muted-foreground">total, all in</p>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-xl border bg-muted/40 p-4">
            <h2 className="flex items-center gap-1.5 font-medium"><ShieldCheck className="size-4" aria-hidden /> Fare rules</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">{cancellationPolicies.find((c) => c.id === plan.cancellationPolicyId)?.summary}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Airline schedule changes are passed on at no charge. Name corrections up to 3 characters are free; a full name change is a new ticket.
            </p>
          </section>
        </div>

        <aside>
          <div className="sticky top-20 space-y-3 rounded-xl border bg-card p-4">
            <p className="font-medium">{plan.name}</p>
            <div className="space-y-1.5 text-sm">
              {pax.adults ? <Row label={`${pax.adults} adult${pax.adults === 1 ? "" : "s"}`} minor={plan.baseMinor * pax.adults} currency={plan.currency} /> : null}
              {pax.children ? <Row label={`${pax.children} child`} minor={Math.round(plan.baseMinor * 0.75) * pax.children} currency={plan.currency} /> : null}
              {pax.infants ? <Row label={`${pax.infants} infant`} minor={Math.round(plan.baseMinor * 0.1) * pax.infants} currency={plan.currency} /> : null}
              <Row label="Taxes and fees" minor={price.taxMinor + price.feeMinor} currency={plan.currency} />
            </div>
            <div className="flex items-baseline justify-between border-t pt-2">
              <span className="font-medium">Total, all in</span>
              <MoneyText minor={price.totalMinor} currency={plan.currency} convert size="lg" />
            </div>
            <AddToTrip
              className="w-full"
              productId={product.id}
              ratePlanId={plan.id}
              dateFrom={values.dateFrom}
              dateTo={values.dateFrom}
              pax={pax}
              disabled={!availability.available}
              label={availability.available ? "Add to trip" : "No seats left"}
            />
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Plane className="size-3" aria-hidden /> {availability.unitsLeft} seat{availability.unitsLeft === 1 ? "" : "s"} at this fare · held for 20 minutes
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, minor, currency }: { label: string; minor: number; currency: "TZS" | "USD" }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <MoneyText minor={minor} currency={currency} convert size="sm" showCurrency={false} />
    </div>
  );
}
