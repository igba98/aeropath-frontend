"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, BadgeCheck, Banknote, ClipboardPaste, HandCoins, Landmark, Plane, PlaneTakeoff, Receipt, TrendingUp, Truck, Wallet } from "lucide-react";

import { can } from "@/domain/permissions";
import { attentionItems } from "@/domain/selectors/attention";
import { cashPositions, payablesAging, receivablesAging } from "@/domain/selectors/balances";
import { monthKpis } from "@/domain/selectors/reports";
import { convert } from "@/domain/money";
import { useApp, useMe, useUi } from "@/store";
import { useModals } from "@/store/modals";
import { useNow } from "@/lib/use-now";
import { fmtWeekday } from "@/lib/dates";
import { bookingRows, type BookingRow } from "@/lib/view-models";
import { receiptsToday, salesByAgent, salesFor, salesSeries, topClients } from "@/lib/home-metrics";

import { Button } from "@/components/ui/button";
import { Amount } from "@/components/shared/amount";
import { Section, StatCard } from "@/components/shared/page";
import { StatusChip } from "@/components/shared/status-chip";
import { FxNote } from "@/components/shared/fx-note";
import { AttentionList } from "@/components/home/attention-list";
import { AgingBar, CashTable, DepartingList, ReceiptsToday } from "@/components/home/blocks";
import { AgentBarChart, SalesLineChart } from "@/components/home/charts";

const ROLE = { agent: "Agent", accountant: "Accountant", manager: "Manager" } as const;

/** Relative change as a fraction, or null when there is nothing to compare. */
const rel = (cur: number, prev: number) => (prev ? (cur - prev) / Math.abs(prev) : null);

function greeting(now: Date) {
  const h = Number(now.toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: "Africa/Dar_es_Salaam" }));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

export default function HomePage() {
  const me = useMe();
  const db = useApp((s) => s.db)!;
  const now = useNow();
  const openPayment = useModals((s) => s.openPayment);
  const cur = useUi((s) => s.displayCurrency);
  const attention = React.useMemo(() => attentionItems(db, me, now), [db, me, now]);
  const rows = React.useMemo(() => bookingRows(db, now), [db, now]);
  const departing = React.useMemo(
    () =>
      rows
        .filter((r) => r.status === "confirmed" && r.daysToStart !== undefined && r.daysToStart >= 0 && r.daysToStart <= 7)
        .filter((r) => me.role !== "agent" || r.file.ownerId === me.id)
        .sort((a, b) => (a.start ?? "").localeCompare(b.start ?? "")),
    [rows, me],
  );
  const finance = me.role !== "agent";

  return (
    <div className="space-y-6 lg:space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] leading-9 font-bold tracking-[-0.02em] text-ink">
            {greeting(now)}, {me.name.split(" ")[0]}
          </h1>
          <p className="mt-1 text-[15px] text-ink-3">
            {fmtWeekday(now)} · {ROLE[me.role]} ·{" "}
            {attention.length ? (
              <>
                <span className="font-semibold text-ink">{attention.length}</span> thing{attention.length === 1 ? "" : "s"} need{attention.length === 1 ? "s" : ""} your attention
              </>
            ) : (
              "all clear"
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {can(me, "booking.create") && (
            <>
              <Button asChild>
                <Link href="/book">
                  <PlaneTakeoff /> Book a flight or hotel
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/bookings/new?paste=1">
                  <ClipboardPaste /> Paste PNR
                </Link>
              </Button>
            </>
          )}
          {can(me, "payment.record") && (
            <Button variant="outline" onClick={() => openPayment()} className="lg:hidden">
              <Wallet /> Record payment
            </Button>
          )}
        </div>
      </header>

      {me.role === "agent" && <AgentStats rows={rows} now={now} />}
      {me.role === "manager" && <ManagerStats now={now} />}
      {me.role === "accountant" && <AccountantStats now={now} />}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Section title="Needs attention" count={attention.length} description="Most urgent first. Each item has its one-click action." className="xl:col-span-2">
          <AttentionList items={attention} now={now} />
        </Section>
        <div className="min-w-0 space-y-6">
          <Section
            title="Departing in 7 days"
            count={departing.length}
            actions={
              <Button variant="ghost" size="sm" asChild>
                <Link href="/bookings?view=soon">
                  All <ArrowRight />
                </Link>
              </Button>
            }
          >
            <DepartingList rows={departing} />
          </Section>
          {finance && (
            <Section title="Today's receipts" description="By payment method, before verification.">
              <ReceiptsToday rows={receiptsToday(db, now, cur)} />
            </Section>
          )}
          {me.role === "agent" && <MyOpenBookings rows={rows} />}
        </div>
      </div>

      {me.role === "manager" && <ManagerCharts now={now} />}
      {finance && <FinanceBlocks now={now} />}

      <p className="text-[13px] text-ink-3">
        Totals in {cur}. <FxNote prefix="Other currencies at" />.
      </p>
    </div>
  );
}

function StatGrid({ children, cols = 4 }: { children: React.ReactNode; cols?: 4 | 6 }) {
  return <div className={cols === 6 ? "grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-3 2xl:grid-cols-6" : "grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4"}>{children}</div>;
}

function AgentStats({ rows, now }: { rows: BookingRow[]; now: Date }) {
  const me = useMe();
  const db = useApp((s) => s.db)!;
  const cur = useUi((s) => s.displayCurrency);
  const mine = salesFor(db, now, cur, { ownerId: me.id });
  const last = salesFor(db, now, cur, { ownerId: me.id, monthOffset: -1, sameDays: true });
  const owing = rows.filter((r) => r.file.ownerId === me.id && r.totals.balance.amountMinor > 0 && r.status !== "cancelled");
  const owingTotal = owing.reduce((s, r) => s + convert(r.totals.balance, cur, db.settings.fx.USD_TZS).amountMinor, 0);
  return (
    <StatGrid>
      <StatCard label="Services issued" icon={Plane} value={mine.count} trend={rel(mine.count, last.count)} footer="This month vs the same days last month" />
      <StatCard label="My sales" icon={TrendingUp} value={mine.sell} trend={rel(mine.sell.amountMinor, last.sell.amountMinor)} footer="Issued on my bookings" href="/reports/my-sales" />
      <StatCard label="My margin" icon={Banknote} value={mine.margin} trend={rel(mine.margin.amountMinor, last.margin.amountMinor)} footer="Markup and service fees" />
      <StatCard label="Clients owe me" icon={HandCoins} value={{ amountMinor: owingTotal, currency: cur }} footer={`${owing.length} bookings with a balance`} href="/bookings?view=unpaid" />
    </StatGrid>
  );
}

function ManagerStats({ now }: { now: Date }) {
  const db = useApp((s) => s.db)!;
  const cur = useUi((s) => s.displayCurrency);
  const k = React.useMemo(() => monthKpis(db, now, cur), [db, now, cur]);
  return (
    <StatGrid cols={6}>
      <StatCard label="Sales" icon={TrendingUp} value={k.sales.value} trend={k.sales.trend} footer="Month to date vs same days" href="/reports/sales" />
      <StatCard label="Margin" icon={Banknote} value={k.margin.value} trend={k.margin.trend} footer="Markup and fees earned" href="/reports/profit" />
      <StatCard label="Cash in" icon={Receipt} value={k.cashIn.value} trend={k.cashIn.trend} footer="Payments received" href="/reports/receipts" />
      <StatCard label="Cash on hand" icon={Landmark} value={k.cash.value} trend={k.cash.trend} footer="All money accounts" href="/reports/cash-book" />
      <StatCard label="Receivables" icon={HandCoins} value={k.receivables.value} trend={k.receivables.trend} trendNeutral footer="What clients owe us" href="/reports/receivables" />
      <StatCard label="Payables" icon={Truck} value={k.payables.value} trend={k.payables.trend} trendInvert footer="What we owe suppliers" href="/reports/payables" />
    </StatGrid>
  );
}

function AccountantStats({ now }: { now: Date }) {
  const db = useApp((s) => s.db)!;
  const cur = useUi((s) => s.displayCurrency);
  const k = React.useMemo(() => monthKpis(db, now, cur), [db, now, cur]);
  const unverified = Object.values(db.payments).filter((p) => p.direction === "in" && p.status === "recorded");
  const rec = receivablesAging(db, now).totals;
  const overdue = convert({ amountMinor: rec.buckets.d0_30.amountMinor + rec.buckets.d31_60.amountMinor + rec.buckets.d61_90.amountMinor + rec.buckets.d90plus.amountMinor, currency: rec.total.currency }, cur, db.settings.fx.USD_TZS);
  return (
    <StatGrid>
      <StatCard label="Cash on hand" icon={Landmark} value={k.cash.value} trend={k.cash.trend} footer="All money accounts, vs a month ago" href="/reports/cash-book" />
      <StatCard label="Receivables" icon={HandCoins} value={k.receivables.value} footer={<>Overdue <Amount value={overdue} className="font-semibold text-ink-2" /></>} href="/reports/receivables" />
      <StatCard label="Payables" icon={Truck} value={k.payables.value} trend={k.payables.trend} trendInvert footer="What we owe suppliers" href="/money-out" />
      <StatCard label="To verify" icon={BadgeCheck} value={unverified.length} footer="Payments waiting for a statement check" href="/payments?tab=unverified" tone={unverified.length ? "warn" : "default"} />
    </StatGrid>
  );
}

function ManagerCharts({ now }: { now: Date }) {
  const db = useApp((s) => s.db)!;
  const cur = useUi((s) => s.displayCurrency);
  const series = React.useMemo(() => salesSeries(db, now, cur, 30), [db, now, cur]);
  const agents = React.useMemo(() => salesByAgent(db, now, cur), [db, now, cur]);
  const top = React.useMemo(() => topClients(db, now, cur, 5), [db, now, cur]);
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <Section title="Sales and margin" description="Issued each day, last 30 days." className="xl:col-span-2">
        <SalesLineChart data={series} currency={cur} />
      </Section>
      <Section title="Sales by agent" description="This month.">
        <AgentBarChart data={agents} currency={cur} />
      </Section>
      <Section title="Top clients" description="Last 3 months, by sales issued." className="xl:col-span-3">
        {top.length === 0 ? (
          <p className="text-sm text-ink-3">No sales yet.</p>
        ) : (
          <ol className="-mx-5 -mb-5 grid divide-y divide-rule border-t border-rule md:grid-cols-5 md:divide-x md:divide-y-0">
            {top.map((c, i) => (
              <li key={c.clientId}>
                <Link href={`/clients/${c.clientId}`} className="flex h-full flex-col gap-1 px-5 py-4 transition-colors hover:bg-band-hover">
                  <span className="text-xs font-semibold text-ink-4">#{i + 1}</span>
                  <span className="truncate text-[15px] font-semibold text-ink">{c.name}</span>
                  <Amount value={c.sell} className="text-base font-bold" />
                  <span className="text-[13px] text-ink-3">
                    {c.files} booking{c.files === 1 ? "" : "s"}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </Section>
    </div>
  );
}

function FinanceBlocks({ now }: { now: Date }) {
  const db = useApp((s) => s.db)!;
  const cur = useUi((s) => s.displayCurrency);
  const rate = db.settings.fx.USD_TZS;
  const positions = cashPositions(db);
  const rec = receivablesAging(db, now);
  const pay = payablesAging(db, now);
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <Section
        title="Cash position"
        actions={
          <Button variant="ghost" size="sm" asChild>
            <Link href="/reports/cash-book">
              Cash book <ArrowRight />
            </Link>
          </Button>
        }
      >
        <CashTable positions={positions} displayCurrency={cur} rate={rate} />
      </Section>
      <Section title="Who owes us, and what we owe" description="Balances by age. Open a bar for the full report." className="xl:col-span-2">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <AgingBar totals={rec.totals} href="/reports/receivables" label={`Receivables · ${rec.rows.length} bookings`} />
          <AgingBar totals={pay.totals} href="/reports/payables" label={`Payables · ${pay.rows.length} suppliers`} />
        </div>
      </Section>
    </div>
  );
}

function MyOpenBookings({ rows }: { rows: BookingRow[] }) {
  const me = useMe();
  const open = rows.filter((r) => r.file.ownerId === me.id && (r.status === "draft" || r.status === "confirmed")).slice(0, 6);
  return (
    <Section
      title="My open bookings"
      count={open.length}
      actions={
        <Button variant="ghost" size="sm" asChild>
          <Link href="/bookings">
            All <ArrowRight />
          </Link>
        </Button>
      }
    >
      {open.length === 0 ? (
        <p className="rounded-lg bg-canvas px-4 py-6 text-center text-sm text-ink-3">No open bookings. Press N to start one.</p>
      ) : (
        <ul className="-mx-5 -mb-5 divide-y divide-rule border-t border-rule">
          {open.map((r) => (
            <li key={r.id}>
              <Link href={`/bookings/${r.id}`} className="flex items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-band-hover">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-ink">{r.title}</span>
                  <span className="tnum block text-[13px] text-ink-3">{r.number}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-1">
                  <Amount value={r.totals.balance.amountMinor ? r.totals.balance : r.totals.charges} className="text-sm font-semibold" />
                  <StatusChip status={`file.${r.status}`} size="xs" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}
