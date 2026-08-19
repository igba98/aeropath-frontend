"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PackagePlus, Pause, Pencil, Play, Send, SlidersHorizontal, Package } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/chrome/console-shell";
import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { MoneyText } from "@/components/shared/money-text";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStore } from "@/lib/store";
import { catalog } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { NotSupplier, ProductStatusPill, PUBLISH_THRESHOLD, VERTICAL_LABELS, useSupplierContext } from "@/features/supplier/shared";
import type { Product, Vertical } from "@/lib/domain/types";

/** S03 · Products list with completeness score and the quick actions a supplier actually uses. */
export default function SupplierProductsPage() {
  const router = useRouter();
  const { org, hydrated, isAdmin } = useSupplierContext();
  const products = useStore((s) => s.products);
  const ratePlans = useStore((s) => s.ratePlans);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [vertical, setVertical] = useState<Vertical>("tour");

  if (!hydrated) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!org) {
    return (
      <>
        <PageHeader title="Products" code="S03" description="Everything you sell on Aeropath, with its listing status and completeness score." />
        <NotSupplier what="The products list" />
      </>
    );
  }

  const rows = Object.values(products)
    .filter((p) => p.supplierId === org.id)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  function create() {
    if (!org) return;
    if (title.trim().length < 4) {
      toast.error("Give the product a title first", { description: "At least four characters — you can refine it in the editor." });
      return;
    }
    const id = catalog.createProduct({ supplierId: org.id, vertical, title: title.trim() }, "supplier");
    setOpen(false);
    setTitle("");
    toast.success("Draft created", { description: "Fill in the tabs, then submit for review." });
    router.push(`/partner/supplier/products/${id}`);
  }

  function submitForReview(p: Product) {
    if (p.completeness < PUBLISH_THRESHOLD) {
      toast.error("Not ready for review", { description: `Completeness is ${p.completeness}/10. You need ${PUBLISH_THRESHOLD}/10 before the supply team will look at it.` });
      return;
    }
    catalog.submitForReview(p.id);
    toast.success("Submitted for review", { description: "The Aeropath supply team approves listings — suppliers cannot publish directly." });
  }

  function togglePause(p: Product) {
    const next = p.status === "paused" ? "live" : "paused";
    catalog.setProductStatus(p.id, next);
    toast.success(next === "paused" ? "Product paused" : "Product back on sale", {
      description: next === "paused" ? "It stays in the catalogue but is not searchable." : "It is searchable again immediately.",
    });
  }

  const columns: Column<Product>[] = [
    {
      key: "title",
      header: "Product",
      render: (p) => (
        <div className="min-w-0">
          <Link href={`/partner/supplier/products/${p.id}`} className="font-medium text-brand-text hover:underline">{p.title}</Link>
          <p className="text-xs text-muted-foreground">{VERTICAL_LABELS[p.vertical]} · {p.location.city} · {Object.values(ratePlans).filter((r) => r.productId === p.id).length} rate plan(s)</p>
        </div>
      ),
    },
    { key: "status", header: "Status", render: (p) => <ProductStatusPill status={p.status} /> },
    {
      key: "completeness",
      header: "Completeness",
      render: (p) => (
        <div className="w-32">
          <div className="flex items-baseline justify-between text-xs">
            <span className="tabular-nums font-medium">{p.completeness}/10</span>
            {p.completeness < PUBLISH_THRESHOLD ? <span className="text-warning-foreground">needs {PUBLISH_THRESHOLD - p.completeness}</span> : null}
          </div>
          <Progress value={p.completeness * 10} className="mt-1 h-1.5" aria-label={`Completeness ${p.completeness} of 10`} />
        </div>
      ),
    },
    { key: "price", header: "From", numeric: true, render: (p) => (p.priceFromMinor ? <MoneyText minor={p.priceFromMinor} currency={p.currency} size="sm" showCurrency={false} /> : <span className="text-xs text-muted-foreground">no rate</span>) },
    { key: "updated", header: "Updated", render: (p) => <span className="text-xs text-muted-foreground">{formatDate(p.updatedAt)}</span> },
    {
      key: "actions",
      header: "Actions",
      className: "w-px whitespace-nowrap",
      render: (p) => (
        <div className="flex items-center justify-end gap-1.5">
          <Button size="sm" variant="ghost" asChild aria-label={`Edit ${p.title}`}>
            <Link href={`/partner/supplier/products/${p.id}`}><Pencil className="size-3.5" aria-hidden />Edit</Link>
          </Button>
          {isAdmin ? (
            <Button size="sm" variant="ghost" asChild aria-label={`Rate plans for ${p.title}`}>
              <Link href={`/partner/supplier/products/${p.id}/rates`}><SlidersHorizontal className="size-3.5" aria-hidden />Rates</Link>
            </Button>
          ) : null}
          {["draft", "changes_requested", "rejected"].includes(p.status) ? (
            <Button size="sm" variant="outline" onClick={() => submitForReview(p)}>
              <Send className="size-3.5" aria-hidden />Submit
            </Button>
          ) : null}
          {p.status === "live" || p.status === "paused" ? (
            <Button size="sm" variant="outline" onClick={() => togglePause(p)}>
              {p.status === "paused" ? <><Play className="size-3.5" aria-hidden />Unpause</> : <><Pause className="size-3.5" aria-hidden />Pause</>}
            </Button>
          ) : null}
        </div>
      ),
    },
  ];

  const needsWork = rows.filter((p) => p.status === "changes_requested" || p.status === "draft").length;

  return (
    <>
      <PageHeader
        title="Products"
        code="S03"
        description={`${rows.length} listing${rows.length === 1 ? "" : "s"} for ${org.name}. Approval to go live always happens in the Aeropath back office.`}
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><PackagePlus className="size-4" aria-hidden />New product</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New product</DialogTitle>
                <DialogDescription>Pick the vertical and give it a working title. Everything else is edited in the tabbed editor.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="vertical">Vertical</Label>
                  <Select value={vertical} onValueChange={(v) => setVertical(v as Vertical)}>
                    <SelectTrigger id="vertical" className="mt-1.5 w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="tour">Tours &amp; safari</SelectItem>
                      <SelectItem value="stay">Stay · lodge, camp or hotel</SelectItem>
                      <SelectItem value="transfer">Transfer or car hire</SelectItem>
                      <SelectItem value="flight">Flight</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="title">Title</Label>
                  <Input id="title" className="mt-1.5" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. 4 Day Tarangire & Ngorongoro Safari" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button onClick={create}>Create draft</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      {needsWork ? (
        <p className="mb-3 rounded-lg border border-warning/40 bg-warning/5 px-3 py-2 text-sm text-warning-foreground">
          {needsWork} listing{needsWork === 1 ? "" : "s"} still need work before the supply team can review them.
        </p>
      ) : null}

      <DataTable
        caption="Your products with status and completeness"
        columns={columns}
        rows={rows}
        rowKey={(p) => p.id}
        empty={
          <EmptyState
            icon={Package}
            title="No products yet"
            description="Create your first listing — a lodge, a safari package, a transfer route or a flight. It stays a draft until the supply team approves it."
            action={<Button onClick={() => setOpen(true)}><PackagePlus className="size-4" aria-hidden />New product</Button>}
          />
        }
      />
    </>
  );
}
