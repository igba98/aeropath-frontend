"use client";

import * as React from "react";
import Link from "next/link";
import { Plus, Truck } from "lucide-react";

import type { Supplier, SupplierKind } from "@/domain/types";
import { can } from "@/domain/permissions";
import { SUPPLIER_KINDS, labelOf } from "@/store/seed/reference";
import { useApp, useMe } from "@/store";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState, Segmented, Section } from "@/components/shared/page";
import { StatusChip } from "@/components/shared/status-chip";
import { Field, FieldGrid } from "@/components/shared/field";
import { FilterSelect } from "@/components/shared/filter-select";
import { SaveBar, TabHeading, ViewOnlyNote, useSettingsDraft } from "./settings-kit";
import { SupplierDialog } from "./supplier-dialog";

const MODE_HINT = {
  bsp: "BSP: tickets are issued on the agency's own IATA plate and BSP Tanzania bills the agency each settlement period.",
  consolidator: "Consolidator: tickets are issued through a consolidator's plate; the agency pays the consolidator on their terms.",
} as const;

/** Settings → Suppliers: full list, add/edit, and the air settlement choice. */
export function SuppliersTab() {
  const me = useMe();
  const db = useApp((s) => s.db)!;
  const canManage = can(me, "supplier.manage");
  const canSettings = can(me, "settings.edit");
  const [editing, setEditing] = React.useState<Supplier | "new" | null>(null);
  const [kind, setKind] = React.useState<"all" | SupplierKind>("all");
  const [status, setStatus] = React.useState("active");
  const { draft, setDraft, dirty, discard, save } = useSettingsDraft((s) => s.airSettlement);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  const all = Object.values(db.suppliers);
  const airOptions = all.filter((s) => s.kind === "air_settlement" && (s.active || s.id === draft.supplierId));
  const rows = all.filter((s) => (kind === "all" || s.kind === kind) && (status === "all" || (status === "active" ? s.active : !s.active)));

  const columns: Column<Supplier>[] = [
    {
      key: "name",
      header: "Supplier",
      sort: (s) => s.name,
      csv: (s) => s.name,
      cell: (s) => (
        <span className="block leading-tight">
          <span className="block font-medium text-ink">
            {s.name}
            {s.id === db.settings.airSettlement.supplierId && <span className="ml-1.5 text-xs font-normal text-ink-3">(air settlement)</span>}
          </span>
          <span className="block text-[13px] text-ink-3 sm:hidden">{labelOf(SUPPLIER_KINDS, s.kind)}</span>
        </span>
      ),
    },
    { key: "kind", header: "Kind", sort: (s) => s.kind, csv: (s) => labelOf(SUPPLIER_KINDS, s.kind), hideBelow: "sm", cell: (s) => <span className="text-ink-2">{labelOf(SUPPLIER_KINDS, s.kind)}</span> },
    { key: "currency", header: "Currency", sort: (s) => s.currency, csv: (s) => s.currency, cell: (s) => <span className="text-[13px] font-semibold tracking-wide text-ink-2">{s.currency}</span> },
    {
      key: "contact",
      header: "Contact",
      csv: (s) => [s.contactName, s.phone, s.email].filter(Boolean).join(" · "),
      hideBelow: "xl",
      cell: (s) => (
        <span className="block max-w-[240px] leading-tight">
          <span className="block truncate text-ink-2">{s.contactName ?? "—"}</span>
          {(s.phone || s.email) && <span className="block truncate text-[13px] text-ink-3">{s.phone ?? s.email}</span>}
        </span>
      ),
    },
    { key: "terms", header: "Terms", align: "right", sort: (s) => s.paymentTermsDays, csv: (s) => s.paymentTermsDays, hideBelow: "md", cell: (s) => <span className="text-ink-2">{s.paymentTermsDays === 0 ? "On issue" : `${s.paymentTermsDays} days`}</span> },
    { key: "status", header: "Status", sort: (s) => (s.active ? 0 : 1), csv: (s) => (s.active ? "Active" : "Inactive"), hideBelow: "sm", cell: (s) => <StatusChip status={s.active ? "user.active" : "user.inactive"} label={s.active ? "Active" : "Inactive"} /> },
  ];

  const onSave = () => {
    if (!draft.supplierId) return setSaveError("Choose the air settlement supplier.");
    const r = save({ airSettlement: { mode: draft.mode, supplierId: draft.supplierId } });
    setSaveError(r.ok ? null : r.error.message);
  };

  return (
    <div className="space-y-10">
      <TabHeading
        title="Suppliers"
        description="Who the agency pays for tickets, hotels and other services. Also reachable from Money out."
        viewOnly={!canManage}
        actions={
          canManage && (
            <Button onClick={() => setEditing("new")}>
              <Plus /> Add supplier
            </Button>
          )
        }
      />

      <Section title="Air settlement" description="Where ticket money goes. Money out shows this supplier's period totals at the top.">
        <FieldGrid cols={2} className="max-w-[720px]">
          <Field label="Air settlement supplier" hint={airOptions.length ? undefined : "Add a supplier of kind “Air settlement” first."}>
            <Select value={draft.supplierId || undefined} onValueChange={(v) => setDraft((d) => ({ ...d, supplierId: v }))} disabled={!canSettings || !airOptions.length}>
              <SelectTrigger aria-label="Air settlement supplier">
                <SelectValue placeholder="Choose a supplier" />
              </SelectTrigger>
              <SelectContent>
                {airOptions.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                    <span className="ml-auto text-[13px] text-ink-3">{s.currency}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Mode" hint={MODE_HINT[draft.mode]}>
            {canSettings ? (
              <Segmented
                label="Settlement mode"
                value={draft.mode}
                onChange={(m) => setDraft((d) => ({ ...d, mode: m }))}
                options={[
                  { value: "bsp", label: "BSP" },
                  { value: "consolidator", label: "Consolidator" },
                ]}
              />
            ) : (
              <p className="flex h-8 items-center text-sm text-ink">{draft.mode === "bsp" ? "BSP" : "Consolidator"}</p>
            )}
          </Field>
        </FieldGrid>
        {!canSettings && <ViewOnlyNote className="mt-3" />}
        {draft.supplierId && (
          <p className="mt-3 text-[13.5px] text-ink-3">
            <Link href={`/money-out/suppliers/${draft.supplierId}`} className="text-link hover:underline">
              Open this supplier in Money out
            </Link>{" "}
            to review open tickets and pay the period.
          </p>
        )}
      </Section>

      <Section title="All suppliers" count={rows.length}>
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(s) => s.id}
          onRowClick={canManage ? (s) => setEditing(s) : undefined}
          search={(s) => [s.name, s.contactName, s.phone, s.email, labelOf(SUPPLIER_KINDS, s.kind)].filter(Boolean).join(" ")}
          searchPlaceholder="Search name, contact, kind"
          exportName="suppliers"
          initialSort={{ key: "name", dir: "asc" }}
          toolbar={
            <>
              <FilterSelect label="Kind" value={kind} onChange={(v) => setKind(v as typeof kind)} options={[{ value: "all", label: "All kinds" }, ...SUPPLIER_KINDS]} />
              <FilterSelect
                label="Status"
                value={status}
                onChange={setStatus}
                options={[
                  { value: "active", label: "Active" },
                  { value: "inactive", label: "Inactive" },
                  { value: "all", label: "Any status" },
                ]}
              />
            </>
          }
          empty={
            all.length === 0 ? (
              <EmptyState icon={Truck} title="No suppliers yet" body="Add BSP or your consolidator first, then hotels and other partners." action={canManage && <Button onClick={() => setEditing("new")}><Plus /> Add the first supplier</Button>} />
            ) : (
              <EmptyState title="No suppliers match" body="Change the kind or status filter." />
            )
          }
        />
      </Section>

      <SupplierDialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} supplier={editing && editing !== "new" ? editing : undefined} />
      <SaveBar
        dirty={canSettings && dirty}
        error={saveError}
        onDiscard={() => {
          discard();
          setSaveError(null);
        }}
        onSave={onSave}
      />
    </div>
  );
}
