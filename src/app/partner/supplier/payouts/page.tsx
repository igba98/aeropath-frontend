"use client";

import { useState } from "react";
import { CheckCircle2, Clock, Download, FileText, Hourglass, Wallet, XCircle } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, StatTile } from "@/components/chrome/console-shell";
import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { MoneyText } from "@/components/shared/money-text";
import { Pill } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useStore } from "@/lib/store";
import { formatDate, formatRange } from "@/lib/format";
import { AdminOnly, NotSupplier, useSupplierContext } from "@/features/supplier/shared";
import type { BookingItem, Payout } from "@/lib/domain/types";

const PAYOUT_STATUS: Record<Payout["status"], { label: string; tone: "neutral" | "warning" | "info" | "success" | "danger"; icon: typeof Clock }> = {
  draft: { label: "Draft statement", tone: "neutral", icon: FileText },
  pending_approval: { label: "Awaiting finance approval", tone: "warning", icon: Hourglass },
  approved: { label: "Approved · queued for payment", tone: "info", icon: Clock },
  executed: { label: "Paid", tone: "success", icon: CheckCircle2 },
  failed: { label: "Failed", tone: "danger", icon: XCircle },
};

/** S09 · Payout statements. Supplier Admin only (§2.4). */
export default function SupplierPayoutsPage() {
  const { org, hydrated, isAdmin } = useSupplierContext();
  const payouts = useStore((s) => s.payouts);
  const items = useStore((s) => s.items);
  const [open, setOpen] = useState<Payout | null>(null);

  if (!hydrated) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!org) {
    return (
      <>
        <PageHeader title="Payouts" code="S09" description="Statement periods, commission deducted and payment status." />
        <NotSupplier what="Payout statements" />
      </>
    );
  }
  if (!isAdmin) {
    return (
      <>
        <PageHeader title="Payouts" code="S09" description="Statement periods, commission deducted and payment status." />
        <AdminOnly screen="Viewing payout statements" />
      </>
    );
  }

  const rows = Object.values(payouts).filter((p) => p.supplierId === org.id).sort((a, b) => b.periodFrom.localeCompare(a.periodFrom));
  const paidYtd = rows.filter((p) => p.status === "executed").reduce((s, p) => s + p.netMinor, 0);
  const outstanding = rows.filter((p) => p.status !== "executed" && p.status !== "failed").reduce((s, p) => s + p.netMinor, 0);
  const commissionYtd = rows.reduce((s, p) => s + p.commissionMinor, 0);

  function download(p: Payout) {
    toast.success(`Statement ${p.periodLabel} generated`, { description: `PDF with ${p.itemIds.length || "all"} line items sent to ${org?.contactEmail ?? "your registered email"}.` });
  }

  const lineItems = (p: Payout): BookingItem[] => p.itemIds.map((id) => items[id]).filter(Boolean);

  const columns: Column<Payout>[] = [
    {
      key: "period",
      header: "Period",
      render: (p) => (
        <div>
          <p className="font-medium">{p.periodLabel}</p>
          <p className="text-xs text-muted-foreground">{formatRange(p.periodFrom, p.periodTo)}</p>
        </div>
      ),
    },
    { key: "gross", header: "Gross", numeric: true, render: (p) => <MoneyText minor={p.grossMinor} currency={p.currency} size="sm" showCurrency={false} /> },
    { key: "commission", header: "Commission", numeric: true, render: (p) => <span className="text-sm text-muted-foreground">−<MoneyText minor={p.commissionMinor} currency={p.currency} size="sm" showCurrency={false} /></span> },
    { key: "net", header: "Net to you", numeric: true, render: (p) => <MoneyText minor={p.netMinor} currency={p.currency} size="sm" /> },
    {
      key: "status",
      header: "Status",
      render: (p) => {
        const s = PAYOUT_STATUS[p.status];
        return (
          <div className="flex flex-col gap-1">
            <Pill tone={s.tone} icon={s.icon}>{s.label}</Pill>
            {p.executedAt ? <span className="text-[11px] text-muted-foreground">Paid {formatDate(p.executedAt)}</span> : null}
          </div>
        );
      },
    },
    {
      key: "actions",
      header: "Actions",
      className: "w-px whitespace-nowrap",
      render: (p) => (
        <div className="flex justify-end gap-1.5">
          <Button size="sm" variant="ghost" onClick={() => setOpen(p)}>Line items</Button>
          <Button size="sm" variant="outline" onClick={() => download(p)} aria-label={`Download statement for ${p.periodLabel}`}>
            <Download className="size-3.5" aria-hidden />Statement
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Payouts"
        code="S09"
        description={`Aeropath collects from the guest and pays you ${org.payoutTermsDays ?? 14} days after travel, less ${org.commissionPct ?? 15}% commission.`}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Paid to date" value={<MoneyText minor={paidYtd} currency="TZS" size="lg" compact />} hint={`${rows.filter((p) => p.status === "executed").length} statement(s) settled`} icon={Wallet} tone="success" />
        <StatTile label="Outstanding" value={<MoneyText minor={outstanding} currency="TZS" size="lg" compact />} hint="Awaiting finance approval or payment" icon={Hourglass} tone={outstanding ? "warning" : "default"} />
        <StatTile label="Commission deducted" value={<MoneyText minor={commissionYtd} currency="TZS" size="lg" compact />} hint={`At ${org.commissionPct ?? 15}% of the net rate`} icon={FileText} />
      </div>

      <div className="mt-5">
        <DataTable
          caption="Payout statements"
          columns={columns}
          rows={rows}
          rowKey={(p) => p.id}
          empty={<EmptyState icon={Wallet} title="No statements yet" description="Your first statement is generated after the first completed stay. Statements run to a fortnightly or monthly cycle depending on your contract." />}
        />
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Payments go to {org.bankName ?? "your registered bank"} {org.bankAccountMasked ?? ""}. Bank details are changed by the platform after verification — see your contract.
      </p>

      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{open?.periodLabel} · line items</DialogTitle>
            <DialogDescription>
              {open ? `${formatRange(open.periodFrom, open.periodTo)} · gross less ${org.commissionPct ?? 15}% commission.` : null}
            </DialogDescription>
          </DialogHeader>
          {open && lineItems(open).length ? (
            <ul className="divide-y rounded-lg border">
              {lineItems(open).map((i) => (
                <li key={i.id} className="flex items-start justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{i.productSnapshot.title}</p>
                    <p className="text-xs text-muted-foreground">{i.productSnapshot.ratePlanName} · {formatRange(i.travelDateFrom, i.travelDateTo)}</p>
                  </div>
                  <div className="text-right">
                    <MoneyText minor={i.netCostMinor} currency="TZS" size="sm" showCurrency={false} />
                    <p className="text-[11px] text-muted-foreground">commission {i.commissionMinor.toLocaleString("en-TZ")}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              This statement was consolidated by finance and carries no itemised lines in the console. The PDF statement lists every booking reference in the period.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(null)}>Close</Button>
            {open ? <Button onClick={() => download(open)}><Download className="size-4" aria-hidden />Download statement</Button> : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
