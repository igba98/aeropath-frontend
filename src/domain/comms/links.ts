import type { MessageAttachment } from "../types";

/**
 * Hand-off links for sending from the agent's own device: WhatsApp (wa.me), the email app (mailto:) and SMS (sms:).
 * None of them can carry files, so attachments travel as links to the printable documents.
 * TODO(backend): signed, public document links; today the print routes need a signed-in browser.
 */

/** "Invoice INV-2026-00088: https://…/print/invoice/…" per attachment. */
export function attachmentLinks(attachments: MessageAttachment[], origin: string): string[] {
  return attachments.filter((a) => a.url).map((a) => `${a.label}: ${/^https?:|^data:/.test(a.url!) ? a.url : `${origin}${a.url}`}`);
}

/** The text as it leaves the device: the body, the attachment links and, for email, the signature. */
export function outgoingText(body: string, attachments: MessageAttachment[], origin: string, signature?: string): string {
  const parts = [body.trim()];
  const links = attachmentLinks(attachments, origin);
  if (links.length) parts.push(links.join("\n"));
  if (signature?.trim()) parts.push(`--\n${signature.trim()}`);
  return parts.join("\n\n");
}

export function whatsappHref(phoneE164: string, text: string): string {
  const digits = phoneE164.replace(/[^\d]/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function mailtoHref(to: string, subject: string, text: string): string {
  return `mailto:${encodeURIComponent(to).replace(/%40/g, "@")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
}

/** "sms:+255…?&body=…" opens the messages app on both iOS and Android. */
export function smsHref(phoneE164: string, text: string): string {
  return `sms:${phoneE164.replace(/[^\d+]/g, "")}?&body=${encodeURIComponent(text)}`;
}
