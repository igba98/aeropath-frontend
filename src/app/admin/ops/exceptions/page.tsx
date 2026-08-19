"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, CheckCircle2, CreditCard, Layers, Link2Off, PlugZap, ShieldAlert, Timer, UserPlus, Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, StatTile } from "@/components/chrome/console-shell";
import { EmptyState } from "@/components/shared/empty-state";
import { SlaCountdown } from "@/components/shared/hold-countdown";
import { Pill } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/hooks/use-session";
import { useStore } from "@/lib/store";
import { useIsPast } from "@/hooks/use-now";
import { admin } from "@/lib/api";
import { INTERNAL_ROLES } from "@/lib/domain/permissions";
import { formatDateTime, relativeTime } from "@/lib/format";
import { ConsoleLoading, FilterChips, GatedAction, Panel } from "@/features/admin/ops-ui";
import type { OpsTask } from "@/lib/domain/types";

type StatusFilter = "open" | "in_progress" | "resolved" | "all";
type Pending = { task: OpsTask; kind: "assign" | "resolve" } | null;

const KIND_META: Record<OpsTask["kind"], { label: string; description: string; icon: LucideIcon; tone: "warning" | "danger" | "info" }> = {
  partial_booking: { label: "Partial bookings", description: "Part of a multi item trip failed. The customer has a gap to fill.", icon: Layers, tone: "danger" },
  orphaned_hold: { label: "Orphaned holds", description: "Inventory held past its TTL and never released by the sweeper.", icon: Timer, tone: "warning" },
  reconciliation: { label: "Reconciliation mismatches", description: "Money the customer says left their account that we have not matched. Resolve in payment reconciliation.", icon: CreditCard, tone: "danger" },
  integration_failure: { label: "Integration failures", description: "A connector is degraded or down. Search and confirmation quality drops while it is.", icon: PlugZap, tone: "warning" },
  supplier_timeout: { label: "Supplier timeouts", description: "No answer inside the SLA. Chase or force confirm.", icon: ShieldAlert, tone: "warning" },
  supplier_rejected: { label: "Supplier rejections", description: "Refunded automatically — someone still owes the customer a phone call.", icon: AlertTriangle, tone: "danger" },
  amendment: { label: "Amendments", description: "A change request waiting on an operator decision.", icon: Wrench, tone: "info" },
  payment_failed: { label: "Payment failures", description: "The charge failed outright. The hold is released unless we act.", icon: Link2Off, tone: "danger" },
};

const KIND_ORDER: OpsTask["kind"][] = ["partial_booking", "orphaned_hold", "reconciliation", "integration_failure", "supplier_timeout", "supplier_rejected", "payment_failed", "amendment"];

/** O07 · Exception board. Everything that fell out of the happy path, grouped by what went wrong. */
export default function ExceptionBoardPage() {
  const isPast = useIsPast();
  const data = useStore((s) => s);
  const session = useSession();
  const [filter, setFilter] = useState<StatusFilter>("open");
  const [pending, setPending] = useState<Pending>(null);
  const [note, setNote] = useState("");
  const [assignee, setAssignee] = useState("");

  const tasks = useMemo(
    () => Object.values(data.opsTasks).sort((a, b) => a.slaDueAt.localeCompare(b.slaDueAt)),
    [data.opsTasks],
  );

  const staff = useMemo(
    () => Object.values(data.users).filter((u) => u.grants.some((g) => INTERNAL_ROLES.includes(g.roleId))).sort((a, b) => a.name.localeCompare(b.name)),
    [data.users],
  );

  if (!session.hydrated) return <ConsoleLoading />;

  const visible = tasks.filter((t) => (filter === "all" ? true : filter === "open" ? t.status !== "resolved" : t.status === filter));
  const grouped = KIND_ORDER.map((kind) => ({ kind, tasks: visible.filter((t) => t.kind === kind) })).filter((g) => g.tasks.length);
  const openCount = tasks.filter((t) => t.status !== "resolved").length;
  const breached = tasks.filter((t) => t.status !== "resolved" && isPast(t.slaDueAt)).length;
  const unassigned = tasks.filter((t) => t.status !== "resolved" && !t.assigneeName).length;

  return (
    <>
      <PageHeader
        title="Exception board"
        code="O07"
        description="Partial bookings, orphaned holds, reconciliation mismatches and integration failures. Grouped by cause so the desk can batch the work."
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Open exceptions" value={openCount} icon={AlertTriangle} tone={openCount ? "warning" : "success"} />
        <StatTile label="Past SLA" value={breached} tone={breached ? "danger" : "success"} hint="Beyond the promised response time" />
        <StatTile label="Unassigned" value={unassigned} hint="Nobody has picked these up" tone={unassigned ? "warning" : "default"} />
        <StatTile label="Resolved" value={tasks.filter((t) => t.status === "resolved").length} icon={CheckCircle2} tone="success" />
      </div>

      <Panel className="mb-4">
        <FilterChips
          ariaLabel="Filter exceptions by status"
          value={filter}
          onChange={setFilter}
          options={[
            { id: "open", label: "Open and in progress", count: openCount },
            { id: "in_progress", label: "In progress", count: tasks.filter((t) => t.status === "in_progress").length },
            { id: "resolved", label: "Resolved", count: tasks.filter((t) => t.status === "resolved").length },
            { id: "all", label: "Everything", count: tasks.length },
          ]}
        />
      </Panel>

      {grouped.length ? (
        <div className="space-y-4">
          {grouped.map(({ kind, tasks: group }) => {
            const meta = KIND_META[kind];
            return (
              <Panel key={kind} title={`${meta.label} · ${group.length}`} description={meta.description} icon={meta.icon}>
                <ul className="space-y-2">
                  {group.map((t) => (
                    <li key={t.id} className="rounded-lg border bg-card p-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{t.title}</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">{t.detail}</p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <Pill tone={t.status === "resolved" ? "success" : t.status === "in_progress" ? "info" : meta.tone}>{t.status.replace(/_/g, " ")}</Pill>
                            {t.status !== "resolved" ? <SlaCountdown deadlineAt={t.slaDueAt} /> : <span className="text-[11px] text-muted-foreground">Resolved {t.resolvedAt ? relativeTime(t.resolvedAt) : ""}</span>}
                            <span className="text-[11px] text-muted-foreground">Raised {formatDateTime(t.createdAt)}</span>
                            {t.assigneeName ? <Pill tone="neutral">{t.assigneeName}</Pill> : <span className="text-[11px] text-muted-foreground">Unassigned</span>}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {t.bookingId ? (
                            <Button asChild variant="ghost" size="sm">
                              <Link href={`/admin/ops/bookings/${t.bookingId}`}>Open {t.bookingReference ?? "booking"}</Link>
                            </Button>
                          ) : null}
                          {kind === "reconciliation" ? (
                            <Button asChild variant="ghost" size="sm"><Link href="/admin/finance/reconciliation">Reconciliation</Link></Button>
                          ) : null}
                          <GatedAction
                            permission="OPS:exceptions"
                            icon={UserPlus}
                            blockedReason={t.status === "resolved" ? "This exception is already resolved." : undefined}
                            onClick={() => { setPending({ task: t, kind: "assign" }); setAssignee(session.user?.name ?? staff[0]?.name ?? ""); }}
                          >
                            Assign
                          </GatedAction>
                          <GatedAction
                            permission="OPS:exceptions"
                            icon={CheckCircle2}
                            variant="default"
                            blockedReason={t.status === "resolved" ? "Already resolved." : undefined}
                            onClick={() => { setPending({ task: t, kind: "resolve" }); setNote(""); }}
                          >
                            Resolve
                          </GatedAction>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </Panel>
            );
          })}
        </div>
      ) : (
        <EmptyState
          icon={CheckCircle2}
          title="No exceptions in this view"
          description="Nothing has fallen out of the happy path. Reject an item from a booking detail screen to raise one."
        />
      )}

      <Dialog open={pending !== null} onOpenChange={(o) => { if (!o) setPending(null); }}>
        <DialogContent>
          {pending?.kind === "assign" ? (
            <>
              <DialogHeader>
                <DialogTitle>Assign this exception</DialogTitle>
                <DialogDescription>{pending.task.title} — it moves to in progress under their name.</DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="assignee">Owner</Label>
                <Select value={assignee} onValueChange={setAssignee}>
                  <SelectTrigger id="assignee" className="w-full"><SelectValue placeholder="Pick a colleague" /></SelectTrigger>
                  <SelectContent>
                    {staff.map((u) => <SelectItem key={u.id} value={u.name}>{u.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setPending(null)}>Cancel</Button>
                <Button
                  disabled={!assignee}
                  onClick={() => {
                    admin.assignTask(pending.task.id, assignee);
                    toast.success(`Assigned to ${assignee}`, { description: pending.task.title });
                    setPending(null);
                  }}
                >
                  Assign
                </Button>
              </DialogFooter>
            </>
          ) : pending?.kind === "resolve" ? (
            <>
              <DialogHeader>
                <DialogTitle>Resolve this exception</DialogTitle>
                <DialogDescription>{pending.task.title} — the note is written to the booking timeline and the audit log.</DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="resolve-note">What did you do?</Label>
                <Textarea id="resolve-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Matched the M-Pesa reference with Vodacom, booking moved to paid." />
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setPending(null)}>Cancel</Button>
                <Button
                  disabled={!note.trim()}
                  onClick={() => {
                    admin.resolveTask(pending.task.id, note.trim());
                    toast.success("Exception resolved", { description: pending.task.title });
                    setPending(null);
                    setNote("");
                  }}
                >
                  Resolve
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
