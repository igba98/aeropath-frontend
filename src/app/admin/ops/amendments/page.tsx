"use client";

import { useMemo, useState } from "react";
import { CheckCircle2, GitBranch, XCircle } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, StatTile } from "@/components/chrome/console-shell";
import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { MoneyText } from "@/components/shared/money-text";
import { Pill } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/hooks/use-session";
import { useStore } from "@/lib/store";
import { bookingOps } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { BookingRef, ConsoleLoading, FilterChips, GatedAction, Panel } from "@/features/admin/ops-ui";
import type { AmendmentRequest } from "@/lib/domain/types";

type Filter = "requested" | "approved" | "declined" | "all";
type Pending = { amendment: AmendmentRequest; approve: boolean } | null;

const KIND_LABELS: Record<AmendmentRequest["kind"], string> = {
  date_change: "Date change",
  pax_change: "Passenger change",
  room_change: "Room change",
};

/** O06 · Amendment queue. Every change request with the fare difference already priced. */
export default function AmendmentQueuePage() {
  const data = useStore((s) => s);
  const session = useSession();
  const [filter, setFilter] = useState<Filter>("requested");
  const [pending, setPending] = useState<Pending>(null);
  const [note, setNote] = useState("");

  const all = useMemo(
    () => Object.values(data.amendments).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [data.amendments],
  );
  const rows = filter === "all" ? all : all.filter((a) => a.status === filter);

  if (!session.hydrated) return <ConsoleLoading />;

  const outstanding = all.filter((a) => a.status === "requested");
  const netDifference = outstanding.reduce((s, a) => s + a.fareDifferenceMinor, 0);

  const columns: Column<AmendmentRequest>[] = [
    {
      key: "booking",
      header: "Booking",
      render: (a) => (
        <div className="min-w-0">
          <BookingRef id={a.bookingId} reference={a.bookingReference} />
          <p className="text-[11px] text-muted-foreground">{formatDateTime(a.createdAt)}</p>
        </div>
      ),
    },
    {
      key: "item",
      header: "Item",
      render: (a) => {
        const item = data.items[a.itemId];
        return (
          <div className="min-w-0">
            <p className="truncate text-sm">{item?.productSnapshot.title ?? "Item removed"}</p>
            <p className="truncate text-xs text-muted-foreground">{item?.productSnapshot.ratePlanName}</p>
          </div>
        );
      },
    },
    { key: "kind", header: "Change", render: (a) => <Pill tone="info">{KIND_LABELS[a.kind]}</Pill> },
    { key: "detail", header: "Detail", render: (a) => <span className="text-sm">{a.detail}</span> },
    { key: "by", header: "Requested by", render: (a) => <span className="text-xs text-muted-foreground">{a.requestedByName}</span> },
    {
      key: "fare",
      header: "Fare difference",
      numeric: true,
      render: (a) => (
        <span className={a.fareDifferenceMinor > 0 ? "text-warning-foreground" : a.fareDifferenceMinor < 0 ? "text-success-foreground" : undefined}>
          <MoneyText minor={a.fareDifferenceMinor} currency={a.currency} size="sm" showCurrency={false} />
        </span>
      ),
    },
    {
      key: "new",
      header: "New item total",
      numeric: true,
      render: (a) => {
        const item = data.items[a.itemId];
        if (!item) return <span className="text-xs text-muted-foreground">—</span>;
        return <MoneyText minor={item.sellPriceMinor + (a.status === "requested" ? a.fareDifferenceMinor : 0)} size="sm" showCurrency={false} />;
      },
    },
    {
      key: "act",
      header: "",
      className: "w-px",
      render: (a) =>
        a.status === "requested" ? (
          <span className="flex gap-1.5">
            <GatedAction permission="BOOKING:amend" size="xs" icon={CheckCircle2} onClick={() => { setPending({ amendment: a, approve: true }); setNote(""); }}>Approve</GatedAction>
            <GatedAction permission="BOOKING:amend" size="xs" icon={XCircle} onClick={() => { setPending({ amendment: a, approve: false }); setNote(""); }}>Decline</GatedAction>
          </span>
        ) : (
          <Pill tone={a.status === "approved" ? "success" : "neutral"}>{a.status}</Pill>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Amendment queue"
        code="O06"
        description="Date, passenger and room changes with the fare difference already computed against the item as sold. Approving re-prices the item and re-confirms it with the supplier."
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatTile label="Waiting on a decision" value={outstanding.length} icon={GitBranch} tone={outstanding.length ? "warning" : "success"} />
        <StatTile label="Net fare difference" value={<MoneyText minor={netDifference} size="lg" showCurrency={false} />} hint="If every open request is approved" />
        <StatTile label="Decided this seed" value={all.length - outstanding.length} hint="Approved or declined" />
      </div>

      <Panel className="mb-4">
        <FilterChips
          ariaLabel="Filter amendments"
          value={filter}
          onChange={setFilter}
          options={[
            { id: "requested", label: "Requested", count: all.filter((a) => a.status === "requested").length },
            { id: "approved", label: "Approved", count: all.filter((a) => a.status === "approved").length },
            { id: "declined", label: "Declined", count: all.filter((a) => a.status === "declined").length },
            { id: "all", label: "All", count: all.length },
          ]}
        />
      </Panel>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(a) => a.id}
        caption="Amendment requests"
        empty={
          <EmptyState
            icon={GitBranch}
            title="No amendment requests"
            description="Customers and agents raise these from their trip screens; support can also raise one from a booking detail."
          />
        }
      />

      <Dialog open={pending !== null} onOpenChange={(o) => { if (!o) setPending(null); }}>
        <DialogContent>
          {pending ? (
            <>
              <DialogHeader>
                <DialogTitle>{pending.approve ? "Approve" : "Decline"} · {KIND_LABELS[pending.amendment.kind]}</DialogTitle>
                <DialogDescription>
                  {pending.amendment.bookingReference} · {pending.amendment.detail}
                  {pending.approve
                    ? " · The item is re-priced by the fare difference and re-confirmed with the supplier."
                    : " · The original booking stands and the customer is told why."}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="amend-note">Note {pending.approve ? "(optional)" : "for the customer"}</Label>
                <Textarea id="amend-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={pending.approve ? "Lodge confirmed the extra night at the same rate." : "The lodge is fully booked on the new dates."} />
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setPending(null)}>Back</Button>
                <Button
                  variant={pending.approve ? "default" : "destructive"}
                  disabled={!pending.approve && !note.trim()}
                  onClick={() => {
                    bookingOps.decideAmendment(pending.amendment.id, pending.approve, note.trim() || undefined);
                    toast[pending.approve ? "success" : "info"](
                      pending.approve ? "Amendment approved" : "Amendment declined",
                      { description: pending.approve ? "Item re-priced and re-confirmed with the supplier." : "The customer keeps the original booking." },
                    );
                    setPending(null);
                    setNote("");
                  }}
                >
                  {pending.approve ? "Approve amendment" : "Decline amendment"}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
