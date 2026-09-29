import type { ID, JournalEntry, LedgerEntry, LedgerKind } from "../types";
import { darLocalToUtc } from "../dates";
import { assertBalanced, latestGroup, type PostingCtx } from "./postings";

/**
 * Posting rules for accounting journals (additive to ./postings):
 *
 * | Event                 | Posting                                                                    | Kind       |
 * | Journal voucher (JV)  | its lines as entered, one balanced group in the journal currency          | journal    |
 * | Opening balances      | the lines plus the balancing line to 3300 Opening balance equity          | journal    |
 * | Cash count difference | shortage Dr 5900 · Cr 1100 cash; overage Dr 1100 cash · Cr 4900           | journal    |
 * | Transfer              | Dr 1100 (to account) · Cr 1100 (from account)                             | transfer   |
 * | Reversal              | mirror of the journal's group (./postings mirrorGroup)                    | journal_reversal |
 *
 * Entries sit at noon Dar es Salaam on the journal date, like expenses, so reports put them on the right day.
 */

export const journalLedgerAt = (date: string): string => darLocalToUtc(date);

export const journalKind = (j: Pick<JournalEntry, "source">): LedgerKind => (j.source === "transfer" ? "transfer" : "journal");

export function postJournalEntry(j: JournalEntry, pc: Pick<PostingCtx, "newId">): LedgerEntry[] {
  const groupId = pc.newId("grp");
  const at = journalLedgerAt(j.date);
  const kind = journalKind(j);
  const out: LedgerEntry[] = [];
  for (const l of j.lines) {
    if (!l.debitMinor && !l.creditMinor) continue;
    const e: LedgerEntry = {
      id: pc.newId("led"),
      groupId,
      kind,
      at,
      account: l.account,
      debitMinor: l.debitMinor,
      creditMinor: l.creditMinor,
      currency: j.currency,
      memo: l.memo?.trim() ? `${j.number} · ${l.memo.trim()}` : `${j.number} · ${j.memo}`,
      ref: { entity: "journal", id: j.id },
    };
    if (l.sub) e.sub = l.sub;
    out.push(e);
  }
  assertBalanced(out);
  return out;
}

/** The posting group of a journal (to mirror on reversal). */
export const journalGroupOf = (ledger: LedgerEntry[], journalId: ID): LedgerEntry[] =>
  latestGroup(ledger, (e) => (e.kind === "journal" || e.kind === "transfer") && e.ref.entity === "journal" && e.ref.id === journalId);
