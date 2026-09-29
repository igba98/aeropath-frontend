import type { Command, CommandResult, Ctx, DbState } from "../types";

/**
 * Runs a command and, on success, appends its audit events to state.audit.
 * Commands never append audit themselves. Unexpected exceptions become a plain-words error instead of crashing the UI.
 */
export function runCommand<I, R>(state: DbState, command: Command<I, R>, input: I, ctx: Ctx): CommandResult<R> {
  let result: CommandResult<R>;
  try {
    result = command(state, input, ctx);
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return { ok: false, error: { code: "VALIDATION", message: `Something went wrong and nothing was saved. ${detail}` } };
  }
  if (!result.ok) return result;
  if (!result.audit.length) return result;
  return { ...result, state: { ...result.state, audit: [...result.state.audit, ...result.audit] } };
}
