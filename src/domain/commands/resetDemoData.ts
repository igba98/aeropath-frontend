import type { Command } from "../types";
import { makeAudit } from "../audit";
import { denied, ok } from "./_helpers";

export type ResetDemoDataInput = Record<string, never> | undefined;

/** Manager only. The command only checks permission and records the event; the store does the reseed. */
export const resetDemoData: Command<ResetDemoDataInput> = (state, _input, ctx) => {
  const no = denied(ctx, "demo.reset");
  if (no) return no;
  return ok(state, [makeAudit(ctx, "demo.reset", "system", "demo", "Demo data reset")], undefined, "Demo data reset");
};
