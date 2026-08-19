"use client";

import { Eye, EyeOff, Lock, ShieldAlert, Timer } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, StatTile } from "@/components/chrome/console-shell";
import { EmptyState } from "@/components/shared/empty-state";
import { Pill } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";
import { useStore } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";
import { auth } from "@/lib/api";
import { INTERNAL_ROLES, ROLE_LABELS } from "@/lib/domain/permissions";
import { formatDateTime, initials, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/** U04 · Read-only impersonation, with the rules stated where the power is exercised. */
export default function ImpersonationPage() {
  const s = useSession();
  const users = useStore((st) => st.users);
  const audit = useStore(useShallow((st) => st.audit.filter((a) => a.action.startsWith("IMPERSONATION"))));

  if (!s.hydrated) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;
  const canImpersonate = s.can("USER:impersonate");

  // Never available for anyone holding a finance or admin role.
  const eligible = Object.values(users).filter((u) => {
    const role = u.grants[0]?.roleId ?? "traveller";
    const isPrivileged = role.startsWith("finance") || role === "platform_admin" || role === "super_admin" || role === "auditor";
    return !isPrivileged && u.status === "active";
  });

  return (
    <>
      <PageHeader title="Impersonation" code="U04" description="See exactly what a customer sees, without being able to change anything on their behalf." />

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <StatTile label="Eligible users" value={eligible.length} icon={Eye} />
        <StatTile label="Sessions logged" value={audit.length} icon={ShieldAlert} />
        <StatTile label="Session cap" value="30 min" hint="Then it ends automatically" icon={Timer} />
        <StatTile label="Write access" value="None" hint="Enforced by a request-context flag" tone="success" icon={Lock} />
      </div>

      <section className="mb-5 rounded-xl border border-warning/40 bg-warning/5 p-4">
        <h2 className="flex items-center gap-1.5 font-medium"><ShieldAlert className="size-4 text-warning" aria-hidden /> The rules</h2>
        <ul className="mt-2 grid gap-1.5 text-sm text-muted-foreground sm:grid-cols-2">
          <li>Read only — the guard rejects every write while a session is active, not just the UI.</li>
          <li>A persistent red banner is shown and cannot be dismissed.</li>
          <li>Sessions are capped at 30 minutes and end automatically.</li>
          <li>Every request writes an audit row carrying both the actor and the subject.</li>
          <li>Never available for anyone holding a finance or admin role.</li>
          <li>Support and Platform Admin only — Operations Officers cannot impersonate.</li>
        </ul>
      </section>

      {s.impersonating ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
          <p className="flex items-center gap-2 text-sm">
            <Eye className="size-4 text-destructive" aria-hidden />
            Currently viewing as <strong>{s.user?.name}</strong>. Started {s.impersonating ? "just now" : ""}.
          </p>
          <Button variant="outline" className="gap-1.5" onClick={() => { auth.stopImpersonation(); toast.info("Impersonation ended"); }}>
            <EyeOff className="size-4" aria-hidden /> End session
          </Button>
        </div>
      ) : null}

      {!canImpersonate ? (
        <div className="mb-4 rounded-xl border border-warning/40 bg-warning/5 p-4 text-sm">
          <p className="font-medium">Not available to your role</p>
          <p className="mt-0.5 text-muted-foreground">Signed in as {s.roleLabel}. Impersonation is limited to Support, Operations Manager, Platform Admin and Super Admin.</p>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <section>
          <h2 className="mb-2 font-medium">Eligible users</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {eligible.map((u) => (
              <div key={u.id} className="flex items-center gap-3 rounded-xl border bg-card p-3">
                <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-xs font-semibold text-white", u.avatarTone)}>{initials(u.name)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{u.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">{ROLE_LABELS[u.grants[0]?.roleId ?? "traveller"]} · {u.email}</span>
                </span>
                <Button
                  size="sm" variant="outline" disabled={!canImpersonate || s.impersonating}
                  onClick={() => { auth.impersonate(u.id); toast.warning(`Now viewing as ${u.name}`, { description: "Read only. Every request is audited." }); }}
                >
                  View as
                </Button>
              </div>
            ))}
          </div>
          {INTERNAL_ROLES.length ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Users holding finance, audit or admin roles are deliberately absent from this list — impersonating them would
              be a privilege escalation path, not a support tool.
            </p>
          ) : null}
        </section>

        <aside>
          <div className="rounded-xl border bg-card p-4">
            <h2 className="text-sm font-medium">Recent impersonation activity</h2>
            {audit.length === 0 ? (
              <EmptyState title="No sessions yet" className="mt-2 py-6" />
            ) : (
              <ol className="mt-2 space-y-2">
                {audit.slice(0, 10).map((a) => (
                  <li key={a.id} className="border-b pb-2 last:border-0 last:pb-0">
                    <p className="flex items-center gap-1.5 text-sm">
                      <Pill tone={a.action === "IMPERSONATION_STARTED" ? "warning" : "neutral"}>{a.action === "IMPERSONATION_STARTED" ? "Started" : "Ended"}</Pill>
                      <span className="truncate">{a.actorName}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      subject <span className="font-mono">{users[a.resourceId]?.name ?? a.resourceId}</span> · {relativeTime(a.createdAt)}
                    </p>
                    <p className="font-mono text-[10px] text-muted-foreground">{formatDateTime(a.createdAt)} · {a.ip}</p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
