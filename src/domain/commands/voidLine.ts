import type { Command, CommandResult, Ctx, DbState, ID, ServiceLine } from "../types";
import { makeAudit } from "../audit";
import { format } from "../money";
import { issueGroupOf, mirrorGroup } from "../ledger/postings";
import { canTransition } from "../status/line-machine";
import { denied, fail, historyEntry, nowIso, ok, post, produce } from "./_helpers";

export interface VoidLineInput {
  lineId: ID;
  reason?: string;
}

/** Voids an issued flight inside its void window and posts the exact mirror of its issue group. */
export function voidLineCore(state: DbState, ctx: Ctx, line: ServiceLine, reason?: string): CommandResult {
  const check = canTransition(line, "voided", { now: ctx.now, via: "voidLine" });
  if (!check.ok) return check;
  const file = state.files[line.fileId];
  const at = nowIso(ctx);

  const issue = issueGroupOf(state.ledger, line.id);
  const posted = post(() => mirrorGroup(issue, { newId: ctx.newId, at }, { kind: "line_void", memo: `Voided: ${line.description}` }));
  if (!posted.ok) return posted;

  const note = reason?.trim() || undefined;
  const next = produce(state, (d) => {
    const l = d.lines[line.id];
    l.statusHistory.push(historyEntry(l.status, "voided", ctx, note));
    l.status = "voided";
    l.updatedAt = at;
    d.ledger.push(...posted.entries);
    if (d.files[line.fileId]) d.files[line.fileId].updatedAt = at;
  });
  const tickets = line.type === "flight" ? line.details.passengers.map((p) => p.ticketNumber).filter(Boolean).join(", ") : "";
  return ok(
    next,
    [makeAudit(ctx, "line.voided", "line", line.id, `${line.description} voided${tickets ? ` (tickets ${tickets})` : ""}; ${format(line.pricing.sell)} reversed${note ? ` — ${note}` : ""}`, file?.id)],
    undefined,
    `Ticket voided — ${format(line.pricing.sell)} reversed`,
  );
}

export const voidLine: Command<VoidLineInput> = (state, input, ctx) => {
  const no = denied(ctx, "line.void");
  if (no) return no;
  const line = state.lines[input?.lineId];
  if (!line) return fail("NOT_FOUND", "This service could not be found.", "lineId");
  return voidLineCore(state, ctx, line, input.reason);
};
