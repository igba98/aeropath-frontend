import type { Command, Settings } from "../types";
import { makeAudit } from "../audit";
import { denied, fail, nowIso, ok, produce, zodToDomainError } from "./_helpers";
import { settingsSchema } from "./_settingsSchema";

/** Deep partial where arrays (and unions such as voidWindow) are replaced whole. `null` removes an optional key. */
export type DeepPartial<T> = T extends (infer U)[] ? U[] : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> | null } : T;

export interface UpdateSettingsInput {
  patch: DeepPartial<Settings>;
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function deepMerge<T>(base: T, patch: unknown): T {
  if (patch === undefined) return base;
  if (!isPlainObject(base) || !isPlainObject(patch)) return patch as T;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    if (v === null) delete out[k];
    else out[k] = deepMerge(out[k], v);
  }
  return out as T;
}

/** Manager only. Deep-merges the patch; an FX change records updatedAt/updatedBy. */
export const updateSettings: Command<UpdateSettingsInput> = (state, input, ctx) => {
  const no = denied(ctx, "settings.edit");
  if (no) return no;
  const patch = input?.patch;
  if (!isPlainObject(patch)) return fail("VALIDATION", "Nothing to update.", "patch");
  if (patch.integrations !== undefined) {
    const noInt = denied(ctx, "integration.manage");
    if (noInt) return noInt;
  }

  const current = state.settings;
  const merged = deepMerge(current, patch);
  merged.fx = { ...merged.fx, updatedAt: current.fx.updatedAt, updatedBy: current.fx.updatedBy }; // system-managed

  const r = settingsSchema.safeParse(merged);
  if (!r.success) return { ok: false, error: zodToDomainError(r.error, "patch") };
  if (merged.integrations.amadeus.mode === "live") {
    return fail("VALIDATION", "Live Amadeus is available after the API contract is signed. Use Mock for now.", "patch.integrations.amadeus.mode");
  }
  if (merged.refundApprovalLimit.currency !== "TZS") return fail("VALIDATION", "Set the refund approval limit in TZS.", "patch.refundApprovalLimit");
  const airId = merged.airSettlement.supplierId;
  if (airId && airId !== current.airSettlement.supplierId && !state.suppliers[airId]) {
    return fail("NOT_FOUND", "Choose an existing supplier for air settlement.", "patch.airSettlement.supplierId");
  }
  const numbering = { ...merged.numbering };
  for (const key of Object.keys(numbering) as (keyof Settings["numbering"])[]) {
    numbering[key] = { prefix: numbering[key].prefix.trim().toUpperCase(), pad: numbering[key].pad };
  }
  merged.numbering = numbering;

  const fxChanged = merged.fx.USD_TZS !== current.fx.USD_TZS;
  if (fxChanged) merged.fx = { USD_TZS: merged.fx.USD_TZS, updatedAt: nowIso(ctx), updatedBy: ctx.user.id };

  const next = produce(state, (d) => {
    d.settings = merged;
  });
  const patchRecord = patch as Record<string, unknown>;
  const keys = Object.keys(patchRecord).filter((k) => patchRecord[k] !== undefined);
  const fmt = (n: number) => n.toLocaleString("en-US");
  const fxNote = fxChanged ? `; exchange rate 1 USD = TZS ${fmt(current.fx.USD_TZS)} → TZS ${fmt(merged.fx.USD_TZS)}` : "";
  return ok(next, [makeAudit(ctx, "settings.updated", "settings", "settings", `Settings updated (${keys.join(", ")})${fxNote}`)], undefined, "Settings saved");
};
