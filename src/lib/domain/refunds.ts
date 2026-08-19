import type { CancellationPolicySnapshot, Refund } from "./types";

/** Refund threshold ladder (flow spec §2.5). Amounts in TZS minor (TZS has 0 minor digits). */
export const REFUND_THRESHOLD_LOW = 500_000;
export const REFUND_THRESHOLD_MID = 2_000_000;

export function requiredApprover(amountMinorTzs: number, withinFreeWindow: boolean, goodwill = false): Refund["requiredApprover"] {
  if (goodwill) return "manager";
  if (withinFreeWindow) return "none";
  if (amountMinorTzs <= REFUND_THRESHOLD_LOW) return "officer";
  if (amountMinorTzs <= REFUND_THRESHOLD_MID) return "manager";
  return "dual";
}

export interface RefundQuote {
  refundPct: number;
  refundMinor: number;
  withinFreeWindow: boolean;
  tierLabel: string;
  daysBefore: number;
}

/** Compute the exact refund per policy snapshot (flow spec T20) */
export function quoteRefund(snapshot: CancellationPolicySnapshot, paidMinor: number, travelDateFrom: string, now = new Date()): RefundQuote {
  const daysBefore = Math.floor((new Date(travelDateFrom + (travelDateFrom.length === 10 ? "T00:00:00Z" : "")).getTime() - now.getTime()) / 86_400_000);
  const tiers = [...snapshot.tiers].sort((a, b) => b.daysBefore - a.daysBefore);
  let refundPct = 0;
  let tierLabel = "Non refundable at this point";
  for (const t of tiers) {
    if (daysBefore >= t.daysBefore) {
      refundPct = t.refundPct;
      tierLabel = t.refundPct === 100 ? "Free cancellation window" : `${t.refundPct}% refund · ${t.daysBefore}+ days before travel`;
      break;
    }
  }
  const withinFreeWindow = refundPct === 100;
  return { refundPct, refundMinor: Math.round((paidMinor * refundPct) / 100), withinFreeWindow, tierLabel, daysBefore };
}
