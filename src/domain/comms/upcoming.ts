import type { AutoRule, BookingFile, DbState, FlightLine, ID, ISODateTime, Message, MessageAttachment, MessageChannel, MessageTemplateKey } from "../types";
import { darLocalToUtc, darToday, toDarLocal } from "../dates";
import { format } from "../money";
import { activeLines, linesOfFile } from "../selectors/core";
import { fileTotals } from "../selectors/fileTotals";
import { fileStatus } from "../status/file-status";
import { fileDueAt } from "../status/payment-status";
import { defaultComms } from "../defaults";
import { AUTO_RULE_INFO } from "./labels";
import { dayLabel, longDate, whenLabel } from "./render";
import { documentOptions, suggestedDocuments } from "./documents";
import { channelsFor, defaultRecipient } from "./recipients";

/**
 * Automatic messages the system is about to send, per the enabled rules in Settings → Communications. Shown to staff
 * so they can send one early by hand or skip it; nothing here sends anything.
 *
 *   flight_reminder   leadHours before each departure that starts a journey (not before a connection)
 *   payment_reminder  leadHours before 09:00 on the day the balance is due
 *   ttl_reminder      leadHours before the airline's ticketing time limit on a booked flight
 *   booking_confirmation, ticket_issued, payment_receipt
 *                     go out when the event happens; an event of the last 12 hours without its message is listed
 *                     as due now
 *
 * An item drops off once a message with the same template has gone to the booking inside its window, whether the
 * system or a person sent it. Departure times are airport-local; they are read as Dar es Salaam time, close enough
 * for a reminder.
 */

export interface UpcomingAutoMessage {
  /** Stable id: rule plus the record it is about. */
  id: string;
  rule: AutoRule;
  template: MessageTemplateKey;
  clientId: ID;
  fileId: ID;
  lineId?: ID;
  paymentId?: ID;
  /** When it goes out; `now` when it is already due. */
  sendAt: ISODateTime;
  /** The departure, due date or time limit it is about (the event time for instant rules). */
  eventAt: ISODateTime;
  dueNow: boolean;
  /** Enabled channels the client can receive. */
  channels: MessageChannel[];
  /** What it is about, in a few words: "EK 726 DAR → DXB, Mon 12 Oct 16:50". */
  summary: string;
  attachments: MessageAttachment[];
}

const HOUR = 3_600_000;
const INSTANT_LOOKBACK = 12 * HOUR;
/** A connection within this time of the previous arrival gets no reminder of its own. */
const CONNECTION = 24 * HOUR;

const utcOfLocal = (local: string) => Date.parse(darLocalToUtc(local));

function sentSince(messages: Message[], fileId: ID, template: MessageTemplateKey, since: number): boolean {
  return messages.some((m) => m.fileId === fileId && m.template === template && m.status === "sent" && Date.parse(m.sentAt ?? m.createdAt) >= since);
}

export function upcomingAutoMessages(db: DbState, now: Date, opts: { days?: number } = {}): UpcomingAutoMessage[] {
  const cfg = db.settings.comms?.auto ?? defaultComms().auto;
  const t = now.getTime();
  const horizon = t + (opts.days ?? 7) * 24 * HOUR;
  const today = darToday(now);
  const messages = Object.values(db.messages ?? {});
  const out: UpcomingAutoMessage[] = [];

  const push = (rule: AutoRule, file: BookingFile, when: number, eventAt: number, summary: string, extra: { lineId?: ID; paymentId?: ID; id: string }) => {
    const rc = cfg[rule];
    const client = db.clients[file.clientId];
    if (!rc?.enabled || !client) return;
    const reachable = channelsFor(defaultRecipient(db, client.id));
    const channels = rc.channels.filter((c) => reachable.includes(c));
    if (!channels.length) return;
    const template = AUTO_RULE_INFO[rule].template;
    if (sentSince(messages, file.id, template, when - 24 * HOUR)) return;
    const docs = suggestedDocuments(template, documentOptions(db, { clientId: client.id, fileId: file.id }));
    out.push({
      id: `${rule}:${extra.id}`,
      rule,
      template,
      clientId: client.id,
      fileId: file.id,
      lineId: extra.lineId,
      paymentId: extra.paymentId,
      sendAt: new Date(Math.max(when, t)).toISOString(),
      eventAt: new Date(eventAt).toISOString(),
      dueNow: when <= t,
      channels,
      summary,
      attachments: docs.map((d) => d.attachment),
    });
  };

  for (const file of Object.values(db.files)) {
    if (file.cancelledAt) continue;
    const status = fileStatus(db, file.id, now);
    if (status === "cancelled") continue;
    const lines = activeLines(db, file.id);
    const flights = lines.filter((l): l is FlightLine => l.type === "flight");

    // Flight reminders: each departure that starts a journey, for booked or ticketed flights.
    const lead = (cfg.flight_reminder?.leadHours ?? 24) * HOUR;
    for (const line of flights) {
      if (line.status !== "booked" && line.status !== "issued") continue;
      const segs = [...line.details.segments].sort((a, b) => a.departureLocal.localeCompare(b.departureLocal));
      segs.forEach((s, i) => {
        const dep = utcOfLocal(s.departureLocal);
        const prev = segs[i - 1];
        if (prev && dep - utcOfLocal(prev.arrivalLocal) < CONNECTION) return;
        if (dep <= t || dep - lead > horizon) return;
        push("flight_reminder", file, dep - lead, dep, `${s.carrier} ${s.flightNumber} ${s.origin} → ${s.destination}, ${whenLabel(s.departureLocal)}`, {
          id: `${line.id}:${s.segmentNo}`,
          lineId: line.id,
        });
      });
    }

    // Seats on hold: the ticketing time limit on booked flights.
    const ttlLead = (cfg.ttl_reminder?.leadHours ?? 12) * HOUR;
    for (const line of flights) {
      if (line.status !== "booked" || !line.details.ticketingTimeLimit) continue;
      const ttl = Date.parse(line.details.ticketingTimeLimit);
      if (ttl <= t || ttl - ttlLead > horizon) continue;
      push("ttl_reminder", file, ttl - ttlLead, ttl, `PNR ${line.details.recordLocator} held until ${whenLabel(toDarLocal(line.details.ticketingTimeLimit))}`, { id: line.id, lineId: line.id });
    }

    // Payment reminders: balance due on a confirmed booking.
    if (status === "confirmed" || status === "travelled") {
      const bal = fileTotals(db, file.id).balance;
      const due = fileDueAt(db, file.id);
      if (bal.amountMinor > 0 && due && due >= today) {
        const at = utcOfLocal(`${due}T09:00`);
        const when = at - (cfg.payment_reminder?.leadHours ?? 48) * HOUR;
        if (when <= horizon) push("payment_reminder", file, when, Date.parse(darLocalToUtc(`${due}T23:59`)), `${format(bal)} due ${longDate(due)}`, { id: file.id });
      }
    }

    // Instant rules: events of the last hours still waiting for their message.
    for (const line of linesOfFile(db, file.id)) {
      const booked = line.statusHistory.find((h) => h.to === "booked");
      if (booked && line.status !== "quoted" && Date.parse(booked.at) >= t - INSTANT_LOOKBACK) {
        push("booking_confirmation", file, Date.parse(booked.at), Date.parse(booked.at), `${file.title}, booked ${dayLabel(booked.at.slice(0, 10))}`, { id: file.id });
      }
      if (line.type === "flight" && (line.status === "issued" || line.status === "completed")) {
        const issued = [...line.statusHistory].reverse().find((h) => h.to === "issued");
        if (issued && Date.parse(issued.at) >= t - INSTANT_LOOKBACK) {
          push("ticket_issued", file, Date.parse(issued.at), Date.parse(issued.at), `Ticket ${line.details.recordLocator || line.description} issued`, { id: line.id, lineId: line.id });
        }
      }
    }
  }

  for (const p of Object.values(db.payments)) {
    if (p.direction !== "in" || p.status === "reversed") continue;
    const at = Date.parse(p.receivedAt);
    if (at < t - INSTANT_LOOKBACK || at > t) continue;
    const file = db.files[p.allocations[0]?.fileId ?? ""];
    if (!file || file.cancelledAt) continue;
    push("payment_receipt", file, at, at, `${format(p.amount)} received, receipt ${p.number}`, { id: p.id, paymentId: p.id });
  }

  // One booking confirmation per file, however many lines were booked.
  const seen = new Set<string>();
  return out.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true))).sort((a, b) => a.sendAt.localeCompare(b.sendAt) || a.eventAt.localeCompare(b.eventAt) || a.id.localeCompare(b.id));
}
