"use client";

import { use, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, Check, Info, MapPin, ShieldCheck, Star, Users } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Gallery } from "@/features/traveller/gallery";
import { AddToTrip } from "@/features/traveller/add-to-trip";
import { SearchWidget, searchValuesFromParams } from "@/components/shared/search-widget";
import { MoneyText } from "@/components/shared/money-text";
import { Pill } from "@/components/shared/status-chip";
import { EmptyState } from "@/components/shared/empty-state";
import { useStore } from "@/lib/store";
import { catalog } from "@/lib/api";
import { computePrice, nightsBetween } from "@/lib/domain/pricing";
import { cancellationPolicies } from "@/lib/fixtures/policies";
import { formatRange } from "@/lib/format";
import { cn } from "@/lib/utils";

/** T06 · Product detail, lodge. Gallery, rooms and rates table, policies, reviews, map. */
export default function StayDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  return <Suspense><Body slug={use(params).slug} /></Suspense>;
}

function Body({ slug }: { slug: string }) {
  const sp = useSearchParams();
  const data = useStore((st) => st);
  const hydrated = useStore((st) => st.hydrated);
  const product = hydrated ? catalog.productBySlug(slug, data) : undefined;

  if (!hydrated) return <div className="mx-auto max-w-[1200px] px-4 py-10"><div className="h-64 animate-pulse rounded-2xl bg-muted" /></div>;
  if (!product) {
    return (
      <div className="mx-auto max-w-[1200px] px-4 py-16">
        <EmptyState title="We could not find that property" description="It may have been paused or archived." action={<Link href="/stays" className="text-sm font-medium text-brand-text underline">Back to search</Link>} />
      </div>
    );
  }

  const values = searchValuesFromParams(new URLSearchParams(sp.toString()), "stay");
  const nights = nightsBetween(values.dateFrom, values.dateTo);
  const pax = { adults: values.adults, children: values.children, infants: values.infants };
  const plans = catalog.ratePlansFor(product.id, data);
  const reviews = Object.values(data.reviews).filter((r) => r.productId === product.id && r.status === "published");
  const rooms = Math.max(1, Math.ceil(values.adults / 2));
  const availability = catalog.availability(data, product, values.dateFrom, values.dateTo, rooms);

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-5">
      <nav className="mb-3 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground" aria-label="Breadcrumb">
        <Link href="/" className="hover:text-brand-text">Home</Link><span>/</span>
        <Link href="/stays" className="hover:text-brand-text">Hotels & lodges</Link><span>/</span>
        <Link href={`/destinations/${product.location.region.toLowerCase().replace(/\s+/g, "-")}`} className="hover:text-brand-text">{product.location.region}</Link><span>/</span>
        <span className="text-foreground">{product.title}</span>
      </nav>

      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {product.starRating ? (
              <span className="flex items-center gap-0.5 text-warning" aria-label={`${product.starRating} star`}>
                {Array.from({ length: product.starRating }).map((_, i) => <Star key={i} className="size-4 fill-current" aria-hidden />)}
              </span>
            ) : null}
            <Badge variant="secondary">{String(product.attributes.propertyType ?? "Property")}</Badge>
            {product.instantConfirm ? <Pill tone="success">Instant confirmation</Pill> : <Pill tone="info">Confirmed by the lodge, usually under 2 hours</Pill>}
          </div>
          <h1 className="mt-1.5 font-display text-3xl">{product.title}</h1>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
            <MapPin className="size-4" aria-hidden /> {product.location.city}, {product.location.region}, Tanzania
            {product.reviewScore ? <span className="ml-2"><span className="font-semibold text-foreground">{product.reviewScore.toFixed(1)}</span> · {product.reviewCount} reviews</span> : null}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">from</p>
          <MoneyText minor={product.priceFromMinor} currency={product.currency} convert size="lg" />
          <p className="text-xs text-muted-foreground">per night, all in</p>
        </div>
      </div>

      <Gallery media={product.media} title={product.title} productId={product.id} />

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-8">
          <section>
            <h2 className="font-display text-xl">About this property</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{product.description}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {product.amenities.map((a) => (
                <span key={a} className="flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5 text-sm">
                  <Check className="size-3.5 text-success" aria-hidden /> {a}
                </span>
              ))}
            </div>
            <dl className="mt-4 grid gap-3 rounded-xl border bg-muted/40 p-4 text-sm sm:grid-cols-3">
              <div><dt className="text-xs text-muted-foreground">Check in</dt><dd className="font-medium tabular-nums">{String(product.attributes.checkIn ?? "14:00")}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Check out</dt><dd className="font-medium tabular-nums">{String(product.attributes.checkOut ?? "10:00")}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Rooms</dt><dd className="font-medium tabular-nums">{String(product.attributes.rooms ?? "—")}</dd></div>
            </dl>
          </section>

          {/* Rooms and rates */}
          <section id="rates" data-scroll-target>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-xl">Rooms and rates</h2>
              <p className="text-sm text-muted-foreground">{formatRange(values.dateFrom, values.dateTo)} · {nights} night{nights === 1 ? "" : "s"} · {rooms} room{rooms === 1 ? "" : "s"}</p>
            </div>

            {product.attributes.parkFeeNote ? (
              <Alert className="mt-3">
                <Info className="size-4" />
                <AlertTitle>Park fees</AlertTitle>
                <AlertDescription>{String(product.attributes.parkFeeNote)} — you can add them at the extras step so the total you pay is final.</AlertDescription>
              </Alert>
            ) : null}

            {!availability.available ? (
              <Alert variant="destructive" className="mt-3">
                <AlertTriangle className="size-4" />
                <AlertTitle>No availability for those dates</AlertTitle>
                <AlertDescription>{availability.unitsLeft === 0 ? "The property is sold out or on stop sell." : `Only ${availability.unitsLeft} room${availability.unitsLeft === 1 ? "" : "s"} left, fewer than the ${rooms} you need.`} Change the dates above to see live options.</AlertDescription>
              </Alert>
            ) : null}

            <div className="mt-3 space-y-3">
              {plans.map((rp) => {
                const price = computePrice({ vertical: "stay", ratePlan: rp, nights, quantity: rooms, pax });
                const perNight = Math.round(price.totalMinor / nights / rooms);
                const policy = cancellationPolicies.find((c) => c.id === rp.cancellationPolicyId);
                return (
                  <div key={rp.id} className={cn("rounded-xl border bg-card p-4", !availability.available && "opacity-60")}>
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-medium">{rp.name}</h3>
                          {rp.label ? <Pill tone="brand">{rp.label}</Pill> : null}
                        </div>
                        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                          <li className="flex items-center gap-1.5"><Users className="size-3.5" aria-hidden /> Sleeps 2{rp.extraAdultMinor ? " + extra adults" : ""}</li>
                          {rp.inclusions.map((i) => <li key={i} className="flex items-center gap-1.5"><Check className="size-3.5 text-success" aria-hidden /> {i}</li>)}
                        </ul>
                        <p className={cn("mt-2 flex items-start gap-1.5 text-xs", rp.refundable ? "text-success-foreground" : "text-muted-foreground")}>
                          <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                          {policy?.summary ?? "Cancellation terms apply"}
                        </p>
                      </div>
                      <div className="text-right">
                        <MoneyText minor={perNight} currency={rp.currency} convert size="lg" />
                        <p className="text-[11px] text-muted-foreground">per night, all in</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          <MoneyText minor={price.totalMinor} currency={rp.currency} convert size="sm" /> total
                        </p>
                        <AddToTrip
                          className="mt-2 w-full"
                          size="default"
                          productId={product.id}
                          ratePlanId={rp.id}
                          dateFrom={values.dateFrom}
                          dateTo={values.dateTo}
                          quantity={rooms}
                          pax={pax}
                          disabled={!availability.available}
                          label={availability.available ? "Add to trip" : "Sold out"}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section>
            <h2 className="font-display text-xl">Policies</h2>
            <Accordion type="single" collapsible className="mt-2">
              <AccordionItem value="cancellation">
                <AccordionTrigger>Cancellation</AccordionTrigger>
                <AccordionContent>
                  <p className="text-sm text-muted-foreground">{cancellationPolicies.find((c) => c.id === product.cancellationPolicyId)?.summary}</p>
                  <p className="mt-2 text-xs text-muted-foreground">The exact terms are snapshotted onto your booking at the moment you pay, so a later policy change cannot affect you.</p>
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="children">
                <AccordionTrigger>Children and extra beds</AccordionTrigger>
                <AccordionContent><p className="text-sm text-muted-foreground">{product.childPolicy ?? "Children are welcome. Extra bed charges may apply and are shown before you pay."}</p></AccordionContent>
              </AccordionItem>
              <AccordionItem value="payment">
                <AccordionTrigger>Payment and taxes</AccordionTrigger>
                <AccordionContent><p className="text-sm text-muted-foreground">Prices include 18% VAT, the 1% tourism levy and our service fee. Nothing further is added at checkout. Pay by M-Pesa, Tigo Pesa, Airtel Money, card or bank transfer.</p></AccordionContent>
              </AccordionItem>
            </Accordion>
          </section>

          {reviews.length ? (
            <section>
              <h2 className="font-display text-xl">Guest reviews</h2>
              <div className="mt-3 space-y-3">
                {reviews.map((r) => (
                  <article key={r.id} className="rounded-xl border bg-card p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium">{r.title}</p>
                      <span className="flex items-center gap-0.5 text-warning" aria-label={`${r.rating} out of 5`}>
                        {Array.from({ length: r.rating }).map((_, i) => <Star key={i} className="size-3.5 fill-current" aria-hidden />)}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{r.body}</p>
                    <p className="mt-2 text-xs text-muted-foreground">{r.authorName}</p>
                    {r.response ? (
                      <div className="mt-2 rounded-lg bg-muted p-3">
                        <p className="text-xs font-medium">Response from the property</p>
                        <p className="mt-0.5 text-sm text-muted-foreground">{r.response.text}</p>
                      </div>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        {/* Sticky booking rail */}
        <aside>
          <div className="sticky top-20 space-y-3">
            <SearchWidget density="sidebar" initial={{ ...values, vertical: "stay" }} />
            <div className="rounded-xl border bg-card p-4">
              <p className="text-sm font-medium">Why book here</p>
              <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
                <li className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> All-in price, park fees shown before payment</li>
                <li className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> Pay with the mobile money you already use</li>
                <li className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> Voucher by SMS and WhatsApp, works offline</li>
                <li className="flex gap-2"><Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden /> {product.freeCancellation ? "Free cancellation on most rates" : "Clear, snapshotted cancellation terms"}</li>
              </ul>
            </div>
            <div className="overflow-hidden rounded-xl border">
              <div className="relative h-40 bg-gradient-to-br from-brand-100 to-emerald-50">
                <div className="absolute inset-0 opacity-40" style={{ backgroundImage: "linear-gradient(var(--brand-200) 1px, transparent 1px), linear-gradient(90deg, var(--brand-200) 1px, transparent 1px)", backgroundSize: "24px 24px" }} aria-hidden />
                <span className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-full border border-brand-300 bg-white px-3 py-1.5 text-xs font-medium shadow-sm">
                  <MapPin className="size-3.5 text-brand-text" aria-hidden /> {product.location.city}
                </span>
              </div>
              <p className="border-t bg-card px-3 py-2 font-mono text-[11px] text-muted-foreground">
                {product.location.lat.toFixed(3)}, {product.location.lng.toFixed(3)}
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
