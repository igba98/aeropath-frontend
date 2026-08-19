"use client";

import { use, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { CalendarDays, Check, ShieldCheck, Star, Users, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Gallery } from "@/features/traveller/gallery";
import { AddToTrip } from "@/features/traveller/add-to-trip";
import { MoneyText } from "@/components/shared/money-text";
import { Pill } from "@/components/shared/status-chip";
import { EmptyState } from "@/components/shared/empty-state";
import { useStore } from "@/lib/store";
import { catalog } from "@/lib/api";
import { computePrice } from "@/lib/domain/pricing";
import { cancellationPolicies } from "@/lib/fixtures/policies";
import { searchValuesFromParams } from "@/components/shared/search-widget";
import { addDays, formatWeekday, today } from "@/lib/format";
import { cn } from "@/lib/utils";

interface Day { day: number; title: string; body: string }

/** T08 · Product detail, tour. Day by day itinerary, inclusions, departure picker. */
export default function TourDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  return <Suspense><Body slug={use(params).slug} /></Suspense>;
}

function Body({ slug }: { slug: string }) {
  const sp = useSearchParams();
  const data = useStore((st) => st);
  const hydrated = useStore((st) => st.hydrated);
  const product = hydrated ? catalog.productBySlug(slug, data) : undefined;
  const values = searchValuesFromParams(new URLSearchParams(sp.toString()), "tour");
  const [departure, setDeparture] = useState(values.dateFrom);
  const [planId, setPlanId] = useState<string | undefined>(sp.get("rate") ?? undefined);

  if (!hydrated) return <div className="mx-auto max-w-[1200px] px-4 py-10"><div className="h-64 animate-pulse rounded-2xl bg-muted" /></div>;
  if (!product) return <div className="mx-auto max-w-[1200px] px-4 py-16"><EmptyState title="Tour not found" action={<Link href="/tours" className="text-sm text-brand-text underline">Back to tours</Link>} /></div>;

  const plans = catalog.ratePlansFor(product.id, data);
  const plan = plans.find((p) => p.id === planId) ?? plans[0];
  const pax = { adults: values.adults, children: values.children, infants: values.infants };
  const days = (product.attributes.itinerary ?? []) as Day[];
  const inclusions = (product.attributes.inclusions ?? []) as string[];
  const exclusions = (product.attributes.exclusions ?? []) as string[];
  const durationDays = Number(product.attributes.durationDays ?? days.length ?? 1);
  const price = computePrice({ vertical: "tour", ratePlan: plan, nights: 1, quantity: 1, pax });
  const dateTo = addDays(departure, Math.max(0, durationDays - 1));
  const availability = catalog.availability(data, product, departure, dateTo, pax.adults + pax.children);

  // next 10 candidate departures
  const departures = Array.from({ length: 10 }, (_, i) => addDays(today(), 7 + i * 3));

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-5">
      <nav className="mb-3 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground" aria-label="Breadcrumb">
        <Link href="/" className="hover:text-brand-text">Home</Link><span>/</span>
        <Link href="/tours" className="hover:text-brand-text">Tours & safari</Link><span>/</span>
        <span className="text-foreground">{product.title}</span>
      </nav>

      <div className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{durationDays} day{durationDays === 1 ? "" : "s"}</Badge>
          <Badge variant="outline">{String(product.attributes.difficulty ?? "Easy")}</Badge>
          <Pill tone="info">Group {String(product.attributes.groupMin ?? 1)}–{String(product.attributes.groupMax ?? 12)}</Pill>
          {product.reviewScore ? (
            <span className="flex items-center gap-1 text-sm">
              <Star className="size-4 fill-warning text-warning" aria-hidden />
              <span className="font-semibold">{product.reviewScore.toFixed(1)}</span>
              <span className="text-muted-foreground">· {product.reviewCount} reviews</span>
            </span>
          ) : null}
        </div>
        <h1 className="mt-1.5 font-display text-3xl">{product.title}</h1>
      </div>

      <Gallery media={product.media} title={product.title} productId={product.id} />

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-8">
          <section>
            <h2 className="font-display text-xl">Overview</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{product.description}</p>
          </section>

          <section>
            <h2 className="font-display text-xl">Day by day</h2>
            <ol className="mt-3 space-y-0 border-l pl-6">
              {days.map((d) => (
                <li key={d.day} className="relative pb-6 last:pb-0">
                  <span className="absolute -left-[31px] flex size-6 items-center justify-center rounded-full border-2 border-background bg-brand-500 text-[11px] font-semibold text-white">{d.day}</span>
                  <p className="font-medium">{d.title}</p>
                  {d.body ? <p className="mt-1 text-sm text-muted-foreground">{d.body}</p> : null}
                </li>
              ))}
            </ol>
          </section>

          <section className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border bg-card p-4">
              <p className="flex items-center gap-1.5 font-medium"><Check className="size-4 text-success" aria-hidden /> What&rsquo;s included</p>
              <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                {inclusions.map((i) => <li key={i} className="flex gap-2"><Check className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden /> {i}</li>)}
              </ul>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <p className="flex items-center gap-1.5 font-medium"><X className="size-4 text-muted-foreground" aria-hidden /> Not included</p>
              <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                {exclusions.map((i) => <li key={i} className="flex gap-2"><X className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {i}</li>)}
              </ul>
            </div>
          </section>

          <section>
            <h2 className="font-display text-xl">Cancellation</h2>
            <p className="mt-2 flex items-start gap-2 text-sm text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
              {cancellationPolicies.find((c) => c.id === plan.cancellationPolicyId)?.summary}
            </p>
          </section>
        </div>

        <aside>
          <div className="sticky top-20 space-y-3 rounded-xl border bg-card p-4">
            <div>
              <p className="text-xs text-muted-foreground">from</p>
              <MoneyText minor={Math.round(price.totalMinor / Math.max(1, pax.adults + pax.children))} currency={plan.currency} convert size="lg" />
              <p className="text-xs text-muted-foreground">per person, all in</p>
            </div>

            <div>
              <p className="mb-1.5 flex items-center gap-1.5 text-sm font-medium"><CalendarDays className="size-4" aria-hidden /> Choose a departure</p>
              <div className="grid max-h-44 grid-cols-2 gap-1.5 overflow-y-auto pr-1">
                {departures.map((d) => {
                  const dTo = addDays(d, Math.max(0, durationDays - 1));
                  const av = catalog.availability(data, product, d, dTo, pax.adults + pax.children);
                  const active = d === departure;
                  return (
                    <button
                      key={d}
                      onClick={() => setDeparture(d)}
                      disabled={!av.available}
                      aria-pressed={active}
                      className={cn("rounded-lg border px-2 py-1.5 text-left text-xs transition-colors disabled:opacity-40", active ? "border-brand-400 bg-brand-50 text-brand-text-strong" : "hover:bg-muted")}
                    >
                      <span className="block font-medium">{formatWeekday(d)}</span>
                      <span className="block text-[10px] text-muted-foreground">{av.available ? `${av.unitsLeft} seats` : "Full"}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="mb-1.5 text-sm font-medium">Departure type</p>
              <div className="space-y-1.5">
                {plans.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPlanId(p.id)}
                    aria-pressed={p.id === plan.id}
                    className={cn("flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors", p.id === plan.id ? "border-brand-400 bg-brand-50" : "hover:bg-muted")}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{p.name}</span>
                      {p.label ? <span className="text-[11px] text-brand-text">{p.label}</span> : null}
                    </span>
                    <MoneyText minor={p.baseMinor} currency={p.currency} convert size="sm" showCurrency={false} />
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-lg bg-muted p-3 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">{pax.adults} adult{pax.adults === 1 ? "" : "s"}{pax.children ? `, ${pax.children} children` : ""}</span></div>
              <div className="mt-1 flex items-baseline justify-between border-t pt-1">
                <span className="font-medium">Total, all in</span>
                <MoneyText minor={price.totalMinor} currency={plan.currency} convert size="md" />
              </div>
            </div>

            <AddToTrip
              className="w-full"
              productId={product.id}
              ratePlanId={plan.id}
              dateFrom={departure}
              dateTo={dateTo}
              pax={pax}
              disabled={!availability.available}
              label={availability.available ? "Add to trip" : "Departure full"}
            />
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Users className="size-3" aria-hidden /> {availability.unitsLeft} seat{availability.unitsLeft === 1 ? "" : "s"} left on this departure
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
