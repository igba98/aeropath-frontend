import { z } from "zod";
import type { Command, Currency, ID, ISODate } from "../types";
import { makeAudit } from "../audit";
import { format } from "../money";
import { isPnlAccount } from "../accounting/books";
import { checkJournalLines, type JournalLineInput } from "../accounting/journal-rules";
import { createJournal } from "./_journals";
import { denied, fail, parse } from "./_helpers";
import { zCurrency, zISODate, zOptText } from "./_schemas";

export interface RecordOpeningBalancesInput {
  /** The day the books start from (balances as at the end of the previous day). */
  date: ISODate;
  currency: Currency;
  /** Balance-sheet balances other than money accounts: equipment, receivables b/f, loans, share capital… */
  lines: JournalLineInput[];
  memo?: string;
}

export interface RecordOpeningBalancesResult {
  journalId: ID;
  number: string;
}

const head = z.object({ date: zISODate, currency: zCurrency, memo: zOptText });

/**
 * Brings the opening balance sheet into the books as one journal (source "opening_balance"), balanced
 * automatically against 3300 Opening balance equity. Money-account opening balances are not entered here: they come
 * from Settings → Money accounts and already sit in the books against 3300. One live opening journal per currency;
 * reverse it to enter a corrected one.
 */
export const recordOpeningBalances: Command<RecordOpeningBalancesInput, RecordOpeningBalancesResult> = (state, input, ctx) => {
  const no = denied(ctx, "journal.post");
  if (no) return no;
  const parsed = parse(head, input);
  if (!parsed.ok) return parsed;
  const f = parsed.data;
  const existing = Object.values(state.journals ?? {}).find((j) => j.source === "opening_balance" && j.status === "posted" && j.currency === f.currency);
  if (existing) return fail("CONFLICT", `Opening balances in ${f.currency} are already recorded (${existing.number}). Reverse that journal first to enter corrected balances.`);
  const lines = input.lines ?? [];
  const bad = checkJournalLines(state, f.currency, lines, {
    minLines: 1,
    allowUnbalanced: true,
    forbid: ["1100", "3300"],
    forbidReason: "money-account opening balances are set in Settings → Money accounts, and 3300 takes the balancing figure automatically.",
  });
  if (bad) return { ok: false, error: bad };
  const pnl = lines.findIndex((l) => isPnlAccount(l.account));
  if (pnl >= 0) return fail("VALIDATION", `Line ${pnl + 1}: opening balances are balance-sheet figures. Put profits of earlier years in 3200 Retained earnings.`, `lines.${pnl}.account`);

  const net = lines.reduce((s, l) => s + (l.debitMinor ?? 0) - (l.creditMinor ?? 0), 0);
  const all: JournalLineInput[] = [...lines];
  if (net !== 0) all.push({ account: "3300", debitMinor: Math.max(-net, 0), creditMinor: Math.max(net, 0), memo: "Balancing figure" });
  const made = createJournal(state, ctx, { date: f.date, memo: f.memo ?? `Opening balances as at ${f.date}`, currency: f.currency, lines: all, source: "opening_balance" });
  if (!made.ok) return made;
  const j = made.journal;
  return {
    ok: true,
    state: made.state,
    audit: [
      makeAudit(
        ctx,
        "journal.opening_balances",
        "journal",
        j.id,
        `Opening balances ${j.number} recorded in ${f.currency}: ${lines.length} lines, ${format({ amountMinor: Math.abs(net), currency: f.currency })} to opening balance equity`,
      ),
    ],
    result: { journalId: j.id, number: j.number },
    toast: `Opening balances recorded (${j.number})`,
  };
};
