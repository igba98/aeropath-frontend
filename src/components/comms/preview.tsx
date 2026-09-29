"use client";

import * as React from "react";
import { CheckCheck, Paperclip } from "lucide-react";

import type { CommsSettings, MessageAttachment, MessageChannel } from "@/domain/types";
import { ATTACHMENT_KIND_LABELS, attachmentLinks, PLACEHOLDERS, smsSegments } from "@/domain/comms";
import { darToday, fmtDate, fmtTime } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { ATTACHMENT_ICON } from "./channel";

/**
 * How the client sees a message: an SMS thread on a phone, a WhatsApp chat with document bubbles, or an email in a
 * reading pane. Placeholders that could not be filled are marked in amber so they are fixed before sending.
 */

export type SenderIdentity = Pick<CommsSettings, "senderName" | "smsSenderId" | "whatsappNumber" | "emailFrom" | "emailSignature">;

export interface PreviewProps {
  channel: MessageChannel;
  to?: string;
  toName?: string;
  subject?: string;
  body: string;
  attachments: MessageAttachment[];
  sender: SenderIdentity;
  /** When it was (or will be) sent; defaults to now. */
  at?: string;
  /** Site origin for attachment links (SMS). */
  origin: string;
  className?: string;
}

const TOKEN_RE = /(\{[A-Za-z]+\}|https?:\/\/[^\s]+)/g;

/** Body text with unfilled placeholders marked and links made clickable. */
function RichText({ text }: { text: string }) {
  const parts = text.split(TOKEN_RE);
  return (
    <>
      {parts.map((p, i) => {
        if (/^\{[A-Za-z]+\}$/.test(p) && (PLACEHOLDERS as readonly string[]).includes(p.slice(1, -1))) {
          return (
            <mark key={i} title="No value for this placeholder yet" className="rounded-[3px] bg-[var(--st-amber-bg)] px-0.5 font-medium text-[var(--st-amber-fg)] ring-1 ring-[var(--st-amber-bd)]">
              {p}
            </mark>
          );
        }
        if (/^https?:\/\//.test(p)) {
          return (
            <a key={i} href={p} target="_blank" rel="noreferrer" className="break-all text-link underline underline-offset-2">
              {p}
            </a>
          );
        }
        return <React.Fragment key={i}>{p}</React.Fragment>;
      })}
    </>
  );
}

/** "Today" for a live preview or a message sent today, else the date. */
const dayWord = (at?: string) => (!at || darToday(new Date(at)) === darToday() ? "Today" : fmtDate(at));

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

export function MessagePreview(props: PreviewProps) {
  const { channel } = props;
  if (channel === "sms") return <SmsPreview {...props} />;
  if (channel === "whatsapp") return <WhatsAppPreview {...props} />;
  return <EmailPreview {...props} />;
}

function SmsPreview({ body, attachments, sender, at, origin, className }: PreviewProps) {
  const text = [body.trim(), ...attachmentLinks(attachments, origin)].filter(Boolean).join("\n\n");
  const sms = smsSegments(text);
  const time = fmtTime(at ?? new Date().toISOString());
  return (
    <div className={cn("space-y-2.5", className)}>
      <div className="mx-auto w-full max-w-[340px] overflow-hidden rounded-[26px] border border-rule-2 bg-paper shadow-card">
        <div className="border-b border-rule px-4 pt-2.5 pb-3 text-center">
          <div aria-hidden className="mx-auto mb-3 h-1 w-10 rounded-full bg-rule-2" />
          <span className="mx-auto grid size-9 place-items-center rounded-full bg-canvas-2 text-[13px] font-semibold text-ink-2">{initialsOf(sender.smsSenderId || sender.senderName) || "SMS"}</span>
          <p className="mt-1.5 text-[13px] font-semibold text-ink">{sender.smsSenderId || sender.senderName}</p>
          <p className="text-[11px] text-ink-3">Text message</p>
        </div>
        <div className="min-h-[200px] space-y-2 px-3 py-4">
          <p className="text-center text-[11px] text-ink-4">
            {dayWord(at)} {time}
          </p>
          {text ? (
            <div className="max-w-[88%] rounded-2xl rounded-bl-md bg-canvas-2 px-3.5 py-2.5 text-[14px] leading-5 break-words whitespace-pre-wrap text-ink">
              <RichText text={text} />
            </div>
          ) : (
            <p className="px-2 text-center text-[13px] text-ink-4">The message appears here as you write it.</p>
          )}
        </div>
      </div>
      <p className="tnum text-center text-[13px] text-ink-3">
        {sms.segments <= 1 ? "1 SMS" : `${sms.segments} SMS joined as one`} · {sms.units} characters · {sms.remaining} left in this part
        {sms.encoding === "UCS-2" && (
          <span className="mt-0.5 block text-[var(--st-amber-fg)]">
            {sms.nonGsm
              .slice(0, 4)
              .map((c) => `“${c}”`)
              .join(" ")}{" "}
            {sms.nonGsm.length === 1 ? "is" : "are"} not in the SMS alphabet, so each part holds {sms.perSegment} characters instead of {sms.segments > 1 ? 153 : 160}.
          </span>
        )}
      </p>
    </div>
  );
}

function DocBubble({ a }: { a: MessageAttachment }) {
  const Icon = ATTACHMENT_ICON[a.kind];
  return (
    <a
      href={a.url}
      target="_blank"
      rel="noreferrer"
      className="flex max-w-[88%] items-center gap-3 rounded-xl rounded-tl-sm border border-rule bg-paper p-2.5 shadow-card transition-colors hover:border-rule-2"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-md bg-canvas-2 text-ink-2">
        <Icon className="size-4" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[13px] font-semibold text-ink">{a.label}</span>
        <span className="block text-[11px] text-ink-3">{ATTACHMENT_KIND_LABELS[a.kind]} · PDF</span>
      </span>
    </a>
  );
}

function WhatsAppPreview({ body, attachments, sender, at, className }: PreviewProps) {
  const time = fmtTime(at ?? new Date().toISOString());
  const text = body.trim();
  return (
    <div className={cn("overflow-hidden rounded-xl border border-rule-2 bg-paper shadow-card", className)}>
      <div className="flex items-center gap-3 border-b border-rule px-4 py-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-primary text-[13px] font-semibold text-primary-foreground">{initialsOf(sender.senderName) || "WA"}</span>
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-sm font-semibold text-ink">
            <span className="truncate">{sender.senderName}</span>
          </span>
          <span className="tnum block text-xs text-ink-3">Business account · {sender.whatsappNumber}</span>
        </span>
      </div>
      <div className="min-h-[240px] space-y-1.5 bg-canvas px-3 py-4">
        <p className="mb-2 text-center">
          <span className="rounded-md bg-paper px-2 py-0.5 text-[11px] font-medium text-ink-3 shadow-card">{dayWord(at)}</span>
        </p>
        {attachments.map((a) => (
          <DocBubble key={`${a.kind}:${a.refId ?? a.label}`} a={a} />
        ))}
        {text ? (
          <div className="relative max-w-[88%] rounded-xl rounded-tl-sm border border-rule bg-paper px-3 pt-2 pb-5 text-[14px] leading-5 break-words whitespace-pre-wrap text-ink shadow-card">
            <RichText text={text} />
            <span className="tnum absolute right-2.5 bottom-1 inline-flex items-center gap-1 text-[11px] text-ink-4">
              {time}
              <CheckCheck className="size-3.5 text-brand-600 dark:text-brand-300" aria-label="Delivered" />
            </span>
          </div>
        ) : (
          !attachments.length && <p className="px-2 pt-6 text-center text-[13px] text-ink-4">The message appears here as you write it.</p>
        )}
      </div>
    </div>
  );
}

function EmailPreview({ to, toName, subject, body, attachments, sender, at, className }: PreviewProps) {
  const text = body.trim();
  const sig = sender.emailSignature?.trim();
  return (
    <div className={cn("overflow-hidden rounded-xl border border-rule-2 bg-paper shadow-card", className)}>
      <div className="border-b border-rule px-5 py-4">
        <p className={cn("text-[17px] leading-6 font-semibold", subject ? "text-ink" : "text-ink-4")}>{subject ? <RichText text={subject} /> : "No subject"}</p>
        <dl className="mt-2.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[13px]">
          <dt className="text-ink-3">From</dt>
          <dd className="min-w-0 truncate text-ink">
            {sender.senderName} <span className="text-ink-3">&lt;{sender.emailFrom}&gt;</span>
          </dd>
          <dt className="text-ink-3">To</dt>
          <dd className="min-w-0 truncate text-ink">
            {to ? (
              <>
                {toName && toName !== to ? `${toName} ` : ""}
                <span className={toName && toName !== to ? "text-ink-3" : undefined}>{toName && toName !== to ? `<${to}>` : to}</span>
              </>
            ) : (
              <span className="text-ink-4">Choose a recipient</span>
            )}
          </dd>
          <dt className="text-ink-3">Date</dt>
          <dd className="tnum text-ink-2">
            {dayWord(at)}, {fmtTime(at ?? new Date().toISOString())}
          </dd>
        </dl>
      </div>
      <div className="px-5 py-4 text-[14px] leading-6 break-words whitespace-pre-wrap text-ink">
        {text ? <RichText text={text} /> : <span className="text-ink-4">The message appears here as you write it.</span>}
        {sig && <div className="mt-4 border-t border-rule pt-3 text-[13px] leading-5 text-ink-3">{sig}</div>}
      </div>
      {attachments.length > 0 && (
        <div className="border-t border-rule bg-table-head px-5 py-3.5">
          <p className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-ink-2">
            <Paperclip className="size-3.5" aria-hidden /> {attachments.length} attachment{attachments.length === 1 ? "" : "s"}
          </p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {attachments.map((a) => {
              const Icon = ATTACHMENT_ICON[a.kind];
              return (
                <li key={`${a.kind}:${a.refId ?? a.label}`}>
                  <a href={a.url} target="_blank" rel="noreferrer" className="flex items-center gap-2.5 rounded-lg border border-rule bg-paper px-2.5 py-2 transition-colors hover:border-rule-2">
                    <Icon className="size-4 shrink-0 text-ink-3" aria-hidden />
                    <span className="min-w-0 truncate text-[13px] font-medium text-ink">{a.label}.pdf</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
