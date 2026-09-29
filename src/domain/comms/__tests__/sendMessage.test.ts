import { describe, expect, it } from "vitest";
import { sendMessage, type SendMessageInput } from "../../commands";
import { newClient, newFile } from "../../__tests__/builders";
import { attempt, createWorld, errorOf, run } from "../../__tests__/fixtures";

function setup() {
  const w = createWorld();
  const { clientId, travellerIds } = newClient(w);
  const { fileId } = newFile(w, clientId, travellerIds);
  return { w, clientId, fileId };
}

describe("sendMessage", () => {
  it("records a WhatsApp message as sent, with the booking, attachments and an audit event", () => {
    const { w, clientId, fileId } = setup();
    const { messageId } = run(
      w,
      sendMessage,
      {
        channel: "whatsapp",
        to: "0754 123 456",
        toName: "Peter Test",
        fileId,
        body: "Hello Peter",
        template: "invoice",
        attachments: [{ kind: "invoice", refId: "inv_1", label: "Invoice INV-1", url: "/print/invoice/inv_1" }],
      },
      "neema",
    );
    const m = w.db.messages[messageId];
    expect(m).toMatchObject({ channel: "whatsapp", to: "+255754123456", clientId, fileId, status: "sent", auto: false, template: "invoice", createdBy: "usr_neema", sentAt: w.now.toISOString() });
    expect(m.subject).toBeUndefined();
    expect(m.attachments).toEqual([{ kind: "invoice", refId: "inv_1", label: "Invoice INV-1", url: "/print/invoice/inv_1" }]);
    const audit = w.db.audit.at(-1)!;
    expect(audit).toMatchObject({ action: "message.sent", entity: "message", entityId: messageId, fileId });
    expect(audit.summary).toMatch(/^WhatsApp to Peter Test about AP-2026-\d+ with 1 attachment: Hello Peter$/);
  });

  it("sends email with a subject and a lower-cased address; any role may send", () => {
    const { w, clientId } = setup();
    const r = attempt(w, sendMessage, { channel: "email", to: "Peter@Example.com", clientId, subject: "Statement", body: "Attached." }, "peter");
    expect(r.ok && r.toast).toBe("Sent to peter@example.com");
    if (r.ok) expect(Object.values(r.state.messages)[0]).toMatchObject({ to: "peter@example.com", subject: "Statement", clientId });
  });

  it.each<[string, Partial<SendMessageInput>, string, RegExp]>([
    ["a bad phone", { channel: "sms", to: "12345" }, "to", /mobile number/],
    ["a bad email", { channel: "email", to: "peter@", subject: "Hi" }, "to", /valid email/],
    ["an email without a subject", { channel: "email", to: "p@example.com" }, "subject", /subject/],
    ["an empty body", { body: "   " }, "body", /Write the message/],
    ["an unfilled placeholder", { body: "Your PNR is {pnr}" }, "body", /\{pnr\}/],
    ["an SMS over 10 parts", { channel: "sms", body: "a".repeat(153 * 10 + 1) }, "body", /11 parts/],
    ["an unknown channel", { channel: "fax" as never }, "channel", /valid channel/],
  ])("rejects %s", (_name, patch, field, message) => {
    const { w, clientId } = setup();
    const e = errorOf(attempt(w, sendMessage, { channel: "whatsapp", to: "0754123456", clientId, body: "Hello", ...patch } as SendMessageInput, "neema"));
    expect(e.code).toBe("VALIDATION");
    expect(e.field).toBe(field);
    expect(e.message).toMatch(message);
  });

  it("checks the client and booking exist and belong together", () => {
    const { w, fileId } = setup();
    const other = newClient(w);
    expect(errorOf(attempt(w, sendMessage, { channel: "sms", to: "0754123456", clientId: "cli_nope", body: "Hi" }, "neema")).code).toBe("NOT_FOUND");
    expect(errorOf(attempt(w, sendMessage, { channel: "sms", to: "0754123456", fileId: "fil_nope", body: "Hi" }, "neema")).field).toBe("fileId");
    const e = errorOf(attempt(w, sendMessage, { channel: "sms", to: "0754123456", clientId: other.clientId, fileId, body: "Hi" }, "neema"));
    expect(e.message).toMatch(/belongs to another client/);
  });
});
