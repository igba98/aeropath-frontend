import type { Client, Command, ID } from "../types";
import { makeAudit } from "../audit";
import { denied, fail, ok, parse, produce } from "./_helpers";
import { checkClientDates, clientFromFields, clientSchema, type CreateClientInput } from "./createClient";

/** Patch of client fields. `null` or "" clears an optional field; a missing key leaves it unchanged. */
export type ClientPatch = { [K in keyof CreateClientInput]?: CreateClientInput[K] | null };

export interface UpdateClientInput {
  clientId: ID;
  patch: ClientPatch;
}

/** The editable fields of a client (record bookkeeping fields left out). */
function asInput(c: Client): Record<string, unknown> {
  const rest: Record<string, unknown> = { ...c };
  for (const k of ["id", "createdAt", "createdBy", "archived"]) delete rest[k];
  return rest;
}

export const updateClient: Command<UpdateClientInput> = (state, input, ctx) => {
  const no = denied(ctx, "client.edit");
  if (no) return no;

  const current = state.clients[input?.clientId];
  if (!current) return fail("NOT_FOUND", "This client could not be found.", "clientId");
  if (!input.patch || typeof input.patch !== "object") return fail("VALIDATION", "Nothing to update.", "patch");

  const merged = asInput(current);
  for (const [k, v] of Object.entries(input.patch)) {
    if (v === undefined) continue;
    if (v === null || v === "") delete merged[k];
    else merged[k] = v;
  }
  // The primary contact is the contact person; with contacts replaced, work it out again from them.
  if (input.patch.contacts !== undefined && input.patch.contactPerson === undefined) delete merged.contactPerson;
  const parsed = parse(clientSchema, merged);
  if (!parsed.ok) return parsed;
  const f = parsed.data;
  const badDate = checkClientDates(f, ctx);
  if (badDate) return badDate;

  const creditChanged = JSON.stringify(f.creditLimit ?? null) !== JSON.stringify(current.creditLimit ?? null) || (f.paymentTermsDays ?? null) !== (current.paymentTermsDays ?? null);
  if (creditChanged) {
    const noCredit = denied(ctx, "client.set_credit");
    if (noCredit) return { ...noCredit, error: { ...noCredit.error, field: "creditLimit" } };
  }

  const updated = clientFromFields(current.id, f, { createdAt: current.createdAt, createdBy: current.createdBy, archived: current.archived }, { newId: ctx.newId, existingContacts: current.contacts });
  const changed = Object.keys(input.patch).filter((k) => (input.patch as Record<string, unknown>)[k] !== undefined);
  const next = produce(state, (d) => {
    d.clients[current.id] = updated;
  });
  return ok(next, [makeAudit(ctx, "client.updated", "client", current.id, `Client ${updated.name} updated (${changed.join(", ") || "no changes"})`)], undefined, "Client saved");
};
