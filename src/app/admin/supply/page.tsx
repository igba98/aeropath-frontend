"use client";

import { useState } from "react";
import Link from "next/link";
import { Building2, Search, Store, TrendingUp } from "lucide-react";
import { PageHeader, StatTile } from "@/components/chrome/console-shell";
import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { Pill } from "@/components/shared/status-chip";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSession } from "@/hooks/use-session";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { Organisation } from "@/lib/domain/types";

/** P01 · Supplier directory. */
export default function SupplyDirectoryPage() {
  const s = useSession();
  const organisations = useStore((st) => st.organisations);
  const products = useStore((st) => st.products);
  const items = useStore((st) => st.items);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");

  if (!s.hydrated) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;

  const suppliers = Object.values(organisations).filter((o) => o.type === "supplier");
  const rows = suppliers.filter((o) => {
    if (status !== "all" && o.status !== status) return false;
    if (!q) return true;
    return `${o.name} ${o.city} ${o.contactName ?? ""}`.toLowerCase().includes(q.toLowerCase());
  });

  const productCount = (id: string) => Object.values(products).filter((p) => p.supplierId === id).length;
  const bookingCount = (id: string) => Object.values(items).filter((i) => i.supplierId === id).length;
  const score = (o: Organisation) => o.performance ? Math.round((o.performance.confirmationRatePct + o.performance.reviewScore * 20 - o.performance.rejectionRatePct * 2) / 2) : null;

  const columns: Column<Organisation>[] = [
    {
      key: "name", header: "Supplier",
      render: (o) => (
        <Link href={`/admin/supply/suppliers/${o.id}`} className="group">
          <span className="block font-medium group-hover:text-brand-text">{o.name}</span>
          <span className="block text-xs text-muted-foreground">{o.city} · {o.contactName ?? "no contact"}</span>
        </Link>
      ),
    },
    {
      key: "status", header: "Status",
      render: (o) => o.status === "active" ? <Pill tone="success">Active</Pill> : o.status === "pending" ? <Pill tone="warning">Pending onboarding</Pill> : <Pill tone="danger">Suspended</Pill>,
    },
    { key: "products", header: "Products", numeric: true, render: (o) => <span>{productCount(o.id)}</span> },
    { key: "bookings", header: "Bookings", numeric: true, render: (o) => <span>{bookingCount(o.id)}</span> },
    { key: "commission", header: "Commission", numeric: true, render: (o) => <span>{o.commissionPct ?? "—"}%</span> },
    {
      key: "score", header: "Performance", numeric: true,
      render: (o) => {
        const v = score(o);
        if (v == null) return <span className="text-xs text-muted-foreground">no data</span>;
        return <span className={cn("font-semibold tabular-nums", v >= 90 ? "text-success-foreground" : v >= 75 ? "text-warning-foreground" : "text-destructive")}>{v}</span>;
      },
    },
  ];

  return (
    <>
      <PageHeader title="Supplier directory" code="P01" description="Every supplier on the platform, self-served or staff-loaded, with the numbers that decide whether they stay." />

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <StatTile label="Suppliers" value={suppliers.length} icon={Store} />
        <StatTile label="Active" value={suppliers.filter((o) => o.status === "active").length} tone="success" />
        <StatTile label="Pending onboarding" value={suppliers.filter((o) => o.status === "pending").length} tone={suppliers.some((o) => o.status === "pending") ? "warning" : "default"} icon={Building2} />
        <StatTile label="Products live" value={Object.values(products).filter((p) => p.status === "live").length} icon={TrendingUp} />
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search supplier, city or contact" className="pl-8" aria-label="Search suppliers" />
        </div>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="suspended">Suspended</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable columns={columns} rows={rows} rowKey={(o) => o.id} caption="Suppliers" empty={<EmptyState title="No suppliers match" />} />
    </>
  );
}
