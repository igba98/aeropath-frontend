"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, LayoutList, Plus, Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/chrome/console-shell";
import { EmptyState } from "@/components/shared/empty-state";
import { Pill } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useSession } from "@/hooks/use-session";
import { useStore } from "@/lib/store";
import { admin } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ContentPage, Vertical } from "@/lib/domain/types";
import { AccessDenied, Field, Note, Section } from "@/features/backoffice/ui";
import { ProductPicker } from "@/features/backoffice/product-picker";
import {
  DEFAULT_RAIL_RULES, HOME_SLUG, emptyLandingPage, parseRailRules, serialiseRailRules,
  type RailAudience, type RailRules,
} from "@/features/backoffice/content-config";

const AUDIENCES: Array<{ id: RailAudience; label: string }> = [
  { id: "all", label: "Everyone" },
  { id: "consumer", label: "Consumers only" },
  { id: "agent", label: "Agent overlay only" },
  { id: "corporate", label: "Corporate overlay only" },
];

const VERTICALS: Array<{ id: "all" | Vertical; label: string }> = [
  { id: "all", label: "All verticals" },
  { id: "stay", label: "Stays" },
  { id: "flight", label: "Flights" },
  { id: "tour", label: "Tours" },
  { id: "transfer", label: "Transfers" },
];

const REGIONS = ["All regions", "Serengeti", "Zanzibar", "Arusha", "Ngorongoro", "Dar es Salaam"];

/** M02 · Home rails. Which rails render on the traveller home page, in what order, to whom. */
export default function HomeRailsScreen() {
  const session = useSession();
  const content = useStore((s) => s.content);
  const products = useStore((s) => s.products);

  const stored = useMemo(() => Object.values(content).find((p) => p.kind === "landing" && p.slug === HOME_SLUG), [content]);
  const [draft, setDraft] = useState<ContentPage | null>(null);
  const [pickerId, setPickerId] = useState<string | null>(null);

  const base: ContentPage = stored ?? { ...emptyLandingPage(HOME_SLUG, "Home", "Rails shown on the traveller home page"), id: "", updatedAt: "" };
  const current = draft ?? base;
  const dirty = Boolean(draft) && JSON.stringify(draft?.blocks) !== JSON.stringify(base.blocks);

  if (session.hydrated && !session.can("CONTENT:edit")) {
    return <AccessDenied what="Home rails" needs={`${session.roleLabel} has no CONTENT:edit permission. Sign in as a Content Editor, Platform Admin or Super Admin.`} />;
  }

  function patch(fn: (d: ContentPage) => void) {
    const next = JSON.parse(JSON.stringify(draft ?? base)) as ContentPage;
    fn(next);
    setDraft(next);
  }

  function save() {
    const page = draft ?? base;
    const { id: existingId, updatedAt: _updatedAt, ...rest } = page;
    void _updatedAt;
    const id = admin.upsertContent(existingId ? { ...rest, id: existingId } : rest);
    setDraft({ ...page, id, updatedAt: new Date().toISOString() });
    const live = page.blocks.filter((b) => parseRailRules(b.body).enabled).length;
    toast.success("Home rails saved", { description: `${live} of ${page.blocks.length} rails enabled · content page /${HOME_SLUG}` });
  }

  function addRail() {
    patch((d) => {
      d.blocks.push({ id: `rail_${Date.now().toString(36)}`, type: "rail", title: "New rail", body: serialiseRailRules(DEFAULT_RAIL_RULES), productIds: [] });
    });
  }

  function setRules(blockId: string, next: Partial<RailRules>) {
    patch((d) => {
      const b = d.blocks.find((x) => x.id === blockId);
      if (!b) return;
      b.body = serialiseRailRules({ ...parseRailRules(b.body), ...next });
    });
  }

  function move(id: string, dir: -1 | 1) {
    patch((d) => {
      const i = d.blocks.findIndex((b) => b.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= d.blocks.length) return;
      const [b] = d.blocks.splice(i, 1);
      d.blocks.splice(j, 0, b);
    });
  }

  const picker = current.blocks.find((b) => b.id === pickerId);
  const enabledCount = current.blocks.filter((b) => parseRailRules(b.body).enabled).length;

  return (
    <div>
      <PageHeader
        title="Home rails"
        code="M02"
        description="The home page is a stack of rails. Order here is order on the page; targeting rules decide who sees each one."
        actions={
          <>
            <Button variant="outline" onClick={addRail}><Plus className="size-4" aria-hidden /> Add rail</Button>
            <Button onClick={save} disabled={!dirty}><Save className="size-4" aria-hidden /> {dirty ? "Save rails" : "Saved"}</Button>
          </>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Rails configured</p>
          <p className="mt-1.5 font-display text-2xl tabular-nums">{current.blocks.length}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Live on home</p>
          <p className="mt-1.5 font-display text-2xl tabular-nums">{enabledCount}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Last saved</p>
          <p className="mt-1.5 text-sm">{stored ? formatDateTime(stored.updatedAt) : "Never — not yet created"}</p>
        </div>
      </div>

      <div className="space-y-3">
        {!current.blocks.length ? (
          <EmptyState icon={LayoutList} title="No rails configured" description="Add a rail, pick its products and save. The home page renders enabled rails in this order." action={<Button onClick={addRail}><Plus className="size-4" aria-hidden /> Add rail</Button>} />
        ) : null}

        {current.blocks.map((b, i) => {
          const rules = parseRailRules(b.body);
          return (
            <Section key={b.id}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-brand-50 font-mono text-xs text-brand-text-strong">{i + 1}</span>
                  <Input
                    value={b.title ?? ""}
                    onChange={(e) => patch((d) => { const t = d.blocks.find((x) => x.id === b.id); if (t) t.title = e.target.value; })}
                    className="h-9 w-[260px] font-medium"
                    aria-label="Rail title"
                  />
                  <Pill tone={rules.enabled ? "success" : "neutral"}>{rules.enabled ? "Live" : "Hidden"}</Pill>
                </div>
                <div className="flex items-center gap-1">
                  <label className="mr-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <Switch checked={rules.enabled} onCheckedChange={(v) => setRules(b.id, { enabled: v })} aria-label={`Show ${b.title} on home`} />
                    Show on home
                  </label>
                  <Button variant="ghost" size="icon" aria-label="Move rail up" disabled={i === 0} onClick={() => move(b.id, -1)}><ArrowUp className="size-4" /></Button>
                  <Button variant="ghost" size="icon" aria-label="Move rail down" disabled={i === current.blocks.length - 1} onClick={() => move(b.id, 1)}><ArrowDown className="size-4" /></Button>
                  <Button variant="ghost" size="icon" aria-label="Remove rail" onClick={() => patch((d) => { d.blocks = d.blocks.filter((x) => x.id !== b.id); })}><Trash2 className="size-4 text-destructive" /></Button>
                </div>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <Field label="Audience">
                  <Select value={rules.audience} onValueChange={(v) => setRules(b.id, { audience: v as RailAudience })}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{AUDIENCES.map((a) => <SelectItem key={a.id} value={a.id}>{a.label}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Vertical">
                  <Select value={rules.vertical} onValueChange={(v) => setRules(b.id, { vertical: v as RailRules["vertical"] })}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{VERTICALS.map((v) => <SelectItem key={v.id} value={v.id}>{v.label}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Region">
                  <Select value={rules.region} onValueChange={(v) => setRules(b.id, { region: v })}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>{REGIONS.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
              </div>

              <div className="mt-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-muted-foreground">Products ({b.productIds?.length ?? 0})</p>
                  <Button variant="outline" size="sm" onClick={() => setPickerId(b.id)}>Pick products</Button>
                </div>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {(b.productIds ?? []).map((pid) => (
                    <li key={pid} className="inline-flex items-center gap-1 rounded-full border bg-muted/50 px-2 py-1 text-xs">
                      <span className={cn("size-3 rounded-sm bg-gradient-to-br", products[pid]?.media[0]?.tone)} aria-hidden />
                      {products[pid]?.title ?? pid}
                      <button
                        type="button"
                        aria-label={`Remove ${products[pid]?.title ?? pid}`}
                        onClick={() => patch((d) => { const t = d.blocks.find((x) => x.id === b.id); if (t) t.productIds = (t.productIds ?? []).filter((x) => x !== pid); })}
                      >
                        <X className="size-3" />
                      </button>
                    </li>
                  ))}
                  {!(b.productIds ?? []).length ? <li className="text-xs text-muted-foreground">Empty rail — it will not render even when enabled.</li> : null}
                </ul>
              </div>
            </Section>
          );
        })}
      </div>

      <div className="mt-4">
        <Note title="Where this is stored">
          The prototype persists rail configuration on a content page with kind <code>landing</code> and slug <code>{HOME_SLUG}</code>,
          written through the same <code>admin.upsertContent</code> path as any landing page — so rails get the same audit trail and the same
          draft/publish semantics. Targeting rules travel with each rail block.
        </Note>
      </div>

      <ProductPicker
        open={Boolean(picker)}
        onOpenChange={(v) => { if (!v) setPickerId(null); }}
        products={Object.values(products)}
        selected={picker?.productIds ?? []}
        onSave={(ids) => {
          patch((d) => { const t = d.blocks.find((x) => x.id === pickerId); if (t) t.productIds = ids; });
          setPickerId(null);
          toast.success(`${ids.length} products in this rail`, { description: "Save the rails to publish the change." });
        }}
      />
    </div>
  );
}
