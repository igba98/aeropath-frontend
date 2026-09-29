"use client";

import * as React from "react";
import { ArrowRight, Briefcase, Check, Clock3, Luggage, RefreshCcw, Undo2 } from "lucide-react";

import type { FareId, FareOption, FlightOffer } from "@/providers/inventory/flights";
import { quoteFare } from "@/providers/inventory/flights";
import { airportName, cityOf } from "@/store/seed/reference";
import { fmtWeekday, splitLocal } from "@/lib/dates";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Amount } from "@/components/shared/amount";
import { AirlineLogo, fmtDuration, useAirlineName } from "./bits";

const CABIN: Record<string, string> = { economy: "Economy", premium_economy: "Premium economy", business: "Business", first: "First" };

/** Timeline of the legs: times, airports, flight and aircraft, and the wait between legs. */
export function LegsTimeline({ offer }: { offer: FlightOffer }) {
  const airline = useAirlineName();
  return (
    <ol className="relative space-y-0">
      {offer.legs.map((l, i) => (
        <li key={`${l.flightNumber}${l.departureLocal}`}>
          <div className="grid grid-cols-[52px_20px_minmax(0,1fr)] gap-x-3">
            <div className="text-right">
              <p className="tnum text-[15px] font-semibold text-ink">{splitLocal(l.departureLocal).time}</p>
              <p className="text-xs text-ink-3">{splitLocal(l.departureLocal).date}</p>
            </div>
            <div className="flex flex-col items-center pt-1.5">
              <span className="size-2.5 rounded-full border-2 border-brand-500 bg-paper" />
              <span className="my-1 w-px flex-1 bg-rule-2" />
            </div>
            <div className="pb-4">
              <p className="text-[15px] font-semibold text-ink">
                {cityOf(l.origin)} <span className="font-mono text-[13px] text-ink-3">{l.origin}</span>
              </p>
              <p className="text-[13px] text-ink-3">{airportName(l.origin)}</p>
              <p className="mt-2 flex flex-wrap items-center gap-x-2 text-[13px] text-ink-2">
                <span className="font-mono font-semibold whitespace-nowrap">
                  {l.carrier} {l.flightNumber}
                </span>
                <span>· {airline(l.carrier)}</span>
                <span>· {l.equipment}</span>
                <span className="text-ink-3">· {fmtDuration(l.durationMin)}</span>
              </p>
            </div>
          </div>
          <div className="grid grid-cols-[52px_20px_minmax(0,1fr)] gap-x-3">
            <div className="text-right">
              <p className="tnum text-[15px] font-semibold text-ink">{splitLocal(l.arrivalLocal).time}</p>
              <p className="text-xs text-ink-3">{splitLocal(l.arrivalLocal).date}</p>
            </div>
            <div className="flex justify-center pt-1.5">
              <span className="size-2.5 rounded-full bg-brand-500" />
            </div>
            <div className={cn(i < offer.legs.length - 1 ? "pb-3" : "")}>
              <p className="text-[15px] font-semibold text-ink">
                {cityOf(l.destination)} <span className="font-mono text-[13px] text-ink-3">{l.destination}</span>
              </p>
              <p className="text-[13px] text-ink-3">{airportName(l.destination)}</p>
            </div>
          </div>
          {i < offer.legs.length - 1 && (
            <p className="my-3 ml-[84px] flex items-center gap-2 rounded-lg bg-[var(--st-amber-bg)] px-3 py-2 text-[13px] font-medium text-[var(--st-amber-fg)]">
              <Clock3 className="size-4 shrink-0" />
              {fmtDuration(offer.layoversMin[i])} stop in {cityOf(l.destination)}. Stay airside; bags go through.
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}

function FareCard({ fare, price, selected, onSelect, perLabel }: { fare: FareOption; price: React.ReactNode; selected: boolean; onSelect: () => void; perLabel: string }) {
  const soldOut = fare.seatsLeft === 0;
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={soldOut}
      onClick={onSelect}
      className={cn(
        "relative flex w-full flex-col rounded-xl border p-4 text-left transition-[border-color,box-shadow,background-color] outline-none focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--brand-400)_22%,transparent)] disabled:cursor-not-allowed disabled:opacity-55",
        selected ? "border-brand-500 bg-band ring-1 ring-brand-500" : "border-rule-2 hover:border-brand-300",
      )}
    >
      <span className="flex items-start justify-between gap-3">
        <span>
          <span className="block text-[15px] font-semibold text-ink">{fare.name}</span>
          <span className="block text-xs text-ink-3">
            {CABIN[fare.cabin]} · class <span className="font-mono">{fare.rbd}</span>
          </span>
        </span>
        <span className={cn("grid size-5 shrink-0 place-items-center rounded-full border-2", selected ? "border-brand-600 bg-brand-600 text-white" : "border-rule-2")}>{selected && <Check className="size-3" strokeWidth={3} />}</span>
      </span>
      <ul className="mt-3 space-y-1.5 text-[13px] text-ink-2">
        <li className="flex gap-2">
          <Luggage className="mt-0.5 size-4 shrink-0 text-ink-3" /> {fare.baggageLabel}
        </li>
        <li className="flex gap-2">
          <Briefcase className="mt-0.5 size-4 shrink-0 text-ink-3" /> {fare.cabinBag}
        </li>
        <li className="flex gap-2">
          <RefreshCcw className="mt-0.5 size-4 shrink-0 text-ink-3" /> {fare.changes}
        </li>
        <li className="flex gap-2">
          <Undo2 className="mt-0.5 size-4 shrink-0 text-ink-3" /> {fare.refund}
        </li>
      </ul>
      <span className="mt-4 flex items-end justify-between gap-2 border-t border-rule pt-3">
        <span className={cn("text-xs font-semibold", soldOut ? "text-[var(--st-red-fg)]" : fare.seatsLeft <= 3 ? "text-[var(--st-red-fg)]" : "text-ink-3")}>
          {soldOut ? "Sold out" : fare.seatsLeft <= 3 ? `${fare.seatsLeft} left` : `${fare.seatsLeft}+ seats`}
        </span>
        <span className="text-right leading-tight">
          {price}
          <span className="block text-[11px] text-ink-3">{perLabel}</span>
        </span>
      </span>
    </button>
  );
}

/**
 * Flight details, as the airline app shows them: the airline, big times with a timeline, then the fares to choose from.
 * `cta` names the next step ("Choose return flight", "Continue to travellers").
 */
export function FlightDetailsSheet({
  offer,
  open,
  onOpenChange,
  pax,
  cabin,
  initialFare,
  cta,
  onChoose,
}: {
  offer: FlightOffer | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pax: { adults: number; children: number; infants: number };
  cabin: "economy" | "business";
  initialFare?: FareId;
  cta: string;
  onChoose: (fare: FareOption) => void;
}) {
  const airline = useAirlineName();
  const [fareId, setFareId] = React.useState<FareId | undefined>(initialFare);
  const [prevOffer, setPrevOffer] = React.useState(offer?.id);
  // Pick the first available fare in the searched cabin whenever a different flight opens.
  if (offer && offer.id !== prevOffer) {
    setPrevOffer(offer.id);
    const first = offer.fares.find((f) => f.seatsLeft > 0 && (cabin === "business" ? f.cabin === "business" : f.cabin !== "business")) ?? offer.fares.find((f) => f.seatsLeft > 0);
    setFareId(initialFare && offer.fares.some((f) => f.id === initialFare && f.seatsLeft > 0) ? initialFare : first?.id);
  }
  const fare = offer?.fares.find((f) => f.id === fareId);
  const party = pax.adults + pax.children + pax.infants;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="sm:max-w-[520px]">
        {offer && (
          <>
            <SheetHeader>
              <SheetTitle>
                {cityOf(offer.origin)} to {cityOf(offer.destination)}
              </SheetTitle>
              <SheetDescription>
                {fmtWeekday(offer.departureLocal.slice(0, 10))} · {party} traveller{party === 1 ? "" : "s"}
              </SheetDescription>
            </SheetHeader>
            <SheetBody className="space-y-6 bg-canvas px-4 py-5 sm:px-5">
              <section className="rounded-2xl border border-rule bg-card p-5 shadow-card">
                <div className="flex flex-col items-center text-center">
                  <AirlineLogo code={offer.carrier} size="lg" />
                  <p className="mt-3 text-[17px] font-semibold text-ink">{airline(offer.carrier)}</p>
                  <p className="text-[13px] text-ink-3">{offer.legs[0].equipment}</p>
                </div>
                <div className="mt-5 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
                  <div>
                    <p className="tnum text-[32px] leading-10 font-semibold tracking-[-0.02em] text-ink">{splitLocal(offer.departureLocal).time}</p>
                    <p className="text-[13px] text-ink-2">
                      <span className="font-semibold text-ink">{offer.origin}</span> ({cityOf(offer.origin)})
                    </p>
                  </div>
                  <ArrowRight className="size-5 text-ink-3" />
                  <div className="text-right">
                    <p className="tnum text-[32px] leading-10 font-semibold tracking-[-0.02em] text-ink">
                      {splitLocal(offer.arrivalLocal).time}
                      {offer.arrivalDayOffset ? <sup className="ml-0.5 text-xs font-bold text-[var(--st-amber-fg)]">+{offer.arrivalDayOffset}</sup> : null}
                    </p>
                    <p className="text-[13px] text-ink-2">
                      <span className="font-semibold text-ink">{offer.destination}</span> ({cityOf(offer.destination)})
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-3 text-[13px] font-medium text-ink-3">
                  <span className="size-2.5 rounded-full bg-[var(--st-green-fg)]" />
                  <span className="h-px flex-1 border-t border-dashed border-rule-2" />
                  <span className="flex items-center gap-1.5">
                    <Clock3 className="size-4" /> {fmtDuration(offer.durationMin)}
                    {offer.stops ? ` · ${offer.stops} stop` : " · Nonstop"}
                  </span>
                  <span className="h-px flex-1 border-t border-dashed border-rule-2" />
                  <span className="size-2.5 rounded-full border-2 border-ink-4" />
                </div>
                <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-rule pt-4 sm:grid-cols-4">
                  {[
                    ["Flight", offer.legs.map((l) => `${l.carrier} ${l.flightNumber}`).join(", ")],
                    ["Class", fare ? CABIN[fare.cabin] : "—"],
                    ["Bags", fare?.baggageLabel ?? "—"],
                    ["Date", splitLocal(offer.departureLocal).date],
                  ].map(([k, v]) => (
                    <div key={k} className="min-w-0">
                      <dt className="text-xs text-ink-3">{k}</dt>
                      <dd className="mt-0.5 truncate text-sm font-semibold text-ink">{v}</dd>
                    </div>
                  ))}
                </dl>
              </section>

              {offer.stops > 0 && (
                <section>
                  <h3 className="mb-3 text-[15px] font-semibold text-ink">Your journey</h3>
                  <div className="rounded-2xl border border-rule bg-card p-4 shadow-card">
                    <LegsTimeline offer={offer} />
                  </div>
                </section>
              )}

              <section>
                <h3 className="text-[15px] font-semibold text-ink">Choose a fare</h3>
                <p className="mb-3 text-[13px] text-ink-3">Prices include taxes{party > 1 ? `, for all ${party} travellers` : ""}.</p>
                <div role="radiogroup" aria-label="Fares" className="grid gap-3">
                  {offer.fares.map((f) => (
                    <FareCard
                      key={f.id}
                      fare={f}
                      selected={f.id === fareId}
                      onSelect={() => setFareId(f.id)}
                      perLabel={party > 1 ? `total for ${party}` : "per person"}
                      price={<Amount value={party > 1 ? quoteFare(offer, f, pax).total : quoteFare(offer, f, pax).perAdult} className="text-lg font-bold text-ink" codeClassName="text-[0.62em] font-semibold" />}
                    />
                  ))}
                </div>
              </section>
            </SheetBody>
            <SheetFooter className="bg-paper sm:justify-stretch">
              <Button size="lg" className="h-12 w-full rounded-xl text-[15px]" disabled={!fare} onClick={() => fare && onChoose(fare)}>
                {cta}
                {fare && (
                  <>
                    <span className="opacity-60">·</span>
                    <Amount value={quoteFare(offer, fare, pax).total} className="font-bold text-current" codeClassName="text-current opacity-80" />
                  </>
                )}
              </Button>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
