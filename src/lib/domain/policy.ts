import type { Organisation, Product, RatePlan, Vertical } from "./types";

export interface PolicyResult {
  inPolicy: boolean;
  reason?: string;
  capMinor?: number;
  requiresApproval: boolean;
}

/** Corporate travel policy check for a product + rate (flow spec §5.5) */
export function evaluatePolicy(org: Organisation | undefined, vertical: Vertical, product: Product, ratePlan: RatePlan | undefined, nightlyMinor: number, travelDate?: string): PolicyResult {
  const policy = org?.travelPolicy;
  if (!policy) return { inPolicy: true, requiresApproval: false };
  if (vertical === "stay") {
    if (nightlyMinor > policy.stayCapPerNightMinor) {
      return { inPolicy: false, reason: `Exceeds accommodation limit`, capMinor: policy.stayCapPerNightMinor, requiresApproval: true };
    }
  }
  if (vertical === "flight") {
    const cabin = String(product.attributes.cabin ?? "economy");
    const rank = { economy: 0, premium: 1, business: 2 } as Record<string, number>;
    if ((rank[cabin] ?? 0) > (rank[policy.flightCabin] ?? 0)) {
      return { inPolicy: false, reason: `Cabin ${cabin} above policy (${policy.flightCabin})`, requiresApproval: true };
    }
  }
  if (travelDate && policy.advancePurchaseDays > 0) {
    const days = Math.floor((new Date(travelDate).getTime() - Date.now()) / 86_400_000);
    if (days < policy.advancePurchaseDays) {
      return { inPolicy: false, reason: `Booked under ${policy.advancePurchaseDays} days in advance`, requiresApproval: true };
    }
  }
  return { inPolicy: true, requiresApproval: false };
}
