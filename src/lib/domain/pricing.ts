import type { BuyerType, Currency, Extra, Pax, PriceBreakdownData, PriceLine, RatePlan, Vertical } from "./types";

export const VAT_PCT = 18; // Tanzania VAT
export const SERVICE_FEE_PCT = 3;
export const TOURISM_LEVY_PCT = 1; // on stays only

export interface PriceInput {
  vertical: Vertical;
  ratePlan: RatePlan;
  nights: number; // for stays; 1 otherwise
  quantity: number; // rooms / vehicles / seats
  pax: Pax;
  buyerType?: BuyerType;
  markupPct?: number; // agent overlay
  extras?: Extra[];
  promo?: { code: string; discountType: "pct" | "fixed"; discountValue: number };
  currency?: Currency;
}

/**
 * All-in price computation. Never returns a headline that later grows (flow spec §5.3, §10.2).
 * Base + extras + park/levy + VAT + service fee − discount (+ markup for agents).
 */
export function computePrice(input: PriceInput): PriceBreakdownData {
  const { ratePlan, nights, quantity, pax } = input;
  const currency = ratePlan.currency;
  const lines: PriceLine[] = [];
  const paxCount = pax.adults + pax.children;

  let base = 0;
  switch (ratePlan.basis) {
    case "per_unit_night": {
      const extraAdults = Math.max(0, pax.adults - 2 * quantity);
      base = ratePlan.baseMinor * nights * quantity + (ratePlan.extraAdultMinor ?? 0) * extraAdults * nights;
      lines.push({ label: `${ratePlan.name} · ${quantity} × ${nights} night${nights === 1 ? "" : "s"}`, amountMinor: ratePlan.baseMinor * nights * quantity, kind: "base" });
      if (extraAdults > 0 && ratePlan.extraAdultMinor) lines.push({ label: `Extra adult × ${extraAdults}`, amountMinor: ratePlan.extraAdultMinor * extraAdults * nights, kind: "base" });
      break;
    }
    case "per_person": {
      // children at 70%
      const adultAmt = ratePlan.baseMinor * pax.adults;
      const childAmt = Math.round(ratePlan.baseMinor * 0.7) * pax.children;
      base = adultAmt + childAmt;
      lines.push({ label: `${ratePlan.name} · ${pax.adults} adult${pax.adults === 1 ? "" : "s"}`, amountMinor: adultAmt, kind: "base" });
      if (pax.children) lines.push({ label: `Children × ${pax.children}`, amountMinor: childAmt, kind: "base" });
      break;
    }
    case "per_passenger": {
      const adultAmt = ratePlan.baseMinor * pax.adults;
      const childAmt = Math.round(ratePlan.baseMinor * 0.75) * pax.children;
      const infantAmt = Math.round(ratePlan.baseMinor * 0.1) * pax.infants;
      base = adultAmt + childAmt + infantAmt;
      lines.push({ label: `${ratePlan.name} · ${pax.adults} adult${pax.adults === 1 ? "" : "s"}`, amountMinor: adultAmt, kind: "base" });
      if (pax.children) lines.push({ label: `Children × ${pax.children}`, amountMinor: childAmt, kind: "base" });
      if (pax.infants) lines.push({ label: `Infants × ${pax.infants}`, amountMinor: infantAmt, kind: "base" });
      break;
    }
    case "per_vehicle": {
      base = ratePlan.baseMinor * quantity;
      lines.push({ label: `${ratePlan.name} · ${quantity} vehicle${quantity === 1 ? "" : "s"}`, amountMinor: base, kind: "base" });
      break;
    }
  }

  // Extras
  let extrasTotal = 0;
  for (const e of input.extras ?? []) {
    const amt = e.perPerson ? e.amountMinor * paxCount : e.amountMinor;
    extrasTotal += amt;
    lines.push({ label: e.label, amountMinor: amt, kind: "extra" });
  }

  // No reseller markup: Aeropath is the agent, and earns commission from the supplier or from
  // Amadeus rather than by marking the traveller's fare up.
  const markup = 0;

  const taxable = base + extrasTotal + markup;
  let levy = 0;
  if (input.vertical === "stay") {
    levy = Math.round((base * TOURISM_LEVY_PCT) / 100);
    lines.push({ label: `Tourism levy ${TOURISM_LEVY_PCT}%`, amountMinor: levy, kind: "tax" });
  }
  const vat = Math.round((taxable * VAT_PCT) / 100);
  lines.push({ label: `VAT ${VAT_PCT}%`, amountMinor: vat, kind: "tax" });
  const fee = Math.round((taxable * SERVICE_FEE_PCT) / 100);
  lines.push({ label: `Service fee ${SERVICE_FEE_PCT}%`, amountMinor: fee, kind: "fee" });

  let discount = 0;
  if (input.promo) {
    discount = input.promo.discountType === "pct" ? Math.round((base * input.promo.discountValue) / 100) : input.promo.discountValue;
    discount = Math.min(discount, base);
    lines.push({ label: `Promo ${input.promo.code}`, amountMinor: -discount, kind: "discount" });
  }

  const total = base + extrasTotal + markup + levy + vat + fee - discount;
  const commission = Math.round((base * ratePlan.commissionPct) / 100);
  const net = base - commission;

  return {
    currency,
    lines,
    baseMinor: base + extrasTotal,
    taxMinor: vat + levy,
    feeMinor: fee,
    discountMinor: discount,
    markupMinor: markup,
    totalMinor: total,
    netMinor: net,
    commissionMinor: commission,
  };
}

/** Quick indicative all-in from a base figure (used on search cards) */
export function allInFromBase(baseMinor: number, vertical: Vertical): number {
  const levy = vertical === "stay" ? Math.round((baseMinor * TOURISM_LEVY_PCT) / 100) : 0;
  const vat = Math.round((baseMinor * VAT_PCT) / 100);
  const fee = Math.round((baseMinor * SERVICE_FEE_PCT) / 100);
  return baseMinor + levy + vat + fee;
}

export function nightsBetween(from: string, to: string): number {
  const a = new Date(from + "T00:00:00Z").getTime();
  const b = new Date(to + "T00:00:00Z").getTime();
  return Math.max(1, Math.round((b - a) / 86_400_000));
}
