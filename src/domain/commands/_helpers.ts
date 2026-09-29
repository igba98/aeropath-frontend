import { Immer } from "immer";
import type { z } from "zod";
import type { AuditEvent, CommandResult, Ctx, DbState, DomainError, DomainErrorCode, ID, LedgerEntry, NumberSeries, StatusHistoryEntry, LineStatus } from "../types";
import { can, forbiddenMessage, type Action, type PermissionResource } from "../permissions";
import { nextNumber } from "../numbering";
import { UnbalancedError } from "../ledger/postings";

/**
 * Shared plumbing for commands. Commands are pure: they read ctx.now and ctx.newId only, and never mutate the input
 * state (immer copy-on-write; auto-freeze is off so the store and seed can keep working with plain objects).
 */

const immer = new Immer({ autoFreeze: false });
export const produce = immer.produce;

export type Fail = { ok: false; error: DomainError };

export const fail = (code: DomainErrorCode, message: string, field?: string): Fail => ({ ok: false, error: field ? { code, message, field } : { code, message } });

export const isFail = (x: unknown): x is Fail => typeof x === "object" && x !== null && (x as Fail).ok === false && "error" in (x as Fail);

export function ok<R>(state: DbState, audit: AuditEvent[], result?: R, toast?: string): CommandResult<R> {
  const out: CommandResult<R> = { ok: true, state, audit };
  if (result !== undefined) out.result = result;
  if (toast) out.toast = toast;
  return out;
}

/** Permission gate: null when allowed, FORBIDDEN with a plain-words message otherwise. */
export function denied(ctx: Pick<Ctx, "user">, action: Action, resource?: PermissionResource): Fail | null {
  if (can(ctx.user, action, resource)) return null;
  return fail("FORBIDDEN", forbiddenMessage(action, resource, ctx.user));
}

export const nowIso = (ctx: Pick<Ctx, "now">): string => ctx.now.toISOString();

// ───────────────────────────── Validation ─────────────────────────────

function humanize(key: string): string {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_.]/g, " ")
    .toLowerCase()
    .trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : "This field";
}

/** Label for a zod path: last named segment, with a row number when inside a list. */
export function fieldLabel(path: (string | number)[]): string {
  const named = [...path].reverse().find((p) => typeof p === "string") as string | undefined;
  const index = [...path].reverse().find((p) => typeof p === "number") as number | undefined;
  const base = humanize(named ?? "");
  return index !== undefined ? `${base} (row ${index + 1})` : base;
}

export function zodToDomainError(err: z.ZodError, prefix?: string): DomainError {
  const issue = err.issues[0];
  const path = issue.path;
  const field = [prefix, ...path.map(String)].filter((p) => p !== undefined && p !== "").join(".") || undefined;
  const label = fieldLabel(path.length ? path : prefix ? [prefix] : []);
  let message = issue.message;
  switch (issue.code) {
    case "invalid_type":
      message = issue.received === "undefined" || issue.received === "null" ? `${label} is required.` : `${label} is not valid.`;
      break;
    case "invalid_enum_value":
      message = `Choose a valid ${label.toLowerCase()}.`;
      break;
    case "too_small":
      if (issue.message.startsWith("String must") || issue.message.startsWith("Number must") || issue.message.startsWith("Array must")) {
        message =
          issue.type === "string" && Number(issue.minimum) <= 1
            ? `${label} is required.`
            : issue.type === "array"
              ? `Add at least ${issue.minimum} ${label.toLowerCase()}.`
              : `${label} must be at least ${issue.minimum}.`;
      }
      break;
    case "too_big":
      if (issue.message.startsWith("String must") || issue.message.startsWith("Number must")) message = `${label} must be at most ${issue.maximum}.`;
      break;
    default:
      break;
  }
  const out: DomainError = { code: "VALIDATION", message };
  if (field) out.field = field;
  return out;
}

export function parse<S extends z.ZodTypeAny>(schema: S, input: unknown, prefix?: string): { ok: true; data: z.output<S> } | Fail {
  const r = schema.safeParse(input);
  if (r.success) return { ok: true, data: r.data };
  return { ok: false, error: zodToDomainError(r.error, prefix) };
}

// ───────────────────────────── State helpers ─────────────────────────────

/** Takes the next number of a series; returns the number and the updated counters. */
export const takeNumber = (state: DbState, series: NumberSeries, ctx: Pick<Ctx, "now">) => nextNumber(state, series, ctx.now);

export function historyEntry(from: LineStatus | null, to: LineStatus, ctx: Pick<Ctx, "now" | "user">, note?: string): StatusHistoryEntry {
  const e: StatusHistoryEntry = { from, to, at: nowIso(ctx), by: ctx.user.id };
  if (note) e.note = note;
  return e;
}

/** Bumps file.updatedAt inside a draft. */
export function touchFile(draft: DbState, fileId: ID | undefined, at: string): void {
  if (fileId && draft.files[fileId]) draft.files[fileId].updatedAt = at;
}

/** Runs a ledger builder and turns an imbalance into an UNBALANCED error instead of throwing. */
export function post(build: () => LedgerEntry[]): { ok: true; entries: LedgerEntry[] } | Fail {
  try {
    return { ok: true, entries: build() };
  } catch (e) {
    if (e instanceof UnbalancedError) return fail("UNBALANCED", `The ledger postings did not balance, so nothing was saved. ${e.message}`);
    throw e;
  }
}

export const unique = <T>(xs: T[]): T[] => [...new Set(xs)];
