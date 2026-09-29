import { z } from "zod";
import type { Command, ID, Message, MessageAttachment, MessageChannel, MessageTemplateKey } from "../types";
import { makeAudit } from "../audit";
import { normalisePhone } from "../validation";
import { CHANNEL_LABELS, TEMPLATE_KEYS } from "../comms/labels";
import { unfilledPlaceholders } from "../comms/render";
import { MAX_SMS_SEGMENTS, smsSegments } from "../comms/sms";
import { denied, fail, nowIso, ok, parse, produce } from "./_helpers";
import { zOptText, zText } from "./_schemas";

export interface SendMessageInput {
  channel: MessageChannel;
  /** Phone (any common form; stored as E.164) for SMS and WhatsApp, an address for email. */
  to: string;
  toName?: string;
  clientId?: ID;
  fileId?: ID;
  /** Email only. */
  subject?: string;
  body: string;
  attachments?: MessageAttachment[];
  template?: MessageTemplateKey;
}

export interface SendMessageResult {
  messageId: ID;
}

const ATTACHMENT_KINDS = ["invoice", "quote", "receipt", "itinerary", "eticket", "statement", "voucher", "file"] as const;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const attachmentSchema = z.object({
  kind: z.enum(ATTACHMENT_KINDS),
  refId: zOptText,
  label: zText("Attachment name"),
  url: zOptText,
});

const sendMessageSchema = z.object({
  channel: z.enum(["sms", "whatsapp", "email"]),
  to: z.string({ required_error: "Choose who to send it to." }).trim().min(1, "Choose who to send it to."),
  toName: zOptText,
  clientId: zOptText,
  fileId: zOptText,
  subject: zOptText,
  body: z.string({ required_error: "Write the message." }).trim().min(1, "Write the message."),
  attachments: z.array(attachmentSchema).max(10, "Attach at most 10 documents.").default([]),
  template: z.enum(TEMPLATE_KEYS).optional(),
});

const preview = (s: string, n = 60) => {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > n ? `${one.slice(0, n - 1)}…` : one;
};

/**
 * Records a message to a client as sent (SMS, WhatsApp or email). Any role may message clients.
 * TODO(backend): hand the message to the SMS gateway, WhatsApp Business API or mail service and track delivery.
 */
export const sendMessage: Command<SendMessageInput, SendMessageResult> = (state, input, ctx) => {
  const no = denied(ctx, "comms.send");
  if (no) return no;
  const parsed = parse(sendMessageSchema, input);
  if (!parsed.ok) return parsed;
  const f = parsed.data;

  let to = f.to;
  if (f.channel === "email") {
    to = to.toLowerCase();
    if (!EMAIL_RE.test(to)) return fail("VALIDATION", "Enter a valid email address, e.g. name@example.com.", "to");
    if (!f.subject) return fail("VALIDATION", "Add a subject for the email.", "subject");
  } else {
    const phone = normalisePhone(to);
    if (!phone) return fail("VALIDATION", `Enter a mobile number like 0754 123 456 or +255 754 123 456 for ${CHANNEL_LABELS[f.channel]}.`, "to");
    to = phone;
  }

  const unfilled = unfilledPlaceholders(`${f.channel === "email" ? (f.subject ?? "") : ""}\n${f.body}`);
  if (unfilled.length) {
    const list = unfilled.map((p) => `{${p}}`).join(", ");
    return fail("VALIDATION", `Replace ${list} before sending: there is nothing to fill ${unfilled.length === 1 ? "it" : "them"} with.`, "body");
  }
  if (f.channel === "sms") {
    const sms = smsSegments(f.body);
    if (sms.segments > MAX_SMS_SEGMENTS) return fail("VALIDATION", `This SMS runs to ${sms.segments} parts. Shorten it to ${MAX_SMS_SEGMENTS} or fewer, or send it by WhatsApp or email.`, "body");
  }

  const file = f.fileId ? state.files[f.fileId] : undefined;
  if (f.fileId && !file) return fail("NOT_FOUND", "That booking no longer exists.", "fileId");
  const clientId = f.clientId ?? file?.clientId;
  const client = clientId ? state.clients[clientId] : undefined;
  if (clientId && !client) return fail("NOT_FOUND", "That client no longer exists.", "clientId");
  if (file && client && file.clientId !== client.id) return fail("VALIDATION", `Booking ${file.number} belongs to another client.`, "fileId");

  const at = nowIso(ctx);
  const id = ctx.newId("msg");
  const message: Message = {
    id,
    channel: f.channel,
    to,
    body: f.body,
    attachments: f.attachments.map((a) => {
      const out: MessageAttachment = { kind: a.kind, label: a.label };
      if (a.refId) out.refId = a.refId;
      if (a.url) out.url = a.url;
      return out;
    }),
    status: "sent",
    auto: false,
    sentAt: at,
    createdAt: at,
    createdBy: ctx.user.id,
  };
  if (client) message.clientId = client.id;
  if (file) message.fileId = file.id;
  if (f.toName) message.toName = f.toName;
  if (f.channel === "email" && f.subject) message.subject = f.subject;
  if (f.template) message.template = f.template;

  const next = produce(state, (d) => {
    d.messages = { ...(d.messages ?? {}), [id]: message };
  });
  const who = f.toName ?? to;
  const about = file ? ` about ${file.number}` : "";
  const files = message.attachments.length ? ` with ${message.attachments.length} attachment${message.attachments.length === 1 ? "" : "s"}` : "";
  return ok(
    next,
    [makeAudit(ctx, "message.sent", "message", id, `${CHANNEL_LABELS[f.channel]} to ${who}${about}${files}: ${preview(message.subject ?? f.body)}`, file?.id)],
    { messageId: id },
    `Sent to ${who}`,
  );
};
