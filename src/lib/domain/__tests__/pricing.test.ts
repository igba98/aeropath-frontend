import { describe, expect, it } from "vitest";
import { allInFromBase, computePrice, nightsBetween } from "../pricing";
import { convertMinor, formatMoney } from "../money";
import type { RatePlan } from "../types";

const rp: RatePlan = {
  id: "rp", productId: "p", name: "Std", currency: "TZS", baseMinor: 100_000, basis: "per_unit_night",
  inclusions: [], cancellationPolicyId: "cp_flex", commissionPct: 15, extraAdultMinor: 20_000, refundable: true,
};

describe("pricing", () => {
  it("computes an all-in stay price with levy, VAT and service fee", () => {
    const p = computePrice({ vertical: "stay", ratePlan: rp, nights: 2, quantity: 1, pax: { adults: 2, children: 0, infants: 0 } });
    expect(p.baseMinor).toBe(200_000);
    expect(p.taxMinor).toBe(36_000 + 2_000); // VAT 18% of 200k + tourism levy 1%
    expect(p.feeMinor).toBe(6_000);
    expect(p.totalMinor).toBe(244_000);
    expect(p.commissionMinor).toBe(30_000);
    expect(p.netMinor).toBe(170_000);
  });

  it("keeps the breakdown lines equal to the total", () => {
    const p = computePrice({ vertical: "stay", ratePlan: rp, nights: 3, quantity: 2, pax: { adults: 4, children: 1, infants: 0 } });
    expect(p.lines.reduce((s, l) => s + l.amountMinor, 0)).toBe(p.totalMinor);
  });

  it("adds the extra adult supplement", () => {
    const p = computePrice({ vertical: "stay", ratePlan: rp, nights: 1, quantity: 1, pax: { adults: 3, children: 0, infants: 0 } });
    expect(p.baseMinor).toBe(120_000);
    expect(p.markupMinor).toBe(0);
  });

  it("caps a fixed promo at the base amount", () => {
    const p = computePrice({ vertical: "tour", ratePlan: { ...rp, basis: "per_person" }, nights: 1, quantity: 1, pax: { adults: 1, children: 0, infants: 0 }, promo: { code: "X", discountType: "fixed", discountValue: 999_999 } });
    expect(p.discountMinor).toBe(100_000);
  });

  it("prices per passenger with child and infant bands", () => {
    const p = computePrice({ vertical: "flight", ratePlan: { ...rp, basis: "per_passenger" }, nights: 1, quantity: 1, pax: { adults: 1, children: 1, infants: 1 } });
    expect(p.baseMinor).toBe(100_000 + 75_000 + 10_000);
  });

  it("includes extras per person where flagged", () => {
    const p = computePrice({
      vertical: "stay", ratePlan: rp, nights: 1, quantity: 1, pax: { adults: 2, children: 1, infants: 0 },
      extras: [{ id: "e", label: "Park fee", description: "", amountMinor: 10_000, perPerson: true, defaultChecked: true, category: "park_fee" }],
    });
    expect(p.baseMinor).toBe(100_000 + 30_000);
  });

  it("gives an indicative all-in figure for search cards", () => {
    expect(allInFromBase(100_000, "stay")).toBe(100_000 + 1_000 + 18_000 + 3_000);
    expect(allInFromBase(100_000, "flight")).toBe(100_000 + 18_000 + 3_000);
  });

  it("counts nights inclusively of at least one", () => {
    expect(nightsBetween("2026-09-01", "2026-09-04")).toBe(3);
    expect(nightsBetween("2026-09-01", "2026-09-01")).toBe(1);
  });
});

describe("money", () => {
  it("treats TZS as a zero-minor-unit currency", () => {
    expect(formatMoney(480_000, "TZS")).toContain("480,000");
    expect(formatMoney(480_000, "TZS")).toContain("TZS");
  });
  it("treats USD as two minor digits", () => expect(formatMoney(12_345, "USD")).toContain("123.45"));
  it("converts at the fixed prototype rate", () => {
    expect(convertMinor(2_600_000, "TZS", "USD")).toBe(100_000); // TZS 2.6M = USD 1,000.00
    expect(convertMinor(100_000, "USD", "TZS")).toBe(2_600_000);
    expect(convertMinor(500, "USD", "USD")).toBe(500);
  });
});
