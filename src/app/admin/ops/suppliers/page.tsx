"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock, CheckCircle2, Megaphone } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, StatTile } from "@/components/chrome/console-shell";
import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { MoneyText } from "@/components/shared/money-text";
import { SlaCountdown } from "@/components/shared/hold-countdown";
import { StatusChip } from "@/components/shared/status-chip";
import { Checkbox } from "@/components/ui/checkbox";
import { useSession } from "@/hooks/use-session";
import { useStore } from "@/lib/store";
import { useIsPast } from "@/hooks/use-now";
import { bookingOps } from "@/lib/api";
import { formatDateShort } from "@/lib/format";
import { BookingRef, ConsoleLoading, GatedAction, Panel } from "@/features/admin/ops-ui";
import { awaitingSupplierItems } from "@/features/admin/ops-utils";
import type { BookingItem } from "@/lib/domain/types";

/** O05 · Supplier confirmation tracker. Everything a supplier still owes us, worst SLA first. */
export default function ConfirmationTrackerPage() {
  const data = useStore((s) => s);
  const session = useSession();
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const items = useMemo(() => awaitingSupplierItems(data), [data]);
  const isPast = useIsPast();
  const breached = items.filter((i) => isPast(i.slaDeadlineAt));
  const exposure = items.reduce((s, i) => s + i.sellPriceMinor, 0);

  if (!session.hydrated) return <ConsoleLoading />;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const allSelected = items.length > 0 && items.every((i) => selected.has(i.id));

  const chaseSelected = () => {
    const ids = items.filter((i) => selected.has(i.id)).map((i) => i.id);
    for (const id of ids) bookingOps.chaseSupplier(id);
    setSelected(new Set());
    toast.success(`Chased ${ids.length} supplier${ids.length === 1 ? "" : "s"}`, { description: "A reminder was sent on WhatsApp and email for each item." });
  };

  const columns: Column<BookingItem>[] = [
    {
      key: "sel",
      header: "",
      className: "w-px",
      render: (i) => (
        <span onClick={(e) => e.stopPropagation()}>
          <Checkbox checked={selected.has(i.id)} onCheckedChange={() => toggle(i.id)} aria-label={`Select ${i.productSnapshot.title}`} />
        </span>
      ),
    },
    {
      key: "sla",
      header: "SLA",
      render: (i) => (i.slaDeadlineAt ? <SlaCountdown deadlineAt={i.slaDeadlineAt} /> : <span className="text-xs text-muted-foreground">No timer started</span>),
    },
    {
      key: "supplier",
      header: "Supplier",
      render: (i) => {
        const org = data.organisations[i.supplierId];
        return (
          <div className="min-w-0">
            <p className="truncate text-sm">{org?.name ?? i.supplierId}</p>
            <p className="truncate text-xs text-muted-foreground">{org?.contactName ? `${org.contactName} · ${org.contactPhone ?? ""}` : "No reservations contact on file"}</p>
          </div>
        );
      },
    },
    {
      key: "item",
      header: "Item",
      render: (i) => {
        const booking = data.bookings[i.bookingId];
        return (
          <div className="min-w-0">
            <p className="truncate text-sm">{i.productSnapshot.title}</p>
            <p className="text-xs text-muted-foreground">{booking ? <BookingRef id={booking.id} reference={booking.reference} /> : null} · {i.productSnapshot.ratePlanName}</p>
          </div>
        );
      },
    },
    { key: "status", header: "Status", render: (i) => <StatusChip status={i.status} size="sm" /> },
    { key: "travel", header: "Travel", render: (i) => <span className="text-xs whitespace-nowrap">{formatDateShort(i.travelDateFrom)}</span> },
    { key: "value", header: "Value", numeric: true, render: (i) => <MoneyText minor={i.sellPriceMinor} size="sm" showCurrency={false} /> },
    {
      key: "act",
      header: "",
      className: "w-px",
      render: (i) => (
        <span className="flex gap-1.5" onClick={(e) => e.stopPropagation()}>
          <GatedAction
            permission="OPS:queue"
            size="xs"
            icon={Megaphone}
            onClick={() => {
              bookingOps.chaseSupplier(i.id);
              toast.success("Supplier chased", { description: i.productSnapshot.title });
            }}
          >
            Chase
          </GatedAction>
          <GatedAction
            permission="BOOKING:force_confirm"
            size="xs"
            icon={CheckCircle2}
            onClick={() => {
              bookingOps.forceConfirm(i.id, "Force confirmed from the confirmation tracker");
              toast.success("Force confirmed", { description: `${i.productSnapshot.title} · written to the audit log.` });
            }}
          >
            Force
          </GatedAction>
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Supplier confirmation tracker"
        code="O05"
        description="Every paid item still waiting on a supplier answer, sorted by how much SLA is left. Select rows to chase in bulk."
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatTile label="Awaiting supplier" value={items.length} hint="Paid, not yet confirmed" icon={CalendarClock} tone={items.length ? "warning" : "success"} />
        <StatTile label="Past SLA" value={breached.length} hint="Beyond the 2 hour promise" tone={breached.length ? "danger" : "success"} />
        <StatTile label="Customer money at risk" value={<MoneyText minor={exposure} size="lg" compact />} hint="Collected but not confirmed" />
      </div>

      <Panel className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={allSelected}
              onCheckedChange={() => setSelected(allSelected ? new Set() : new Set(items.map((i) => i.id)))}
              aria-label="Select every item awaiting confirmation"
            />
            Select all {items.length}
          </label>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{selected.size} selected</span>
            <GatedAction
              permission="OPS:queue"
              variant="default"
              icon={Megaphone}
              blockedReason={selected.size ? undefined : "Select at least one item to chase."}
              onClick={chaseSelected}
            >
              Chase selected
            </GatedAction>
          </div>
        </div>
      </Panel>

      <DataTable
        columns={columns}
        rows={items}
        rowKey={(i) => i.id}
        caption="Items awaiting supplier confirmation"
        onRowClick={(i) => router.push(`/admin/ops/bookings/${i.bookingId}`)}
        empty={
          <EmptyState
            icon={CheckCircle2}
            title="Every supplier has answered"
            description="Nothing is waiting on a confirmation. Simulate a new booking from the manual booking screen to see this tracker fill up."
          />
        }
      />
    </>
  );
}
