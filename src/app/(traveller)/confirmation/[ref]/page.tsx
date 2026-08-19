"use client";

import { use, Suspense } from "react";
import Link from "next/link";
import { CalendarPlus, CheckCircle2, Clock, Download, Hourglass, Mail, MessageCircle, Phone, Printer, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CheckoutSteps } from "@/features/traveller/checkout-steps";
import { TripItemRow } from "@/features/traveller/trip-item-row";
import { bookingBreakdown } from "@/features/traveller/use-cart";
import { PriceBreakdown } from "@/components/shared/price-breakdown";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusChip } from "@/components/shared/status-chip";
import { useStore } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";
import { RAIL_LABELS } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { BoardingPass } from "@/features/flights/boarding-pass";
import type { Booking, BookingItem } from "@/lib/domain/types";

/**
 * T16 · Confirmation.
 * Shown as soon as payment lands, *before* the supplier has confirmed — the customer has paid,
 * so they get a reference immediately and the pending state is named honestly rather than hidden
 * (flow spec §5.3 decision 3).
 */
export default function ConfirmationPage({ params }: { params: Promise<{ ref: string }> }) {
  return (
    <Suspense fallback={<Wrap><div className="h-40 animate-pulse rounded-xl bg-muted" /></Wrap>}>
      <Body reference={use(params).ref} />
    </Suspense>
  );
}

function Body({ reference }: { reference: string }) {
  const hydrated = useStore((s) => s.hydrated);
  const booking = useStore((s) => Object.values(s.bookings).find((b) => b.reference === reference));
  const items = useStore(useShallow((s) => Object.values(s.items).filter((i) => i.bookingId === booking?.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt))));
  const payment = useStore((s) => Object.values(s.payments).find((p) => p.bookingId === booking?.id && p.status === "succeeded"));
  const products = useStore((s) => s.products);

  if (!hydrated) return <Wrap><div className="h-40 animate-pulse rounded-xl bg-muted" /></Wrap>;
  if (!booking) {
    return (
      <Wrap>
        <EmptyState title="We could not find that booking" description="Check the reference, or find it in My Trips." action={<Button asChild><Link href="/trips">My Trips</Link></Button>} />
      </Wrap>
    );
  }

  const awaiting = items.filter((i) => i.status === "awaiting_supplier" || i.status === "paid");
  const confirmed = items.filter((i) => i.status === "confirmed" || i.status === "used");
  const rejected = items.filter((i) => i.status === "supplier_rejected" || i.status === "refunded");
  const allConfirmed = awaiting.length === 0 && rejected.length === 0 && confirmed.length > 0;
  const breakdown = bookingBreakdown(booking, items);
  const firstTravelDate = items.map((i) => i.travelDateFrom).sort()[0];

  return (
    <Wrap>
      <CheckoutSteps />

      <div className="rounded-2xl border bg-card p-6 text-center">
        <span className="mx-auto flex size-14 items-center justify-center rounded-full bg-success/12">
          {allConfirmed ? <CheckCircle2 className="size-7 text-success" aria-hidden /> : <CheckCircle2 className="size-7 text-success" aria-hidden />}
        </span>
        <h1 className="mt-4 font-display text-3xl">
          {"Payment received"}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Thank you{booking.leadTraveller ? `, ${booking.leadTraveller.firstName}` : ""} — your booking reference is
        </p>
        <p className="mt-2 font-mono text-2xl font-semibold tracking-wide">{booking.reference}</p>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
          <StatusChip status={booking.status} />
          {payment ? (
            <span className="text-xs text-muted-foreground">
              {RAIL_LABELS[payment.rail]}
              {payment.providerReference ? <span className="ml-1 font-mono">{payment.providerReference}</span> : null}
            </span>
          ) : null}
        </div>

        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button className="gap-1.5" onClick={() => toast.success("Voucher generated", { description: `${booking.reference}.pdf — also sent to ${booking.leadTraveller?.email ?? "your email"}.` })}>
            <Download className="size-4" aria-hidden /> Download voucher
          </Button>
          <Button variant="outline" className="gap-1.5" onClick={() => toast.success("Added to your calendar", { description: firstTravelDate ? formatDate(firstTravelDate) : undefined })}>
            <CalendarPlus className="size-4" aria-hidden /> Add to calendar
          </Button>
          <Button variant="outline" className="gap-1.5" onClick={() => { void navigator.clipboard?.writeText(window.location.href); toast.success("Link copied"); }}>
            <Share2 className="size-4" aria-hidden /> Share
          </Button>
          <Button variant="outline" className="gap-1.5" onClick={() => window.print()}>
            <Printer className="size-4" aria-hidden /> Print
          </Button>
        </div>
      </div>

      {/* Honest pending state */}
      {awaiting.length ? (
        <Alert className="mt-4">
          <Hourglass className="size-4" />
          <AlertTitle>Confirming with {awaiting.length === 1 ? "the supplier" : "your suppliers"}, usually under 2 hours</AlertTitle>
          <AlertDescription>
            You have paid and your reference is secure. {awaiting.map((i) => i.productSnapshot.title).join(", ")}{" "}
            {awaiting.length === 1 ? "is" : "are"} being confirmed now. We will text and email you the moment{" "}
            {awaiting.length === 1 ? "it is" : "they are"} confirmed — you do not need to wait on this page.
            If a supplier cannot take the booking, we refund that leg in full automatically.
          </AlertDescription>
        </Alert>
      ) : null}

      {rejected.length ? (
        <Alert variant="destructive" className="mt-4">
          <Clock className="size-4" />
          <AlertTitle>One leg could not be confirmed</AlertTitle>
          <AlertDescription>
            {rejected.map((i) => i.productSnapshot.title).join(", ")} was declined by the supplier and has been refunded in full,
            automatically. Our team is finding you an alternative and will call on {booking.leadTraveller?.phone}.
            The rest of your trip is unaffected.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <FlightPasses booking={booking} items={items} />

          <section>
            <h2 className="mb-2 font-display text-xl">Your itinerary</h2>
            <div className="space-y-3">
              {items.map((item) => (
                <TripItemRow key={item.id} item={item} showStatus slug={products[item.productId]?.slug} />
              ))}
            </div>
          </section>

          <section className="rounded-xl border bg-card p-4">
            <h2 className="font-medium">What happens next</h2>
            <ol className="mt-3 space-y-3">
              <Step done title="Payment received" body={payment ? `${RAIL_LABELS[payment.rail]} · ${payment.providerReference ?? payment.provider}` : "Recorded against your booking"} />
              <Step done={confirmed.length > 0 && awaiting.length === 0} title="Supplier confirms" body="Usually under 2 hours. If a supplier does not respond within 2 hours our operations team steps in." />
              <Step done={false} title="Voucher issued" body="Sent by SMS, WhatsApp and email. It works offline — screenshot it before you travel." />
              <Step done={false} title="Travel" body={firstTravelDate ? `From ${formatDate(firstTravelDate)}. Driver and lodge contacts are on the voucher.` : "Contacts are on the voucher."} />
            </ol>
          </section>

          <section className="rounded-xl border bg-muted/40 p-4">
            <h2 className="font-medium">We have sent your confirmation to</h2>
            <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
              <li className="flex items-center gap-2"><MessageCircle className="size-4" aria-hidden /> WhatsApp · {booking.leadTraveller?.phone}</li>
              <li className="flex items-center gap-2"><Phone className="size-4" aria-hidden /> SMS · {booking.leadTraveller?.phone}</li>
              <li className="flex items-center gap-2"><Mail className="size-4" aria-hidden /> Email · {booking.leadTraveller?.email}</li>
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">
              SMS is a first-class channel here, not an afterthought — it reaches you when data does not.
            </p>
          </section>
        </div>

        <aside>
          <div className="sticky top-20 space-y-3">
            <PriceBreakdown data={breakdown} title="What you paid" />
            <Button variant="outline" className="w-full gap-1.5" onClick={() => toast.success("Receipt generated", { description: "VAT receipt available in My Trips." })}>
              <Download className="size-4" aria-hidden /> Download VAT receipt
            </Button>
            <Button asChild className="w-full">
              <Link href={`/trips/${booking.reference}`}>Manage this booking</Link>
            </Button>
            <Button asChild variant="ghost" className="w-full">
              <Link href="/">Keep exploring</Link>
            </Button>
          </div>
        </aside>
      </div>
    </Wrap>
  );
}

function Step({ done, title, body }: { done: boolean; title: string; body: string }) {
  return (
    <li className="flex gap-3">
      <span className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${done ? "bg-success text-white" : "border bg-background text-muted-foreground"}`}>
        {done ? <CheckCircle2 className="size-3" aria-hidden /> : null}
      </span>
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{body}</span>
      </span>
    </li>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-[1100px] px-4 py-6">{children}</div>;
}

/**
 * A boarding pass per confirmed flight.
 *
 * Only confirmed legs get one — issuing a pass for a seat the airline has not yet confirmed
 * would be telling the traveller something we do not know.
 */
function FlightPasses({ booking, items }: { booking: Booking; items: BookingItem[] }) {
  const products = useStore((s) => s.products);
  const flights = items.filter((i) => i.vertical === "flight" && ["confirmed", "amended", "used"].includes(i.status));
  if (!flights.length) return null;

  return (
    <section>
      <h2 className="mb-2 font-display text-xl">{flights.length === 1 ? "Your boarding pass" : "Your boarding passes"}</h2>
      <div className="space-y-4">
        {flights.map((item) => {
          const a = products[item.productId]?.attributes as {
            carrier?: string; carrierCode?: string; flightNo?: string; cabin?: string;
            from?: string; to?: string; fromCity?: string; toCity?: string;
            departTime?: string; arriveTime?: string; durationMinutes?: number;
          } | undefined;
          const mins = a?.durationMinutes ?? 0;
          const boarding = a?.departTime ? subtractMinutes(a.departTime, 40) : "—";

          return (
            <BoardingPass
              key={item.id}
              data={{
                flightNo: a?.flightNo ?? "—",
                carrier: a?.carrier ?? "",
                carrierCode: a?.carrierCode ?? "",
                cabin: a?.cabin === "business" ? "Business" : "Economy",
                boarding,
                terminal: "1",
                departTime: a?.departTime ?? "—",
                arriveTime: a?.arriveTime ?? "—",
                from: a?.from ?? "—",
                to: a?.to ?? "—",
                fromCity: a?.fromCity ?? item.productSnapshot.city,
                toCity: a?.toCity ?? "",
                duration: `${Math.floor(mins / 60)}h${mins % 60 ? ` ${mins % 60}m` : ""}`,
                reference: item.supplierReference ?? booking.reference,
                passengers: (booking.travellers.length ? booking.travellers : [booking.leadTraveller!].filter(Boolean)).map((t, i) => ({
                  name: `${t.firstName} ${t.lastName}`,
                  type: "Adult",
                  dateOfBirth: t.dateOfBirth ? formatDate(t.dateOfBirth) : undefined,
                  seat: item.seats?.find((sa) => sa.travellerIndex === i)?.seat,
                })),
              }}
            />
          );
        })}
      </div>
    </section>
  );
}

/** Boarding opens before departure; "07:30" minus 40 minutes is "06:50". */
function subtractMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = (h * 60 + m - minutes + 24 * 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
