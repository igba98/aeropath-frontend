"use client";

import * as React from "react";
import { Plus, Truck, X } from "lucide-react";

import type { SupplierKind } from "@/domain/types";
import { can } from "@/domain/permissions";
import { supplierBalances, type SupplierBalance } from "@/domain/selectors/balances";
import { SUPPLIER_KINDS, labelOf } from "@/store/seed/reference";
import { useApp, useMe, useUi } from "@/store";
import { useNow } from "@/lib/use-now";
import { sumIn } from "@/lib/view-models";
import { fmtDate } from "@/lib/dates";

import { Button } from "@/components/ui/button";
import { DataTable, TotalsRow, type Column } from "@/components/shared/data-table";
import { EmptyState, Section } from "@/components/shared/page";
import { Amount } from "@/components/shared/amount";
import { StatusChip } from "@/components/shared/status-chip";
import { FilterSelect } from "@/components/shared/filter-select";
import { SupplierDialog } from "@/components/settings/supplier-dialog";
import { AirSettlementPanel } from "./air-settlement";

/** Money out → Suppliers: air settlement panel, then what we owe each supplier. */
export function SuppliersTab() {
  const me = useMe();
  const db = useApp((s) => s.db)!;
  const now = useNow();
  const displayCur = useUi((s) => s.displayCurrency);
  const rate = db.settings.fx.USD_TZS;
  const [kind, setKind] = React.useState<"all" | SupplierKind>("all");
  const [owing, setOwing] = React.useState("all");
  const [adding, setAdding] = React.useState(false);

  const all = React.useMemo(() => supplierBalances(db, now), [db, now]);
  const rows = all.filter((r) => {
    if (kind !== "all" && r.supplier.kind !== kind) return false;
    if (owing === "owed" && r.owed.amountMinor <= 0) return false;
    if (owing === "overdue" && r.overdue.amountMinor <= 0) return false;
    return true;
  });
  const totalOwed = sumIn(rows.map((r) => r.owed), displayCur, rate);
  const totalOverdue = sumIn(rows.map((r) => r.overdue), displayCur, rate);
  const mixed = rows.some((r) => r.supplier.currency !== displayCur && r.owed.amountMinor !== 0);
  const toTzs = (m: { amountMinor: number; currency: string }) => (m.currency === "USD" ? m.amountMinor * rate : m.amountMinor);
  const anyFilter = kind !== "all" || owing !== "all";

  const columns: Column<SupplierBalance>[] = [
    {
      key: "name",
      header: "Supplier",
      sort: (r) => r.supplier.name,
      csv: (r) => r.supplier.name,
      cell: (r) => (
        <span className="block leading-tight">
          <span className="block font-medium text-ink">{r.supplier.name}</span>
          <span className="block text-[13px] text-ink-3">
            {r.openItems ? `${r.openItems} open item${r.openItems === 1 ? "" : "s"}` : "Nothing open"}
            {!r.supplier.active && " · inactive"}
          </span>
        </span>
      ),
    },
    { key: "kind", header: "Kind", sort: (r) => r.supplier.kind, csv: (r) => labelOf(SUPPLIER_KINDS, r.supplier.kind), hideBelow: "md", cell: (r) => <span className="text-ink-2">{labelOf(SUPPLIER_KINDS, r.supplier.kind)}</span> },
    { key: "currency", header: "Cur.", sort: (r) => r.supplier.currency, csv: (r) => r.supplier.currency, hideBelow: "xl", cell: (r) => <span className="text-[13px] font-semibold tracking-wide text-ink-2">{r.supplier.currency}</span> },
    {
      key: "owed",
      header: "Owed",
      align: "right",
      sort: (r) => toTzs(r.owed),
      csv: (r) => r.owed.amountMinor / 100,
      cell: (r) => (
        <span className="flex flex-col items-end gap-1">
          <Amount value={r.owed} tone="balance" className={r.owed.amountMinor === 0 ? "text-ink-4" : "font-medium text-ink"} />
          {r.owed.amountMinor < 0 && <StatusChip status="pay.credit" size="xs" title="Refund credit: the supplier owes us" />}
        </span>
      ),
    },
    {
      key: "overdue",
      header: "Overdue",
      align: "right",
      sort: (r) => toTzs(r.overdue),
      csv: (r) => r.overdue.amountMinor / 100,
      hideBelow: "sm",
      cell: (r) => (r.overdue.amountMinor > 0 ? <span className="flex flex-col items-end gap-1"><Amount value={r.overdue} /><StatusChip status="pay.overdue" size="xs" /></span> : <span className="text-ink-4">—</span>),
    },
    {
      key: "last",
      header: "Last payment",
      sort: (r) => r.lastPaymentAt ?? "",
      csv: (r) => (r.lastPaymentAt ? r.lastPaymentAt.slice(0, 10) : ""),
      hideBelow: "md",
      cell: (r) => <span className="tnum text-ink-2">{r.lastPaymentAt ? fmtDate(r.lastPaymentAt) : "Never"}</span>,
    },
  ];

  return (
    <div className="space-y-8">
      <AirSettlementPanel />
      <Section
        title="What we owe suppliers"
        count={rows.length}
        actions={
          can(me, "supplier.manage") && (
            <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
              <Plus /> Add supplier
            </Button>
          )
        }
      >
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(r) => r.supplier.id}
          rowHref={(r) => `/money-out/suppliers/${r.supplier.id}`}
          search={(r) => [r.supplier.name, r.supplier.contactName, labelOf(SUPPLIER_KINDS, r.supplier.kind)].filter(Boolean).join(" ")}
          searchPlaceholder="Search suppliers"
          exportName="supplier-balances"
          initialSort={{ key: "owed", dir: "desc" }}
          toolbar={
            <>
              <FilterSelect label="Kind" value={kind} onChange={(v) => setKind(v as typeof kind)} options={[{ value: "all", label: "All kinds" }, ...SUPPLIER_KINDS]} />
              <FilterSelect
                label="Balance"
                value={owing}
                onChange={setOwing}
                options={[
                  { value: "all", label: "Any balance" },
                  { value: "owed", label: "We owe them" },
                  { value: "overdue", label: "Overdue" },
                ]}
              />
              {anyFilter && (
                <Button variant="ghost" size="sm" onClick={() => { setKind("all"); setOwing("all"); }}>
                  <X /> Clear filters
                </Button>
              )}
            </>
          }
          footer={
            rows.length > 0 && (
              <TotalsRow
                cells={[
                  { content: `Total in ${displayCur}` },
                  { className: "hidden md:table-cell" },
                  { className: "hidden lg:table-cell" },
                  { content: <Amount value={totalOwed} tone="balance" />, align: "right" },
                  { content: <Amount value={totalOverdue} />, align: "right", className: "hidden sm:table-cell" },
                  { className: "hidden md:table-cell" },
                ]}
              />
            )
          }
          empty={
            all.length === 0 ? (
              <EmptyState icon={Truck} title="No suppliers yet" body="Add BSP or your consolidator, then hotels and other partners." action={can(me, "supplier.manage") && <Button onClick={() => setAdding(true)}><Plus /> Add a supplier</Button>} />
            ) : (
              <EmptyState title="No suppliers in this view" body="Change the kind or balance filter." />
            )
          }
        />
        {mixed && <p className="mt-2 text-[13px] text-ink-3">Totals converted at 1 USD = TZS {rate.toLocaleString("en-US")}.</p>}
      </Section>
      <SupplierDialog open={adding} onOpenChange={setAdding} />
    </div>
  );
}
