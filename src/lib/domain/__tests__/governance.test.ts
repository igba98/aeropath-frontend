import { describe, expect, it } from "vitest";
import { quoteRefund, requiredApprover } from "../refunds";
import { evaluatePolicy } from "../policy";
import { hasPermission, visibleAdminSections } from "../permissions";
import type { Organisation, Product } from "../types";

describe("refund threshold ladder", () => {
  it("needs no approval inside the free window", () => expect(requiredApprover(5_000_000, true)).toBe("none"));
  it("routes up to 500k to an officer", () => expect(requiredApprover(500_000, false)).toBe("officer"));
  it("routes 500k–2M to a manager", () => expect(requiredApprover(1_500_000, false)).toBe("manager"));
  it("routes above 2M to dual approval", () => expect(requiredApprover(2_000_001, false)).toBe("dual"));
  it("always routes goodwill to a manager", () => expect(requiredApprover(10_000, false, true)).toBe("manager"));
});

describe("refund quote against the policy snapshot", () => {
  const snap = {
    policyId: "cp_moderate", name: "Moderate", summary: "",
    tiers: [{ daysBefore: 14, refundPct: 100 }, { daysBefore: 7, refundPct: 50 }, { daysBefore: 0, refundPct: 0 }],
  };
  const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

  it("refunds fully when far out", () => {
    const q = quoteRefund(snap, 1_000_000, day(20));
    expect(q.refundMinor).toBe(1_000_000);
    expect(q.withinFreeWindow).toBe(true);
  });
  it("refunds half inside the second tier", () => expect(quoteRefund(snap, 1_000_000, day(10)).refundMinor).toBe(500_000));
  it("refunds nothing at the last minute", () => expect(quoteRefund(snap, 1_000_000, day(2)).refundMinor).toBe(0));
});

describe("corporate travel policy", () => {
  const org: Organisation = {
    id: "o", type: "corporate", name: "X", countryCode: "TZ", city: "Dar", status: "active", createdAt: "",
    travelPolicy: { stayCapPerNightMinor: 250_000, flightCabin: "economy", advancePurchaseDays: 0, preferredSupplierIds: [], requireApprovalAboveMinor: 0 },
  };
  const product = { attributes: {} } as unknown as Product;

  it("flags a stay above the nightly cap", () => {
    const r = evaluatePolicy(org, "stay", product, undefined, 380_000);
    expect(r.inPolicy).toBe(false);
    expect(r.requiresApproval).toBe(true);
    expect(r.capMinor).toBe(250_000);
  });
  it("passes a stay under the cap", () => expect(evaluatePolicy(org, "stay", product, undefined, 200_000).inPolicy).toBe(true));
  it("flags a cabin above policy", () => expect(evaluatePolicy(org, "flight", { attributes: { cabin: "business" } } as unknown as Product, undefined, 0).inPolicy).toBe(false));
  it("passes everything when the org has no policy", () => expect(evaluatePolicy(undefined, "stay", product, undefined, 9_000_000).inPolicy).toBe(true));
});

describe("permission matrix", () => {
  it("stops any supplier role from publishing directly", () => {
    expect(hasPermission(["supplier_admin"], "PRODUCT:approve")).toBe(false);
    expect(hasPermission(["supplier_staff"], "PRODUCT:approve")).toBe(false);
  });
  it("stops a supplier staff member from editing rate plans", () => {
    expect(hasPermission(["supplier_staff"], "RATEPLAN:manage")).toBe(false);
    expect(hasPermission(["supplier_admin"], "RATEPLAN:manage")).toBe(true);
  });
  it("lets the supply manager approve products", () => expect(hasPermission(["supply_manager"], "PRODUCT:approve")).toBe(true));
  it("stops a finance officer from issuing high refunds", () => {
    expect(hasPermission(["finance_officer"], "REFUND:issue_low")).toBe(true);
    expect(hasPermission(["finance_officer"], "REFUND:issue_high")).toBe(false);
    expect(hasPermission(["finance_manager"], "REFUND:issue_high")).toBe(true);
  });
  it("gives the super admin everything", () => expect(hasPermission(["super_admin"], "ANYTHING:at_all")).toBe(true));
  it("never shows net cost or commission to a traveller", () => {
    expect(hasPermission(["traveller"], "RATES:net")).toBe(false);
    expect(hasPermission(["guest"], "RATES:net")).toBe(false);
    expect(hasPermission(["supply_manager"], "COMMISSION:edit")).toBe(true);
    expect(hasPermission(["finance_manager"], "COMMISSION:edit")).toBe(true);
  });
  it("lets a write permission satisfy its read variant", () => expect(hasPermission(["ops_manager"], "BOOKING:view_any_read")).toBe(true));
  it("filters admin sections by role", () => {
    expect(visibleAdminSections(["finance_officer"])).toEqual(["finance"]);
    expect(visibleAdminSections(["support"])).toEqual(["ops", "support"]);
    expect(visibleAdminSections(["super_admin"])).toHaveLength(6);
    expect(visibleAdminSections(["traveller"])).toEqual([]);
  });
});
