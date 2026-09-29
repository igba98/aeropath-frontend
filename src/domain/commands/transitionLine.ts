import { z } from "zod";
import type { Command, FlightDetails, ID, LineStatus, ServiceLine } from "../types";
import { makeAudit } from "../audit";
import { format } from "../money";
import { postLineIssue } from "../ledger/postings";
import { canTransition, computeVoidDeadline, nextStatuses } from "../status/line-machine";
import { LINE_STATUS_LABELS } from "../status/line-statuses";
import { normaliseTicket } from "../validation";
import { denied, fail, historyEntry, nowIso, ok, parse, post, produce } from "./_helpers";
import { zId, zOptText } from "./_schemas";
import { findTicketConflict, ticketsOf } from "./_lines";
import { voidLineCore } from "./voidLine";

export interface TransitionLineInput {
  lineId: ID;
  to: LineStatus;
  note?: string;
  /** Flights, when issuing: ticket number per passenger ("176-2401234567" or 13 digits). */
  tickets?: { travellerId: ID; ticketNumber: string }[];
  /** Hotel/car/transfer/tour confirmation number, visa reference or insurance policy number, applied before the guard. */
  confirmationNumber?: string;
}

const schema = z.object({
  lineId: zId,
  to: z.enum(["quoted", "booked", "issued", "completed", "cancelled", "voided", "refund_pending", "refunded", "exchanged"]),
  note: zOptText,
  tickets: z.array(z.object({ travellerId: zId, ticketNumber: z.string() })).optional(),
  confirmationNumber: zOptText,
});

const ACTION_WORD: Partial<Record<LineStatus, string>> = { booked: "booked", issued: "issued", completed: "completed", cancelled: "cancelled" };

export const transitionLine: Command<TransitionLineInput> = (state, input, ctx) => {
  const no = denied(ctx, "line.transition");
  if (no) return no;
  const parsed = parse(schema, input);
  if (!parsed.ok) return parsed;
  const f = parsed.data;

  const original = state.lines[f.lineId];
  if (!original) return fail("NOT_FOUND", "This service could not be found.", "lineId");
  const file = state.files[original.fileId];
  if (!file) return fail("NOT_FOUND", "The booking for this service could not be found.");

  if (!nextStatuses(original.status, original.type, "transitionLine").includes(f.to)) {
    const check = canTransition(original, f.to, { now: ctx.now, via: "transitionLine" });
    return check.ok ? fail("ILLEGAL_TRANSITION", `This service cannot be marked ${LINE_STATUS_LABELS[f.to]} from here.`) : check;
  }
  if (f.to === "voided") {
    const noVoid = denied(ctx, "line.void");
    if (noVoid) return noVoid;
    return voidLineCore(state, ctx, original, f.note);
  }

  // Apply ticket numbers / confirmation number before the guard.
  let line: ServiceLine = original;
  if (f.tickets?.length) {
    if (line.type !== "flight") return fail("VALIDATION", "Ticket numbers only apply to flights.", "tickets");
    if (f.to !== "issued") return fail("VALIDATION", "Ticket numbers are entered when issuing the ticket.", "tickets");
    const passengers = line.details.passengers.map((p) => ({ ...p }));
    for (let i = 0; i < f.tickets.length; i++) {
      const t = f.tickets[i];
      const number = normaliseTicket(t.ticketNumber);
      if (!number) return fail("VALIDATION", "A ticket number has 13 digits: the 3-digit airline code and 10 digits, e.g. 176-2401234567.", `tickets.${i}.ticketNumber`);
      const pax = passengers.find((p) => p.travellerId === t.travellerId);
      if (!pax) return fail("VALIDATION", "This traveller is not a passenger on the flight.", `tickets.${i}.travellerId`);
      pax.ticketNumber = number;
    }
    line = { ...line, details: { ...line.details, passengers } };
  }
  if (f.confirmationNumber) {
    switch (line.type) {
      case "hotel":
      case "car":
      case "transfer":
      case "tour":
        line = { ...line, details: { ...line.details, confirmationNumber: f.confirmationNumber } } as ServiceLine;
        break;
      case "visa":
        line = { ...line, details: { ...line.details, reference: f.confirmationNumber } };
        break;
      case "insurance":
        line = { ...line, details: { ...line.details, policyNumber: f.confirmationNumber } };
        break;
      default:
        break;
    }
  }
  if (line.type === "flight") {
    const conflict = findTicketConflict(state, ticketsOf(line), line.id);
    if (conflict) return conflict;
  }

  const check = canTransition(line, f.to, { now: ctx.now, via: "transitionLine" });
  if (!check.ok) return check;

  const at = nowIso(ctx);
  if (f.to === "issued" && line.type === "flight") {
    const details: FlightDetails = { ...line.details, issuedAt: at, voidDeadline: computeVoidDeadline(ctx.now, state.settings.voidWindow) };
    line = { ...line, details };
  }
  const updated = {
    ...line,
    status: f.to,
    updatedAt: at,
    statusHistory: [...line.statusHistory, historyEntry(original.status, f.to, ctx, f.note)],
  } as ServiceLine;

  let entries: ReturnType<typeof postLineIssue> = [];
  if (f.to === "issued") {
    const posted = post(() => postLineIssue(updated, file.clientId, { newId: ctx.newId, at }));
    if (!posted.ok) return posted;
    entries = posted.entries;
  }

  const next = produce(state, (d) => {
    d.lines[updated.id] = updated;
    if (entries.length) d.ledger.push(...entries);
    d.files[file.id].updatedAt = at;
  });

  const word = ACTION_WORD[f.to] ?? LINE_STATUS_LABELS[f.to].toLowerCase();
  let summary = `${updated.description} ${word}`;
  if (f.to === "issued") {
    const tickets = ticketsOf(updated);
    summary += `${tickets.length ? ` (tickets ${tickets.join(", ")})` : ""}; ${format(updated.pricing.sell)} charged`;
  }
  if (f.note) summary += ` — ${f.note}`;
  const toast = f.to === "issued" && updated.type === "flight" ? "Ticket issued" : `Service marked ${LINE_STATUS_LABELS[f.to].toLowerCase()}`;
  return ok(next, [makeAudit(ctx, `line.${f.to}`, "line", updated.id, summary, file.id)], undefined, toast);
};
