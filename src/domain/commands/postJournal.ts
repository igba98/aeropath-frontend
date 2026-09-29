import { z } from "zod";
import type { Command, Currency, ID, ISODate } from "../types";
import { makeAudit } from "../audit";
import { format } from "../money";
import { checkJournalLines, journalTotal, type JournalLineInput } from "../accounting/journal-rules";
import { createJournal } from "./_journals";
import { denied, parse } from "./_helpers";
import { zCurrency, zISODate, zText } from "./_schemas";

export type { JournalLineInput } from "../accounting/journal-rules";

export interface PostJournalInput {
  date: ISODate;
  memo: string;
  currency: Currency;
  lines: JournalLineInput[];
}

export interface PostJournalResult {
  journalId: ID;
  number: string;
}

const head = z.object({ date: zISODate, memo: zText("Narration"), currency: zCurrency });

/**
 * A manual journal voucher (JV): at least two lines in one currency, debits equal to credits. Accountant or Manager.
 * Posts one balanced ledger group of kind "journal" and takes the next JV number.
 */
export const postJournal: Command<PostJournalInput, PostJournalResult> = (state, input, ctx) => {
  const no = denied(ctx, "journal.post");
  if (no) return no;
  const parsed = parse(head, input);
  if (!parsed.ok) return parsed;
  const f = parsed.data;
  const bad = checkJournalLines(state, f.currency, input.lines);
  if (bad) return { ok: false, error: bad };
  const made = createJournal(state, ctx, { date: f.date, memo: f.memo, currency: f.currency, lines: input.lines, source: "manual" });
  if (!made.ok) return made;
  const j = made.journal;
  const total = { amountMinor: journalTotal(j.lines), currency: j.currency };
  return {
    ok: true,
    state: made.state,
    audit: [makeAudit(ctx, "journal.posted", "journal", j.id, `Journal ${j.number} posted: ${j.memo} (${format(total)}, ${j.lines.length} lines)`)],
    result: { journalId: j.id, number: j.number },
    toast: `Journal ${j.number} posted`,
  };
};
