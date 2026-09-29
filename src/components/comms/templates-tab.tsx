"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { RotateCcw } from "lucide-react";

import type { MessageChannel, MessageTemplateKey } from "@/domain/types";
import { can } from "@/domain/permissions";
import { defaultComms } from "@/domain/defaults";
import { CHANNEL_LABELS, PLACEHOLDERS, PLACEHOLDER_INFO, TEMPLATE_KEYS, TEMPLATE_LABELS, documentOptions, fillPlaceholders, placeholderValues, suggestedDocuments } from "@/domain/comms";
import { fileStatus } from "@/domain/status/file-status";
import { useApp, useMe } from "@/store";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/shared/field";
import { Section, Segmented } from "@/components/shared/page";
import { SaveBar, ViewOnlyNote, useSettingsDraft } from "@/components/settings/settings-kit";
import { MessagePreview } from "./preview";

const DEFAULTS = defaultComms().templates;
const isKey = (k: string | null): k is MessageTemplateKey => !!k && (TEMPLATE_KEYS as readonly string[]).includes(k);

/** The wording of every template, with a placeholder cheat-sheet and a live preview on a real booking. Manager edits. */
export function TemplatesTab() {
  const me = useMe();
  const db = useApp((s) => s.db)!;
  const sp = useSearchParams();
  const canEdit = can(me, "comms.settings");
  const { draft, setDraft, dirty, discard, save } = useSettingsDraft((s) => s.comms.templates);
  const [key, setKey] = React.useState<MessageTemplateKey>(() => (isKey(sp.get("t")) ? (sp.get("t") as MessageTemplateKey) : "booking_confirmation"));
  const [channel, setChannel] = React.useState<MessageChannel>("whatsapp");
  const [error, setError] = React.useState<string | null>(null);
  const now = React.useMemo(() => new Date(), []);

  // Recent bookings to preview on; the newest confirmed one with a flight first.
  const samples = React.useMemo(() => {
    const files = Object.values(db.files)
      .filter((f) => !f.cancelledAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 25);
    const hasFlight = (id: string) => Object.values(db.lines).some((l) => l.fileId === id && l.type === "flight" && l.status !== "cancelled");
    const best = files.find((f) => fileStatus(db, f.id, now) === "confirmed" && hasFlight(f.id));
    return best ? [best, ...files.filter((f) => f.id !== best.id)] : files;
  }, [db, now]);
  const [sampleId, setSampleId] = React.useState<string | undefined>(samples[0]?.id);
  const sample = sampleId ? db.files[sampleId] : undefined;

  const t = draft[key] ?? DEFAULTS[key] ?? { subject: "", body: "" };
  const isDefault = (t.subject ?? "") === (DEFAULTS[key]?.subject ?? "") && t.body === (DEFAULTS[key]?.body ?? "");
  const setT = (patch: { subject?: string; body?: string }) => {
    setDraft((d) => ({ ...d, [key]: { ...(d[key] ?? DEFAULTS[key] ?? { body: "" }), ...patch } }));
    setError(null);
  };

  const values = React.useMemo(() => (sample ? placeholderValues({ db, clientId: sample.clientId, fileId: sample.id, now, agent: me }) : {}), [db, sample, now, me]);
  const subject = fillPlaceholders(t.subject ?? "", values).text;
  const body = fillPlaceholders(t.body, values).text;
  const attachments = sample ? suggestedDocuments(key, documentOptions(db, { clientId: sample.clientId, fileId: sample.id })).map((d) => d.attachment) : [];
  const client = sample ? db.clients[sample.clientId] : undefined;
  const origin = typeof window === "undefined" ? "" : window.location.origin;

  const onSave = () => {
    const empty = TEMPLATE_KEYS.find((k) => k !== "custom" && !(draft[k]?.body ?? DEFAULTS[k]?.body ?? "").trim());
    if (empty) {
      setKey(empty);
      setError(`The ${TEMPLATE_LABELS[empty].toLowerCase()} template has no text. Write it, or reset it to the default.`);
      return;
    }
    const r = save({ comms: { templates: draft } });
    setError(r.ok ? null : r.error.message);
  };

  return (
    <div>
      <Section
        title="Templates"
        description={
          <>
            The starting text for each kind of message. Words in braces fill in from the client and booking when it is sent.
            {!canEdit && <ViewOnlyNote className="mt-1.5" />}
          </>
        }
      >
        <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
          {/* Template list: a select on phones, an index from lg. */}
          <div className="lg:hidden">
            <Field label="Template" htmlFor="tpl-pick">
              <Select value={key} onValueChange={(v) => setKey(v as MessageTemplateKey)}>
                <SelectTrigger id="tpl-pick" className="w-full">
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
          <nav aria-label="Templates" className="hidden lg:block">
            <ul className="space-y-0.5">
              {TEMPLATE_KEYS.map((k) => {
                const on = k === key;
                return (
                  <li key={k}>
                    <button
                      type="button"
                      onClick={() => setKey(k)}
                      aria-current={on ? "true" : undefined}
                      className={cn(
                        "flex h-9 w-full items-center rounded-lg px-3 text-left text-sm transition-colors",
                        on ? "bg-band font-semibold text-brand-700 dark:text-brand-200" : "font-medium text-ink-2 hover:bg-canvas-2 hover:text-ink",
                      )}
                    >
                      <span className="truncate">{TEMPLATE_LABELS[k]}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="grid min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,400px)]">
            <div className="min-w-0 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-[15px] font-semibold text-ink max-lg:sr-only">{TEMPLATE_LABELS[key]}</h3>
                {canEdit && !isDefault && DEFAULTS[key] && (
                  <Button variant="ghost" size="sm" onClick={() => setT({ subject: DEFAULTS[key]?.subject ?? "", body: DEFAULTS[key]?.body ?? "" })}>
                    <RotateCcw /> Reset to default
                  </Button>
                )}
              </div>
              <Field label="Subject" htmlFor="tpl-subject" hint="Email only. SMS and WhatsApp send the text alone.">
                <Input id="tpl-subject" value={t.subject ?? ""} readOnly={!canEdit} onChange={(e) => setT({ subject: e.target.value })} />
              </Field>
              <Field label="Text" htmlFor="tpl-body" error={error}>
                <Textarea id="tpl-body" rows={9} value={t.body} readOnly={!canEdit} onChange={(e) => setT({ body: e.target.value })} className="resize-y" aria-invalid={Boolean(error) || undefined} />
              </Field>

              <section aria-labelledby="tpl-fields">
                <h4 id="tpl-fields" className="mb-2 text-sm font-semibold text-ink">
                  Fields you can use
                </h4>
                <dl className="divide-y divide-rule overflow-hidden rounded-lg border border-rule text-[13px]">
                  {PLACEHOLDERS.map((p) => (
                    <div key={p} className="grid grid-cols-[7rem_minmax(0,1fr)] gap-x-3 px-3 py-2 sm:grid-cols-[7rem_minmax(0,1fr)_minmax(0,1fr)]">
                      <dt className="font-mono text-[13px] whitespace-nowrap text-ink">{`{${p}}`}</dt>
                      <dd className="text-ink-2">{PLACEHOLDER_INFO[p]}</dd>
                      <dd className="col-start-2 truncate text-ink-3 sm:col-start-3" title={values[p]}>
                        {values[p]?.split("\n")[0] ?? <span className="text-ink-4">Not on this booking</span>}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            </div>

            <aside aria-label="Preview" className="min-w-0 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-semibold text-ink">Preview</h4>
                <Segmented
                  label="Preview channel"
                  value={channel}
                  onChange={setChannel}
                  options={(["sms", "whatsapp", "email"] as MessageChannel[]).map((c) => ({ value: c, label: CHANNEL_LABELS[c] }))}
                />
              </div>
              <Field label="With booking" htmlFor="tpl-sample">
                <Select value={sampleId} onValueChange={setSampleId}>
                  <SelectTrigger id="tpl-sample" className="w-full">
                    <SelectValue placeholder="No bookings yet" />
                  </SelectTrigger>
                  <SelectContent>
                    {samples.map((f) => (
                      <SelectItem key={f.id} value={f.id}>
                        <span className="font-mono text-[13px] whitespace-nowrap">{f.number}</span>
                        <span className="truncate text-ink-3">{f.title}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <MessagePreview
                channel={channel}
                to={channel === "email" ? client?.email : client?.phone}
                toName={client?.name}
                subject={subject}
                body={body}
                attachments={attachments}
                sender={db.settings.comms}
                origin={origin}
              />
            </aside>
          </div>
        </div>
      </Section>
      {canEdit && <SaveBar dirty={dirty} onDiscard={() => (discard(), setError(null))} onSave={onSave} error={error} />}
    </div>
  );
}
