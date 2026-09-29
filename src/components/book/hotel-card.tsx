"use client";

import Image from "next/image";
import Link from "next/link";
import { Car, Coffee, Dumbbell, Leaf, MapPin, ParkingCircle, Soup, Sparkles, Umbrella, Users, Waves, Wifi, type LucideIcon } from "lucide-react";

import type { Amenity, HotelResult } from "@/providers/inventory/hotels";
import { AMENITY_LABEL, BOARD_LABEL } from "@/providers/inventory/hotels";
import { fmtDay } from "@/lib/dates";

import { Amount } from "@/components/shared/amount";
import { RatingPill, Stars } from "./bits";

export const AMENITY_ICON: Record<Amenity, LucideIcon> = {
  wifi: Wifi,
  pool: Waves,
  breakfast: Coffee,
  restaurant: Soup,
  airport_transfer: Car,
  spa: Sparkles,
  beach: Umbrella,
  parking: ParkingCircle,
  gym: Dumbbell,
  family: Users,
  game_drives: Leaf,
};

export function HotelCard({ result, href }: { result: HotelResult; href: string }) {
  const { hotel, cheapest, nights } = result;
  const perNight = Math.round(cheapest.total / Math.max(1, nights) / 100) * 100;
  return (
    <Link href={href} className="group flex h-full flex-col overflow-hidden rounded-2xl border border-rule bg-card shadow-card transition-[border-color,box-shadow] hover:border-brand-300 hover:shadow-[0_4px_16px_-6px_rgb(15_23_42/0.14)]">
      <span className="relative block aspect-[16/10] overflow-hidden bg-canvas-2">
        <Image src={hotel.images[0]} alt="" fill sizes="(min-width: 1536px) 28vw, (min-width: 640px) 40vw, 92vw" className="object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
        {hotel.supplierName && <span className="absolute top-3 left-3 rounded-full bg-paper/95 px-2.5 py-1 text-xs font-semibold text-ink shadow-sm">Direct contract</span>}
      </span>
      <span className="flex flex-1 flex-col p-4 sm:p-5">
        <span className="flex items-start justify-between gap-3">
          <span className="min-w-0">
            <span className="block text-[17px] leading-6 font-semibold text-ink">{hotel.name}</span>
            <span className="mt-1 flex items-center gap-2 text-[13px] text-ink-3">
              <Stars n={hotel.stars} />
              <span className="flex min-w-0 items-center gap-1 truncate">
                <MapPin className="size-3.5 shrink-0" />
                {hotel.area}
              </span>
            </span>
          </span>
        </span>
        <RatingPill rating={hotel.rating} reviews={hotel.reviews} className="mt-3" />
        <span className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5 text-[13px] text-ink-2">
          {hotel.amenities.slice(0, 4).map((a) => {
            const I = AMENITY_ICON[a];
            return (
              <span key={a} className="flex items-center gap-1.5">
                <I className="size-4 text-ink-3" />
                {AMENITY_LABEL[a]}
              </span>
            );
          })}
        </span>
        <span className="mt-auto flex items-end justify-between gap-3 border-t border-dashed border-rule-2 pt-4">
          <span className="min-w-0 text-[13px] leading-5">
            <span className="block truncate font-medium text-ink-2">
              {cheapest.room.name} · {BOARD_LABEL[cheapest.board]}
            </span>
            {result.freeCancellation ? (
              <span className="block font-semibold text-[var(--st-green-fg)]">Free cancellation{cheapest.refundable && cheapest.freeCancelUntil ? ` until ${fmtDay(cheapest.freeCancelUntil)}` : " available"}</span>
            ) : (
              <span className="block text-ink-3">Non-refundable</span>
            )}
          </span>
          <span className="shrink-0 text-right leading-tight">
            <Amount value={{ amountMinor: cheapest.total, currency: "USD" }} className="text-lg font-bold text-ink" codeClassName="text-[0.62em] font-semibold" />
            <span className="block text-[11px] text-ink-3">
              {nights} night{nights === 1 ? "" : "s"} · <Amount value={{ amountMinor: perNight, currency: "USD" }} className="text-[11px] text-ink-3" codeClassName="hidden" /> a night
            </span>
          </span>
        </span>
      </span>
    </Link>
  );
}
