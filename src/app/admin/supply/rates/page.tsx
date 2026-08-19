"use client";

import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Minus, Percent } from "lucide-react";
import { PageHeader, StatTile } from "@/components/chrome/console-shell";
import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { MoneyText } from "@/components/shared/money-text";
import { Pill } from "@/components/shared/status-chip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSession } from "@/hooks/use-session";
import { useStore } from "@/lib/store";
import type { Vertical } from "@/lib/domain/types";

interface Row { id: string; title: string; supplier: string; vertical: Vertical; ourMinor: number; marketMinor: number; deltaPct: number }

/** Deterministic pseudo-market reference from the product id — never Math.random, so the view is stable. */
function marketFactor(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return 0.85 + ((h % 300) / 1000); // 0.85 to 1.15
}

/** P06 · Rate competitiveness. Where we sit against the market, per product. */
export default function RateCompetitivenessPage() {
  const s = useSession();
  const products = useStore((st) => st.products);
  const organisations = useStore((st) => st.organisations);
  const [vertical, setVertical] = useState("all");

  const rows: Row[] = useMemo(
    () => Object.values(products)
      .filter((p) => p.status === "live" && p.priceFromMinor > 0)
      .map((p) => {
        const market = Math.round(p.priceFromMinor * marketFactor(p.id));
        return {
          id: p.id, title: p.title, supplier: organisations[p.supplierId]?.name ?? p.supplierId, vertical: p.vertical,
          ourMinor: p.priceFromMinor, marketMinor: market,
          deltaPct: market ? ((p.priceFromMinor - market) / market) * 100 : 0,
        };
      }),
    [products, organisations],
  );

  if (!s.hydrated) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;

  const shown = (vertical === "all" ? rows : rows.filter((r) => r.vertical === vertical)).sort((a, b) => b.deltaPct - a.deltaPct);
  const above = rows.filter((r) => r.deltaPct > 5);
  const below = rows.filter((r) => r.deltaPct < -5);

  const columns: Column<Row>[] = [
    { key: "title", header: "Product", render: (r) => <span><span className="block font-medium">{r.title}</span><span className="block text-xs text-muted-foreground">{r.supplier} · {r.vertical}</span></span> },
    { key: "our", header: "Our price", numeric: true, render: (r) => <MoneyText minor={r.ourMinor} currency="TZS" size="sm" showCurrency={false} /> },
    { key: "market", header: "Market reference", numeric: true, render: (r) => <MoneyText minor={r.marketMinor} currency="TZS" size="sm" showCurrency={false} className="text-muted-foreground" /> },
    {
      key: "delta", header: "Difference", numeric: true,
      render: (r) => Math.abs(r.deltaPct) < 2
        ? <Pill tone="neutral" icon={Minus}>At market</Pill>
        : r.deltaPct > 0
          ? <Pill tone="warning" icon={ArrowUpRight}>{r.deltaPct.toFixed(1)}% above</Pill>
          : <Pill tone="success" icon={ArrowDownRight}>{Math.abs(r.deltaPct).toFixed(1)}% below</Pill>,
    },
  ];

  return (
    <>
      <PageHeader title="Rate competitiveness" code="P06" description="Where our all-in price sits against the market reference. Being above market on a hero product is a conversion problem, not a margin win." />

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <StatTile label="Products compared" value={rows.length} icon={Percent} />
        <StatTile label="Above market" value={above.length} tone={above.length ? "warning" : "default"} hint="More than 5% higher" icon={ArrowUpRight} />
        <StatTile label="Below market" value={below.length} tone="success" hint="More than 5% lower" icon={ArrowDownRight} />
        <StatTile label="At market" value={rows.length - above.length - below.length} />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label htmlFor="rc-vert" className="text-sm text-muted-foreground">Vertical</label>
        <Select value={vertical} onValueChange={setVertical}>
          <SelectTrigger id="rc-vert" className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All verticals</SelectItem>
            <SelectItem value="stay">Stays</SelectItem>
            <SelectItem value="tour">Tours</SelectItem>
            <SelectItem value="transfer">Transfers</SelectItem>
            <SelectItem value="flight">Flights</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable columns={columns} rows={shown} rowKey={(r) => r.id} caption="Rate competitiveness" empty={<EmptyState title="Nothing to compare" />} />

      <p className="mt-3 rounded-xl border bg-card p-4 text-xs text-muted-foreground">
        The market reference here is a deterministic stand-in derived from the product id. In production it comes from a rate-shopping
        feed, and the same view drives the conversation with the supplier about their net rate.
      </p>
    </>
  );
}
