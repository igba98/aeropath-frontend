import { describe, expect, it } from "vitest";
import type { Role, User } from "../types";
import { defaultSettings } from "../defaults";
import { major } from "../money";
import { can, canAccessRoute, forbiddenMessage, refundNeedsManager, routeAction, type Action } from "../permissions";
import { NOW } from "./fixtures";

const as = (role: Role, active = true): Pick<User, "role" | "active"> => ({ role, active });
const ROLES: Role[] = ["agent", "accountant", "manager"];

/** Spec §4.2, one entry per matrix row. true = allowed (✓ or 👁 view), false = —. [agent, accountant, manager] */
const MATRIX: { row: string; actions: Action[]; allowed: [boolean, boolean, boolean] }[] = [
  { row: "Home dashboard", actions: ["home.view"], allowed: [true, true, true] },
  { row: "View bookings and clients (Accountant view only)", actions: ["booking.view", "client.view"], allowed: [true, true, true] },
  { row: "Create and edit clients and travellers", actions: ["client.create", "client.edit", "traveller.edit"], allowed: [true, true, true] },
  { row: "Set a corporate credit limit and payment terms", actions: ["client.set_credit"], allowed: [false, false, true] },
  { row: "Create bookings and add or edit service lines", actions: ["booking.create", "booking.edit", "line.edit"], allowed: [true, false, true] },
  { row: "Set the selling price at or above cost", actions: ["line.price"], allowed: [true, false, true] },
  { row: "Sell below cost", actions: ["line.price_below_cost"], allowed: [false, false, true] },
  { row: "Transition a line", actions: ["line.transition"], allowed: [true, false, true] },
  { row: "Void a flight", actions: ["line.void"], allowed: [true, false, true] },
  { row: "Request a refund or exchange", actions: ["refund.request"], allowed: [true, false, true] },
  { row: "Approve or reject a refund at or below the limit", actions: ["refund.approve"], allowed: [false, true, true] },
  { row: "Pay out an approved client refund", actions: ["refund.pay"], allowed: [false, true, true] },
  { row: "Record a payment received", actions: ["payment.record"], allowed: [true, true, true] },
  { row: "Verify a payment", actions: ["payment.verify"], allowed: [false, true, true] },
  { row: "Reverse a payment", actions: ["payment.reverse"], allowed: [false, true, true] },
  { row: "Issue an invoice or quote; print or share", actions: ["document.issue", "document.print"], allowed: [true, true, true] },
  { row: "Money out: supplier balances and payments", actions: ["moneyout.view", "supplier_payment.record"], allowed: [false, true, true] },
  { row: "Record expenses", actions: ["expense.record"], allowed: [false, true, true] },
  { row: "Reports: My sales", actions: ["report.my_sales"], allowed: [true, true, true] },
  { row: "Reports: all others", actions: ["report.view"], allowed: [false, true, true] },
  { row: "Audit log (Accountant view only)", actions: ["audit.view"], allowed: [false, true, true] },
  { row: "Settings: company, fees, tax, FX, numbering, money accounts (view)", actions: ["settings.view"], allowed: [false, true, true] },
  { row: "Settings: company, fees, tax, FX, numbering, money accounts (edit)", actions: ["settings.edit", "money_account.manage"], allowed: [false, false, true] },
  { row: "Settings: users, integrations, reset demo data", actions: ["settings.admin", "user.manage", "integration.manage", "demo.reset"], allowed: [false, false, true] },
  { row: "Reassign a booking to another agent", actions: ["booking.reassign"], allowed: [false, false, true] },
];

describe("permission matrix (§4.2)", () => {
  for (const r of MATRIX) {
    ROLES.forEach((role, i) => {
      it(`${r.row} — ${role}: ${r.allowed[i] ? "allowed" : "not allowed"}`, () => {
        for (const a of r.actions) expect(can(as(role), a)).toBe(r.allowed[i]);
      });
    });
  }

  it("deactivated users can do nothing", () => {
    expect(can(as("manager", false), "home.view")).toBe(false);
    expect(forbiddenMessage("home.view", undefined, as("manager", false))).toMatch(/deactivated/);
  });
});

describe("refund approval limit (resource-aware)", () => {
  const settings = defaultSettings(NOW); // TZS 500,000 limit, 2600 TZS/USD
  it("Approve or reject a refund above the limit — Manager only", () => {
    const above = { clientRefund: major(500_001, "TZS"), settings };
    expect(can(as("agent"), "refund.approve", above)).toBe(false);
    expect(can(as("accountant"), "refund.approve", above)).toBe(false);
    expect(can(as("manager"), "refund.approve", above)).toBe(true);
    expect(forbiddenMessage("refund.approve", above)).toBe("Only a Manager can approve refunds above TZS 500,000.");
  });
  it("at the limit an Accountant may approve", () => {
    expect(can(as("accountant"), "refund.approve", { clientRefund: major(500_000, "TZS"), settings })).toBe(true);
  });
  it("converts USD refunds to TZS for the check", () => {
    expect(refundNeedsManager(major(192, "USD"), settings)).toBe(false); // TZS 499,200
    expect(refundNeedsManager(major(193, "USD"), settings)).toBe(true); // TZS 501,800
    expect(can(as("accountant"), "refund.approve", { clientRefund: major(193, "USD"), settings })).toBe(false);
  });
});

describe("forbidden messages name who can do it", () => {
  it("uses plain words", () => {
    expect(forbiddenMessage("payment.verify")).toBe("Only an Accountant or a Manager can verify payments.");
    expect(forbiddenMessage("line.price_below_cost")).toBe("Only a Manager can sell below cost, with a reason.");
    expect(forbiddenMessage("line.void")).toBe("Only an Agent or a Manager can void tickets.");
  });
});

describe("route guard", () => {
  it("maps routes to actions (longest prefix wins)", () => {
    expect(routeAction("/")).toBe("home.view");
    expect(routeAction("/bookings")).toBe("booking.view");
    expect(routeAction("/bookings/fil_1")).toBe("booking.view");
    expect(routeAction("/bookings/new")).toBe("booking.create");
    expect(routeAction("/money-out/suppliers/sup_1")).toBe("moneyout.view");
    expect(routeAction("/reports")).toBe("report.my_sales");
    expect(routeAction("/reports/my-sales")).toBe("report.my_sales");
    expect(routeAction("/reports/pnl")).toBe("report.view");
    expect(routeAction("/settings/company")).toBe("settings.view");
    expect(routeAction("/settings/users")).toBe("settings.admin");
    expect(routeAction("/settings/audit")).toBe("audit.view");
    expect(routeAction("/forbidden")).toBeNull();
  });
  it("blocks an Agent from money out, other reports and settings (demo step 10)", () => {
    const agent = as("agent");
    expect(canAccessRoute(agent, "/money-out")).toBe(false);
    expect(canAccessRoute(agent, "/reports/sales")).toBe(false);
    expect(canAccessRoute(agent, "/reports/my-sales")).toBe(true);
    expect(canAccessRoute(agent, "/reports")).toBe(true);
    expect(canAccessRoute(agent, "/settings")).toBe(false);
    expect(canAccessRoute(agent, "/bookings/new")).toBe(true);
  });
  it("lets the Accountant view settings and the audit log but not users or integrations", () => {
    const acc = as("accountant");
    expect(canAccessRoute(acc, "/settings/fx")).toBe(true);
    expect(canAccessRoute(acc, "/settings/audit")).toBe(true);
    expect(canAccessRoute(acc, "/settings/integrations")).toBe(false);
    expect(canAccessRoute(acc, "/bookings/new")).toBe(false);
  });
});
