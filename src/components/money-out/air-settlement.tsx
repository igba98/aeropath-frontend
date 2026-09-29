"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import type { Currency, DbState, ID, Money } from "@/domain/types";
import { convert } from "@/domain/money";
import { lineSupplierCost } from "@/domain/selectors/core";
import { supplierBalances } from "@/domain/selectors/balances";
import { inPeriod, lineEventAt, lineIssuedAt, monthEnd, presetPeriod, shiftMonth, type Period } from "@/domain/selectors/reports/common";
import { useApp } from "@/store";
import { useNow } from "@/lib/use-now";
import { fmtDate } from "@/lib/dates";

import { Button } from "@/components/ui/button";
import { Amount } from "@/components/shared/amount";
import { Banner } from "@/components/shared/field";
import { Segmented } from "@/components/shared/page";
import { Strip, Trend } from "./strip";

interface PeriodStats {
  tickets: number;
  issuedLines: number;
  value: Money;
  voids: number;
  voidValue: Money;
  refunds: number;
  refundCredit: Money;
  net: Money;
}

/** Settlement figures for the air supplier in a period, in the supplier's currency (converted at the current rate). */
export function airPeriodStats(db: DbState, supplierId: ID, currency: Currency, p: Period): PeriodStats {
  const rate = db.settings.fx.USD_TZS;
  const to = (m: Money) => convert(m, currency, rate).amountMinor;
  const s = { tickets: 0, issuedLines: 0, value: 0, voids: 0, voidValue: 0, refunds: 0, refundCredit: 0 };
  for (const l of Object.values(db.lines)) {
    if (l.supplierId !== supplierId) continue;
    if (inPeriod(lineIssuedAt(l), p)) {
      s.issuedLines++;
      s.tickets += l.type === "flight" ? l.details.passengers.filter((x) => x.ticketNumber).length || l.details.passengers.length || 1 : 1;
      s.value += to(l.pricing.cost);
    }
    if (inPeriod(lineEventAt(l, "voided"), p)) {
      s.voids++;
      s.voidValue += to(l.pricing.cost);
    }
    if (inPeriod(lineEventAt(l, "refunded"), p)) {
      s.refunds++;
      s.refundCredit += to(l.pricing.cost) - to(lineSupplierCost(db, l));
    }
  }
  const m = (n: number): Money => ({ amountMinor: n, currency });
  return { tickets: s.tickets, issuedLines: s.issuedLines, value: m(s.value), voids: s.voids, voidValue: m(s.voidValue), refunds: s.refunds, refundCredit: m(s.refundCredit), net: m(s.value - s.voidValue - s.refundCredit) };
}

const monthName = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleString("en-US", { month: "short", timeZone: "UTC" });

/** Banner panel at the top of Money out → Suppliers for the BSP / consolidator supplier (spec §9.9). */
export function AirSettlementPanel() {
  const db = useApp((s) => s.db)!;
  const now = useNow();
  const [which, setWhich] = React.useState<"month" | "last_month">("month");
  const { supplierId, mode } = db.settings.airSettlement;
  const supplier = supplierId ? db.suppliers[supplierId] : undefined;

  const period = presetPeriod(which, now);
  const prevFrom = shiftMonth(period.from, -1);
  const prevPeriod: Period = { from: prevFrom, to: monthEnd(prevFrom) };

  // Cheap passes over the lines; supplierBalances is cached per db snapshot.
  const stats = supplier ? airPeriodStats(db, supplier.id, supplier.currency, period) : null;
  const before = supplier ? airPeriodStats(db, supplier.id, supplier.currency, prevPeriod) : null;
  const balance = supplier ? supplierBalances(db, now).find((b) => b.supplier.id === supplier.id) : undefined;

  if (!supplier || !stats || !before) {
    return (
      <Banner tone="warn" title="No air settlement supplier chosen">
        A Manager picks BSP Tanzania or the consolidator in{" "}
        <Link href="/settings/suppliers" className="underline">
          Settings → Suppliers
        </Link>
        . Until then, ticket totals for the period can&rsquo;t be shown here.
      </Banner>
    );
  }

  const prevLabel = monthName(prevPeriod.from);

  return (
    <section aria-labelledby="air-h" className="overflow-hidden rounded-xl border border-rule bg-card shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-5 pt-5 pb-4">
        <div className="min-w-0">
          <h2 id="air-h" className="text-[17px] leading-6 font-semibold text-ink">
            {supplier.name}
            <span className="ml-2 rounded-full bg-canvas-2 px-2 py-0.5 align-[2px] text-xs font-semibold text-ink-2">{mode === "bsp" ? "BSP settlement" : "Consolidator"}</span>
          </h2>
          <p className="tnum mt-0.5 text-sm text-ink-3">
            {fmtDate(period.from)} – {fmtDate(period.to)} · amounts in {supplier.currency}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            label="Period"
            value={which}
            onChange={setWhich}
            options={[
              { value: "month", label: "This month" },
              { value: "last_month", label: "Last month" },
            ]}
          />
          <Button variant="outline" size="sm" asChild>
            <Link href={`/money-out/suppliers/${supplier.id}`}>
              Review and pay <ArrowRight />
            </Link>
          </Button>
        </div>
      </div>
      <Strip
        flush
        items={[
          { label: "Tickets issued", value: stats.tickets.toLocaleString("en-US"), sub: <Trend current={stats.tickets} previous={before.tickets} label={prevLabel} /> },
          { label: "Value (net fare)", value: <Amount value={stats.value} />, sub: <Trend current={stats.value.amountMinor} previous={before.value.amountMinor} label={prevLabel} /> },
          { label: "Voids", value: stats.voids.toLocaleString("en-US"), sub: stats.voids ? <Amount value={stats.voidValue} /> : "None" },
          { label: "Refunds", value: stats.refunds.toLocaleString("en-US"), sub: stats.refunds ? <>credit <Amount value={stats.refundCredit} /></> : "None" },
          { label: "Net for the period", value: <Amount value={stats.net} />, sub: "Value − voids − refund credit" },
          {
            label: "Net owed now",
            value: <Amount value={balance?.owed ?? { amountMinor: 0, currency: supplier.currency }} tone="balance" />,
            sub: balance && balance.overdue.amountMinor > 0 ? <>overdue <Amount value={balance.overdue} /></> : "Nothing overdue",
          },
        ]}
      />
    </section>
  );
}
