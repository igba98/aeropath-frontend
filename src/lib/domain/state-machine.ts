import type { BookingStatus, ItemStatus, Vertical } from "./types";

/**
 * Booking item state machine, expressed as data (tech spec §18.1).
 * Only api.booking.transition may move an item between states.
 */
export type ItemEvent =
  | "HOLD"
  | "EXPIRE"
  | "INITIATE_PAYMENT"
  | "PAYMENT_CONFIRMED"
  | "PAYMENT_FAILED"
  | "SUPPLIER_REQUESTED"
  | "SUPPLIER_CONFIRMED"
  | "SUPPLIER_REJECTED"
  | "AMEND"
  | "CANCEL"
  | "TRAVEL_COMPLETED"
  | "REFUND_PROCESSED"
  | "SUBMIT_FOR_APPROVAL"
  | "APPROVAL_GRANTED"
  | "APPROVAL_REJECTED"
  | "RETRY_PAYMENT";

export interface Transition {
  from: ItemStatus;
  to: ItemStatus;
  event: ItemEvent;
  effects: string[];
}

export const transitions: readonly Transition[] = [
  { from: "draft", to: "held", event: "HOLD", effects: ["reserveInventory", "scheduleExpiry"] },
  { from: "held", to: "expired", event: "EXPIRE", effects: ["releaseInventory", "reindexAvailability"] },
  { from: "held", to: "pending_payment", event: "INITIATE_PAYMENT", effects: ["extendHold"] },
  { from: "held", to: "pending_approval", event: "SUBMIT_FOR_APPROVAL", effects: ["extendHold4h", "notifyApprover"] },
  { from: "pending_approval", to: "pending_payment", event: "APPROVAL_GRANTED", effects: ["notifyBooker"] },
  { from: "pending_approval", to: "approval_rejected", event: "APPROVAL_REJECTED", effects: ["releaseInventory", "notifyBooker"] },
  { from: "pending_approval", to: "expired", event: "EXPIRE", effects: ["releaseInventory"] },
  { from: "pending_payment", to: "paid", event: "PAYMENT_CONFIRMED", effects: ["writeLedger", "requestSupplierConfirmation", "notifyCustomer"] },
  { from: "pending_payment", to: "payment_failed", event: "PAYMENT_FAILED", effects: ["releaseInventory", "notifyCustomer"] },
  { from: "pending_payment", to: "expired", event: "EXPIRE", effects: ["releaseInventory"] },
  { from: "payment_failed", to: "pending_payment", event: "RETRY_PAYMENT", effects: ["reHold"] },
  { from: "paid", to: "awaiting_supplier", event: "SUPPLIER_REQUESTED", effects: ["startSlaTimer"] },
  { from: "paid", to: "confirmed", event: "SUPPLIER_CONFIRMED", effects: ["issueVoucher", "notifyCustomer"] },
  { from: "awaiting_supplier", to: "confirmed", event: "SUPPLIER_CONFIRMED", effects: ["issueVoucher", "notifyCustomer", "stopSlaTimer"] },
  { from: "awaiting_supplier", to: "supplier_rejected", event: "SUPPLIER_REJECTED", effects: ["autoRefund", "releaseInventory", "raiseOpsTask", "notifyCustomer"] },
  { from: "paid", to: "supplier_rejected", event: "SUPPLIER_REJECTED", effects: ["autoRefund", "releaseInventory", "raiseOpsTask", "notifyCustomer"] },
  { from: "confirmed", to: "amended", event: "AMEND", effects: ["recomputePrice", "writeLedger", "reissueVoucher"] },
  { from: "amended", to: "confirmed", event: "SUPPLIER_CONFIRMED", effects: ["reissueVoucher"] },
  { from: "confirmed", to: "cancelled", event: "CANCEL", effects: ["computeRefund", "releaseInventory", "notifyCustomer"] },
  { from: "amended", to: "cancelled", event: "CANCEL", effects: ["computeRefund", "releaseInventory", "notifyCustomer"] },
  { from: "awaiting_supplier", to: "cancelled", event: "CANCEL", effects: ["computeRefund", "releaseInventory", "notifyCustomer"] },
  { from: "paid", to: "cancelled", event: "CANCEL", effects: ["computeRefund", "releaseInventory", "notifyCustomer"] },
  { from: "confirmed", to: "used", event: "TRAVEL_COMPLETED", effects: ["releaseSupplierPayout", "requestReview"] },
  { from: "amended", to: "used", event: "TRAVEL_COMPLETED", effects: ["releaseSupplierPayout", "requestReview"] },
  { from: "cancelled", to: "refunded", event: "REFUND_PROCESSED", effects: ["writeLedger", "notifyCustomer"] },
  { from: "supplier_rejected", to: "refunded", event: "REFUND_PROCESSED", effects: ["writeLedger", "notifyCustomer"] },
] as const;

export function canTransition(from: ItemStatus, event: ItemEvent): Transition | undefined {
  return transitions.find((t) => t.from === from && t.event === event);
}

export function legalEvents(from: ItemStatus): ItemEvent[] {
  return transitions.filter((t) => t.from === from).map((t) => t.event);
}

/** Hold TTL per vertical (flow spec §4.2) in seconds */
export function holdTtlSeconds(vertical: Vertical): number {
  switch (vertical) {
    case "flight":
      return 20 * 60;
    case "transfer":
      return 0; // no hold for transfers
    default:
      return 15 * 60;
  }
}

export const APPROVAL_HOLD_SECONDS = 4 * 60 * 60;
export const SUPPLIER_SLA_SECONDS = 2 * 60 * 60;

/**
 * Parent booking status is derived from items, never set directly (flow spec §4.2, tech spec §18.3).
 */
export function deriveBookingStatus(itemStatuses: ItemStatus[]): BookingStatus {
  if (itemStatuses.length === 0) return "draft";
  const s = new Set(itemStatuses);
  const all = (pred: (x: ItemStatus) => boolean) => itemStatuses.every(pred);
  const any = (pred: (x: ItemStatus) => boolean) => itemStatuses.some(pred);

  if (all((x) => x === "draft" || x === "held")) return "draft";
  if (any((x) => x === "pending_approval")) return "pending_approval";
  if (all((x) => x === "expired" || x === "payment_failed" || x === "approval_rejected")) return "expired";
  if (all((x) => x === "cancelled" || x === "refunded")) return s.has("cancelled") ? "cancelled" : "refunded";
  const finalGood = (x: ItemStatus) => x === "confirmed" || x === "used" || x === "amended";
  if (all(finalGood)) return "confirmed";
  const failed = (x: ItemStatus) => x === "supplier_rejected" || x === "payment_failed" || x === "refunded" || x === "cancelled";
  if (any(failed) && any((x) => finalGood(x) || x === "paid" || x === "awaiting_supplier")) return "partial";
  if (any(failed)) return "partial";
  if (any((x) => x === "paid" || x === "awaiting_supplier" || x === "pending_payment")) return "processing";
  return "processing";
}

/** Human labels for item + booking statuses. Single canonical mapping (tech spec §29.4). */
export const STATUS_LABELS: Record<ItemStatus | BookingStatus, string> = {
  draft: "In cart",
  held: "Held",
  expired: "Expired",
  pending_payment: "Pending payment",
  payment_failed: "Payment failed",
  paid: "Paid",
  awaiting_supplier: "Awaiting supplier",
  confirmed: "Confirmed",
  supplier_rejected: "Supplier rejected",
  amended: "Amended",
  used: "Completed",
  cancelled: "Cancelled",
  refunded: "Refunded",
  pending_approval: "Pending approval",
  approval_rejected: "Approval rejected",
  processing: "Processing",
  partial: "Partial",
};

export type StatusTone = "neutral" | "info" | "warning" | "success" | "danger" | "brand";

export const STATUS_TONES: Record<ItemStatus | BookingStatus, StatusTone> = {
  draft: "neutral",
  held: "info",
  expired: "neutral",
  pending_payment: "warning",
  payment_failed: "danger",
  paid: "brand",
  awaiting_supplier: "warning",
  confirmed: "success",
  supplier_rejected: "danger",
  amended: "brand",
  used: "success",
  cancelled: "neutral",
  refunded: "neutral",
  pending_approval: "warning",
  approval_rejected: "danger",
  processing: "brand",
  partial: "warning",
};
