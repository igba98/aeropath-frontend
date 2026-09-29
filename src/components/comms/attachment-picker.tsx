"use client";

import * as React from "react";
import { ExternalLink } from "lucide-react";

import type { MessageAttachment, MessageChannel } from "@/domain/types";
import { attachmentKey, type DocumentOption } from "@/domain/comms";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { ATTACHMENT_ICON } from "./channel";

const GROUP_ORDER: DocumentOption["group"][] = ["Invoices and quotes", "Receipts", "Travel documents", "Account"];

/** The booking's documents as checkable rows, grouped; anything attached that is not in the list shows too. */
export function AttachmentPicker({
  docs,
  selected,
  onToggle,
  channel,
  hasFile,
  idPrefix = "att",
}: {
  docs: DocumentOption[];
  selected: MessageAttachment[];
  onToggle: (a: MessageAttachment, on: boolean) => void;
  channel: MessageChannel;
  hasFile: boolean;
  idPrefix?: string;
}) {
  const chosen = new Set(selected.map(attachmentKey));
  const extras = selected.filter((a) => !docs.some((d) => d.key === attachmentKey(a)));
  const groups = GROUP_ORDER.map((g) => ({ label: g as string, items: docs.filter((d) => d.group === g) })).filter((g) => g.items.length);
  if (extras.length) groups.unshift({ label: "Attached", items: extras.map((a) => ({ key: attachmentKey(a), group: "Account", attachment: a })) });

  return (
    <fieldset className="min-w-0">
      <legend className="flex w-full items-baseline justify-between gap-3 text-sm font-semibold text-ink">
        Attachments
        <span className="tnum text-[13px] font-normal text-ink-3">{selected.length ? `${selected.length} attached` : "None"}</span>
      </legend>
      {channel !== "email" && (
        <p className="mt-1 text-[13px] text-ink-3">
          {channel === "sms"
            ? "An SMS can’t carry files, so each document goes as a link at the end of the text."
            : "Documents show as files here; opened in WhatsApp on this device, each goes as a link."}
        </p>
      )}
      {groups.length === 0 ? (
        <p className="mt-2 rounded-lg border border-dashed border-rule-2 px-3 py-4 text-center text-[13px] text-ink-3">
          Choose a client to attach their statement, or a booking for its invoices, receipts, e-tickets and vouchers.
        </p>
      ) : (
        <div className="mt-2 divide-y divide-rule overflow-hidden rounded-lg border border-rule">
          {groups.map((g) => (
            <div key={g.label} className="p-1">
              <p className="px-2 pt-1.5 pb-1 text-xs font-semibold text-ink-3">{g.label}</p>
              {g.items.map((d) => {
                const Icon = ATTACHMENT_ICON[d.attachment.kind];
                const id = `${idPrefix}-${d.key.replace(/[^\w-]/g, "_")}`;
                const on = chosen.has(d.key);
                return (
                  <div key={d.key} className={cn("flex items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-band-hover", on && "bg-band/60")}>
                    <Checkbox id={id} checked={on} onCheckedChange={(v) => onToggle(d.attachment, v === true)} />
                    <label htmlFor={id} className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5 py-0.5">
                      <Icon className="size-4 shrink-0 text-ink-3" aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-sm text-ink">{d.attachment.label}</span>
                      {"hint" in d && d.hint && <span className={cn("tnum hidden shrink-0 text-[13px] sm:inline", d.stale ? "text-ink-4" : "text-ink-3")}>{d.hint}</span>}
                    </label>
                    {d.attachment.url && (
                      <a
                        href={d.attachment.url}
                        target="_blank"
                        rel="noreferrer"
                        className="grid size-7 shrink-0 place-items-center rounded-md text-ink-3 transition-colors hover:bg-canvas-2 hover:text-ink"
                        aria-label={`Open ${d.attachment.label}`}
                        title="Open the document"
                      >
                        <ExternalLink className="size-3.5" />
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
      {!hasFile && groups.length > 0 && <p className="mt-2 text-[13px] text-ink-3">Choose a booking to attach its invoices, receipts, e-tickets and vouchers.</p>}
    </fieldset>
  );
}
