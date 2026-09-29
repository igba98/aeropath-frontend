import { describe, expect, it } from "vitest";
import { recordPayment, sendMessage, updateSettings } from "../../commands";
import { major } from "../../money";

const usd = (n: number) => major(n, "USD");
import { addFlight, issueFlight, newClient, newFile } from "../../__tests__/builders";
import { createWorld, run, type World } from "../../__tests__/fixtures";
import { documentOptions, fillPlaceholders, hasPlainSwap, outgoingText, renderTemplate, smsSegments, suggestedDocuments, toPlainSms, upcomingAutoMessages, whatsappHref } from "..";

/** Client "Peter Test" with a booked EK return, DAR 12 Oct 16:50 → DXB, back 26 Oct. */
function booked(w: World = createWorld()) {
  const { clientId, travellerIds } = newClient(w);
  const { fileId } = newFile(w, clientId, travellerIds);
  const lineId = addFlight(w, fileId, travellerIds);
  return { w, clientId, fileId, lineId, number: w.db.files[fileId].number };
}

describe("smsSegments", () => {
  it("counts GSM-7 text at 160 a part, then 153", () => {
    expect(smsSegments("")).toMatchObject({ segments: 0, encoding: "GSM-7", remaining: 160 });
    expect(smsSegments("a".repeat(160))).toMatchObject({ segments: 1, units: 160, perSegment: 160, remaining: 0 });
    expect(smsSegments("a".repeat(161))).toMatchObject({ segments: 2, perSegment: 153, remaining: 145 });
    expect(smsSegments("a".repeat(306)).segments).toBe(2);
    expect(smsSegments("a".repeat(307)).segments).toBe(3);
  });

  it("counts the extension characters twice and keeps accented GSM letters single", () => {
    expect(smsSegments("€{}").units).toBe(6);
    expect(smsSegments("é à ñ ü").encoding).toBe("GSM-7");
    expect(smsSegments("a".repeat(159) + "€").segments).toBe(2);
  });

  it("switches to UCS-2 at 70 a part, 67 when split, and names the characters that did it", () => {
    const s = smsSegments("Safe travels — Aeropath");
    expect(s).toMatchObject({ encoding: "UCS-2", segments: 1, perSegment: 70, nonGsm: ["—"] });
    expect(smsSegments("—".repeat(70)).segments).toBe(1);
    expect(smsSegments("—".repeat(71))).toMatchObject({ segments: 2, perSegment: 67 });
    expect(smsSegments("Karibu 🙂").units).toBe(9); // the emoji is two UTF-16 units
  });

  it("swaps typographic characters for plain ones so the SMS fits GSM-7 again", () => {
    const text = "Safe trip! — Aeropath’s team…";
    expect(hasPlainSwap(text)).toBe(true);
    expect(toPlainSms(text)).toBe("Safe trip! - Aeropath's team...");
    expect(smsSegments(toPlainSms(text)).encoding).toBe("GSM-7");
    expect(toPlainSms("Karibu 🙂")).toBe("Karibu 🙂");
  });
});

describe("renderTemplate", () => {
  it("fills a booking confirmation from the booking", () => {
    const { w, clientId, fileId, number } = booked();
    const r = renderTemplate("booking_confirmation", { db: w.db, clientId, fileId, now: w.now });
    expect(r.subject).toBe(`Your booking ${number} is confirmed`);
    expect(r.body).toContain("Hello Peter, your booking");
    expect(r.body).toContain("EK 726, Mon 12 Oct: DAR 16:50 - DXB 23:05");
    expect(r.body).toContain("EK 725, Mon 26 Oct: DXB 10:20 - DAR 15:00");
    expect(r.body).toContain("Total USD 1,523.60");
    expect(r.body).toContain("by 12 Oct 2026");
    expect(r.body).toContain("Thank you for travelling with Aeropath Travel.");
    expect(r.missing).toEqual([]);
  });

  it("fills the PNR, departure and agent, and greets the chosen contact", () => {
    const { w, clientId, fileId } = booked();
    const r = renderTemplate("flight_reminder", { db: w.db, clientId, fileId, now: w.now, recipientName: "AGNES KESSY" });
    expect(r.subject).toBe("Your flight Mon 12 Oct at 16:50 from DAR (EK 726)");
    expect(r.body.startsWith("Hello Agnes,")).toBe(true);
    const e = renderTemplate("eticket", { db: w.db, clientId, fileId, now: w.now });
    expect(e.body).toContain("(PNR Z8K4QM)");
  });

  it("uses the saved template and leaves what it cannot fill", () => {
    const { w, clientId } = booked();
    run(w, updateSettings, { patch: { comms: { templates: { custom: { subject: "Hi", body: "Hello {client}, about {file} ({pnr}) — {unknown}" } } } } }, "grace");
    const r = renderTemplate("custom", { db: w.db, clientId, now: w.now });
    expect(r.body).toBe("Hello Peter, about {file} ({pnr}) — {unknown}");
    expect(r.missing.sort()).toEqual(["file", "pnr"]);
  });

  it("words a credit balance for the client", () => {
    const { w, clientId, fileId } = booked();
    run(w, recordPayment, { clientId, amount: usd(2000), allocations: [{ fileId, amount: usd(2000) }], method: "cash", accountId: w.acc.crdbUsd }, "neema");
    expect(renderTemplate("payment_receipt", { db: w.db, clientId, fileId }).body).toContain("Balance now USD 476.40 in your favour.");
  });

  it("lets explicit values win", () => {
    const { w, clientId, fileId } = booked();
    expect(renderTemplate("ttl_reminder", { db: w.db, clientId, fileId, vars: { dueDate: "Tue 29 Sep, 18:00" } }).subject).toBe("Seats held until Tue 29 Sep, 18:00");
    expect(fillPlaceholders("{balance} {x}", { balance: "TZS 5" })).toEqual({ text: "TZS 5 {x}", missing: [] });
  });
});

describe("documents and hand-off links", () => {
  it("lists the booking's documents and suggests the right ones per template", () => {
    const { w, clientId, fileId, lineId } = booked();
    issueFlight(w, lineId);
    const docs = documentOptions(w.db, { clientId, fileId });
    expect(docs.map((d) => d.attachment.kind)).toEqual(["itinerary", "eticket", "statement"]);
    expect(docs[1].attachment.url).toBe(`/print/itinerary/${fileId}?line=${lineId}`);
    expect(suggestedDocuments("eticket", docs).map((d) => d.attachment.kind)).toEqual(["eticket"]);
    expect(suggestedDocuments("statement", docs).map((d) => d.attachment.url)).toEqual([`/print/statement/${clientId}`]);
  });

  it("turns attachments into links for WhatsApp", () => {
    const text = outgoingText("Hello", [{ kind: "invoice", label: "Invoice INV-1", url: "/print/invoice/inv_1" }], "https://bo.example");
    expect(text).toBe("Hello\n\nInvoice INV-1: https://bo.example/print/invoice/inv_1");
    expect(whatsappHref("+255 754 123 456", "Hi there")).toBe("https://wa.me/255754123456?text=Hi%20there");
  });
});

describe("upcomingAutoMessages", () => {
  const at = (iso: string) => new Date(iso);

  it("lists the flight and payment reminders coming up, with reachable channels", () => {
    const { w, fileId, lineId } = booked();
    const now = at("2026-10-10T12:00:00Z"); // 15:00 in Dar, two days before departure
    const list = upcomingAutoMessages(w.db, now);
    const flight = list.find((m) => m.rule === "flight_reminder")!;
    expect(flight).toMatchObject({ fileId, lineId, template: "flight_reminder", channels: ["sms", "whatsapp"], dueNow: false });
    expect(flight.sendAt).toBe("2026-10-11T13:50:00.000Z"); // 24 h before 16:50 Dar
    expect(flight.summary).toBe("EK 726 DAR → DXB, Mon 12 Oct, 16:50");
    // The return flight two weeks later is beyond the 7-day window.
    expect(list.filter((m) => m.rule === "flight_reminder")).toHaveLength(1);
    const pay = list.find((m) => m.rule === "payment_reminder")!;
    expect(pay).toMatchObject({ dueNow: true, sendAt: now.toISOString(), summary: "USD 1,523.60 due 12 Oct 2026" });
  });

  it("follows the rules in settings and drops a reminder once it was sent", () => {
    const { w, clientId, fileId } = booked();
    const now = at("2026-10-10T12:00:00Z");
    run(
      w,
      updateSettings,
      { patch: { comms: { auto: { payment_reminder: { enabled: false, channels: ["sms"] }, flight_reminder: { enabled: true, channels: ["email", "whatsapp"], leadHours: 72 } } } } },
      "grace",
    );
    let list = upcomingAutoMessages(w.db, now);
    expect(list.map((m) => m.rule)).toEqual(["flight_reminder"]);
    expect(list[0]).toMatchObject({ channels: ["whatsapp"], dueNow: true }); // no email on file; 72 h lead has passed
    run(w, sendMessage, { channel: "whatsapp", to: "0754123456", clientId, fileId, body: "Reminder", template: "flight_reminder" }, "neema", now);
    list = upcomingAutoMessages(w.db, now);
    expect(list).toEqual([]);
  });

  it("warns before a ticketing time limit when that rule is on", () => {
    const w = createWorld();
    const { clientId, travellerIds } = newClient(w);
    const { fileId } = newFile(w, clientId, travellerIds);
    const lineId = addFlight(w, fileId, travellerIds);
    w.db.lines[lineId] = { ...w.db.lines[lineId], details: { ...w.db.lines[lineId].details, ticketingTimeLimit: "2026-09-29T15:00:00.000Z" } } as never;
    expect(upcomingAutoMessages(w.db, w.now).some((m) => m.rule === "ttl_reminder")).toBe(false);
    run(w, updateSettings, { patch: { comms: { auto: { ttl_reminder: { enabled: true } } } } }, "grace");
    const ttl = upcomingAutoMessages(w.db, w.now).find((m) => m.rule === "ttl_reminder")!;
    expect(ttl.sendAt).toBe("2026-09-29T03:00:00.000Z");
    expect(ttl.summary).toBe("PNR Z8K4QM held until Tue 29 Sep, 18:00");
  });

  it("queues the instant messages of recent events that have not gone out", () => {
    const { w, fileId, lineId } = booked();
    issueFlight(w, lineId);
    const list = upcomingAutoMessages(w.db, new Date(w.now.getTime() + 60_000));
    expect(
      list
        .filter((m) => m.dueNow)
        .map((m) => m.rule)
        .sort(),
    ).toEqual(["booking_confirmation", "ticket_issued"]);
    expect(list.find((m) => m.rule === "ticket_issued")!.attachments.map((a) => a.kind)).toEqual(["eticket"]);
    expect(list.every((m) => m.fileId === fileId)).toBe(true);
  });
});
