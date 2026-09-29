import { describe, expect, it } from "vitest";
import { generateSeed } from "@/store/seed/generate";
import { attentionItems } from "../attention";
import { payablesAging, receivablesAging } from "../balances";
import * as R from "../reports";

/** Every report, the attention list and the KPIs run on the demo seed without throwing and agree with each other. */
describe("reports on the demo seed", () => {
  const now = new Date("2026-09-28T09:00:00Z");
  const db = generateSeed(now);
  const RUN = {
    "my-sales": R.mySalesReport,
    sales: R.salesReport,
    profit: R.profitReport,
    "airline-sales": R.airlineSalesReport,
    receivables: R.receivablesReport,
    payables: R.payablesReport,
    "cash-book": R.cashBookReport,
    receipts: R.receiptsReport,
    "voids-refunds": R.voidsRefundsReport,
    expenses: R.expensesReport,
    pnl: R.pnlReport,
    "bsp-period": R.bspPeriodReport,
  } satisfies Record<R.ReportSlug, unknown>;

  it("has a runner for every slug in the catalogue", () => {
    expect(Object.keys(RUN).sort()).toEqual(R.REPORTS.map((r) => r.slug).sort());
  });

  for (const preset of ["today", "week", "month", "last_month", "year"] as const) {
    for (const cur of ["TZS", "USD"] as const) {
      it(`runs every report for ${preset} in ${cur}`, () => {
        const p = { ...R.presetPeriod(preset, now), displayCurrency: cur, now };
        for (const fn of Object.values(RUN)) {
          const r = (fn as (db: unknown, p: unknown) => R.ReportResult<unknown, unknown>)(db, p);
          expect(r.currency).toBe(cur);
          for (const s of r.summary) if (typeof s.value === "object") expect(s.value.currency).toBe(cur);
        }
      });
    }
  }

  it("gives every user a well-formed, de-duplicated attention list", () => {
    for (const u of Object.values(db.users)) {
      const items = attentionItems(db, u, now);
      expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
      for (const i of items) {
        expect(i.sentence).toMatch(/\.$/);
        expect(i.action.href.startsWith("/")).toBe(true);
      }
      if (u.role === "agent") expect(items.every((i) => !i.fileId || db.files[i.fileId].ownerId === u.id)).toBe(true);
    }
  });

  it("shows the same receivables and payables on Home as in the aging reports", () => {
    const k = R.monthKpis(db, now);
    expect(k.receivables.value).toEqual(receivablesAging(db, now).totals.total);
    expect(k.payables.value).toEqual(payablesAging(db, now).totals.total);
  });
});
