"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ListChecks, Megaphone, Search } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/chrome/console-shell";
import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { MoneyText } from "@/components/shared/money-text";
import { SlaCountdown, HoldCountdown } from "@/components/shared/hold-countdown";
import { StatusChip, Pill } from "@/components/shared/status-chip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useStore } from "@/lib/store";
import { bookingOps } from "@/lib/api";
import { formatDateShort, relativeTime } from "@/lib/format";
import { ConsoleLoading, FilterChips, GatedAction, Panel } from "@/features/admin/ops-ui";
import { QUEUE_BUCKETS, queueRows, type QueueBucket, type QueueRow } from "@/features/admin/ops-utils";
import { useSession } from "@/hooks/use-session";

type Filter = QueueBucket | "all";

/** O02 · Booking queue. One worklist, filtered by what is wrong, ordered by what goes late first. */
export default function BookingQueuePage() {
  const data = useStore((s) => s);
  const { hydrated } = useSession();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");

  const rows = useMemo(() => queueRows(data), [data]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== "all" && !r.buckets.includes(filter)) return false;
      if (!needle) return true;
      const lead = r.booking.leadTraveller;
      const hay = `${r.booking.reference} ${r.item.productSnapshot.title} ${r.item.productSnapshot.city} ${lead ? lead.firstName + " " + lead.lastName : ""} ${lead?.phone ?? ""} ${lead?.email ?? ""}`.toLowerCase();
      return hay.includes(needle);
    });
  }, [rows, filter, q]);

  if (!hydrated) return <ConsoleLoading />;

  const options: Array<{ id: Filter; label: string; count: number }> = [
    { id: "all", label: "Everything", count: rows.length },
    ...QUEUE_BUCKETS.map((b) => ({ id: b.id as Filter, label: b.label, count: rows.filter((r) => r.buckets.includes(b.id)).length })),
  ];

  const columns: Column<QueueRow>[] = [
    {
      key: "ref",
      header: "Booking",
      render: (r) => (
        <div className="min-w-0">
          <span className="font-mono text-xs font-medium text-brand-text">{r.booking.reference}</span>
          <p className="truncate text-xs text-muted-foreground">
            {r.booking.leadTraveller ? `${r.booking.leadTraveller.firstName} ${r.booking.leadTraveller.lastName}` : "No lead traveller"}
          </p>
        </div>
      ),
    },
    {
      key: "item",
      header: "Item",
      render: (r) => (
        <div className="min-w-0">
          <p className="truncate text-sm">{r.item.productSnapshot.title}</p>
          <p className="text-xs text-muted-foreground">{r.item.productSnapshot.ratePlanName} · {r.item.productSnapshot.city}</p>
        </div>
      ),
    },
    { key: "status", header: "Status", render: (r) => <StatusChip status={r.item.status} size="sm" /> },
    {
      key: "why",
      header: "Also",
      render: (r) => {
        // Drop any bucket that just repeats the status chip next to it.
        const extra = r.buckets.filter((b) => b !== r.item.status);
        if (!extra.length) return <span className="text-muted-foreground">—</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {extra.map((b) => (
              <Pill key={b} tone={b === "supplier_rejected" || b === "payment_failed" ? "danger" : b === "partial" ? "warning" : "neutral"} className="text-xs">
                {QUEUE_BUCKETS.find((x) => x.id === b)?.label ?? b}
              </Pill>
            ))}
          </div>
        );
      },
    },
    {
      key: "due",
      header: "Goes late",
      render: (r) =>
        r.item.slaDeadlineAt ? <SlaCountdown deadlineAt={r.item.slaDeadlineAt} />
          : r.item.holdExpiresAt ? <HoldCountdown expiresAt={r.item.holdExpiresAt} label="Hold" />
            : <span className="text-xs text-muted-foreground">{relativeTime(new Date(r.dueAt).toISOString())}</span>,
    },
    { key: "travel", header: "Travel", render: (r) => <span className="text-xs whitespace-nowrap">{formatDateShort(r.item.travelDateFrom)}</span> },
    { key: "value", header: "Value", numeric: true, render: (r) => <MoneyText minor={r.item.sellPriceMinor} size="sm" showCurrency={false} /> },
    {
      key: "act",
      header: "",
      className: "w-px",
      render: (r) => (
        <div onClick={(e) => e.stopPropagation()}>
          <GatedAction
            permission="OPS:queue"
            icon={Megaphone}
            size="xs"
            blockedReason={r.item.status === "awaiting_supplier" || r.item.status === "paid" ? undefined : "Only an item still waiting on the supplier can be chased."}
            onClick={() => {
              bookingOps.chaseSupplier(r.item.id);
              toast.success("Supplier chased", { description: `${r.item.productSnapshot.title} · WhatsApp and email reminder sent.` });
            }}
          >
            Chase
          </GatedAction>
        </div>
      ),
    },
  ];

  const active = QUEUE_BUCKETS.find((b) => b.id === filter);

  return (
    <>
      <PageHeader
        title="Booking queue"
        code="O02"
        description="Every item that needs a human. Sorted by urgency: SLA deadline first, then hold expiry, then travel date."
      />

      <Panel className="mb-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <FilterChips options={options} value={filter} onChange={setFilter} ariaLabel="Filter the queue" />
          <div className="w-full max-w-xs">
            <Label htmlFor="queue-search" className="sr-only">Search the queue</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input id="queue-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Reference, guest, product, phone" className="pl-8" />
            </div>
          </div>
        </div>
        {active ? <p className="mt-3 text-xs text-muted-foreground">{active.description}</p> : null}
      </Panel>

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(r) => r.item.id}
        caption="Operations booking queue"
        onRowClick={(r) => router.push(`/admin/ops/bookings/${r.booking.id}`)}
        empty={
          <EmptyState
            icon={ListChecks}
            title={filter === "all" ? "Nothing in the queue" : `No ${active?.label.toLowerCase()} items`}
            description={filter === "all" ? "Every paid item is confirmed and no payment is stuck. Create a manual booking or reject one from a booking detail screen to see this queue fill up." : active?.description}
          />
        }
      />
    </>
  );
}
