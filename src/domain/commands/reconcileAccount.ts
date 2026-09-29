import { z } from "zod";
import type { BankReconciliation, Command, Ctx, DbState, ID, ISODate } from "../types";
import { makeAudit } from "../audit";
import { format } from "../money";
import { draftOf, lastCompletedOf, reconcilableEntries, reconciliationSummary } from "../accounting/reconciliation";
import { denied, fail, nowIso, ok, parse, produce, unique, type Fail } from "./_helpers";
import { zId, zISODate, zOptText } from "./_schemas";

export interface SaveReconciliationInput {
  /** The draft being worked on; the account's open draft is used when omitted. */
  reconciliationId?: ID;
  moneyAccountId: ID;
  statementDate: ISODate;
  /** Closing balance on the statement, minor units of the account currency. */
  statementBalanceMinor: number;
  clearedEntryIds: ID[];
  notes?: string;
}

export interface SaveReconciliationResult {
  reconciliationId: ID;
  /** statement − cleared balance. */
  differenceMinor: number;
}

const schema = z.object({
  reconciliationId: z.preprocess((v) => (v === "" || v === null ? undefined : v), z.string().optional()),
  moneyAccountId: zId,
  statementDate: zISODate,
  statementBalanceMinor: z.number({ invalid_type_error: "Enter the statement's closing balance." }).int("Amounts must be whole minor units (cents)."),
  clearedEntryIds: z.array(z.string()).default([]),
  notes: zOptText,
});

type Parsed = z.output<typeof schema>;

/** Shared checks: returns the draft (if any), the eligible ticked ids and the summary. */
function prepare(state: DbState, f: Parsed, strict: boolean): Fail | { draft?: BankReconciliation; ids: ID[]; difference: number } {
  const account = state.moneyAccounts[f.moneyAccountId];
  if (!account) return fail("NOT_FOUND", "Choose the account to reconcile.", "moneyAccountId");
  const draft = f.reconciliationId ? state.reconciliations?.[f.reconciliationId] : draftOf(state, account.id);
  if (f.reconciliationId && !draft) return fail("NOT_FOUND", "This reconciliation could not be found.", "reconciliationId");
  if (draft && draft.status !== "draft") return fail("CONFLICT", "This reconciliation is already completed.");
  if (draft && draft.moneyAccountId !== account.id) return fail("VALIDATION", "This reconciliation belongs to another account.", "moneyAccountId");
  const last = lastCompletedOf(state, account.id);
  if (last && f.statementDate < last.statementDate) return fail("VALIDATION", `${account.name} is reconciled to ${last.statementDate}. Use a later statement date.`, "statementDate");
  const eligible = new Set(reconcilableEntries(state, account.id, f.statementDate, draft?.id).map((e) => e.id));
  const ticked = unique(f.clearedEntryIds);
  if (strict) {
    const stray = ticked.find((id) => !eligible.has(id));
    if (stray) return fail("VALIDATION", "A ticked item is dated after the statement date or was already cleared. Untick it and try again.", "clearedEntryIds");
  }
  const ids = ticked.filter((id) => eligible.has(id));
  const summary = reconciliationSummary(state, {
    accountId: account.id,
    statementDate: f.statementDate,
    statementBalanceMinor: f.statementBalanceMinor,
    clearedEntryIds: ids,
    reconciliationId: draft?.id,
  });
  return { draft, ids, difference: summary?.difference ?? 0 };
}

function upsert(state: DbState, f: Parsed, prep: { draft?: BankReconciliation; ids: ID[] }, ctx: Ctx, complete: boolean): { state: DbState; id: ID } {
  const id = prep.draft?.id ?? ctx.newId("rec");
  const at = nowIso(ctx);
  const rec: BankReconciliation = {
    id,
    moneyAccountId: f.moneyAccountId,
    statementDate: f.statementDate,
    statementBalanceMinor: f.statementBalanceMinor,
    clearedEntryIds: prep.ids,
    status: complete ? "completed" : "draft",
    createdAt: prep.draft?.createdAt ?? at,
    createdBy: prep.draft?.createdBy ?? ctx.user.id,
  };
  if (f.notes) rec.notes = f.notes;
  if (complete) {
    rec.completedAt = at;
    rec.completedBy = ctx.user.id;
  }
  const next = produce(state, (d) => {
    if (!d.reconciliations) d.reconciliations = {};
    d.reconciliations[id] = rec;
  });
  return { state: next, id };
}

/** Saves the work in progress (one draft per account). Items that no longer qualify are dropped quietly. */
export const saveReconciliation: Command<SaveReconciliationInput, SaveReconciliationResult> = (state, input, ctx) => {
  const no = denied(ctx, "bank.reconcile");
  if (no) return no;
  const parsed = parse(schema, input);
  if (!parsed.ok) return parsed;
  const prep = prepare(state, parsed.data, false);
  if ("ok" in prep) return prep;
  const { state: next, id } = upsert(state, parsed.data, prep, ctx, false);
  const account = state.moneyAccounts[parsed.data.moneyAccountId];
  return ok(
    next,
    [makeAudit(ctx, "reconciliation.saved", "reconciliation", id, `Reconciliation of ${account.name} to ${parsed.data.statementDate} saved as a draft (${prep.ids.length} items ticked)`)],
    { reconciliationId: id, differenceMinor: prep.difference },
    "Reconciliation saved as a draft",
  );
};

/** Completes a reconciliation: the statement balance must equal the cleared balance (difference nil). */
export const completeReconciliation: Command<SaveReconciliationInput, SaveReconciliationResult> = (state, input, ctx) => {
  const no = denied(ctx, "bank.reconcile");
  if (no) return no;
  const parsed = parse(schema, input);
  if (!parsed.ok) return parsed;
  const prep = prepare(state, parsed.data, true);
  if ("ok" in prep) return prep;
  const account = state.moneyAccounts[parsed.data.moneyAccountId];
  if (prep.difference !== 0) {
    return fail(
      "VALIDATION",
      `The statement and the ticked items differ by ${format({ amountMinor: Math.abs(prep.difference), currency: account.currency })}. Tick or untick items, or add the missing bank charges, until the difference is nil.`,
      "statementBalanceMinor",
    );
  }
  const { state: next, id } = upsert(state, parsed.data, prep, ctx, true);
  const bal = format({ amountMinor: parsed.data.statementBalanceMinor, currency: account.currency });
  return ok(
    next,
    [makeAudit(ctx, "reconciliation.completed", "reconciliation", id, `${account.name} reconciled to the statement of ${parsed.data.statementDate} (${bal}, ${prep.ids.length} items cleared)`)],
    { reconciliationId: id, differenceMinor: 0 },
    `${account.name} reconciled to ${parsed.data.statementDate}`,
  );
};

export interface DiscardReconciliationInput {
  reconciliationId: ID;
}

/** Throws away a draft reconciliation. Completed ones stay as the record. */
export const discardReconciliation: Command<DiscardReconciliationInput> = (state, input, ctx) => {
  const no = denied(ctx, "bank.reconcile");
  if (no) return no;
  const r = state.reconciliations?.[input?.reconciliationId];
  if (!r) return fail("NOT_FOUND", "This reconciliation could not be found.", "reconciliationId");
  if (r.status !== "draft") return fail("CONFLICT", "A completed reconciliation cannot be discarded.");
  const account = state.moneyAccounts[r.moneyAccountId];
  const next = produce(state, (d) => {
    delete d.reconciliations[r.id];
  });
  return ok(
    next,
    [makeAudit(ctx, "reconciliation.discarded", "reconciliation", r.id, `Draft reconciliation of ${account?.name ?? "an account"} to ${r.statementDate} discarded`)],
    undefined,
    "Draft discarded",
  );
};
