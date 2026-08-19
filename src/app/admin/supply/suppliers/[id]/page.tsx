"use client";

import { use, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Banknote, Building2, FileText, Save, Star } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, StatTile } from "@/components/chrome/console-shell";
import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { MoneyText } from "@/components/shared/money-text";
import { StatusChip, Pill } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSession } from "@/hooks/use-session";
import { useStore } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";
import { admin } from "@/lib/api";
import { formatDate, formatRange, relativeTime } from "@/lib/format";
import type { BookingItem, Payout, Product } from "@/lib/domain/types";

/** P03 · Supplier detail. Contract, commission, products, bookings, payouts, disputes. */
export default function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = use(params).id;
  const s = useSession();
  const org = useStore((st) => st.organisations[id]);
  const products = useStore(useShallow((st) => Object.values(st.products).filter((p) => p.supplierId === id)));
  const items = useStore(useShallow((st) => Object.values(st.items).filter((i) => i.supplierId === id)));
  const bookings = useStore((st) => st.bookings);
  const payouts = useStore(useShallow((st) => Object.values(st.payouts).filter((p) => p.supplierId === id)));
  const reviews = useStore(useShallow((st) => Object.values(st.reviews).filter((r) => r.supplierId === id)));
  const [commission, setCommission] = useState<number | null>(null);
  const [terms, setTerms] = useState<number | null>(null);

  if (!s.hydrated) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;
  if (!org) {
    return <EmptyState title="Supplier not found" action={<Button asChild><Link href="/admin/supply">Back to directory</Link></Button>} />;
  }

  const canEditTerms = s.can("COMMISSION:edit");
  const confirmed = items.filter((i) => ["confirmed", "used", "amended"].includes(i.status));
  const rejected = items.filter((i) => i.status === "supplier_rejected");
  const grossMinor = confirmed.reduce((sum, i) => sum + i.sellPriceMinor, 0);
  const payableMinor = confirmed.reduce((sum, i) => sum + i.netCostMinor, 0);

  const productCols: Column<Product>[] = [
    { key: "title", header: "Product", render: (p) => <span><span className="block font-medium">{p.title}</span><span className="block text-xs capitalize text-muted-foreground">{p.vertical} · entered by {p.enteredBy}</span></span> },
    { key: "status", header: "Status", render: (p) => <Pill tone={p.status === "live" ? "success" : p.status === "pending_review" ? "warning" : "neutral"}>{p.status.replace(/_/g, " ")}</Pill> },
    { key: "complete", header: "Completeness", numeric: true, render: (p) => <span>{p.completeness}/10</span> },
    { key: "price", header: "From", numeric: true, render: (p) => <MoneyText minor={p.priceFromMinor} currency={p.currency} size="sm" showCurrency={false} /> },
  ];

  const bookingCols: Column<BookingItem>[] = [
    { key: "ref", header: "Reference", render: (i) => <span className="font-mono text-xs">{bookings[i.bookingId]?.reference ?? "—"}</span> },
    { key: "product", header: "Product", render: (i) => <span className="text-sm">{i.productSnapshot.title}</span> },
    { key: "dates", header: "Travel", render: (i) => <span className="text-xs text-muted-foreground">{formatRange(i.travelDateFrom, i.travelDateTo)}</span> },
    { key: "status", header: "Status", render: (i) => <StatusChip status={i.status} size="sm" /> },
    { key: "net", header: "Net payable", numeric: true, render: (i) => <MoneyText minor={i.netCostMinor} currency="TZS" size="sm" showCurrency={false} /> },
  ];

  const payoutCols: Column<Payout>[] = [
    { key: "period", header: "Period", render: (p) => <span className="text-sm">{p.periodLabel}</span> },
    { key: "gross", header: "Gross", numeric: true, render: (p) => <MoneyText minor={p.grossMinor} currency={p.currency} size="sm" showCurrency={false} /> },
    { key: "net", header: "Net paid", numeric: true, render: (p) => <MoneyText minor={p.netMinor} currency={p.currency} size="sm" showCurrency={false} /> },
    { key: "status", header: "Status", render: (p) => <Pill tone={p.status === "executed" ? "success" : p.status === "approved" ? "brand" : "warning"}>{p.status.replace(/_/g, " ")}</Pill> },
    { key: "when", header: "Executed", render: (p) => <span className="text-xs text-muted-foreground">{p.executedAt ? formatDate(p.executedAt) : "—"}</span> },
  ];

  return (
    <>
      <Link href="/admin/supply" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-brand-text">
        <ArrowLeft className="size-4" aria-hidden /> Supplier directory
      </Link>

      <PageHeader
        title={org.name}
        code="P03"
        description={`${org.city}, ${org.countryCode} · onboarded ${formatDate(org.createdAt)} · ${org.contactName ?? "no contact"} · ${org.contactPhone ?? ""}`}
        actions={<Pill tone={org.status === "active" ? "success" : org.status === "pending" ? "warning" : "danger"}>{org.status}</Pill>}
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        <StatTile label="Products" value={products.length} hint={`${products.filter((p) => p.status === "live").length} live`} icon={Building2} />
        <StatTile label="Confirmed bookings" value={confirmed.length} hint={`${rejected.length} rejected`} tone={rejected.length > 2 ? "warning" : "default"} />
        <StatTile label="Gross booked" value={<MoneyText minor={grossMinor} currency="TZS" size="lg" compact />} />
        <StatTile label="Net payable to date" value={<MoneyText minor={payableMinor} currency="TZS" size="lg" compact />} icon={Banknote} />
      </div>

      <Tabs defaultValue="contract">
        <TabsList>
          <TabsTrigger value="contract">Contract</TabsTrigger>
          <TabsTrigger value="products">Products ({products.length})</TabsTrigger>
          <TabsTrigger value="bookings">Bookings ({items.length})</TabsTrigger>
          <TabsTrigger value="payouts">Payouts ({payouts.length})</TabsTrigger>
          <TabsTrigger value="disputes">Disputes ({rejected.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="contract" className="mt-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border bg-card p-4">
              <h2 className="flex items-center gap-1.5 font-medium"><FileText className="size-4" aria-hidden /> Commercial terms</h2>
              {!canEditTerms ? <p className="mt-1 text-xs text-muted-foreground">Read only — editing commission requires Supply Manager or Finance Manager.</p> : null}
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="comm">Commission %</Label>
                  <Input id="comm" type="number" disabled={!canEditTerms} value={commission ?? org.commissionPct ?? 15} onChange={(e) => setCommission(Number(e.target.value))} className="mt-1 tabular-nums" />
                </div>
                <div>
                  <Label htmlFor="terms">Payout terms (days)</Label>
                  <Input id="terms" type="number" disabled={!canEditTerms} value={terms ?? org.payoutTermsDays ?? 14} onChange={(e) => setTerms(Number(e.target.value))} className="mt-1 tabular-nums" />
                </div>
              </div>
              {canEditTerms ? (
                <Button
                  className="mt-3 gap-1.5"
                  disabled={commission === null && terms === null}
                  onClick={() => {
                    admin.updateOrganisation(org.id, { commissionPct: commission ?? org.commissionPct, payoutTermsDays: terms ?? org.payoutTermsDays });
                    toast.success("Contract terms updated", { description: "Existing bookings keep the commission snapshotted at booking time." });
                    setCommission(null); setTerms(null);
                  }}
                >
                  <Save className="size-4" aria-hidden /> Save terms
                </Button>
              ) : null}
              <p className="mt-3 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
                Commission is snapshotted onto each booking item at the moment of booking. Changing it here affects new bookings only —
                a contract change can never rewrite what was already agreed.
              </p>
            </section>

            <section className="rounded-xl border bg-card p-4">
              <h2 className="font-medium">Registration and payment</h2>
              <dl className="mt-3 grid gap-2 text-sm">
                <Row label="TIN" value={org.tin ?? "—"} mono />
                <Row label="Licence" value={org.licenceNo ?? "—"} mono />
                <Row label="Bank" value={org.bankName ?? "—"} />
                <Row label="Account" value={org.bankAccountMasked ?? "—"} mono />
                <Row label="Contact" value={`${org.contactName ?? "—"} · ${org.contactEmail ?? ""}`} />
              </dl>
              {org.performance ? (
                <div className="mt-3 grid grid-cols-2 gap-2 border-t pt-3 text-sm">
                  <div><p className="text-xs text-muted-foreground">Confirmation rate</p><p className="font-medium">{org.performance.confirmationRatePct}%</p></div>
                  <div><p className="text-xs text-muted-foreground">Avg confirm</p><p className="font-medium">{org.performance.avgConfirmMinutes} min</p></div>
                  <div><p className="text-xs text-muted-foreground">Rejection rate</p><p className="font-medium">{org.performance.rejectionRatePct}%</p></div>
                  <div><p className="text-xs text-muted-foreground">Guest score</p><p className="inline-flex items-center gap-1 font-medium"><Star className="size-3.5 fill-warning text-warning" aria-hidden />{org.performance.reviewScore}</p></div>
                </div>
              ) : null}
            </section>
          </div>
        </TabsContent>

        <TabsContent value="products" className="mt-4">
          <DataTable columns={productCols} rows={products} rowKey={(p) => p.id} caption="Products" empty={<EmptyState title="No products yet" description="Load one on their behalf from Content loading." />} />
        </TabsContent>

        <TabsContent value="bookings" className="mt-4">
          <DataTable columns={bookingCols} rows={items.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt))} rowKey={(i) => i.id} caption="Bookings" empty={<EmptyState title="No bookings yet" />} />
        </TabsContent>

        <TabsContent value="payouts" className="mt-4">
          <DataTable columns={payoutCols} rows={payouts} rowKey={(p) => p.id} caption="Payouts" empty={<EmptyState title="No payout runs yet" />} />
        </TabsContent>

        <TabsContent value="disputes" className="mt-4 space-y-3">
          {rejected.length === 0 ? (
            <EmptyState title="No rejections on record" description="A clean rejection history is the strongest signal of a reliable supplier." />
          ) : rejected.map((i) => (
            <div key={i.id} className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{i.productSnapshot.title}</span>
                <span className="font-mono text-xs text-muted-foreground">{bookings[i.bookingId]?.reference}</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{i.rejectionReason ?? "No reason recorded"}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {formatRange(i.travelDateFrom, i.travelDateTo)} · rejected {relativeTime(i.updatedAt)} · customer refunded automatically
              </p>
            </div>
          ))}
          {reviews.filter((r) => r.status === "flagged").length ? (
            <div className="rounded-xl border border-warning/40 bg-warning/5 p-4 text-sm">
              <p className="font-medium">{reviews.filter((r) => r.status === "flagged").length} flagged review(s) on this supplier</p>
              <p className="mt-0.5 text-muted-foreground">Moderate them from the content console before they publish.</p>
            </div>
          ) : null}
        </TabsContent>
      </Tabs>
    </>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4 border-b pb-1.5 last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono text-xs" : ""}>{value}</dd>
    </div>
  );
}
