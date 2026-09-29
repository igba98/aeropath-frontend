import { z } from "zod";
import type { Command, ID, ISODate } from "../types";
import { makeAudit } from "../audit";
import { format } from "../money";
import { darToday } from "../dates";
import { mirrorGroup } from "../ledger/postings";
import { journalGroupOf, journalLedgerAt } from "../ledger/journals";
import { journalTotal } from "../accounting/journal-rules";
import { denied, fail, nowIso, ok, parse, post, produce } from "./_helpers";
import { zId, zOptISODate, zOptText } from "./_schemas";

export interface ReverseJournalInput {
  journalId: ID;
  /** Date of the reversing entries; today when omitted. Not before the journal's own date. */
  date?: ISODate;
  reason?: string;
}

const schema = z.object({ journalId: zId, date: zOptISODate, reason: zOptText });

/** Reverses a posted journal or transfer: mirrors its ledger group (kind "journal_reversal") and marks it reversed. */
export const reverseJournal: Command<ReverseJournalInput> = (state, input, ctx) => {
  const no = denied(ctx, "journal.post");
  if (no) return no;
  const parsed = parse(schema, input);
  if (!parsed.ok) return parsed;
  const f = parsed.data;
  const j = state.journals?.[f.journalId];
  if (!j) return fail("NOT_FOUND", "This journal could not be found.", "journalId");
  if (j.status === "reversed") return fail("CONFLICT", `Journal ${j.number} is already reversed.`);
  const date = f.date ?? darToday(ctx.now);
  if (date < j.date) return fail("VALIDATION", `Date the reversal on or after the journal's own date.`, "date");

  const group = journalGroupOf(state.ledger, j.id);
  if (!group.length) return fail("NOT_FOUND", `Journal ${j.number} has no ledger postings to reverse.`);
  const reason = f.reason;
  const posted = post(() => mirrorGroup(group, { newId: ctx.newId, at: journalLedgerAt(date) }, { kind: "journal_reversal", memo: `${j.number} reversed${reason ? `: ${reason}` : ""}` }));
  if (!posted.ok) return posted;

  const at = nowIso(ctx);
  const next = produce(state, (d) => {
    const x = d.journals[j.id];
    x.status = "reversed";
    x.reversedAt = at;
    x.reversedBy = ctx.user.id;
    d.ledger.push(...posted.entries);
  });
  const total = format({ amountMinor: journalTotal(j.lines), currency: j.currency });
  return ok(next, [makeAudit(ctx, "journal.reversed", "journal", j.id, `Journal ${j.number} (${j.memo}, ${total}) reversed${reason ? `: ${reason}` : ""}`)], undefined, `Journal ${j.number} reversed`);
};
