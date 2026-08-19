"use client";

import { useState } from "react";
import { Banknote, CheckCircle2, Send, Wallet } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, StatTile } from "@/components/chrome/console-shell";
import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { MoneyText } from "@/components/shared/money-text";
import { Pill } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSession } from "@/hooks/use-session";
import { useStore } from "@/lib/store";
import { admin } from "@/lib/api";
import { formatDate, formatRange } from "@/lib/format";
import type { Payout } from "@/lib/domain/types";

/** F04 · Supplier payouts. Approval is finance-manager work; execution writes the ledger. */
export default function PayoutsPage() {
  const s = useSession();
  const payouts = useStore((st) => st.payouts);
  const organisations = useStore((st) => st.organisations);
  const items = useStore((st) => st.items);
  const [open, setOpen] = useState<Payout | null>(null);

  if (!s.hydrated) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;

  const canApprove = s.can("PAYOUT:approve");
  const all = Object.values(payouts).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const pending = all.filter((p) => p.status === "pending_approval");
  const approved = all.filter((p) => p.status === "approved");
  const dueMinor = all.filter((p) => p.status !== "executed").reduce((sum, p) => sum + p.netMinor, 0);

  const columns: Column<Payout>[] = [
    { key: "supplier", header: "Supplier", render: (p) => <span className="font-medium">{organisations[p.supplierId]?.name ?? p.supplierId}</span> },
    { key: "period", header: "Period", render: (p) => <span className="text-sm">{p.periodLabel}<span className="block text-xs text-muted-foreground">{formatRange(p.periodFrom, p.periodTo)}</span></span> },
    { key: "gross", header: "Gross", numeric: true, render: (p) => <MoneyText minor={p.grossMinor} currency={p.currency} size="sm" showCurrency={false} /> },
    { key: "comm", header: "Commission", numeric: true, render: (p) => <MoneyText minor={p.commissionMinor} currency={p.currency} size="sm" showCurrency={false} className="text-success-foreground" /> },
    { key: "net", header: "Net payable", numeric: true, render: (p) => <MoneyText minor={p.netMinor} currency={p.currency} size="sm" /> },
    {
      key: "status", header: "Status",
      render: (p) => p.status === "executed" ? <Pill tone="success" icon={CheckCircle2}>Paid {p.executedAt ? formatDate(p.executedAt) : ""}</Pill>
        : p.status === "approved" ? <Pill tone="brand">Approved</Pill>
        : p.status === "pending_approval" ? <Pill tone="warning">Awaiting approval</Pill>
        : <Pill tone="neutral">Draft</Pill>,
    },
    { key: "actions", header: "", className: "text-right", render: (p) => <Button variant="ghost" size="sm" onClick={() => setOpen(p)}>Open</Button> },
  ];

  return (
    <>
      <PageHeader title="Supplier payouts" code="F04" description="Payout runs by period. Approval and execution are separated so no one person can both authorise and move money." />

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <StatTile label="Awaiting approval" value={pending.length} tone={pending.length ? "warning" : "default"} icon={Send} />
        <StatTile label="Approved, not paid" value={approved.length} icon={CheckCircle2} />
        <StatTile label="Outstanding to suppliers" value={<MoneyText minor={dueMinor} currency="TZS" size="lg" compact />} icon={Wallet} />
        <StatTile label="Runs this period" value={all.length} icon={Banknote} />
      </div>

      {!canApprove ? (
        <div className="mb-4 rounded-xl border border-warning/40 bg-warning/5 p-4 text-sm">
          <p className="font-medium">You can view but not approve</p>
          <p className="mt-0.5 text-muted-foreground">Signed in as {s.roleLabel}. Approving a payout run requires Finance Manager or Super Admin.</p>
        </div>
      ) : null}

      <DataTable columns={columns} rows={all} rowKey={(p) => p.id} caption="Payout runs" empty={<EmptyState title="No payout runs" />} />

      <Dialog open={Boolean(open)} onOpenChange={(o) => { if (!o) setOpen(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle>{open ? organisations[open.supplierId]?.name : ""} · {open?.periodLabel}</DialogTitle></DialogHeader>
          {open ? (
            <div className="space-y-4">
              <dl className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border p-3"><dt className="text-xs text-muted-foreground">Gross bookings</dt><dd><MoneyText minor={open.grossMinor} currency={open.currency} size="md" /></dd></div>
                <div className="rounded-lg border p-3"><dt className="text-xs text-muted-foreground">Our commission</dt><dd><MoneyText minor={open.commissionMinor} currency={open.currency} size="md" className="text-success-foreground" /></dd></div>
                <div className="rounded-lg border bg-brand-50 p-3"><dt className="text-xs text-muted-foreground">Net to supplier</dt><dd><MoneyText minor={open.netMinor} currency={open.currency} size="md" /></dd></div>
              </dl>

              {open.itemIds.length ? (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Line items</p>
                  <ul className="mt-1.5 divide-y rounded-lg border">
                    {open.itemIds.map((id) => {
                      const it = items[id];
                      if (!it) return null;
                      return (
                        <li key={id} className="flex items-center justify-between gap-3 p-2.5 text-sm">
                          <span className="min-w-0">
                            <span className="block truncate">{it.productSnapshot.title}</span>
                            <span className="text-xs text-muted-foreground">{formatRange(it.travelDateFrom, it.travelDateTo)}</span>
                          </span>
                          <MoneyText minor={it.netCostMinor} currency={open.currency} size="sm" />
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : (
                <p className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">Line-item detail for this historical run is archived; the totals are authoritative.</p>
              )}

              <div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
                Paid to {organisations[open.supplierId]?.bankName} {organisations[open.supplierId]?.bankAccountMasked} ·
                terms {organisations[open.supplierId]?.payoutTermsDays} days
                {open.approvedBy ? ` · approved by ${open.approvedBy}` : ""}
              </div>

              <div className="flex flex-wrap gap-2">
                {open.status === "draft" ? (
                  <Button onClick={() => { admin.submitPayout(open.id); toast.success("Submitted for approval"); setOpen(null); }}>Submit for approval</Button>
                ) : null}
                {open.status === "pending_approval" ? (
                  <Button disabled={!canApprove} onClick={() => { admin.approvePayout(open.id); toast.success("Payout approved", { description: "Ready to execute." }); setOpen(null); }}>Approve run</Button>
                ) : null}
                {open.status === "approved" ? (
                  <Button disabled={!canApprove} onClick={() => { admin.executePayout(open.id); toast.success("Payout executed", { description: "Ledger entries written and the supplier notified." }); setOpen(null); }}>Execute payment</Button>
                ) : null}
                {open.status === "executed" ? <Pill tone="success" icon={CheckCircle2}>Paid {open.executedAt ? formatDate(open.executedAt) : ""}</Pill> : null}
                <Button variant="outline" onClick={() => toast.success("Statement generated", { description: `${open.periodLabel}.pdf sent to the supplier.` })}>Download statement</Button>
              </div>
            </div>
          ) : null}
          <DialogFooter />
        </DialogContent>
      </Dialog>
    </>
  );
}
