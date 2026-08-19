import { describe, expect, it } from "vitest";
import { buildSeed } from "@/lib/store/seed";
import { unitFor } from "@/lib/api/catalog";

const d = buildSeed();

describe("supplier console data", () => {
  it("serena has real rows on every screen", () => {
    const org = d.organisations["sup_serena"];
    expect(org.type).toBe("supplier");
    const items = Object.values(d.items).filter((i) => i.supplierId === "sup_serena");
    const pending = items.filter((i) => i.status === "awaiting_supplier");
    console.log("serena items", items.length, "pending", pending.length, "slaDeadlines", pending.map((p) => p.slaDeadlineAt));
    console.log("products", Object.values(d.products).filter((p) => p.supplierId === "sup_serena").map((p) => `${p.id}:${p.status}:${p.completeness}`));
    console.log("payouts", Object.values(d.payouts).filter((p) => p.supplierId === "sup_serena").map((p) => `${p.periodLabel}:${p.status}:${p.netMinor}`));
    console.log("reviews", Object.values(d.reviews).filter((r) => r.supplierId === "sup_serena").length);
    console.log("users", Object.values(d.users).filter((u) => u.organisationId === "sup_serena").map((u) => `${u.name}:${u.grants[0].roleId}`));
    expect(pending.length).toBeGreaterThan(0);
  });
  it("kubu (staff persona) has pending + breached", () => {
    const items = Object.values(d.items).filter((i) => i.supplierId === "sup_kubu");
    const pending = items.filter((i) => i.status === "awaiting_supplier");
    console.log("kubu pending", pending.map((p) => ({ sla: p.slaDeadlineAt, breached: new Date(p.slaDeadlineAt!).getTime() < Date.now(), ref: d.bookings[p.bookingId].reference })));
    console.log("kubu products", Object.values(d.products).filter((p) => p.supplierId === "sup_kubu").map((p) => p.id));
    expect(pending.length).toBeGreaterThan(0);
  });
  it("kili_exp has a draft tour with itinerary", () => {
    const p = d.products["prd_tour_tarangire_new"];
    console.log("draft tour", p.status, p.completeness, JSON.stringify(p.attributes.itinerary));
    console.log("kili user", Object.values(d.users).filter((u) => u.organisationId === "sup_kili_exp").map((u) => u.name));
  });
  it("inventory overrides are visible", () => {
    const overrides = Object.values(d.inventory).map((u) => `${u.productId} ${u.date} cap${u.capacityTotal} sold${u.capacitySold} stop${u.stopSell}`);
    console.log(overrides);
    const anyStop = Object.values(d.inventory).filter((u) => u.stopSell);
    expect(anyStop.length).toBeGreaterThan(0);
    console.log("default unit", unitFor(d as never, "prd_serena_lodge", "2026-12-01"));
  });
});
