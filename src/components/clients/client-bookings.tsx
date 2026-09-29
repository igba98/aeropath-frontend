"use client";

import * as React from "react";
import Link from "next/link";
import { BookOpenCheck, Plus } from "lucide-react";

import type { Client } from "@/domain/types";
import { can } from "@/domain/permissions";
import { useApp, useMe } from "@/store";
import { useNow } from "@/lib/use-now";
import { bookingRows, PAY_KEY, type BookingRow } from "@/lib/view-models";
import { fmtDate, fmtRange } from "@/lib/dates";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState, Section } from "@/components/shared/page";
import { StatusChip } from "@/components/shared/status-chip";
import { Amount } from "@/components/shared/amount";
import { Route, ServiceIcons } from "@/components/shared/bits";

/** The client's booking files as a timetable (same rows as /bookings). */
export function ClientBookings({ client }: { client: Client }) {
  const me = useMe();
  const db = useApp((s) => s.db)!;
  const now = useNow();
  const rate = db.settings.fx.USD_TZS;
  const rows = React.useMemo(() => bookingRows(db, now, (f) => f.clientId === client.id), [db, now, client.id]);
  const inTzs = (r: BookingRow, minor: number) => minor * (r.totals.currency === "USD" ? rate : 1);

  const columns: Column<BookingRow>[] = [
    {
      key: "number",
      header: "File no.",
      sort: (r) => r.number,
      csv: (r) => r.number,
      cell: (r) => (
        <span className="block leading-tight">
          <span className="block font-mono whitespace-nowrap text-[13.5px] font-semibold text-ink">{r.number}</span>
          <span className="block text-xs text-ink-4">{fmtDate(r.createdAt)}</span>
        </span>
      ),
    },
    {
      key: "route",
      header: "Route / title",
      sort: (r) => r.route.join("") || r.title,
      csv: (r) => (r.route.length ? r.route.join("-") + " · " : "") + r.title,
      className: "max-w-[300px]",
      cell: (r) => (
        <span className="block min-w-0 leading-tight">
          {r.route.length ? <Route codes={r.route} size="sm" /> : <span className="text-[13px] text-ink-3">No flight</span>}
          <span className="mt-0.5 block truncate text-[13px] text-ink-3">{r.title}</span>
        </span>
      ),
    },
    { key: "services", header: "Services", hideBelow: "2xl", cell: (r) => <ServiceIcons types={r.lineTypes} /> },
    { key: "travel", header: "Travel", sort: (r) => r.start ?? "9999", csv: (r) => fmtRange(r.start, r.end), hideBelow: "sm", cell: (r) => <span className="tnum whitespace-nowrap text-ink">{fmtRange(r.start, r.end)}</span> },
    { key: "status", header: "Status", sort: (r) => r.status, csv: (r) => r.status, hideBelow: "md", cell: (r) => <StatusChip status={`file.${r.status}`} /> },
    {
      key: "total",
      header: "Total",
      align: "right",
      sort: (r) => inTzs(r, r.totals.charges.amountMinor),
      csv: (r) => `${r.totals.currency} ${(r.totals.charges.amountMinor / 100).toFixed(2)}`,
      hideBelow: "xl",
      cell: (r) => <Amount value={r.totals.charges} />,
    },
    {
      key: "balance",
      header: "Balance",
      align: "right",
      sort: (r) => inTzs(r, r.totals.balance.amountMinor),
      csv: (r) => `${r.totals.currency} ${(r.totals.balance.amountMinor / 100).toFixed(2)}`,
      cell: (r) => (
        <span className="flex flex-col items-end gap-1">
          <Amount value={r.totals.balance} tone="balance" className={cn(r.totals.balance.amountMinor === 0 && "text-ink-4")} />
          {r.overdue ? <StatusChip status="pay.overdue" size="xs" /> : r.pay !== "none" && <StatusChip status={PAY_KEY[r.pay]} size="xs" />}
        </span>
      ),
    },
  ];

  const newBooking = can(me, "booking.create") && !client.archived;
  return (
    <Section
      title="Bookings"
      count={rows.length}
      actions={
        newBooking && (
          <Button variant="outline" size="sm" asChild>
            <Link href={`/book?client=${client.id}`}>
              <Plus /> New booking
            </Link>
          </Button>
        )
      }
    >
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        rowHref={(r) => `/bookings/${r.id}`}
        search={rows.length > 8 ? (r) => [r.number, r.title, r.route.join(" "), r.pnrs.join(" ")].join(" ") : undefined}
        searchPlaceholder="Search file no., route, PNR"
        exportName={rows.length ? `bookings-${client.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : undefined}
        initialSort={{ key: "number", dir: "desc" }}
        empty={
          <EmptyState
            icon={BookOpenCheck}
            title="No bookings for this client yet"
            action={
              newBooking && (
                <Button size="sm" asChild>
                  <Link href={`/book?client=${client.id}`}>
                    <Plus /> New booking for {client.name}
                  </Link>
                </Button>
              )
            }
          />
        }
      />
    </Section>
  );
}
