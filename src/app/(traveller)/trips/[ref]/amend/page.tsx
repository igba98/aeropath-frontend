"use client";

import { use, Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, CalendarRange, Info, Loader2, Users } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/shared/empty-state";
import { MoneyText } from "@/components/shared/money-text";
import { TripItemRow } from "@/features/traveller/trip-item-row";
import { useStore } from "@/lib/store";
import { bookingOps, catalog } from "@/lib/api";
import { computePrice, nightsBetween } from "@/lib/domain/pricing";
import { formatRange } from "@/lib/format";
import { cn } from "@/lib/utils";

type Kind = "date_change" | "pax_change" | "room_change";

/** T19 · Amend request. Date, pax or room change, showing the fare difference before submitting. */
export default function AmendPage({ params }: { params: Promise<{ ref: string }> }) {
  return (
    <Suspense fallback={<Wrap><div className="h-40 animate-pulse rounded-xl bg-muted" /></Wrap>}>
      <Body reference={use(params).ref} />
    </Suspense>
  );
}

function Body({ reference }: { reference: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const hydrated = useStore((s) => s.hydrated);
  const data = useStore((s) => s);
  const booking = Object.values(data.bookings).find((b) => b.reference === reference);
  const allItems = Object.values(data.items).filter((i) => i.bookingId === booking?.id);
  const amendable = allItems.filter((i) => ["confirmed", "amended", "paid", "awaiting_supplier"].includes(i.status));

  const [itemId, setItemId] = useState(sp.get("item") ?? amendable[0]?.id ?? "");
  const [kind, setKind] = useState<Kind>("date_change");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [adults, setAdults] = useState(0);
  const [children, setChildren] = useState(0);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  if (!hydrated) return <Wrap><div className="h-40 animate-pulse rounded-xl bg-muted" /></Wrap>;
  if (!booking) return <Wrap><EmptyState title="Booking not found" action={<Button asChild><Link href="/trips">My Trips</Link></Button>} /></Wrap>;
  if (!amendable.length) {
    return (
      <Wrap>
        <EmptyState
          title="Nothing can be changed on this booking"
          description="Only confirmed or paid items can be amended. Contact support if you think this is wrong."
          action={<Button asChild><Link href={`/trips/${reference}`}>Back to the booking</Link></Button>}
        />
      </Wrap>
    );
  }

  const item = allItems.find((i) => i.id === itemId) ?? amendable[0];
  const ratePlan = data.ratePlans[item.ratePlanId];
  const product = data.products[item.productId];

  const newFrom = dateFrom || item.travelDateFrom;
  const newTo = dateTo || item.travelDateTo;
  const newPax = { adults: adults || item.pax.adults, children: children || item.pax.children, infants: item.pax.infants };

  // Fare difference: reprice at the current rate plan for the requested shape
  const nights = item.vertical === "stay" ? nightsBetween(newFrom, newTo) : 1;
  const repriced = ratePlan
    ? computePrice({ vertical: item.vertical, ratePlan, nights, quantity: item.quantity, pax: newPax, buyerType: booking.buyerType, markupPct: booking.markupPct })
    : undefined;
  const difference = repriced ? repriced.totalMinor - item.sellPriceMinor : 0;

  const availability = product ? catalog.availability(data, product, newFrom, newTo, item.quantity) : { available: true, unitsLeft: 0 };
  const changed = kind === "date_change" ? (newFrom !== item.travelDateFrom || newTo !== item.travelDateTo) : (newPax.adults !== item.pax.adults || newPax.children !== item.pax.children);

  const detail =
    kind === "date_change"
      ? `Move to ${formatRange(newFrom, newTo)} (was ${formatRange(item.travelDateFrom, item.travelDateTo)})`
      : kind === "pax_change"
        ? `Change to ${newPax.adults} adult${newPax.adults === 1 ? "" : "s"}${newPax.children ? `, ${newPax.children} children` : ""} (was ${item.pax.adults} adults${item.pax.children ? `, ${item.pax.children} children` : ""})`
        : `Change room or vehicle type${note ? ` — ${note}` : ""}`;

  function submit() {
    if (kind !== "room_change" && !changed) return toast.error("Nothing has changed yet", { description: "Adjust the dates or the party size first." });
    if (kind === "room_change" && !note.trim()) return toast.error("Tell us what you would like instead");
    setBusy(true);
    try {
      bookingOps.requestAmendment(item.id, kind, detail, difference);
      toast.success("Change requested", {
        description: difference > 0
          ? `Our team will confirm with the supplier and collect the ${new Intl.NumberFormat("en-TZ").format(difference)} TZS difference.`
          : difference < 0
            ? `If approved, ${new Intl.NumberFormat("en-TZ").format(-difference)} TZS comes back to you.`
            : "No fare difference. Our team will confirm with the supplier.",
      });
      router.push(`/trips/${reference}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Wrap>
      <Link href={`/trips/${reference}`} className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-brand-text">
        <ArrowLeft className="size-4" aria-hidden /> Back to {reference}
      </Link>

      <h1 className="font-display text-3xl">Request a change</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Changes go to our operations team, who confirm with the supplier. You see the fare difference before you submit.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          {amendable.length > 1 ? (
            <section>
              <h2 className="mb-2 font-medium">Which part of the trip?</h2>
              <div className="space-y-2">
                {amendable.map((i) => (
                  <button key={i.id} onClick={() => setItemId(i.id)} className={cn("w-full rounded-xl border p-1 text-left transition-colors", i.id === item.id ? "border-brand-400 bg-brand-50/40" : "bg-card hover:border-brand-300")}>
                    <TripItemRow item={i} compact slug={data.products[i.productId]?.slug} />
                  </button>
                ))}
              </div>
            </section>
          ) : (
            <TripItemRow item={item} compact slug={product?.slug} />
          )}

          <section className="rounded-xl border bg-card p-4">
            <h2 className="mb-2 font-medium">What would you like to change?</h2>
            <div className="grid gap-2 sm:grid-cols-3">
              {([
                { id: "date_change", label: "Dates", icon: CalendarRange },
                { id: "pax_change", label: "Party size", icon: Users },
                { id: "room_change", label: item.vertical === "transfer" ? "Vehicle" : "Room or rate", icon: Info },
              ] as const).map((k) => (
                <button
                  key={k.id}
                  onClick={() => setKind(k.id)}
                  aria-pressed={kind === k.id}
                  className={cn("flex items-center gap-2 rounded-lg border p-3 text-sm transition-colors", kind === k.id ? "border-brand-400 bg-brand-50 font-medium text-brand-text-strong" : "hover:bg-muted")}
                >
                  <k.icon className="size-4" aria-hidden /> {k.label}
                </button>
              ))}
            </div>

            <div className="mt-4">
              {kind === "date_change" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="from">New start date</Label>
                    <Input id="from" type="date" value={newFrom} onChange={(e) => setDateFrom(e.target.value)} className="mt-1 tabular-nums" />
                  </div>
                  {item.vertical === "stay" ? (
                    <div>
                      <Label htmlFor="to">New end date</Label>
                      <Input id="to" type="date" value={newTo} min={newFrom} onChange={(e) => setDateTo(e.target.value)} className="mt-1 tabular-nums" />
                    </div>
                  ) : null}
                </div>
              ) : kind === "pax_change" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="ad">Adults</Label>
                    <Input id="ad" type="number" min={1} max={16} value={newPax.adults} onChange={(e) => setAdults(Number(e.target.value))} className="mt-1 tabular-nums" />
                  </div>
                  <div>
                    <Label htmlFor="ch">Children</Label>
                    <Input id="ch" type="number" min={0} max={10} value={newPax.children} onChange={(e) => setChildren(Number(e.target.value))} className="mt-1 tabular-nums" />
                  </div>
                </div>
              ) : (
                <div>
                  <Label htmlFor="want">What would you like instead?</Label>
                  <Textarea id="want" value={note} onChange={(e) => setNote(e.target.value)} rows={3} className="mt-1" placeholder="e.g. Upgrade to the Family Suite, or a minivan instead of the sedan." />
                </div>
              )}
            </div>

            {kind !== "room_change" ? (
              <div className="mt-3">
                <Label htmlFor="note">Anything we should know? (optional)</Label>
                <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="mt-1" placeholder="Flight rescheduled, travelling with a colleague…" />
              </div>
            ) : null}
          </section>

          {kind === "date_change" && changed && !availability.available ? (
            <Alert variant="destructive">
              <Info className="size-4" />
              <AlertTitle>Those dates look unavailable</AlertTitle>
              <AlertDescription>
                {product?.title} shows {availability.unitsLeft} unit{availability.unitsLeft === 1 ? "" : "s"} free for {formatRange(newFrom, newTo)}.
                You can still submit — our team will check directly with the supplier, who often has capacity the live feed does not show.
              </AlertDescription>
            </Alert>
          ) : null}
        </div>

        <aside>
          <div className="sticky top-20 space-y-3 rounded-xl border bg-card p-4">
            <h2 className="font-medium">Fare difference</h2>
            <dl className="space-y-1.5 text-sm">
              <div className="flex justify-between"><dt className="text-muted-foreground">Current price</dt><dd><MoneyText minor={item.sellPriceMinor} currency={booking.currency} size="sm" /></dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">New price</dt><dd><MoneyText minor={repriced?.totalMinor ?? item.sellPriceMinor} currency={booking.currency} size="sm" /></dd></div>
            </dl>
            <div className="flex items-baseline justify-between border-t pt-2">
              <span className="font-medium">{difference >= 0 ? "You would pay" : "Back to you"}</span>
              <MoneyText
                minor={Math.abs(difference)}
                currency={booking.currency}
                size="lg"
                className={difference > 0 ? "text-warning-foreground" : difference < 0 ? "text-success-foreground" : ""}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {difference > 0
                ? "Collected only after the supplier confirms the change. Nothing is charged now."
                : difference < 0
                  ? "Refunded to your original payment method once the change is confirmed."
                  : "No fare difference for this change."}
            </p>
            <Button className="w-full gap-2" onClick={submit} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null} Submit change request
            </Button>
            <Button asChild variant="ghost" className="w-full"><Link href={`/trips/${reference}`}>Never mind</Link></Button>
            <p className="border-t pt-3 text-[11px] text-muted-foreground">
              Amendments are reviewed by our operations team within 6 hours. You keep your existing booking until the change is confirmed —
              nothing is cancelled in the meantime.
            </p>
          </div>
        </aside>
      </div>
    </Wrap>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-[1100px] px-4 py-6">{children}</div>;
}
