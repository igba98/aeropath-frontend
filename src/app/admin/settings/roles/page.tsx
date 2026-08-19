"use client";

import { useState } from "react";
import { KeyRound, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, StatTile } from "@/components/chrome/console-shell";
import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { Pill } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSession } from "@/hooks/use-session";
import { useStore } from "@/lib/store";
import { admin } from "@/lib/api";
import { ROLE_LABELS } from "@/lib/domain/permissions";
import { formatDate } from "@/lib/format";
import type { RoleId, Scope, User } from "@/lib/domain/types";

interface GrantRow { user: User; roleId: RoleId; scope: Scope; expiresAt?: string | null }

/**
 * X02 · Role grants.
 * Roles are grants, not identities: a user record holds no role, a grant links a user to a role
 * within a scope. One person can be Agent Admin for org A and Corporate Approver for org B.
 */
export default function RoleGrantsPage() {
  const s = useSession();
  const users = useStore((st) => st.users);
  const organisations = useStore((st) => st.organisations);
  const [form, setForm] = useState({ userId: "", roleId: "traveller" as RoleId, scopeKind: "platform", scopeId: "", expiresAt: "" });

  if (!s.hydrated) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;
  const canManage = s.can("ROLE:grant");

  const rows: GrantRow[] = Object.values(users).flatMap((u) => u.grants.map((g) => ({ user: u, roleId: g.roleId, scope: g.scope, expiresAt: g.expiresAt })));
  const scoped = rows.filter((r) => r.scope.kind !== "platform");

  const columns: Column<GrantRow>[] = [
    { key: "user", header: "User", render: (r) => <span><span className="block font-medium">{r.user.name}</span><span className="block text-xs text-muted-foreground">{r.user.email}</span></span> },
    { key: "role", header: "Role", render: (r) => <Pill tone="brand">{ROLE_LABELS[r.roleId]}</Pill> },
    {
      key: "scope", header: "Scope",
      render: (r) => (
        <span className="font-mono text-xs">
          {r.scope.kind === "platform" ? <span className="rounded bg-destructive/10 px-1.5 py-0.5 text-destructive">platform</span>
            : <span className="rounded bg-muted px-1.5 py-0.5">{r.scope.kind}:{organisations[r.scope.id]?.name ?? r.scope.id}</span>}
        </span>
      ),
    },
    { key: "expires", header: "Expires", render: (r) => <span className="text-xs text-muted-foreground">{r.expiresAt ? formatDate(r.expiresAt) : "never"}</span> },
    {
      key: "actions", header: "", className: "text-right",
      render: (r) => (
        <Button
          variant="ghost" size="sm" disabled={!canManage} className="gap-1.5 text-muted-foreground hover:text-destructive"
          onClick={() => { admin.revokeRole(r.user.id, r.roleId); toast.success("Grant revoked", { description: `${ROLE_LABELS[r.roleId]} removed from ${r.user.name}.` }); }}
        >
          <Trash2 className="size-3.5" aria-hidden /> Revoke
        </Button>
      ),
    },
  ];

  function grant() {
    if (!form.userId) return toast.error("Choose a user");
    if (form.scopeKind !== "platform" && !form.scopeId) return toast.error("A scoped grant needs a target organisation");
    const scope: Scope = form.scopeKind === "platform" ? { kind: "platform" }
      : form.scopeKind === "supplier" ? { kind: "supplier", id: form.scopeId }
      : form.scopeKind === "region" ? { kind: "region", id: form.scopeId }
      : { kind: "organisation", id: form.scopeId };
    admin.grantRole(form.userId, { roleId: form.roleId, scope, expiresAt: form.expiresAt || null });
    toast.success("Role granted", { description: `${ROLE_LABELS[form.roleId]} within ${form.scopeKind} scope.` });
    setForm({ userId: "", roleId: "traveller", scopeKind: "platform", scopeId: "", expiresAt: "" });
  }

  return (
    <>
      <PageHeader
        title="Role grants"
        code="X02"
        description="A user record holds no role. Every grant links a user to a role inside an explicit scope, and deny always beats allow."
        actions={canManage ? (
          <Dialog>
            <DialogTrigger asChild><Button className="gap-1.5"><Plus className="size-4" aria-hidden /> Grant a role</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Grant a role</DialogTitle></DialogHeader>
              <div className="grid gap-3">
                <div>
                  <Label htmlFor="g-user">User</Label>
                  <Select value={form.userId} onValueChange={(v) => setForm({ ...form, userId: v })}>
                    <SelectTrigger id="g-user" className="mt-1"><SelectValue placeholder="Choose a user" /></SelectTrigger>
                    <SelectContent>{Object.values(users).sort((a, b) => a.name.localeCompare(b.name)).map((u) => <SelectItem key={u.id} value={u.id}>{u.name} · {u.email}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="g-role">Role</Label>
                  <Select value={form.roleId} onValueChange={(v) => setForm({ ...form, roleId: v as RoleId })}>
                    <SelectTrigger id="g-role" className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{(Object.keys(ROLE_LABELS) as RoleId[]).filter((r) => r !== "guest").map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="g-kind">Scope</Label>
                    <Select value={form.scopeKind} onValueChange={(v) => setForm({ ...form, scopeKind: v, scopeId: "" })}>
                      <SelectTrigger id="g-kind" className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="platform">platform</SelectItem>
                        <SelectItem value="organisation">organisation</SelectItem>
                        <SelectItem value="supplier">supplier</SelectItem>
                        <SelectItem value="region">region</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="g-target">Target</Label>
                    {form.scopeKind === "region" ? (
                      <Input id="g-target" value={form.scopeId} onChange={(e) => setForm({ ...form, scopeId: e.target.value })} placeholder="Arusha" className="mt-1" />
                    ) : (
                      <Select value={form.scopeId} onValueChange={(v) => setForm({ ...form, scopeId: v })} disabled={form.scopeKind === "platform"}>
                        <SelectTrigger id="g-target" className="mt-1"><SelectValue placeholder={form.scopeKind === "platform" ? "n/a" : "Choose"} /></SelectTrigger>
                        <SelectContent>
                          {Object.values(organisations)
                            .filter((o) => (form.scopeKind === "supplier" ? o.type === "supplier" : o.type !== "supplier"))
                            .map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
                <div>
                  <Label htmlFor="g-exp">Expires (optional)</Label>
                  <Input id="g-exp" type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} className="mt-1" />
                  <p className="mt-1 text-xs text-muted-foreground">Temporary elevation should always carry an expiry.</p>
                </div>
              </div>
              <DialogFooter><Button onClick={grant}>Grant role</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        ) : null}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatTile label="Active grants" value={rows.length} icon={KeyRound} />
        <StatTile label="Scoped grants" value={scoped.length} hint="Bound to one organisation or supplier" icon={ShieldCheck} />
        <StatTile label="Platform scope" value={rows.length - scoped.length} hint="Unrestricted — keep this number small" tone={rows.length - scoped.length > 12 ? "warning" : "default"} />
      </div>

      <DataTable columns={columns} rows={rows} rowKey={(r) => `${r.user.id}-${r.roleId}-${r.scope.kind}`} caption="Role grants" empty={<EmptyState title="No grants" />} />

      <p className="mt-3 rounded-xl border bg-card p-4 text-xs text-muted-foreground">
        A Supply Manager scoped to <span className="font-mono">region:Arusha</span> cannot touch Zanzibar suppliers.
        Scope is always passed explicitly to the permission guard and never inferred from the resource being touched —
        that is what prevents scope-confusion privilege escalation.
      </p>
    </>
  );
}
