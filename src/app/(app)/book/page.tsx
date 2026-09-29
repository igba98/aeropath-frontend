"use client";

import * as React from "react";
import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, BedDouble, ClipboardPaste, Plane, UserRound } from "lucide-react";

import { addDaysIso } from "@/providers/util/dates";
import { adultTotal, leadFare, searchFlights } from "@/providers/inventory/flights";
import { HOTELS, HOTEL_DESTINATIONS, hotelRates } from "@/providers/inventory/hotels";
import { cityOf } from "@/store/seed/reference";
import { useApp } from "@/store";

import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader, Section } from "@/components/shared/page";
import { Amount } from "@/components/shared/amount";
import { FlightSearchForm, HotelSearchForm } from "@/components/book/search-form";
import { fmtDuration } from "@/components/book/bits";
import { flightQs, hotelQs, readFlightQuery, readHotelQuery } from "@/components/book/query";
import { useBookCtx } from "@/components/book/use-book";

export default function BookPage() {
  return (
    <Suspense>
      <Book />
    </Suspense>
  );
}

const ROUTES: [string, string][] = [
  ["DAR", "ZNZ"],
  ["DAR", "JRO"],
  ["DAR", "MWZ"],
  ["ZNZ", "ARK"],
  ["DAR", "SEU"],
  ["DAR", "DXB"],
  ["DAR", "NBO"],
  ["DAR", "IST"],
];

function Book() {
  const sp = useSearchParams();
  const router = useRouter();
  const { today, fx } = useBookCtx();
  const tab = sp.get("tab") === "hotels" ? "hotels" : "flights";
  const clientParam = sp.get("client");
  const client = useApp((s) => (clientParam ? s.db?.clients[clientParam] : undefined));
  const keep = client ? `client=${client.id}` : "";
  const flightQ = React.useMemo(() => readFlightQuery(new URLSearchParams(keep), today), [keep, today]);
  const hotelQ = React.useMemo(() => readHotelQuery(new URLSearchParams(keep), today), [keep, today]);
  const soon = addDaysIso(today, 14);

  // Live "from" prices for the popular routes, two weeks out.
  const routes = React.useMemo(
    () =>
      ROUTES.map(([from, to]) => {
        const offers = searchFlights({ from, to, date: soon, adults: 1, children: 0, infants: 0, cabin: "economy" }, { today, fx });
        const priced = offers.map((o) => ({ o, f: leadFare(o, "economy") })).filter((x) => x.f);
        const cheapest = priced.sort((a, b) => adultTotal(a.f!) - adultTotal(b.f!))[0];
        const fastest = [...offers].sort((a, b) => a.durationMin - b.durationMin)[0];
        return { from, to, cheapest, fastest, count: offers.length };
      }),
    [soon, today, fx],
  );

  const destinations = React.useMemo(
    () =>
      HOTEL_DESTINATIONS.map((d) => {
        const hotels = HOTELS.filter((h) => h.destination === d.code);
        const s = { destination: d.code, checkIn: soon, checkOut: addDaysIso(soon, 3), adults: 2, children: 0, rooms: 1 };
        const from = Math.min(...hotels.map((h) => (hotelRates(h, s, today)[0]?.total ?? Infinity) / 3));
        return { d, hotels, from: Number.isFinite(from) ? Math.round(from / 100) * 100 : null, image: hotels[0]?.images[0] };
      }),
    [soon, today],
  );

  return (
    <>
      <PageHeader title="Search and book" meta={<span>Find a flight or a hotel, pick one and book it for your client in a few steps.</span>} />

      {client && (
        <p className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-brand-200 bg-band px-4 py-3 text-sm text-ink-2 dark:border-brand-800">
          <UserRound className="size-4 text-brand-600" />
          Booking for <span className="font-semibold text-ink">{client.name}</span>
          <Link href={tab === "hotels" ? "/book?tab=hotels" : "/book"} className="ml-auto font-semibold text-brand-700 hover:underline dark:text-brand-300">
            Book for someone else
          </Link>
        </p>
      )}

      <Tabs value={tab} onValueChange={(v) => router.replace(`/book?${[v === "hotels" ? "tab=hotels" : "", keep].filter(Boolean).join("&")}`, { scroll: false })} className="gap-4">
        <TabsList>
          <TabsTrigger value="flights">
            <Plane /> Flights
          </TabsTrigger>
          <TabsTrigger value="hotels">
            <BedDouble /> Hotels
          </TabsTrigger>
        </TabsList>
        <Card className="block p-4 sm:p-5">{tab === "flights" ? <FlightSearchForm initial={flightQ} today={today} /> : <HotelSearchForm initial={hotelQ} today={today} />}</Card>
      </Tabs>

      <div className="mt-8">
        {tab === "flights" ? (
          <Section bare title="Popular routes" description={`Lowest fare for one adult on ${new Date(`${soon}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}. Click to search that day.`}>
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {routes.map((r) => (
                <li key={`${r.from}${r.to}`}>
                  <Link
                    href={`/book/flights?${flightQs({ ...flightQ, from: r.from, to: r.to, depart: soon })}`}
                    className="group flex h-full flex-col rounded-xl border border-rule bg-paper p-4 transition-colors hover:border-brand-300 hover:bg-band-hover"
                  >
                    <span className="flex items-center gap-2 text-[15px] font-semibold text-ink">
                      {cityOf(r.from)} <ArrowRight className="size-4 text-brand-500" /> {cityOf(r.to)}
                    </span>
                    <span className="mt-1 text-[13px] text-ink-3">
                      {r.count ? `${r.count} flight${r.count === 1 ? "" : "s"} · from ${fmtDuration(r.fastest.durationMin)}${r.fastest.stops ? "" : " nonstop"}` : "No flights that day"}
                    </span>
                    <span className="mt-auto flex items-end justify-between gap-2 pt-4">
                      {r.cheapest ? (
                        <span>
                          <span className="block text-xs text-ink-3">from</span>
                          <Amount value={{ amountMinor: adultTotal(r.cheapest.f!), currency: r.cheapest.o.currency }} className="text-lg font-bold text-ink" codeClassName="text-[0.6em] font-semibold" />
                        </span>
                      ) : (
                        <span />
                      )}
                      <ArrowRight className="size-4 text-ink-4 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600" />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        ) : (
          <Section bare title="Where our partner hotels are" description="Average nightly price for two adults, two weeks from today.">
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
              {destinations.map(({ d, hotels, from, image }) => (
                <li key={d.code}>
                  <Link href={`/book/hotels?${hotelQs({ ...hotelQ, dest: d.code, checkIn: soon, checkOut: addDaysIso(soon, 3) })}`} className="group block overflow-hidden rounded-xl border border-rule bg-paper transition-colors hover:border-brand-300">
                    <span className="relative block aspect-[16/10] bg-canvas-2">{image && <Image src={image} alt="" fill sizes="(min-width: 1536px) 20vw, (min-width: 1280px) 30vw, (min-width: 640px) 45vw, 90vw" className="object-cover transition-transform duration-300 group-hover:scale-[1.03]" />}</span>
                    <span className="block p-4">
                      <span className="block text-[15px] font-semibold text-ink">{d.name}</span>
                      <span className="mt-0.5 block truncate text-[13px] text-ink-3">
                        {hotels.length} hotel{hotels.length === 1 ? "" : "s"} · {d.hint}
                      </span>
                      {from !== null && (
                        <span className="mt-3 block text-sm text-ink-3">
                          from <Amount value={{ amountMinor: from, currency: "USD" }} className="font-bold text-ink" /> a night
                        </span>
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>

      <p className="mt-6 flex flex-wrap items-center gap-2 text-sm text-ink-3">
        <ClipboardPaste className="size-4" />
        Already booked it in Amadeus?
        <Link href="/bookings/new?paste=1" className="font-semibold text-brand-700 hover:underline dark:text-brand-300">
          Paste the PNR instead
        </Link>
      </p>
    </>
  );
}
