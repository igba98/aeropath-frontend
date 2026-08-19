"use client";

import { useMemo } from "react";
import { useStore } from "@/lib/store";
import { itemsOf } from "@/lib/api";
import type { Booking, BookingItem, PriceBreakdownData, PriceLine } from "@/lib/domain/types";

export interface CartView {
  hydrated: boolean;
  booking?: Booking;
  items: BookingItem[];
  /** all-in breakdown built from the stored item amounts, never recomputed from rate plans */
  breakdown: PriceBreakdownData;
  paxCount: number;
}

export function bookingBreakdown(booking: Booking | undefined, items: BookingItem[]): PriceBreakdownData {
  const currency = booking?.currency ?? "TZS";
  if (!booking) return { currency, lines: [], baseMinor: 0, taxMinor: 0, feeMinor: 0, discountMinor: 0, markupMinor: 0, totalMinor: 0, netMinor: 0, commissionMinor: 0 };
  const lines: PriceLine[] = items.map((i) => ({
    label: `${i.productSnapshot.title} · ${i.productSnapshot.ratePlanName}`,
    amountMinor: i.sellPriceMinor - i.taxMinor - i.feeMinor - i.markupMinor,
    kind: "base",
  }));
  const paxCount = Math.max(1, booking.travellers.length || (items[0]?.pax.adults ?? 1) + (items[0]?.pax.children ?? 0));
  for (const e of booking.extras) {
    lines.push({ label: `${e.label}${e.perPerson ? ` × ${paxCount}` : ""}`, amountMinor: e.perPerson ? e.amountMinor * paxCount : e.amountMinor, kind: "extra" });
  }
  if (booking.markupMinor) lines.push({ label: `Agency markup ${booking.markupPct ?? 0}%`, amountMinor: booking.markupMinor, kind: "markup" });
  if (booking.taxMinor) lines.push({ label: "VAT 18% and tourism levy", amountMinor: booking.taxMinor, kind: "tax" });
  if (booking.feeMinor) lines.push({ label: "Service fee 3%", amountMinor: booking.feeMinor, kind: "fee" });
  if (booking.discountMinor) lines.push({ label: `Promo ${booking.promoCode ?? ""}`.trim(), amountMinor: -booking.discountMinor, kind: "discount" });

  return {
    currency,
    lines,
    baseMinor: booking.subtotalMinor,
    taxMinor: booking.taxMinor,
    feeMinor: booking.feeMinor,
    discountMinor: booking.discountMinor,
    markupMinor: booking.markupMinor,
    totalMinor: booking.totalMinor,
    netMinor: items.reduce((s, i) => s + i.netCostMinor, 0),
    commissionMinor: items.reduce((s, i) => s + i.commissionMinor, 0),
  };
}

export function useCart(): CartView {
  const hydrated = useStore((s) => s.hydrated);
  const cartId = useStore((s) => s.carts[s.session.userId ?? "guest"] ?? null);
  const booking = useStore((s) => (cartId ? s.bookings[cartId] : undefined));
  const allItems = useStore((s) => s.items);

  return useMemo(() => {
    const live = booking && booking.status === "draft" ? booking : undefined;
    const items = live ? Object.values(allItems).filter((i) => i.bookingId === live.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)) : [];
    const paxCount = Math.max(1, live?.travellers.length || (items[0]?.pax.adults ?? 1) + (items[0]?.pax.children ?? 0));
    return { hydrated, booking: live, items, breakdown: bookingBreakdown(live, items), paxCount };
  }, [hydrated, booking, allItems]);
}

export { itemsOf };
