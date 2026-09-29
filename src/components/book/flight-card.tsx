"use client";

import * as React from "react";
import { ArrowDownRight, ArrowUpRight, CalendarDays, Clock3, Plane } from "lucide-react";

import type { FareOption, FlightOffer } from "@/providers/inventory/flights";
import { quoteFare } from "@/providers/inventory/flights";
import { cityOf } from "@/store/seed/reference";
import { fmtWeekday, splitLocal } from "@/lib/dates";
import { cn } from "@/lib/utils";

import { Badge } from "@/components/ui/badge";
import { Amount } from "@/components/shared/amount";
import { AirlineLogo, fmtDuration, useAirlineName } from "./bits";

export type OfferTag = "best" | "cheapest" | "fastest";

const TAG: Record<OfferTag, { label: string; variant: "green" | "blue" | "violet" }> = {
  cheapest: { label: "Cheapest", variant: "green" },
  fastest: { label: "Fastest", variant: "blue" },
  best: { label: "Best value", variant: "violet" },
};

/** Departure or arrival: big time, then the airport code and city. */
function End({ local, code, dayOffset, align, dir }: { local: string; code: string; dayOffset?: number; align: "left" | "right"; dir: "dep" | "arr" }) {
  const Icon = dir === "dep" ? ArrowUpRight : ArrowDownRight;
  return (
    <div className={cn("min-w-0", align === "right" && "text-right")}>
      <p className="tnum text-[28px] leading-9 font-semibold tracking-[-0.02em] text-ink">
        {splitLocal(local).time}
        {dayOffset ? <sup className="ml-0.5 text-xs font-bold text-[var(--st-amber-fg)]">+{dayOffset}</sup> : null}
      </p>
      <p className={cn("mt-0.5 flex items-center gap-1.5 text-[13px] text-ink-2", align === "right" && "justify-end")}>
        <span className="grid size-4 shrink-0 place-items-center rounded-full bg-ink text-paper">
          <Icon className="size-3" strokeWidth={2.5} />
        </span>
        <span className="truncate">
          <span className="font-semibold text-ink">{code}</span> ({cityOf(code)})
        </span>
      </p>
    </div>
  );
}

/** One search result, laid out like a boarding card: airline, times, route, then date and price. */
export function FlightCard({
  offer,
  fare,
  pax,
  tags = [],
  onOpen,
  selected,
}: {
  offer: FlightOffer;
  fare: FareOption;
  pax: { adults: number; children: number; infants: number };
  tags?: OfferTag[];
  onOpen: () => void;
  selected?: boolean;
}) {
  const airline = useAirlineName();
  const party = pax.adults + pax.children + pax.infants;
  const quote = quoteFare(offer, fare, pax);
  const flightNos = offer.legs.map((l) => `${l.carrier} ${l.flightNumber}`).join(" · ");

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${airline(offer.carrier)} ${flightNos}, departs ${splitLocal(offer.departureLocal).time}, ${fmtDuration(offer.durationMin)}, ${offer.stops ? `${offer.stops} stop` : "nonstop"}`}
      className={cn(
        "group block w-full rounded-2xl border bg-card p-4 text-left shadow-card transition-[border-color,box-shadow] outline-none hover:border-brand-300 hover:shadow-[0_4px_16px_-6px_rgb(15_23_42/0.14)] focus-visible:border-brand-400 focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--brand-400)_22%,transparent)] sm:p-5",
        selected ? "border-brand-400 ring-1 ring-brand-400" : "border-rule",
      )}
    >
      <div className="flex items-start gap-3">
        <AirlineLogo code={offer.carrier} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] leading-5 font-semibold text-ink">{airline(offer.carrier)}</p>
          <p className="truncate text-[13px] text-ink-3">{offer.legs[0].equipment}</p>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 text-[13px] font-medium text-ink-3">
          <Clock3 className="size-4" />
          <span className="tnum">{fmtDuration(offer.durationMin)}</span>
        </span>
      </div>

      <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-3">
        <End local={offer.departureLocal} code={offer.origin} align="left" dir="dep" />
        <div className="flex flex-col items-center pt-2.5">
          <Plane className="size-5 text-ink-2" />
          <span className={cn("mt-1 text-[11px] font-semibold whitespace-nowrap", offer.stops ? "text-[var(--st-amber-fg)]" : "text-ink-3")}>{offer.stops ? `${offer.stops} stop · ${offer.via.join(", ")}` : "Nonstop"}</span>
        </div>
        <End local={offer.arrivalLocal} code={offer.destination} dayOffset={offer.arrivalDayOffset} align="right" dir="arr" />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-dashed border-rule-2 pt-3.5">
        <span className="flex min-w-0 items-center gap-1.5 text-[13px] text-ink-3">
          <CalendarDays className="size-4 shrink-0" />
          <span className="truncate">
            {fmtWeekday(offer.departureLocal.slice(0, 10))} · {offer.stops ? `via ${offer.via.map(cityOf).join(", ")}` : "Nonstop"}
          </span>
        </span>
        <span className="ml-auto flex items-center gap-2">
          {tags.map((t) => (
            <Badge key={t} variant={TAG[t].variant} className="h-6 px-2 text-xs font-semibold">
              {TAG[t].label}
            </Badge>
          ))}
          <span className="text-right leading-tight">
            <Amount value={party > 1 ? quote.total : quote.perAdult} className="text-lg font-bold text-ink" codeClassName="text-[0.62em] font-semibold" />
            <span className="block text-[11px] text-ink-3">{party > 1 ? `total for ${party}` : "per person"}</span>
          </span>
        </span>
      </div>
      {fare.seatsLeft > 0 && fare.seatsLeft <= 3 && <p className="mt-2 text-right text-xs font-semibold text-[var(--st-red-fg)]">Only {fare.seatsLeft} seat{fare.seatsLeft === 1 ? "" : "s"} left at this price</p>}
    </button>
  );
}
