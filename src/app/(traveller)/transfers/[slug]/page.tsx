"use client";

import { use, Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Check, Clock, Luggage, MapPin, Route, ShieldCheck, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/** T09 · Product detail, transfer. Vehicle, route, pickup instructions. */
export default function TransferDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  return <Suspense><Body slug={use(params).slug} /></Suspense>;
}

function Body({ slug }: { slug: string }) {
  const sp = useSearchParams();
  const data = useStore((st) => st);
  const hydrated = useStore((st) => st.hydrated);
  const product = hydrated ? catalog.productBySlug(slug, data) : undefined;
  const values = searchValuesFromParams(new URLSearchParams(sp.toString()), "transfer");
  const [planId, setPlanId] = useState<string | undefined>(sp.get("rate") ?? undefined);
  const [pickupTime, setPickupTime] = useState("10:00");
  const [flightNo, setFlightNo] = useState("");
  const [notes, setNotes] = useState("");

  if (!hydrated) return <div className="mx-auto max-w-[1100px] px-4 py-10"><div className="h-56 animate-pulse rounded-2xl bg-muted" /></div>;
  if (!product) return <div className="mx-auto max-w-[1100px] px-4 py-16"><EmptyState title="Transfer not found" action={<Link href="/transfers" className="text-sm text-brand-text underline">Back to transfers</Link>} /></div>;

  const route = product.attributes.route as { from: string; to: string } | undefined;
  const classes = (product.attributes.vehicleClasses ?? []) as Array<{ id: string; name: string; pax: number; bags: number }>;
  const perDay = Boolean(product.attributes.perDay);
  const plans = catalog.ratePlansFor(product.id, data);
  const plan = plans.find((p) => p.id === planId) ?? plans[0];
  const pax = { adults: values.adults, children: values.children, infants: values.infants };
  const days = perDay ? Math.max(1, Math.round((new Date(values.dateTo).getTime() - new Date(values.dateFrom).getTime()) / 86_400_000)) : 1;
  const price = computePrice({ vertical: "transfer", ratePlan: plan, nights: 1, quantity: days, pax });
  const availability = catalog.availability(data, product, values.dateFrom, values.dateFrom, 1);
  const cls = classes.find((c) => plan.name.toLowerCase().includes(c.name.toLowerCase().split(" ")[0])) ?? classes[0];

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-5">
      <nav className="mb-3 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground" aria-label="Breadcrumb">
        <Link href="/" className="hover:text-brand-text">Home</Link><span>/</span>
        <Link href="/transfers" className="hover:text-brand-text">Transfers</Link><span>/</span>
        <span className="text-foreground">{product.title}</span>
      </nav>

      <h1 className="font-display text-3xl">{product.title}</h1>
      {route ? (
        <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5"><Route className="size-4" aria-hidden /> {route.from} → {route.to}</span>
          {product.attributes.durationMinutes ? <span className="flex items-center gap-1.5"><Clock className="size-4" aria-hidden /> about {Number(product.attributes.durationMinutes) >= 60 ? `${Math.round(Number(product.attributes.durationMinutes) / 60)} hours` : `${product.attributes.durationMinutes} minutes`}</span> : null}
          {product.attributes.distanceKm ? <span className="flex items-center gap-1.5"><MapPin className="size-4" aria-hidden /> {String(product.attributes.distanceKm)} km</span> : null}
          {product.instantConfirm ? <Pill tone="success">Instant confirmation</Pill> : null}
        </p>
      ) : null}

      <div className="mt-4"><Gallery media={product.media} title={product.title} productId={product.id} /></div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-6">
          <section>
            <h2 className="font-display text-xl">About this transfer</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{product.description}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {product.amenities.map((a) => (
                <span key={a} className="flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5 text-sm">
                  <Check className="size-3.5 text-success" aria-hidden /> {a}
                </span>
              ))}
            </div>
          </section>

          <section>
            <h2 className="font-display text-xl">Choose a vehicle</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {plans.map((p) => {
                const c = classes.find((x) => p.name.toLowerCase().includes(x.name.toLowerCase().split(" ")[0])) ?? classes[0];
                const pp = computePrice({ vertical: "transfer", ratePlan: p, nights: 1, quantity: days, pax });
                const active = p.id === plan.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => setPlanId(p.id)}
                    aria-pressed={active}
                    className={cn("rounded-xl border p-4 text-left transition-all", active ? "border-brand-400 bg-brand-50 ring-1 ring-brand-300" : "bg-card hover:border-brand-300")}
                  >
                    <p className="font-medium">{p.name}</p>
                    {c ? (
                      <p className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1"><Users className="size-3" aria-hidden /> up to {c.pax}</span>
                        <span className="flex items-center gap-1"><Luggage className="size-3" aria-hidden /> {c.bags} bags</span>
                      </p>
                    ) : null}
                    <MoneyText minor={pp.totalMinor} currency={p.currency} convert size="md" className="mt-2 block" />
                    <p className="text-[11px] text-muted-foreground">all in{perDay ? `, ${days} day${days === 1 ? "" : "s"}` : ", per vehicle"}</p>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-xl border bg-muted/40 p-4">
            <h2 className="flex items-center gap-1.5 font-medium"><MapPin className="size-4" aria-hidden /> Pickup instructions</h2>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Your driver meets you in the arrivals hall with a name board. We track your flight, so a delay does not cost you the transfer.
              Driver contact details are on the voucher, sent by SMS and WhatsApp.
            </p>
            <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {cancellationPolicies.find((c) => c.id === plan.cancellationPolicyId)?.summary}
            </p>
          </section>
        </div>

        <aside>
          <div className="sticky top-20 space-y-3 rounded-xl border bg-card p-4">
            <p className="text-sm font-medium">{formatDate(values.dateFrom)}{perDay ? ` – ${formatDate(values.dateTo)}` : ""}</p>
            <div>
              <Label htmlFor="pickup">Pickup time</Label>
              <Input id="pickup" type="time" value={pickupTime} onChange={(e) => setPickupTime(e.target.value)} className="mt-1 tabular-nums" />
            </div>
            <div>
              <Label htmlFor="flight">Flight number (optional)</Label>
              <Input id="flight" value={flightNo} onChange={(e) => setFlightNo(e.target.value)} placeholder="PW 401" className="mt-1" />
              <p className="mt-1 text-[11px] text-muted-foreground">We track it and adjust the pickup automatically.</p>
            </div>
            <div>
              <Label htmlFor="notes">Notes for the driver</Label>
              <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Child seat, extra luggage…" className="mt-1" />
            </div>
            <div className="flex items-baseline justify-between border-t pt-2">
              <span className="font-medium">Total, all in</span>
              <MoneyText minor={price.totalMinor} currency={plan.currency} convert size="lg" />
            </div>
            {cls ? <p className="text-[11px] text-muted-foreground">{cls.name} · up to {cls.pax} passengers and {cls.bags} bags</p> : null}
            <AddToTrip
              className="w-full"
              productId={product.id}
              ratePlanId={plan.id}
              dateFrom={values.dateFrom}
              dateTo={perDay ? values.dateTo : values.dateFrom}
              quantity={days}
              pax={pax}
              disabled={!availability.available}
              specialRequests={[pickupTime ? `Pickup ${pickupTime}` : "", flightNo ? `Flight ${flightNo}` : "", notes].filter(Boolean).join(" · ")}
              label={availability.available ? "Add to trip" : "No vehicles left"}
            />
            <p className="text-[11px] text-muted-foreground">Transfers confirm instantly — no hold timer needed.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
