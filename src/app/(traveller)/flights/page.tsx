"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, Briefcase, Luggage } from "lucide-react";
import { ResultsShell } from "@/features/traveller/results-shell";
import { Button } from "@/components/ui/button";
import { MoneyText } from "@/components/shared/money-text";
import { Pill } from "@/components/shared/status-chip";
import { AirlineLogo } from "@/components/shared/airline-logo";
import { Ticket, TicketPerforation, FlightPath, TicketBadge } from "@/features/flights/ticket-card";
import { useStore } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";
import { catalog, type SearchHit } from "@/lib/api";
import { computePrice } from "@/lib/domain/pricing";
import { addDays, formatDateShort } from "@/lib/format";
import { cn } from "@/lib/utils";

/** T03 · Search results, flights. Date strip plus fare family matrix. */
export default function FlightsPage() {
  return (
    <Suspense>
      <ResultsShell
        vertical="flight"
        title="Flights"
        subtitle="All-in fares per passenger, taxes included"
        renderResults={(hits, query) => (
          <div className="space-y-4">
            <DateStrip />
            {hits.map((h) => <FlightCard key={h.product.id} hit={h} query={query} />)}
          </div>
        )}
      />
    </Suspense>
  );
}

/** Cheapest fare across the days around the selected departure. */
function DateStrip() {
  const params = useSearchParams();
  const router = useRouter();
  const data = useStore((s) => s);
  const hydrated = useStore((s) => s.hydrated);
  const selected = params.get("dateFrom") ?? "";
  if (!hydrated || !selected) return null;

  const days = Array.from({ length: 7 }, (_, i) => addDays(selected, i - 3));

  return (
    <div className="no-scrollbar flex gap-2 overflow-x-auto rounded-xl border bg-card p-2">
      {days.map((d) => {
        const hits = catalog.search({ vertical: "flight", dateFrom: d, dateTo: d, adults: Number(params.get("adults") ?? 1), from: params.get("from") ?? undefined, to: params.get("to") ?? undefined, sort: "price_asc" }, data);
        const cheapest = hits[0];
        const active = d === selected;
        return (
          <button
            key={d}
            onClick={() => { const n = new URLSearchParams(params.toString()); n.set("dateFrom", d); n.set("dateTo", d); router.replace(`?${n.toString()}`, { scroll: false }); }}
            className={cn("flex min-w-[92px] shrink-0 flex-col items-center rounded-lg px-3 py-2 text-center transition-colors", active ? "bg-brand-50 ring-1 ring-brand-300" : "hover:bg-muted")}
            aria-pressed={active}
          >
            <span className="text-xs text-muted-foreground">{formatDateShort(d)}</span>
            {cheapest ? (
              <MoneyText minor={cheapest.unitMinor} currency="TZS" convert size="sm" showCurrency={false} className={cn("mt-0.5", active && "text-brand-text-strong")} />
            ) : (
              <span className="mt-0.5 text-xs text-muted-foreground">—</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function FlightCard({ hit, query }: { hit: SearchHit; query: string }) {
  const p = hit.product;
  const plans = useStore(useShallow((st) => catalog.ratePlansFor(p.id, st)));
  const a = p.attributes as { carrier: string; carrierCode: string; flightNo: string; from: string; to: string; fromCity: string; toCity: string; departTime: string; arriveTime: string; durationMinutes: number; aircraft: string; cabin: string; stops: number };
  const params = new URLSearchParams(query);
  const pax = { adults: Number(params.get("adults") ?? 1), children: Number(params.get("children") ?? 0), infants: Number(params.get("infants") ?? 0) };

  const hours = Math.floor(a.durationMinutes / 60);
  const mins = a.durationMinutes % 60;
  const duration = `${hours}h${mins ? ` ${mins}m` : ""}`;
  const cheapest = plans.reduce((lo, rp) => {
    const t = computePrice({ vertical: "flight", ratePlan: rp, nights: 1, quantity: 1, pax }).totalMinor;
    return t < lo.total ? { rp, total: t } : lo;
  }, { rp: plans[0], total: Number.POSITIVE_INFINITY });

  return (
    <Ticket interactive>
      {/* Carrier stub */}
      <div className="m-3 flex flex-wrap items-center gap-3 rounded-xl bg-muted/60 px-4 py-3">
        <AirlineLogo carrier={a.carrier} code={a.carrierCode} size="md" />
        <div className="min-w-0">
          <p className="font-medium leading-tight">{a.carrier}</p>
          <p className="text-sm text-muted-foreground">{a.aircraft}</p>
        </div>
        <div className="ml-auto text-right">
          <p className="font-medium text-brand-text">{hit.unitsLeft} seat{hit.unitsLeft === 1 ? "" : "s"}</p>
          <p className="text-sm text-muted-foreground">{a.cabin === "business" ? "Business" : "Economy"} class</p>
        </div>
      </div>

      <div className="px-5 pb-1 pt-2">
        <FlightPath
          departTime={a.departTime}
          arriveTime={a.arriveTime}
          from={a.from}
          to={a.to}
          fromCity={a.fromCity}
          toCity={a.toCity}
          duration={duration}
          stops={a.stops}
        />
      </div>

      <TicketPerforation className="mt-4" />

      {/* Fares. Each is its own row so a carrier offering one fare does not leave empty columns. */}
      <div className="space-y-2 p-5 pt-4">
        {plans.map((rp) => {
          const price = computePrice({ vertical: "flight", ratePlan: rp, nights: 1, quantity: 1, pax });
          const isCheapest = plans.length > 1 && rp.id === cheapest.rp?.id;
          return (
            <div key={rp.id} className="flex flex-wrap items-center gap-3 rounded-xl border p-3.5 transition-colors hover:border-brand-300">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {rp.name}
                  {isCheapest ? <TicketBadge tone="cheapest">Cheapest</TicketBadge> : null}
                  {rp.label ? <Pill tone="brand">{rp.label}</Pill> : null}
                </p>
                <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-muted-foreground">
                  {rp.inclusions.map((i) => (
                    <li key={i} className="flex items-center gap-1.5">
                      {i.toLowerCase().includes("bag") ? <Luggage className="size-3.5" aria-hidden /> : <Briefcase className="size-3.5" aria-hidden />} {i}
                    </li>
                  ))}
                  <li className={rp.refundable ? "text-success-foreground" : ""}>
                    {rp.refundable ? "Changeable and refundable" : "Non refundable"}
                  </li>
                </ul>
              </div>
              <div className="ml-auto flex items-center gap-4">
                <div className="text-right">
                  <MoneyText minor={price.totalMinor} currency={rp.currency} convert size="lg" />
                  <p className="text-sm text-muted-foreground">total for {pax.adults + pax.children + pax.infants} pax</p>
                </div>
                <Button asChild size="lg">
                  <Link href={`/flights/${p.slug}?${query}&rate=${rp.id}`}>Select <ArrowRight className="size-4" aria-hidden /></Link>
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </Ticket>
  );
}
