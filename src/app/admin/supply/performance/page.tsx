"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Gauge, Star, Timer } from "lucide-react";
import { PageHeader, StatTile } from "@/components/chrome/console-shell";
import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { Pill } from "@/components/shared/status-chip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSession } from "@/hooks/use-session";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

interface Row {
  id: string; name: string;
  confirmationRatePct: number; avgConfirmMinutes: number; rejectionRatePct: number; reviewScore: number; cancellationRatePct: number;
  liveConfirmed: number; liveRejected: number; needsAttention: boolean;
}

/** P07 · Supplier performance, from the contract record and cross-checked against live bookings. */
export default function SupplierPerformancePage() {
  const s = useSession();
  const organisations = useStore((st) => st.organisations);
  const items = useStore((st) => st.items);
  const [sort, setSort] = useState("attention");

  const rows: Row[] = useMemo(() => {
    return Object.values(organisations)
      .filter((o) => o.type === "supplier" && o.performance)
      .map((o) => {
        const mine = Object.values(items).filter((i) => i.supplierId === o.id);
        const confirmed = mine.filter((i) => ["confirmed", "used", "amended"].includes(i.status)).length;
        const rejected = mine.filter((i) => i.status === "supplier_rejected").length;
        const p = o.performance!;
        const needsAttention = p.confirmationRatePct < 95 || p.rejectionRatePct > 3 || p.avgConfirmMinutes > 90 || p.reviewScore < 4.3;
        return { id: o.id, name: o.name, ...p, liveConfirmed: confirmed, liveRejected: rejected, needsAttention };
      });
  }, [organisations, items]);

  if (!s.hydrated) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;

  const sorted = [...rows].sort((a, b) => {
    if (sort === "attention") return Number(b.needsAttention) - Number(a.needsAttention) || a.confirmationRatePct - b.confirmationRatePct;
    if (sort === "confirmation") return b.confirmationRatePct - a.confirmationRatePct;
    if (sort === "speed") return a.avgConfirmMinutes - b.avgConfirmMinutes;
    if (sort === "rejection") return b.rejectionRatePct - a.rejectionRatePct;
    return b.reviewScore - a.reviewScore;
  });

  const attention = rows.filter((r) => r.needsAttention);
  const avgConfirm = rows.length ? Math.round(rows.reduce((s2, r) => s2 + r.avgConfirmMinutes, 0) / rows.length) : 0;

  const columns: Column<Row>[] = [
    {
      key: "name", header: "Supplier",
      render: (r) => (
        <Link href={`/admin/supply/suppliers/${r.id}`} className="group">
          <span className="block font-medium group-hover:text-brand-text">{r.name}</span>
          {r.needsAttention ? <Pill tone="warning" icon={AlertTriangle}>Needs attention</Pill> : null}
        </Link>
      ),
    },
    {
      key: "conf", header: "Confirmation rate", numeric: true,
      render: (r) => <span className={cn("font-semibold", r.confirmationRatePct >= 95 ? "text-success-foreground" : "text-warning-foreground")}>{r.confirmationRatePct}%</span>,
    },
    {
      key: "speed", header: "Avg confirm", numeric: true,
      render: (r) => <span className={cn(r.avgConfirmMinutes > 90 ? "text-destructive" : r.avgConfirmMinutes > 45 ? "text-warning-foreground" : "")}>{r.avgConfirmMinutes < 60 ? `${r.avgConfirmMinutes}m` : `${(r.avgConfirmMinutes / 60).toFixed(1)}h`}</span>,
    },
    { key: "rej", header: "Rejection rate", numeric: true, render: (r) => <span className={cn(r.rejectionRatePct > 3 ? "text-destructive" : "")}>{r.rejectionRatePct}%</span> },
    { key: "canc", header: "Cancellation rate", numeric: true, render: (r) => <span>{r.cancellationRatePct}%</span> },
    {
      key: "score", header: "Guest score", numeric: true,
      render: (r) => <span className="inline-flex items-center gap-1"><Star className="size-3.5 fill-warning text-warning" aria-hidden />{r.reviewScore.toFixed(1)}</span>,
    },
    { key: "live", header: "Live confirmed / rejected", numeric: true, render: (r) => <span className="text-xs text-muted-foreground">{r.liveConfirmed} / {r.liveRejected}</span> },
  ];

  return (
    <>
      <PageHeader title="Supplier performance" code="P07" description="Confirmation speed is the number a customer actually feels. A supplier above two hours is costing us bookings." />

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <StatTile label="Suppliers measured" value={rows.length} icon={Gauge} />
        <StatTile label="Needs attention" value={attention.length} tone={attention.length ? "warning" : "default"} icon={AlertTriangle} />
        <StatTile label="Average confirm time" value={`${avgConfirm} min`} hint="Alert threshold is 45 minutes at p50" icon={Timer} />
        <StatTile label="Above 5% rejection" value={rows.filter((r) => r.rejectionRatePct > 5).length} tone={rows.some((r) => r.rejectionRatePct > 5) ? "danger" : "default"} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label htmlFor="perf-sort" className="text-sm text-muted-foreground">Sort by</label>
        <Select value={sort} onValueChange={setSort}>
          <SelectTrigger id="perf-sort" className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="attention">Needs attention first</SelectItem>
            <SelectItem value="confirmation">Confirmation rate</SelectItem>
            <SelectItem value="speed">Confirmation speed</SelectItem>
            <SelectItem value="rejection">Rejection rate</SelectItem>
            <SelectItem value="score">Guest score</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable columns={columns} rows={sorted} rowKey={(r) => r.id} caption="Supplier performance" empty={<EmptyState title="No performance data yet" />} />
    </>
  );
}
