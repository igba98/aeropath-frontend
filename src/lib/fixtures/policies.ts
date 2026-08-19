import type { CancellationPolicy } from "../domain/types";

export const cancellationPolicies: CancellationPolicy[] = [
  {
    id: "cp_flex",
    name: "Flexible",
    summary: "Free cancellation up to 7 days before arrival. 50% refund up to 48 hours before. No refund after that.",
    tiers: [
      { daysBefore: 7, refundPct: 100 },
      { daysBefore: 2, refundPct: 50 },
      { daysBefore: 0, refundPct: 0 },
    ],
  },
  {
    id: "cp_moderate",
    name: "Moderate",
    summary: "Free cancellation up to 14 days before travel. 50% refund up to 7 days before. No refund after that.",
    tiers: [
      { daysBefore: 14, refundPct: 100 },
      { daysBefore: 7, refundPct: 50 },
      { daysBefore: 0, refundPct: 0 },
    ],
  },
  {
    id: "cp_strict",
    name: "Strict",
    summary: "Free cancellation up to 30 days before travel. 25% refund up to 14 days before. No refund after that.",
    tiers: [
      { daysBefore: 30, refundPct: 100 },
      { daysBefore: 14, refundPct: 25 },
      { daysBefore: 0, refundPct: 0 },
    ],
  },
  {
    id: "cp_nonref",
    name: "Non refundable",
    summary: "This rate cannot be cancelled or refunded once booked.",
    tiers: [{ daysBefore: 0, refundPct: 0 }],
  },
  {
    id: "cp_flight",
    name: "Airline fare rules",
    summary: "Refundable to airline credit less TZS 45,000 fee up to 24 hours before departure. Non refundable after.",
    tiers: [
      { daysBefore: 1, refundPct: 85 },
      { daysBefore: 0, refundPct: 0 },
    ],
  },
  {
    id: "cp_transfer",
    name: "Transfer policy",
    summary: "Free cancellation up to 24 hours before pickup. No refund after that.",
    tiers: [
      { daysBefore: 1, refundPct: 100 },
      { daysBefore: 0, refundPct: 0 },
    ],
  },
];
