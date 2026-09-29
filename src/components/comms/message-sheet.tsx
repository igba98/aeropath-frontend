"use client";

import Link from "next/link";
import { Bot, Forward, Repeat2 } from "lucide-react";

import type { ID, Message } from "@/domain/types";
import { can } from "@/domain/permissions";
import { CHANNEL_LABELS, TEMPLATE_LABELS } from "@/domain/comms";
import { useApp, useMe } from "@/store";
import { fmtDateTime } from "@/lib/dates";

import { Button } from "@/components/ui/button";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { KeyValues } from "@/components/shared/bits";
import { StatusChip } from "@/components/shared/status-chip";
import { ChannelMark } from "./channel";
import { openComposer } from "./composer";
import { MessagePreview } from "./preview";

const STATUS: Record<Message["status"], { label: string; tone: "green" | "blue" | "red" }> = {
  sent: { label: "Sent", tone: "green" },
  scheduled: { label: "Scheduled", tone: "blue" },
  failed: { label: "Failed", tone: "red" },
};

/** One message in full, as the client saw it, with Send again and Forward. Opens from ?open=<messageId>. */
export function MessageSheet({ messageId, onClose }: { messageId?: ID | null; onClose: () => void }) {
  const message = useApp((s) => (messageId ? s.db!.messages?.[messageId] : undefined));
  return (
    <Sheet open={Boolean(message)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="sm:max-w-xl">{message && <MessageDetail m={message} onClose={onClose} />}</SheetContent>
    </Sheet>
  );
}

function MessageDetail({ m, onClose }: { m: Message; onClose: () => void }) {
  const me = useMe();
  const db = useApp((s) => s.db)!;
  const client = m.clientId ? db.clients[m.clientId] : undefined;
  const file = m.fileId ? db.files[m.fileId] : undefined;
  const by = db.users[m.createdBy];
  const at = m.sentAt ?? m.createdAt;
  const st = STATUS[m.status];
  const canSend = can(me, "comms.send");
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  const again = () => {
    onClose();
    openComposer({ clientId: m.clientId, fileId: m.fileId, channel: m.channel, template: m.template, attachments: m.attachments, to: m.to, toName: m.toName, subject: m.subject, body: m.body });
  };
  const forward = () => {
    onClose();
    openComposer({ clientId: m.clientId, fileId: m.fileId, template: m.template, attachments: m.attachments, subject: m.subject ? `Fwd: ${m.subject}` : undefined, body: m.body });
  };

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex flex-wrap items-center gap-2.5">
          <ChannelMark channel={m.channel} />
          <span className="min-w-0">
            {CHANNEL_LABELS[m.channel]} to {m.toName ?? m.to}
          </span>
          <StatusChip label={st.label} tone={st.tone} />
        </SheetTitle>
        <SheetDescription className="flex flex-wrap items-center gap-x-1.5">
          <span className="tnum">{fmtDateTime(at)}</span>
          <span aria-hidden>·</span>
          {m.auto ? (
            <span className="inline-flex items-center gap-1">
              <Bot className="size-3.5" aria-hidden /> Sent automatically
            </span>
          ) : (
            <span>Sent by {by?.name ?? "staff"}</span>
          )}
        </SheetDescription>
      </SheetHeader>
      <SheetBody className="space-y-6">
        <KeyValues
          items={[
            { label: "To", value: <span className="tnum">{m.toName ? `${m.toName} · ${m.to}` : m.to}</span> },
            {
              label: "Client",
              value: client ? (
                <Link href={`/clients/${client.id}`} className="hover:underline">
                  {client.name}
                </Link>
              ) : (
                "—"
              ),
            },
            {
              label: "Booking",
              value: file ? (
                <Link href={`/bookings/${file.id}`} className="font-mono text-[13.5px] whitespace-nowrap hover:underline">
                  {file.number}
                </Link>
              ) : (
                "—"
              ),
            },
            { label: "Template", value: m.template ? TEMPLATE_LABELS[m.template] : "—" },
            { label: "Attachments", value: m.attachments.length ? m.attachments.map((a) => a.label).join(", ") : "None" },
          ]}
        />
        <section>
          <h3 className="mb-2.5 text-sm font-semibold text-ink">Message</h3>
          <MessagePreview channel={m.channel} to={m.to} toName={m.toName} subject={m.subject} body={m.body} attachments={m.attachments} sender={db.settings.comms} at={at} origin={origin} />
        </section>
      </SheetBody>
      {canSend && (
        <SheetFooter>
          <Button variant="outline" onClick={forward}>
            <Forward /> Forward
          </Button>
          <Button onClick={again}>
            <Repeat2 /> Send again
          </Button>
        </SheetFooter>
      )}
    </>
  );
}
