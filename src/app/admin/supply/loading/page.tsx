"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Plus, Save, Upload, Users } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, StatTile } from "@/components/chrome/console-shell";
import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { Pill } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSession } from "@/hooks/use-session";
import { useStore } from "@/lib/store";
import { catalog } from "@/lib/api";
import { cancellationPolicies } from "@/lib/fixtures/policies";
import { relativeTime } from "@/lib/format";
import type { Product, Vertical } from "@/lib/domain/types";

/**
 * P05 · Content loading.
 * The second half of the dual supply model: many operators will not self serve, so staff load
 * inventory on their behalf with an `enteredBy` attribution we can measure over time.
 */
export default function ContentLoadingPage() {
  const s = useSession();
  const router = useRouter();
  const organisations = useStore((st) => st.organisations);
  const products = useStore((st) => st.products);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [form, setForm] = useState({
    supplierId: "", vertical: "stay" as Vertical, title: "", description: "", city: "", region: "",
    amenities: "", cancellationPolicyId: "cp_moderate", baseMinor: 250000, ratePlanName: "Standard rate",
  });

  if (!s.hydrated) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;
  const canLoad = s.can("PRODUCT:load");

  const suppliers = Object.values(organisations).filter((o) => o.type === "supplier" && o.status === "active");
  const all = Object.values(products);
  const staffLoaded = all.filter((p) => p.enteredBy === "backoffice");
  const selfServed = all.filter((p) => p.enteredBy === "supplier");
  const draft = draftId ? products[draftId] : undefined;

  function create() {
    if (!form.supplierId) return toast.error("Choose the supplier this product belongs to");
    if (!form.title.trim()) return toast.error("Give the product a title");
    const id = catalog.createProduct({
      supplierId: form.supplierId,
      vertical: form.vertical,
      title: form.title.trim(),
      description: form.description.trim(),
      location: { lat: -3.37, lng: 36.68, countryCode: "TZ", region: form.region.trim() || "Arusha", city: form.city.trim() || "Arusha" },
      amenities: form.amenities.split(",").map((a) => a.trim()).filter(Boolean),
      cancellationPolicyId: form.cancellationPolicyId,
      attributes: form.vertical === "stay" ? { propertyType: "Lodge", checkIn: "14:00", checkOut: "10:00" } : {},
    }, "backoffice");
    catalog.upsertRatePlan({
      productId: id, name: form.ratePlanName, currency: "TZS", baseMinor: form.baseMinor,
      basis: form.vertical === "stay" ? "per_unit_night" : form.vertical === "transfer" ? "per_vehicle" : "per_person",
      inclusions: [], cancellationPolicyId: form.cancellationPolicyId,
      commissionPct: organisations[form.supplierId]?.commissionPct ?? 15, refundable: true,
    });
    setDraftId(id);
    toast.success("Product created", { description: "Loaded on the supplier's behalf and attributed to back office." });
  }

  const columns: Column<Product>[] = [
    { key: "title", header: "Product", render: (p) => <span><span className="block font-medium">{p.title}</span><span className="block text-xs text-muted-foreground">{organisations[p.supplierId]?.name}</span></span> },
    { key: "vertical", header: "Vertical", render: (p) => <span className="text-sm capitalize">{p.vertical}</span> },
    { key: "status", header: "Status", render: (p) => <Pill tone={p.status === "live" ? "success" : p.status === "pending_review" ? "warning" : "neutral"}>{p.status.replace(/_/g, " ")}</Pill> },
    { key: "complete", header: "Completeness", numeric: true, render: (p) => <span>{p.completeness}/10</span> },
    { key: "updated", header: "Updated", render: (p) => <span className="text-xs text-muted-foreground">{relativeTime(p.updatedAt)}</span> },
    {
      key: "actions", header: "", className: "text-right",
      render: (p) => p.status === "draft" || p.status === "changes_requested"
        ? <Button size="sm" variant="ghost" onClick={() => { catalog.submitForReview(p.id); toast.success("Submitted for review", { description: "It now sits in the product approval queue." }); }}>Submit</Button>
        : <Button size="sm" variant="ghost" onClick={() => router.push("/admin/supply/products")}>Review</Button>,
    },
  ];

  return (
    <>
      <PageHeader title="Content loading" code="P05" description="Load and manage inventory for suppliers who will not self serve — the same product shape, attributed to back office." />

      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        <StatTile label="Catalogue" value={all.length} icon={FileText} />
        <StatTile label="Self-served" value={selfServed.length} tone="success" hint={`${all.length ? Math.round((selfServed.length / all.length) * 100) : 0}% of the catalogue`} icon={Users} />
        <StatTile label="Staff loaded" value={staffLoaded.length} icon={Upload} />
        <StatTile label="Suppliers available" value={suppliers.length} />
      </div>

      {!canLoad ? (
        <div className="mb-4 rounded-xl border border-warning/40 bg-warning/5 p-4 text-sm">
          <p className="font-medium">Read only</p>
          <p className="mt-0.5 text-muted-foreground">Signed in as {s.roleLabel}. Loading products on a supplier&rsquo;s behalf requires Supply Manager or Platform Admin.</p>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
        <section className="rounded-xl border bg-card p-4">
          <h2 className="flex items-center gap-1.5 font-medium"><Plus className="size-4" aria-hidden /> New product on behalf of a supplier</h2>
          <div className="mt-3 grid gap-3">
            <div>
              <Label htmlFor="sup">Supplier</Label>
              <Select value={form.supplierId} onValueChange={(v) => setForm({ ...form, supplierId: v })}>
                <SelectTrigger id="sup" className="mt-1"><SelectValue placeholder="Choose a supplier" /></SelectTrigger>
                <SelectContent>{suppliers.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="vert">Vertical</Label>
              <Select value={form.vertical} onValueChange={(v) => setForm({ ...form, vertical: v as Vertical })}>
                <SelectTrigger id="vert" className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="stay">Hotels & lodges</SelectItem>
                  <SelectItem value="tour">Tours & safari</SelectItem>
                  <SelectItem value="transfer">Transfers & car hire</SelectItem>
                  <SelectItem value="flight">Flights</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label htmlFor="ttl">Title</Label><Input id="ttl" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Tarangire Treetops Lodge" className="mt-1" /></div>
            <div><Label htmlFor="desc">Description</Label><Textarea id="desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} className="mt-1" placeholder="What makes this place worth booking…" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label htmlFor="city">City</Label><Input id="city" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="mt-1" /></div>
              <div><Label htmlFor="reg">Region</Label><Input id="reg" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} className="mt-1" /></div>
            </div>
            <div><Label htmlFor="am">Amenities (comma separated)</Label><Input id="am" value={form.amenities} onChange={(e) => setForm({ ...form, amenities: e.target.value })} placeholder="Pool, Restaurant, Wi-Fi" className="mt-1" /></div>
            <div className="grid grid-cols-2 gap-2">
              <div><Label htmlFor="rate">Rate plan name</Label><Input id="rate" value={form.ratePlanName} onChange={(e) => setForm({ ...form, ratePlanName: e.target.value })} className="mt-1" /></div>
              <div><Label htmlFor="base">Base price (TZS)</Label><Input id="base" type="number" step={10000} value={form.baseMinor} onChange={(e) => setForm({ ...form, baseMinor: Number(e.target.value) })} className="mt-1 tabular-nums" /></div>
            </div>
            <div>
              <Label htmlFor="pol">Cancellation policy</Label>
              <Select value={form.cancellationPolicyId} onValueChange={(v) => setForm({ ...form, cancellationPolicyId: v })}>
                <SelectTrigger id="pol" className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{cancellationPolicies.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button className="gap-1.5" disabled={!canLoad} onClick={create}><Save className="size-4" aria-hidden /> Create product</Button>
          </div>

          {draft ? (
            <div className="mt-4 rounded-lg border border-brand-300 bg-brand-50/50 p-3">
              <p className="text-sm font-medium">{draft.title} created</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Completeness {draft.completeness}/10 · attributed to back office. Add photos and detail, then submit it for approval.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => { catalog.submitForReview(draft.id); toast.success("Submitted for review"); setDraftId(null); }}>Submit for review</Button>
                <Button size="sm" variant="outline" onClick={() => setDraftId(null)}>Load another</Button>
              </div>
            </div>
          ) : null}
        </section>

        <section>
          <h2 className="mb-2 font-medium">Staff-loaded catalogue</h2>
          <DataTable columns={columns} rows={staffLoaded.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))} rowKey={(p) => p.id} caption="Staff loaded products" empty={<EmptyState title="Nothing loaded by staff yet" description="Use the form to load a product for a supplier who does not self serve." />} />
          <p className="mt-3 rounded-xl border bg-card p-4 text-xs text-muted-foreground">
            Tracking <span className="font-mono">enteredBy</span> is how we measure the shift to self service. Today
            {" "}{all.length ? Math.round((selfServed.length / all.length) * 100) : 0}% of the catalogue is supplier maintained.
          </p>
        </section>
      </div>
    </>
  );
}
