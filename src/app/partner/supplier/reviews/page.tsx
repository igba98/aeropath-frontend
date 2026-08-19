"use client";

import { useState } from "react";
import { MessageSquareReply, Star } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, StatTile } from "@/components/chrome/console-shell";
import { EmptyState } from "@/components/shared/empty-state";
import { Pill } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useStore } from "@/lib/store";
import { admin } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AdminOnly, NotSupplier, useSupplierContext } from "@/features/supplier/shared";
import type { Review } from "@/lib/domain/types";

/** S10 · Guest reviews. Only Supplier Admin may respond (§2.4). */
export default function SupplierReviewsPage() {
  const { org, hydrated, isAdmin } = useSupplierContext();
  const reviews = useStore((s) => s.reviews);
  const products = useStore((s) => s.products);
  const [replyTo, setReplyTo] = useState<Review | null>(null);
  const [text, setText] = useState("");

  if (!hydrated) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!org) {
    return (
      <>
        <PageHeader title="Reviews" code="S10" description="What guests said about your products, and your replies." />
        <NotSupplier what="Guest reviews" />
      </>
    );
  }

  const rows = Object.values(reviews).filter((r) => r.supplierId === org.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const published = rows.filter((r) => r.status === "published");
  const avg = published.length ? Math.round((published.reduce((s, r) => s + r.rating, 0) / published.length) * 10) / 10 : 0;
  const unanswered = published.filter((r) => !r.response).length;

  function send() {
    if (!replyTo) return;
    if (text.trim().length < 10) {
      toast.error("Write a proper reply", { description: "A one word answer reads worse than no answer at all." });
      return;
    }
    admin.respondReview(replyTo.id, text.trim());
    toast.success("Reply published", { description: "It appears under the review on your product page." });
    setReplyTo(null);
    setText("");
  }

  return (
    <>
      <PageHeader title="Reviews" code="S10" description={`${rows.length} review${rows.length === 1 ? "" : "s"} across your products. Replies are public.`} />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Average rating" value={avg ? `${avg} / 5` : "—"} hint={`${published.length} published review(s)`} icon={Star} />
        <StatTile label="Awaiting your reply" value={unanswered} hint="Guests notice when you answer" tone={unanswered ? "warning" : "default"} icon={MessageSquareReply} />
        <StatTile label="Under moderation" value={rows.filter((r) => r.status !== "published").length} hint="Aeropath checks flagged and new reviews" icon={Star} />
      </div>

      <div className="mt-5 space-y-3">
        {rows.length === 0 ? (
          <EmptyState icon={Star} title="No reviews yet" description="Guests are invited to review 24 hours after checkout. Reviews appear here as soon as they pass moderation." />
        ) : (
          rows.map((r) => (
            <article key={r.id} className="rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Stars rating={r.rating} />
                    <h2 className="font-medium">{r.title}</h2>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {r.authorName} · {formatDate(r.createdAt)} · {products[r.productId]?.title ?? r.productId}
                  </p>
                </div>
                <Pill tone={r.status === "published" ? "success" : r.status === "flagged" ? "danger" : "warning"}>
                  {r.status === "published" ? "Published" : r.status === "flagged" ? "Flagged for moderation" : "Pending moderation"}
                </Pill>
              </div>
              <p className="mt-2 text-sm">{r.body}</p>
              {r.response ? (
                <div className="mt-3 rounded-lg border-l-2 border-brand-400 bg-muted/50 p-3">
                  <p className="text-xs font-medium text-brand-text-strong">Your reply · {formatDate(r.response.at)}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{r.response.text}</p>
                </div>
              ) : isAdmin ? (
                <Button size="sm" variant="outline" className="mt-3" onClick={() => { setReplyTo(r); setText(""); }}>
                  <MessageSquareReply className="size-3.5" aria-hidden />Reply
                </Button>
              ) : (
                <p className="mt-3 text-xs text-muted-foreground">Only a Supplier Admin can reply to reviews.</p>
              )}
            </article>
          ))
        )}
      </div>

      {!isAdmin && rows.length ? (
        <div className="mt-5">
          <AdminOnly screen="Replying to reviews" />
        </div>
      ) : null}

      <Dialog open={replyTo !== null} onOpenChange={(o) => !o && setReplyTo(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reply to {replyTo?.authorName}</DialogTitle>
            <DialogDescription>Your reply is published publicly under the review. Thank them, answer the specific point, and say what changed.</DialogDescription>
          </DialogHeader>
          {replyTo ? (
            <div className="rounded-lg border bg-muted/40 p-3 text-sm">
              <div className="flex items-center gap-2"><Stars rating={replyTo.rating} /><span className="font-medium">{replyTo.title}</span></div>
              <p className="mt-1 text-muted-foreground">{replyTo.body}</p>
            </div>
          ) : null}
          <div>
            <Label htmlFor="reply">Your reply</Label>
            <Textarea id="reply" className="mt-1.5" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Asante sana for the feedback…" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReplyTo(null)}>Cancel</Button>
            <Button onClick={send}>Publish reply</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${rating} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={cn("size-3.5", n <= rating ? "fill-warning text-warning" : "text-muted-foreground/40")} aria-hidden />
      ))}
    </span>
  );
}
