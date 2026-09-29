import type { DomainError, ISODateTime, LineStatus, LineType, ServiceLine, VoidWindow } from "../types";
import { endOfDarDay, shortDate, toDarDate, toDarLocal } from "../dates";
import { CONFIRMED_SEGMENT_STATUSES, isValidLocator, isValidTicket } from "../validation";
import { LINE_STATUS_LABELS, TERMINAL_STATUSES } from "./line-statuses";

/**
 * Service line state machine (spec §7.1).
 *
 *   quoted ──► booked ──► issued ──► completed
 *     │          │          │  │  └─► refund_pending ──► refunded
 *     ▼          ▼          │  └──► voided        (flight only, before voidDeadline)
 *   cancelled  cancelled    └────► refund_pending ──► exchanged (flight, via exchange request)
 *                                        └─► back to issued/completed (refund rejected)
 */

/** Which command is asking. Some edges are reachable only through a specific command. */
export type TransitionVia = "transitionLine" | "voidLine" | "requestRefund" | "decideRefund";

export interface TransitionCtx {
  now: Date;
  /** When set, only edges reachable through this command are allowed. */
  via?: TransitionVia;
  /** Required for refund_pending → issued/completed (refund rejected): the status to restore. */
  previousStatus?: LineStatus;
}

export type TransitionCheck = { ok: true } | { ok: false; error: DomainError };

interface Edge {
  from: readonly LineStatus[];
  to: LineStatus;
  via: readonly TransitionVia[];
  flightOnly?: boolean;
}

export const LINE_EDGES: readonly Edge[] = [
  { from: ["quoted"], to: "booked", via: ["transitionLine"] },
  { from: ["quoted", "booked"], to: "cancelled", via: ["transitionLine"] },
  { from: ["booked"], to: "issued", via: ["transitionLine"] },
  { from: ["issued"], to: "completed", via: ["transitionLine"] },
  { from: ["issued"], to: "voided", via: ["voidLine", "transitionLine"], flightOnly: true },
  { from: ["issued", "completed"], to: "refund_pending", via: ["requestRefund"] },
  { from: ["refund_pending"], to: "refunded", via: ["decideRefund"] },
  { from: ["refund_pending"], to: "exchanged", via: ["decideRefund"], flightOnly: true },
  { from: ["refund_pending"], to: "issued", via: ["decideRefund"] },
  { from: ["refund_pending"], to: "completed", via: ["decideRefund"] },
];

const L = (s: LineStatus) => LINE_STATUS_LABELS[s];
const illegal = (message: string): TransitionCheck => ({ ok: false, error: { code: "ILLEGAL_TRANSITION", message } });
const OK: TransitionCheck = { ok: true };

/** Statuses reachable from `from` for a line type by graph alone (guards not evaluated). */
export function nextStatuses(from: LineStatus, type: LineType, via?: TransitionVia): LineStatus[] {
  return LINE_EDGES.filter((e) => e.from.includes(from) && (!e.flightOnly || type === "flight") && (!via || e.via.includes(via))).map((e) => e.to);
}

/**
 * Void deadline for a ticket issued at `issuedAt`.
 * same_day → 23:59:59 Africa/Dar_es_Salaam (UTC+3, no DST) on the issue day; { hours } → issuedAt + hours.
 */
export function computeVoidDeadline(issuedAt: Date | ISODateTime, voidWindow: VoidWindow): ISODateTime {
  const t = typeof issuedAt === "string" ? new Date(issuedAt) : issuedAt;
  if (voidWindow === "same_day") return endOfDarDay(toDarDate(t));
  return new Date(t.getTime() + voidWindow.hours * 3_600_000).toISOString();
}

/** True when an issued flight can still be voided at `now`. */
export function isVoidWindowOpen(line: ServiceLine, now: Date): boolean {
  if (line.type !== "flight" || line.status !== "issued" || !line.details.voidDeadline) return false;
  return now.getTime() <= Date.parse(line.details.voidDeadline);
}

const CONFIRMATION_LABEL: Partial<Record<LineType, string>> = {
  hotel: "hotel booking",
  car: "car hire",
  transfer: "transfer",
  tour: "tour",
};

function explainMissingEdge(line: ServiceLine, to: LineStatus, via?: TransitionVia): string {
  const from = line.status;
  if (TERMINAL_STATUSES.includes(from)) return `This service is ${L(from)}, which is final. Add a new service instead.`;
  if (to === "voided" && line.type !== "flight") return "Only flight tickets can be voided. Cancel the service or request a refund instead.";
  if (to === "exchanged" && line.type !== "flight") return "Only flights can be exchanged.";
  if (to === "refund_pending" && via === "transitionLine") return "Use Request refund to start a refund or an exchange.";
  if ((to === "refunded" || to === "exchanged") && via !== "decideRefund") return "Refunds and exchanges are completed by approving the refund request.";
  if (to === "issued" && from === "quoted") return "Mark the service booked before issuing it.";
  if (to === "cancelled" && (from === "issued" || from === "completed")) {
    return line.type === "flight" ? "An issued ticket cannot be cancelled. Void it (same day) or request a refund." : "An issued service cannot be cancelled. Request a refund instead.";
  }
  if (from === "refund_pending") return "This service has a refund request waiting for a decision. Approve or reject it first.";
  if (from === to) return `This service is already ${L(from)}.`;
  return `A service cannot go from ${L(from)} to ${L(to)}.`;
}

function guardBooked(line: ServiceLine): TransitionCheck {
  if (line.type !== "flight") return OK; // confirmation number optional; visa/insurance/fees always allowed
  const d = line.details;
  if (!isValidLocator(d.recordLocator)) return illegal("A flight needs its 6-character record locator (PNR) before it can be marked booked.");
  if (!d.segments.some((s) => (CONFIRMED_SEGMENT_STATUSES as readonly string[]).includes(s.statusCode))) {
    return illegal("At least one flight segment must be confirmed (status HK, KK or TK) before the flight can be marked booked.");
  }
  return OK;
}

function guardIssued(line: ServiceLine): TransitionCheck {
  switch (line.type) {
    case "flight": {
      const d = line.details;
      if (!d.passengers.length) return illegal("Add the passengers before issuing the ticket.");
      const missing = d.passengers.filter((p) => !isValidTicket(p.ticketNumber));
      if (missing.length) {
        return illegal(
          `Enter a valid 13-digit ticket number for every passenger (for example 176-2401234567). Missing or invalid: ${missing.map((p) => p.nameInPnr).join(", ")}.`,
        );
      }
      if (!/^[A-Z0-9]{2}$/.test(d.validatingCarrier ?? "")) return illegal("Set the validating (plating) carrier before issuing the ticket.");
      if (!(d.fare.totalFare.amountMinor > 0)) return illegal("The total fare must be more than zero before issuing the ticket.");
      return OK;
    }
    case "hotel":
    case "car":
    case "transfer":
    case "tour":
      if (!line.details.confirmationNumber?.trim()) return illegal(`Enter the supplier's confirmation number before issuing this ${CONFIRMATION_LABEL[line.type]}.`);
      return OK;
    default:
      return OK; // visa reference optional; insurance, service fee, other always allowed
  }
}

function guardVoided(line: ServiceLine, now: Date): TransitionCheck {
  if (line.type !== "flight") return illegal("Only flight tickets can be voided.");
  const deadline = line.details.voidDeadline;
  if (!deadline) return illegal("This ticket has no void deadline recorded, so it cannot be voided. Request a refund instead.");
  if (now.getTime() > Date.parse(deadline)) {
    const local = toDarLocal(deadline);
    return illegal(`The void window closed at ${local.slice(11, 16)} on ${shortDate(local)} (Dar es Salaam time). Request a refund instead.`);
  }
  return OK;
}

/** Checks whether `line` may move to `to`. Returns plain-words reasons (ILLEGAL_TRANSITION) when it may not. */
export function canTransition(line: ServiceLine, to: LineStatus, ctx: TransitionCtx): TransitionCheck {
  const edge = LINE_EDGES.find((e) => e.to === to && e.from.includes(line.status) && (!e.flightOnly || line.type === "flight"));
  if (!edge || (ctx.via && !edge.via.includes(ctx.via))) return illegal(explainMissingEdge(line, to, ctx.via));

  if (line.status === "refund_pending" && (to === "issued" || to === "completed")) {
    if (ctx.previousStatus && ctx.previousStatus !== to) return illegal(`Rejecting the refund returns the service to ${L(ctx.previousStatus)}, not ${L(to)}.`);
    return OK;
  }
  if (to === "booked") return guardBooked(line);
  if (to === "issued") return guardIssued(line);
  if (to === "voided") return guardVoided(line, ctx.now);
  return OK;
}
