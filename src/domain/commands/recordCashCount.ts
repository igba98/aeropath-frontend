import { z } from "zod";
import type { Command, ID, ISODate } from "../types";
import { makeAudit } from "../audit";
import { format } from "../money";
import { bookBalanceAt } from "../accounting/reconciliation";
import { createJournal } from "./_journals";
import { denied, fail, parse } from "./_helpers";
import { zId, zISODate, zOptText } from "./_schemas";

export interface RecordCashCountInput {
  accountId: ID;
  /** Cash counted in the box, minor units of the account currency. */
  countedMinor: number;
  date: ISODate;
  note?: string;
}

export interface RecordCashCountResult {
  journalId: ID;
  number: string;
  /** counted − book: negative is a shortage. */
  differenceMinor: number;
}

const schema = z.object({ accountId: zId, countedMinor: z.number().int().min(0, "Counted cash cannot be negative."), date: zISODate, note: zOptText });

/**
 * Posts the over or short from a petty cash count so the book agrees with the box: a shortage debits 5900 Other
 * expenses, an overage credits 4900 Other income, against the cash account. Journal source "petty_cash".
 */
export const recordCashCount: Command<RecordCashCountInput, RecordCashCountResult> = (state, input, ctx) => {
  const no = denied(ctx, "pettycash.record");
  if (no) return no;
  const parsed = parse(schema, input);
  if (!parsed.ok) return parsed;
  const f = parsed.data;
  const account = state.moneyAccounts[f.accountId];
  if (!account) return fail("NOT_FOUND", "Choose the cash account you counted.", "accountId");
  if (!account.active) return fail("VALIDATION", `${account.name} is inactive.`, "accountId");
  const book = bookBalanceAt(state, account.id, f.date);
  const diff = f.countedMinor - book;
  if (diff === 0) return fail("VALIDATION", "The count agrees with the book. There is nothing to post.", "countedMinor");
  const amt = Math.abs(diff);
  const short = diff < 0;
  const label = short ? "Cash shortage" : "Cash overage";
  const made = createJournal(state, ctx, {
    date: f.date,
    memo: `${label} on count of ${account.name}${f.note ? ` · ${f.note}` : ""}`,
    currency: account.currency,
    source: "petty_cash",
    lines: short
      ? [
          { account: "5900", debitMinor: amt, creditMinor: 0, memo: label },
          { account: "1100", sub: { type: "money_account", id: account.id }, debitMinor: 0, creditMinor: amt },
        ]
      : [
          { account: "1100", sub: { type: "money_account", id: account.id }, debitMinor: amt, creditMinor: 0 },
          { account: "4900", debitMinor: 0, creditMinor: amt, memo: label },
        ],
  });
  if (!made.ok) return made;
  const j = made.journal;
  const money = { amountMinor: amt, currency: account.currency };
  return {
    ok: true,
    state: made.state,
    audit: [
      makeAudit(
        ctx,
        "pettycash.counted",
        "journal",
        j.id,
        `${label} of ${format(money)} posted for ${account.name} (${j.number}); counted ${format({ amountMinor: f.countedMinor, currency: account.currency })}`,
      ),
    ],
    result: { journalId: j.id, number: j.number, differenceMinor: diff },
    toast: `${label} of ${format(money)} posted (${j.number})`,
  };
};
