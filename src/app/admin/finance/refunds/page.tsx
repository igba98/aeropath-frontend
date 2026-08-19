"use client";

import { useMemo, useState } from "react";
import { BadgeCheck, Ban, CheckCircle2, Coins, Gift, ShieldAlert, UserCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, StatTile } from "@/components/chrome/console-shell";
import { EmptyState } from "@/components/shared/empty-state";
import { MoneyText } from "@/components/shared/money-text";
import { Pill } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSession } from "@/hooks/use-session";
import { useStore } from "@/lib/store";
import { bookingOps } from "@/lib/api";
import { formatDateTime, relativeTime } from "@/lib/format";
import { ROLE_LABELS } from "@/lib/domain/permissions";
import { REFUND_THRESHOLD_LOW, REFUND_THRESHOLD_MID } from "@/lib/domain/refunds";
import type { Refund } from "@/lib/domain/types";
import { AccessDenied, Field, KeyValue, Note, Section } from "@/features/backoffice/ui";

type Band = "none" | "officer" | "manager" | "dual";

const BANDS: Array<{ id: Band; title: string; rule: string; icon: typeof Coins }> = [
  { id: "none", title: "Automatic · no approval", rule: "Full refund inside the free cancellation window", icon: BadgeCheck },
  { id: "officer", title: `Officer · up to TZS ${REFUND_THRESHOLD_LOW.toLocaleString()}`, rule: "Operations Officer or Finance Officer", icon: UserCheck },
  { id: "manager", title: `Manager · TZS ${REFUND_THRESHOLD_LOW.toLocaleString()} to ${REFUND_THRESHOLD_MID.toLocaleString()}`, rule: "Operations Manager or Finance Manager. Any goodwill refund also lands here regardless of size.", icon: ShieldAlert },
  { id: "dual", title: `Dual approval · above TZS ${REFUND_THRESHOLD_MID.toLocaleString()}`, rule: "Finance Manager plus a second, different approver (Super Admin)", icon: Users },
];

const REASON_ICON: Record<Refund["reasonCode"], typeof Coins> = {
  free_window: BadgeCheck,
  supplier_rejected: Ban,
  policy_partial: Coins,
  goodwill: Gift,
  duplicate: Coins,
  other: Coins,
};

interface Verdict { ok: boolean; reason: string }

/** F03 · Refund queue. The threshold ladder from flow spec §2.5, enforced in the UI. */
export default function RefundQueueScreen() {
  const session = useSession();
  const refunds = useStore((s) => s.refunds);
  const bookings = useStore((s) => s.bookings);

  const [rejecting, setRejecting] = useState<Refund | null>(null);
  const [reason, setReason] = useState("");

  const all = useMemo(() => Object.values(refunds).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [refunds]);
  const pending = all.filter((r) => r.status === "pending_approval");
  const readyToPay = all.filter((r) => r.status === "approved" || r.status === "auto_approved");
  const history = all.filter((r) => r.status === "processed" || r.status === "rejected");

  const myUserId = session.actorUser?.id ?? session.user?.id ?? "";

  // Until the persisted store has hydrated the server and client disagree on relative times,
  // so render the skeleton in both passes — the convention every other console screen follows.
  if (!session.hydrated) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;

  if (session.hydrated && !session.can("REFUND:issue_low") && !session.can("FINANCE:view") && !session.can("LEDGER:view")) {
    return <AccessDenied what="Refund queue" needs={`${session.roleLabel} cannot see refunds. Sign in as an Operations Officer/Manager, Finance Officer/Manager or Auditor.`} />;
  }

  /** The ladder, expressed against the signed in role. Refusals always explain themselves. */
  function canApprove(r: Refund): Verdict {
    if (!session.hydrated) return { ok: false, reason: "Loading session" };
    if (r.approvals.some((a) => a.userId === myUserId)) {
      return { ok: false, reason: r.requiredApprover === "dual" ? "You have already approved this. Dual approval needs a second, different person." : "You have already approved this refund." };
    }
    switch (r.requiredApprover) {
      case "none":
        return { ok: false, reason: "Automatic refund — nothing to approve." };
      case "officer":
        return session.can("REFUND:issue_low")
          ? { ok: true, reason: `${session.roleLabel} may approve refunds up to TZS ${REFUND_THRESHOLD_LOW.toLocaleString()}.` }
          : { ok: false, reason: `${session.roleLabel} has no REFUND:issue_low permission.` };
      case "manager":
        return session.can("REFUND:issue_mid") || session.can("REFUND:goodwill")
          ? { ok: true, reason: `${session.roleLabel} may approve manager band refunds.` }
          : { ok: false, reason: `${session.roleLabel} may only approve refunds up to TZS ${REFUND_THRESHOLD_LOW.toLocaleString()}. This one needs an Operations Manager or Finance Manager.` };
      case "dual":
        return session.can("REFUND:issue_high")
          ? { ok: true, reason: `${session.roleLabel} may approve above TZS ${REFUND_THRESHOLD_MID.toLocaleString()}, but a second approver is still required.` }
          : { ok: false, reason: `${session.roleLabel} cannot approve above TZS ${REFUND_THRESHOLD_MID.toLocaleString()}. This needs a Finance Manager and a second approver.` };
    }
  }

  function approvalsNeeded(r: Refund) {
    return r.requiredApprover === "dual" ? 2 : 1;
  }

  function approve(r: Refund) {
    const v = canApprove(r);
    if (!v.ok) {
      toast.error("Approval refused", { description: v.reason });
      return;
    }
    bookingOps.approveRefund(r.id);
    const need = approvalsNeeded(r);
    const have = r.approvals.length + 1;
    toast.success(have >= need ? "Refund approved" : `Approval ${have} of ${need} recorded`, {
      description: have >= need ? "Now process it to post the ledger entries and pay the customer." : "A second, different approver must sign off before this can be processed.",
    });
  }

  function process(r: Refund) {
    if (r.status !== "approved" && r.status !== "auto_approved") {
      toast.error("Cannot process yet", { description: "A refund must be approved (or automatic) before money moves." });
      return;
    }
    bookingOps.processRefund(r.id);
    toast.success("Refund processed", { description: `TZS ${r.amountMinor.toLocaleString()} · ledger posted, customer notified by SMS.` });
  }

  function reject() {
    if (!rejecting) return;
    bookingOps.rejectRefund(rejecting.id, reason.trim() || "No reason given");
    toast.success("Refund rejected", { description: `${bookings[rejecting.bookingId]?.reference ?? ""} · reason recorded in the audit log.` });
    setRejecting(null);
    setReason("");
  }

  function RefundCard({ r }: { r: Refund }) {
    const b = bookings[r.bookingId];
    const v = canApprove(r);
    const need = approvalsNeeded(r);
    const Icon = REASON_ICON[r.reasonCode];
    const ready = r.status === "approved" || r.status === "auto_approved";
    return (
      <li className="rounded-xl border bg-background p-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm font-semibold">{b?.reference ?? r.bookingId}</span>
              <Pill tone={r.reasonCode === "goodwill" ? "warning" : "neutral"} icon={Icon}>{r.reasonCode.replace("_", " ")}</Pill>
              <Pill tone={r.status === "processed" ? "success" : r.status === "rejected" ? "danger" : ready ? "info" : "warning"}>{r.status.replace("_", " ")}</Pill>
            </div>
            <p className="mt-1 max-w-2xl text-xs text-muted-foreground">{r.reason}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Raised {relativeTime(r.createdAt)} · {b?.leadTraveller ? `${b.leadTraveller.firstName} ${b.leadTraveller.lastName}` : "—"} · {b?.buyerType ?? "consumer"}
            </p>
          </div>
          <div className="text-right">
            <MoneyText minor={r.amountMinor} currency={r.currency} />
            <p className="text-[11px] text-muted-foreground">of <MoneyText minor={b?.totalMinor ?? 0} size="xs" showCurrency={false} /> paid</p>
          </div>
        </div>

        {r.approvals.length ? (
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {r.approvals.map((a) => (
              <li key={`${a.userId}-${a.at}`} className="inline-flex items-center gap-1 rounded-full border bg-success/10 px-2 py-0.5 text-[11px]">
                <CheckCircle2 className="size-3 text-success" aria-hidden />
                {a.name} · {ROLE_LABELS[a.role]} · {formatDateTime(a.at)}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {r.status === "pending_approval" ? (
            <>
              <Button size="sm" onClick={() => approve(r)} disabled={!v.ok}>
                <CheckCircle2 className="size-4" aria-hidden /> Approve {need > 1 ? `(${r.approvals.length}/${need})` : ""}
              </Button>
              <Button size="sm" variant="outline" onClick={() => { setRejecting(r); setReason(""); }}>
                <Ban className="size-4" aria-hidden /> Reject
              </Button>
            </>
          ) : null}
          <Button size="sm" variant={ready ? "default" : "outline"} onClick={() => process(r)} disabled={!ready}>
            <Coins className="size-4" aria-hidden /> Process refund
          </Button>
          <span className={`text-[11px] ${v.ok || r.status !== "pending_approval" ? "text-muted-foreground" : "text-destructive"}`}>
            {r.status === "pending_approval" ? v.reason : ready ? "Approved — processing posts the ledger entries and pays the customer." : `Closed ${formatDateTime(r.updatedAt)}`}
          </span>
        </div>
      </li>
    );
  }

  return (
    <div>
      <PageHeader
        title="Refund queue"
        code="F03"
        description="Refunds are banded by amount. The band decides who may approve, and the UI refuses anything above the signed in role — with the reason on screen."
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Pending approval" value={pending.length} tone={pending.length ? "warning" : "success"} hint="Across all four bands" icon={ShieldAlert} />
        <StatTile label="Value pending" value={<MoneyText minor={pending.reduce((s, r) => s + r.amountMinor, 0)} compact />} />
        <StatTile label="Approved, not yet paid" value={readyToPay.length} hint="Ready to process" icon={CheckCircle2} />
        <StatTile label="Signed in as" value={session.roleLabel} hint={`Approvals recorded against ${session.actorUser?.name ?? "you"}`} icon={UserCheck} />
      </div>

      <Note title="The ladder">
        Free-window refunds process themselves. Up to TZS {REFUND_THRESHOLD_LOW.toLocaleString()} an officer signs. Between that and
        TZS {REFUND_THRESHOLD_MID.toLocaleString()} a manager signs. Above it, two different people must sign — the same person clicking
        twice does not count. Any goodwill refund is a manager decision no matter how small, because it sits outside policy and needs a
        reason code.
      </Note>

      <div className="mt-4 space-y-4">
        {BANDS.map((band) => {
          const rows = pending.filter((r) => r.requiredApprover === band.id);
          const value = rows.reduce((s, r) => s + r.amountMinor, 0);
          return (
            <Section
              key={band.id}
              title={band.title}
              description={band.rule}
              actions={<div className="flex items-center gap-2"><Pill tone={rows.length ? "warning" : "neutral"} icon={band.icon}>{rows.length} pending</Pill>{rows.length ? <MoneyText minor={value} size="sm" compact /> : null}</div>}
            >
              {rows.length ? (
                <ul className="space-y-2">{rows.map((r) => <RefundCard key={r.id} r={r} />)}</ul>
              ) : (
                <p className="text-sm text-muted-foreground">Nothing waiting in this band.</p>
              )}
            </Section>
          );
        })}

        {readyToPay.length ? (
          <Section title="Approved · awaiting payment" description="Processing posts the double entry and sends the customer an SMS.">
            <ul className="space-y-2">{readyToPay.map((r) => <RefundCard key={r.id} r={r} />)}</ul>
          </Section>
        ) : null}

        <Section title="Closed refunds" description="Processed and rejected refunds stay visible — refunds are never deleted.">
          {history.length ? (
            <ul className="space-y-2">{history.map((r) => <RefundCard key={r.id} r={r} />)}</ul>
          ) : (
            <EmptyState icon={Coins} title="Nothing closed yet" description="Approve and process a refund and it will land here." />
          )}
        </Section>
      </div>

      <Dialog open={Boolean(rejecting)} onOpenChange={(v) => { if (!v) setRejecting(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject refund</DialogTitle>
            <DialogDescription>The reason is appended to the refund and written to the audit log. The customer keeps their original booking terms.</DialogDescription>
          </DialogHeader>
          {rejecting ? (
            <div className="rounded-xl border bg-muted/40 p-3">
              <KeyValue label="Booking">{bookings[rejecting.bookingId]?.reference ?? rejecting.bookingId}</KeyValue>
              <KeyValue label="Amount"><MoneyText minor={rejecting.amountMinor} size="sm" /></KeyValue>
              <KeyValue label="Band">{rejecting.requiredApprover}</KeyValue>
            </div>
          ) : null}
          <Field label="Reason" htmlFor="rej-reason">
            <Textarea id="rej-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Cancellation was outside the policy window and the supplier has already been paid." />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)}>Cancel</Button>
            <Button variant="destructive" onClick={reject} disabled={!reason.trim()}>Reject refund</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
