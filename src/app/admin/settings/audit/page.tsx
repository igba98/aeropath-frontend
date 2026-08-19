"use client";

import { useState } from "react";
import { Lock, Search, ScrollText } from "lucide-react";
import { PageHeader, StatTile } from "@/components/chrome/console-shell";
import { EmptyState } from "@/components/shared/empty-state";
import { Pill } from "@/components/shared/status-chip";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSession } from "@/hooks/use-session";
import { useStore } from "@/lib/store";
import { ROLE_LABELS } from "@/lib/domain/permissions";
import { formatDateTime, relativeTime } from "@/lib/format";
import type { RoleId } from "@/lib/domain/types";

/** X04 · Audit log. Append only, written in the same transaction as the action it records. */
export default function AuditLogPage() {
  const s = useSession();
  const audit = useStore((st) => st.audit);
  const [q, setQ] = useState("");
  const [action, setAction] = useState("all");

  if (!s.hydrated) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;

  const actions = Array.from(new Set(audit.map((a) => a.action))).sort();
  const rows = audit.filter((a) => {
    if (action !== "all" && a.action !== action) return false;
    if (!q) return true;
    return `${a.actorName} ${a.action} ${a.resourceType} ${a.resourceId} ${a.scope}`.toLowerCase().includes(q.toLowerCase());
  });

  const denied = audit.filter((a) => a.action === "PERMISSION_DENIED").length;
  const impersonations = audit.filter((a) => a.action.startsWith("IMPERSONATION")).length;

  return (
    <>
      <PageHeader
        title="Audit log"
        code="X04"
        description="Every privileged action, with the actor, the role used, the scope and the before and after state."
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <StatTile label="Entries" value={audit.length} icon={ScrollText} />
        <StatTile label="Permission denials" value={denied} hint="Attempts blocked by the guard" tone={denied ? "warning" : "default"} />
        <StatTile label="Impersonation events" value={impersonations} />
        <StatTile label="Retention" value="7 years" hint="Append only, never edited" icon={Lock} />
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search actor, resource or scope" className="pl-8" aria-label="Search audit log" />
        </div>
        <Select value={action} onValueChange={setAction}>
          <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actions</SelectItem>
            {actions.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="No entries match" description="Try a broader search or a different action." />
      ) : (
        <ol className="space-y-2">
          {rows.map((a) => (
            <li key={a.id} className="rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Pill tone={a.action === "PERMISSION_DENIED" ? "danger" : a.action.startsWith("IMPERSONATION") ? "warning" : "brand"}>{a.action}</Pill>
                    <span className="text-sm font-medium">{a.actorName}</span>
                    <span className="text-xs text-muted-foreground">as {ROLE_LABELS[a.roleUsed as RoleId] ?? a.roleUsed}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    <span className="font-mono">{a.resourceType}</span> · <span className="font-mono">{a.resourceId}</span> · scope <span className="font-mono">{a.scope}</span>
                  </p>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <p>{formatDateTime(a.createdAt)}</p>
                  <p>{relativeTime(a.createdAt)}</p>
                  <p className="font-mono">{a.ip}</p>
                </div>
              </div>
              {(a.before || a.after) ? (
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <div className="rounded-lg bg-destructive/5 p-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Before</p>
                    <pre className="mt-1 overflow-x-auto font-mono text-[11px] text-muted-foreground">{a.before ? JSON.stringify(a.before, null, 2) : "—"}</pre>
                  </div>
                  <div className="rounded-lg bg-success/5 p-2.5">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">After</p>
                    <pre className="mt-1 overflow-x-auto font-mono text-[11px] text-muted-foreground">{a.after ? JSON.stringify(a.after, null, 2) : "—"}</pre>
                  </div>
                </div>
              ) : null}
              <p className="mt-2 font-mono text-[10px] text-muted-foreground">request {a.requestId}</p>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
