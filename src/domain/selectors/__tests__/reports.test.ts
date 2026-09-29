import { describe, expect, it } from "vitest";
import { major } from "../../money";
import { recordExpense, recordPayment, recordSupplierPayment, voidLine } from "../../commands";
import { createWorld, NOW, run, type World } from "../../__tests__/fixtures";
import { issuedFlightScenario } from "../../__tests__/builders";
import { payablesAging, receivablesAging } from "../balances";
import {
  airlineSalesReport,
  bspPeriodReport,
  cashBookReport,
  matchBspBilling,
  monthKpis,
  mySalesReport,
  pnlReport,
  presetPeriod,
  salesByAgent,
  salesSeries,
  topClients,
  type ReportParams,
} from "../reports";

const usd = (n: number) => major(n, "USD");
const tzs = (n: number) => major(n, "TZS");
const params = (w: World, over: Partial<ReportParams> = {}): ReportParams => ({ ...presetPeriod("month", NOW), displayCurrency: "USD", now: NOW, ...over });

function world() {
  const w = createWorld();
  const a = issuedFlightScenario(w); // neema, USD 1,523.60 sell, margin 70
  const b = issuedFlightScenario(w, { who: "neema", total: 1000 });
  run(w, recordPayment, { clientId: a.clientId, amount: usd(500), allocations: [{ fileId: a.fileId, amount: usd(500) }], method: "cash", accountId: w.acc.crdbUsd }, "neema");
  return { w, a, b };
}

describe("period presets", () => {
  it("covers today, the ISO week, this and last month, and the year in Dar dates", () => {
    expect(presetPeriod("today", NOW)).toEqual({ from: "2026-09-28", to: "2026-09-28" });
    expect(presetPeriod("week", NOW)).toEqual({ from: "2026-09-28", to: "2026-10-04" });
    expect(presetPeriod("month", NOW)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(presetPeriod("last_month", NOW)).toEqual({ from: "2026-08-01", to: "2026-08-31" });
    expect(presetPeriod("year", NOW)).toEqual({ from: "2026-01-01", to: "2026-12-31" });
  });
});

describe("sales", () => {
  it("counts issued lines by issue date and excludes voided ones", () => {
    const { w, b } = world();
    let r = mySalesReport(w.db, params(w, { agentId: w.users.neema.id }));
    expect(r.rows).toHaveLength(2);
    expect(r.totals!.sell).toEqual(usd(1523.6 + 1073.6));
    expect(r.totals!.margin).toEqual(usd(140));
    run(w, voidLine, { lineId: b.lineId }, "neema");
    r = mySalesReport(w.db, params(w, { agentId: w.users.neema.id }));
    expect(r.rows).toHaveLength(1);
    expect(mySalesReport(w.db, params(w, { agentId: w.users.baraka.id })).rows).toHaveLength(0);
  });

  it("feeds the Manager home: daily series, by agent and top clients in TZS", () => {
    const { w } = world();
    const series = salesSeries(w.db, 30, NOW);
    expect(series).toHaveLength(30);
    expect(series[29].date).toBe("2026-09-28");
    expect(series[29].sell).toEqual(tzs((1523.6 + 1073.6) * 2600));
    expect(series[29].count).toBe(2);
    const agents = salesByAgent(w.db, "2026-09-01", "2026-09-30");
    expect(agents[0].agent.id).toBe(w.users.neema.id);
    expect(agents[0].files).toBe(2);
    expect(agents.find((a) => a.agent.id === w.users.baraka.id)?.sell).toEqual(tzs(0));
    expect(topClients(w.db, "2026-09-01", "2026-09-30", 1)).toHaveLength(1);
  });

  it("reports airline fare, commission and net", () => {
    const { w } = world();
    const r = airlineSalesReport(w.db, params(w));
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].carrier).toBe("EK");
    expect(r.rows[0].ticketsIssued).toBe(2);
    expect(r.rows[0].fare).toEqual(usd(2450));
    expect(r.rows[0].net).toEqual(usd(2450));
  });
});

describe("month KPIs", () => {
  it("values stocks consistently with the aging reports", () => {
    const { w } = world();
    const k = monthKpis(w.db, NOW);
    expect(k.receivables.value).toEqual(receivablesAging(w.db, NOW).totals.total);
    expect(k.payables.value).toEqual(payablesAging(w.db, NOW).totals.total);
    expect(k.cashIn.value).toEqual(tzs(500 * 2600));
    expect(k.cash.value).toEqual(tzs(500 * 2600));
    expect(k.sales.previous).toEqual(tzs(0));
    expect(k.sales.trend).toBeUndefined();
  });
});

describe("money reports", () => {
  it("cash book runs a balance per account", () => {
    const { w, a } = world();
    run(w, recordSupplierPayment, { supplierId: w.sup.consolidator, amount: usd(200), accountId: w.acc.crdbUsd, allocations: [{ lineId: a.lineId, amount: usd(200) }] }, "peter");
    const r = cashBookReport(w.db, { ...params(w), accountId: w.acc.crdbUsd });
    expect(r.accounts[0].moneyIn).toEqual(usd(500));
    expect(r.accounts[0].moneyOut).toEqual(usd(200));
    expect(r.accounts[0].closing).toEqual(usd(300));
    expect(r.rows.map((x) => x.balance)).toEqual([usd(500), usd(300)]);
  });

  it("P&L nets ledger revenue against expenses, VAT excluded", () => {
    const { w } = world();
    run(w, recordExpense, { category: "rent", payee: "Landlord", amount: tzs(260_000), accountId: w.acc.cashTzs, paidAt: "2026-09-20" }, "peter");
    const r = pnlReport(w.db, params(w));
    const sep = r.rows.find((x) => x.month === "2026-09")!;
    expect(sep.revenue).toEqual(usd(140)); // markup 50 + fee 20, twice
    expect(sep.expenses).toEqual(usd(100));
    expect(sep.net).toEqual(usd(40));
    expect(r.notes?.[0]).toMatch(/^Management view, not statutory accounts/);
  });
});

describe("air settlement period", () => {
  it("lists every ticket document and matches a billing file by ticket number", () => {
    const { w, b } = world();
    run(w, voidLine, { lineId: b.lineId }, "neema");
    const r = bspPeriodReport(w.db, params(w));
    expect(r.rows.map((x) => x.event).sort()).toEqual(["issued", "issued", "voided"]);
    expect(r.totals!.net).toEqual(usd(1450));
    const issued = r.rows.filter((x) => x.event === "issued");
    const csv = `ticket,amount\n${issued[0].ticketNumber},${issued[0].net.amountMinor / 100}\n176-9999999999,10\n`;
    const m = matchBspBilling(r.rows, csv);
    expect(m.find((x) => x.ticketNumber === issued[0].ticketNumber)?.status).toBe("match");
    expect(m.find((x) => x.ticketNumber === "176-9999999999")?.status).toBe("missing_in_ours");
  });
});
