"use client";

import { AlertTriangle, Flag, FlaskConical, KeyRound, Power } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, StatTile } from "@/components/chrome/console-shell";
import { Pill } from "@/components/shared/status-chip";
import { Switch } from "@/components/ui/switch";
import { useSession } from "@/hooks/use-session";
import { useStore } from "@/lib/store";
import { useIsPast } from "@/hooks/use-now";
import { admin } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { FeatureFlag } from "@/lib/domain/types";

const KIND_META = {
  release: { label: "Release", icon: Flag, body: "Removed after full rollout. Days, not months." },
  experiment: { label: "Experiment", icon: FlaskConical, body: "Removed once the decision is made." },
  permission: { label: "Permission", icon: KeyRound, body: "Permanent. Enables a capability for an organisation." },
  kill_switch: { label: "Kill switch", icon: Power, body: "Permanent. A thirty second rollback with no deploy." },
} as const;

/** X06 · Feature flags. Every user-visible change ships behind one; a flag flip is the fastest rollback we have. */
export default function FeatureFlagsPage() {
  const s = useSession();
  const flags = useStore((st) => st.flags);
  const isPast = useIsPast();

  if (!s.hydrated) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;
  const canManage = s.can("FLAGS:manage");

  const all = Object.values(flags);
  const expired = all.filter((f) => isPast(f.expiresAt));
  const groups = (["release", "experiment", "permission", "kill_switch"] as const).map((k) => ({ kind: k, items: all.filter((f) => f.kind === k) }));

  return (
    <>
      <PageHeader title="Feature flags" code="X06" description="Flag debt compounds faster than code debt, so release and experiment flags carry an expiry and a past-due flag fails the build." />

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <StatTile label="Flags" value={all.length} icon={Flag} />
        <StatTile label="Enabled" value={all.filter((f) => f.enabled).length} tone="success" />
        <StatTile label="Kill switches off" value={all.filter((f) => f.kind === "kill_switch" && !f.enabled).length} tone={all.some((f) => f.kind === "kill_switch" && !f.enabled) ? "warning" : "default"} />
        <StatTile label="Past expiry" value={expired.length} tone={expired.length ? "danger" : "default"} icon={AlertTriangle} />
      </div>

      {expired.length ? (
        <div className="mb-4 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="flex items-center gap-1.5 font-medium text-destructive"><AlertTriangle className="size-4" aria-hidden /> {expired.length} flag{expired.length === 1 ? "" : "s"} past expiry</p>
          <p className="mt-0.5 text-muted-foreground">In CI these fail the build. Remove the flag and the dead branch behind it: {expired.map((f) => f.key).join(", ")}.</p>
        </div>
      ) : null}

      <div className="space-y-5">
        {groups.map(({ kind, items }) => {
          if (!items.length) return null;
          const meta = KIND_META[kind];
          return (
            <section key={kind}>
              <div className="mb-2 flex items-baseline gap-2">
                <h2 className="flex items-center gap-1.5 font-medium"><meta.icon className="size-4" aria-hidden /> {meta.label}</h2>
                <p className="text-xs text-muted-foreground">{meta.body}</p>
              </div>
              <div className="space-y-2">
                {items.map((f) => <FlagRow key={f.key} flag={f} canManage={canManage} />)}
              </div>
            </section>
          );
        })}
      </div>

      <p className="mt-5 rounded-xl border bg-card p-4 text-xs text-muted-foreground">
        The <span className="font-mono">payment.rail.*</span> kill switches are live: turning one off removes that rail from the
        traveller payment screen immediately, with no deploy. That is the intended response when a provider degrades.
      </p>
    </>
  );
}

function FlagRow({ flag, canManage }: { flag: FeatureFlag; canManage: boolean }) {
  const isPast = useIsPast();
  const isExpired = isPast(flag.expiresAt);
  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4", isExpired && "border-destructive/40")}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <code className="font-mono text-sm font-medium">{flag.key}</code>
          {flag.enabled ? <Pill tone="success">On</Pill> : <Pill tone="neutral">Off</Pill>}
          {isExpired ? <Pill tone="danger">Past expiry</Pill> : null}
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">{flag.description}</p>
        {flag.expiresAt ? <p className="text-[11px] text-muted-foreground">Expires {formatDate(flag.expiresAt)}</p> : null}
      </div>
      <Switch
        checked={flag.enabled}
        disabled={!canManage}
        onCheckedChange={(v) => { admin.toggleFlag(flag.key, v); toast.success(`${flag.key} ${v ? "enabled" : "disabled"}`, { description: flag.kind === "kill_switch" ? "Takes effect immediately across every surface." : undefined }); }}
        aria-label={`Toggle ${flag.key}`}
      />
    </div>
  );
}
