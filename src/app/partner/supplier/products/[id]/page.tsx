"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, Check, Cloud, Image as ImageIcon, ImagePlus, Loader2, Plus, Send, ShieldCheck, SlidersHorizontal, Star, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/chrome/console-shell";
import { EmptyState } from "@/components/shared/empty-state";
import { ProductImage } from "@/components/shared/product-image";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useStore } from "@/lib/store";
import { catalog } from "@/lib/api";
import { cancellationPolicies } from "@/lib/fixtures/policies";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { NotSupplier, ProductStatusPill, PUBLISH_THRESHOLD, VERTICAL_LABELS, useSupplierContext } from "@/features/supplier/shared";
import type { Media, Product } from "@/lib/domain/types";

interface ItineraryDay { day: number; title: string; body: string }

type Draft = Pick<Product, "title" | "description" | "amenities" | "tags" | "media" | "location" | "cancellationPolicyId" | "childPolicy" | "freeCancellation" | "instantConfirm" | "attributes">;

function toDays(v: unknown): ItineraryDay[] {
  if (!Array.isArray(v)) return [];
  return v.map((d, i) => {
    const o = (d ?? {}) as Record<string, unknown>;
    return { day: typeof o.day === "number" ? o.day : i + 1, title: typeof o.title === "string" ? o.title : "", body: typeof o.body === "string" ? o.body : "" };
  });
}
function toStrings(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/** S04 · Tabbed product editor. Autosaves, shows the review verdict, and gates SUBMIT on completeness. */
export default function ProductEditorPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { org, hydrated, isAdmin } = useSupplierContext();
  const product = useStore((s) => s.products[id]);
  const ratePlanCount = useStore((s) => Object.values(s.ratePlans).filter((r) => r.productId === id).length);

  if (!hydrated) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!org) {
    return (
      <>
        <PageHeader title="Product editor" code="S04" />
        <NotSupplier what="The product editor" />
      </>
    );
  }
  if (!product || product.supplierId !== org.id) {
    return (
      <>
        <PageHeader title="Product editor" code="S04" />
        <EmptyState
          icon={AlertTriangle}
          title="Product not found"
          description="This listing does not belong to your organisation, or it has been removed."
          action={<Button asChild><Link href="/partner/supplier/products">Back to products</Link></Button>}
        />
      </>
    );
  }

  return <Editor key={product.id} product={product} ratePlanCount={ratePlanCount} isAdmin={isAdmin} />;
}

function Editor({ product, ratePlanCount, isAdmin }: { product: Product; ratePlanCount: number; isAdmin: boolean }) {
  const [tab, setTab] = useState("basics");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const firstRender = useRef(true);

  const [draft, setDraft] = useState<Draft>(() => ({
    title: product.title,
    description: product.description,
    amenities: [...product.amenities],
    tags: [...product.tags],
    media: product.media.map((m) => ({ ...m })),
    location: { ...product.location },
    cancellationPolicyId: product.cancellationPolicyId,
    childPolicy: product.childPolicy ?? "",
    freeCancellation: product.freeCancellation,
    instantConfirm: product.instantConfirm,
    attributes: { ...product.attributes },
  }));

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setSaveState("saving");
    const t = setTimeout(() => {
      catalog.updateProduct(product.id, draft);
      setSavedAt(new Date().toISOString());
      setSaveState("saved");
    }, 600);
    return () => clearTimeout(t);
  }, [draft, product.id]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setAttr = (k: string, v: unknown) => setDraft((d) => ({ ...d, attributes: { ...d.attributes, [k]: v } }));
  const attr = (k: string): unknown => draft.attributes[k];
  const attrStr = (k: string, fallback = "") => (typeof attr(k) === "string" ? (attr(k) as string) : fallback);
  const attrNum = (k: string, fallback = 0) => (typeof attr(k) === "number" ? (attr(k) as number) : fallback);

  const itinerary = toDays(attr("itinerary"));
  const inclusions = toStrings(attr("inclusions"));
  const exclusions = toStrings(attr("exclusions"));

  /* completeness hints, mirroring the score the back office sees */
  const hints: Array<{ text: string; tab: string; points: number }> = [];
  if (draft.media.length < 5) hints.push({ text: `Add ${5 - draft.media.length} more photo${5 - draft.media.length === 1 ? "" : "s"} to publish`, tab: "media", points: draft.media.length >= 3 ? 1 : 2 });
  if (draft.description.trim().length <= 80) hints.push({ text: "Write a description of at least 80 characters", tab: "basics", points: 2 });
  if (draft.amenities.length < 3) hints.push({ text: "List at least three highlights or amenities", tab: "inclusions", points: 1 });
  if (ratePlanCount === 0) hints.push({ text: "Create at least one rate plan", tab: "policies", points: 2 });
  if (!draft.location.city.trim()) hints.push({ text: "Set the city or park", tab: "basics", points: 1 });

  const canSubmit = product.completeness >= PUBLISH_THRESHOLD;
  const detailsTab = product.vertical === "stay" ? "Rooms" : product.vertical === "tour" ? "Itinerary" : product.vertical === "transfer" ? "Route" : "Flight";

  function submit() {
    if (!canSubmit) {
      toast.error(`Completeness is ${product.completeness}/10`, { description: `You need ${PUBLISH_THRESHOLD}/10 before the supply team will review this listing.` });
      return;
    }
    catalog.submitForReview(product.id);
    toast.success("Submitted for review", { description: "A supply manager approves listings in the back office. No supplier account can publish directly." });
  }

  function addPhoto() {
    const seed = `${product.slug}-${draft.media.length + 1}-${Math.random().toString(36).slice(2, 6)}`;
    const next: Media = {
      url: `https://picsum.photos/seed/${encodeURIComponent(seed)}/900/640`,
      alt: `${draft.title} photo ${draft.media.length + 1}`,
      isCover: draft.media.length === 0,
      tone: draft.media[0]?.tone ?? "from-brand-700 via-brand-500 to-brand-300",
    };
    set("media", [...draft.media, next]);
  }

  function moveDay(index: number, delta: number) {
    const next = [...itinerary];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setAttr("itinerary", next.map((d, i) => ({ ...d, day: i + 1 })));
  }

  return (
    <>
      <PageHeader
        title={draft.title || "Untitled product"}
        code="S04"
        description={`${VERTICAL_LABELS[product.vertical]} · ${draft.location.city || "no city set"} · autosaves as you type`}
        actions={
          <>
            <Button variant="ghost" asChild>
              <Link href="/partner/supplier/products"><ArrowLeft className="size-4" aria-hidden />All products</Link>
            </Button>
            {isAdmin ? (
              <Button variant="outline" asChild>
                <Link href={`/partner/supplier/products/${product.id}/rates`}><SlidersHorizontal className="size-4" aria-hidden />Rate plans ({ratePlanCount})</Link>
              </Button>
            ) : null}
            <Button onClick={submit} disabled={!canSubmit || product.status === "pending_review"}>
              <Send className="size-4" aria-hidden />
              {product.status === "pending_review" ? "Awaiting review" : "Submit for review"}
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <ProductStatusPill status={product.status} />
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
          {saveState === "saving" ? <><Loader2 className="size-3.5 animate-spin" aria-hidden />Saving…</> : saveState === "saved" ? <><Cloud className="size-3.5 text-success" aria-hidden />All changes saved{savedAt ? ` · ${formatTime(savedAt)}` : ""}</> : <><Check className="size-3.5" aria-hidden />Up to date</>}
        </span>
      </div>

      {product.status === "changes_requested" || product.status === "rejected" ? (
        <Alert variant="destructive" className="mb-4">
          <AlertTriangle className="size-4" aria-hidden />
          <AlertTitle>{product.status === "rejected" ? "Listing rejected by the supply team" : "Changes requested by the supply team"}</AlertTitle>
          <AlertDescription>{product.reviewNotes ?? "No notes were left. Contact your account manager."}</AlertDescription>
        </Alert>
      ) : null}
      {product.status === "pending_review" ? (
        <Alert className="mb-4">
          <ShieldCheck className="size-4" aria-hidden />
          <AlertTitle>In the back office review queue</AlertTitle>
          <AlertDescription>A supply manager checks content, photos and rates. You will be notified when it goes live. Edits made now are included in the review.</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="flex-wrap">
            <TabsTrigger value="basics">Basics</TabsTrigger>
            <TabsTrigger value="details">{detailsTab}</TabsTrigger>
            <TabsTrigger value="inclusions">Inclusions</TabsTrigger>
            <TabsTrigger value="media">Media</TabsTrigger>
            <TabsTrigger value="policies">Policies</TabsTrigger>
          </TabsList>

          {/* ── Basics ─────────────────────────────── */}
          <TabsContent value="basics" className="mt-4 space-y-4 rounded-xl border bg-card p-4">
            <div>
              <Label htmlFor="title">Title</Label>
              <Input id="title" className="mt-1.5" value={draft.title} onChange={(e) => set("title", e.target.value)} />
            </div>
            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" className="mt-1.5" rows={6} value={draft.description} onChange={(e) => set("description", e.target.value)} placeholder="What makes this worth booking? Location, what a day looks like, what is included." />
              <p className="mt-1 text-xs text-muted-foreground">{draft.description.length} characters · 80 or more scores the full two points.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="city">City / park</Label>
                <Input id="city" className="mt-1.5" value={draft.location.city} onChange={(e) => set("location", { ...draft.location, city: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="region">Region</Label>
                <Input id="region" className="mt-1.5" value={draft.location.region} onChange={(e) => set("location", { ...draft.location, region: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="tags">Tags (comma separated)</Label>
                <Input id="tags" className="mt-1.5" value={draft.tags.join(", ")} onChange={(e) => set("tags", e.target.value.split(",").map((t) => t.trim()).filter(Boolean))} />
              </div>
            </div>
            {product.vertical === "tour" ? (
              <div className="grid gap-4 sm:grid-cols-4">
                <NumberField id="durationDays" label="Duration (days)" value={attrNum("durationDays", 1)} onChange={(v) => setAttr("durationDays", v)} />
                <div>
                  <Label htmlFor="difficulty">Difficulty</Label>
                  <Select value={attrStr("difficulty", "Easy")} onValueChange={(v) => setAttr("difficulty", v)}>
                    <SelectTrigger id="difficulty" className="mt-1.5 w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["Easy", "Moderate", "Challenging", "Extreme"].map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <NumberField id="groupMin" label="Group min" value={attrNum("groupMin", 1)} onChange={(v) => setAttr("groupMin", v)} />
                <NumberField id="groupMax" label="Group max" value={attrNum("groupMax", 6)} onChange={(v) => setAttr("groupMax", v)} />
              </div>
            ) : null}
            {product.vertical === "stay" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="propertyType">Property type</Label>
                  <Input id="propertyType" className="mt-1.5" value={attrStr("propertyType")} onChange={(e) => setAttr("propertyType", e.target.value)} placeholder="Lodge, Tented camp, Hotel…" />
                </div>
                <NumberField id="rooms" label="Rooms / tents" value={attrNum("rooms", 0)} onChange={(v) => setAttr("rooms", v)} />
              </div>
            ) : null}
          </TabsContent>

          {/* ── Details: itinerary / rooms / route / flight ─────── */}
          <TabsContent value="details" className="mt-4 space-y-4 rounded-xl border bg-card p-4">
            {product.vertical === "tour" ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="font-display text-lg">Day by day itinerary</h2>
                    <p className="text-sm text-muted-foreground">{itinerary.length} day{itinerary.length === 1 ? "" : "s"} · reorder with the arrows, the day numbers renumber themselves.</p>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => setAttr("itinerary", [...itinerary, { day: itinerary.length + 1, title: "", body: "" }])}
                  >
                    <Plus className="size-4" aria-hidden />Add day
                  </Button>
                </div>
                {itinerary.length ? (
                  <ol className="space-y-3">
                    {itinerary.map((d, i) => (
                      <li key={i} className="rounded-lg border p-3">
                        <div className="flex items-start gap-3">
                          <span className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-text-strong tabular-nums">{d.day}</span>
                          <div className="min-w-0 flex-1 space-y-2">
                            <div>
                              <Label htmlFor={`day-title-${i}`} className="sr-only">Day {d.day} title</Label>
                              <Input
                                id={`day-title-${i}`}
                                value={d.title}
                                placeholder="Day title, e.g. Ngorongoro Crater descent"
                                onChange={(e) => setAttr("itinerary", itinerary.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                              />
                            </div>
                            <div>
                              <Label htmlFor={`day-body-${i}`} className="sr-only">Day {d.day} description</Label>
                              <Textarea
                                id={`day-body-${i}`}
                                rows={2}
                                value={d.body}
                                placeholder="What happens on this day, where you sleep, meals included."
                                onChange={(e) => setAttr("itinerary", itinerary.map((x, j) => (j === i ? { ...x, body: e.target.value } : x)))}
                              />
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-col gap-1">
                            <Button size="icon-sm" variant="ghost" aria-label={`Move day ${d.day} up`} onClick={() => moveDay(i, -1)} disabled={i === 0}><ArrowUp className="size-4" aria-hidden /></Button>
                            <Button size="icon-sm" variant="ghost" aria-label={`Move day ${d.day} down`} onClick={() => moveDay(i, 1)} disabled={i === itinerary.length - 1}><ArrowDown className="size-4" aria-hidden /></Button>
                            <Button size="icon-sm" variant="ghost" aria-label={`Remove day ${d.day}`} onClick={() => setAttr("itinerary", itinerary.filter((_, j) => j !== i).map((x, j) => ({ ...x, day: j + 1 })))}><Trash2 className="size-4 text-destructive" aria-hidden /></Button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <EmptyState icon={Plus} title="No days yet" description="Add one entry per day of the safari. Travellers see this as the trip outline." action={<Button onClick={() => setAttr("itinerary", [{ day: 1, title: "", body: "" }])}>Add the first day</Button>} />
                )}
              </>
            ) : null}

            {product.vertical === "stay" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="checkIn">Check in</Label>
                  <Input id="checkIn" className="mt-1.5" value={attrStr("checkIn", "14:00")} onChange={(e) => setAttr("checkIn", e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="checkOut">Check out</Label>
                  <Input id="checkOut" className="mt-1.5" value={attrStr("checkOut", "10:00")} onChange={(e) => setAttr("checkOut", e.target.value)} />
                </div>
                <NumberField id="rooms2" label="Total rooms / tents" value={attrNum("rooms", 0)} onChange={(v) => setAttr("rooms", v)} />
                <div>
                  <Label htmlFor="parkFeeNote">Park fee note</Label>
                  <Input id="parkFeeNote" className="mt-1.5" value={attrStr("parkFeeNote")} onChange={(e) => setAttr("parkFeeNote", e.target.value)} placeholder="e.g. Serengeti park fees payable separately" />
                </div>
                <p className="text-xs text-muted-foreground sm:col-span-2">Room types and their prices live on the rate plans screen. Availability per date is on the availability calendar.</p>
              </div>
            ) : null}

            {product.vertical === "transfer" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="routeFrom">Pickup</Label>
                  <Input
                    id="routeFrom"
                    className="mt-1.5"
                    value={(() => { const r = attr("route"); return r && typeof r === "object" ? String((r as Record<string, unknown>).from ?? "") : ""; })()}
                    onChange={(e) => { const r = (attr("route") ?? {}) as Record<string, unknown>; setAttr("route", { ...r, from: e.target.value }); }}
                  />
                </div>
                <div>
                  <Label htmlFor="routeTo">Drop off</Label>
                  <Input
                    id="routeTo"
                    className="mt-1.5"
                    value={(() => { const r = attr("route"); return r && typeof r === "object" ? String((r as Record<string, unknown>).to ?? "") : ""; })()}
                    onChange={(e) => { const r = (attr("route") ?? {}) as Record<string, unknown>; setAttr("route", { ...r, to: e.target.value }); }}
                  />
                </div>
                <NumberField id="durationMinutes" label="Duration (minutes)" value={attrNum("durationMinutes", 60)} onChange={(v) => setAttr("durationMinutes", v)} />
                <NumberField id="distanceKm" label="Distance (km)" value={attrNum("distanceKm", 0)} onChange={(v) => setAttr("distanceKm", v)} />
              </div>
            ) : null}

            {product.vertical === "flight" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="carrier">Carrier</Label>
                  <Input id="carrier" className="mt-1.5" value={attrStr("carrier")} onChange={(e) => setAttr("carrier", e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="flightNo">Flight number</Label>
                  <Input id="flightNo" className="mt-1.5" value={attrStr("flightNo")} onChange={(e) => setAttr("flightNo", e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="fromApt">From (IATA)</Label>
                  <Input id="fromApt" className="mt-1.5" value={attrStr("from")} onChange={(e) => setAttr("from", e.target.value.toUpperCase())} />
                </div>
                <div>
                  <Label htmlFor="toApt">To (IATA)</Label>
                  <Input id="toApt" className="mt-1.5" value={attrStr("to")} onChange={(e) => setAttr("to", e.target.value.toUpperCase())} />
                </div>
                <div>
                  <Label htmlFor="departTime">Departs</Label>
                  <Input id="departTime" className="mt-1.5" value={attrStr("departTime")} onChange={(e) => setAttr("departTime", e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="arriveTime">Arrives</Label>
                  <Input id="arriveTime" className="mt-1.5" value={attrStr("arriveTime")} onChange={(e) => setAttr("arriveTime", e.target.value)} />
                </div>
              </div>
            ) : null}
          </TabsContent>

          {/* ── Inclusions ─────────────────────────── */}
          <TabsContent value="inclusions" className="mt-4 space-y-5 rounded-xl border bg-card p-4">
            <ChipEditor
              label="Highlights and amenities"
              hint="Shown as the feature list on the product page. Three or more scores the point."
              values={draft.amenities}
              onChange={(v) => set("amenities", v)}
              placeholder="e.g. Private 4x4"
            />
            {product.vertical === "tour" ? (
              <>
                <ChipEditor label="What's included" hint="Park fees, meals, guide, transfers…" values={inclusions} onChange={(v) => setAttr("inclusions", v)} placeholder="e.g. Park fees" />
                <ChipEditor label="What's excluded" hint="Be explicit — this is the number one source of complaints." values={exclusions} onChange={(v) => setAttr("exclusions", v)} placeholder="e.g. Tips" />
              </>
            ) : null}
          </TabsContent>

          {/* ── Media ──────────────────────────────── */}
          <TabsContent value="media" className="mt-4 space-y-4 rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="font-display text-lg">Photos</h2>
                <p className={cn("text-sm", draft.media.length >= 5 ? "text-muted-foreground" : "text-warning-foreground")}>
                  {draft.media.length} of 5 minimum · the cover photo is the one travellers see in search.
                </p>
              </div>
              <Button size="sm" onClick={addPhoto}><ImagePlus className="size-4" aria-hidden />Add photo</Button>
            </div>
            {draft.media.length ? (
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {draft.media.map((m, i) => (
                  <li key={`${m.url}-${i}`} className="overflow-hidden rounded-lg border">
                    <ProductImage slug={product.id} index={i} alt={m.alt} className="h-32 w-full">
                      {m.isCover ? <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium text-white">Cover</span> : null}
                    </ProductImage>
                    <div className="space-y-2 p-2">
                      <Label htmlFor={`alt-${i}`} className="text-[11px] text-muted-foreground">Alt text</Label>
                      <Input id={`alt-${i}`} value={m.alt} onChange={(e) => set("media", draft.media.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x)))} />
                      <div className="flex gap-1.5">
                        <Button size="xs" variant="outline" disabled={m.isCover} onClick={() => set("media", draft.media.map((x, j) => ({ ...x, isCover: j === i })))}>
                          <Star className="size-3" aria-hidden />Make cover
                        </Button>
                        <Button size="xs" variant="ghost" aria-label={`Remove photo ${i + 1}`} onClick={() => set("media", draft.media.filter((_, j) => j !== i))}>
                          <Trash2 className="size-3 text-destructive" aria-hidden />Remove
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState icon={ImageIcon} title="No photos yet" description="Five landscape photos is the minimum for a listing to be approved." action={<Button onClick={addPhoto}><ImagePlus className="size-4" aria-hidden />Add the first photo</Button>} />
            )}
          </TabsContent>

          {/* ── Policies ───────────────────────────── */}
          <TabsContent value="policies" className="mt-4 space-y-4 rounded-xl border bg-card p-4">
            <div>
              <Label htmlFor="policy">Cancellation policy</Label>
              <Select value={draft.cancellationPolicyId} onValueChange={(v) => set("cancellationPolicyId", v)}>
                <SelectTrigger id="policy" className="mt-1.5 w-full max-w-md"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {cancellationPolicies.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="mt-1.5 max-w-xl text-xs text-muted-foreground">{cancellationPolicies.find((p) => p.id === draft.cancellationPolicyId)?.summary}</p>
            </div>
            <div>
              <Label htmlFor="childPolicy">Child policy</Label>
              <Textarea id="childPolicy" className="mt-1.5 max-w-xl" rows={2} value={draft.childPolicy ?? ""} onChange={(e) => set("childPolicy", e.target.value)} placeholder="e.g. Children under 12 stay free sharing with parents" />
            </div>
            <div className="grid max-w-xl gap-3">
              <label className="flex items-center justify-between gap-4 rounded-lg border p-3">
                <span className="text-sm">
                  Free cancellation badge
                  <span className="mt-0.5 block text-xs text-muted-foreground">Shown in search when the policy has a 100% tier.</span>
                </span>
                <Switch checked={draft.freeCancellation} onCheckedChange={(v) => set("freeCancellation", v)} aria-label="Free cancellation" />
              </label>
              <label className="flex items-center justify-between gap-4 rounded-lg border p-3">
                <span className="text-sm">
                  Instant confirmation
                  <span className="mt-0.5 block text-xs text-muted-foreground">You promise to auto confirm. Otherwise the 2 hour SLA applies.</span>
                </span>
                <Switch checked={draft.instantConfirm} onCheckedChange={(v) => set("instantConfirm", v)} aria-label="Instant confirmation" />
              </label>
            </div>
            <div className="rounded-lg border border-dashed p-3">
              <p className="text-sm font-medium">Rate plans</p>
              <p className="text-xs text-muted-foreground">{ratePlanCount} configured. Prices, commission and inclusions live on the rate plans screen.</p>
              {isAdmin ? (
                <Button size="sm" variant="outline" className="mt-2" asChild>
                  <Link href={`/partner/supplier/products/${product.id}/rates`}><SlidersHorizontal className="size-3.5" aria-hidden />Open rate plans</Link>
                </Button>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">Rate plans are managed by your Supplier Admin.</p>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* ── Completeness rail ───────────────────── */}
        <aside className="space-y-3">
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Completeness</p>
            <p className="mt-1 font-display text-3xl tabular-nums">{product.completeness}<span className="text-lg text-muted-foreground">/10</span></p>
            <Progress value={product.completeness * 10} className="mt-2 h-2" aria-label={`Completeness ${product.completeness} of 10`} />
            <p className="mt-2 text-xs text-muted-foreground">
              {canSubmit ? "Ready to submit for review." : `${PUBLISH_THRESHOLD}/10 is the minimum the supply team accepts.`}
            </p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">To do</p>
            {hints.length ? (
              <ul className="mt-2 space-y-2">
                {hints.map((h) => (
                  <li key={h.text}>
                    <button type="button" onClick={() => setTab(h.tab)} className="flex w-full items-start gap-2 rounded-md p-1.5 text-left text-sm hover:bg-muted">
                      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
                      <span className="min-w-0">
                        {h.text}
                        <span className="block text-[11px] text-muted-foreground">+{h.points} point{h.points === 1 ? "" : "s"}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 flex items-center gap-2 text-sm text-success-foreground"><Check className="size-4" aria-hidden />Everything the score checks is done.</p>
            )}
          </div>
          <div className="rounded-xl border border-dashed bg-muted/40 p-4">
            <p className="flex items-center gap-2 text-sm font-medium"><ShieldCheck className="size-4 text-brand-text" aria-hidden />Approval is not automatic</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Submitting sets the listing to <span className="font-medium">pending review</span>. A supply manager in the Aeropath back office approves, requests changes or rejects it. No supplier role can publish directly.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}

function NumberField({ id, label, value, onChange }: { id: string; label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="number" className="mt-1.5" value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} />
    </div>
  );
}

function ChipEditor({ label, hint, values, onChange, placeholder }: { label: string; hint?: string; values: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [text, setText] = useState("");
  const inputId = `chip-${label.replace(/\W+/g, "-").toLowerCase()}`;
  function add() {
    const v = text.trim();
    if (!v || values.includes(v)) return;
    onChange([...values, v]);
    setText("");
  }
  return (
    <div>
      <Label htmlFor={inputId}>{label}</Label>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-full border bg-muted px-2.5 py-1 text-xs">
            {v}
            <button type="button" aria-label={`Remove ${v}`} onClick={() => onChange(values.filter((x) => x !== v))} className="text-muted-foreground hover:text-destructive">
              <X className="size-3" aria-hidden />
            </button>
          </span>
        ))}
        {values.length === 0 ? <span className="text-xs text-muted-foreground">Nothing listed yet.</span> : null}
      </div>
      <div className="mt-2 flex max-w-md gap-2">
        <Input id={inputId} value={text} placeholder={placeholder} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <Button type="button" variant="outline" onClick={add}><Plus className="size-4" aria-hidden />Add</Button>
      </div>
    </div>
  );
}
