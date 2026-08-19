"use client";

import { useMemo } from "react";
import { BadgeDollarSign, Download, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, StatTile } from "@/components/chrome/console-shell";
import { BarChart, type BarRow } from "@/features/partner/bar-chart";
import { MoneyText } from "@/components/shared/money-text";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";
import { useStore } from "@/lib/store";
import { toCsv } from "@/features/partner/csv";

/** F08 · Revenue reports by vertical, supplier, channel, region and buyer type. */
export default function RevenuePage() {
  const s = useSession();
  const bookings = useStore((st) => st.bookings);
  const items = useStore((st) => st.items);
  const organisations = useStore((st) => st.organisations);

  const data = useMemo(() => {
    const paid = Object.values(bookings).filter((b) => b.paymentStatus === "succeeded");
    const paidIds = new Set(paid.map((b) => b.id));
    const live = Object.values(items).filter((i) => paidIds.has(i.bookingId) && !["expired", "payment_failed", "supplier_rejected", "refunded"].includes(i.status));

    const group = <T extends string>(rows: typeof live, key: (i: (typeof live)[number]) => T) => {
      const acc: Record<string, { gross: number; net: number; count: number }> = {};
      for (const i of rows) {
        const k = key(i);
        acc[k] ??= { gross: 0, net: 0, count: 0 };
        acc[k].gross += i.sellPriceMinor;
        acc[k].net += i.commissionMinor + i.markupMinor;
        acc[k].count += 1;
      }
      return acc;
    };

    const toRows = (acc: Record<string, { gross: number; net: number; count: number }>, useNet = false): BarRow[] =>
      Object.entries(acc).map(([label, v]) => ({ label, value: useNet ? v.net : v.gross, hint: `${v.count} item${v.count === 1 ? "" : "s"}` })).sort((a, b) => b.value - a.value);

    const grossMinor = live.reduce((s2, i) => s2 + i.sellPriceMinor, 0);
    const netRevenueMinor = live.reduce((s2, i) => s2 + i.commissionMinor + i.markupMinor, 0);

    return {
      grossMinor,
      netRevenueMinor,
      takeRate: grossMinor ? (netRevenueMinor / grossMinor) * 100 : 0,
      bookingCount: paid.length,
      byVertical: toRows(group(live, (i) => i.vertical)),
      bySupplier: toRows(group(live, (i) => organisations[i.supplierId]?.name ?? i.supplierId)).slice(0, 8),
      byRegion: toRows(group(live, (i) => i.productSnapshot.region)),
      byChannel: toRows(
        Object.entries(paid.reduce<Record<string, { gross: number; net: number; count: number }>>((acc, b) => {
          acc[b.createdVia] ??= { gross: 0, net: 0, count: 0 };
          acc[b.createdVia].gross += b.totalMinor;
          acc[b.createdVia].count += 1;
          return acc;
        }, {})).reduce<Record<string, { gross: number; net: number; count: number }>>((a, [k, v]) => ({ ...a, [k]: v }), {}),
      ),
      byBuyer: toRows(
        paid.reduce<Record<string, { gross: number; net: number; count: number }>>((acc, b) => {
          acc[b.buyerType] ??= { gross: 0, net: 0, count: 0 };
          acc[b.buyerType].gross += b.totalMinor;
          acc[b.buyerType].count += 1;
          return acc;
        }, {}),
      ),
    };
  }, [bookings, items, organisations]);

  if (!s.hydrated) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;

  function exportCsv() {
    const csv = toCsv(["dimension", "label", "gross_minor"], [
      ...data.byVertical.map((r) => ["vertical", r.label, r.value] as Array<string | number>),
      ...data.bySupplier.map((r) => ["supplier", r.label, r.value] as Array<string | number>),
      ...data.byRegion.map((r) => ["region", r.label, r.value] as Array<string | number>),
    ]);
    toast.success("Revenue report exported", { description: `${csv.split("\n").length - 1} rows.` });
  }

  return (
    <>
      <PageHeader
        title="Revenue reports"
        code="F08"
        description="Gross bookings versus what we actually keep. Take rate is the number that matters."
        actions={<Button variant="outline" className="gap-1.5" onClick={exportCsv}><Download className="size-4" aria-hidden /> Export CSV</Button>}
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        <StatTile label="Gross bookings" value={<MoneyText minor={data.grossMinor} currency="TZS" size="lg" compact />} icon={BadgeDollarSign} />
        <StatTile label="Net revenue" value={<MoneyText minor={data.netRevenueMinor} currency="TZS" size="lg" compact />} hint="Commission plus markup" tone="success" />
        <StatTile label="Take rate" value={`${data.takeRate.toFixed(1)}%`} hint="Net revenue over gross" icon={TrendingUp} />
        <StatTile label="Paid bookings" value={data.bookingCount} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <BarChart title="Gross by vertical" rows={data.byVertical} />
        <BarChart title="Gross by supplier (top 8)" rows={data.bySupplier} />
        <BarChart title="Gross by region" rows={data.byRegion} />
        <BarChart title="Gross by channel" rows={data.byChannel} />
        <BarChart title="Gross by buyer type" rows={data.byBuyer} className="lg:col-span-2" />
      </div>
    </>
  );
}
