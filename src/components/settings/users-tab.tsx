"use client";

import * as React from "react";
import { MoreHorizontal, Pencil, Plus, UserCheck, UserX, Users } from "lucide-react";

import type { User } from "@/domain/types";
import { roleLabel } from "@/domain/permissions";
import { upsertUser } from "@/domain/commands";
import { useApp, useDispatch, useMe } from "@/store";
import { fmtDate } from "@/lib/dates";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/page";
import { StatusChip } from "@/components/shared/status-chip";
import { UserMark } from "@/components/shared/bits";
import { ConfirmDialog, Consequences } from "@/components/shared/confirm-dialog";
import { FilterSelect } from "@/components/shared/filter-select";
import { TabHeading } from "./settings-kit";
import { UserDialog } from "./user-dialog";

/** Settings → Users (Manager only). */
export function UsersTab() {
  const me = useMe();
  const db = useApp((s) => s.db)!;
  const dispatch = useDispatch();
  const [editing, setEditing] = React.useState<User | "new" | null>(null);
  const [toggling, setToggling] = React.useState<User | null>(null);
  const [status, setStatus] = React.useState("all");

  const all = Object.values(db.users).filter((u) => u.id !== "usr_system");
  const rows = all.filter((u) => (status === "all" ? true : status === "active" ? u.active : !u.active));

  const openBookings = (userId: string) => Object.values(db.files).filter((f) => f.ownerId === userId && !f.cancelledAt).length;

  const columns: Column<User>[] = [
    {
      key: "name",
      header: "Name",
      sort: (u) => u.name,
      csv: (u) => u.name,
      cell: (u) => (
        <span className="flex items-center gap-2.5">
          <UserMark user={u} />
          <span className="min-w-0 leading-tight">
            <span className="block truncate font-medium text-ink">
              {u.name}
              {u.id === me.id && <span className="ml-1.5 text-xs font-normal text-ink-3">(you)</span>}
            </span>
            <span className="block truncate text-[13px] text-ink-3 sm:hidden">{u.email}</span>
          </span>
        </span>
      ),
    },
    { key: "email", header: "Email", sort: (u) => u.email, csv: (u) => u.email, hideBelow: "sm", cell: (u) => <span className="text-ink-2">{u.email}</span> },
    { key: "phone", header: "Phone", csv: (u) => u.phone, hideBelow: "xl", cell: (u) => <span className="tnum text-ink-2">{u.phone ?? "—"}</span> },
    { key: "role", header: "Role", sort: (u) => u.role, csv: (u) => roleLabel(u.role), cell: (u) => roleLabel(u.role) },
    { key: "since", header: "Added", sort: (u) => u.createdAt, csv: (u) => u.createdAt.slice(0, 10), hideBelow: "md", cell: (u) => <span className="tnum text-ink-3">{fmtDate(u.createdAt)}</span> },
    {
      key: "status",
      header: "Status",
      sort: (u) => (u.active ? 0 : 1),
      csv: (u) => (u.active ? "Active" : "Deactivated"),
      cell: (u) => <StatusChip status={u.active ? "user.active" : "user.inactive"} />,
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      width: "48px",
      cell: (u) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${u.name}`}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => setEditing(u)}>
              <Pencil className="size-4" /> Edit
            </DropdownMenuItem>
            {u.id !== me.id && (
              <DropdownMenuItem onSelect={() => setToggling(u)} variant={u.active ? "destructive" : undefined}>
                {u.active ? <UserX className="size-4" /> : <UserCheck className="size-4" />}
                {u.active ? "Deactivate" : "Reactivate"}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const t = toggling;
  const owned = t ? openBookings(t.id) : 0;

  return (
    <div>
      <TabHeading
        title="Users"
        description="Who can sign in, and what each role may do. Deactivated users cannot sign in; their history stays."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus /> Add user
          </Button>
        }
      />
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(u) => u.id}
        onRowClick={(u) => setEditing(u)}
        search={(u) => [u.name, u.email, u.phone, roleLabel(u.role)].filter(Boolean).join(" ")}
        searchPlaceholder="Search name, email, role"
        exportName="users"
        initialSort={{ key: "name", dir: "asc" }}
        toolbar={
          <FilterSelect
            label="Status"
            value={status}
            onChange={setStatus}
            options={[
              { value: "all", label: "Any status" },
              { value: "active", label: "Active" },
              { value: "inactive", label: "Deactivated" },
            ]}
          />
        }
        empty={<EmptyState icon={Users} title="No users match" body="Clear the status filter to see everyone." />}
      />

      <UserDialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} user={editing && editing !== "new" ? editing : undefined} />

      <ConfirmDialog
        open={Boolean(t)}
        onOpenChange={(o) => !o && setToggling(null)}
        title={t?.active ? `Deactivate ${t?.name}?` : `Reactivate ${t?.name}?`}
        confirmLabel={t?.active ? "Deactivate" : "Reactivate"}
        tone={t?.active ? "destructive" : "default"}
        onConfirm={() => {
          if (!t) return;
          const r = dispatch(upsertUser, { user: { id: t.id, name: t.name, email: t.email, phone: t.phone, role: t.role, active: !t.active } });
          return r.ok;
        }}
      >
        {t && (
          <Consequences
            items={
              t.active
                ? [
                    `${t.name} can no longer sign in. If they are signed in on another screen, they are stopped at the next page.`,
                    owned ? `${owned} booking${owned === 1 ? "" : "s"} still list them as the agent. A Manager can reassign them from each booking.` : "No open bookings list them as the agent.",
                    "Their bookings, payments and audit history stay as they are.",
                    "You can reactivate them at any time.",
                  ]
                : [`${t.name} can sign in again as ${roleLabel(t.role)}.`, "Nothing else changes."]
            }
          />
        )}
      </ConfirmDialog>
    </div>
  );
}
