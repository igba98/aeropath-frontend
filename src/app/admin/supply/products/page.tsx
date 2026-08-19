"use client";

import { useState } from "react";
import { AlertTriangle, Check, CheckCircle2, Eye, Images, MapPin, Star, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, StatTile } from "@/components/chrome/console-shell";
import { EmptyState } from "@/components/shared/empty-state";
import { MoneyText } from "@/components/shared/money-text";
import { StatusChip, Pill } from "@/components/shared/status-chip";
import { ProductImage } from "@/components/shared/product-image";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSession } from "@/hooks/use-session";
import { useStore } from "@/lib/store";
import { catalog } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Product } from "@/lib/domain/types";

type Decision = "approve" | "request_changes" | "reject";

/**
 * P04 · Product approval queue.
 * No supplier role can publish directly — this is the control that keeps catalogue quality
 * and margin integrity in house (flow spec §2.4).
 */
export default function ProductApprovalsPage() {
  const s = useSession();
  const products = useStore((st) => st.products);
  const ratePlans = useStore((st) => st.ratePlans);
  const organisations = useStore((st) => st.organisations);
  const [selected, setSelected] = useState<string | null>(null);
  const [decision, setDecision] = useState<{ product: Product; mode: Decision } | null>(null);
  const [notes, setNotes] = useState("");

  if (!s.hydrated) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;

  const canApprove = s.can("PRODUCT:approve");
  const all = Object.values(products);
  const queue = all.filter((p) => p.status === "pending_review");
  const recent = all.filter((p) => p.status === "changes_requested" || p.status === "rejected");
  const live = all.filter((p) => p.status === "live");

  const active = selected ? products[selected] : queue[0];

  function submit() {
    if (!decision) return;
    if (decision.mode !== "approve" && !notes.trim()) {
      toast.error("Tell the supplier what to fix", { description: "A rejection without a reason just comes back again." });
      return;
    }
    catalog.reviewProduct(decision.product.id, decision.mode, notes.trim() || undefined);
    toast.success(
      decision.mode === "approve" ? "Approved and live" : decision.mode === "reject" ? "Rejected" : "Changes requested",
      { description: decision.mode === "approve" ? "It is searchable to travellers now." : "The supplier has been emailed." },
    );
    setDecision(null);
    setNotes("");
    setSelected(null);
  }

  return (
    <>
      <PageHeader
        title="Product approvals"
        code="P04"
        description="Everything a supplier submits lands here. Nothing reaches traveller search without a decision on this screen."
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        <StatTile label="Awaiting review" value={queue.length} tone={queue.length ? "warning" : "default"} icon={Eye} />
        <StatTile label="Changes requested" value={recent.filter((p) => p.status === "changes_requested").length} icon={AlertTriangle} />
        <StatTile label="Live products" value={live.length} tone="success" icon={CheckCircle2} />
        <StatTile label="Self-served share" value={`${all.length ? Math.round((all.filter((p) => p.enteredBy === "supplier").length / all.length) * 100) : 0}%`} hint="Loaded by suppliers, not staff" />
      </div>

      {!canApprove ? (
        <div className="mb-4 rounded-xl border border-warning/40 bg-warning/5 p-4 text-sm">
          <p className="font-medium">You can review but not decide</p>
          <p className="mt-0.5 text-muted-foreground">
            Signed in as {s.roleLabel}. Approving a listing requires Supply Manager, Platform Admin or Super Admin.
          </p>
        </div>
      ) : null}

      <Tabs defaultValue="queue">
        <TabsList>
          <TabsTrigger value="queue">Queue {queue.length ? `(${queue.length})` : ""}</TabsTrigger>
          <TabsTrigger value="returned">Returned {recent.length ? `(${recent.length})` : ""}</TabsTrigger>
        </TabsList>

        <TabsContent value="queue" className="mt-4">
          {queue.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="Queue is clear" description="Every submitted product has been reviewed. New submissions appear here within seconds." />
          ) : (
            <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
              <aside className="space-y-2">
                {queue.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelected(p.id)}
                    className={cn("w-full rounded-xl border p-3 text-left transition-colors", p.id === active?.id ? "border-brand-400 bg-brand-50/50" : "bg-card hover:border-brand-300")}
                  >
                    <p className="truncate text-sm font-medium">{p.title}</p>
                    <p className="text-xs text-muted-foreground">{organisations[p.supplierId]?.name}</p>
                    <p className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="capitalize">{p.vertical}</span> · <span>{p.completeness}/10</span> · <span>{relativeTime(p.updatedAt)}</span>
                    </p>
                  </button>
                ))}
              </aside>

              {active ? <ReviewPanel product={active} ratePlanCount={Object.values(ratePlans).filter((r) => r.productId === active.id).length} supplierName={organisations[active.supplierId]?.name ?? "—"} canApprove={canApprove} onDecide={(mode) => { setDecision({ product: active, mode }); setNotes(""); }} /> : null}
            </div>
          )}
        </TabsContent>

        <TabsContent value="returned" className="mt-4 space-y-3">
          {recent.length === 0 ? <EmptyState title="Nothing returned to suppliers" /> : recent.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <StatusChip status={p.status === "rejected" ? "supplier_rejected" : "draft"} size="sm" />
                  <span className="text-sm font-medium">{p.title}</span>
                </div>
                <p className="text-xs text-muted-foreground">{organisations[p.supplierId]?.name} · {relativeTime(p.updatedAt)}</p>
                {p.reviewNotes ? <p className="mt-1 rounded bg-muted px-2 py-1 text-xs">{p.reviewNotes}</p> : null}
              </div>
            </div>
          ))}
        </TabsContent>
      </Tabs>

      <Dialog open={Boolean(decision)} onOpenChange={(o) => { if (!o) { setDecision(null); setNotes(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decision?.mode === "approve" ? "Approve and publish" : decision?.mode === "reject" ? "Reject this listing" : "Request changes"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {decision?.mode === "approve"
              ? `${decision.product.title} becomes searchable to travellers immediately and the supplier is notified.`
              : decision?.mode === "reject"
                ? "The listing is rejected and cannot be resubmitted without your involvement."
                : "The listing goes back to the supplier with your comments. They can fix it and resubmit."}
          </p>
          <div>
            <label htmlFor="review-notes" className="text-sm font-medium">
              Notes for the supplier {decision?.mode === "approve" ? "(optional)" : ""}
            </label>
            <Textarea id="review-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className="mt-1" placeholder="e.g. Add two more photos of the rooms and set a child policy, then resubmit." />
          </div>
          <DialogFooter>
            <Button variant={decision?.mode === "reject" ? "destructive" : "default"} onClick={submit}>
              {decision?.mode === "approve" ? "Approve and publish" : decision?.mode === "reject" ? "Reject" : "Send back"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ReviewPanel({ product, ratePlanCount, supplierName, canApprove, onDecide }: { product: Product; ratePlanCount: number; supplierName: string; canApprove: boolean; onDecide: (mode: Decision) => void }) {
  const checks = [
    { label: "At least 5 photos", pass: product.media.length >= 5, detail: `${product.media.length} uploaded` },
    { label: "Description over 80 characters", pass: product.description.length > 80, detail: `${product.description.length} characters` },
    { label: "At least one rate plan", pass: ratePlanCount > 0, detail: `${ratePlanCount} rate plan${ratePlanCount === 1 ? "" : "s"}` },
    { label: "Cancellation policy set", pass: Boolean(product.cancellationPolicyId), detail: product.cancellationPolicyId || "none" },
    { label: "Three or more amenities", pass: product.amenities.length >= 3, detail: `${product.amenities.length} listed` },
    { label: "Location set", pass: Boolean(product.location.city), detail: `${product.location.city}, ${product.location.region}` },
  ];
  const failing = checks.filter((c) => !c.pass);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        {/* What the traveller would see */}
        <section className="overflow-hidden rounded-xl border bg-card">
          <div className="border-b bg-muted/50 px-3 py-2">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Eye className="size-3.5" aria-hidden /> What the traveller would see
            </p>
          </div>
          <ProductImage slug={product.slug} alt="" className="h-40">
            <div className="absolute bottom-2 left-2 flex gap-1.5">
              {product.instantConfirm ? <Pill tone="success" className="bg-white/95">Instant</Pill> : null}
              {product.freeCancellation ? <Pill tone="info" className="bg-white/95">Free cancellation</Pill> : null}
            </div>
          </ProductImage>
          <div className="p-4">
            <div className="flex items-center gap-2">
              {product.starRating ? (
                <span className="flex text-warning" aria-label={`${product.starRating} star`}>
                  {Array.from({ length: product.starRating }).map((_, i) => <Star key={i} className="size-3.5 fill-current" aria-hidden />)}
                </span>
              ) : null}
              <span className="text-xs capitalize text-muted-foreground">{product.vertical}</span>
            </div>
            <h3 className="mt-1 font-display text-lg">{product.title}</h3>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="size-3" aria-hidden /> {product.location.city}, {product.location.region}
            </p>
            <p className="mt-2 line-clamp-4 text-sm text-muted-foreground">{product.description || <span className="italic">No description supplied.</span>}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {product.amenities.slice(0, 6).map((a) => <span key={a} className="rounded bg-muted px-2 py-0.5 text-[11px]">{a}</span>)}
            </div>
            <div className="mt-3 flex items-baseline justify-between border-t pt-2">
              <span className="text-xs text-muted-foreground">from</span>
              <MoneyText minor={product.priceFromMinor} currency={product.currency} size="md" />
            </div>
          </div>
        </section>

        {/* Submission checklist */}
        <section className="rounded-xl border bg-card">
          <div className="border-b bg-muted/50 px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Submission checklist</p>
          </div>
          <div className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm">Completeness</span>
              <span className={cn("font-display text-2xl tabular-nums", product.completeness >= 8 ? "text-success-foreground" : "text-warning-foreground")}>
                {product.completeness}<span className="text-sm text-muted-foreground">/10</span>
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
              <div className={cn("h-full rounded-full", product.completeness >= 8 ? "bg-success" : "bg-warning")} style={{ width: `${product.completeness * 10}%` }} />
            </div>

            <ul className="mt-3 space-y-2">
              {checks.map((c) => (
                <li key={c.label} className="flex items-start gap-2 text-sm">
                  {c.pass
                    ? <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                    : <X className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />}
                  <span className="min-w-0">
                    <span className={cn("block", !c.pass && "font-medium")}>{c.label}</span>
                    <span className="block text-xs text-muted-foreground">{c.detail}</span>
                  </span>
                </li>
              ))}
            </ul>

            <dl className="mt-3 grid gap-2 border-t pt-3 text-xs">
              <div className="flex justify-between"><dt className="text-muted-foreground">Supplier</dt><dd>{supplierName}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Entered by</dt><dd className="capitalize">{product.enteredBy}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Photos</dt><dd className="flex items-center gap-1"><Images className="size-3" aria-hidden /> {product.media.length}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Submitted</dt><dd>{relativeTime(product.updatedAt)}</dd></div>
            </dl>
          </div>
        </section>
      </div>

      {failing.length ? (
        <div className="rounded-xl border border-warning/40 bg-warning/5 p-3 text-sm">
          <p className="flex items-center gap-1.5 font-medium text-warning-foreground">
            <AlertTriangle className="size-4" aria-hidden /> {failing.length} check{failing.length === 1 ? "" : "s"} not met
          </p>
          <p className="mt-0.5 text-muted-foreground">
            You can still approve if you are satisfied, but sending it back usually produces a better listing:{" "}
            {failing.map((f) => f.label.toLowerCase()).join(", ")}.
          </p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button className="gap-1.5" disabled={!canApprove} onClick={() => onDecide("approve")}>
          <CheckCircle2 className="size-4" aria-hidden /> Approve and publish
        </Button>
        <Button variant="outline" className="gap-1.5" disabled={!canApprove} onClick={() => onDecide("request_changes")}>
          <AlertTriangle className="size-4" aria-hidden /> Request changes
        </Button>
        <Button variant="outline" className="gap-1.5 text-destructive hover:text-destructive" disabled={!canApprove} onClick={() => onDecide("reject")}>
          <XCircle className="size-4" aria-hidden /> Reject
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Approving indexes the product for traveller search within 60 seconds. The supplier is notified either way.
      </p>
    </div>
  );
}
