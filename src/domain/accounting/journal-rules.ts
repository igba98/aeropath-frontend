import type { AccountCode, Currency, DbState, DomainError, JournalLine } from "../types";
import { ACCOUNTS } from "../ledger/accounts";
import { format } from "../money";

/**
 * The rules every journal voucher meets before it posts (spec: balanced manual journals).
 * At least two lines, one currency, each line a debit or a credit (never both, never neither), whole minor units,
 * known accounts, debits = credits, and the right sub-ledger on control accounts:
 * 1100 → a money account in the journal currency, 1200 → a client, 2100 → a supplier. Other accounts take none.
 */

export interface JournalLineInput {
  account: AccountCode;
  sub?: JournalLine["sub"];
  debitMinor: number;
  creditMinor: number;
  memo?: string;
}

const SUB_FOR: Partial<Record<AccountCode, NonNullable<JournalLine["sub"]>["type"]>> = { "1100": "money_account", "1200": "client", "2100": "supplier" };
const SUB_WORD = { money_account: "money account", client: "client", supplier: "supplier" } as const;

const err = (message: string, field?: string): DomainError => (field ? { code: "VALIDATION", message, field } : { code: "VALIDATION", message });

/** Cleans the lines (trimmed memo, no sub on accounts without a sub-ledger kept as an error) and checks them. */
export function checkJournalLines(
  state: DbState,
  currency: Currency,
  lines: JournalLineInput[],
  opts: { minLines?: number; allowUnbalanced?: boolean; forbid?: AccountCode[]; forbidReason?: string } = {},
): DomainError | null {
  const min = opts.minLines ?? 2;
  if (!Array.isArray(lines) || lines.length < min) return err(min === 1 ? "Add at least one line." : `A journal needs at least ${min} lines: something debited and something credited.`, "lines");
  let debits = 0;
  let credits = 0;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const row = `Line ${i + 1}`;
    const f = (k: string) => `lines.${i}.${k}`;
    const def = ACCOUNTS[l?.account];
    if (!def) return err(`${row}: choose an account.`, f("account"));
    if (opts.forbid?.includes(l.account)) return err(`${row}: ${opts.forbidReason ?? `${l.account} ${def.name} cannot be used here.`}`, f("account"));
    const d = l.debitMinor ?? 0;
    const c = l.creditMinor ?? 0;
    if (!Number.isInteger(d) || !Number.isInteger(c)) return err(`${row}: amounts must be whole minor units (cents).`, f("debitMinor"));
    if (d < 0 || c < 0) return err(`${row}: amounts cannot be negative. Put the figure in the other column instead.`, f(d < 0 ? "debitMinor" : "creditMinor"));
    if (d > 0 && c > 0) return err(`${row}: enter a debit or a credit, not both.`, f("creditMinor"));
    if (d === 0 && c === 0) return err(`${row}: enter a debit or a credit.`, f("debitMinor"));
    const need = SUB_FOR[l.account];
    if (need) {
      if (!l.sub?.id) return err(`${row}: choose the ${SUB_WORD[need]} for ${l.account} ${def.name}.`, f("sub"));
      if (l.sub.type !== need) return err(`${row}: ${l.account} ${def.name} is kept by ${SUB_WORD[need]}. Choose a ${SUB_WORD[need]}.`, f("sub"));
      if (need === "money_account") {
        const a = state.moneyAccounts[l.sub.id];
        if (!a) return err(`${row}: this money account could not be found.`, f("sub"));
        if (!a.active) return err(`${row}: ${a.name} is inactive. Choose another account.`, f("sub"));
        if (a.currency !== currency) return err(`${row}: ${a.name} holds ${a.currency}; this journal is in ${currency}. Use a ${currency} account or post a separate ${a.currency} journal.`, f("sub"));
      }
      if (need === "client" && !state.clients[l.sub.id]) return err(`${row}: this client could not be found.`, f("sub"));
      if (need === "supplier" && !state.suppliers[l.sub.id]) return err(`${row}: this supplier could not be found.`, f("sub"));
    } else if (l.sub) {
      return err(`${row}: ${l.account} ${def.name} has no sub-ledger. Leave the client, supplier or account empty.`, f("sub"));
    }
    debits += d;
    credits += c;
  }
  if (!opts.allowUnbalanced && debits !== credits) {
    const diff = { amountMinor: Math.abs(debits - credits), currency };
    return { code: "UNBALANCED", message: `Debits and credits must be equal. ${debits > credits ? "Debits" : "Credits"} are higher by ${format(diff)}.`, field: "lines" };
  }
  return null;
}

/** Trimmed copies of the lines as stored on the journal. */
export function cleanLines(lines: JournalLineInput[]): JournalLine[] {
  return lines.map((l) => {
    const out: JournalLine = { account: l.account, debitMinor: l.debitMinor ?? 0, creditMinor: l.creditMinor ?? 0 };
    if (l.sub) out.sub = { type: l.sub.type, id: l.sub.id };
    if (l.memo?.trim()) out.memo = l.memo.trim();
    return out;
  });
}

export const journalTotal = (lines: Pick<JournalLine, "debitMinor">[]): number => lines.reduce((s, l) => s + l.debitMinor, 0);
