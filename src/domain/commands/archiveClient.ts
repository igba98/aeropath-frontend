import type { Command, ID } from "../types";
import { makeAudit } from "../audit";
import { denied, fail, ok, produce } from "./_helpers";

export interface ArchiveClientInput {
  clientId: ID;
  archived: boolean;
}

export const archiveClient: Command<ArchiveClientInput> = (state, input, ctx) => {
  const no = denied(ctx, "client.edit");
  if (no) return no;
  if (typeof input?.archived !== "boolean") return fail("VALIDATION", "Choose whether to archive or restore the client.", "archived");
  const client = state.clients[input.clientId];
  if (!client) return fail("NOT_FOUND", "This client could not be found.", "clientId");
  if (client.archived === input.archived) return ok(state, [], undefined, input.archived ? "Client already archived" : "Client already active");

  const next = produce(state, (d) => {
    d.clients[client.id].archived = input.archived;
  });
  const action = input.archived ? "client.archived" : "client.restored";
  return ok(next, [makeAudit(ctx, action, "client", client.id, `Client ${client.name} ${input.archived ? "archived" : "restored"}`)], undefined, input.archived ? "Client archived" : "Client restored");
};
