import type { Command, ID } from "../types";
import { makeAudit } from "../audit";
import { travellerDisplayName } from "../describe";
import { WAS_ISSUED_STATUSES } from "../status/line-statuses";
import { denied, fail, nowIso, ok, produce } from "./_helpers";

export interface RemoveTravellerInput {
  travellerId: ID;
}

/** Removes a traveller. Blocked when they are on a line that was issued (tickets and history refer to them). */
export const removeTraveller: Command<RemoveTravellerInput> = (state, input, ctx) => {
  const no = denied(ctx, "traveller.edit");
  if (no) return no;
  const t = state.travellers[input?.travellerId];
  if (!t) return fail("NOT_FOUND", "This traveller could not be found.", "travellerId");

  const name = travellerDisplayName(t);
  const issued = Object.values(state.lines).find((l) => WAS_ISSUED_STATUSES.includes(l.status) && l.travellerIds.includes(t.id));
  if (issued) {
    const file = state.files[issued.fileId];
    return fail("CONFLICT", `${name} is on an issued service (${issued.description}${file ? `, booking ${file.number}` : ""}), so they cannot be removed.`);
  }

  const at = nowIso(ctx);
  const next = produce(state, (d) => {
    delete d.travellers[t.id];
    for (const f of Object.values(d.files)) {
      if (f.travellerIds.includes(t.id)) {
        f.travellerIds = f.travellerIds.filter((x) => x !== t.id);
        f.updatedAt = at;
      }
    }
    for (const l of Object.values(d.lines)) {
      if (!l.travellerIds.includes(t.id)) continue;
      l.travellerIds = l.travellerIds.filter((x) => x !== t.id);
      if (l.type === "flight") l.details.passengers = l.details.passengers.filter((p) => p.travellerId !== t.id);
      l.updatedAt = at;
    }
  });
  return ok(next, [makeAudit(ctx, "traveller.removed", "traveller", t.id, `Traveller ${name} removed`)], undefined, `${name} removed`);
};
