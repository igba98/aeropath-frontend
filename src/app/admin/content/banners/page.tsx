"use client";

import { useMemo, useState } from "react";
import { CalendarClock, Flag, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, StatTile } from "@/components/chrome/console-shell";
import { EmptyState } from "@/components/shared/empty-state";
import { Pill } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useSession } from "@/hooks/use-session";
import { useStore } from "@/lib/store";
import { useIsPast } from "@/hooks/use-now";
import { admin } from "@/lib/api";
import { formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ContentPage } from "@/lib/domain/types";
import { AccessDenied, Field, Note, Section } from "@/features/backoffice/ui";
import {
  BANNERS_SLUG, BANNER_PLACEMENTS, DEFAULT_BANNER, bannerLive, emptyLandingPage, parseBanner, serialiseBanner,
  type BannerConfig, type BannerPlacement, type RailAudience,
} from "@/features/backoffice/content-config";

const AUDIENCES: Array<{ id: RailAudience; label: string }> = [
  { id: "all", label: "Everyone" },
  { id: "consumer", label: "Consumers" },
  { id: "agent", label: "Agents" },
  { id: "corporate", label: "Corporate" },
];

const TONES = [
  { id: "from-brand-700 via-brand-500 to-brand-300", label: "Aeropath blue" },
  { id: "from-amber-700 via-orange-500 to-yellow-300", label: "Savannah" },
  { id: "from-cyan-600 via-sky-400 to-teal-200", label: "Ocean" },
  { id: "from-rose-500 via-orange-400 to-cyan-300", label: "Sunset" },
];

function state(b: BannerConfig): { label: string; tone: "success" | "info" | "neutral" | "warning" } {
  if (!b.enabled) return { label: "Off", tone: "neutral" };
  if (bannerLive(b)) return { label: "Live now", tone: "success" };
  return new Date(b.from + "T00:00:00Z").getTime() > Date.now() ? { label: "Scheduled", tone: "info" } : { label: "Ended", tone: "warning" };
}

/** M06 · Banners. Placement, schedule and targeting for promotional strips. */
export default function BannersScreen() {
  const isPast = useIsPast();
  const session = useSession();
  const content = useStore((s) => s.content);

  const stored = useMemo(() => Object.values(content).find((p) => p.kind === "landing" && p.slug === BANNERS_SLUG), [content]);
  const [draft, setDraft] = useState<ContentPage | null>(null);

  const base: ContentPage = stored ?? { ...emptyLandingPage(BANNERS_SLUG, "Banners", "Promotional banners, their placement and schedule"), id: "", updatedAt: "" };
  const current = draft ?? base;
  const dirty = Boolean(draft) && JSON.stringify(draft?.blocks) !== JSON.stringify(base.blocks);

  if (session.hydrated && !session.can("CONTENT:edit")) {
    return <AccessDenied what="Banners" needs={`${session.roleLabel} has no CONTENT:edit permission. Sign in as a Content Editor, Platform Admin or Super Admin.`} />;
  }

  function patch(fn: (d: ContentPage) => void) {
    const next = JSON.parse(JSON.stringify(draft ?? base)) as ContentPage;
    fn(next);
    setDraft(next);
  }

  function save() {
    const page = draft ?? base;
    const { id: existingId, updatedAt: _u, ...rest } = page;
    void _u;
    const id = admin.upsertContent(existingId ? { ...rest, id: existingId } : rest);
    setDraft({ ...page, id, updatedAt: new Date().toISOString() });
    const live = page.blocks.filter((b) => bannerLive(parseBanner(b.body))).length;
    toast.success("Banners saved", { description: `${page.blocks.length} banners · ${live} live right now` });
  }

  function add() {
    patch((d) => {
      d.blocks.push({
        id: `ban_${Date.now().toString(36)}`,
        type: "cta",
        title: "New banner",
        body: serialiseBanner({ ...DEFAULT_BANNER, message: "Book by Friday and save on Zanzibar stays" }),
      });
    });
  }

  function set(blockId: string, next: Partial<BannerConfig>) {
    patch((d) => {
      const b = d.blocks.find((x) => x.id === blockId);
      if (!b) return;
      b.body = serialiseBanner({ ...parseBanner(b.body), ...next });
    });
  }

  const banners = current.blocks.map((b) => ({ block: b, cfg: parseBanner(b.body) }));
  const liveCount = banners.filter((b) => bannerLive(b.cfg)).length;
  const scheduled = banners.filter((b) => b.cfg.enabled && !isPast(b.cfg.from + "T00:00:00Z")).length;

  return (
    <div>
      <PageHeader
        title="Banners"
        code="M06"
        description="A banner is a placement, a schedule and an audience. Overlapping banners in the same placement are resolved top first."
        actions={
          <>
            <Button variant="outline" onClick={add}><Plus className="size-4" aria-hidden /> New banner</Button>
            <Button onClick={save} disabled={!dirty}><Save className="size-4" aria-hidden /> {dirty ? "Save banners" : "Saved"}</Button>
          </>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatTile label="Banners" value={banners.length} icon={Flag} />
        <StatTile label="Live now" value={liveCount} tone={liveCount ? "success" : "default"} />
        <StatTile label="Scheduled" value={scheduled} icon={CalendarClock} hint={stored ? `Saved ${formatDateTime(stored.updatedAt)}` : "Not yet saved"} />
      </div>

      {!banners.length ? (
        <EmptyState icon={Flag} title="No banners" description="Create one to promote an offer in a specific placement and window." action={<Button onClick={add}><Plus className="size-4" aria-hidden /> New banner</Button>} />
      ) : (
        <div className="space-y-3">
          {banners.map(({ block, cfg }) => {
            const st = state(cfg);
            const placement = BANNER_PLACEMENTS.find((p) => p.id === cfg.placement);
            return (
              <Section key={block.id}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Input
                      value={block.title ?? ""}
                      onChange={(e) => patch((d) => { const t = d.blocks.find((x) => x.id === block.id); if (t) t.title = e.target.value; })}
                      className="h-9 w-[240px] font-medium"
                      aria-label="Banner name"
                    />
                    <Pill tone={st.tone}>{st.label}</Pill>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Switch checked={cfg.enabled} onCheckedChange={(v) => set(block.id, { enabled: v })} aria-label={`Enable ${block.title}`} />
                      Enabled
                    </label>
                    <Button variant="ghost" size="icon" aria-label="Delete banner" onClick={() => patch((d) => { d.blocks = d.blocks.filter((x) => x.id !== block.id); })}>
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </div>
                </div>

                <div className={cn("mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-gradient-to-r p-4", cfg.tone)}>
                  <p className="font-display text-lg text-white drop-shadow">{cfg.message || "Banner message"}</p>
                  <span className="rounded-lg bg-white/90 px-3 py-1.5 text-sm font-medium text-brand-text-strong">{cfg.ctaLabel || "Call to action"}</span>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="Message" htmlFor={`bm-${block.id}`} className="lg:col-span-2">
                    <Textarea id={`bm-${block.id}`} rows={2} value={cfg.message} onChange={(e) => set(block.id, { message: e.target.value })} />
                  </Field>
                  <Field label="Placement" hint={placement?.where}>
                    <Select value={cfg.placement} onValueChange={(v) => set(block.id, { placement: v as BannerPlacement })}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>{BANNER_PLACEMENTS.map((p) => <SelectItem key={p.id} value={p.id}>{p.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                  <Field label="Runs from" htmlFor={`bf-${block.id}`}>
                    <Input id={`bf-${block.id}`} type="date" value={cfg.from} onChange={(e) => set(block.id, { from: e.target.value })} />
                  </Field>
                  <Field label="Runs to" htmlFor={`bt-${block.id}`} hint={`${formatDate(cfg.from)} → ${formatDate(cfg.to)}`}>
                    <Input id={`bt-${block.id}`} type="date" value={cfg.to} onChange={(e) => set(block.id, { to: e.target.value })} />
                  </Field>
                  <Field label="Audience">
                    <Select value={cfg.audience} onValueChange={(v) => set(block.id, { audience: v as RailAudience })}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>{AUDIENCES.map((a) => <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                  <Field label="CTA label" htmlFor={`bc-${block.id}`}>
                    <Input id={`bc-${block.id}`} value={cfg.ctaLabel} onChange={(e) => set(block.id, { ctaLabel: e.target.value })} />
                  </Field>
                  <Field label="CTA link" htmlFor={`bh-${block.id}`}>
                    <Input id={`bh-${block.id}`} value={cfg.ctaHref} onChange={(e) => set(block.id, { ctaHref: e.target.value })} />
                  </Field>
                  <Field label="Tone">
                    <Select value={cfg.tone} onValueChange={(v) => set(block.id, { tone: v })}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>{TONES.map((t) => <SelectItem key={t.id} value={t.id}>{t.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </Field>
                </div>
              </Section>
            );
          })}
        </div>
      )}

      <div className="mt-4">
        <Note title="Scheduling is data, not a deploy">
          Banners persist on the content page with slug <code>{BANNERS_SLUG}</code> through <code>admin.upsertContent</code>. A banner outside
          its window simply stops rendering — nobody needs to remember to take it down, and the audit log records who scheduled it.
        </Note>
      </div>
    </div>
  );
}
