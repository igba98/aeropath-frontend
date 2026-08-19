"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft, BadgeCheck, Ban, Building2, CheckCircle2, FlaskConical, Gift, Megaphone, MessageSquare, NotebookPen,
  PlaneTakeoff, Receipt, ShieldCheck, Undo2, User, XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/chrome/console-shell";
import { BookingTimeline } from "@/components/shared/booking-timeline";
import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { HoldCountdown, SlaCountdown } from "@/components/shared/hold-countdown";
import { MoneyText } from "@/components/shared/money-text";
import { PolicyBadge } from "@/components/shared/policy-badge";
import { PriceBreakdown } from "@/components/shared/price-breakdown";
import { Pill, StatusChip } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/hooks/use-session";
import { useStore } from "@/lib/store";
import { bookingOps, itemsOf, RAIL_LABELS } from "@/lib/api";
import { quoteRefund } from "@/lib/domain/refunds";
import { legalEvents } from "@/lib/domain/state-machine";
import { formatDate, formatDateTime, formatRange } from "@/lib/format";
import { ConsoleLoading, Detail, GatedAction, Panel } from "@/features/admin/ops-ui";
import { breakdownFromItem, VERTICAL_LABELS } from "@/features/admin/ops-utils";
import type { AmendmentRequest, BookingItem, Payment, Refund } from "@/lib/domain/types";

type Pending =
  | { kind: "supplier_confirm" | "supplier_reject" | "force_confirm" | "cancel"; item: BookingItem }
  | { kind: "goodwill" }
  | null;

/**
 * O03 · Booking detail. The most important screen in the back office: everything that happened to a
 * booking, and every lever operations can pull, gated by the signed in role.
 * It doubles as the supplier simulator — confirm and reject drive the real state machine.
 */
export default function BookingDetailPage() {
  const params = useParams<{ id: string }>();
  const bookingId = params.id;
  const data = useStore((s) => s);
  const session = useSession();
  const [pending, setPending] = useState<Pending>(null);
  const [note, setNote] = useState("");

  const booking = data.bookings[bookingId];
  const items = useMemo(() => (booking ? itemsOf(data, booking.id) : []), [data, booking]);
  const timeline = useMemo(() => data.timeline.filter((e) => e.bookingId === bookingId), [data.timeline, bookingId]);
  const payments = useMemo(() => Object.values(data.payments).filter((p) => p.bookingId === bookingId).sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [data.payments, bookingId]);
  const refunds = useMemo(() => Object.values(data.refunds).filter((r) => r.bookingId === bookingId), [data.refunds, bookingId]);
  const amendments = useMemo(() => Object.values(data.amendments).filter((a) => a.bookingId === bookingId), [data.amendments, bookingId]);
  const supplierEvents = useMemo(() => timeline.filter((e) => e.visibility.includes("supplier")), [timeline]);

  if (!session.hydrated) return <ConsoleLoading />;

  if (!booking) {
    return (
      <EmptyState
        icon={Receipt}
        title="Booking not found"
        description="It may have been created in another browser profile, or the demo data was reset."
        action={<Button asChild><Link href="/admin/ops/bookings">Back to all bookings</Link></Button>}
      />
    );
  }

  const buyer = booking.buyerUserId !== "guest" ? data.users[booking.buyerUserId] : undefined;
  const org = booking.organisationId ? data.organisations[booking.organisationId] : undefined;
  const lead = booking.leadTraveller;

  const closeDialog = () => { setPending(null); setNote(""); };

  const paymentColumns: Column<Payment>[] = [
    { key: "when", header: "When", render: (p) => <span className="text-xs">{formatDateTime(p.createdAt)}</span> },
    { key: "rail", header: "Rail", render: (p) => <span className="text-sm">{RAIL_LABELS[p.rail]}</span> },
    { key: "provider", header: "Provider", render: (p) => <span className="text-xs text-muted-foreground">{p.provider}</span> },
    {
      key: "ref",
      header: "Reference",
      render: (p) => (
        <span className="font-mono text-[11px]">
          {p.providerReference ?? p.customerReference ?? "—"}
          <span className="block text-muted-foreground">idem {p.idempotencyKey.slice(0, 14)}</span>
        </span>
      ),
    },
    { key: "status", header: "Status", render: (p) => <Pill tone={p.status === "succeeded" ? "success" : p.status === "failed" ? "danger" : p.status === "refunded" ? "neutral" : "warning"}>{p.status.replace(/_/g, " ")}</Pill> },
    { key: "amount", header: "Amount", numeric: true, render: (p) => <MoneyText minor={p.amountMinor} currency={p.currency} size="sm" showCurrency={false} /> },
  ];

  const refundColumns: Column<Refund>[] = [
    { key: "when", header: "Raised", render: (r) => <span className="text-xs">{formatDateTime(r.createdAt)}</span> },
    { key: "reason", header: "Reason", render: (r) => <span className="text-sm">{r.reason}</span> },
    { key: "approver", header: "Approval", render: (r) => <span className="text-xs text-muted-foreground">{r.requiredApprover === "none" ? "Automatic" : `${r.requiredApprover} · ${r.approvals.length} signed`}</span> },
    { key: "status", header: "Status", render: (r) => <Pill tone={r.status === "processed" ? "success" : r.status === "rejected" ? "danger" : "warning"}>{r.status.replace(/_/g, " ")}</Pill> },
    { key: "amount", header: "Amount", numeric: true, render: (r) => <MoneyText minor={r.amountMinor} currency={r.currency} size="sm" showCurrency={false} /> },
  ];

  return (
    <>
      <PageHeader
        title={booking.reference}
        code="O03"
        description={`${items.length} item${items.length === 1 ? "" : "s"} · created ${formatDateTime(booking.createdAt)} via ${booking.createdVia}`}
        actions={
          <>
            <Button asChild variant="ghost" size="sm"><Link href="/admin/ops/bookings"><ArrowLeft aria-hidden /> All bookings</Link></Button>
            <GatedAction permission="REFUND:goodwill" icon={Gift} onClick={() => setPending({ kind: "goodwill" })}>
              Goodwill refund
            </GatedAction>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusChip status={booking.status} />
        <Pill tone={booking.paymentStatus === "succeeded" ? "success" : booking.paymentStatus === "unpaid" ? "neutral" : "warning"} icon={Receipt}>
          Payment {booking.paymentStatus.replace(/_/g, " ")}
        </Pill>
        {org ? <Pill tone="info" icon={Building2}>{org.name}</Pill> : null}
        {booking.promoCode ? <Pill tone="success">Promo {booking.promoCode}</Pill> : null}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          {/* Parties */}
          <Panel title="Who this booking is for" icon={User}>
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Detail label="Lead traveller">{lead ? `${lead.title} ${lead.firstName} ${lead.lastName}` : "Not captured"}</Detail>
              <Detail label="Phone">{lead?.phone ?? "—"}</Detail>
              <Detail label="Email">{lead?.email ?? "—"}</Detail>
              <Detail label="Account">
                {buyer ? (
                  <Link href={`/admin/support/customer/${encodeURIComponent(buyer.id)}`} className="text-brand-text hover:underline">{buyer.name}</Link>
                ) : lead?.email ? (
                  <Link href={`/admin/support/customer/${encodeURIComponent(lead.email)}`} className="text-brand-text hover:underline">Guest · 360 view</Link>
                ) : (
                  "Guest checkout"
                )}
              </Detail>
              <Detail label="Booked by">{data.users[booking.createdBy]?.name ?? booking.createdBy} · {booking.createdVia}</Detail>
              <Detail label="Payment rail">{booking.paymentRail ? RAIL_LABELS[booking.paymentRail] : "—"}</Detail>
              {booking.clientOrgName ? <Detail label="Agency client">{booking.clientOrgName}</Detail> : null}
              {booking.costCentre ? <Detail label="Cost centre">{booking.costCentre}</Detail> : null}
              {booking.projectCode ? <Detail label="Project code">{booking.projectCode}</Detail> : null}
            </dl>
            {booking.travellers.length > 1 ? (
              <div className="mt-4 border-t pt-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">All travellers</p>
                <ul className="mt-1.5 flex flex-wrap gap-2">
                  {booking.travellers.map((t) => (
                    <li key={t.id} className="rounded-full border bg-muted/40 px-2.5 py-1 text-xs">
                      {t.firstName} {t.lastName}{t.passportNumber ? ` · ${t.passportNumber}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
            {booking.justification ? (
              <p className="mt-4 rounded-lg border-l-2 border-brand-300 bg-brand-50/50 px-3 py-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Justification · </span>{booking.justification}
              </p>
            ) : null}
          </Panel>

          {/* Items */}
          {items.map((item) => (
            <ItemPanel
              key={item.id}
              item={item}
              amendment={amendments.find((a) => a.itemId === item.id && a.status === "requested")}
              supplierName={data.organisations[item.supplierId]?.name ?? item.supplierId}
              supplierContact={data.organisations[item.supplierId]}
              onAction={setPending}
            />
          ))}

          {/* Payments */}
          <Panel title="Payment history" icon={Receipt} description="Every intent against this booking, with the idempotency key that stops a late duplicate callback double charging.">
            <DataTable
              columns={paymentColumns}
              rows={payments}
              rowKey={(p) => p.id}
              caption="Payment history"
              empty={<EmptyState icon={Receipt} title="No payment yet" description="This booking has not reached the payment step." />}
            />
            {refunds.length ? (
              <div className="mt-4">
                <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Refunds</p>
                <DataTable columns={refundColumns} rows={refunds} rowKey={(r) => r.id} caption="Refunds on this booking" />
              </div>
            ) : null}
          </Panel>

          {/* Supplier comms */}
          <Panel title="Supplier communications" icon={MessageSquare} description="What the supplier has seen and sent on this booking.">
            {supplierEvents.length ? (
              <BookingTimeline events={supplierEvents} audience="supplier" />
            ) : (
              <p className="text-sm text-muted-foreground">Nothing has been sent to a supplier on this booking yet. Chasing a supplier from an item above writes into this thread.</p>
            )}
          </Panel>

          {/* Internal notes */}
          <Panel title="Internal notes" icon={NotebookPen} description="Never shown to the customer or the supplier.">
            {booking.internalNotes.length ? (
              <ul className="mb-4 space-y-2">
                {booking.internalNotes.map((n) => (
                  <li key={n.id} className="rounded-lg border bg-muted/40 p-3">
                    <p className="text-sm">{n.text}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground">{n.authorName} · {formatDateTime(n.at)}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mb-4 text-sm text-muted-foreground">No notes yet. Anything you write here stays inside operations.</p>
            )}
            <NoteForm bookingId={booking.id} />
          </Panel>
        </div>

        {/* Side rail */}
        <div className="space-y-4">
          <Panel title="Booking totals" icon={Receipt}>
            <dl className="space-y-2 text-sm">
              <Row label="Subtotal" minor={booking.subtotalMinor} />
              {booking.markupMinor ? <Row label="Agency markup" minor={booking.markupMinor} /> : null}
              <Row label="Taxes and levies" minor={booking.taxMinor} />
              <Row label="Service fee" minor={booking.feeMinor} />
              {booking.discountMinor ? <Row label="Discount" minor={-booking.discountMinor} /> : null}
              <div className="flex items-baseline justify-between border-t pt-2">
                <dt className="font-medium">Total</dt>
                <dd><MoneyText minor={booking.totalMinor} currency={booking.currency} size="md" /></dd>
              </div>
            </dl>
            {booking.extras.length ? (
              <div className="mt-3 border-t pt-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Extras</p>
                <ul className="mt-1.5 space-y-1">
                  {booking.extras.map((e) => (
                    <li key={e.id} className="flex items-baseline justify-between gap-3 text-xs">
                      <span className="text-muted-foreground">{e.label}</span>
                      <MoneyText minor={e.amountMinor} size="xs" showCurrency={false} />
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Panel>

          <Panel title="Complete timeline" icon={ShieldCheck} description="Internal view — every state change, including events the customer never sees.">
            <BookingTimeline events={timeline} audience="internal" />
          </Panel>
        </div>
      </div>

      {/* ── Action dialogs ───────────────────────────────── */}
      <Dialog open={pending !== null} onOpenChange={(o) => { if (!o) closeDialog(); }}>
        <DialogContent>
          {pending?.kind === "supplier_confirm" ? (
            <SupplierConfirmDialog item={pending.item} note={note} setNote={setNote} onDone={closeDialog} />
          ) : pending?.kind === "supplier_reject" ? (
            <SupplierRejectDialog item={pending.item} note={note} setNote={setNote} onDone={closeDialog} />
          ) : pending?.kind === "force_confirm" ? (
            <ForceConfirmDialog item={pending.item} note={note} setNote={setNote} onDone={closeDialog} />
          ) : pending?.kind === "cancel" ? (
            <CancelDialog item={pending.item} note={note} setNote={setNote} onDone={closeDialog} />
          ) : pending?.kind === "goodwill" ? (
            <GoodwillDialog bookingId={booking.id} maxMinor={booking.totalMinor} note={note} setNote={setNote} onDone={closeDialog} />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Row({ label, minor }: { label: string; minor: number }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd><MoneyText minor={minor} size="sm" showCurrency={false} /></dd>
    </div>
  );
}

/* ── One item, with its price breakdown and its operator actions ── */

function ItemPanel({ item, amendment, supplierName, supplierContact, onAction }: {
  item: BookingItem;
  amendment?: AmendmentRequest;
  supplierName: string;
  supplierContact?: { contactName?: string; contactPhone?: string; contactEmail?: string };
  onAction: (p: Pending) => void;
}) {
  const events = legalEvents(item.status);
  const canConfirm = events.includes("SUPPLIER_CONFIRMED");
  const canReject = events.includes("SUPPLIER_REJECTED");
  const canCancel = events.includes("CANCEL");
  const canTravel = events.includes("TRAVEL_COMPLETED");
  const refundQuote = canCancel ? quoteRefund(item.cancellationPolicySnapshot, item.sellPriceMinor, item.travelDateFrom) : undefined;

  return (
    <Panel
      title={item.productSnapshot.title}
      icon={PlaneTakeoff}
      description={`${VERTICAL_LABELS[item.vertical]} · ${item.productSnapshot.ratePlanName} · ${item.productSnapshot.city}, ${item.productSnapshot.region}`}
      actions={<StatusChip status={item.status} size="sm" />}
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="space-y-4">
          <dl className="grid gap-4 sm:grid-cols-3">
            <Detail label="Travel dates">{item.vertical === "stay" ? formatRange(item.travelDateFrom, item.travelDateTo) : formatDate(item.travelDateFrom)}</Detail>
            <Detail label="Party">{item.pax.adults} adult{item.pax.adults === 1 ? "" : "s"}{item.pax.children ? `, ${item.pax.children} child` : ""}{item.pax.infants ? `, ${item.pax.infants} infant` : ""} · qty {item.quantity}</Detail>
            <Detail label="Supplier">{supplierName}</Detail>
            <Detail label="Supplier reference">{item.supplierReference ? <span className="font-mono text-xs">{item.supplierReference}</span> : <span className="text-muted-foreground">Not confirmed</span>}</Detail>
            <Detail label="Cancellation policy">{item.cancellationPolicySnapshot.name}</Detail>
            <Detail label="Net / commission">
              <span className="flex flex-wrap items-baseline gap-1.5">
                <MoneyText minor={item.netCostMinor} size="sm" showCurrency={false} />
                <span className="text-xs text-muted-foreground">net ·</span>
                <MoneyText minor={item.commissionMinor} size="sm" showCurrency={false} className="text-success-foreground" />
              </span>
            </Detail>
          </dl>

          <div className="flex flex-wrap items-center gap-2">
            {item.slaDeadlineAt && (item.status === "awaiting_supplier" || item.status === "paid") ? <SlaCountdown deadlineAt={item.slaDeadlineAt} /> : null}
            {item.holdExpiresAt && (item.status === "held" || item.status === "pending_payment" || item.status === "pending_approval") ? <HoldCountdown expiresAt={item.holdExpiresAt} /> : null}
            {item.policyCheck ? <PolicyBadge inPolicy={item.policyCheck.inPolicy} reason={item.policyCheck.reason} capMinor={item.policyCheck.capMinor} size="sm" /> : null}
          </div>

          <p className="text-xs text-muted-foreground">{item.cancellationPolicySnapshot.summary}</p>

          {item.specialRequests ? (
            <p className="rounded-lg border-l-2 border-brand-300 bg-brand-50/50 px-3 py-2 text-xs">
              <span className="font-medium">Special request · </span>{item.specialRequests}
            </p>
          ) : null}
          {item.rejectionReason ? (
            <p className="rounded-lg border-l-2 border-destructive/50 bg-destructive/5 px-3 py-2 text-xs">
              <span className="font-medium text-destructive">Supplier rejected · </span>{item.rejectionReason}
            </p>
          ) : null}
          {supplierContact?.contactName ? (
            <p className="text-xs text-muted-foreground">
              Reservations contact · {supplierContact.contactName}{supplierContact.contactPhone ? ` · ${supplierContact.contactPhone}` : ""}{supplierContact.contactEmail ? ` · ${supplierContact.contactEmail}` : ""}
            </p>
          ) : null}

          {amendment ? <AmendmentStrip amendment={amendment} /> : null}

          {/* Operator actions */}
          <div className="border-t pt-3">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Operator actions</p>
            <div className="flex flex-wrap gap-2">
              <GatedAction
                permission="OPS:queue"
                icon={Megaphone}
                blockedReason={item.status === "awaiting_supplier" || item.status === "paid" ? undefined : "The supplier only owes an answer while the item is paid or awaiting supplier."}
                onClick={() => {
                  bookingOps.chaseSupplier(item.id);
                  toast.success("Supplier chased", { description: `Reminder sent to ${supplierName} by WhatsApp and email.` });
                }}
              >
                Chase supplier
              </GatedAction>

              <GatedAction
                permission="BOOKING:force_confirm"
                icon={BadgeCheck}
                variant="default"
                blockedReason={canConfirm ? undefined : `Cannot force confirm from ${item.status.replace(/_/g, " ")}.`}
                onClick={() => onAction({ kind: "force_confirm", item })}
              >
                Force confirm
              </GatedAction>

              <GatedAction
                permission="BOOKING:cancel"
                icon={Ban}
                variant="outline"
                blockedReason={canCancel ? undefined : `Cannot cancel from ${item.status.replace(/_/g, " ")}.`}
                onClick={() => onAction({ kind: "cancel", item })}
                title={refundQuote ? `${refundQuote.tierLabel}` : undefined}
              >
                Cancel item
              </GatedAction>

              <GatedAction
                permission="BOOKING:amend"
                icon={CheckCircle2}
                blockedReason={canTravel ? undefined : "Only a confirmed item can be marked as travelled."}
                onClick={() => {
                  bookingOps.markTravelled(item.id);
                  toast.success("Marked as travelled", { description: "The supplier payout for this item is now releasable." });
                }}
              >
                Mark travelled
              </GatedAction>
            </div>

            <p className="mb-2 mt-4 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              <FlaskConical className="size-3.5" aria-hidden /> Supplier simulator
            </p>
            <div className="flex flex-wrap gap-2">
              <GatedAction
                permission="OPS:queue"
                icon={CheckCircle2}
                blockedReason={canConfirm ? undefined : `The supplier cannot confirm from ${item.status.replace(/_/g, " ")}.`}
                onClick={() => onAction({ kind: "supplier_confirm", item })}
              >
                Supplier confirms
              </GatedAction>
              <GatedAction
                permission="OPS:queue"
                icon={XCircle}
                blockedReason={canReject ? undefined : `The supplier cannot reject from ${item.status.replace(/_/g, " ")}.`}
                onClick={() => onAction({ kind: "supplier_reject", item })}
              >
                Supplier rejects
              </GatedAction>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Rejecting refunds the customer in full automatically and raises an exception for the desk — exactly what the real connector does.
            </p>
          </div>
        </div>

        <PriceBreakdown data={breakdownFromItem(item)} showNet dense title="Item price · as sold" />
      </div>
    </Panel>
  );
}

function AmendmentStrip({ amendment }: { amendment: AmendmentRequest }) {
  return (
    <div className="rounded-lg border border-warning/40 bg-warning/5 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">Amendment requested · {amendment.kind.replace(/_/g, " ")}</p>
          <p className="text-xs text-muted-foreground">{amendment.detail} · requested by {amendment.requestedByName}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Fare difference</span>
          <MoneyText minor={amendment.fareDifferenceMinor} currency={amendment.currency} size="sm" showCurrency={false} />
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <GatedAction
          permission="BOOKING:amend"
          icon={CheckCircle2}
          onClick={() => {
            bookingOps.decideAmendment(amendment.id, true, "Approved from booking detail");
            toast.success("Amendment approved", { description: "The item price was adjusted and the supplier re-confirmed." });
          }}
        >
          Approve
        </GatedAction>
        <GatedAction
          permission="BOOKING:amend"
          icon={Undo2}
          onClick={() => {
            bookingOps.decideAmendment(amendment.id, false, "Declined from booking detail");
            toast.info("Amendment declined", { description: "The customer will be told the original booking stands." });
          }}
        >
          Decline
        </GatedAction>
      </div>
    </div>
  );
}

/* ── Notes ─────────────────────────────────────────────────── */

function NoteForm({ bookingId }: { bookingId: string }) {
  const [text, setText] = useState("");
  return (
    <div className="space-y-2">
      <Label htmlFor="new-note">Add an internal note</Label>
      <Textarea id="new-note" value={text} onChange={(e) => setText(e.target.value)} placeholder="Called the guest, they are happy to move to the Farm House…" rows={3} />
      <GatedAction
        permission="BOOKING:view_any"
        icon={NotebookPen}
        variant="default"
        blockedReason={text.trim() ? undefined : "Write the note first."}
        onClick={() => {
          bookingOps.addNote(bookingId, text.trim());
          setText("");
          toast.success("Note added to the booking");
        }}
      >
        Save note
      </GatedAction>
    </div>
  );
}

/* ── Dialogs ───────────────────────────────────────────────── */

function SupplierConfirmDialog({ item, note, setNote, onDone }: { item: BookingItem; note: string; setNote: (v: string) => void; onDone: () => void }) {
  const suggested = `SIM-${item.id.slice(-5).toUpperCase()}`;
  return (
    <>
      <DialogHeader>
        <DialogTitle>Simulate supplier confirmation</DialogTitle>
        <DialogDescription>
          Acts exactly as the supplier console would: the item moves to confirmed, revenue is recognised, the voucher is issued and the customer is notified.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-2">
        <Label htmlFor="supplier-ref">Supplier reference</Label>
        <Input id="supplier-ref" value={note} onChange={(e) => setNote(e.target.value)} placeholder={suggested} />
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
        <Button
          onClick={() => {
            const reference = note.trim() || suggested;
            bookingOps.supplierConfirm(item.id, reference);
            toast.success("Confirmed by supplier", { description: `${item.productSnapshot.title} · reference ${reference}` });
            onDone();
          }}
        >
          Confirm item
        </Button>
      </DialogFooter>
    </>
  );
}

function SupplierRejectDialog({ item, note, setNote, onDone }: { item: BookingItem; note: string; setNote: (v: string) => void; onDone: () => void }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Simulate supplier rejection</DialogTitle>
        <DialogDescription>
          The customer is refunded in full automatically, the inventory is released and an exception is raised so the desk can offer an alternative.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-2">
        <Label htmlFor="reject-reason">Reason given by the supplier</Label>
        <Textarea id="reject-reason" value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Overbooked · maintenance closure on the garden cottages" />
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
        <Button
          variant="destructive"
          disabled={!note.trim()}
          onClick={() => {
            bookingOps.supplierReject(item.id, note.trim());
            toast.error("Supplier rejected the item", { description: "Full refund issued automatically and an exception raised." });
            onDone();
          }}
        >
          Reject and refund
        </Button>
      </DialogFooter>
    </>
  );
}

function ForceConfirmDialog({ item, note, setNote, onDone }: { item: BookingItem; note: string; setNote: (v: string) => void; onDone: () => void }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle>Force confirm without the supplier</DialogTitle>
        <DialogDescription>
          Use this when you have confirmation outside the system — a phone call or a WhatsApp message. The reason is written to the audit log against your name.
        </DialogDescription>
      </DialogHeader>
      <div className="space-y-2">
        <Label htmlFor="force-note">Why are you overriding the supplier?</Label>
        <Textarea id="force-note" value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Spoke to Baraka on +255762000222, tent 14 held under our name." />
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
        <Button
          disabled={!note.trim()}
          onClick={() => {
            bookingOps.forceConfirm(item.id, note.trim());
            toast.success("Item force confirmed", { description: "Written to the audit log and any open supplier task was closed." });
            onDone();
          }}
        >
          Force confirm
        </Button>
      </DialogFooter>
    </>
  );
}

function CancelDialog({ item, note, setNote, onDone }: { item: BookingItem; note: string; setNote: (v: string) => void; onDone: () => void }) {
  const [goodwill, setGoodwill] = useState(false);
  const quote = quoteRefund(item.cancellationPolicySnapshot, item.sellPriceMinor, item.travelDateFrom);
  return (
    <>
      <DialogHeader>
        <DialogTitle>Cancel {item.productSnapshot.title}</DialogTitle>
        <DialogDescription>The refund is computed from the policy snapshot taken when the customer booked, not from today&apos;s policy.</DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div className="rounded-lg border bg-muted/40 p-3 text-sm">
          <p className="font-medium">{quote.tierLabel}</p>
          <p className="mt-1 flex items-baseline gap-2 text-muted-foreground">
            <span>{quote.daysBefore} days before travel · refund</span>
            <MoneyText minor={quote.refundMinor} size="sm" showCurrency={false} />
            <span>of</span>
            <MoneyText minor={item.sellPriceMinor} size="sm" showCurrency={false} />
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="cancel-reason">Reason</Label>
          <Textarea id="cancel-reason" value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Guest hospitalised, family requested cancellation" />
        </div>
        <div className="flex items-start gap-2">
          <Checkbox id="goodwill-flag" checked={goodwill} onCheckedChange={(v) => setGoodwill(v === true)} />
          <Label htmlFor="goodwill-flag" className="text-xs font-normal leading-snug text-muted-foreground">
            Treat as goodwill — routes the refund to a manager for approval regardless of the amount.
          </Label>
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onDone}>Keep the booking</Button>
        <Button
          variant="destructive"
          onClick={() => {
            bookingOps.cancel(item.id, { goodwill, reason: note.trim() || undefined });
            toast.success("Item cancelled", { description: `Refund of ${quote.refundMinor.toLocaleString("en-TZ")} TZS raised · ${quote.tierLabel}.` });
            onDone();
          }}
        >
          Cancel the item
        </Button>
      </DialogFooter>
    </>
  );
}

function GoodwillDialog({ bookingId, maxMinor, note, setNote, onDone }: { bookingId: string; maxMinor: number; note: string; setNote: (v: string) => void; onDone: () => void }) {
  const [amount, setAmount] = useState("");
  const value = Number(amount.replace(/[^0-9]/g, ""));
  const valid = value > 0 && value <= maxMinor && note.trim().length > 0;
  return (
    <>
      <DialogHeader>
        <DialogTitle>Request a goodwill refund</DialogTitle>
        <DialogDescription>Goodwill always needs a manager signature, whatever the amount. It lands in the finance refund queue.</DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="goodwill-amount">Amount in TZS (booking total {maxMinor.toLocaleString("en-TZ")})</Label>
          <Input id="goodwill-amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="120000" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="goodwill-reason">Why</Label>
          <Textarea id="goodwill-reason" value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Room not ready until 17:00, guest complaint escalated on WhatsApp." />
        </div>
      </div>
      <DialogFooter>
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
        <Button
          disabled={!valid}
          onClick={() => {
            bookingOps.requestGoodwillRefund(bookingId, value, note.trim());
            toast.success("Goodwill refund requested", { description: "Pending manager approval in the finance refund queue." });
            onDone();
          }}
        >
          Request refund
        </Button>
      </DialogFooter>
    </>
  );
}
