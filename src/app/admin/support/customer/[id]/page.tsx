"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft, Eye, Mail, MessageCircle, Phone, Receipt, Ticket, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, StatTile } from "@/components/chrome/console-shell";
import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { MoneyText } from "@/components/shared/money-text";
import { StatusChip, Pill } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSession } from "@/hooks/use-session";
import { useStore } from "@/lib/store";
import { auth, RAIL_LABELS } from "@/lib/api";
import { formatDate, formatDateTime, initials, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Booking, Payment, Ticket as TicketType } from "@/lib/domain/types";

/**
 * U03 · Customer 360.
 * Accepts either a user id or a booking reference, because most bookings in this market are
 * made by guests who never create an account.
 */
export default function Customer360Page({ params }: { params: Promise<{ id: string }> }) {
  const key = decodeURIComponent(use(params).id);
  const s = useSession();
  const users = useStore((st) => st.users);
  const bookings = useStore((st) => st.bookings);
  const items = useStore((st) => st.items);
  const payments = useStore((st) => st.payments);
  const tickets = useStore((st) => st.tickets);

  if (!s.hydrated) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;

  // Resolve either a user, or a booking reference → its lead traveller identity.
  const user = users[key];
  const byRef = Object.values(bookings).find((b) => b.reference === key);
  const identity = user
    ? { name: user.name, email: user.email, phone: user.phone, userId: user.id, avatarTone: user.avatarTone }
    : byRef?.leadTraveller
      ? { name: `${byRef.leadTraveller.firstName} ${byRef.leadTraveller.lastName}`, email: byRef.leadTraveller.email, phone: byRef.leadTraveller.phone, userId: undefined, avatarTone: "from-slate-500 to-slate-300" }
      : undefined;

  if (!identity) {
    return (
      <>
        <PageHeader title="Customer 360" code="U03" />
        <EmptyState
          title="No customer found"
          description={`Nothing matches "${key}". Search by phone, email, name or booking reference.`}
          action={<Button asChild><Link href="/admin/support/lookup">Back to lookup</Link></Button>}
        />
      </>
    );
  }

  // Gather every booking belonging to this identity — by user id, or by matching lead traveller contact.
  const mine = Object.values(bookings).filter((b) => {
    if (identity.userId && b.buyerUserId === identity.userId) return true;
    const lt = b.leadTraveller;
    if (!lt) return false;
    return (identity.email && lt.email === identity.email) || (identity.phone && lt.phone === identity.phone);
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const bookingIds = new Set(mine.map((b) => b.id));
  const myPayments = Object.values(payments).filter((p) => bookingIds.has(p.bookingId));
  const myTickets = Object.values(tickets).filter((t) => (t.bookingReference && mine.some((b) => b.reference === t.bookingReference)) || t.customerPhone === identity.phone);
  const lifetimeMinor = mine.filter((b) => b.paymentStatus === "succeeded").reduce((sum, b) => sum + b.totalMinor, 0);
  const canImpersonate = s.can("USER:impersonate");

  const bookingCols: Column<Booking>[] = [
    { key: "ref", header: "Reference", render: (b) => <Link href={`/admin/ops/bookings/${b.id}`} className="font-mono text-xs hover:text-brand-text">{b.reference}</Link> },
    {
      key: "what", header: "Booking",
      render: (b) => {
        const bi = Object.values(items).filter((i) => i.bookingId === b.id);
        return <span className="text-sm">{bi[0]?.productSnapshot.title ?? "—"}{bi.length > 1 ? ` +${bi.length - 1}` : ""}</span>;
      },
    },
    { key: "status", header: "Status", render: (b) => <StatusChip status={b.status} size="sm" /> },
    { key: "when", header: "Booked", render: (b) => <span className="text-xs text-muted-foreground">{formatDate(b.createdAt)}</span> },
    { key: "total", header: "Total", numeric: true, render: (b) => <MoneyText minor={b.totalMinor} currency={b.currency} size="sm" showCurrency={false} /> },
  ];

  const paymentCols: Column<Payment>[] = [
    { key: "rail", header: "Method", render: (p) => <span className="text-sm">{RAIL_LABELS[p.rail]}</span> },
    { key: "ref", header: "Reference", render: (p) => <span className="font-mono text-xs">{p.providerReference ?? p.customerReference ?? "—"}</span> },
    { key: "status", header: "Status", render: (p) => <Pill tone={p.status === "succeeded" ? "success" : p.status === "failed" ? "danger" : "warning"}>{p.status.replace(/_/g, " ")}</Pill> },
    { key: "when", header: "When", render: (p) => <span className="text-xs text-muted-foreground">{formatDateTime(p.createdAt)}</span> },
    { key: "amt", header: "Amount", numeric: true, render: (p) => <MoneyText minor={p.amountMinor} currency={p.currency} size="sm" showCurrency={false} /> },
  ];

  const ticketCols: Column<TicketType>[] = [
    { key: "ref", header: "Ticket", render: (t) => <span className="font-mono text-xs">{t.reference}</span> },
    { key: "subject", header: "Subject", render: (t) => <span className="text-sm">{t.subject}</span> },
    { key: "channel", header: "Channel", render: (t) => <span className="text-xs capitalize text-muted-foreground">{t.channel.replace("_", " ")}</span> },
    { key: "status", header: "Status", render: (t) => <Pill tone={t.status === "resolved" ? "success" : t.status === "open" ? "warning" : "brand"}>{t.status}</Pill> },
    { key: "when", header: "Raised", render: (t) => <span className="text-xs text-muted-foreground">{relativeTime(t.createdAt)}</span> },
  ];

  return (
    <>
      <Link href="/admin/support/lookup" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-brand-text">
        <ArrowLeft className="size-4" aria-hidden /> Customer lookup
      </Link>

      <div className="mb-5 flex flex-wrap items-center gap-4">
        <span className={cn("flex size-14 items-center justify-center rounded-full bg-gradient-to-br text-lg font-semibold text-white", identity.avatarTone)}>
          {initials(identity.name)}
        </span>
        <div className="min-w-0">
          <h1 className="font-display text-2xl">{identity.name}</h1>
          <p className="flex flex-wrap items-center gap-x-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1"><Phone className="size-3.5" aria-hidden /> {identity.phone}</span>
            <span className="flex items-center gap-1"><Mail className="size-3.5" aria-hidden /> {identity.email}</span>
            {!identity.userId ? <Pill tone="neutral">Guest — no account</Pill> : null}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="outline" className="gap-1.5" onClick={() => toast.success("WhatsApp opened", { description: identity.phone })}>
            <MessageCircle className="size-4" aria-hidden /> Message
          </Button>
          {identity.userId ? (
            <Button
              variant="outline" className="gap-1.5" disabled={!canImpersonate}
              onClick={() => { auth.impersonate(identity.userId!); toast.warning(`Now viewing as ${identity.name}`, { description: "Read only, 30 minute cap, fully audited." }); }}
            >
              <Eye className="size-4" aria-hidden /> View as customer
            </Button>
          ) : (
            <Button variant="outline" className="gap-1.5" disabled title="Guests have no account to impersonate">
              <Eye className="size-4" aria-hidden /> No account to view
            </Button>
          )}
        </div>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        <StatTile label="Lifetime value" value={<MoneyText minor={lifetimeMinor} currency="TZS" size="lg" compact />} icon={TrendingUp} />
        <StatTile label="Bookings" value={mine.length} hint={`${mine.filter((b) => b.status === "confirmed").length} confirmed`} />
        <StatTile label="Payments" value={myPayments.length} hint={`${myPayments.filter((p) => p.status !== "succeeded").length} not settled`} tone={myPayments.some((p) => p.status === "reconciliation_pending") ? "warning" : "default"} icon={Receipt} />
        <StatTile label="Support tickets" value={myTickets.length} hint={`${myTickets.filter((t) => t.status !== "resolved").length} open`} icon={Ticket} />
      </div>

      <Tabs defaultValue="bookings">
        <TabsList>
          <TabsTrigger value="bookings">Bookings ({mine.length})</TabsTrigger>
          <TabsTrigger value="payments">Payments ({myPayments.length})</TabsTrigger>
          <TabsTrigger value="tickets">Tickets ({myTickets.length})</TabsTrigger>
          <TabsTrigger value="notes">Notes</TabsTrigger>
        </TabsList>

        <TabsContent value="bookings" className="mt-4">
          <DataTable columns={bookingCols} rows={mine} rowKey={(b) => b.id} caption="Bookings" empty={<EmptyState title="No bookings" />} />
        </TabsContent>
        <TabsContent value="payments" className="mt-4">
          <DataTable columns={paymentCols} rows={myPayments} rowKey={(p) => p.id} caption="Payments" empty={<EmptyState title="No payments" />} />
        </TabsContent>
        <TabsContent value="tickets" className="mt-4">
          <DataTable columns={ticketCols} rows={myTickets} rowKey={(t) => t.id} caption="Tickets" empty={<EmptyState title="No tickets" />} />
        </TabsContent>
        <TabsContent value="notes" className="mt-4 space-y-3">
          {mine.flatMap((b) => b.internalNotes.map((n) => ({ b, n }))).length === 0 ? (
            <EmptyState title="No internal notes" description="Notes added on a booking in the operations console appear here." />
          ) : mine.flatMap((b) => b.internalNotes.map((n) => ({ b, n }))).map(({ b, n }) => (
            <div key={n.id} className="rounded-xl border bg-card p-3">
              <p className="text-sm">{n.text}</p>
              <p className="mt-1 text-xs text-muted-foreground">{n.authorName} · {formatDateTime(n.at)} · <span className="font-mono">{b.reference}</span></p>
            </div>
          ))}
        </TabsContent>
      </Tabs>
    </>
  );
}
