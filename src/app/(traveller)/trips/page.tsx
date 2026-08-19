"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Briefcase, CalendarRange, Hourglass, MapPin, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/shared/empty-state";
import { MoneyText } from "@/components/shared/money-text";
import { StatusChip } from "@/components/shared/status-chip";
import { ProductImage } from "@/components/shared/product-image";
import { HoldCountdown } from "@/components/shared/hold-countdown";
import { useSession } from "@/hooks/use-session";
import { useStore } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";
import { useIsPast } from "@/hooks/use-now";
import { formatRange, relativeTime } from "@/lib/format";
import type { Booking, BookingItem } from "@/lib/domain/types";

/** T17 · My Trips. Upcoming, past and cancelled. */
export default function TripsPage() {
  const s = useSession();
  const hydrated = useStore((st) => st.hydrated);
  const bookings = useStore((st) => st.bookings);
  const allItems = useStore((st) => st.items);
  const notifications = useStore(useShallow((st) => st.notifications.filter((n) => n.userId === s.user?.id).slice(0, 4)));
  const [tab, setTab] = useState("upcoming");
  const isPast = useIsPast();

  if (!hydrated) return <Wrap><div className="h-40 animate-pulse rounded-xl bg-muted" /></Wrap>;

  // A guest sees the guest bookings made in this browser; a signed-in user sees their own.
  const mine = Object.values(bookings).filter((b) => {
    if (b.status === "draft") return false;
    if (s.user) return b.buyerUserId === s.user.id;
    return b.buyerUserId === "guest";
  });

  const itemsFor = (b: Booking) => Object.values(allItems).filter((i) => i.bookingId === b.id);
  const startOf = (b: Booking) => itemsFor(b).map((i) => i.travelDateFrom).sort()[0] ?? b.createdAt.slice(0, 10);

  const isCancelled = (b: Booking) => b.status === "cancelled" || b.status === "refunded" || b.status === "expired";
  const isPastTrip = (b: Booking) => !isCancelled(b) && isPast(startOf(b), 86_400_000);
  const isUpcoming = (b: Booking) => !isCancelled(b) && !isPastTrip(b);

  const groups = {
    upcoming: mine.filter(isUpcoming).sort((a, b) => startOf(a).localeCompare(startOf(b))),
    past: mine.filter(isPastTrip).sort((a, b) => startOf(b).localeCompare(startOf(a))),
    cancelled: mine.filter(isCancelled).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  };

  return (
    <Wrap>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">My Trips</h1>
          <p className="text-sm text-muted-foreground">
            {s.user ? `Signed in as ${s.user.name}` : "Bookings made in this browser. Sign in to keep them across devices."}
          </p>
        </div>
        <Button asChild variant="outline"><Link href="/stays">Book something new</Link></Button>
      </div>

      {notifications.length ? (
        <section className="mb-5 rounded-xl border bg-card p-4">
          <h2 className="text-sm font-medium">Recent updates</h2>
          <ul className="mt-2 divide-y">
            {notifications.map((n) => (
              <li key={n.id} className="flex flex-wrap items-baseline justify-between gap-2 py-1.5">
                <span className="text-sm">
                  <span className="font-medium">{n.title}</span>
                  <span className="ml-2 text-muted-foreground">{n.body}</span>
                </span>
                <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{n.channel} · {relativeTime(n.createdAt)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="upcoming">Upcoming {groups.upcoming.length ? `(${groups.upcoming.length})` : ""}</TabsTrigger>
          <TabsTrigger value="past">Past {groups.past.length ? `(${groups.past.length})` : ""}</TabsTrigger>
          <TabsTrigger value="cancelled">Cancelled {groups.cancelled.length ? `(${groups.cancelled.length})` : ""}</TabsTrigger>
        </TabsList>

        {(["upcoming", "past", "cancelled"] as const).map((key) => (
          <TabsContent key={key} value={key} className="mt-4 space-y-3">
            {groups[key].length === 0 ? (
              <EmptyState
                icon={Briefcase}
                title={key === "upcoming" ? "No upcoming trips" : key === "past" ? "Nothing in your history yet" : "No cancelled bookings"}
                description={key === "upcoming" ? "When you book, it appears here with your voucher and the option to amend or cancel." : undefined}
                action={key === "upcoming" ? <Button asChild><Link href="/stays">Find a lodge</Link></Button> : undefined}
              />
            ) : (
              groups[key].map((b) => <TripCard key={b.id} booking={b} items={itemsFor(b)} />)
            )}
          </TabsContent>
        ))}
      </Tabs>
    </Wrap>
  );
}

function TripCard({ booking, items }: { booking: Booking; items: BookingItem[] }) {
  const lead = items[0];
  const dates = items.map((i) => i.travelDateFrom).sort();
  const ends = items.map((i) => i.travelDateTo).sort();
  const pax = booking.travellers.length || (lead?.pax.adults ?? 1) + (lead?.pax.children ?? 0);
  const held = items.find((i) => i.holdExpiresAt && (i.status === "held" || i.status === "pending_payment" || i.status === "pending_approval"));

  return (
    <article className="group relative overflow-hidden rounded-2xl border bg-card transition-shadow hover:shadow-md">
      <div className="flex flex-col sm:flex-row">
        <ProductImage slug={lead?.productId} alt="" className="h-32 w-full shrink-0 sm:h-auto sm:w-44" />
        <div className="flex-1 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <StatusChip status={booking.status} size="sm" />
                <span className="font-mono text-xs text-muted-foreground">{booking.reference}</span>
                {held ? <HoldCountdown expiresAt={held.holdExpiresAt} /> : null}
              </div>
              <h2 className="mt-1.5 font-display text-lg">
                <Link href={`/trips/${booking.reference}`} className="after:absolute after:inset-0 hover:text-brand-text">
                  {lead?.productSnapshot.title ?? "Booking"}
                  {items.length > 1 ? <span className="ml-1.5 text-sm font-normal text-muted-foreground">+{items.length - 1} more</span> : null}
                </Link>
              </h2>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><MapPin className="size-3" aria-hidden /> {lead?.productSnapshot.city}</span>
                {dates[0] ? <span className="flex items-center gap-1"><CalendarRange className="size-3" aria-hidden /> {formatRange(dates[0], ends[ends.length - 1] ?? dates[0])}</span> : null}
                <span className="flex items-center gap-1"><Users className="size-3" aria-hidden /> {pax} {pax === 1 ? "traveller" : "travellers"}</span>
              </p>
              {items.some((i) => i.status === "awaiting_supplier") ? (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-warning-foreground">
                  <Hourglass className="size-3" aria-hidden /> Confirming with the supplier
                </p>
              ) : null}
            </div>
            <div className="text-right">
              <MoneyText minor={booking.totalMinor} currency={booking.currency} convert size="md" />
              <p className="text-[11px] text-muted-foreground">{booking.paymentStatus === "succeeded" ? "paid" : booking.paymentStatus}</p>
              <span className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-text">
                Manage <ArrowRight className="size-3" aria-hidden />
              </span>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-[1100px] px-4 py-6">{children}</div>;
}
