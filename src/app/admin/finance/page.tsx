"use client";

import Link from "next/link";
import { useMemo } from "react";
import { AlertTriangle, ArrowRight, Coins, Percent, Receipt, Wallet } from "lucide-react";
import { PageHeader, StatTile } from "@/components/chrome/console-shell";
import { MoneyText } from "@/components/shared/money-text";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";
import { useStore } from "@/lib/store";
import { formatDate } from "@/lib/format";
import { AccessDenied, BarChart, ColumnChart, KeyValue, Note, Section, type BarRow } from "@/features/backoffice/ui";
import {
  SOLD_STATUSES, accountBalances, cashPosition, customerDeposits, dailyBuckets, grossBookings,
  netRevenue, receivables, supplierPayable, takeRatePct, unreconciled, vatPayable,
} from "@/features/backoffice/finance";

/** F01 · Finance dashboard. Every number is computed from the ledger, bookings and payments. */
export default function FinanceDashboardScreen() {
  const session = useSession();
  const ledger = useStore((s) => s.ledger);
  const bookings = useStore((s) => s.bookings);
  const items = useStore((s) => s.items);
  const payments = useStore((s) => s.payments);
  const refunds = useStore((s) => s.refunds);
  const payouts = useStore((s) => s.payouts);
  const organisations = useStore((s) => s.organisations);

  const metrics = useMemo(() => {
    const itemList = Object.values(items);
    const gross = grossBookings(itemList);
    const net = netRevenue(ledger);
    return {
      gross,
      net,
      takeRate: takeRatePct(gross, net),
      cash: cashPosition(ledger),
      deposits: customerDeposits(ledger),
      payable: supplierPayable(ledger),
      receivable: receivables(ledger),
      vat: vatPayable(ledger),
      pendingPayments: unreconciled(Object.values(payments)),
      balances: accountBalances(ledger),
      itemList,
    };
  }, [items, ledger, payments]);

  const daily = useMemo(() => {
    const buckets = dailyBuckets(14);
    return buckets.map((b) => {
      const value = Object.values(bookings)
        .filter((bk) => bk.createdAt.slice(0, 10) === b.key)
        .reduce((s, bk) => s + bk.totalMinor, 0);
      return { key: b.key, label: b.label, value, display: `TZS ${(value / 1_000_000).toFixed(1)}M` };
    });
  }, [bookings]);

  const byVertical = useMemo<BarRow[]>(() => {
    const map = new Map<string, number>();
    for (const i of metrics.itemList) {
      if (!SOLD_STATUSES.includes(i.status)) continue;
      map.set(i.vertical, (map.get(i.vertical) ?? 0) + i.sellPriceMinor);
    }
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([vertical, value]) => ({
        key: vertical,
        label: vertical.charAt(0).toUpperCase() + vertical.slice(1),
        value,
        display: <MoneyText minor={value} size="sm" compact />,
        hint: `${Math.round((value / Math.max(1, metrics.gross)) * 100)}%`,
      }));
  }, [metrics]);

  const pendingRefunds = Object.values(refunds).filter((r) => r.status === "pending_approval");
  const pendingRefundValue = pendingRefunds.reduce((s, r) => s + r.amountMinor, 0);
  const payoutsDue = Object.values(payouts).filter((p) => p.status !== "executed");
  const payoutsDueValue = payoutsDue.reduce((s, p) => s + p.netMinor, 0);

  // Until the persisted store hydrates, the server and client disagree on derived figures, so
  // render the skeleton in both passes — the convention every other console screen follows.
  if (!session.hydrated) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;

  if (session.hydrated && !session.can("FINANCE:view") && !session.can("LEDGER:view")) {
    return <AccessDenied what="Finance" needs={`${session.roleLabel} has neither FINANCE:view nor LEDGER:view. Sign in as a Finance Officer, Finance Manager, Auditor or an admin role.`} />;
  }

  return (
    <div>
      <PageHeader
        title="Finance dashboard"
        code="F01"
        description="Gross is what customers bought, net is what Aeropath keeps, cash is what is actually in the accounts. All three are different numbers and all three come from the ledger."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <StatTile label="Gross bookings" value={<MoneyText minor={metrics.gross} compact />} hint={`${metrics.itemList.filter((i) => SOLD_STATUSES.includes(i.status)).length} sold items`} icon={Receipt} />
        <StatTile label="Net revenue" value={<MoneyText minor={metrics.net} compact />} hint="Commission, markup and service fee" icon={Coins} />
        <StatTile label="Take rate" value={`${metrics.takeRate}%`} hint="Net revenue ÷ gross bookings" icon={Percent} />
        <StatTile label="Cash position" value={<MoneyText minor={metrics.cash} compact />} hint="All cash.* accounts, debits less credits" icon={Wallet} />
        <StatTile
          label="Unreconciled"
          value={metrics.pendingPayments.length}
          hint={metrics.pendingPayments.length ? "Payments waiting on a provider match" : "Nothing in flight"}
          tone={metrics.pendingPayments.length ? "warning" : "success"}
          icon={AlertTriangle}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Section title="Gross bookings · last 14 days" description="Booking value by the day the booking was created.">
          <ColumnChart points={daily} />
        </Section>

        <Section title="Gross bookings by vertical" description="Sold items only — held, expired and refunded value is excluded.">
          <BarChart rows={byVertical} />
        </Section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Section title="Balance sheet position" description="Straight from the double entry journal.">
          <KeyValue label="Cash and bank"><MoneyText minor={metrics.cash} size="sm" /></KeyValue>
          <KeyValue label="Receivables"><MoneyText minor={metrics.receivable} size="sm" /></KeyValue>
          <KeyValue label="Customer deposits held"><MoneyText minor={metrics.deposits} size="sm" /></KeyValue>
          <KeyValue label="Supplier payable"><MoneyText minor={metrics.payable} size="sm" /></KeyValue>
          <KeyValue label="VAT payable"><MoneyText minor={metrics.vat} size="sm" /></KeyValue>
          <div className="mt-2 border-t pt-2">
            <KeyValue label="Ledger lines">{ledger.length} across {metrics.balances.length} accounts</KeyValue>
          </div>
        </Section>

        <Section title="What needs a decision" description="Each queue is one click away.">
          <ul className="space-y-2 text-sm">
            <li className="flex items-center justify-between gap-3 rounded-lg border p-2.5">
              <div>
                <p className="font-medium">Unreconciled payments</p>
                <p className="text-xs text-muted-foreground">{metrics.pendingPayments.length} waiting · <MoneyText minor={metrics.pendingPayments.reduce((s, p) => s + p.amountMinor, 0)} size="xs" /></p>
              </div>
              <Button variant="outline" size="sm" asChild><Link href="/admin/finance/reconciliation">Open <ArrowRight className="size-4" aria-hidden /></Link></Button>
            </li>
            <li className="flex items-center justify-between gap-3 rounded-lg border p-2.5">
              <div>
                <p className="font-medium">Refunds pending approval</p>
                <p className="text-xs text-muted-foreground">{pendingRefunds.length} refunds · <MoneyText minor={pendingRefundValue} size="xs" /></p>
              </div>
              <Button variant="outline" size="sm" asChild><Link href="/admin/finance/refunds">Open <ArrowRight className="size-4" aria-hidden /></Link></Button>
            </li>
            <li className="flex items-center justify-between gap-3 rounded-lg border p-2.5">
              <div>
                <p className="font-medium">Payouts not yet executed</p>
                <p className="text-xs text-muted-foreground">{payoutsDue.length} runs · <MoneyText minor={payoutsDueValue} size="xs" /></p>
              </div>
              <Button variant="outline" size="sm" asChild><Link href="/admin/finance/payouts">Open <ArrowRight className="size-4" aria-hidden /></Link></Button>
            </li>
          </ul>
        </Section>

        <Section title="Supplier payouts" description="What each supplier is owed for runs not yet executed.">
          <ul className="space-y-2 text-sm">
            {payoutsDue.slice(0, 6).map((run) => (
              <li key={run.id} className="flex items-center justify-between gap-3 rounded-lg border p-2.5">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{organisations[run.supplierId]?.name ?? run.supplierId}</span>
                  <span className="text-xs text-muted-foreground">{run.periodLabel} · {run.status.replace(/_/g, " ")}</span>
                </span>
                <MoneyText minor={run.netMinor} size="sm" compact />
              </li>
            ))}
            {payoutsDue.length === 0 ? <li className="rounded-lg border p-2.5 text-muted-foreground">Every run has been executed.</li> : null}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">Latest run created {Object.values(payouts).length ? formatDate([...Object.values(payouts)].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0].createdAt) : "—"}.</p>
        </Section>
      </div>

      <div className="mt-4">
        <Note title="Why gross ≠ cash">
          Gross bookings counts the sell price of items the moment they are sold. Cash only moves when a payment settles, and part of that
          cash is still customer deposits owed to suppliers until confirmation recognises revenue. The gap between the two is exactly what
          the reconciliation and payout queues manage.
        </Note>
      </div>
    </div>
  );
}
