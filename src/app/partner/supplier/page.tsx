"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, BedDouble, CalendarCheck, Hourglass, Inbox, TrendingUp, Wallet } from "lucide-react";
import { PageHeader, StatTile } from "@/components/chrome/console-shell";
import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { MoneyText } from "@/components/shared/money-text";
import { SlaCountdown } from "@/components/shared/hold-countdown";
import { StatusChip, Pill } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { useStore, type StoreData } from "@/lib/store";
import { catalog } from "@/lib/api";
import { formatRange, today, addDays } from "@/lib/format";
import { cn } from "@/lib/utils";
import { NotSupplier, isBreached, usePendingConfirmations, useSupplierContext } from "@/features/supplier/shared";
import type { BookingItem } from "@/lib/domain/types";

/** S02 · Supplier dashboard. Bookings today, SLA queue, occupancy, revenue MTD, payout due. */
export default function SupplierDashboardPage() {
  const router = useRouter();
  const { org, hydrated } = useSupplierContext();
  const data = useStore((s) => s) as StoreData;
  const pending = usePendingConfirmations(org?.id);

  if (!hydrated) return <p className="text-sm text-muted-foreground">Loading your console…</p>;
  if (!org) {
    return (
      <>
        <PageHeader title="Supplier dashboard" code="S02" description="Bookings, confirmations, occupancy and payouts for your property." />
        <NotSupplier what="The supplier dashboard" />
      </>
    );
  }

  const myItems = Object.values(data.items).filter((i) => i.supplierId === org.id);
  const todayIso = today();
  const monthPrefix = todayIso.slice(0, 7);

  const receivedToday = myItems.filter((i) => data.bookings[i.bookingId]?.createdAt.slice(0, 10) === todayIso && i.status !== "draft" && i.status !== "held");
  const arrivalsToday = myItems.filter((i) => i.travelDateFrom === todayIso && ["confirmed", "amended", "used"].includes(i.status));

  // Occupancy across the next seven nights for every sellable product of this supplier
  const myProducts = Object.values(data.products).filter((p) => p.supplierId === org.id && p.status !== "archived");
  let capacity = 0;
  let taken = 0;
  for (const p of myProducts) {
    if (p.vertical === "flight") continue;
    for (let d = 0; d < 7; d++) {
      const unit = catalog.unit(data, p.id, addDays(todayIso, d));
      capacity += unit.capacityTotal;
      taken += unit.capacitySold + unit.capacityHeld;
    }
  }
  const occupancyPct = capacity ? Math.round((taken / capacity) * 100) : 0;

  const earned = myItems.filter((i) => ["confirmed", "amended", "used"].includes(i.status) && i.createdAt.slice(0, 7) === monthPrefix);
  const grossMtd = earned.reduce((s, i) => s + i.sellPriceMinor, 0);
  const netMtd = earned.reduce((s, i) => s + i.netCostMinor, 0);

  const myPayouts = Object.values(data.payouts).filter((p) => p.supplierId === org.id);
  const duePayouts = myPayouts.filter((p) => p.status !== "executed" && p.status !== "failed");
  const payoutDue = duePayouts.reduce((s, p) => s + p.netMinor, 0);
  const nextPeriod = duePayouts.map((p) => p.periodLabel).join(", ");

  const breached = pending.filter(isBreached).length;

  const columns: Column<BookingItem>[] = [
    {
      key: "guest",
      header: "Guest",
      render: (i) => {
        const b = data.bookings[i.bookingId];
        return (
          <div className={cn("flex flex-col", isBreached(i) && "border-l-2 border-destructive pl-2")}>
            <span className={cn("font-medium", isBreached(i) && "text-destructive")}>{b?.leadTraveller ? `${b.leadTraveller.firstName} ${b.leadTraveller.lastName}` : "Guest"}</span>
            <span className="font-mono text-[11px] text-muted-foreground">{b?.reference}</span>
          </div>
        );
      },
    },
    { key: "product", header: "Product", render: (i) => <span className="text-sm">{i.productSnapshot.title}</span> },
    { key: "dates", header: "Dates", render: (i) => <span className="text-sm text-muted-foreground">{formatRange(i.travelDateFrom, i.travelDateTo)}</span> },
    { key: "value", header: "Value", numeric: true, render: (i) => <MoneyText minor={i.sellPriceMinor} currency="TZS" size="sm" showCurrency={false} /> },
    { key: "sla", header: "SLA", render: (i) => <SlaCountdown deadlineAt={i.slaDeadlineAt} /> },
    {
      key: "go",
      header: "",
      render: (i) => (
        <Button size="sm" variant="outline" asChild>
          <Link href={`/partner/supplier/bookings/${i.bookingId}`}>
            Review<ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={org.name}
        code="S02"
        description={`Supplier console · ${org.city}, ${org.countryCode}. Confirmations are due within 2 hours of payment.`}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link href="/partner/supplier/availability">
                <CalendarCheck className="size-4" aria-hidden />
                Availability
              </Link>
            </Button>
            <Button asChild>
              <Link href="/partner/supplier/bookings">
                <Inbox className="size-4" aria-hidden />
                Bookings inbox
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatTile label="Bookings today" value={receivedToday.length} hint={`${arrivalsToday.length} arriving today`} icon={CalendarCheck} />
        <StatTile
          label="Pending confirmations"
          value={pending.length}
          hint={breached ? `${breached} past the 2 hour SLA` : "All within SLA"}
          tone={breached ? "danger" : pending.length ? "warning" : "default"}
          icon={Hourglass}
        />
        <StatTile label="Occupancy this week" value={`${occupancyPct}%`} hint={`${taken} of ${capacity} units sold or held`} icon={BedDouble} />
        <StatTile label="Revenue MTD" value={<MoneyText minor={grossMtd} currency="TZS" size="lg" compact />} hint={`Gross value of ${earned.length} booking${earned.length === 1 ? "" : "s"}`} icon={TrendingUp} />
        <StatTile label="Payout due" value={<MoneyText minor={payoutDue} currency="TZS" size="lg" compact />} hint={nextPeriod || "Nothing outstanding"} icon={Wallet} tone={payoutDue ? "success" : "default"} />
      </div>

      <div className="mt-3 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Your share of month to date revenue</p>
          <MoneyText minor={netMtd} currency="TZS" size="md" />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {earned.length} confirmed or completed booking{earned.length === 1 ? "" : "s"} this month · platform commission {org.commissionPct ?? 0}% · paid {org.payoutTermsDays ?? 14} days after travel.
        </p>
      </div>

      <section className="mt-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-lg">Pending confirmations</h2>
            {breached ? <Pill tone="danger" icon={Hourglass}>{breached} breached</Pill> : null}
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/partner/supplier/bookings">
              Open inbox<ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </Button>
        </div>
        <DataTable
          caption="Bookings awaiting your confirmation, most urgent first"
          columns={columns}
          rows={pending}
          rowKey={(i) => i.id}
          onRowClick={(i) => router.push(`/partner/supplier/bookings/${i.bookingId}`)}
          empty={<EmptyState icon={Inbox} title="Nothing waiting on you" description="Every paid booking for your products has been confirmed. New requests appear here with a 2 hour countdown." />}
        />
      </section>

      <section className="mt-6">
        <h2 className="mb-3 font-display text-lg">Arriving today</h2>
        {arrivalsToday.length ? (
          <ul className="grid gap-2 md:grid-cols-2">
            {arrivalsToday.map((i) => {
              const b = data.bookings[i.bookingId];
              return (
                <li key={i.id} className="rounded-xl border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{b?.leadTraveller ? `${b.leadTraveller.firstName} ${b.leadTraveller.lastName}` : "Guest"}</p>
                      <p className="truncate text-sm text-muted-foreground">{i.productSnapshot.title} · {i.productSnapshot.ratePlanName}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{formatRange(i.travelDateFrom, i.travelDateTo)} · {i.pax.adults} adult{i.pax.adults === 1 ? "" : "s"}{i.pax.children ? `, ${i.pax.children} child` : ""}</p>
                    </div>
                    <StatusChip status={i.status} size="sm" />
                  </div>
                  {i.specialRequests ? <p className="mt-2 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">{i.specialRequests}</p> : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState icon={BedDouble} title="No arrivals today" description="Confirmed bookings arriving today appear here with their special requests." />
        )}
      </section>
    </>
  );
}
