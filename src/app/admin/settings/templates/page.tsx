"use client";

import { useState } from "react";
import { Mail, MessageCircle, Phone, Save } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, StatTile } from "@/components/chrome/console-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Pill } from "@/components/shared/status-chip";
import { useSession } from "@/hooks/use-session";
import { useStore } from "@/lib/store";
import { admin } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { NotificationTemplate } from "@/lib/domain/types";

const SAMPLE: Record<string, string> = {
  "{ref}": "AP-7K2M9", "{amount}": "TZS 1,384,000", "{supplier}": "Serengeti Serena Safari Lodge",
  "{name}": "Amina", "{link}": "aeropath.co.tz/t/7K2M9", "{dates}": "18–21 Sep 2026",
  "{product}": "Standard Rondavel · Half board", "{requester}": "Rehema Ngowi",
};

const CHANNEL_ICON = { sms: Phone, email: Mail, whatsapp: MessageCircle } as const;

/** X08 · Notification templates, per event, per channel, per locale. */
export default function TemplatesPage() {
  const s = useSession();
  const templates = useStore((st) => st.templates);
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<NotificationTemplate | null>(null);

  if (!s.hydrated) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;
  const canEdit = s.can("SETTINGS:edit");

  const all = Object.values(templates);
  const active = draft ?? (selected ? templates[selected] : all[0]);
  const events = Array.from(new Set(all.map((t) => t.event)));

  function preview(text: string) {
    return Object.entries(SAMPLE).reduce((acc, [k, v]) => acc.replaceAll(k, v), text);
  }

  return (
    <>
      <PageHeader
        title="Notification templates"
        code="X08"
        description="One template per event, channel and locale. Templates are keyed by locale so a Kiswahili speaker gets Kiswahili."
        actions={canEdit && draft ? (
          <Button className="gap-1.5" onClick={() => { admin.upsertTemplate(draft); setDraft(null); toast.success("Template saved", { description: "Applies to the next notification sent." }); }}>
            <Save className="size-4" aria-hidden /> Save template
          </Button>
        ) : null}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatTile label="Templates" value={all.length} />
        <StatTile label="Events covered" value={events.length} />
        <StatTile label="Locales" value={Array.from(new Set(all.map((t) => t.locale))).join(", ").toUpperCase()} hint="SMS is a first-class channel here" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <aside className="space-y-2">
          {events.map((ev) => (
            <div key={ev}>
              <p className="px-1 py-1 font-mono text-[11px] text-muted-foreground">{ev}</p>
              {all.filter((t) => t.event === ev).map((t) => {
                const Icon = CHANNEL_ICON[t.channel];
                return (
                  <button
                    key={t.id}
                    onClick={() => { setSelected(t.id); setDraft(null); }}
                    className={cn("mb-1 flex w-full items-center gap-2 rounded-lg border p-2.5 text-left text-sm transition-colors", t.id === active?.id ? "border-brand-400 bg-brand-50/50" : "bg-card hover:border-brand-300")}
                  >
                    <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="capitalize">{t.channel}</span>
                    <Pill tone="neutral" className="ml-auto">{t.locale.toUpperCase()}</Pill>
                  </button>
                );
              })}
            </div>
          ))}
        </aside>

        {active ? (
          <div className="space-y-4">
            <section className="rounded-xl border bg-card p-4">
              <div className="flex flex-wrap items-center gap-2">
                <code className="font-mono text-sm font-medium">{active.event}</code>
                <Pill tone="brand" className="capitalize">{active.channel}</Pill>
                <Pill tone="neutral">{active.locale.toUpperCase()}</Pill>
              </div>

              {active.channel === "email" ? (
                <div className="mt-3">
                  <Label htmlFor="subj">Subject</Label>
                  <Input id="subj" value={active.subject ?? ""} disabled={!canEdit} onChange={(e) => setDraft({ ...active, subject: e.target.value })} className="mt-1" />
                </div>
              ) : null}

              <div className="mt-3">
                <Label htmlFor="body">Body</Label>
                <Textarea id="body" value={active.body} disabled={!canEdit} onChange={(e) => setDraft({ ...active, body: e.target.value })} rows={5} className="mt-1 font-mono text-sm" />
                {active.channel === "sms" ? (
                  <p className="mt-1 text-xs text-muted-foreground">{active.body.length} characters · {Math.ceil(active.body.length / 160)} SMS segment{Math.ceil(active.body.length / 160) === 1 ? "" : "s"}</p>
                ) : null}
              </div>

              <div className="mt-3">
                <p className="text-xs font-medium text-muted-foreground">Available placeholders</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {Object.keys(SAMPLE).map((k) => (
                    <button
                      key={k}
                      disabled={!canEdit}
                      onClick={() => setDraft({ ...active, body: active.body + " " + k })}
                      className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px] transition-colors hover:border-brand-300 disabled:opacity-50"
                    >
                      {k}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section className="rounded-xl border bg-card p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Preview with sample data</p>
              <div className={cn("mt-2 rounded-xl p-4", active.channel === "sms" ? "bg-muted" : active.channel === "whatsapp" ? "bg-success/10" : "bg-brand-50")}>
                {active.channel === "email" && active.subject ? <p className="mb-1.5 font-medium">{preview(active.subject)}</p> : null}
                <p className="whitespace-pre-wrap text-sm">{preview(active.body)}</p>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Never log or template a full payment payload, passport number or session token — redaction happens at the logger, not the call site.
              </p>
            </section>
          </div>
        ) : null}
      </div>
    </>
  );
}
