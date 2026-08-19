"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { BookOpen, Search } from "lucide-react";
import { PageHeader } from "@/components/chrome/console-shell";
import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { MoneyText } from "@/components/shared/money-text";
import { StatusChip } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useStore } from "@/lib/store";
import { itemsOf, RAIL_LABELS } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { ConsoleLoading, FilterChips, Panel } from "@/features/admin/ops-ui";
import type { Booking, BookingStatus } from "@/lib/domain/types";
import { useSession } from "@/hooks/use-session";

type StatusFilter = BookingStatus | "all";

const STATUSES: BookingStatus[] = ["draft", "pending_approval", "processing", "partial", "confirmed", "cancelled", "refunded", "expired"];

/** O03 · All bookings. The way in to the booking detail screen. */
export default function BookingsListPage() {
  return (
    <Suspense fallback={<ConsoleLoading />}>
      <BookingsList />
    </Suspense>
  );
}

function BookingsList() {
  const data = useStore((s) => s);
  const { hydrated } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const initial = (params.get("status") ?? "all") as StatusFilter;
  const [status, setStatus] = useState<StatusFilter>(STATUSES.includes(initial as BookingStatus) ? initial : "all");
  const [q, setQ] = useState("");

  const bookings = useMemo(
    () => Object.values(data.bookings).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [data.bookings],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return bookings.filter((b) => {
      if (status !== "all" && b.status !== status) return false;
      if (!needle) return true;
      const lead = b.leadTraveller;
      const hay = `${b.reference} ${lead ? lead.firstName + " " + lead.lastName : ""} ${lead?.email ?? ""} ${lead?.phone ?? ""} ${b.clientOrgName ?? ""}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [bookings, status, q]);

  if (!hydrated) return <ConsoleLoading />;

  const options: Array<{ id: StatusFilter; label: string; count: number }> = [
    { id: "all", label: "All", count: bookings.length },
    ...STATUSES.map((s) => ({ id: s as StatusFilter, label: s.replace(/_/g, " "), count: bookings.filter((b) => b.status === s).length })).filter((o) => o.count > 0),
  ];

  const columns: Column<Booking>[] = [
    {
      key: "ref",
      header: "Reference",
      render: (b) => (
        <div className="min-w-0">
          <span className="font-mono text-xs font-medium text-brand-text">{b.reference}</span>
          <p className="text-[11px] text-muted-foreground">{formatDateTime(b.createdAt)}</p>
        </div>
      ),
    },
    {
      key: "lead",
      header: "Lead traveller",
      render: (b) => (
        <div className="min-w-0">
          <p className="truncate text-sm">{b.leadTraveller ? `${b.leadTraveller.firstName} ${b.leadTraveller.lastName}` : "—"}</p>
          <p className="truncate text-xs text-muted-foreground">{b.leadTraveller?.phone ?? b.leadTraveller?.email ?? ""}</p>
        </div>
      ),
    },
    {
      key: "items",
      header: "Items",
      render: (b) => {
        const items = itemsOf(data, b.id);
        return (
          <div className="min-w-0">
            <p className="truncate text-sm">{items[0]?.productSnapshot.title ?? "No items"}</p>
            {items.length > 1 ? <p className="text-xs text-muted-foreground">+{items.length - 1} more</p> : null}
          </div>
        );
      },
    },
        { key: "rail", header: "Paid by", render: (b) => <span className="text-xs">{b.paymentRail ? RAIL_LABELS[b.paymentRail] : "—"}</span> },
    { key: "status", header: "Status", render: (b) => <StatusChip status={b.status} size="sm" /> },
    { key: "total", header: "Total", numeric: true, render: (b) => <MoneyText minor={b.totalMinor} size="sm" showCurrency={false} /> },
  ];

  return (
    <>
      <PageHeader
        title="All bookings"
        code="O03"
        description="Every booking on the platform, whichever channel created it. Open one for the full item breakdown, timeline and operator actions."
        actions={<Button asChild size="sm"><Link href="/admin/ops/manual">New manual booking</Link></Button>}
      />

      <Panel className="mb-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <FilterChips options={options} value={status} onChange={setStatus} ariaLabel="Filter bookings by status" />
          <div className="w-full max-w-xs">
            <Label htmlFor="booking-search" className="sr-only">Search bookings</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input id="booking-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Reference, name, phone, email" className="pl-8" />
            </div>
          </div>
        </div>
      </Panel>

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(b) => b.id}
        caption="All bookings"
        onRowClick={(b) => router.push(`/admin/ops/bookings/${b.id}`)}
        empty={<EmptyState icon={BookOpen} title="No bookings match" description="Clear the filter or search for a different reference." />}
      />
      <p className="mt-2 text-xs text-muted-foreground">{filtered.length} of {bookings.length} bookings</p>
    </>
  );
}
