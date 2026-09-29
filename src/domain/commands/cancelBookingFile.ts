import type { Command, ID } from "../types";
import { makeAudit } from "../audit";
import { LINE_STATUS_LABELS } from "../status/line-statuses";
import { denied, fail, historyEntry, nowIso, ok, produce } from "./_helpers";

export interface CancelBookingFileInput {
  fileId: ID;
  reason?: string;
}

/**
 * Cancels a booking: only when no line is issued, completed or waiting for a refund. Quoted and booked lines are
 * cancelled (no ledger impact) and open invoices/quotes are voided.
 */
export const cancelBookingFile: Command<CancelBookingFileInput> = (state, input, ctx) => {
  const no = denied(ctx, "booking.cancel");
  if (no) return no;
  const file = state.files[input?.fileId];
  if (!file) return fail("NOT_FOUND", "This booking could not be found.", "fileId");
  if (file.cancelledAt) return fail("CONFLICT", `Booking ${file.number} is already cancelled.`);

  const lines = Object.values(state.lines).filter((l) => l.fileId === file.id);
  const blocking = lines.find((l) => l.status === "issued" || l.status === "completed" || l.status === "refund_pending");
  if (blocking) {
    return fail(
      "CONFLICT",
      `Booking ${file.number} has a service that is ${LINE_STATUS_LABELS[blocking.status]} (${blocking.description}). Void it or finish the refund before cancelling the booking.`,
    );
  }

  const reason = input.reason?.trim() || undefined;
  const at = nowIso(ctx);
  const cancelled = lines.filter((l) => l.status === "quoted" || l.status === "booked");
  const next = produce(state, (d) => {
    const f = d.files[file.id];
    f.cancelledAt = at;
    f.updatedAt = at;
    for (const l of cancelled) {
      const dl = d.lines[l.id];
      dl.statusHistory.push(historyEntry(dl.status, "cancelled", ctx, reason ?? "Booking cancelled"));
      dl.status = "cancelled";
      dl.updatedAt = at;
    }
    for (const inv of Object.values(d.invoices)) if (inv.fileId === file.id && inv.status === "issued") inv.status = "void";
  });
  const audit = [
    makeAudit(ctx, "file.cancelled", "file", file.id, `Booking ${file.number} cancelled${reason ? `: ${reason}` : ""}`, file.id),
    ...cancelled.map((l) => makeAudit(ctx, "line.cancelled", "line", l.id, `${l.description} cancelled with the booking`, file.id)),
  ];
  return ok(next, audit, undefined, `Booking ${file.number} cancelled`);
};
