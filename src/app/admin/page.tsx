"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  AlertTriangle, ArrowUpRight, CalendarClock, ClipboardList, Hourglass, Inbox, ListChecks, Plane, ReceiptText, ShieldAlert,
} from "lucide-react";
import { PageHeader, StatTile } from "@/components/chrome/console-shell";
import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { MoneyText } from "@/components/shared/money-text";
import { SlaCountdown } from "@/components/shared/hold-countdown";
import { StatusChip, Pill } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";
import { useStore } from "@/lib/store";
import { formatDateShort, relativeTime } from "@/lib/format";
import { BookingRef, ConsoleLoading, Panel } from "@/features/admin/ops-ui";
import {
  departuresWithin, failedPayments, queueRows, slaBreachedItems, unconfirmedBookings, type QueueRow,
} from "@/features/admin/ops-utils";

/** O01 · Ops dashboard. Every number is a live count off the store and links to the queue behind it. */
export default function OpsDashboardPage() {
  const data = useStore((s) => s);
  const { hydrated, user } = useSession();

  const view = useMemo(() => {
    const rows = queueRows(data);
    return {
      rows,
      breaches: slaBreachedItems(data),
      payments: failedPayments(data),
      unconfirmed: unconfirmedBookings(data),
      departures: departuresWithin(data, 0),
      exceptions: Object.values(data.opsTasks).filter((t) => t.status !== "resolved"),
      tickets: Object.values(data.tickets).filter((t) => t.status !== "resolved"),
      amendments: Object.values(data.amendments).filter((a) => a.status === "requested"),
    };
  }, [data]);

  if (!hydrated) return <ConsoleLoading />;

  const columns: Column<QueueRow>[] = [
    {
      key: "ref",
      header: "Booking",
      render: (r) => (
        <div className="min-w-0">
          <BookingRef id={r.booking.id} reference={r.booking.reference} />
          <p className="truncate text-xs text-muted-foreground">{r.item.productSnapshot.title}</p>
        </div>
      ),
    },
    { key: "status", header: "Item", render: (r) => <StatusChip status={r.item.status} size="sm" /> },
    {
      key: "why",
      header: "Also",
      render: (r) => {
        // Skip any bucket that just repeats the status chip beside it.
        const extra = r.buckets.filter((b) => b !== r.item.status);
        if (!extra.length) return <span className="text-muted-foreground">—</span>;
        return (
        <div className="flex flex-wrap gap-1">
          {extra.map((b) => (
            <Pill key={b} tone={b === "supplier_rejected" || b === "payment_failed" ? "danger" : b === "partial" ? "warning" : "neutral"} className="text-xs">
              {b.replace(/_/g, " ")}
            </Pill>
          ))}
        </div>
        );
      },
    },
    {
      key: "due",
      header: "Due",
      render: (r) =>
        r.item.slaDeadlineAt ? (
          <SlaCountdown deadlineAt={r.item.slaDeadlineAt} />
        ) : (
          <span className="text-xs text-muted-foreground">{relativeTime(new Date(r.dueAt).toISOString())}</span>
        ),
    },
    { key: "value", header: "Value", numeric: true, render: (r) => <MoneyText minor={r.item.sellPriceMinor} size="sm" showCurrency={false} /> },
    { key: "travel", header: "Travel", render: (r) => <span className="text-xs">{formatDateShort(r.item.travelDateFrom)}</span> },
  ];

  return (
    <>
      <PageHeader
        title={`Operations · ${user?.name.split(" ")[0] ?? "team"}`}
        code="O01"
        description="Everything the operations desk owes someone an answer on, newest breach first. Numbers are live counts from the booking store."
        actions={
          <>
            <Button asChild variant="outline" size="sm"><Link href="/admin/ops/queue">Open the queue</Link></Button>
            <Button asChild size="sm"><Link href="/admin/ops/manual">New manual booking</Link></Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <TileLink href="/admin/ops/queue">
          <StatTile label="In the queue" value={view.rows.length} hint="Items needing an operator" icon={ListChecks} tone={view.rows.length > 8 ? "warning" : "default"} />
        </TileLink>
        <TileLink href="/admin/ops/suppliers">
          <StatTile label="SLA breached" value={view.breaches.length} hint="Past the 2 hour supplier SLA" icon={Hourglass} tone={view.breaches.length ? "danger" : "success"} />
        </TileLink>
        <TileLink href="/admin/ops/exceptions">
          <StatTile label="Failed payments" value={view.payments.length} hint="Failed or awaiting reconciliation" icon={ReceiptText} tone={view.payments.length ? "warning" : "default"} />
        </TileLink>
        <TileLink href="/admin/ops/bookings?status=processing">
          <StatTile label="Unconfirmed bookings" value={view.unconfirmed.length} hint="Processing or partial" icon={ClipboardList} tone={view.unconfirmed.length ? "warning" : "default"} />
        </TileLink>
        <TileLink href="/admin/ops/departures">
          <StatTile label="Departures today" value={view.departures.length} hint="Guests travelling in the next 24h" icon={Plane} />
        </TileLink>
        <TileLink href="/admin/ops/exceptions">
          <StatTile label="Open exceptions" value={view.exceptions.length} hint="Partials, holds, reconciliation, integrations" icon={AlertTriangle} tone={view.exceptions.length ? "warning" : "default"} />
        </TileLink>
        <TileLink href="/admin/ops/amendments">
          <StatTile label="Amendments waiting" value={view.amendments.length} hint="Fare difference computed" icon={CalendarClock} />
        </TileLink>
        <TileLink href="/admin/support">
          <StatTile label="Open tickets" value={view.tickets.length} hint="Support inbox" icon={Inbox} />
        </TileLink>
        <TileLink href="/admin/ops/suppliers">
          <StatTile label="Awaiting supplier" value={view.rows.filter((r) => r.buckets.includes("awaiting_supplier")).length} hint="Paid, not yet confirmed" icon={ShieldAlert} />
        </TileLink>
      </div>

      <div className="mt-5">
        <Panel
          title="Most urgent right now"
          description="Sorted by the moment each item becomes late — SLA deadline, hold expiry, then travel date."
          actions={<Button asChild variant="ghost" size="sm"><Link href="/admin/ops/queue">Full queue <ArrowUpRight aria-hidden /></Link></Button>}
        >
          <DataTable
            columns={columns}
            rows={view.rows.slice(0, 10)}
            rowKey={(r) => r.item.id}
            caption="Most urgent operations items"
            empty={<EmptyState icon={ListChecks} title="The queue is clear" description="No item is waiting on a supplier, a payment or an amendment decision." />}
          />
        </Panel>
      </div>
    </>
  );
}

function TileLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="rounded-xl transition-shadow hover:shadow-sm focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50">
      {children}
    </Link>
  );
}
