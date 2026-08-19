"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { AlertTriangle, ArrowLeft, Check, Pencil, Plus, SlidersHorizontal, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/chrome/console-shell";
import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { MoneyText } from "@/components/shared/money-text";
import { Pill } from "@/components/shared/status-chip";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useStore } from "@/lib/store";
import { catalog } from "@/lib/api";
import { cancellationPolicies } from "@/lib/fixtures/policies";
import { AdminOnly, NotSupplier, useSupplierContext } from "@/features/supplier/shared";
import type { RatePlan } from "@/lib/domain/types";

const BASIS_LABELS: Record<RatePlan["basis"], string> = {
  per_unit_night: "Per room per night",
  per_person: "Per person",
  per_vehicle: "Per vehicle",
  per_passenger: "Per passenger",
};

interface Form {
  id?: string;
  name: string;
  basis: RatePlan["basis"];
  baseMinor: number;
  inclusions: string;
  cancellationPolicyId: string;
  refundable: boolean;
  minStay: number;
  extraAdultMinor: number;
  label: string;
}

const emptyForm = (basis: RatePlan["basis"]): Form => ({
  name: "",
  basis,
  baseMinor: 0,
  inclusions: "",
  cancellationPolicyId: "cp_moderate",
  refundable: true,
  minStay: 0,
  extraAdultMinor: 0,
  label: "",
});

/** S05 · Rate plans. Supplier Admin only — Supplier Staff never manages pricing (§2.4). */
export default function RatePlansPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { org, hydrated, isAdmin } = useSupplierContext();
  const product = useStore((s) => s.products[id]);
  const ratePlans = useStore((s) => s.ratePlans);
  const [form, setForm] = useState<Form | null>(null);
  const [deleting, setDeleting] = useState<RatePlan | null>(null);

  if (!hydrated) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!org) {
    return (
      <>
        <PageHeader title="Rate plans" code="S05" />
        <NotSupplier what="Rate plans" />
      </>
    );
  }
  if (!isAdmin) {
    return (
      <>
        <PageHeader title="Rate plans" code="S05" description="Prices, commission, inclusions and cancellation terms." />
        <AdminOnly screen="Managing rate plans" />
      </>
    );
  }
  if (!product || product.supplierId !== org.id) {
    return (
      <>
        <PageHeader title="Rate plans" code="S05" />
        <EmptyState icon={AlertTriangle} title="Product not found" description="This listing does not belong to your organisation." action={<Button asChild><Link href="/partner/supplier/products">Back to products</Link></Button>} />
      </>
    );
  }

  const defaultBasis: RatePlan["basis"] = product.vertical === "stay" ? "per_unit_night" : product.vertical === "tour" ? "per_person" : product.vertical === "flight" ? "per_passenger" : "per_vehicle";
  const rows = Object.values(ratePlans).filter((r) => r.productId === id).sort((a, b) => a.baseMinor - b.baseMinor);
  const commissionPct = org.commissionPct ?? 15;

  function save() {
    if (!form || !product) return;
    if (form.name.trim().length < 3) {
      toast.error("Name the rate plan", { description: "Travellers see this name, e.g. “Standard Departure · Full board”." });
      return;
    }
    if (form.baseMinor <= 0) {
      toast.error("Set a base price above zero");
      return;
    }
    catalog.upsertRatePlan({
      id: form.id,
      productId: product.id,
      name: form.name.trim(),
      currency: product.currency,
      baseMinor: Math.round(form.baseMinor),
      basis: form.basis,
      inclusions: form.inclusions.split(",").map((s) => s.trim()).filter(Boolean),
      cancellationPolicyId: form.cancellationPolicyId,
      commissionPct,
      extraAdultMinor: form.extraAdultMinor > 0 ? Math.round(form.extraAdultMinor) : undefined,
      refundable: form.refundable,
      minStay: form.minStay > 0 ? form.minStay : undefined,
      label: form.label.trim() || undefined,
    });
    toast.success(form.id ? "Rate plan updated" : "Rate plan created", { description: "The indicative “from” price on your listing has been recalculated." });
    setForm(null);
  }

  function remove() {
    if (!deleting) return;
    catalog.deleteRatePlan(deleting.id);
    toast.success("Rate plan deleted", { description: `${deleting.name} is no longer bookable. Existing bookings keep their snapshot price.` });
    setDeleting(null);
  }

  const columns: Column<RatePlan>[] = [
    {
      key: "name",
      header: "Rate plan",
      render: (r) => (
        <div className="min-w-0">
          <p className="font-medium">{r.name}</p>
          <p className="text-xs text-muted-foreground">{r.inclusions.length ? r.inclusions.join(" · ") : "No inclusions listed"}</p>
        </div>
      ),
    },
    { key: "basis", header: "Basis", render: (r) => <span className="text-sm">{BASIS_LABELS[r.basis]}</span> },
    {
      key: "base",
      header: "Base price",
      numeric: true,
      render: (r) => (
        <div>
          <MoneyText minor={r.baseMinor} currency={r.currency} size="sm" showCurrency={false} />
          {r.extraAdultMinor ? <p className="text-[11px] text-muted-foreground">+{r.extraAdultMinor.toLocaleString("en-TZ")} extra adult</p> : null}
        </div>
      ),
    },
    { key: "commission", header: "Commission", numeric: true, render: (r) => <span className="text-sm tabular-nums">{r.commissionPct}%</span> },
    {
      key: "net",
      header: "Your net",
      numeric: true,
      render: (r) => <MoneyText minor={Math.round(r.baseMinor * (1 - r.commissionPct / 100))} currency={r.currency} size="sm" showCurrency={false} />,
    },
    {
      key: "policy",
      header: "Cancellation",
      render: (r) => (
        <div className="flex flex-col gap-1">
          <span className="text-sm">{cancellationPolicies.find((p) => p.id === r.cancellationPolicyId)?.name ?? r.cancellationPolicyId}</span>
          <Pill tone={r.refundable ? "success" : "neutral"} icon={r.refundable ? Check : X}>{r.refundable ? "Refundable" : "Non refundable"}</Pill>
        </div>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      className: "w-px whitespace-nowrap",
      render: (r) => (
        <div className="flex justify-end gap-1.5">
          <Button
            size="sm"
            variant="ghost"
            aria-label={`Edit ${r.name}`}
            onClick={() =>
              setForm({
                id: r.id,
                name: r.name,
                basis: r.basis,
                baseMinor: r.baseMinor,
                inclusions: r.inclusions.join(", "),
                cancellationPolicyId: r.cancellationPolicyId,
                refundable: r.refundable,
                minStay: r.minStay ?? 0,
                extraAdultMinor: r.extraAdultMinor ?? 0,
                label: r.label ?? "",
              })
            }
          >
            <Pencil className="size-3.5" aria-hidden />Edit
          </Button>
          <Button size="sm" variant="ghost" aria-label={`Delete ${r.name}`} onClick={() => setDeleting(r)}>
            <Trash2 className="size-3.5 text-destructive" aria-hidden />Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={`Rate plans · ${product.title}`}
        code="S05"
        description="Each plan is a sellable price for this product. Commission is fixed by your contract and cannot be edited here."
        actions={
          <>
            <Button variant="ghost" asChild>
              <Link href={`/partner/supplier/products/${product.id}`}><ArrowLeft className="size-4" aria-hidden />Back to editor</Link>
            </Button>
            <Button onClick={() => setForm(emptyForm(defaultBasis))}><Plus className="size-4" aria-hidden />New rate plan</Button>
          </>
        }
      />

      <DataTable
        caption={`Rate plans for ${product.title}`}
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        empty={
          <EmptyState
            icon={SlidersHorizontal}
            title="No rate plans yet"
            description="A product cannot be sold without at least one rate plan, and it is worth two points of your completeness score."
            action={<Button onClick={() => setForm(emptyForm(defaultBasis))}><Plus className="size-4" aria-hidden />Create the first rate plan</Button>}
          />
        }
      />

      <p className="mt-3 text-xs text-muted-foreground">
        Commission of {commissionPct}% is set in your contract with Aeropath. Guests pay the all-in price (base + levies + VAT + service fee); you are paid the net {org.payoutTermsDays ?? 14} days after travel.
      </p>

      <Dialog open={form !== null} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form?.id ? "Edit rate plan" : "New rate plan"}</DialogTitle>
            <DialogDescription>Prices are entered net of taxes; Aeropath adds VAT, levies and the service fee for the guest.</DialogDescription>
          </DialogHeader>
          {form ? (
            <div className="space-y-4">
              <div>
                <Label htmlFor="rp-name">Name</Label>
                <Input id="rp-name" className="mt-1.5" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Standard Departure · Full board" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="rp-basis">Basis</Label>
                  <Select value={form.basis} onValueChange={(v) => setForm({ ...form, basis: v as RatePlan["basis"] })}>
                    <SelectTrigger id="rp-basis" className="mt-1.5 w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(BASIS_LABELS) as RatePlan["basis"][]).map((b) => <SelectItem key={b} value={b}>{BASIS_LABELS[b]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="rp-base">Base price (TZS)</Label>
                  <Input id="rp-base" type="number" className="mt-1.5" value={form.baseMinor} onChange={(e) => setForm({ ...form, baseMinor: Number(e.target.value) || 0 })} />
                </div>
                {form.basis === "per_unit_night" ? (
                  <>
                    <div>
                      <Label htmlFor="rp-extra">Extra adult (TZS)</Label>
                      <Input id="rp-extra" type="number" className="mt-1.5" value={form.extraAdultMinor} onChange={(e) => setForm({ ...form, extraAdultMinor: Number(e.target.value) || 0 })} />
                    </div>
                    <div>
                      <Label htmlFor="rp-minstay">Minimum stay (nights)</Label>
                      <Input id="rp-minstay" type="number" className="mt-1.5" value={form.minStay} onChange={(e) => setForm({ ...form, minStay: Number(e.target.value) || 0 })} />
                    </div>
                  </>
                ) : null}
              </div>
              <div>
                <Label htmlFor="rp-inclusions">Inclusions (comma separated)</Label>
                <Input id="rp-inclusions" className="mt-1.5" value={form.inclusions} onChange={(e) => setForm({ ...form, inclusions: e.target.value })} placeholder="Park fees, Full board, Private 4x4" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="rp-policy">Cancellation policy</Label>
                  <Select value={form.cancellationPolicyId} onValueChange={(v) => setForm({ ...form, cancellationPolicyId: v })}>
                    <SelectTrigger id="rp-policy" className="mt-1.5 w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {cancellationPolicies.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="rp-label">Badge (optional)</Label>
                  <Input id="rp-label" className="mt-1.5" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Best flexible" />
                </div>
              </div>
              <label className="flex items-center justify-between gap-4 rounded-lg border p-3">
                <span className="text-sm">
                  Refundable
                  <span className="mt-0.5 block text-xs text-muted-foreground">Non refundable plans should be priced below your flexible rate.</span>
                </span>
                <Switch checked={form.refundable} onCheckedChange={(v) => setForm({ ...form, refundable: v })} aria-label="Refundable" />
              </label>
              <div className="rounded-lg border border-dashed bg-muted/40 p-3 text-sm">
                <div className="flex items-baseline justify-between">
                  <span className="text-muted-foreground">Commission ({commissionPct}%, set by contract)</span>
                  <MoneyText minor={Math.round(form.baseMinor * commissionPct / 100)} currency="TZS" size="sm" showCurrency={false} />
                </div>
                <div className="mt-1 flex items-baseline justify-between">
                  <span className="font-medium">Your net per unit</span>
                  <MoneyText minor={Math.round(form.baseMinor * (1 - commissionPct / 100))} currency="TZS" size="sm" />
                </div>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>Cancel</Button>
            <Button onClick={save}>{form?.id ? "Save changes" : "Create rate plan"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleting !== null} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              It disappears from search immediately. Bookings already made keep the price and policy snapshot they were sold at, so nothing changes for those guests.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={remove}>Delete rate plan</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
