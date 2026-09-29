"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight, PlaneLanding, PlaneTakeoff, Search } from "lucide-react";

import type { ISODate } from "@/domain/types";
import { addDaysIso, diffDaysIso } from "@/providers/util/dates";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/shared/page";
import { AirportField, DateField, DestinationField, GuestsField, TravellersField } from "./fields";
import { flightQs, hotelQs, nightsBetween, type FlightQuery, type HotelQuery } from "./query";

/** Starts from `initial`; give it a `key` from the URL so a new search resets it. */
export function FlightSearchForm({ initial, today, onSearched, className }: { initial: FlightQuery; today: ISODate; onSearched?: () => void; className?: string }) {
  const router = useRouter();
  const [q, setQ] = React.useState<FlightQuery>(initial);
  const [roundTrip, setRoundTrip] = React.useState(Boolean(initial.ret));
  const [tried, setTried] = React.useState(false);

  const missingTo = !q.to;
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (missingTo) return;
    const next = { ...q, ret: roundTrip ? (q.ret ?? addDaysIso(q.depart, 7)) : undefined };
    router.push(`/book/flights?${flightQs(next)}`);
    onSearched?.();
  };

  const setDepart = (d: ISODate) => setQ((v) => ({ ...v, depart: d, ret: v.ret && diffDaysIso(v.ret, d) < 0 ? addDaysIso(d, 7) : v.ret }));

  return (
    <form onSubmit={submit} className={cn("space-y-3", className)} noValidate>
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-5">
        <div className="relative grid gap-2 sm:grid-cols-2 lg:col-span-2">
          <AirportField label="From" icon={PlaneTakeoff} value={q.from} exclude={q.to} onChange={(from) => setQ((v) => ({ ...v, from }))} />
          <AirportField label="To" icon={PlaneLanding} value={q.to} exclude={q.from} invalid={tried && missingTo} onChange={(to) => setQ((v) => ({ ...v, to }))} />
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Swap from and to"
            onClick={() => setQ((v) => ({ ...v, from: v.to || v.from, to: v.to ? v.from : v.to }))}
            className="absolute top-1/2 right-4 z-10 -translate-y-1/2 rounded-full bg-paper shadow-sm max-sm:rotate-90 sm:right-auto sm:left-1/2 sm:-translate-x-1/2"
          >
            <ArrowLeftRight />
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2 lg:col-span-2">
          <DateField label="Depart" value={q.depart} min={today} onChange={setDepart} />
          <DateField
            label="Return"
            value={roundTrip ? q.ret : undefined}
            min={q.depart}
            placeholder="Add return"
            sub={roundTrip ? undefined : "One way"}
            onChange={(d) => {
              setRoundTrip(true);
              setQ((v) => ({ ...v, ret: d }));
            }}
            onClear={() => {
              setRoundTrip(false);
              setQ((v) => ({ ...v, ret: undefined }));
            }}
          />
        </div>
        <TravellersField value={q} onChange={(p) => setQ((v) => ({ ...v, ...p }))} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Trip type"
          value={roundTrip ? "return" : "oneway"}
          onChange={(v) => {
            setRoundTrip(v === "return");
            setQ((x) => ({ ...x, ret: v === "return" ? (x.ret ?? addDaysIso(x.depart, 7)) : undefined }));
          }}
          options={[
            { value: "return", label: "Return" },
            { value: "oneway", label: "One way" },
          ]}
        />
        <Button type="submit" size="lg" className="h-12 rounded-xl px-8 text-base max-sm:w-full">
          <Search className="size-5" /> Search flights
        </Button>
      </div>
      {tried && missingTo && (
        <p className="text-sm font-medium text-destructive" role="alert">
          Choose where the flight is going.
        </p>
      )}
    </form>
  );
}

export function HotelSearchForm({ initial, today, onSearched, className }: { initial: HotelQuery; today: ISODate; onSearched?: () => void; className?: string }) {
  const router = useRouter();
  const [q, setQ] = React.useState<HotelQuery>(initial);
  const [tried, setTried] = React.useState(false);
  const nights = nightsBetween(q.checkIn, q.checkOut);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (!q.dest) return;
    router.push(`/book/hotels?${hotelQs(q)}`);
    onSearched?.();
  };

  return (
    <form onSubmit={submit} className={cn("space-y-3", className)} noValidate>
      <div className="grid grid-cols-1 gap-2 lg:grid-cols-5">
        <DestinationField className="lg:col-span-2" value={q.dest} invalid={tried && !q.dest} onChange={(dest) => setQ((v) => ({ ...v, dest }))} />
        <div className="grid grid-cols-2 gap-2 lg:col-span-2">
          <DateField
            label="Check in"
            value={q.checkIn}
            min={today}
            onChange={(d) => setQ((v) => ({ ...v, checkIn: d, checkOut: diffDaysIso(v.checkOut, d) >= 1 && diffDaysIso(v.checkOut, d) <= 30 ? v.checkOut : addDaysIso(d, Math.max(1, nights)) }))}
          />
          <DateField label="Check out" value={q.checkOut} min={addDaysIso(q.checkIn, 1)} sub={`${nights} night${nights === 1 ? "" : "s"}`} onChange={(d) => setQ((v) => ({ ...v, checkOut: d }))} />
        </div>
        <GuestsField value={q} onChange={(g) => setQ((v) => ({ ...v, ...g }))} />
      </div>
      <div className="flex justify-end">
        <Button type="submit" size="lg" className="h-12 rounded-xl px-8 text-base max-sm:w-full">
          <Search className="size-5" /> Search hotels
        </Button>
      </div>
      {tried && !q.dest && (
        <p className="text-sm font-medium text-destructive" role="alert">
          Choose where you&rsquo;re staying.
        </p>
      )}
    </form>
  );
}
