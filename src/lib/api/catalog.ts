import { getData, type StoreData } from "../store";
import type { InventoryUnit, Product, ProductStatus, RatePlan, Vertical } from "../domain/types";
import { computePrice, nightsBetween } from "../domain/pricing";
import { genId, mutate, notify, nowIso, writeAudit } from "./core";

export interface SearchParams {
  vertical: Vertical;
  q?: string;
  dateFrom?: string;
  dateTo?: string;
  adults?: number;
  children?: number;
  infants?: number;
  from?: string; // flights/transfers
  to?: string;
  minPrice?: number;
  maxPrice?: number;
  freeCancellation?: boolean;
  instantConfirm?: boolean;
  stars?: number[];
  types?: string[];
  amenities?: string[];
  sort?: "recommended" | "price_asc" | "price_desc" | "rating";
  includeUnavailable?: boolean;
}

export interface SearchHit {
  product: Product;
  fromRatePlan: RatePlan;
  /** all-in price for the query (nights × rooms etc.), minor units */
  totalMinor: number;
  /** all-in per night / per person indicative */
  unitMinor: number;
  netMinor: number;
  commissionPct: number;
  available: boolean;
  unitsLeft: number | null;
}

/** Deterministic default availability for a product/date, unless overridden in store */
export function unitFor(d: StoreData, productId: string, date: string): InventoryUnit {
  const key = `${productId}:${date}`;
  const override = d.inventory[key];
  if (override) return override;
  const p = d.products[productId];
  let cap = 8;
  if (p?.vertical === "stay") cap = Number(p.attributes.rooms ?? 20) > 60 ? 15 : 8;
  if (p?.vertical === "tour") cap = Number(p.attributes.groupMax ?? 12);
  if (p?.vertical === "transfer") cap = 6;
  if (p?.vertical === "flight") cap = 30;
  // pseudo random sold count from hash of key
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const sold = h % Math.max(1, Math.floor(cap * 0.7));
  return { id: key, productId, date, capacityTotal: cap, capacityHeld: 0, capacitySold: sold, stopSell: false };
}

export function datesBetween(from: string, to: string, inclusiveEnd = false): string[] {
  const out: string[] = [];
  const a = new Date(from + "T00:00:00Z");
  const b = new Date(to + "T00:00:00Z");
  for (let t = a.getTime(); inclusiveEnd ? t <= b.getTime() : t < b.getTime(); t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  if (out.length === 0) out.push(from);
  return out;
}

export function availabilityFor(d: StoreData, product: Product, dateFrom: string, dateTo: string, quantity = 1): { available: boolean; unitsLeft: number } {
  const dates = product.vertical === "stay" ? datesBetween(dateFrom, dateTo) : [dateFrom];
  let min = Infinity;
  for (const dt of dates) {
    const u = unitFor(d, product.id, dt);
    if (u.stopSell) return { available: false, unitsLeft: 0 };
    min = Math.min(min, u.capacityTotal - u.capacityHeld - u.capacitySold);
  }
  if (!isFinite(min)) min = 0;
  return { available: min >= quantity, unitsLeft: Math.max(0, min) };
}

export const catalog = {
  search(params: SearchParams, d: StoreData = getData()): SearchHit[] {
    const adults = params.adults ?? 2, children = params.children ?? 0, infants = params.infants ?? 0;
    const dateFrom = params.dateFrom ?? new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
    const dateTo = params.dateTo ?? new Date(Date.now() + 16 * 86_400_000).toISOString().slice(0, 10);
    const nights = nightsBetween(dateFrom, dateTo);
    const q = params.q?.trim().toLowerCase();
    const hits: SearchHit[] = [];
    for (const p of Object.values(d.products)) {
      if (p.vertical !== params.vertical || p.status !== "live") continue;
      if (q) {
        const hay = `${p.title} ${p.location.city} ${p.location.region} ${p.tags.join(" ")} ${p.description} ${JSON.stringify(p.attributes)}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      if (params.vertical === "flight") {
        const a = p.attributes as { from: string; to: string; fromCity: string; toCity: string };
        if (params.from && !`${a.from} ${a.fromCity}`.toLowerCase().includes(params.from.toLowerCase())) continue;
        if (params.to && !`${a.to} ${a.toCity}`.toLowerCase().includes(params.to.toLowerCase())) continue;
      }
      if (params.vertical === "transfer" && (params.from || params.to)) {
        const r = (p.attributes as { route: { from: string; to: string } }).route;
        const hay = `${r.from} ${r.to} ${p.title}`.toLowerCase();
        if (params.from && !hay.includes(params.from.toLowerCase())) continue;
        if (params.to && !hay.includes(params.to.toLowerCase())) continue;
      }
      if (params.freeCancellation && !p.freeCancellation) continue;
      if (params.instantConfirm && !p.instantConfirm) continue;
      if (params.stars?.length && !params.stars.includes(p.starRating ?? 0)) continue;
      if (params.types?.length && !params.types.includes(String(p.attributes.propertyType ?? ""))) continue;
      if (params.amenities?.length && !params.amenities.every((a) => p.amenities.includes(a))) continue;
      const plans = Object.values(d.ratePlans).filter((r) => r.productId === p.id);
      if (!plans.length) continue;
      const cheapest = [...plans].sort((a, b) => a.baseMinor - b.baseMinor)[0];
      const price = computePrice({ vertical: p.vertical, ratePlan: cheapest, nights: p.vertical === "stay" ? nights : 1, quantity: 1, pax: { adults, children, infants } });
      const perUnit = computePrice({ vertical: p.vertical, ratePlan: cheapest, nights: 1, quantity: 1, pax: p.vertical === "stay" || p.vertical === "transfer" ? { adults: 2, children: 0, infants: 0 } : { adults: 1, children: 0, infants: 0 } });
      if (params.minPrice != null && perUnit.totalMinor < params.minPrice) continue;
      if (params.maxPrice != null && perUnit.totalMinor > params.maxPrice) continue;
      const av = availabilityFor(d, p, dateFrom, dateTo, 1);
      if (!av.available && !params.includeUnavailable) continue;
      hits.push({ product: p, fromRatePlan: cheapest, totalMinor: price.totalMinor, unitMinor: perUnit.totalMinor, netMinor: price.netMinor ?? 0, commissionPct: cheapest.commissionPct, available: av.available, unitsLeft: av.unitsLeft });
    }
    const sort = params.sort ?? "recommended";
    hits.sort((a, b) => {
      if (sort === "price_asc") return a.unitMinor - b.unitMinor;
      if (sort === "price_desc") return b.unitMinor - a.unitMinor;
      if (sort === "rating") return (b.product.reviewScore ?? 0) - (a.product.reviewScore ?? 0);
      // recommended: rating × review count, then price
      const sa = (a.product.reviewScore ?? 3) * Math.log10((a.product.reviewCount ?? 1) + 10);
      const sb = (b.product.reviewScore ?? 3) * Math.log10((b.product.reviewCount ?? 1) + 10);
      return sb - sa || a.unitMinor - b.unitMinor;
    });
    return hits;
  },

  product(id: string, d: StoreData = getData()) {
    return d.products[id];
  },
  productBySlug(slug: string, d: StoreData = getData()) {
    return Object.values(d.products).find((p) => p.slug === slug || p.id === slug);
  },
  ratePlansFor(productId: string, d: StoreData = getData()) {
    return Object.values(d.ratePlans).filter((r) => r.productId === productId).sort((a, b) => a.baseMinor - b.baseMinor);
  },
  availability: availabilityFor,
  unit: unitFor,

  /* ── Supplier / back office product management ─────────── */
  createProduct(input: Pick<Product, "supplierId" | "vertical" | "title"> & Partial<Product>, enteredBy: Product["enteredBy"]): string {
    const id = genId("prd");
    mutate((d) => {
      const slug = (input.title || "new-product").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") + "-" + id.slice(-4);
      const p: Product = {
        id, supplierId: input.supplierId, vertical: input.vertical, status: "draft", title: input.title || "Untitled product", slug,
        description: input.description ?? "", media: input.media ?? [], location: input.location ?? { lat: -3.37, lng: 36.68, countryCode: "TZ", region: "Arusha", city: "Arusha" },
        amenities: input.amenities ?? [], tags: input.tags ?? [], attributes: input.attributes ?? {}, cancellationPolicyId: input.cancellationPolicyId ?? "cp_moderate",
        enteredBy, freeCancellation: true, instantConfirm: false, priceFromMinor: 0, currency: "TZS", completeness: 2, reviewCount: 0, createdAt: nowIso(), updatedAt: nowIso(),
      };
      d.products = { ...d.products, [id]: p };
      writeAudit(d, { scope: `supplier:${input.supplierId}`, action: "PRODUCT_CREATED", resourceType: "product", resourceId: id, after: { title: p.title, enteredBy } });
    });
    return id;
  },
  updateProduct(id: string, patch: Partial<Product>) {
    mutate((d) => {
      const before = d.products[id];
      if (!before) return;
      const next = { ...before, ...patch, updatedAt: nowIso() };
      next.completeness = computeCompleteness(next, Object.values(d.ratePlans).filter((r) => r.productId === id).length);
      d.products = { ...d.products, [id]: next };
    });
  },
  submitForReview(id: string) {
    mutate((d) => {
      const p = d.products[id];
      if (!p) return;
      d.products = { ...d.products, [id]: { ...p, status: "pending_review", reviewNotes: undefined, updatedAt: nowIso() } };
      writeAudit(d, { scope: `supplier:${p.supplierId}`, action: "PRODUCT_SUBMITTED", resourceType: "product", resourceId: id, before: { status: p.status }, after: { status: "pending_review" } });
      notify(d, { userId: "usr_supply", audience: "internal", channel: "in_app", title: `Product submitted · ${p.title}`, body: "Awaiting your review in the approval queue." });
    });
  },
  reviewProduct(id: string, decision: "approve" | "request_changes" | "reject", notes?: string) {
    mutate((d) => {
      const p = d.products[id];
      if (!p) return;
      const status: ProductStatus = decision === "approve" ? "live" : decision === "reject" ? "rejected" : "changes_requested";
      const cheapest = Object.values(d.ratePlans).filter((r) => r.productId === id).sort((a, b) => a.baseMinor - b.baseMinor)[0];
      const priceFrom = cheapest ? computePrice({ vertical: p.vertical, ratePlan: cheapest, nights: 1, quantity: 1, pax: { adults: p.vertical === "stay" ? 2 : 1, children: 0, infants: 0 } }).totalMinor : p.priceFromMinor;
      d.products = { ...d.products, [id]: { ...p, status, reviewNotes: notes, priceFromMinor: priceFrom || p.priceFromMinor, updatedAt: nowIso() } };
      writeAudit(d, { scope: "platform", action: `PRODUCT_${decision.toUpperCase()}`, resourceType: "product", resourceId: id, before: { status: p.status }, after: { status, notes } });
      const supplierUsers = Object.values(d.users).filter((u) => u.organisationId === p.supplierId);
      for (const u of supplierUsers) notify(d, { userId: u.id, audience: "supplier", channel: "email", title: `${p.title} · ${status === "live" ? "approved and live" : status === "rejected" ? "rejected" : "changes requested"}`, body: notes ?? (status === "live" ? "Your product is now searchable." : "") });
    });
  },
  setProductStatus(id: string, status: ProductStatus) {
    mutate((d) => {
      const p = d.products[id];
      if (!p) return;
      d.products = { ...d.products, [id]: { ...p, status, updatedAt: nowIso() } };
      writeAudit(d, { scope: `supplier:${p.supplierId}`, action: "PRODUCT_STATUS_CHANGED", resourceType: "product", resourceId: id, before: { status: p.status }, after: { status } });
    });
  },
  upsertRatePlan(rp: Omit<RatePlan, "id"> & { id?: string }): string {
    const id = rp.id ?? genId("rp");
    mutate((d) => {
      d.ratePlans = { ...d.ratePlans, [id]: { ...rp, id } };
      const p = d.products[rp.productId];
      if (p) {
        const cheapest = Object.values(d.ratePlans).filter((r) => r.productId === p.id).sort((a, b) => a.baseMinor - b.baseMinor)[0];
        const priceFrom = computePrice({ vertical: p.vertical, ratePlan: cheapest, nights: 1, quantity: 1, pax: { adults: p.vertical === "stay" ? 2 : 1, children: 0, infants: 0 } }).totalMinor;
        d.products = { ...d.products, [p.id]: { ...p, priceFromMinor: priceFrom, completeness: computeCompleteness(p, Object.values(d.ratePlans).filter((r) => r.productId === p.id).length), updatedAt: nowIso() } };
      }
      writeAudit(d, { scope: `supplier:${p?.supplierId}`, action: "RATEPLAN_UPSERT", resourceType: "rate_plan", resourceId: id, after: { name: rp.name, baseMinor: rp.baseMinor } });
    });
    return id;
  },
  deleteRatePlan(id: string) {
    mutate((d) => {
      const { [id]: _gone, ...rest } = d.ratePlans;
      void _gone;
      d.ratePlans = rest;
    });
  },
  setInventory(productId: string, dates: string[], patch: Partial<Pick<InventoryUnit, "capacityTotal" | "stopSell" | "minStay">>) {
    mutate((d) => {
      const inv = { ...d.inventory };
      for (const dt of dates) {
        const u = unitFor(d, productId, dt);
        inv[`${productId}:${dt}`] = { ...u, ...patch };
      }
      d.inventory = inv;
      writeAudit(d, { scope: `supplier:${d.products[productId]?.supplierId}`, action: "AVAILABILITY_UPDATED", resourceType: "product", resourceId: productId, after: { dates: dates.length, ...patch } });
    });
  },
};

export function computeCompleteness(p: Product, ratePlanCount: number): number {
  let s = 0;
  if (p.title.length > 4) s += 1;
  if (p.description.length > 80) s += 2;
  if (p.media.length >= 5) s += 2; else if (p.media.length >= 3) s += 1;
  if (p.amenities.length >= 3) s += 1;
  if (p.location.city) s += 1;
  if (p.cancellationPolicyId) s += 1;
  if (ratePlanCount > 0) s += 2;
  return Math.min(10, s);
}
