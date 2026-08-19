"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Inbox } from "lucide-react";
import { PageHeader } from "@/components/chrome/console-shell";
import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { MoneyText } from "@/components/shared/money-text";
import { SlaCountdown } from "@/components/shared/hold-countdown";
import { StatusChip } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useStore } from "@/lib/store";
import { formatDate, formatRange } from "@/lib/format";
import { cn } from "@/lib/utils";
import { NotSupplier, isBreached, useSupplierContext } from "@/features/supplier/shared";
import type { BookingItem, ItemStatus } from "@/lib/domain/types";

const TABS: Array<{ id: string; label: string; statuses: ItemStatus[] }> = [
  { id: "new", label: "New", statuses: ["awaiting_supplier", "paid"] },
  { id: "confirmed", label: "Confirmed", statuses: ["confirmed", "used"] },
  { id: "amended", label: "Amended", statuses: ["amended"] },
  { id: "cancelled", label: "Cancelled", statuses: ["cancelled", "refunded", "supplier_rejected"] },
];

/** S07 · Bookings inbox. New requests are sorted by SLA remaining, breached rows stand out. */
export default function SupplierBookingsPage() {
  const router = useRouter();
  const { org, hydrated } = useSupplierContext();
  const items = useStore((s) => s.items);
  const bookings = useStore((s) => s.bookings);
  const [tab, setTab] = useState("new");

  if (!hydrated) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!org) {
    return (
      <>
        <PageHeader title="Bookings" code="S07" description="Every booking for your products, with the 2 hour confirmation SLA." />
        <NotSupplier what="The bookings inbox" />
      </>
    );
  }

  const mine = Object.values(items).filter((i) => i.supplierId === org.id);

  function rowsFor(id: string): BookingItem[] {
    const spec = TABS.find((t) => t.id === id);
    if (!spec) return [];
    const rows = mine.filter((i) => spec.statuses.includes(i.status));
    if (id === "new") return rows.sort((a, b) => (a.slaDeadlineAt ?? "9999").localeCompare(b.slaDeadlineAt ?? "9999"));
    return rows.sort((a, b) => a.travelDateFrom.localeCompare(b.travelDateFrom));
  }

  const guestName = (i: BookingItem) => {
    const b = bookings[i.bookingId];
    return b?.leadTraveller ? `${b.leadTraveller.firstName} ${b.leadTraveller.lastName}` : "Guest";
  };

  const baseColumns: Column<BookingItem>[] = [
    {
      key: "guest",
      header: "Guest",
      render: (i) => (
        <div className={cn("flex flex-col", i.status === "awaiting_supplier" && isBreached(i) && "border-l-2 border-destructive pl-2")}>
          <span className={cn("font-medium", i.status === "awaiting_supplier" && isBreached(i) && "text-destructive")}>{guestName(i)}</span>
          <span className="font-mono text-[11px] text-muted-foreground">{bookings[i.bookingId]?.reference}</span>
        </div>
      ),
    },
    {
      key: "product",
      header: "Product",
      render: (i) => (
        <div className="min-w-0">
          <p className="truncate text-sm">{i.productSnapshot.title}</p>
          <p className="truncate text-xs text-muted-foreground">{i.productSnapshot.ratePlanName}</p>
        </div>
      ),
    },
    { key: "dates", header: "Travel", render: (i) => <span className="text-sm text-muted-foreground">{formatRange(i.travelDateFrom, i.travelDateTo)}</span> },
    { key: "pax", header: "Pax", numeric: true, render: (i) => <span className="text-sm tabular-nums">{i.pax.adults + i.pax.children}</span> },
    { key: "value", header: "Value", numeric: true, render: (i) => <MoneyText minor={i.sellPriceMinor} currency="TZS" size="sm" showCurrency={false} /> },
  ];

  const columnsFor = (id: string): Column<BookingItem>[] => [
    ...baseColumns,
    id === "new"
      ? { key: "sla", header: "SLA", render: (i: BookingItem) => <SlaCountdown deadlineAt={i.slaDeadlineAt} /> }
      : { key: "status", header: "Status", render: (i: BookingItem) => <StatusChip status={i.status} size="sm" /> },
    id !== "new"
      ? { key: "ref", header: "Your ref", render: (i: BookingItem) => <span className="font-mono text-xs">{i.supplierReference ?? "—"}</span> }
      : { key: "booked", header: "Booked", render: (i: BookingItem) => <span className="text-xs text-muted-foreground">{formatDate(i.createdAt)}</span> },
    {
      key: "go",
      header: "",
      className: "w-px",
      render: (i: BookingItem) => (
        <Button size="sm" variant="outline" asChild>
          <Link href={`/partner/supplier/bookings/${i.bookingId}`} aria-label={`Open ${bookings[i.bookingId]?.reference}`}>
            Open<ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </Button>
      ),
    },
  ];

  const emptyCopy: Record<string, { title: string; description: string }> = {
    new: { title: "Nothing waiting on you", description: "Paid bookings appear here the moment the guest pays, with a 2 hour countdown to confirm or reject." },
    confirmed: { title: "No confirmed bookings", description: "Bookings you have confirmed, and past stays marked as travelled, appear here." },
    amended: { title: "No amendments", description: "Date, pax or room changes requested after confirmation appear here for you to action." },
    cancelled: { title: "Nothing cancelled", description: "Cancellations, refunds and bookings you rejected appear here with their reason." },
  };

  return (
    <>
      <PageHeader
        title="Bookings"
        code="S07"
        description={`${mine.length} booking line${mine.length === 1 ? "" : "s"} across your products. Confirm within 2 hours of payment or operations will chase you.`}
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          {TABS.map((t) => {
            const count = rowsFor(t.id).length;
            return (
              <TabsTrigger key={t.id} value={t.id}>
                {t.label}
                {count ? <span className="ml-1.5 rounded-full bg-muted px-1.5 text-[11px] tabular-nums">{count}</span> : null}
              </TabsTrigger>
            );
          })}
        </TabsList>
        {TABS.map((t) => (
          <TabsContent key={t.id} value={t.id} className="mt-4">
            {t.id === "new" && rowsFor("new").some(isBreached) ? (
              <p className="mb-3 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {rowsFor("new").filter(isBreached).length} booking(s) are past the 2 hour SLA. Operations can force confirm or cancel these on your behalf.
              </p>
            ) : null}
            <DataTable
              caption={`${t.label} bookings`}
              columns={columnsFor(t.id)}
              rows={rowsFor(t.id)}
              rowKey={(i) => i.id}
              onRowClick={(i) => router.push(`/partner/supplier/bookings/${i.bookingId}`)}
              empty={<EmptyState icon={Inbox} title={emptyCopy[t.id].title} description={emptyCopy[t.id].description} />}
            />
          </TabsContent>
        ))}
      </Tabs>
    </>
  );
}
