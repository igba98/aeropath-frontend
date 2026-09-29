import type { Command, ID } from "../types";
import { makeAudit } from "../audit";
import { denied, fail, nowIso, ok, produce } from "./_helpers";

export interface ReassignFileInput {
  fileId: ID;
  ownerId: ID;
}

export const reassignFile: Command<ReassignFileInput> = (state, input, ctx) => {
  const no = denied(ctx, "booking.reassign");
  if (no) return no;
  const file = state.files[input?.fileId];
  if (!file) return fail("NOT_FOUND", "This booking could not be found.", "fileId");
  const owner = state.users[input.ownerId];
  if (!owner) return fail("NOT_FOUND", "Choose a staff member to own this booking.", "ownerId");
  if (!owner.active) return fail("VALIDATION", `${owner.name} is deactivated. Choose an active staff member.`, "ownerId");
  if (owner.id === file.ownerId) return ok(state, [], undefined, `${owner.name} already owns this booking`);

  const previous = state.users[file.ownerId]?.name ?? "the previous owner";
  const next = produce(state, (d) => {
    d.files[file.id].ownerId = owner.id;
    d.files[file.id].updatedAt = nowIso(ctx);
  });
  return ok(next, [makeAudit(ctx, "file.reassigned", "file", file.id, `Booking ${file.number} reassigned from ${previous} to ${owner.name}`, file.id)], undefined, `Booking reassigned to ${owner.name}`);
};
