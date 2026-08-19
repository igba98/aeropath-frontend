"use client";

import { use, Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, ArrowLeft, Info, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/shared/empty-state";
import { MoneyText } from "@/components/shared/money-text";
import { TripItemRow } from "@/features/traveller/trip-item-row";
import { useStore } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";
import { bookingOps, RAIL_LABELS } from "@/lib/api";
import { quoteRefund } from "@/lib/domain/refunds";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * T20 · Cancel and refund.
 * Shows the exact refund computed from the policy snapshot taken at booking time — before the
 * customer confirms, never after.
 */
export default function CancelPage({ params }: { params: Promise<{ ref: string }> }) {
  return (
    <Suspense fallback={<Wrap><div className="h-40 animate-pulse rounded-xl bg-muted" /></Wrap>}>
      <Body reference={use(params).ref} />
    </Suspense>
  );
}

function Body({ reference }: { reference: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const focusItem = sp.get("item");
  const hydrated = useStore((s) => s.hydrated);
  const booking = useStore((s) => Object.values(s.bookings).find((b) => b.reference === reference));
  const allItems = useStore(useShallow((s) => Object.values(s.items).filter((i) => i.bookingId === booking?.id)));
  const payment = useStore((s) => Object.values(s.payments).find((p) => p.bookingId === booking?.id && p.status === "succeeded"));
  const products = useStore((s) => s.products);
  const [selected, setSelected] = useState<string[]>(focusItem ? [focusItem] : []);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!hydrated) return <Wrap><div className="h-40 animate-pulse rounded-xl bg-muted" /></Wrap>;
  if (!booking) return <Wrap><EmptyState title="Booking not found" action={<Button asChild><Link href="/trips">My Trips</Link></Button>} /></Wrap>;

  const cancellable = allItems.filter((i) => ["confirmed", "amended", "paid", "awaiting_supplier"].includes(i.status));
  if (!cancellable.length) {
    return (
      <Wrap>
        <EmptyState
          title="Nothing to cancel"
          description="This booking has no active items — it may already be cancelled, refunded or completed."
          action={<Button asChild><Link href={`/trips/${reference}`}>Back to the booking</Link></Button>}
        />
      </Wrap>
    );
  }

  const chosen = selected.length ? cancellable.filter((i) => selected.includes(i.id)) : [];
  const quotes = chosen.map((i) => ({ item: i, quote: quoteRefund(i.cancellationPolicySnapshot, i.sellPriceMinor, i.travelDateFrom) }));
  const refundTotal = quotes.reduce((s, q) => s + q.quote.refundMinor, 0);
  const paidTotal = chosen.reduce((s, i) => s + i.sellPriceMinor, 0);
  const allFree = quotes.length > 0 && quotes.every((q) => q.quote.withinFreeWindow);
  const anyZero = quotes.some((q) => q.quote.refundPct === 0);

  function toggle(id: string) {
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  }

  function cancel() {
    if (!chosen.length) return toast.error("Choose what to cancel");
    if (!confirmed) return toast.error("Please confirm you understand the refund amount");
    setBusy(true);
    try {
      for (const i of chosen) bookingOps.cancel(i.id, { reason: reason.trim() || undefined });
      toast.success(
        allFree ? "Cancelled — full refund on its way" : refundTotal > 0 ? "Cancelled — refund is being processed" : "Cancelled",
        { description: refundTotal > 0 ? `We will return ${new Intl.NumberFormat("en-TZ").format(refundTotal)} TZS to your ${payment ? RAIL_LABELS[payment.rail] : "payment method"}.` : "This rate was non refundable, so no money is returned." },
      );
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

      <h1 className="font-display text-3xl">Cancel your booking</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        We show the exact refund before you confirm, calculated from the terms you agreed to when you booked.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <section>
            <h2 className="mb-2 font-medium">What would you like to cancel?</h2>
            <div className="space-y-3">
              {cancellable.map((item) => {
                const q = quoteRefund(item.cancellationPolicySnapshot, item.sellPriceMinor, item.travelDateFrom);
                const on = selected.includes(item.id);
                return (
                  <div key={item.id} className={cn("rounded-xl border p-3 transition-colors", on ? "border-brand-400 bg-brand-50/40" : "bg-card")}>
                    <label className="flex cursor-pointer items-start gap-3">
                      <Checkbox checked={on} onCheckedChange={() => toggle(item.id)} className="mt-1" />
                      <span className="min-w-0 flex-1">
                        <TripItemRow item={item} compact slug={products[item.productId]?.slug} />
                      </span>
                    </label>
                    <div className={cn("mt-2 rounded-lg p-3 text-sm", q.withinFreeWindow ? "bg-success/10" : q.refundPct === 0 ? "bg-destructive/10" : "bg-warning/10")}>
                      <p className="flex items-start gap-1.5">
                        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
                        <span>
                          <span className="font-medium">{q.tierLabel}</span>
                          <span className="block text-xs text-muted-foreground">
                            {item.cancellationPolicySnapshot.name} policy, snapshotted when you booked · travel starts {formatDate(item.travelDateFrom)} ({q.daysBefore} days away)
                          </span>
                        </span>
                      </p>
                      <p className="mt-2 flex items-baseline justify-between border-t pt-2">
                        <span className="text-muted-foreground">You would get back</span>
                        <MoneyText minor={q.refundMinor} currency="TZS" size="md" className={q.refundPct === 0 ? "text-destructive" : "text-success-foreground"} />
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {chosen.length ? (
            <section className="rounded-xl border bg-card p-4">
              <Label htmlFor="reason">Why are you cancelling? (optional)</Label>
              <p className="text-xs text-muted-foreground">It helps us improve, and gives our team context if you call.</p>
              <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="mt-2" placeholder="Change of plans, flight cancelled, found something else…" />
            </section>
          ) : null}

          {anyZero ? (
            <Alert variant="destructive">
              <AlertTriangle className="size-4" />
              <AlertTitle>Part of this booking is non refundable</AlertTitle>
              <AlertDescription>
                One or more items return nothing at this point. If something has gone wrong on our side or the supplier&rsquo;s,
                call us on +255 700 000 000 before cancelling — our team can raise a goodwill refund that sits outside the policy.
              </AlertDescription>
            </Alert>
          ) : null}
        </div>

        <aside>
          <div className="sticky top-20 space-y-3 rounded-xl border bg-card p-4">
            <h2 className="font-medium">Refund summary</h2>
            {chosen.length === 0 ? (
              <p className="text-sm text-muted-foreground">Select at least one item to see the refund.</p>
            ) : (
              <>
                <dl className="space-y-1.5 text-sm">
                  <div className="flex justify-between"><dt className="text-muted-foreground">You paid</dt><dd><MoneyText minor={paidTotal} currency={booking.currency} size="sm" /></dd></div>
                  <div className="flex justify-between"><dt className="text-muted-foreground">Non refundable</dt><dd><MoneyText minor={paidTotal - refundTotal} currency={booking.currency} size="sm" /></dd></div>
                </dl>
                <div className="flex items-baseline justify-between border-t pt-2">
                  <span className="font-medium">Refund to you</span>
                  <MoneyText minor={refundTotal} currency={booking.currency} size="lg" className={refundTotal > 0 ? "text-success-foreground" : ""} />
                </div>
                <p className="text-xs text-muted-foreground">
                  {allFree
                    ? `Inside the free window, so this is automatic — no approval, no waiting. Back on your ${payment ? RAIL_LABELS[payment.rail] : "payment method"} within 3 business days.`
                    : refundTotal > 0
                      ? `Refunds outside the free window are reviewed by our finance team first. Expect it within 5 business days of approval.`
                      : `This rate was non refundable, so no money is returned.`}
                </p>

                <label className="flex items-start gap-2.5 rounded-lg bg-muted p-3">
                  <Checkbox checked={confirmed} onCheckedChange={(c) => setConfirmed(Boolean(c))} className="mt-0.5" />
                  <span className="text-xs leading-relaxed">
                    I understand I will receive <strong><MoneyText minor={refundTotal} currency={booking.currency} size="xs" /></strong> and that cancelling cannot be undone.
                  </span>
                </label>

                <Button variant="destructive" className="w-full gap-2" onClick={cancel} disabled={busy || !confirmed}>
                  {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                  Cancel {chosen.length === allItems.length ? "the whole booking" : `${chosen.length} item${chosen.length === 1 ? "" : "s"}`}
                </Button>
                <Button asChild variant="ghost" className="w-full"><Link href={`/trips/${reference}`}>Keep my booking</Link></Button>
              </>
            )}
            <p className="flex items-start gap-1.5 border-t pt-3 text-[11px] text-muted-foreground">
              <Info className="mt-0.5 size-3 shrink-0" aria-hidden />
              Prefer to change the dates instead? An amendment usually costs less than cancelling and rebooking.
              <Link href={`/trips/${reference}/amend`} className="font-medium text-brand-text underline">Request a change</Link>
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
