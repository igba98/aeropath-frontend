"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, ArrowLeft, Check, Mail, MessageSquare, Phone, User, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/chrome/console-shell";
import { BookingTimeline } from "@/components/shared/booking-timeline";
import { EmptyState } from "@/components/shared/empty-state";
import { MoneyText } from "@/components/shared/money-text";
import { PriceBreakdown } from "@/components/shared/price-breakdown";
import { SlaCountdown } from "@/components/shared/hold-countdown";
import { StatusChip, Pill } from "@/components/shared/status-chip";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useStore } from "@/lib/store";
import { bookingOps } from "@/lib/api";
import { formatDate, formatDateTime, formatRange } from "@/lib/format";
import { NotSupplier, isBreached, useSupplierContext } from "@/features/supplier/shared";
import type { BookingItem, PriceBreakdownData, PriceLine } from "@/lib/domain/types";

/** Build the breakdown from the amounts stored on the item — never recompute from a rate plan. */
function breakdownOf(item: BookingItem): PriceBreakdownData {
  const base = item.sellPriceMinor - item.taxMinor - item.feeMinor - item.markupMinor;
  const lines: PriceLine[] = [{ label: `${item.productSnapshot.ratePlanName} · ${formatRange(item.travelDateFrom, item.travelDateTo)}`, amountMinor: base, kind: "base" }];
  if (item.markupMinor) lines.push({ label: "Agency markup", amountMinor: item.markupMinor, kind: "markup" });
  if (item.taxMinor) lines.push({ label: "Taxes and levies", amountMinor: item.taxMinor, kind: "tax" });
  if (item.feeMinor) lines.push({ label: "Service fee", amountMinor: item.feeMinor, kind: "fee" });
  return {
    currency: "TZS",
    lines,
    baseMinor: base,
    taxMinor: item.taxMinor,
    feeMinor: item.feeMinor,
    discountMinor: 0,
    markupMinor: item.markupMinor,
    totalMinor: item.sellPriceMinor,
    netMinor: item.netCostMinor,
    commissionMinor: item.commissionMinor,
  };
}

/** S08 · Booking detail with CONFIRM / REJECT. */
export default function SupplierBookingDetailPage() {
  const params = useParams<{ id: string }>();
  const bookingId = params.id;
  const { org, hydrated } = useSupplierContext();
  const booking = useStore((s) => s.bookings[bookingId]);
  const items = useStore((s) => s.items);
  const timeline = useStore((s) => s.timeline);

  const [confirming, setConfirming] = useState<BookingItem | null>(null);
  const [rejecting, setRejecting] = useState<BookingItem | null>(null);
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");

  if (!hydrated) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!org) {
    return (
      <>
        <PageHeader title="Booking" code="S08" />
        <NotSupplier what="Booking detail" />
      </>
    );
  }

  const myItems = Object.values(items).filter((i) => i.bookingId === bookingId && i.supplierId === org.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  if (!booking || myItems.length === 0) {
    return (
      <>
        <PageHeader title="Booking" code="S08" />
        <EmptyState
          icon={AlertTriangle}
          title="Booking not found"
          description="This booking has no lines for your organisation. You only see the parts of a booking that belong to your products."
          action={<Button asChild><Link href="/partner/supplier/bookings">Back to the inbox</Link></Button>}
        />
      </>
    );
  }

  const lead = booking.leadTraveller;
  const events = timeline.filter((e) => e.bookingId === bookingId && (!e.itemId || myItems.some((i) => i.id === e.itemId)));
  const totalForYou = myItems.reduce((s, i) => s + i.netCostMinor, 0);

  function confirm() {
    if (!confirming) return;
    if (reference.trim().length < 3) {
      toast.error("Enter your own reference", { description: "The guest voucher shows it, and operations use it when they call you." });
      return;
    }
    bookingOps.supplierConfirm(confirming.id, reference.trim().toUpperCase());
    toast.success("Booking confirmed", { description: "The guest voucher has been issued and the SLA timer stopped." });
    setConfirming(null);
    setReference("");
  }

  function reject() {
    if (!rejecting) return;
    if (reason.trim().length < 8) {
      toast.error("Give a reason", { description: "The guest and the operations team both see why you could not take this booking." });
      return;
    }
    bookingOps.supplierReject(rejecting.id, reason.trim());
    toast.success("Booking rejected", { description: "A full refund was issued automatically and operations have been asked to find an alternative." });
    setRejecting(null);
    setReason("");
  }

  return (
    <>
      <PageHeader
        title={`Booking ${booking.reference}`}
        code="S08"
        description={`Booked ${formatDateTime(booking.createdAt)}`}
        actions={
          <Button variant="ghost" asChild>
            <Link href="/partner/supplier/bookings"><ArrowLeft className="size-4" aria-hidden />Back to inbox</Link>
          </Button>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {/* Guest */}
          <section className="rounded-xl border bg-card p-4">
            <h2 className="font-display text-lg">Guest</h2>
            {lead ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <Detail icon={User} label="Lead traveller" value={`${lead.title} ${lead.firstName} ${lead.lastName}`} />
                <Detail icon={Phone} label="Phone" value={lead.phone} />
                <Detail icon={Mail} label="Email" value={lead.email} />
                <Detail icon={User} label="Nationality" value={lead.nationality} />
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">No lead traveller captured.</p>
            )}
            {booking.travellers.length > 1 ? (
              <div className="mt-3">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">All travellers</p>
                <ul className="mt-1 text-sm text-muted-foreground">
                  {booking.travellers.map((t) => <li key={t.id}>{t.title} {t.firstName} {t.lastName}{t.passportNumber ? ` · passport ${t.passportNumber}` : ""}</li>)}
                </ul>
              </div>
            ) : null}
            {booking.clientOrgName ? <p className="mt-3 text-sm text-muted-foreground">Booked through an agency for <span className="font-medium text-foreground">{booking.clientOrgName}</span>.</p> : null}
          </section>

          {/* Items */}
          {myItems.map((item) => (
            <section key={item.id} className="rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-display text-lg">{item.productSnapshot.title}</h2>
                  <p className="text-sm text-muted-foreground">{item.productSnapshot.ratePlanName} · {item.productSnapshot.city}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusChip status={item.status} />
                  {item.status === "awaiting_supplier" ? <SlaCountdown deadlineAt={item.slaDeadlineAt} /> : null}
                </div>
              </div>

              <dl className="mt-3 grid gap-3 sm:grid-cols-3">
                <Detail label="Travel dates" value={formatRange(item.travelDateFrom, item.travelDateTo)} />
                <Detail label="Guests" value={`${item.pax.adults} adult${item.pax.adults === 1 ? "" : "s"}${item.pax.children ? `, ${item.pax.children} child` : ""}${item.pax.infants ? `, ${item.pax.infants} infant` : ""}`} />
                <Detail label="Units" value={`${item.quantity}`} />
                <Detail label="Your reference" value={item.supplierReference ?? "—"} />
                <Detail label="Cancellation" value={item.cancellationPolicySnapshot.name} />
                <Detail label="Free cancellation until" value={item.cancellationPolicySnapshot.freeCancellationUntil ? formatDate(item.cancellationPolicySnapshot.freeCancellationUntil) : "not applicable"} />
              </dl>

              {item.specialRequests ? (
                <Alert className="mt-3">
                  <MessageSquare className="size-4" aria-hidden />
                  <AlertTitle>Special requests</AlertTitle>
                  <AlertDescription>{item.specialRequests}</AlertDescription>
                </Alert>
              ) : null}

              {item.rejectionReason ? (
                <Alert variant="destructive" className="mt-3">
                  <X className="size-4" aria-hidden />
                  <AlertTitle>You rejected this line</AlertTitle>
                  <AlertDescription>{item.rejectionReason}</AlertDescription>
                </Alert>
              ) : null}

              {item.status === "awaiting_supplier" ? (
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-4">
                  <Button onClick={() => { setConfirming(item); setReference(""); }}>
                    <Check className="size-4" aria-hidden />Confirm booking
                  </Button>
                  <Button variant="outline" onClick={() => { setRejecting(item); setReason(""); }}>
                    <X className="size-4" aria-hidden />Reject
                  </Button>
                  {isBreached(item) ? <Pill tone="danger" icon={AlertTriangle}>Past the 2 hour SLA</Pill> : <span className="text-xs text-muted-foreground">Confirm within 2 hours of payment.</span>}
                </div>
              ) : null}
            </section>
          ))}

          {/* Timeline */}
          <section className="rounded-xl border bg-card p-4">
            <h2 className="mb-3 font-display text-lg">Activity</h2>
            <BookingTimeline events={events} audience="supplier" />
          </section>
        </div>

        {/* Right rail */}
        <aside className="space-y-4">
          {myItems.map((item) => (
            <PriceBreakdown key={item.id} data={breakdownOf(item)} title={`Guest price · ${item.productSnapshot.ratePlanName}`} dense />
          ))}
          <div className="rounded-xl border border-brand-200 bg-brand-50/60 p-4">
            <p className="text-[11px] font-medium uppercase tracking-wide text-brand-text-strong">What you are paid</p>
            <div className="mt-2 space-y-1.5">
              {myItems.map((item) => (
                <div key={item.id} className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-xs text-muted-foreground">{item.productSnapshot.title}</span>
                  <MoneyText minor={item.netCostMinor} currency="TZS" size="sm" showCurrency={false} />
                </div>
              ))}
              <div className="flex items-baseline justify-between border-t pt-2">
                <span className="text-sm font-medium">Net to you</span>
                <MoneyText minor={totalForYou} currency="TZS" size="md" />
              </div>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              After {org.commissionPct ?? 15}% commission, settled {org.payoutTermsDays ?? 14} days after travel on your payout statement.
            </p>
          </div>
        </aside>
      </div>

      {/* Confirm dialog */}
      <Dialog open={confirming !== null} onOpenChange={(o) => !o && setConfirming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm {confirming?.productSnapshot.title}</DialogTitle>
            <DialogDescription>
              Confirming moves this line to confirmed, issues the guest voucher immediately and stops the SLA timer. Your reference is printed on the voucher.
            </DialogDescription>
          </DialogHeader>
          <div>
            <Label htmlFor="supplier-ref">Your booking reference</Label>
            <Input id="supplier-ref" className="mt-1.5" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. SER-88240" autoFocus />
            <p className="mt-1.5 text-xs text-muted-foreground">Use the reference from your own PMS or reservation book.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(null)}>Cancel</Button>
            <Button onClick={confirm}><Check className="size-4" aria-hidden />Confirm and issue voucher</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={rejecting !== null} onOpenChange={(o) => !o && setRejecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject {rejecting?.productSnapshot.title}</DialogTitle>
            <DialogDescription>
              Rejecting issues an automatic full refund of{" "}
              {rejecting ? <MoneyText minor={rejecting.sellPriceMinor} currency="TZS" size="sm" /> : null}{" "}
              to the guest and raises a task for the Aeropath operations team to offer an alternative. It also counts against your confirmation rate.
            </DialogDescription>
          </DialogHeader>
          <Alert variant="destructive">
            <AlertTriangle className="size-4" aria-hidden />
            <AlertTitle>This cannot be undone</AlertTitle>
            <AlertDescription>The refund is processed straight away — the guest cannot be re-charged for this line.</AlertDescription>
          </Alert>
          <div>
            <Label htmlFor="reject-reason">Reason</Label>
            <Textarea id="reject-reason" className="mt-1.5" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Overbooked · the last standard rondavel went to a group booking this morning" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)}>Keep the booking</Button>
            <Button variant="destructive" onClick={reject}><X className="size-4" aria-hidden />Reject and refund the guest</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Detail({ label, value, icon: Icon }: { label: string; value: string; icon?: typeof User }) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">
        {Icon ? <Icon className="size-3" aria-hidden /> : null}
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-medium">{value}</dd>
    </div>
  );
}
