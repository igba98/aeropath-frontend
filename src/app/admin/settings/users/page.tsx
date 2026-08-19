"use client";

import { useState } from "react";
import { Plus, Search, ShieldOff, UserCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, StatTile } from "@/components/chrome/console-shell";
import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { Pill } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSession } from "@/hooks/use-session";
import { useStore } from "@/lib/store";
import { admin } from "@/lib/api";
import { ROLE_LABELS, INTERNAL_ROLES, SUPPLIER_ROLES } from "@/lib/domain/permissions";
import { initials, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { RoleId, User } from "@/lib/domain/types";

/** X01 · Users. One directory across every actor type on the platform. */
export default function AdminUsersPage() {
  const s = useSession();
  const users = useStore((st) => st.users);
  const organisations = useStore((st) => st.organisations);
  const [q, setQ] = useState("");
  const [group, setGroup] = useState("all");
  const [invite, setInvite] = useState({ name: "", email: "", phone: "", roleId: "traveller" as RoleId, organisationId: "" });

  if (!s.hydrated) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;
  const canManage = s.can("USER:manage");

  const groupOf = (u: User): string => {
    const r = u.grants[0]?.roleId ?? "traveller";
    if (INTERNAL_ROLES.includes(r)) return "internal";
    if (SUPPLIER_ROLES.includes(r)) return "supplier";
    return "traveller";
  };

  const all = Object.values(users);
  const rows = all.filter((u) => {
    if (group !== "all" && groupOf(u) !== group) return false;
    if (!q) return true;
    const hay = `${u.name} ${u.email} ${u.phone} ${organisations[u.organisationId ?? ""]?.name ?? ""}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  }).sort((a, b) => a.name.localeCompare(b.name));

  const columns: Column<User>[] = [
    {
      key: "name", header: "User",
      render: (u) => (
        <div className="flex items-center gap-2.5">
          <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-[11px] font-semibold text-white", u.avatarTone)}>{initials(u.name)}</span>
          <span className="min-w-0">
            <span className="block truncate font-medium">{u.name}</span>
            <span className="block truncate text-xs text-muted-foreground">{u.email}</span>
          </span>
        </div>
      ),
    },
    { key: "role", header: "Role", render: (u) => <span className="text-sm">{ROLE_LABELS[u.grants[0]?.roleId ?? "traveller"]}</span> },
    { key: "org", header: "Organisation", render: (u) => <span className="text-sm text-muted-foreground">{u.organisationId ? organisations[u.organisationId]?.name ?? "—" : "—"}</span> },
    { key: "scope", header: "Scope", render: (u) => <span className="font-mono text-[11px] text-muted-foreground">{u.grants[0] ? scopeLabel(u.grants[0].scope) : "—"}</span> },
    {
      key: "status", header: "Status",
      render: (u) => u.status === "active" ? <Pill tone="success">Active</Pill> : u.status === "invited" ? <Pill tone="warning">Invited</Pill> : <Pill tone="danger">Suspended</Pill>,
    },
    { key: "seen", header: "Last active", render: (u) => <span className="text-xs text-muted-foreground">{relativeTime(u.lastActiveAt)}</span> },
    {
      key: "actions", header: "", className: "text-right",
      render: (u) => (
        <Button
          variant="ghost" size="sm" disabled={!canManage}
          onClick={() => { const next = u.status === "suspended" ? "active" : "suspended"; admin.setUserStatus(u.id, next); toast.success(next === "active" ? `${u.name} reactivated` : `${u.name} suspended`); }}
        >
          {u.status === "suspended" ? "Reactivate" : "Suspend"}
        </Button>
      ),
    },
  ];

  const orgOptions = Object.values(organisations).filter((o) => o.status !== "suspended");

  return (
    <>
      <PageHeader
        title="Users"
        code="X01"
        description="Every actor type in one directory — travellers, agency staff, corporate bookers, supplier teams and internal staff."
        actions={canManage ? (
          <Dialog>
            <DialogTrigger asChild><Button className="gap-1.5"><Plus className="size-4" aria-hidden /> Invite user</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Invite a user</DialogTitle></DialogHeader>
              <div className="grid gap-3">
                <div><Label htmlFor="i-name">Full name</Label><Input id="i-name" value={invite.name} onChange={(e) => setInvite({ ...invite, name: e.target.value })} className="mt-1" /></div>
                <div><Label htmlFor="i-email">Email</Label><Input id="i-email" type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} className="mt-1" /></div>
                <div><Label htmlFor="i-phone">Phone</Label><Input id="i-phone" value={invite.phone} onChange={(e) => setInvite({ ...invite, phone: e.target.value })} placeholder="+255…" className="mt-1" /></div>
                <div>
                  <Label htmlFor="i-role">Role</Label>
                  <Select value={invite.roleId} onValueChange={(v) => setInvite({ ...invite, roleId: v as RoleId })}>
                    <SelectTrigger id="i-role" className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{(Object.keys(ROLE_LABELS) as RoleId[]).filter((r) => r !== "guest").map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS[r]}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="i-org">Organisation (scope)</Label>
                  <Select value={invite.organisationId} onValueChange={(v) => setInvite({ ...invite, organisationId: v })}>
                    <SelectTrigger id="i-org" className="mt-1"><SelectValue placeholder="Platform scope (internal staff)" /></SelectTrigger>
                    <SelectContent>{orgOptions.map((o) => <SelectItem key={o.id} value={o.id}>{o.name} · {o.type}</SelectItem>)}</SelectContent>
                  </Select>
                  <p className="mt-1 text-xs text-muted-foreground">Leaving this blank grants platform scope — only correct for internal staff.</p>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => {
                  if (!invite.name.trim() || !invite.email.trim()) return toast.error("Name and email are required");
                  admin.inviteUser({ name: invite.name.trim(), email: invite.email.trim(), phone: invite.phone.trim(), roleId: invite.roleId, organisationId: invite.organisationId || undefined });
                  toast.success("Invitation sent", { description: `${invite.name} will receive a sign-in link.` });
                  setInvite({ name: "", email: "", phone: "", roleId: "traveller", organisationId: "" });
                }}>Send invitation</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : null}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <StatTile label="Total users" value={all.length} icon={Users} />
        <StatTile label="Internal staff" value={all.filter((u) => groupOf(u) === "internal").length} icon={UserCheck} />
        <StatTile label="Invited, not active" value={all.filter((u) => u.status === "invited").length} tone={all.some((u) => u.status === "invited") ? "warning" : "default"} />
        <StatTile label="Suspended" value={all.filter((u) => u.status === "suspended").length} icon={ShieldOff} />
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, phone or organisation" className="pl-8" aria-label="Search users" />
        </div>
        <Select value={group} onValueChange={setGroup}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actor types</SelectItem>
            <SelectItem value="traveller">Travellers</SelectItem>
            <SelectItem value="supplier">Suppliers</SelectItem>
            <SelectItem value="internal">Internal</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <DataTable columns={columns} rows={rows} rowKey={(u) => u.id} caption="Platform users" empty={<EmptyState title="No users match" description="Try a different search or actor type." />} />
    </>
  );
}

function scopeLabel(scope: { kind: string; id?: string }) {
  return scope.kind === "platform" ? "platform" : `${scope.kind}:${scope.id?.slice(0, 12)}`;
}
