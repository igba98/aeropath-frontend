"use client";

import { useState } from "react";
import { Building2, Check, CheckCircle2, FileCheck, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, StatTile } from "@/components/chrome/console-shell";
import { EmptyState } from "@/components/shared/empty-state";
import { Pill } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/hooks/use-session";
import { useStore } from "@/lib/store";
import { admin } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import type { Organisation } from "@/lib/domain/types";

const DOCS = [
  { id: "tin", label: "TIN certificate", hint: "Tanzania Revenue Authority" },
  { id: "licence", label: "TALA / operating licence", hint: "Tourism or transport authority" },
  { id: "bank", label: "Bank account confirmation", hint: "Letter or cancelled cheque" },
  { id: "insurance", label: "Public liability insurance", hint: "Current policy schedule" },
  { id: "contract", label: "Signed platform contract", hint: "Commission and payment terms" },
];

/** P02 · Onboarding queue with document verification. */
export default function OnboardingQueuePage() {
  const s = useSession();
  const organisations = useStore((st) => st.organisations);
  const [decision, setDecision] = useState<{ org: Organisation; mode: "approve" | "reject" } | null>(null);
  const [note, setNote] = useState("");
  const [checked, setChecked] = useState<Record<string, Record<string, boolean>>>({});

  if (!s.hydrated) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;
  const canApprove = s.can("SUPPLIER:approve_onboarding");

  const suppliers = Object.values(organisations).filter((o) => o.type === "supplier");
  const pending = suppliers.filter((o) => o.status === "pending");

  function verified(orgId: string) {
    const marks = checked[orgId] ?? {};
    return DOCS.filter((d) => marks[d.id]).length;
  }

  return (
    <>
      <PageHeader title="Onboarding queue" code="P02" description="Applications awaiting approval. Nothing goes live until the documents check out and a commission is agreed." />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatTile label="Awaiting approval" value={pending.length} tone={pending.length ? "warning" : "default"} icon={Building2} />
        <StatTile label="Approved suppliers" value={suppliers.filter((o) => o.status === "active").length} tone="success" icon={CheckCircle2} />
        <StatTile label="Documents per application" value={DOCS.length} icon={FileCheck} />
      </div>

      {!canApprove ? (
        <div className="mb-4 rounded-xl border border-warning/40 bg-warning/5 p-4 text-sm">
          <p className="font-medium">Review only</p>
          <p className="mt-0.5 text-muted-foreground">Signed in as {s.roleLabel}. Approving a supplier requires Supply Manager, Platform Admin or Super Admin.</p>
        </div>
      ) : null}

      {pending.length === 0 ? (
        <EmptyState icon={CheckCircle2} title="Queue is clear" description="New supplier applications land here as soon as the wizard is submitted." />
      ) : (
        <div className="space-y-4">
          {pending.map((o) => {
            const n = verified(o.id);
            return (
              <article key={o.id} className="rounded-xl border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-medium">{o.name}</h2>
                      <Pill tone="warning">Step {o.onboardingStep ?? 1} of 6</Pill>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {o.city}, {o.countryCode} · applied {relativeTime(o.createdAt)} · {o.contactName} · {o.contactPhone}
                    </p>
                  </div>
                  <span className={n === DOCS.length ? "text-success-foreground" : "text-muted-foreground"}>
                    <span className="font-display text-2xl tabular-nums">{n}</span>
                    <span className="text-sm">/{DOCS.length} verified</span>
                  </span>
                </div>

                <dl className="mt-3 grid gap-3 rounded-lg bg-muted/50 p-3 text-sm sm:grid-cols-3">
                  <div><dt className="text-xs text-muted-foreground">TIN</dt><dd className="font-mono">{o.tin ?? "—"}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Licence</dt><dd className="font-mono">{o.licenceNo ?? "—"}</dd></div>
                  <div><dt className="text-xs text-muted-foreground">Proposed commission</dt><dd>{o.commissionPct ?? 15}%</dd></div>
                </dl>

                <div className="mt-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Document verification</p>
                  <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                    {DOCS.map((d) => (
                      <li key={d.id}>
                        <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5">
                          <Checkbox
                            checked={Boolean(checked[o.id]?.[d.id])}
                            onCheckedChange={(c) => setChecked((prev) => ({ ...prev, [o.id]: { ...(prev[o.id] ?? {}), [d.id]: Boolean(c) } }))}
                          />
                          <span>
                            <span className="block text-sm font-medium">{d.label}</span>
                            <span className="block text-xs text-muted-foreground">{d.hint}</span>
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Button className="gap-1.5" disabled={!canApprove} onClick={() => { setDecision({ org: o, mode: "approve" }); setNote(""); }}>
                    <Check className="size-4" aria-hidden /> Approve supplier
                  </Button>
                  <Button variant="outline" className="gap-1.5 text-destructive hover:text-destructive" disabled={!canApprove} onClick={() => { setDecision({ org: o, mode: "reject" }); setNote(""); }}>
                    <X className="size-4" aria-hidden /> Reject
                  </Button>
                  {n < DOCS.length ? <p className="self-center text-xs text-muted-foreground">{DOCS.length - n} document{DOCS.length - n === 1 ? "" : "s"} still unverified</p> : null}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Dialog open={Boolean(decision)} onOpenChange={(o) => { if (!o) setDecision(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{decision?.mode === "approve" ? "Approve supplier" : "Reject application"}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            {decision?.mode === "approve"
              ? `${decision.org.name} gets partner portal access and can start loading products. Nothing they list goes live without product approval.`
              : "The applicant is told the application was unsuccessful. Give a reason they can act on."}
          </p>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder={decision?.mode === "approve" ? "Optional note for the file" : "e.g. TALA licence has expired — reapply once renewed."} />
          <DialogFooter>
            <Button
              variant={decision?.mode === "reject" ? "destructive" : "default"}
              onClick={() => {
                if (!decision) return;
                if (decision.mode === "reject" && !note.trim()) return toast.error("Give a reason");
                admin.approveSupplier(decision.org.id, decision.mode, note.trim() || undefined);
                toast.success(decision.mode === "approve" ? `${decision.org.name} approved` : "Application rejected", { description: decision.mode === "approve" ? "Partner portal access granted." : undefined });
                setDecision(null);
              }}
            >
              {decision?.mode === "approve" ? "Approve" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
