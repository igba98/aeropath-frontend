"use client";

import { useState } from "react";
import { Download, Percent, Receipt } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, StatTile } from "@/components/chrome/console-shell";
import { DataTable, type Column } from "@/components/shared/data-table";
import { MoneyText } from "@/components/shared/money-text";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSession } from "@/hooks/use-session";
import { useStore } from "@/lib/store";
import { monthKey, monthLabel } from "@/features/partner/csv";
import { TOURISM_LEVY_PCT, VAT_PCT } from "@/lib/domain/pricing";

interface TaxRow { period: string; vatMinor: number; levyMinor: number; bookings: number; grossMinor: number }

/** F09 · Tax. VAT, tourism levy and the filing summary. */
export default function TaxPage() {
  const s = useSession();
  const bookings = useStore((st) => st.bookings);
  const items = useStore((st) => st.items);
  const ledger = useStore((st) => st.ledger);
  const [period, setPeriod] = useState("all");

  if (!s.hydrated) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;
  if (!s.can("FINANCE:view")) {
    return (
      <>
        <PageHeader title="Tax" code="F09" />
        <div className="rounded-xl border border-warning/40 bg-warning/5 p-6 text-sm">
          <p className="font-medium">Not available to your role</p>
          <p className="mt-0.5 text-muted-foreground">Signed in as {s.roleLabel}. Tax reporting is visible to finance roles and auditors.</p>
        </div>
      </>
    );
  }

  const paid = Object.values(bookings).filter((b) => b.paymentStatus === "succeeded");
  const byPeriod = paid.reduce<Record<string, TaxRow>>((acc, b) => {
    const key = monthKey(b.createdAt);
    const bookingItems = Object.values(items).filter((i) => i.bookingId === b.id);
    const levy = bookingItems.filter((i) => i.vertical === "stay").reduce((s2, i) => s2 + Math.round((i.sellPriceMinor - i.taxMinor - i.feeMinor) * (TOURISM_LEVY_PCT / 100)), 0);
    acc[key] ??= { period: key, vatMinor: 0, levyMinor: 0, bookings: 0, grossMinor: 0 };
    acc[key].vatMinor += Math.max(0, b.taxMinor - levy);
    acc[key].levyMinor += levy;
    acc[key].bookings += 1;
    acc[key].grossMinor += b.totalMinor;
    return acc;
  }, {});

  const rows = Object.values(byPeriod).sort((a, b) => b.period.localeCompare(a.period));
  const shown = period === "all" ? rows : rows.filter((r) => r.period === period);
  const vatLedger = ledger.filter((e) => e.account === "liability.vat_payable").reduce((s2, e) => s2 + e.creditMinor - e.debitMinor, 0);

  const columns: Column<TaxRow>[] = [
    { key: "period", header: "Period", render: (r) => <span className="font-medium">{monthLabel(r.period)}</span> },
    { key: "bookings", header: "Bookings", numeric: true, render: (r) => <span>{r.bookings}</span> },
    { key: "gross", header: "Gross", numeric: true, render: (r) => <MoneyText minor={r.grossMinor} currency="TZS" size="sm" showCurrency={false} /> },
    { key: "vat", header: `VAT ${VAT_PCT}%`, numeric: true, render: (r) => <MoneyText minor={r.vatMinor} currency="TZS" size="sm" showCurrency={false} /> },
    { key: "levy", header: `Tourism levy ${TOURISM_LEVY_PCT}%`, numeric: true, render: (r) => <MoneyText minor={r.levyMinor} currency="TZS" size="sm" showCurrency={false} /> },
    { key: "total", header: "Total payable", numeric: true, render: (r) => <MoneyText minor={r.vatMinor + r.levyMinor} currency="TZS" size="sm" /> },
  ];

  const totalVat = shown.reduce((s2, r) => s2 + r.vatMinor, 0);
  const totalLevy = shown.reduce((s2, r) => s2 + r.levyMinor, 0);

  return (
    <>
      <PageHeader
        title="Tax"
        code="F09"
        description="Tax rates are data, not code branches, so a rate change or a new market is a configuration edit."
        actions={<Button variant="outline" className="gap-1.5" onClick={() => toast.success("Filing pack generated", { description: "VAT return and levy schedule exported." })}><Download className="size-4" aria-hidden /> Export filing pack</Button>}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <StatTile label={`VAT collected (${VAT_PCT}%)`} value={<MoneyText minor={totalVat} currency="TZS" size="lg" compact />} icon={Percent} />
        <StatTile label={`Tourism levy (${TOURISM_LEVY_PCT}%)`} value={<MoneyText minor={totalLevy} currency="TZS" size="lg" compact />} hint="Stays only" />
        <StatTile label="Total payable" value={<MoneyText minor={totalVat + totalLevy} currency="TZS" size="lg" compact />} tone="warning" icon={Receipt} />
        <StatTile label="VAT liability in ledger" value={<MoneyText minor={vatLedger} currency="TZS" size="lg" compact />} hint="From liability.vat_payable" />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label htmlFor="tax-period" className="text-sm text-muted-foreground">Period</label>
        <Select value={period} onValueChange={setPeriod}>
          <SelectTrigger id="tax-period" className="w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All periods</SelectItem>
            {rows.map((r) => <SelectItem key={r.period} value={r.period}>{monthLabel(r.period)}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <DataTable columns={columns} rows={shown} rowKey={(r) => r.period} caption="Tax by period" />

      <div className="mt-4 rounded-xl border bg-card p-4 text-sm">
        <p className="font-medium">Filing notes</p>
        <ul className="mt-2 space-y-1.5 text-muted-foreground">
          <li>VAT is charged at {VAT_PCT}% on the taxable base including extras and any agency markup.</li>
          <li>The tourism levy of {TOURISM_LEVY_PCT}% applies to accommodation only and is remitted separately.</li>
          <li>Withholding tax on supplier payouts is deducted at source where the supplier is not VAT registered.</li>
          <li>Financial records are retained for the statutory period and are exempt from erasure requests — erasure pseudonymises personal fields while preserving the ledger.</li>
        </ul>
      </div>
    </>
  );
}
