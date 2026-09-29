import type { AutoRule, MessageAttachment, MessageChannel, MessageTemplateKey } from "../types";

/** Names and descriptions for channels, templates, automatic rules and placeholders, shared by the domain and the UI. */

export const CHANNELS: readonly MessageChannel[] = ["sms", "whatsapp", "email"] as const;

export const CHANNEL_LABELS: Record<MessageChannel, string> = {
  sms: "SMS",
  whatsapp: "WhatsApp",
  email: "Email",
};

export const TEMPLATE_KEYS = [
  "booking_confirmation",
  "eticket",
  "itinerary",
  "flight_reminder",
  "payment_reminder",
  "payment_receipt",
  "invoice",
  "quote",
  "hotel_voucher",
  "statement",
  "ttl_reminder",
  "custom",
] as const satisfies readonly MessageTemplateKey[];

export const TEMPLATE_LABELS: Record<MessageTemplateKey, string> = {
  booking_confirmation: "Booking confirmation",
  eticket: "E-ticket",
  itinerary: "Itinerary",
  flight_reminder: "Flight reminder",
  payment_reminder: "Payment reminder",
  payment_receipt: "Payment received",
  invoice: "Invoice",
  quote: "Quote",
  hotel_voucher: "Hotel voucher",
  statement: "Statement of account",
  ttl_reminder: "Seats on hold (time limit)",
  custom: "Blank message",
};

export const AUTO_RULES: readonly AutoRule[] = ["booking_confirmation", "ticket_issued", "payment_receipt", "payment_reminder", "flight_reminder", "ttl_reminder"] as const;

export const AUTO_RULE_INFO: Record<AutoRule, { label: string; description: string; template: MessageTemplateKey; lead?: string }> = {
  booking_confirmation: { label: "Booking confirmation", description: "When a booking is confirmed with the airline or supplier.", template: "booking_confirmation" },
  ticket_issued: { label: "E-ticket", description: "When a ticket is issued, with the e-ticket attached.", template: "eticket" },
  payment_receipt: { label: "Payment received", description: "When a payment is recorded, with the receipt attached.", template: "payment_receipt" },
  payment_reminder: { label: "Payment reminder", description: "Before the balance of a booking falls due.", template: "payment_reminder", lead: "before the due date" },
  flight_reminder: { label: "Flight reminder", description: "Before each departure, with check-in advice.", template: "flight_reminder", lead: "before departure" },
  ttl_reminder: { label: "Seats on hold", description: "Before the airline's ticketing time limit releases held seats.", template: "ttl_reminder", lead: "before the time limit" },
};

export const PLACEHOLDERS = ["client", "file", "pnr", "itinerary", "total", "balance", "dueDate", "departure", "company", "agent"] as const;
export type Placeholder = (typeof PLACEHOLDERS)[number];

export const PLACEHOLDER_INFO: Record<Placeholder, string> = {
  client: "First name of the person you write to",
  file: "Booking number",
  pnr: "Airline booking reference (PNR)",
  itinerary: "Flights, hotels and transfers, one per line",
  total: "Booking total",
  balance: "Amount still to pay (the account balance without a booking)",
  dueDate: "Date the balance is due",
  departure: "Next departure: day, time, airport and flight",
  company: "Your sender name",
  agent: "Your name",
};

export const ATTACHMENT_KIND_LABELS: Record<MessageAttachment["kind"], string> = {
  invoice: "Invoice",
  quote: "Quote",
  receipt: "Receipt",
  itinerary: "Itinerary",
  eticket: "E-ticket",
  statement: "Statement",
  voucher: "Hotel voucher",
  file: "File",
};
