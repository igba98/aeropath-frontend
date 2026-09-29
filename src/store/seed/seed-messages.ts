/**
 * Seed messages to clients, so Communications opens on a real history: messages staff wrote (through the real
 * sendMessage command) and the automatic confirmations, receipts and reminders the system sent (written as the
 * system user, the way the sender would record them). Text comes from the templates, filled at the moment of sending.
 */
import type { ID, Message, MessageChannel, MessageTemplateKey } from "@/domain/types";
import { sendMessage } from "@/domain/commands";
import { defaultRecipient, documentOptions, renderTemplate, suggestedDocuments } from "@/domain/comms";
import { darLocalToUtc } from "@/domain/dates";
import { SYSTEM_USER_ID } from "@/domain/defaults";
import type { FileBuilder } from "./seed-file";
import type { Seeder, StaffKey } from "./seed-kit";
import { seg } from "./seed-routes";

const MIN = 60_000;

interface Target {
  /** The booking, or a client key ("bahari") for a message about the account. */
  file?: FileBuilder;
  client?: string;
}

interface Draft {
  channel: MessageChannel;
  template: MessageTemplateKey;
  /** Own wording instead of the template's. */
  subject?: string;
  body?: string;
}

/** Builds the message from the template and the database as it is at `at`. */
function compose(s: Seeder, label: string, at: Date, t: Target, d: Draft, agent: StaffKey | null) {
  const fileId: ID | undefined = t.file?.id;
  const clientId = fileId ? s.state.files[fileId].clientId : s.ref(`c:${t.client}`);
  const r = defaultRecipient(s.state, clientId);
  const to = d.channel === "email" ? r?.email : r?.phone;
  if (!r || !to) throw new Error(`${label}: the client has no ${d.channel === "email" ? "email" : "phone"}`);
  const text = renderTemplate(d.template, { db: s.state, clientId, fileId, now: at, recipientName: r.name, agent: agent ? s.staff[agent] : undefined });
  if (!d.body && text.missing.length) throw new Error(`${label}: nothing to fill ${text.missing.join(", ")} with`);
  const attachments = suggestedDocuments(d.template, documentOptions(s.state, { clientId, fileId })).map((x) => x.attachment);
  return { clientId, fileId, to, toName: r.name, subject: d.channel === "email" ? (d.subject ?? text.subject) : undefined, body: d.body ?? text.body, attachments };
}

/** A message a member of staff wrote and sent. */
function manual(s: Seeder, label: string, at: Date, who: StaffKey, t: Target, d: Draft): void {
  s.at(at, label, () => {
    const m = compose(s, label, at, t, d, who);
    s.run(label, at, who, sendMessage, { channel: d.channel, template: d.template, ...m });
  });
}

/** A message an automatic rule sent. */
function auto(s: Seeder, label: string, at: Date, t: Target, d: Draft): void {
  s.at(at, label, () => {
    const m = compose(s, label, at, t, d, null);
    const id = s.newId("msg");
    const iso = at.toISOString();
    const msg: Message = {
      id,
      channel: d.channel,
      to: m.to,
      toName: m.toName,
      clientId: m.clientId,
      body: m.body,
      attachments: m.attachments,
      template: d.template,
      status: "sent",
      auto: true,
      sentAt: iso,
      createdAt: iso,
      createdBy: SYSTEM_USER_ID,
    };
    if (m.fileId) msg.fileId = m.fileId;
    if (m.subject) msg.subject = m.subject;
    s.state = { ...s.state, messages: { ...s.state.messages, [id]: msg } };
  });
}

/** 24 hours before a seeded departure (Dar time), when the flight reminder goes. */
function dayBefore(s: Seeder, code: Parameters<typeof seg>[0], d: number): Date {
  const g = seg(code, d);
  return new Date(Date.parse(darLocalToUtc(s.local(g.d, g.dep))) - 24 * 60 * MIN);
}

export function messages(s: Seeder, files: Record<string, FileBuilder>): void {
  const F = (key: string): FileBuilder => {
    const f = files[key];
    if (!f) throw new Error(`Seed data error: unknown booking ${key}`);
    return f;
  };

  // ── Sent automatically ──
  auto(s, "auto: T1 flight reminder", dayBefore(s, "KQ485", -30), { file: F("T1") }, { channel: "sms", template: "flight_reminder" });
  auto(s, "auto: T2 flight reminder", dayBefore(s, "EK726", -20), { file: F("T2") }, { channel: "whatsapp", template: "flight_reminder" });
  auto(s, "auto: P2 e-ticket", s.day(22, "09:47"), { file: F("P2") }, { channel: "email", template: "eticket" });
  auto(s, "auto: P4 deposit receipt", s.plusMs(s.day(15, "16:10"), 31 * MIN), { file: F("P4") }, { channel: "sms", template: "payment_receipt" });
  auto(s, "auto: P5 balance receipt", s.day(10, "10:11"), { file: F("P5") }, { channel: "sms", template: "payment_receipt" });
  auto(s, "auto: C1c e-ticket", s.day(36, "09:41"), { file: F("C1c") }, { channel: "whatsapp", template: "eticket" });
  auto(s, "auto: B4 booking confirmation", s.day(3, "10:31"), { file: F("B4") }, { channel: "whatsapp", template: "booking_confirmation" });

  // ── Written by staff ──
  manual(s, "message: P1 confirmation", s.day(30, "10:35"), "baraka", { file: F("P1") }, { channel: "whatsapp", template: "booking_confirmation" });
  manual(
    s,
    "message: T3 cheque returned",
    s.day(37, "10:05"),
    "baraka",
    { file: F("T3") },
    {
      channel: "email",
      template: "custom",
      subject: "Your cheque for booking payment was returned",
      body: "Hello Janeth, CRDB returned the cheque you gave us for your Amsterdam ticket, so the booking shows as unpaid again. Your ticket is still valid. Could you pay the balance by bank transfer this week? Our account details are on the invoice. Thank you, and sorry for the trouble.",
    },
  );
  manual(s, "message: P4 hotel voucher", s.day(13, "10:20"), "neema", { file: F("P4") }, { channel: "whatsapp", template: "hotel_voucher" });
  manual(s, "message: Bahari statement", s.day(5, "10:00"), "peter", { client: "bahari" }, { channel: "email", template: "statement" });
  manual(s, "message: U1 payment reminder", s.day(2, "09:30"), "neema", { file: F("U1") }, { channel: "sms", template: "payment_reminder" });
  manual(s, "message: D2 quote", s.day(2, "14:40"), "baraka", { file: F("D2") }, { channel: "whatsapp", template: "quote" });
  manual(s, "message: B2 payment reminder", s.day(1, "10:05"), "baraka", { file: F("B2") }, { channel: "whatsapp", template: "payment_reminder" });
}
