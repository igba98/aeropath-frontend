"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { BedDouble, CalendarCheck2, Car, Map, Plane, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageHeader, StatTile } from "@/components/chrome/console-shell";
import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { Pill, StatusChip } from "@/components/shared/status-chip";
import { useSession } from "@/hooks/use-session";
import { useStore } from "@/lib/store";
import { formatWeekday, today } from "@/lib/format";
import { BookingRef, ConsoleLoading, Panel } from "@/features/admin/ops-ui";
import { departuresWithin, VERTICAL_LABELS } from "@/features/admin/ops-utils";
import type { BookingItem, Vertical } from "@/lib/domain/types";

const VERTICAL_ICONS: Record<Vertical, LucideIcon> = { stay: BedDouble, tour: Map, transfer: Car, flight: Plane };

/** O08 · Departures. The operational day view — who is moving, who is meeting them, who to call. */
export default function DeparturesPage() {
  const data = useStore((s) => s);
  const session = useSession();
  const router = useRouter();

  const items = useMemo(() => departuresWithin(data, 3), [data]);

  if (!session.hydrated) return <ConsoleLoading />;

  const todayKey = today();
  const days = [...new Set(items.map((i) => i.travelDateFrom))].sort();
  const todays = items.filter((i) => i.travelDateFrom === todayKey);
  const guestsToday = todays.reduce((s, i) => s + i.pax.adults + i.pax.children + i.pax.infants, 0);
  const movementsToday = todays.filter((i) => i.vertical === "transfer" || i.vertical === "flight").length;
  const guidedToday = todays.filter((i) => i.vertical === "tour").length;

  const columns: Column<BookingItem>[] = [
    {
      key: "type",
      header: "Type",
      render: (i) => {
        const Icon = VERTICAL_ICONS[i.vertical];
        return (
          <span className="inline-flex items-center gap-1.5 text-sm">
            <Icon className="size-4 text-muted-foreground" aria-hidden />
            {VERTICAL_LABELS[i.vertical]}
          </span>
        );
      },
    },
    {
      key: "what",
      header: "Service",
      render: (i) => (
        <div className="min-w-0">
          <p className="truncate text-sm">{i.productSnapshot.title}</p>
          <p className="truncate text-xs text-muted-foreground">{i.productSnapshot.ratePlanName} · {i.productSnapshot.city}</p>
        </div>
      ),
    },
    {
      key: "guest",
      header: "Guest",
      render: (i) => {
        const b = data.bookings[i.bookingId];
        const lead = b?.leadTraveller;
        return (
          <div className="min-w-0">
            <p className="truncate text-sm">{lead ? `${lead.firstName} ${lead.lastName}` : "—"}</p>
            <p className="truncate text-xs text-muted-foreground">{lead?.phone ?? "no phone on file"}</p>
          </div>
        );
      },
    },
    {
      key: "party",
      header: "Party",
      render: (i) => (
        <span className="text-xs whitespace-nowrap">
          {i.pax.adults + i.pax.children + i.pax.infants} pax · {i.quantity} {i.vertical === "transfer" ? "vehicle" : i.vertical === "stay" ? "room" : "unit"}{i.quantity === 1 ? "" : "s"}
        </span>
      ),
    },
    {
      key: "supplier",
      header: "Supplier",
      render: (i) => {
        const org = data.organisations[i.supplierId];
        return (
          <div className="min-w-0">
            <p className="truncate text-sm">{org?.name ?? i.supplierId}</p>
            <p className="truncate text-xs text-muted-foreground">{org?.contactPhone ?? ""}</p>
          </div>
        );
      },
    },
    { key: "ref", header: "Reference", render: (i) => {
      const b = data.bookings[i.bookingId];
      return (
        <div className="min-w-0">
          {b ? <BookingRef id={b.id} reference={b.reference} /> : null}
          <p className="font-mono text-[11px] text-muted-foreground">{i.supplierReference ?? "no supplier ref"}</p>
        </div>
      );
    } },
    { key: "status", header: "Status", render: (i) => <StatusChip status={i.status} size="sm" /> },
    {
      key: "notes",
      header: "Notes",
      render: (i) => (i.specialRequests ? <span className="text-xs text-muted-foreground">{i.specialRequests}</span> : <span className="text-xs text-muted-foreground/60">—</span>),
    },
  ];

  return (
    <>
      <PageHeader
        title="Departures"
        code="O08"
        description="Today and the next three days. Transfers and pickups first thing, guided departures, check-ins — with a number to ring for every guest and every supplier."
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Movements today" value={todays.length} icon={CalendarCheck2} />
        <StatTile label="Guests travelling" value={guestsToday} icon={Users} />
        <StatTile label="Transfers and flights" value={movementsToday} icon={Car} tone={movementsToday ? "warning" : "default"} />
        <StatTile label="Guided departures" value={guidedToday} icon={Map} />
      </div>

      {days.length ? (
        <div className="space-y-4">
          {days.map((day) => {
            const rows = items.filter((i) => i.travelDateFrom === day);
            return (
              <Panel
                key={day}
                title={day === todayKey ? `Today · ${formatWeekday(day)}` : formatWeekday(day)}
                description={`${rows.length} service${rows.length === 1 ? "" : "s"} · ${rows.reduce((s, i) => s + i.pax.adults + i.pax.children + i.pax.infants, 0)} guests`}
                actions={day === todayKey ? <Pill tone="brand">Operational day</Pill> : null}
              >
                <DataTable
                  columns={columns}
                  rows={rows}
                  rowKey={(i) => i.id}
                  caption={`Departures on ${day}`}
                  onRowClick={(i) => router.push(`/admin/ops/bookings/${i.bookingId}`)}
                />
              </Panel>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={CalendarCheck2}
          title="Nothing departs in the next three days"
          description="Confirmed items travelling today through three days out appear here. Create a manual booking with a near date to populate the day view."
        />
      )}
    </>
  );
}
