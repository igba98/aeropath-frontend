import type { AuditEvent, Ctx, ID } from "./types";

/** Builds an audit event for the acting user at ctx.now. Commands return these; runCommand appends them. */
export function makeAudit(
  ctx: Pick<Ctx, "user" | "now" | "newId">,
  action: string,
  entity: string,
  entityId: ID,
  summary: string,
  fileId?: ID,
): AuditEvent {
  const event: AuditEvent = {
    id: ctx.newId("aud"),
    at: ctx.now.toISOString(),
    actorId: ctx.user.id,
    action,
    entity,
    entityId,
    summary,
  };
  if (fileId) event.fileId = fileId;
  return event;
}
