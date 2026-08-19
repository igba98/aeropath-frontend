"use client";

import { useState } from "react";
import { Database, Info, KeyRound, Lock } from "lucide-react";
import { PageHeader, StatTile } from "@/components/chrome/console-shell";
import { Pill } from "@/components/shared/status-chip";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSession } from "@/hooks/use-session";
import { ROLE_LABELS, ROLE_PERMISSIONS } from "@/lib/domain/permissions";
import type { RoleId } from "@/lib/domain/types";

const DOMAINS = ["BOOKING", "INVENTORY", "PRICING", "PAYMENT", "REFUND", "PAYOUT", "USER", "ORGANISATION", "CONTENT", "REPORT", "SETTINGS", "AUDIT"] as const;
const VERBS = ["view", "create", "edit", "delete", "approve", "export", "impersonate"] as const;

/** X03 · Role builder. Bundle definitions live in the database so they change without a deploy. */
export default function RoleBuilderPage() {
  const s = useSession();
  const [role, setRole] = useState<RoleId>("ops_manager");
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  if (!s.hydrated) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;

  if (s.roleId !== "super_admin") {
    return (
      <>
        <PageHeader title="Role builder" code="X03" description="Define what each role can do." />
        <div className="rounded-xl border border-warning/40 bg-warning/5 p-6">
          <p className="flex items-center gap-1.5 font-medium"><Lock className="size-4" aria-hidden /> Super Admin only</p>
          <p className="mt-1 text-sm text-muted-foreground">
            You are signed in as {s.roleLabel}. Editing role definitions is the one permission that never delegates —
            a role that can widen its own role is not a boundary. Sign in as Ignas Bangi (Super Admin) to view it.
          </p>
        </div>
      </>
    );
  }

  const perms = ROLE_PERMISSIONS[role] ?? [];
  const wildcard = perms.includes("*");
  const has = (d: string, v: string) => {
    const key = `${d}:${v}`;
    if (key in overrides) return overrides[key];
    if (wildcard) return true;
    return perms.some((p) => p === key || p.startsWith(`${d}:${v}`));
  };
  const granted = DOMAINS.flatMap((d) => VERBS.filter((v) => has(d, v)).map((v) => `${d}:${v}`));

  return (
    <>
      <PageHeader title="Role builder" code="X03" description="Roles are named bundles of permissions; permissions are verbs on resources. Deny always beats allow." />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatTile label="Roles defined" value={Object.keys(ROLE_LABELS).length} icon={KeyRound} />
        <StatTile label="Permissions in this bundle" value={wildcard ? "all" : granted.length} />
        <StatTile label="Storage" value="Database" hint="Editable without a deploy" icon={Database} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium" htmlFor="role-pick">Role</label>
        <Select value={role} onValueChange={(v) => { setRole(v as RoleId); setOverrides({}); }}>
          <SelectTrigger id="role-pick" className="w-64"><SelectValue /></SelectTrigger>
          <SelectContent>{(Object.keys(ROLE_LABELS) as RoleId[]).map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
        </Select>
        {wildcard ? <Pill tone="danger">Wildcard — every permission</Pill> : null}
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[720px] text-sm">
          <caption className="sr-only">Permission matrix for {ROLE_LABELS[role]}</caption>
          <thead>
            <tr className="border-b bg-muted/50">
              <th scope="col" className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Domain</th>
              {VERBS.map((v) => <th key={v} scope="col" className="px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">{v}</th>)}
            </tr>
          </thead>
          <tbody>
            {DOMAINS.map((d) => (
              <tr key={d} className="border-b last:border-0">
                <th scope="row" className="px-3 py-2 text-left font-mono text-xs font-medium">{d}</th>
                {VERBS.map((v) => (
                  <td key={v} className="px-3 py-2 text-center">
                    <Checkbox
                      checked={has(d, v)}
                      onCheckedChange={(c) => setOverrides((o) => ({ ...o, [`${d}:${v}`]: Boolean(c) }))}
                      aria-label={`${d} ${v} for ${ROLE_LABELS[role]}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 rounded-xl border bg-card p-4">
        <p className="flex items-center gap-1.5 text-sm font-medium"><Info className="size-4" aria-hidden /> How this works in production</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Bundle definitions are database rows, not code, so a role can be reshaped without a release. The change is written to the
          audit log with the before and after bundle, and takes effect on the next permission resolution — no session needs to be recycled.
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          In this prototype the matrix reflects the live bundles in <span className="font-mono">packages/auth</span> and your ticks are
          local — the write path is deliberately not wired, because silently widening a role from a demo would be the wrong default.
        </p>
      </div>

      <div className="mt-4 rounded-xl border bg-card p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Resolved bundle for {ROLE_LABELS[role]}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {wildcard ? <code className="rounded bg-destructive/10 px-1.5 py-0.5 font-mono text-[11px] text-destructive">*</code>
            : perms.map((p) => <code key={p} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">{p}</code>)}
        </div>
      </div>
    </>
  );
}
