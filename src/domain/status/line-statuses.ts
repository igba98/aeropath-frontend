import type { LineStatus } from "../types";

/** Status groups used across the machine, selectors and commands. */

/** Not active for file status and travel dates (spec §7.2). */
export const INACTIVE_STATUSES: readonly LineStatus[] = ["cancelled", "voided", "refunded", "exchanged"];
export const isActiveStatus = (s: LineStatus): boolean => !INACTIVE_STATUSES.includes(s);

/** Lines that count in charges (spec §8.3) — plus `exchanged`, whose value is carried into the new ticket (no reversal, §8.6). */
export const CHARGEABLE_STATUSES: readonly LineStatus[] = ["booked", "issued", "completed", "refund_pending", "exchanged"];

/** Lines shown on a quote. */
export const QUOTE_STATUSES: readonly LineStatus[] = ["quoted", "booked"];

/** Lines whose cost is payable to the supplier (issued business still on the books). */
export const SUPPLIER_PAYABLE_STATUSES: readonly LineStatus[] = ["issued", "completed", "refund_pending", "exchanged"];

/** Lines that have been issued at some point (ticket numbers reserved, ledger posted). */
export const WAS_ISSUED_STATUSES: readonly LineStatus[] = ["issued", "completed", "refund_pending", "refunded", "exchanged", "voided"];

/** No further transitions possible. */
export const TERMINAL_STATUSES: readonly LineStatus[] = ["cancelled", "voided", "refunded", "exchanged"];

/** Details, supplier, travellers and pricing can be edited only in these statuses. */
export const EDITABLE_STATUSES: readonly LineStatus[] = ["quoted", "booked"];

export const LINE_STATUS_LABELS: Record<LineStatus, string> = {
  quoted: "Quoted",
  booked: "Booked",
  issued: "Issued",
  completed: "Completed",
  cancelled: "Cancelled",
  voided: "Voided",
  refund_pending: "Refund pending",
  refunded: "Refunded",
  exchanged: "Exchanged",
};
