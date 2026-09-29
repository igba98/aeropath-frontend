import type { Ctx, Currency, DbState, ID, ISODate, JournalEntry } from "../types";
import { postJournalEntry } from "../ledger/journals";
import { cleanLines, type JournalLineInput } from "../accounting/journal-rules";
import { nowIso, post, produce, takeNumber, type Fail } from "./_helpers";

/** Shared by postJournal, transferMoney, recordOpeningBalances and recordCashCount: number, post and store a journal. */
export function createJournal(
  state: DbState,
  ctx: Ctx,
  j: { date: ISODate; memo: string; currency: Currency; lines: JournalLineInput[]; source: JournalEntry["source"] },
): { ok: true; state: DbState; journal: JournalEntry } | Fail {
  const { number, counters } = takeNumber(state, "journal", ctx);
  const id: ID = ctx.newId("jnl");
  const journal: JournalEntry = {
    id,
    number,
    date: j.date,
    memo: j.memo,
    currency: j.currency,
    lines: cleanLines(j.lines),
    source: j.source,
    status: "posted",
    createdAt: nowIso(ctx),
    createdBy: ctx.user.id,
  };
  const posted = post(() => postJournalEntry(journal, ctx));
  if (!posted.ok) return posted;
  const next = produce(state, (d) => {
    if (!d.journals) d.journals = {};
    d.journals[id] = journal;
    d.counters = counters;
    d.ledger.push(...posted.entries);
  });
  return { ok: true, state: next, journal };
}
