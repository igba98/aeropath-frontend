"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { create } from "zustand";
import { toast } from "sonner";
import { Braces, ExternalLink, Send } from "lucide-react";

import type { ID, MessageAttachment, MessageChannel, MessageTemplateKey } from "@/domain/types";
import { can } from "@/domain/permissions";
import { sendMessage, type SendMessageResult } from "@/domain/commands";
import {
  CHANNELS,
  CHANNEL_LABELS,
  PLACEHOLDERS,
  PLACEHOLDER_INFO,
  TEMPLATE_KEYS,
  TEMPLATE_LABELS,
  addressFor,
  attachmentKey,
  channelsFor,
  defaultRecipient,
  documentOptions,
  fillPlaceholders,
  hasPlainSwap,
  mailtoHref,
  outgoingText,
  placeholderValues,
  recipientsOf,
  smsHref,
  smsSegments,
  suggestedDocuments,
  templateForAttachment,
  templateText,
  toPlainSms,
  whatsappHref,
  type Recipient,
} from "@/domain/comms";
import { normalisePhone } from "@/domain/validation";
import { useApp, useDispatch, useMe } from "@/store";
import { useModals, type MessageDraft } from "@/store/modals";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/shared/combobox";
import { Banner, Field } from "@/components/shared/field";
import { AttachmentPicker } from "./attachment-picker";
import { CHANNEL_ICON } from "./channel";
import { MessagePreview } from "./preview";

// ───────────────────────────── Opening the composer ─────────────────────────────

/** Text to start from instead of a template: sending a message again, or forwarding it. */
export interface ComposerPrefill {
  to?: string;
  toName?: string;
  subject?: string;
  body?: string;
}

const usePrefill = create<{ value: ComposerPrefill | null; set: (value: ComposerPrefill | null) => void }>()((set) => ({
  value: null,
  set: (value) => set({ value }),
}));

/** Opens the composer from anywhere. With `body`, `subject` or `to` it starts from that text rather than a template. */
export function openComposer(draft: MessageDraft & ComposerPrefill = {}) {
  const { to, toName, subject, body, ...rest } = draft;
  usePrefill.getState().set(to || subject || body ? { to, toName, subject, body } : null);
  useModals.getState().openMessage(rest);
}

/** Channel order when the requested one can't reach the recipient. */
const PREFERRED: MessageChannel[] = ["whatsapp", "sms", "email"];
const pickChannel = (wanted: MessageChannel | undefined, reachable: MessageChannel[]): MessageChannel =>
  wanted && reachable.includes(wanted) ? wanted : (PREFERRED.find((c) => reachable.includes(c)) ?? wanted ?? "whatsapp");

const OPEN_LABEL: Record<MessageChannel, string> = { whatsapp: "Open in WhatsApp", email: "Open in email app", sms: "Open SMS" };
const isPhoneChannel = (c: MessageChannel) => c !== "email";

/**
 * Message composer (SMS, WhatsApp, email), opened with `useModals().openMessage(...)` or `openComposer(...)`.
 * Works with nothing chosen, a client, or a booking. Send records the message; "Open in …" records it and hands
 * it to WhatsApp, the email app or SMS on this device.
 */
export function MessageComposerModal() {
  const state = useModals((s) => s.message);
  const close = useModals((s) => s.close);
  const done = React.useCallback(() => {
    close("message");
    usePrefill.getState().set(null);
  }, [close]);
  const key = [state.clientId, state.fileId, state.channel, state.template, state.attachments?.map(attachmentKey).join(",")].join("|");
  return (
    <Dialog open={state.open} onOpenChange={(o) => !o && done()}>
      <DialogContent className="sm:max-w-[760px] lg:max-w-[1120px]">{state.open && <ComposerForm key={key} draft={state} onDone={done} />}</DialogContent>
    </Dialog>
  );
}

type Errors = Partial<Record<"to" | "subject" | "body" | "form", string>>;

function ComposerForm({ draft, onDone }: { draft: MessageDraft; onDone: () => void }) {
  const me = useMe();
  const db = useApp((s) => s.db)!;
  const dispatch = useDispatch();
  const router = useRouter();
  const comms = db.settings.comms;
  const now = React.useMemo(() => new Date(), []);
  const bodyRef = React.useRef<HTMLTextAreaElement>(null);

  // Starting point, worked out once: the booking wins over the client it belongs to.
  const [start] = React.useState(() => {
    const prefill = usePrefill.getState().value;
    const fileId = draft.fileId && db.files[draft.fileId] ? draft.fileId : undefined;
    const cid = draft.clientId ?? (fileId ? db.files[fileId].clientId : undefined);
    const clientId = cid && db.clients[cid] ? cid : undefined;
    const recipients = recipientsOf(db, clientId);
    const match = prefill?.to ? recipients.find((r) => r.phone === normalisePhone(prefill.to!) || r.email?.toLowerCase() === prefill.to!.toLowerCase()) : undefined;
    const recipient = match ?? defaultRecipient(db, clientId);
    const channel = pickChannel(draft.channel, clientId ? channelsFor(recipient) : CHANNELS.slice());
    const template: MessageTemplateKey = draft.template ?? (draft.attachments?.length === 1 ? templateForAttachment(draft.attachments[0].kind) : "custom");
    const t = templateText(db, template);
    const attachments = draft.attachments ?? (prefill ? [] : suggestedDocuments(template, documentOptions(db, { clientId, fileId })).map((d) => d.attachment));
    return {
      clientId,
      fileId: fileId && (!clientId || db.files[fileId].clientId === clientId) ? fileId : undefined,
      recipientId: recipient?.id ?? "",
      address: prefill?.to && !match ? prefill.to : null,
      toName: prefill?.toName,
      channel,
      template,
      subject: prefill?.subject ?? t.subject,
      body: prefill?.body ?? t.body,
      attachments,
    };
  });

  const [clientId, setClientId] = React.useState<ID | undefined>(start.clientId);
  const [recipientId, setRecipientId] = React.useState(start.recipientId);
  const [addressOverride, setAddressOverride] = React.useState<string | null>(start.address);
  const [channel, setChannel] = React.useState<MessageChannel>(start.channel);
  const [fileId, setFileId] = React.useState<ID | undefined>(start.fileId);
  const [template, setTemplate] = React.useState<MessageTemplateKey>(start.template);
  const [subject, setSubject] = React.useState(start.subject);
  const [body, setBody] = React.useState(start.body);
  const [attachments, setAttachments] = React.useState<MessageAttachment[]>(start.attachments);
  const [errors, setErrors] = React.useState<Errors>({});

  const client = clientId ? db.clients[clientId] : undefined;
  const recipients = React.useMemo(() => recipientsOf(db, clientId), [db, clientId]);
  const recipient: Recipient | undefined = recipients.find((r) => r.id === recipientId);
  const reachable = client ? channelsFor(recipient) : CHANNELS.slice();
  const address = addressOverride ?? addressFor(recipient, channel);
  const recipientAddress = addressFor(recipient, channel);
  const toName = addressOverride === null || addressOverride === recipientAddress ? recipient?.name : addressOverride === start.address ? start.toName : undefined;

  const files = React.useMemo(
    () =>
      clientId
        ? Object.values(db.files)
            .filter((f) => f.clientId === clientId)
            .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        : [],
    [db.files, clientId],
  );
  const docs = React.useMemo(() => documentOptions(db, { clientId, fileId }), [db, clientId, fileId]);
  const suggest = (key: MessageTemplateKey, cid = clientId, fid = fileId) => suggestedDocuments(key, documentOptions(db, { clientId: cid, fileId: fid })).map((d) => d.attachment);

  const greetName = recipient && recipient.id !== "billing" ? recipient.name : undefined;
  const values = placeholderValues({ db, clientId, fileId, now, recipientName: greetName, agent: me });
  const filledSubject = fillPlaceholders(subject, values);
  const filledBody = fillPlaceholders(body, values);
  const missing = [...new Set([...(channel === "email" ? filledSubject.missing : []), ...filledBody.missing])];
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const sms = channel === "sms" ? smsSegments(outgoingText(filledBody.text, attachments, origin)) : null;

  // ── Changes that ripple ──
  const chooseClient = (id: ID) => {
    const r = defaultRecipient(db, id);
    const keepFile = fileId && db.files[fileId]?.clientId === id ? fileId : undefined;
    setClientId(id);
    setRecipientId(r?.id ?? "");
    setAddressOverride(null);
    setChannel((c) => pickChannel(c, channelsFor(r)));
    setFileId(keepFile);
    setAttachments(suggest(template, id, keepFile));
    setErrors({});
  };
  const chooseRecipient = (id: string) => {
    setRecipientId(id);
    setAddressOverride(null);
    setChannel((c) => pickChannel(c, channelsFor(recipients.find((r) => r.id === id))));
    setErrors((e) => ({ ...e, to: undefined }));
  };
  const chooseChannel = (c: MessageChannel) => {
    if (isPhoneChannel(c) !== isPhoneChannel(channel)) setAddressOverride(null);
    setChannel(c);
    setErrors({});
  };
  const chooseFile = (id: string) => {
    const next = id === "none" ? undefined : id;
    setFileId(next);
    setAttachments(suggest(template, clientId, next));
  };
  const chooseTemplate = (key: MessageTemplateKey) => {
    const t = templateText(db, key);
    setTemplate(key);
    setSubject(t.subject);
    setBody(t.body);
    setAttachments(suggest(key));
    setErrors({});
  };
  const toggle = (a: MessageAttachment, on: boolean) =>
    setAttachments((list) => (on ? [...list.filter((x) => attachmentKey(x) !== attachmentKey(a)), a] : list.filter((x) => attachmentKey(x) !== attachmentKey(a))));

  const insert = (p: string) => {
    const el = bodyRef.current;
    const token = `{${p}}`;
    const s = el?.selectionStart ?? body.length;
    const e = el?.selectionEnd ?? body.length;
    setBody(body.slice(0, s) + token + body.slice(e));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(s + token.length, s + token.length);
    });
  };

  // ── Send ──
  const submit = (handOff: boolean) => {
    const er: Errors = {};
    if (!address.trim()) er.to = channel === "email" ? "Enter the email address." : "Enter the mobile number.";
    if (channel === "email" && !filledSubject.text.trim()) er.subject = "Add a subject for the email.";
    if (!filledBody.text.trim()) er.body = "Write the message.";
    else if (missing.length) {
      const list = missing.map((m) => `{${m}}`).join(", ");
      const it = missing.length === 1 ? "it" : "them";
      er.body = !client
        ? `Choose a client to fill ${list}, or remove ${it}.`
        : fileId
          ? `This booking has nothing to fill ${list} with. Remove ${it}.`
          : `Choose a booking to fill ${list}, or remove ${it}.`;
    }
    setErrors(er);
    if (Object.keys(er).length) return;

    const r = dispatch(
      sendMessage,
      { channel, to: address, toName, clientId, fileId, subject: channel === "email" ? filledSubject.text : undefined, body: filledBody.text, attachments, template },
      { toast: false, quietErrors: true },
    );
    if (!r.ok) {
      const f = r.error.field;
      setErrors(f === "to" || f === "subject" || f === "body" ? { [f]: r.error.message } : { form: r.error.message });
      return;
    }
    const msg = r.state.messages[(r.result as SendMessageResult).messageId];
    if (handOff) {
      const text = outgoingText(msg.body, msg.attachments, window.location.origin, channel === "email" ? comms.emailSignature : undefined);
      if (channel === "whatsapp") window.open(whatsappHref(msg.to, text), "_blank", "noopener,noreferrer");
      else window.location.assign(channel === "email" ? mailtoHref(msg.to, msg.subject ?? "", text) : smsHref(msg.to, text));
    }
    const n = msg.attachments.length;
    toast.success(`Sent to ${toName ?? msg.to}`, {
      description: handOff
        ? `Saved in Communications and handed to ${channel === "email" ? "your email app" : CHANNEL_LABELS[channel]} on this device.`
        : `${CHANNEL_LABELS[channel]}${n ? ` with ${n} attachment${n === 1 ? "" : "s"}` : ""}, saved in Communications.`,
      action: { label: "View", onClick: () => router.push(`/communications?tab=sent&open=${msg.id}`) },
    });
    onDone();
  };

  const canSend = can(me, "comms.send");
  const clientOptions = React.useMemo(
    () =>
      Object.values(db.clients)
        .filter((c) => !c.archived || c.id === clientId)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((c) => ({ value: c.id, label: c.name, hint: c.phone, keywords: [c.email ?? "", c.contactPerson ?? ""] })),
    [db.clients, clientId],
  );

  const bodyHint = missing.length ? (
    <span className="text-[var(--st-amber-fg)]">
      {client
        ? `No value yet for ${missing.map((m) => `{${m}}`).join(", ")}${fileId ? "." : ": choose a booking, or remove it."}`
        : `Choose a client to fill ${missing.map((m) => `{${m}}`).join(", ")}.`}
    </span>
  ) : sms ? (
    <span className="flex flex-wrap items-center gap-x-2">
      <span className={cn("tnum", sms.segments > 3 && "text-[var(--st-amber-fg)]")}>
        {sms.segments || 1} SMS · {sms.units} of {Math.max(1, sms.segments) * sms.perSegment} characters{sms.encoding === "UCS-2" ? " (special characters: 70 a part)" : ""}
      </span>
      {sms.encoding === "UCS-2" && hasPlainSwap(body) && (
        <button type="button" onClick={() => setBody(toPlainSms(body))} className="font-medium text-link hover:underline">
          Use plain characters
        </button>
      )}
    </span>
  ) : (
    "Words in braces, like {client}, fill in from the client and booking."
  );

  return (
    <>
      <DialogHeader>
        <DialogTitle>New message</DialogTitle>
        <DialogDescription>Write to a client by SMS, WhatsApp or email. Automatic confirmations and reminders go out on their own.</DialogDescription>
      </DialogHeader>
      <DialogBody className="p-0">
        <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,440px)]">
          <div className="min-w-0 space-y-5 px-5 py-5">
            {errors.form && <Banner tone="error">{errors.form}</Banner>}

            <div className="grid gap-x-3 gap-y-3.5 sm:grid-cols-2">
              <Field label="Client" htmlFor="msg-client">
                <Combobox
                  id="msg-client"
                  value={clientId}
                  onChange={chooseClient}
                  options={clientOptions}
                  placeholder="Choose a client"
                  searchPlaceholder="Name, phone or email"
                  autoFocus={!clientId}
                />
              </Field>
              <Field label="Contact" htmlFor="msg-contact">
                <Select value={recipient ? recipientId : undefined} onValueChange={chooseRecipient} disabled={!client}>
                  <SelectTrigger id="msg-contact" className="w-full">
                    <SelectValue placeholder={client ? "Choose a contact" : "Choose a client first"} />
                  </SelectTrigger>
                  <SelectContent>
                    {recipients.map((r, i) => (
                      <React.Fragment key={r.id}>
                        {i > 0 && r.id.startsWith("traveller:") && !recipients[i - 1].id.startsWith("traveller:") && <SelectSeparator />}
                        <SelectItem value={r.id}>
                          <span className="shrink-0">{r.name}</span>
                          {r.role && <span className="min-w-0 truncate text-ink-3">· {r.role}</span>}
                        </SelectItem>
                      </React.Fragment>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="grid gap-x-3 gap-y-3.5 sm:grid-cols-[auto_minmax(0,1fr)]">
              <Field label="Send by">
                <Tabs value={channel} onValueChange={(v) => chooseChannel(v as MessageChannel)}>
                  <TabsList aria-label="Channel">
                    {CHANNELS.map((c) => {
                      const Icon = CHANNEL_ICON[c];
                      const off = !reachable.includes(c);
                      return (
                        <TabsTrigger key={c} value={c} disabled={off} title={off ? `No ${c === "email" ? "email address" : "mobile number"} for ${recipient?.name ?? "this contact"}` : undefined}>
                          <Icon /> {CHANNEL_LABELS[c]}
                        </TabsTrigger>
                      );
                    })}
                  </TabsList>
                </Tabs>
              </Field>
              <Field label={channel === "email" ? "Email address" : "Mobile number"} htmlFor="msg-to" error={errors.to}>
                <Input
                  id="msg-to"
                  type={channel === "email" ? "email" : "tel"}
                  value={address}
                  onChange={(e) => {
                    setAddressOverride(e.target.value);
                    setErrors((er) => ({ ...er, to: undefined }));
                  }}
                  placeholder={channel === "email" ? "Email address" : "Phone number with area code"}
                  aria-invalid={Boolean(errors.to) || undefined}
                  className={cn(channel !== "email" && "tnum")}
                  autoComplete="off"
                />
              </Field>
            </div>

            <div className="grid gap-x-3 gap-y-3.5 sm:grid-cols-2">
              <Field label="Booking" htmlFor="msg-file" optional>
                <Select value={fileId ?? "none"} onValueChange={chooseFile} disabled={!client}>
                  <SelectTrigger id="msg-file" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{client ? "No booking" : "Choose a client first"}</SelectItem>
                    {files.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        <span className="font-mono text-[13px] whitespace-nowrap">{f.number}</span>
                        <span className="truncate text-ink-3">{f.title}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Template" htmlFor="msg-template">
                <Select value={template} onValueChange={(v) => chooseTemplate(v as MessageTemplateKey)}>
                  <SelectTrigger id="msg-template" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TEMPLATE_KEYS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {TEMPLATE_LABELS[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            {channel === "email" && (
              <Field label="Subject" htmlFor="msg-subject" error={errors.subject}>
                <Input id="msg-subject" value={subject} onChange={(e) => setSubject(e.target.value)} aria-invalid={Boolean(errors.subject) || undefined} />
              </Field>
            )}

            <Field
              label="Message"
              htmlFor="msg-body"
              error={errors.body}
              hint={bodyHint}
              labelAside={
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="xs" type="button">
                      <Braces /> Insert field
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-[min(22rem,calc(100vw-2rem))]" onCloseAutoFocus={(e) => e.preventDefault()}>
                    <DropdownMenuLabel>Filled in when you send</DropdownMenuLabel>
                    {PLACEHOLDERS.map((p) => (
                      <DropdownMenuItem key={p} onSelect={() => insert(p)} className="items-start">
                        <span className="w-[5.5rem] shrink-0 font-mono text-[13px] text-ink">{`{${p}}`}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] text-ink-2">{values[p]?.split("\n")[0] ?? PLACEHOLDER_INFO[p]}</span>
                          {values[p] && <span className="block truncate text-xs text-ink-4">{PLACEHOLDER_INFO[p]}</span>}
                        </span>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              }
            >
              <Textarea
                id="msg-body"
                ref={bodyRef}
                rows={channel === "sms" ? 6 : 9}
                value={body}
                onChange={(e) => {
                  setBody(e.target.value);
                  if (errors.body) setErrors((er) => ({ ...er, body: undefined }));
                }}
                aria-invalid={Boolean(errors.body) || undefined}
                aria-describedby="msg-body-hint"
                className="resize-y"
              />
            </Field>

            <AttachmentPicker docs={docs} selected={attachments} onToggle={toggle} channel={channel} hasFile={Boolean(fileId)} idPrefix="msg-att" />
          </div>

          <aside aria-label="Preview" className="min-w-0 border-t border-rule bg-canvas px-5 py-5 lg:border-t-0 lg:border-l">
            <div className="lg:sticky lg:top-5">
              <p className="mb-3 flex items-center justify-between gap-2 text-[13px] font-semibold text-ink-2">
                Preview
                <span className="font-normal text-ink-3">As {toName ? toName.split(" ")[0] : "the client"} will see it</span>
              </p>
              <MessagePreview channel={channel} to={address} toName={toName} subject={filledSubject.text} body={filledBody.text} attachments={attachments} sender={comms} origin={origin} />
            </div>
          </aside>
        </div>
      </DialogBody>
      <DialogFooter className="sm:justify-between">
        <p className="hidden min-w-0 text-[13px] text-ink-3 sm:block">
          <span className="font-medium text-ink-2">Send</span> saves it to Communications. <span className="font-medium text-ink-2">{OPEN_LABEL[channel]}</span> also sends it from this device.
        </p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
          <Button variant="outline" onClick={() => submit(true)} disabled={!canSend}>
            <ExternalLink /> {OPEN_LABEL[channel]}
          </Button>
          <Button onClick={() => submit(false)} disabled={!canSend}>
            <Send /> Send
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}
