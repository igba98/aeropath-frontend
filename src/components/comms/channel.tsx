import { BedDouble, FileText, Mail, MessageCircle, MessageSquareText, Receipt, ScrollText, Ticket, type LucideIcon } from "lucide-react";

import type { MessageAttachment, MessageChannel } from "@/domain/types";
import { CHANNEL_LABELS } from "@/domain/comms";
import { cn } from "@/lib/utils";

/** Channel and document icons for Communications. WhatsApp uses the same speech bubble as every other WhatsApp action. */

export const CHANNEL_ICON: Record<MessageChannel, LucideIcon> = {
  sms: MessageSquareText,
  whatsapp: MessageCircle,
  email: Mail,
};

export const ATTACHMENT_ICON: Record<MessageAttachment["kind"], LucideIcon> = {
  invoice: FileText,
  quote: FileText,
  receipt: Receipt,
  itinerary: ScrollText,
  eticket: Ticket,
  statement: FileText,
  voucher: BedDouble,
  file: FileText,
};

/** Channel icon in a soft square, with the channel name for screen readers (or shown, with `label`). */
export function ChannelMark({ channel, label, className }: { channel: MessageChannel; label?: boolean; className?: string }) {
  const Icon = CHANNEL_ICON[channel];
  return (
    <span className={cn("inline-flex items-center gap-2", className)} title={CHANNEL_LABELS[channel]}>
      <span className="grid size-7 shrink-0 place-items-center rounded-md bg-canvas-2 text-ink-2">
        <Icon className="size-3.5" aria-hidden />
      </span>
      {label ? <span className="text-ink-2">{CHANNEL_LABELS[channel]}</span> : <span className="sr-only">{CHANNEL_LABELS[channel]}</span>}
    </span>
  );
}
