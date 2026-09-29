"use client";

import * as React from "react";
import { HandCoins, Pencil } from "lucide-react";

import type { ID, SupplierPayment } from "@/domain/types";
import { can } from "@/domain/permissions";
import { supplierBalances, supplierOpenItems } from "@/domain/selectors/balances";
import { inPeriod, presetPeriod } from "@/domain/selectors/reports/common";
import { SUPPLIER_KINDS, labelOf } from "@/store/seed/reference";
import { useApp, useMe } from "@/store";
import { useNow } from "@/lib/use-now";
import { sumIn } from "@/lib/view-models";
import { fmtDate } from "@/lib/dates";

import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState, PageHeader, Section } from "@/components/shared/page";
import { Amount } from "@/components/shared/amount";
import { Code, UserMark } from "@/components/shared/bits";
import { SupplierDialog } from "@/components/settings/supplier-dialog";
import { PaySupplierSheet } from "./pay-supplier";
import { Strip, Trend } from "./strip";
import { SupplierOpenItems } from "./supplier-open-items";

/** /money-out/suppliers/[id]: owed and overdue, open items, Pay supplier, payment history (spec §9.9). */
export function SupplierDetail({ supplierId }: { supplierId: ID }) {
  const me = useMe();
  const db = useApp((s) => s.db)!;
  const now = useNow();
  const [paying, setPaying] = React.useState<{ open: boolean; preselect?: ID[] }>({ open: false });
  const [editing, setEditing] = React.useState(false);

  const supplier = db.suppliers[supplierId];
  const items = React.useMemo(() => supplierOpenItems(db, supplierId, now), [db, supplierId, now]);
  const balance = React.useMemo(() => supplierBalances(db, now).find((b) => b.supplier.id === supplierId), [db, supplierId, now]);
  const payments = React.useMemo(() => Object.values(db.supplierPayments).filter((p) => p.supplierId === supplierId), [db.supplierPayments, supplierId]);

  if (!supplier) {
    return (
      <>
        <PageHeader title="Supplier not found" back={{ href: "/money-out?tab=suppliers", label: "Money out" }} />
        <EmptyState title="This supplier doesn't exist" body="It may have been removed when the demo data was reset." />
      </>
    );
  }

  const rate = db.settings.fx.USD_TZS;
  const cur = supplier.currency;
  const owed = balance?.owed ?? { amountMinor: 0, currency: cur };
  const overdue = balance?.overdue ?? { amountMinor: 0, currency: cur };
  const overdueCount = items.filter((i) => i.overdue).length;
  const payable = items.filter((i) => i.remaining.amountMinor > 0);
  const oldest = payable.reduce((m, i) => Math.max(m, i.daysOutstanding), 0);
  const month = presetPeriod("month", now);
  const lastMonth = presetPeriod("last_month", now);
  const paidThisMonth = sumIn(payments.filter((p) => inPeriod(p.paidAt, month)).map((p) => p.amount), cur, rate);
  const paidLastMonth = sumIn(payments.filter((p) => inPeriod(p.paidAt, lastMonth)).map((p) => p.amount), cur, rate);
  const lastMonthLabel = new Date(`${lastMonth.from}T12:00:00Z`).toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const canPay = can(me, "supplier_payment.record");
  const isAir = db.settings.airSettlement.supplierId === supplier.id;

  const columns: Column<SupplierPayment>[] = [
    { key: "number", header: "Payment no.", sort: (p) => p.number, csv: (p) => p.number, cell: (p) => <Code strong>{p.number}</Code> },
    { key: "date", header: "Paid", sort: (p) => p.paidAt, csv: (p) => p.paidAt.slice(0, 10), cell: (p) => <span className="tnum text-ink-2">{fmtDate(p.paidAt)}</span> },
    { key: "account", header: "From account", sort: (p) => db.moneyAccounts[p.accountId]?.name, csv: (p) => db.moneyAccounts[p.accountId]?.name, hideBelow: "md", cell: (p) => <span className="text-ink-2">{db.moneyAccounts[p.accountId]?.name ?? "—"}</span> },
    { key: "reference", header: "Reference", csv: (p) => p.reference, hideBelow: "xl", cell: (p) => (p.reference ? <Code>{p.reference}</Code> : <span className="text-ink-4">—</span>) },
    {
      key: "lines",
      header: "Covers",
      csv: (p) => p.allocations.map((a) => db.lines[a.lineId]?.description).join("; "),
      hideBelow: "sm",
      className: "max-w-[280px]",
      cell: (p) => {
        const nos = Array.from(new Set(p.allocations.map((a) => db.files[db.lines[a.lineId]?.fileId ?? ""]?.number).filter(Boolean)));
        return (
          <span className="block leading-tight">
            <span className="block text-ink-2">
              {p.allocations.length} line{p.allocations.length === 1 ? "" : "s"}
            </span>
            <span className="block truncate font-mono text-xs text-ink-3">{nos.slice(0, 3).join(", ")}{nos.length > 3 ? ` +${nos.length - 3}` : ""}</span>
          </span>
        );
      },
    },
    { key: "by", header: "By", align: "center", sort: (p) => db.users[p.recordedBy]?.name, csv: (p) => db.users[p.recordedBy]?.name, hideBelow: "xl", cell: (p) => <UserMark user={db.users[p.recordedBy]} /> },
    { key: "amount", header: "Amount", align: "right", sort: (p) => (p.amount.currency === "USD" ? p.amount.amountMinor * rate : p.amount.amountMinor), csv: (p) => `${p.amount.currency} ${(p.amount.amountMinor / 100).toFixed(2)}`, cell: (p) => <Amount value={p.amount} className="font-medium text-ink" /> },
  ];

  return (
    <>
      <PageHeader
        back={{ href: "/money-out?tab=suppliers", label: "Money out" }}
        title={supplier.name}
        meta={
          <>
            <span>{labelOf(SUPPLIER_KINDS, supplier.kind)}</span>
            {isAir && (
              <>
                <span aria-hidden>·</span>
                <span>Air settlement ({db.settings.airSettlement.mode === "bsp" ? "BSP" : "consolidator"})</span>
              </>
            )}
            <span aria-hidden>·</span>
            <span>Paid in {cur}</span>
            <span aria-hidden>·</span>
            <span>{supplier.paymentTermsDays === 0 ? "Pay on issue" : `${supplier.paymentTermsDays}-day terms`}</span>
            {(supplier.contactName || supplier.phone || supplier.email) && (
              <>
                <span aria-hidden>·</span>
                <span className="tnum">{[supplier.contactName, supplier.phone, supplier.email].filter(Boolean).join(", ")}</span>
              </>
            )}
            {!supplier.active && (
              <>
                <span aria-hidden>·</span>
                <span>Inactive</span>
              </>
            )}
          </>
        }
        actions={
          <>
            {can(me, "supplier.manage") && (
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Pencil /> Edit supplier
              </Button>
            )}
            {canPay && (
              <Button onClick={() => setPaying({ open: true })} disabled={!payable.length}>
                <HandCoins /> Pay supplier
              </Button>
            )}
          </>
        }
      />

      <div className="space-y-8">
        <Strip
          items={[
            { label: "Owed", value: <Amount value={owed} tone="balance" />, sub: owed.amountMinor < 0 ? "The supplier owes us (refund credit)" : payable.length ? `${payable.length} line${payable.length === 1 ? "" : "s"} to pay, oldest ${oldest} days` : "Nothing to pay" },
            { label: "Overdue", value: <Amount value={overdue} />, sub: overdueCount ? `${overdueCount} past ${supplier.paymentTermsDays}-day terms` : "Nothing overdue" },
            { label: "Paid this month", value: <Amount value={paidThisMonth} />, sub: <Trend current={paidThisMonth.amountMinor} previous={paidLastMonth.amountMinor} label={lastMonthLabel} /> },
            { label: "Last payment", value: balance?.lastPaymentAt ? fmtDate(balance.lastPaymentAt) : "Never", sub: payments.length ? `${payments.length} in total` : "No payments yet" },
          ]}
        />

        <Section title="Open items" count={items.length} description="Issued lines with cost still unpaid, oldest first.">
          <SupplierOpenItems db={db} items={items} currency={cur} onPay={canPay ? (lineId) => setPaying({ open: true, preselect: [lineId] }) : undefined} />
        </Section>

        <Section title="Payment history" count={payments.length}>
          <DataTable
            rows={payments}
            columns={columns}
            rowKey={(p) => p.id}
            exportName={`supplier-payments-${supplier.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
            initialSort={{ key: "date", dir: "desc" }}
            empty={<EmptyState icon={HandCoins} title="No payments to this supplier yet" body={canPay && payable.length ? "Use Pay supplier to record the first one." : undefined} />}
          />
        </Section>
      </div>

      <PaySupplierSheet open={paying.open} onOpenChange={(o) => setPaying((p) => ({ ...p, open: o }))} supplierId={supplier.id} preselect={paying.preselect} />
      <SupplierDialog open={editing} onOpenChange={setEditing} supplier={supplier} />
    </>
  );
}
