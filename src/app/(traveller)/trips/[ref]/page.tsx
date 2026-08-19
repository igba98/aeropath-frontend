"use client";

import { use, Suspense, useState } from "react";
import Link from "next/link";
import { CalendarPlus, Download, LifeBuoy, MessageCircle, Pencil, Phone, Printer, Receipt, Ticket, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TripItemRow } from "@/features/traveller/trip-item-row";
import { bookingBreakdown } from "@/features/traveller/use-cart";
import { PriceBreakdown } from "@/components/shared/price-breakdown";
import { BookingTimeline } from "@/components/shared/booking-timeline";
import { EmptyState } from "@/components/shared/empty-state";
import { StatusChip } from "@/components/shared/status-chip";
import { MoneyText } from "@/components/shared/money-text";
import { ProductImage } from "@/components/shared/product-image";
import { useStore } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";
import { admin, RAIL_LABELS } from "@/lib/api";
import { formatDate, formatDateTime, formatRange } from "@/lib/format";

/** T18 · Trip detail. Vouchers, amend, cancel, message support, receipts. */
export default function TripDetailPage({ params }: { params: Promise<{ ref: string }> }) {
  return (
    <Suspense fallback={<Wrap><div className="h-40 animate-pulse rounded-xl bg-muted" /></Wrap>}>
      <Body reference={use(params).ref} />
    </Suspense>
  );
}

function Body({ reference }: { reference: string }) {
  const hydrated = useStore((s) => s.hydrated);
  const booking = useStore((s) => Object.values(s.bookings).find((b) => b.reference === reference));
  const items = useStore(useShallow((s) => Object.values(s.items).filter((i) => i.bookingId === booking?.id).sort((a, b) => a.travelDateFrom.localeCompare(b.travelDateFrom))));
  const timeline = useStore(useShallow((s) => s.timeline.filter((e) => e.bookingId === booking?.id)));
  const payments = useStore(useShallow((s) => Object.values(s.payments).filter((p) => p.bookingId === booking?.id)));
  const refunds = useStore(useShallow((s) => Object.values(s.refunds).filter((r) => r.bookingId === booking?.id)));
  const products = useStore((s) => s.products);
  const organisations = useStore((s) => s.organisations);
  const [message, setMessage] = useState("");

  if (!hydrated) return <Wrap><div className="h-40 animate-pulse rounded-xl bg-muted" /></Wrap>;
  if (!booking) {
    return <Wrap><EmptyState title="Booking not found" description="Check the reference or find it in My Trips." action={<Button asChild><Link href="/trips">My Trips</Link></Button>} /></Wrap>;
  }

  const breakdown = bookingBreakdown(booking, items);
  const amendable = items.filter((i) => ["confirmed", "amended", "paid", "awaiting_supplier"].includes(i.status));
  const dates = items.map((i) => i.travelDateFrom).sort();
  const ends = items.map((i) => i.travelDateTo).sort();

  function contactSupport() {
    if (!message.trim()) return toast.error("Write a message first");
    admin.createTicket({
      bookingReference: booking!.reference,
      customerName: booking!.leadTraveller ? `${booking!.leadTraveller.firstName} ${booking!.leadTraveller.lastName}` : "Traveller",
      customerPhone: booking!.leadTraveller?.phone ?? "",
      channel: "in_app",
      subject: `Question about ${booking!.reference}`,
      status: "open",
      priority: "normal",
      firstMessage: message.trim(),
    });
    setMessage("");
    toast.success("Message sent to support", { description: "We reply within 4 hours, usually much sooner." });
  }

  return (
    <Wrap>
      <nav className="mb-3 text-xs text-muted-foreground">
        <Link href="/trips" className="hover:text-brand-text">My Trips</Link> <span>/</span> <span className="text-foreground">{booking.reference}</span>
      </nav>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip status={booking.status} />
            <span className="font-mono text-sm text-muted-foreground">{booking.reference}</span>
          </div>
          <h1 className="mt-1.5 font-display text-3xl">
            {items[0]?.productSnapshot.title ?? "Booking"}
            {items.length > 1 ? <span className="ml-2 text-lg font-normal text-muted-foreground">and {items.length - 1} more</span> : null}
          </h1>
          {dates[0] ? <p className="text-sm text-muted-foreground">{formatRange(dates[0], ends[ends.length - 1] ?? dates[0])} · booked {formatDate(booking.createdAt)}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button className="gap-1.5" onClick={() => toast.success("Voucher downloaded", { description: `${booking.reference}.pdf` })}>
            <Download className="size-4" aria-hidden /> Voucher
          </Button>
          <Button variant="outline" size="icon" aria-label="Print" onClick={() => window.print()}><Printer className="size-4" /></Button>
          <Button variant="outline" size="icon" aria-label="Add to calendar" onClick={() => toast.success("Added to your calendar")}><CalendarPlus className="size-4" /></Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0">
          <Tabs defaultValue="itinerary">
            <TabsList>
              <TabsTrigger value="itinerary">Itinerary</TabsTrigger>
              <TabsTrigger value="vouchers">Vouchers</TabsTrigger>
              <TabsTrigger value="payments">Payments</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
              <TabsTrigger value="support">Support</TabsTrigger>
            </TabsList>

            <TabsContent value="itinerary" className="mt-4 space-y-3">
              {items.map((item) => (
                <div key={item.id}>
                  <TripItemRow item={item} showStatus slug={products[item.productId]?.slug} />
                  {["confirmed", "amended"].includes(item.status) ? (
                    <div className="ml-3 mt-1.5 flex flex-wrap gap-2">
                      <Button asChild variant="outline" size="sm" className="gap-1.5">
                        <Link href={`/trips/${booking.reference}/amend?item=${item.id}`}><Pencil className="size-3.5" aria-hidden /> Change dates or guests</Link>
                      </Button>
                      <Button asChild variant="outline" size="sm" className="gap-1.5 text-destructive hover:text-destructive">
                        <Link href={`/trips/${booking.reference}/cancel?item=${item.id}`}><XCircle className="size-3.5" aria-hidden /> Cancel this</Link>
                      </Button>
                    </div>
                  ) : null}
                </div>
              ))}
              <section className="rounded-xl border bg-card p-4">
                <h2 className="font-medium">Travellers</h2>
                <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
                  {booking.travellers.map((t, i) => (
                    <li key={t.id || i}>
                      {t.title} {t.firstName} {t.lastName}
                      {i === 0 ? <span className="ml-2 text-xs">· lead · {t.phone}</span> : null}
                      {t.passportNumber ? <span className="ml-2 font-mono text-xs">{t.passportNumber}</span> : null}
                    </li>
                  ))}
                </ul>
              </section>
            </TabsContent>

            <TabsContent value="vouchers" className="mt-4 space-y-3">
              {items.filter((i) => ["confirmed", "amended", "used"].includes(i.status)).length === 0 ? (
                <EmptyState icon={Ticket} title="No vouchers yet" description="Vouchers are issued the moment each supplier confirms. We send them by SMS, WhatsApp and email too." />
              ) : (
                items.filter((i) => ["confirmed", "amended", "used"].includes(i.status)).map((item) => {
                  const supplier = organisations[item.supplierId];
                  return (
                    <article key={item.id} className="overflow-hidden rounded-xl border bg-card">
                      <ProductImage slug={item.productId} alt="" className="h-24">
                        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 p-3">
                          <p className="font-display text-lg text-white">{item.productSnapshot.title}</p>
                          <span className="rounded bg-white/90 px-2 py-1 font-mono text-xs font-semibold">{item.supplierReference ?? booking.reference}</span>
                        </div>
                      </ProductImage>
                      <div className="grid gap-3 p-4 text-sm sm:grid-cols-3">
                        <div><p className="text-xs text-muted-foreground">Dates</p><p>{formatRange(item.travelDateFrom, item.travelDateTo)}</p></div>
                        <div><p className="text-xs text-muted-foreground">Guests</p><p>{item.pax.adults + item.pax.children} · {item.quantity} unit{item.quantity === 1 ? "" : "s"}</p></div>
                        <div><p className="text-xs text-muted-foreground">Supplier</p><p>{supplier?.name ?? "—"}</p></div>
                        <div className="sm:col-span-3"><p className="text-xs text-muted-foreground">Contact on arrival</p><p>{supplier?.contactName} · {supplier?.contactPhone}</p></div>
                      </div>
                      <div className="flex flex-wrap gap-2 border-t bg-muted/40 p-3">
                        <Button size="sm" className="gap-1.5" onClick={() => toast.success("Voucher downloaded", { description: `${item.supplierReference ?? booking.reference}.pdf` })}>
                          <Download className="size-3.5" aria-hidden /> Download
                        </Button>
                        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => toast.success("Sent by WhatsApp", { description: booking.leadTraveller?.phone })}>
                          <MessageCircle className="size-3.5" aria-hidden /> Send to WhatsApp
                        </Button>
                      </div>
                    </article>
                  );
                })
              )}
            </TabsContent>

            <TabsContent value="payments" className="mt-4 space-y-3">
              {payments.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
                  <div>
                    <p className="font-medium">{RAIL_LABELS[p.rail]} <span className="text-sm font-normal text-muted-foreground">· {p.provider}</span></p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(p.createdAt)}
                      {p.providerReference ? <span className="ml-2 font-mono">{p.providerReference}</span> : null}
                      {p.customerReference && !p.providerReference ? <span className="ml-2 font-mono">{p.customerReference} (entered by you)</span> : null}
                    </p>
                  </div>
                  <div className="text-right">
                    <MoneyText minor={p.amountMinor} currency={p.currency} size="md" />
                    <StatusChip status={p.status === "succeeded" ? "paid" : p.status === "failed" ? "payment_failed" : p.status === "reconciliation_pending" ? "pending_payment" : "pending_payment"} size="sm" />
                  </div>
                </div>
              ))}
              {refunds.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-success/30 bg-success/5 p-4">
                  <div>
                    <p className="font-medium">Refund</p>
                    <p className="text-xs text-muted-foreground">{r.reason} · {formatDateTime(r.createdAt)}</p>
                  </div>
                  <div className="text-right">
                    <MoneyText minor={r.amountMinor} currency={r.currency} size="md" className="text-success-foreground" />
                    <p className="text-xs capitalize text-muted-foreground">{r.status.replace(/_/g, " ")}</p>
                  </div>
                </div>
              ))}
              <Button variant="outline" className="gap-1.5" onClick={() => toast.success("VAT receipt generated", { description: `${booking.reference}-receipt.pdf` })}>
                <Receipt className="size-4" aria-hidden /> Download VAT receipt
              </Button>
            </TabsContent>

            <TabsContent value="activity" className="mt-4">
              <div className="rounded-xl border bg-card p-4">
                <BookingTimeline events={timeline} audience="customer" />
              </div>
            </TabsContent>

            <TabsContent value="support" className="mt-4 space-y-3">
              <div className="rounded-xl border bg-card p-4">
                <h2 className="flex items-center gap-1.5 font-medium"><LifeBuoy className="size-4" aria-hidden /> Message our team</h2>
                <p className="text-xs text-muted-foreground">Your booking reference is attached automatically.</p>
                <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} className="mt-2" placeholder="e.g. Can we get a ground floor room? My mother has limited mobility." />
                <Button className="mt-2" onClick={contactSupport}>Send message</Button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <a href="tel:+255700000000" className="flex items-center gap-3 rounded-xl border bg-card p-4 hover:border-brand-300">
                  <Phone className="size-5 text-brand-text" aria-hidden />
                  <span><span className="block font-medium">Call us</span><span className="block text-xs text-muted-foreground">+255 700 000 000 · 24/7 during travel</span></span>
                </a>
                <a href="https://wa.me/255700000000" className="flex items-center gap-3 rounded-xl border bg-card p-4 hover:border-brand-300">
                  <MessageCircle className="size-5 text-brand-text" aria-hidden />
                  <span><span className="block font-medium">WhatsApp</span><span className="block text-xs text-muted-foreground">Fastest on a slow connection</span></span>
                </a>
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <aside>
          <div className="sticky top-20 space-y-3">
            <PriceBreakdown data={breakdown} title="What you paid" />
            {amendable.length ? (
              <div className="space-y-2">
                <Button asChild variant="outline" className="w-full gap-1.5">
                  <Link href={`/trips/${booking.reference}/amend`}><Pencil className="size-4" aria-hidden /> Request a change</Link>
                </Button>
                <Button asChild variant="outline" className="w-full gap-1.5 text-destructive hover:text-destructive">
                  <Link href={`/trips/${booking.reference}/cancel`}><XCircle className="size-4" aria-hidden /> Cancel booking</Link>
                </Button>
              </div>
            ) : null}
            <Dialog>
              <DialogTrigger asChild><Button variant="ghost" className="w-full">Booking details</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Booking {booking.reference}</DialogTitle></DialogHeader>
                <dl className="grid gap-2 text-sm">
                  <Row label="Booked" value={formatDateTime(booking.createdAt)} />
                  <Row label="Channel" value={booking.createdVia} />
                  <Row label="Buyer type" value={booking.buyerType} />
                  {booking.costCentre ? <Row label="Cost centre" value={booking.costCentre} /> : null}
                  {booking.projectCode ? <Row label="Project" value={booking.projectCode} /> : null}
                  {booking.clientOrgName ? <Row label="Client" value={booking.clientOrgName} /> : null}
                  <Row label="Payment" value={booking.paymentRail ? RAIL_LABELS[booking.paymentRail] : "—"} />
                </dl>
                <DialogFooter />
              </DialogContent>
            </Dialog>
          </div>
        </aside>
      </div>
    </Wrap>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b pb-1.5 last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="capitalize">{value}</dd>
    </div>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-[1100px] px-4 py-6">{children}</div>;
}
