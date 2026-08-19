"use client";

import { useState } from "react";
import { Ban, RotateCcw, UserPlus, Users } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/chrome/console-shell";
import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { Pill } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useStore } from "@/lib/store";
import { admin } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { ROLE_LABELS } from "@/lib/domain/permissions";
import { AdminOnly, NotSupplier, useSupplierContext } from "@/features/supplier/shared";
import type { RoleId, User } from "@/lib/domain/types";

/** S11 · Supplier staff directory. Supplier Admin only (§2.4). */
export default function SupplierUsersPage() {
  const { org, hydrated, isAdmin } = useSupplierContext();
  const users = useStore((s) => s.users);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [roleId, setRoleId] = useState<RoleId>("supplier_staff");

  if (!hydrated) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!org) {
    return (
      <>
        <PageHeader title="Users" code="S11" description="Who in your team can see the console, and what they can do." />
        <NotSupplier what="The user directory" />
      </>
    );
  }
  if (!isAdmin) {
    return (
      <>
        <PageHeader title="Users" code="S11" description="Who in your team can see the console, and what they can do." />
        <AdminOnly screen="Managing supplier users" />
      </>
    );
  }

  const rows = Object.values(users).filter((u) => u.organisationId === org.id).sort((a, b) => a.name.localeCompare(b.name));

  function invite() {
    if (!org) return;
    if (name.trim().length < 3 || !email.includes("@")) {
      toast.error("Name and a valid email are required");
      return;
    }
    admin.inviteUser({ name: name.trim(), email: email.trim(), phone: phone.trim() || "+255", roleId, organisationId: org.id });
    toast.success(`Invitation sent to ${email.trim()}`, { description: `${ROLE_LABELS[roleId]} · they set a password from the link in the email.` });
    setOpen(false);
    setName("");
    setEmail("");
    setPhone("");
    setRoleId("supplier_staff");
  }

  function toggleStatus(u: User) {
    const next = u.status === "suspended" ? "active" : "suspended";
    admin.setUserStatus(u.id, next);
    toast.success(next === "suspended" ? `${u.name} suspended` : `${u.name} reactivated`, {
      description: next === "suspended" ? "They can no longer sign in or confirm bookings." : "They can sign in again immediately.",
    });
  }

  const columns: Column<User>[] = [
    {
      key: "name",
      header: "Person",
      render: (u) => (
        <div className="min-w-0">
          <p className="font-medium">{u.name}</p>
          <p className="truncate text-xs text-muted-foreground">{u.email} · {u.phone}</p>
        </div>
      ),
    },
    {
      key: "role",
      header: "Role",
      render: (u) => {
        const role = u.grants[0]?.roleId ?? "supplier_staff";
        return (
          <div className="flex flex-col gap-1">
            <span className="text-sm">{ROLE_LABELS[role]}</span>
            <span className="text-[11px] text-muted-foreground">{role === "supplier_admin" ? "Rate plans, payouts, users, reviews" : "Products, availability, confirmations"}</span>
          </div>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      render: (u) => <Pill tone={u.status === "active" ? "success" : u.status === "invited" ? "warning" : "danger"}>{u.status === "active" ? "Active" : u.status === "invited" ? "Invited" : "Suspended"}</Pill>,
    },
    { key: "last", header: "Last active", render: (u) => <span className="text-xs text-muted-foreground">{relativeTime(u.lastActiveAt)}</span> },
    {
      key: "actions",
      header: "Actions",
      className: "w-px whitespace-nowrap",
      render: (u) => (
        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={() => toggleStatus(u)} aria-label={u.status === "suspended" ? `Reactivate ${u.name}` : `Suspend ${u.name}`}>
            {u.status === "suspended" ? <><RotateCcw className="size-3.5" aria-hidden />Reactivate</> : <><Ban className="size-3.5" aria-hidden />Suspend</>}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Users"
        code="S11"
        description={`${rows.length} person(s) with access to ${org.name}. Supplier Staff can confirm bookings and manage availability but never see payouts or rate plans.`}
        actions={<Button onClick={() => setOpen(true)}><UserPlus className="size-4" aria-hidden />Invite user</Button>}
      />

      <DataTable
        caption="Supplier users"
        columns={columns}
        rows={rows}
        rowKey={(u) => u.id}
        empty={<EmptyState icon={Users} title="No team members yet" description="Invite the people who answer booking requests. They get their own sign in and appear on the audit trail." action={<Button onClick={() => setOpen(true)}><UserPlus className="size-4" aria-hidden />Invite the first user</Button>} />}
      />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite a team member</DialogTitle>
            <DialogDescription>They receive an email with a link to set a password. Roles can be changed later.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="u-name">Full name</Label>
              <Input id="u-name" className="mt-1.5" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Neema Mushi" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="u-email">Email</Label>
                <Input id="u-email" type="email" className="mt-1.5" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@lodge.example" />
              </div>
              <div>
                <Label htmlFor="u-phone">Phone</Label>
                <Input id="u-phone" className="mt-1.5" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+255 754 000 000" />
              </div>
            </div>
            <fieldset>
              <legend className="text-sm font-medium">Role</legend>
              <RadioGroup value={roleId} onValueChange={(v) => setRoleId(v as RoleId)} className="mt-2 gap-2">
                <label className="flex items-start gap-3 rounded-lg border p-3">
                  <RadioGroupItem value="supplier_staff" id="role-staff" className="mt-0.5" />
                  <span className="text-sm">
                    Supplier Staff
                    <span className="mt-0.5 block text-xs text-muted-foreground">Products, availability, stop sell and booking confirmations. No rate plans, payouts, users or contract.</span>
                  </span>
                </label>
                <label className="flex items-start gap-3 rounded-lg border p-3">
                  <RadioGroupItem value="supplier_admin" id="role-admin" className="mt-0.5" />
                  <span className="text-sm">
                    Supplier Admin
                    <span className="mt-0.5 block text-xs text-muted-foreground">Everything staff can do, plus rate plans, payout statements, review replies, users and the contract.</span>
                  </span>
                </label>
              </RadioGroup>
            </fieldset>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={invite}><UserPlus className="size-4" aria-hidden />Send invitation</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
