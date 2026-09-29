"use client";

import * as React from "react";
import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { BedDouble, Check, Clock, MapPin, Ruler, Users } from "lucide-react";

import { AMENITY_LABEL, BOARD_LABEL, findDestination, findHotel, hotelRates, type RoomRate } from "@/providers/inventory/hotels";
import { fmtDay, fmtWeekday } from "@/lib/dates";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader } from "@/components/shared/page";
import { Amount } from "@/components/shared/amount";
import { AMENITY_ICON } from "@/components/book/hotel-card";
import { RatingPill, Stars } from "@/components/book/bits";
import { Steps } from "@/components/book/steps";
import { guestsLabel, hotelQs, nightsBetween } from "@/components/book/query";
import { useBookCtx, useHotelQuery } from "@/components/book/use-book";

export default function HotelPage() {
  return (
    <Suspense>
      <HotelDetail />
    </Suspense>
  );
}

function HotelDetail() {
  const { hotelId } = useParams<{ hotelId: string }>();
  const hotel = findHotel(hotelId);
  const { q, qs } = useHotelQuery();
  const { today } = useBookCtx();
  const nights = nightsBetween(q.checkIn, q.checkOut);
  const search = { destination: hotel?.destination ?? q.dest, checkIn: q.checkIn, checkOut: q.checkOut, adults: q.adults, children: q.children, rooms: q.rooms };
  const rates = React.useMemo(() => (hotel ? hotelRates(hotel, search, today) : []), [hotelId, qs, today]); // eslint-disable-line react-hooks/exhaustive-deps
  const resultsHref = `/book/hotels?${hotelQs({ ...q, dest: hotel?.destination ?? q.dest })}`;

  if (!hotel) {
    return (
      <Card className="block">
        <EmptyState icon={BedDouble} title="Hotel not found" action={<Button asChild><Link href="/book?tab=hotels">Search hotels</Link></Button>} />
      </Card>
    );
  }

  const dest = findDestination(hotel.destination);
  const byRoom = hotel.rooms.map((room) => ({ room, rates: rates.filter((r) => r.room.id === room.id) }));
  const cheapest = rates.filter((r) => r.left >= q.rooms)[0];

  return (
    <>
      <PageHeader
        back={{ href: resultsHref, label: `Hotels in ${dest?.name ?? hotel.destination}` }}
        title={hotel.name}
        meta={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Stars n={hotel.stars} />
            <span className="flex items-center gap-1">
              <MapPin className="size-4" /> {hotel.area}, {dest?.name}
            </span>
          </span>
        }
      />
      <Steps className="mb-6" steps={["Choose a hotel", "Choose a room", "Guests and booking"]} current={2} />

      <div className="grid gap-2 sm:grid-cols-3 sm:grid-rows-2">
        {hotel.images.slice(0, 3).map((src, i) => (
          <div key={src} className={cn("relative overflow-hidden rounded-xl bg-canvas-2", i === 0 ? "aspect-[16/10] sm:col-span-2 sm:row-span-2 sm:aspect-auto sm:min-h-[340px]" : "hidden aspect-[16/10] sm:block")}>
            <Image src={src} alt="" fill priority={i === 0} sizes={i === 0 ? "(min-width: 640px) 60vw, 92vw" : "30vw"} className="object-cover" />
          </div>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-8">
          <section>
            <RatingPill rating={hotel.rating} reviews={hotel.reviews} />
            <p className="mt-3 max-w-2xl text-[15px] leading-7 text-ink-2">{hotel.blurb}</p>
            <ul className="mt-4 flex flex-wrap gap-2">
              {hotel.amenities.map((a) => {
                const I = AMENITY_ICON[a];
                return (
                  <li key={a} className="flex items-center gap-2 rounded-full border border-rule bg-paper px-3 py-1.5 text-[13px] font-medium text-ink-2">
                    <I className="size-4 text-ink-3" /> {AMENITY_LABEL[a]}
                  </li>
                );
              })}
            </ul>
          </section>

          <section aria-labelledby="rooms-h">
            <h2 id="rooms-h" className="text-[20px] font-semibold text-ink">
              Choose a room
            </h2>
            <p className="mt-1 text-sm text-ink-3">
              Prices are for {nights} night{nights === 1 ? "" : "s"}, {guestsLabel(q)}, taxes included.
            </p>
            <div className="mt-4 space-y-4">
              {byRoom.map(({ room, rates: rr }) => (
                <Card key={room.id} className="block overflow-hidden py-0">
                  <div className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5 pb-4">
                    <div>
                      <h3 className="text-[17px] font-semibold text-ink">{room.name}</h3>
                      <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-3">
                        <span className="flex items-center gap-1.5">
                          <BedDouble className="size-4" /> {room.bed}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Ruler className="size-4" /> {room.sizeM2} m²
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Users className="size-4" /> Up to {room.maxAdults} adults{room.maxChildren ? ` and ${room.maxChildren} ${room.maxChildren === 1 ? "child" : "children"}` : ""}
                        </span>
                      </p>
                    </div>
                    {rr[0] && rr[0].left > 0 && rr[0].left <= 2 && <Badge variant="red">Only {rr[0].left} left</Badge>}
                  </div>
                  {rr.length === 0 ? (
                    <p className="border-t border-rule bg-canvas px-5 py-4 text-sm text-ink-3">This room does not fit {guestsLabel(q)}. Try more rooms.</p>
                  ) : rr.every((r) => r.left < q.rooms) ? (
                    <p className="border-t border-rule bg-canvas px-5 py-4 text-sm font-medium text-ink-3">Sold out for these dates.</p>
                  ) : (
                    <ul className="divide-y divide-rule border-t border-rule">
                      {rr.map((r) => (
                        <RateRow key={r.id} rate={r} nights={nights} rooms={q.rooms} href={`/book/hotels/checkout?${hotelQs({ ...q, dest: hotel.destination }, { hotel: hotel.id, rate: r.id })}`} />
                      ))}
                    </ul>
                  )}
                </Card>
              ))}
            </div>
          </section>
        </div>

        <aside className="hidden lg:block">
          <Card className="sticky top-20 block p-5">
            <h2 className="text-[17px] font-semibold text-ink">Your stay</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-ink-3">Check in</dt>
                <dd className="font-medium text-ink">{fmtWeekday(q.checkIn)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-3">Check out</dt>
                <dd className="font-medium text-ink">{fmtWeekday(q.checkOut)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-3">Guests</dt>
                <dd className="font-medium text-ink">{guestsLabel(q)}</dd>
              </div>
            </dl>
            {cheapest && (
              <p className="mt-4 border-t border-rule pt-4 text-sm text-ink-3">
                From <Amount value={{ amountMinor: cheapest.total, currency: "USD" }} className="text-lg font-bold text-ink" /> for {nights} night{nights === 1 ? "" : "s"}
              </p>
            )}
            <Button variant="outline" className="mt-4 w-full" asChild>
              <Link href={resultsHref}>Change dates or guests</Link>
            </Button>
          </Card>
        </aside>
      </div>
    </>
  );
}

function RateRow({ rate, nights, rooms, href }: { rate: RoomRate; nights: number; rooms: number; href: string }) {
  const soldOut = rate.left < rooms;
  return (
    <li className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 text-[15px] font-semibold text-ink">
          <Check className="size-4 text-[var(--st-green-fg)]" />
          {BOARD_LABEL[rate.board]}
        </p>
        <p className={cn("mt-1 flex items-center gap-2 text-[13px]", rate.refundable ? "font-medium text-[var(--st-green-fg)]" : "text-ink-3")}>
          <Clock className="size-4" />
          {rate.refundable ? `Free cancellation until ${fmtDay(rate.freeCancelUntil)}` : "Non-refundable, lowest price"}
        </p>
      </div>
      <div className="text-right leading-tight">
        <Amount value={{ amountMinor: rate.total, currency: "USD" }} className="text-lg font-bold text-ink" codeClassName="text-[0.62em] font-semibold" />
        <span className="block text-[11px] text-ink-3">
          {nights} night{nights === 1 ? "" : "s"}
          {rooms > 1 ? `, ${rooms} rooms` : ""}
        </span>
      </div>
      {soldOut ? (
        <Button variant="outline" disabled className="min-w-[110px]">
          Sold out
        </Button>
      ) : (
        <Button asChild className="min-w-[110px]">
          <Link href={href}>Choose</Link>
        </Button>
      )}
    </li>
  );
}
