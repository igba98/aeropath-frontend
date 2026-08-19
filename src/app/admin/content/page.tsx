"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowDown, ArrowUp, ExternalLink, Eye, EyeOff, FileText, Image as ImageIcon, LayoutList,
  MessageSquareQuote, Plus, Save, Sparkles, Trash2, X,
} from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/chrome/console-shell";
import { EmptyState } from "@/components/shared/empty-state";
import { Pill } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSession } from "@/hooks/use-session";
import { useStore } from "@/lib/store";
import { admin } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ContentPage } from "@/lib/domain/types";
import { AccessDenied, Field, Note, Section } from "@/features/backoffice/ui";
import { BANNERS_SLUG, HOME_SLUG } from "@/features/backoffice/content-config";
import { ProductPicker } from "@/features/backoffice/product-picker";

type Block = ContentPage["blocks"][number];
type BlockType = Block["type"];

const BLOCK_META: Record<BlockType, { label: string; icon: typeof FileText; hint: string }> = {
  hero: { label: "Hero", icon: ImageIcon, hint: "Full width gradient header with the page title and subtitle." },
  rail: { label: "Product rail", icon: LayoutList, hint: "Horizontal row of product cards. Pick the products below." },
  editorial: { label: "Editorial", icon: FileText, hint: "Prose block — when to go, how it fits together, local knowledge." },
  faq: { label: "FAQ", icon: MessageSquareQuote, hint: "Question and answer block, also feeds FAQ structured data." },
  cta: { label: "Call to action", icon: Sparkles, hint: "Banner with a headline and a button into search or a collection." },
};

const TONES: Array<{ id: string; label: string }> = [
  { id: "from-amber-700 via-orange-500 to-yellow-300", label: "Savannah" },
  { id: "from-cyan-600 via-sky-400 to-teal-200", label: "Indian Ocean" },
  { id: "from-emerald-800 via-emerald-600 to-lime-300", label: "Highland" },
  { id: "from-slate-800 via-slate-600 to-emerald-300", label: "Crater" },
  { id: "from-rose-500 via-orange-400 to-cyan-300", label: "Bush & beach" },
  { id: "from-green-700 via-lime-500 to-yellow-200", label: "Family" },
  { id: "from-brand-700 via-brand-500 to-brand-300", label: "Aeropath blue" },
];

const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const publicHref = (p: ContentPage) => (p.kind === "collection" ? `/collections/${p.slug}` : p.kind === "destination" ? `/destinations/${p.slug}` : `/`);

/** M01 · Landing pages. Block based editor for destination and collection pages. */
export default function LandingPagesScreen() {
  const session = useSession();
  const content = useStore((s) => s.content);
  const products = useStore((s) => s.products);

  const pages = useMemo(
    () => Object.values(content).filter((p) => p.kind !== "landing" || (p.slug !== HOME_SLUG && p.slug !== BANNERS_SLUG)).sort((a, b) => a.title.localeCompare(b.title)),
    [content],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<ContentPage | null>(null);
  const [pickerBlockId, setPickerBlockId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const selected = selectedId ? content[selectedId] : undefined;
  const current = draft && draft.id === selectedId ? draft : selected;
  const dirty = Boolean(draft && selected && JSON.stringify({ ...draft, updatedAt: "" }) !== JSON.stringify({ ...selected, updatedAt: "" }));

  if (session.hydrated && !session.can("CONTENT:edit")) {
    return <AccessDenied what="Landing pages" needs={`${session.roleLabel} has no CONTENT:edit permission. Sign in as a Content Editor, Platform Admin or Super Admin.`} />;
  }

  function open(page: ContentPage) {
    setSelectedId(page.id);
    setDraft(JSON.parse(JSON.stringify(page)) as ContentPage);
  }

  function patch(fn: (d: ContentPage) => void) {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = JSON.parse(JSON.stringify(prev)) as ContentPage;
      fn(next);
      return next;
    });
  }

  function save(page: ContentPage, message = "Page saved") {
    admin.upsertContent(page);
    setDraft(JSON.parse(JSON.stringify(page)) as ContentPage);
    toast.success(message, { description: `${page.title} · ${page.blocks.length} blocks · ${page.status}` });
  }

  function togglePublish() {
    if (!current) return;
    const next: ContentPage = { ...current, status: current.status === "published" ? "draft" : "published" };
    save(next, next.status === "published" ? "Published" : "Unpublished");
  }

  function addBlock(type: BlockType) {
    patch((d) => {
      d.blocks.push({
        id: `b_${Date.now().toString(36)}`,
        type,
        title: type === "rail" ? "New rail" : type === "editorial" ? "New section" : type === "faq" ? "Good to know" : type === "cta" ? "Plan your trip" : undefined,
        body: type === "hero" ? undefined : "",
        productIds: type === "rail" ? [] : undefined,
      });
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

  const pickerBlock = current?.blocks.find((b) => b.id === pickerBlockId);

  return (
    <div>
      <PageHeader
        title="Landing pages"
        code="M01"
        description="Destination and collection pages are assembled from blocks. Everything saved here is what the public page at /destinations or /collections renders."
        actions={<Button onClick={() => setNewOpen(true)}><Plus className="size-4" aria-hidden /> New page</Button>}
      />

      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
        <div className="space-y-2">
          {pages.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => open(p)}
              className={cn(
                "w-full rounded-xl border bg-card p-3 text-left transition-colors hover:border-brand-300",
                selectedId === p.id && "border-brand-500 ring-1 ring-brand-500/30",
              )}
            >
              <div className="flex items-center gap-2">
                <span className={cn("size-8 shrink-0 rounded-lg bg-gradient-to-br", p.heroTone)} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{p.title}</p>
                  <p className="truncate text-[11px] text-muted-foreground">/{p.kind === "collection" ? "collections" : "destinations"}/{p.slug}</p>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-1.5">
                <Pill tone={p.status === "published" ? "success" : "neutral"} icon={p.status === "published" ? Eye : EyeOff}>{p.status}</Pill>
                <span className="text-[11px] text-muted-foreground">{p.blocks.length} blocks</span>
              </div>
            </button>
          ))}
          {!pages.length ? <EmptyState icon={FileText} title="No pages yet" description="Create a destination or collection page to start merchandising." /> : null}
        </div>

        {!current ? (
          <EmptyState
            icon={FileText}
            title="Pick a page to edit"
            description="Blocks are ordered top to bottom exactly as the traveller sees them. Rails pull live products straight from the catalogue."
          />
        ) : (
          <div className="space-y-4">
            <Section
              title={current.title}
              description={`Last saved ${formatDateTime(current.updatedAt)}`}
              actions={
                <>
                  <Button variant="outline" size="sm" asChild>
                    <Link href={publicHref(current)} target="_blank">
                      <ExternalLink className="size-4" aria-hidden /> View public page
                    </Link>
                  </Button>
                  <Button variant={current.status === "published" ? "outline" : "default"} size="sm" onClick={togglePublish}>
                    {current.status === "published" ? <><EyeOff className="size-4" aria-hidden /> Unpublish</> : <><Eye className="size-4" aria-hidden /> Publish</>}
                  </Button>
                  <Button size="sm" disabled={!dirty} onClick={() => current && save(current)}>
                    <Save className="size-4" aria-hidden /> {dirty ? "Save changes" : "Saved"}
                  </Button>
                </>
              }
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Title" htmlFor="cp-title">
                  <Input id="cp-title" value={current.title} onChange={(e) => patch((d) => { d.title = e.target.value; })} />
                </Field>
                <Field label="Slug" htmlFor="cp-slug" hint={`Public URL: ${publicHref(current)}`}>
                  <Input id="cp-slug" value={current.slug} onChange={(e) => patch((d) => { d.slug = slugify(e.target.value); })} />
                </Field>
                <Field label="Subtitle" htmlFor="cp-sub" className="sm:col-span-2">
                  <Textarea id="cp-sub" rows={2} value={current.subtitle} onChange={(e) => patch((d) => { d.subtitle = e.target.value; })} />
                </Field>
                <Field label="Hero tone" hint="Gradient plate behind the hero, used until a real photo is uploaded.">
                  <Select value={current.heroTone} onValueChange={(v) => patch((d) => { d.heroTone = v; })}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TONES.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          <span className="flex items-center gap-2">
                            <span className={cn("size-3.5 rounded bg-gradient-to-br", t.id)} aria-hidden />
                            {t.label}
                          </span>
                        </SelectItem>
                      ))}
                      {TONES.every((t) => t.id !== current.heroTone) ? <SelectItem value={current.heroTone}>Current</SelectItem> : null}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Page kind">
                  <Select value={current.kind} onValueChange={(v) => patch((d) => { d.kind = v as ContentPage["kind"]; })}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="destination">Destination</SelectItem>
                      <SelectItem value="collection">Collection</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
              <div className={cn("mt-3 flex h-24 items-end rounded-xl bg-gradient-to-br p-3", current.heroTone)}>
                <div>
                  <p className="font-display text-lg text-white drop-shadow">{current.title}</p>
                  <p className="line-clamp-1 text-xs text-white/85 drop-shadow">{current.subtitle}</p>
                </div>
              </div>
            </Section>

            <Section
              title="Blocks"
              description="Reorder with the arrows. The public page renders these in exactly this order."
              actions={
                <Select value="" onValueChange={(v) => addBlock(v as BlockType)}>
                  <SelectTrigger className="w-[190px]" aria-label="Add a block"><SelectValue placeholder="Add block…" /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(BLOCK_META) as BlockType[]).map((t) => (
                      <SelectItem key={t} value={t}>{BLOCK_META[t].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              }
            >
              {!current.blocks.length ? (
                <EmptyState icon={LayoutList} title="No blocks" description="Add a hero, then a rail of products." />
              ) : (
                <ul className="space-y-3">
                  {current.blocks.map((b, i) => {
                    const Meta = BLOCK_META[b.type];
                    return (
                      <li key={b.id} className="rounded-xl border bg-background p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="flex size-7 items-center justify-center rounded-lg bg-brand-50 text-brand-text-strong"><Meta.icon className="size-4" aria-hidden /></span>
                            <div>
                              <p className="text-sm font-medium">{Meta.label}</p>
                              <p className="text-[11px] text-muted-foreground">{Meta.hint}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" aria-label={`Move ${Meta.label} up`} disabled={i === 0} onClick={() => move(b.id, -1)}><ArrowUp className="size-4" /></Button>
                            <Button variant="ghost" size="icon" aria-label={`Move ${Meta.label} down`} disabled={i === current.blocks.length - 1} onClick={() => move(b.id, 1)}><ArrowDown className="size-4" /></Button>
                            <Button variant="ghost" size="icon" aria-label={`Remove ${Meta.label}`} onClick={() => patch((d) => { d.blocks = d.blocks.filter((x) => x.id !== b.id); })}><Trash2 className="size-4 text-destructive" /></Button>
                          </div>
                        </div>

                        {b.type !== "hero" ? (
                          <div className="mt-3 grid gap-3">
                            <Field label="Block title" htmlFor={`bt-${b.id}`}>
                              <Input id={`bt-${b.id}`} value={b.title ?? ""} onChange={(e) => patch((d) => { const t = d.blocks.find((x) => x.id === b.id); if (t) t.title = e.target.value; })} />
                            </Field>
                            {b.type === "rail" ? (
                              <div>
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-xs font-medium text-muted-foreground">Products ({b.productIds?.length ?? 0})</p>
                                  <Button variant="outline" size="sm" onClick={() => setPickerBlockId(b.id)}>Pick products</Button>
                                </div>
                                <ul className="mt-2 flex flex-wrap gap-1.5">
                                  {(b.productIds ?? []).map((pid) => (
                                    <li key={pid} className="inline-flex items-center gap-1 rounded-full border bg-muted/50 px-2 py-1 text-xs">
                                      {products[pid]?.title ?? pid}
                                      <button
                                        type="button"
                                        aria-label={`Remove ${products[pid]?.title ?? pid} from rail`}
                                        onClick={() => patch((d) => { const t = d.blocks.find((x) => x.id === b.id); if (t) t.productIds = (t.productIds ?? []).filter((x) => x !== pid); })}
                                      >
                                        <X className="size-3" />
                                      </button>
                                    </li>
                                  ))}
                                  {!(b.productIds ?? []).length ? <li className="text-xs text-muted-foreground">No products yet — this rail will not render.</li> : null}
                                </ul>
                              </div>
                            ) : (
                              <Field label="Body" htmlFor={`bb-${b.id}`}>
                                <Textarea id={`bb-${b.id}`} rows={3} value={b.body ?? ""} onChange={(e) => patch((d) => { const t = d.blocks.find((x) => x.id === b.id); if (t) t.body = e.target.value; })} />
                              </Field>
                            )}
                          </div>
                        ) : (
                          <p className="mt-2 text-xs text-muted-foreground">The hero renders the page title, subtitle and hero tone set above.</p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Section>

            <Note title="Draft versus published">
              Unpublishing keeps the page and its blocks; the public route simply stops rendering it. Every save writes a
              CONTENT_UPSERT entry to the audit log with the slug and status, so merchandising changes are traceable.
            </Note>
          </div>
        )}
      </div>

      <ProductPicker
        open={Boolean(pickerBlock)}
        onOpenChange={(v) => { if (!v) setPickerBlockId(null); }}
        products={Object.values(products)}
        selected={pickerBlock?.productIds ?? []}
        onSave={(ids) => {
          patch((d) => { const t = d.blocks.find((x) => x.id === pickerBlockId); if (t) t.productIds = ids; });
          setPickerBlockId(null);
          toast.success(`${ids.length} products in this rail`, { description: "Remember to save the page." });
        }}
      />

      <NewPageDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreate={(title, kind) => {
          const page: Omit<ContentPage, "id" | "updatedAt"> = {
            kind,
            slug: slugify(title),
            title,
            subtitle: "",
            heroTone: TONES[0].id,
            status: "draft",
            blocks: [{ id: `b_${Date.now().toString(36)}`, type: "hero" }],
            seo: { title: `${title} · Aeropath`, description: "" },
          };
          const id = admin.upsertContent(page);
          setNewOpen(false);
          setSelectedId(id);
          setDraft({ ...page, id, updatedAt: new Date().toISOString() });
          toast.success("Page created as draft", { description: `/${kind === "collection" ? "collections" : "destinations"}/${page.slug}` });
        }}
      />
    </div>
  );
}

function NewPageDialog({ open, onOpenChange, onCreate }: { open: boolean; onOpenChange: (v: boolean) => void; onCreate: (title: string, kind: ContentPage["kind"]) => void }) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<ContentPage["kind"]>("destination");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New landing page</DialogTitle>
          <DialogDescription>Created as a draft with a hero block. Nothing is public until you publish it.</DialogDescription>
        </DialogHeader>
        <Field label="Title" htmlFor="np-title" hint={title ? `Slug: ${slugify(title)}` : undefined}>
          <Input id="np-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Selous & Nyerere" />
        </Field>
        <Field label="Kind">
          <Select value={kind} onValueChange={(v) => setKind(v as ContentPage["kind"])}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="destination">Destination</SelectItem>
              <SelectItem value="collection">Collection</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={!title.trim()} onClick={() => { onCreate(title.trim(), kind); setTitle(""); }}>Create draft</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
