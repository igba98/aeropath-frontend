import type { DbState, NumberSeries, Settings, CommsSettings } from "./types";
import { major } from "./money";

/**
 * Default settings and an empty database. Used by the store seed and by tests.
 * FX and fee values are demo values — the Manager edits them in Settings.
 */

export const NUMBER_SERIES: NumberSeries[] = ["file", "invoice", "quote", "receipt", "refund_payout", "refund_request", "supplier_payment", "expense"];

export const DEFAULT_NUMBERING: Settings["numbering"] = {
  file: { prefix: "AP", pad: 6 },
  invoice: { prefix: "INV", pad: 5 },
  quote: { prefix: "QUO", pad: 5 },
  receipt: { prefix: "RCT", pad: 5 },
  refund_payout: { prefix: "RFD", pad: 5 },
  refund_request: { prefix: "RFQ", pad: 5 },
  supplier_payment: { prefix: "SPY", pad: 5 },
  expense: { prefix: "EXP", pad: 5 },
  journal: { prefix: "JV", pad: 5 },
};

export const SYSTEM_USER_ID = "usr_system";

export function defaultSettings(now: Date): Settings {
  return {
    company: {
      name: "Aeropath Travel Ltd",
      tin: "000-000-000",
      vrn: "000-000-000",
      address: "Dar es Salaam, Tanzania",
      phone: "+255754000000",
      email: "info@aeropath.co.tz",
    },
    baseCurrency: "TZS",
    fx: { USD_TZS: 2600, updatedAt: now.toISOString(), updatedBy: SYSTEM_USER_ID },
    vatRate: 0.18,
    vatBase: "service_fee",
    defaultServiceFee: {
      flight: major(50_000, "TZS"),
      hotel: major(30_000, "TZS"),
      car: major(20_000, "TZS"),
      transfer: major(10_000, "TZS"),
      tour: major(30_000, "TZS"),
      visa: major(30_000, "TZS"),
      insurance: major(10_000, "TZS"),
      service_fee: major(50_000, "TZS"),
    },
    refundApprovalLimit: major(500_000, "TZS"),
    voidWindow: "same_day",
    airSettlement: { mode: "consolidator", supplierId: "" },
    defaultPaymentTermsDays: 30,
    numbering: structuredClone(DEFAULT_NUMBERING),
    paymentInstructions:
      "Pay by bank transfer to Aeropath Travel Ltd — CRDB Bank (TZS and USD accounts) or NMB Bank, or by M-Pesa / Airtel Money to our till. Quote the booking number as your reference.",
    airlines: [],
    comms: defaultComms(),
    integrations: {
      amadeus: {
        mode: "off",
        environment: "test",
        officeId: "DARTZ2100",
        mock: { latencyMs: 800, failure: "none" },
      },
    },
  };
}

export function emptyCounters(): Record<NumberSeries, number> {
  return { file: 0, invoice: 0, quote: 0, receipt: 0, refund_payout: 0, refund_request: 0, supplier_payment: 0, expense: 0, journal: 0 };
}

/**
 * Client messaging defaults. Placeholders in braces are filled from the booking:
 * {client} {file} {pnr} {itinerary} {total} {balance} {dueDate} {departure} {company} {agent}.
 */
export function defaultComms(): CommsSettings {
  return {
    senderName: "Aeropath Travel",
    smsSenderId: "AEROPATH",
    whatsappNumber: "+255754000000",
    emailFrom: "bookings@aeropath.co.tz",
    emailSignature: "Aeropath Travel Ltd\nDar es Salaam, Tanzania\n+255 754 000 000",
    auto: {
      booking_confirmation: { enabled: true, channels: ["whatsapp", "email"] },
      ticket_issued: { enabled: true, channels: ["whatsapp", "email"] },
      payment_receipt: { enabled: true, channels: ["sms", "email"] },
      payment_reminder: { enabled: true, channels: ["sms", "whatsapp"], leadHours: 48 },
      flight_reminder: { enabled: true, channels: ["sms", "whatsapp"], leadHours: 24 },
      ttl_reminder: { enabled: false, channels: ["whatsapp"], leadHours: 12 },
    },
    templates: {
      booking_confirmation: {
        subject: "Your booking {file} is confirmed",
        body: "Hello {client}, your booking {file} is confirmed.\n{itinerary}\nTotal {total}. Please pay by {dueDate} to keep the seats. Thank you for travelling with {company}.",
      },
      eticket: { subject: "Your e-ticket for {file}", body: "Hello {client}, your e-ticket for {file} (PNR {pnr}) is attached.\n{itinerary}\nPlease be at the airport 2 hours before international flights and 1 hour before domestic flights. Safe travels!" },
      itinerary: { subject: "Your itinerary {file}", body: "Hello {client}, here is your itinerary for {file}:\n{itinerary}" },
      flight_reminder: { subject: "Your flight {departure}", body: "Hello {client}, a reminder that your flight departs {departure}.\n{itinerary}\nCarry your passport or ID. Have a safe trip! {company}" },
      payment_reminder: { subject: "Payment reminder for {file}", body: "Hello {client}, a friendly reminder that {balance} is due on booking {file} by {dueDate}. Pay by M-Pesa, Airtel Money or bank transfer quoting {file}. Thank you." },
      payment_receipt: { subject: "Payment received for {file}", body: "Hello {client}, we have received your payment for booking {file}. Thank you! Balance now {balance}." },
      invoice: { subject: "Invoice for {file}", body: "Hello {client}, please find the invoice for booking {file} attached. Amount due {balance} by {dueDate}." },
      quote: { subject: "Your quote {file}", body: "Hello {client}, here is the quote for {file}:\n{itinerary}\nTotal {total}. Prices are held until ticketed." },
      hotel_voucher: { subject: "Your hotel voucher {file}", body: "Hello {client}, your hotel voucher for {file} is attached. Show it at check-in." },
      statement: { subject: "Your statement of account", body: "Hello {client}, please find your statement of account attached. Outstanding balance {balance}." },
      ttl_reminder: { subject: "Seats held until {dueDate}", body: "Hello {client}, the seats on {file} are held until {dueDate}. Please pay so we can issue the ticket before the airline releases them." },
      custom: { subject: "", body: "Hello {client}, " },
    },
  };
}

export function createEmptyDb(now: Date): DbState {
  return {
    schemaVersion: 1,
    users: {},
    clients: {},
    travellers: {},
    suppliers: {},
    moneyAccounts: {},
    files: {},
    lines: {},
    payments: {},
    refunds: {},
    supplierPayments: {},
    expenses: {},
    invoices: {},
    messages: {},
    journals: {},
    reconciliations: {},
    ledger: [],
    audit: [],
    settings: defaultSettings(now),
    counters: emptyCounters(),
    session: { userId: null },
  };
}
