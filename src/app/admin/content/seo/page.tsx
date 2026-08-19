"use client";

import { useMemo, useState } from "react";
import { Braces, Globe, Save, Search, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, StatTile } from "@/components/chrome/console-shell";
import { EmptyState } from "@/components/shared/empty-state";
import { Pill } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/hooks/use-session";
import { useStore } from "@/lib/store";
import { admin } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { ContentPage, Product } from "@/lib/domain/types";
import { AccessDenied, Field, Note, Section } from "@/features/backoffice/ui";

const TITLE_MAX = 60;
const DESC_MAX = 155;

const pathFor = (p: ContentPage) => (p.kind === "collection" ? `/collections/${p.slug}` : p.kind === "destination" ? `/destinations/${p.slug}` : `/${p.slug === "home" ? "" : p.slug}`);

function counterTone(len: number, max: number) {
  if (len === 0) return "text-destructive";
  if (len > max) return "text-destructive";
  if (len > max * 0.9) return "text-warning-foreground";
  return "text-muted-foreground";
}

/** Structured data the public page would emit, built from the real blocks. */
function structuredData(page: ContentPage, products: Record<string, Product>) {
  const railProducts = page.blocks.filter((b) => b.type === "rail").flatMap((b) => b.productIds ?? []).map((id) => products[id]).filter(Boolean);
  const faqs = page.blocks.filter((b) => b.type === "faq" && b.body);
  const graph: Array<Record<string, unknown>> = [
    {
      "@type": page.kind === "destination" ? "TouristDestination" : "CollectionPage",
      name: page.title,
      description: page.seo.description || page.subtitle,
      url: `https://aeropath.co.tz${pathFor(page)}`,
    },
  ];
  if (railProducts.length) {
    graph.push({
      "@type": "ItemList",
      numberOfItems: railProducts.length,
      itemListElement: railProducts.slice(0, 8).map((p, i) => ({
        "@type": "ListItem",
        position: i + 1,
        item: {
          "@type": p.vertical === "stay" ? "Hotel" : "Product",
          name: p.title,
          address: { "@type": "PostalAddress", addressLocality: p.location.city, addressRegion: p.location.region, addressCountry: p.location.countryCode },
          aggregateRating: p.reviewScore ? { "@type": "AggregateRating", ratingValue: p.reviewScore, reviewCount: p.reviewCount ?? 0 } : undefined,
          offers: { "@type": "Offer", price: p.priceFromMinor, priceCurrency: p.currency, availability: "https://schema.org/InStock" },
        },
      })),
    });
  }
  if (faqs.length) {
    graph.push({
      "@type": "FAQPage",
      mainEntity: faqs.map((f) => ({ "@type": "Question", name: f.title ?? "Good to know", acceptedAnswer: { "@type": "Answer", text: f.body } })),
    });
  }
  return { "@context": "https://schema.org", "@graph": graph };
}

/** M04 · SEO. Per page metadata with live counters, a SERP preview and the structured data payload. */
export default function SeoScreen() {
  const session = useSession();
  const content = useStore((s) => s.content);
  const products = useStore((s) => s.products);

  const pages = useMemo(() => Object.values(content).sort((a, b) => a.title.localeCompare(b.title)), [content]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [syncKey, setSyncKey] = useState<string | null>(null);

  const selected = selectedId ? content[selectedId] : pages[0];
  const key = selected ? `${selected.id}:${selected.updatedAt}` : null;
  if (selected && syncKey !== key) {
    setSyncKey(key);
    setTitle(selected.seo.title);
    setDescription(selected.seo.description);
  }

  if (session.hydrated && !session.can("CONTENT:edit")) {
    return <AccessDenied what="SEO" needs={`${session.roleLabel} has no CONTENT:edit permission. Sign in as a Content Editor, Platform Admin or Super Admin.`} />;
  }

  const missing = pages.filter((p) => !p.seo.description.trim() || !p.seo.title.trim());
  const tooLong = pages.filter((p) => p.seo.title.length > TITLE_MAX || p.seo.description.length > DESC_MAX);
  const dirty = Boolean(selected) && (title !== selected?.seo.title || description !== selected?.seo.description);

  function save() {
    if (!selected) return;
    admin.upsertContent({ ...selected, seo: { title, description } });
    toast.success("Metadata saved", { description: `${selected.title} · title ${title.length} chars, description ${description.length} chars` });
  }

  return (
    <div>
      <PageHeader
        title="SEO"
        code="M04"
        description="Metadata is per page and is what a search engine shows. Structured data is generated from the same blocks the page renders, so it never drifts."
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <StatTile label="Pages" value={pages.length} hint="Destination, collection and landing" icon={Globe} />
        <StatTile label="Missing metadata" value={missing.length} hint="Empty title or description" tone={missing.length ? "warning" : "success"} icon={TrendingUp} />
        <StatTile label="Over recommended length" value={tooLong.length} hint={`Title > ${TITLE_MAX}, description > ${DESC_MAX}`} tone={tooLong.length ? "warning" : "success"} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <div className="space-y-2">
          {pages.map((p) => {
            const bad = !p.seo.description.trim() || !p.seo.title.trim() || p.seo.title.length > TITLE_MAX || p.seo.description.length > DESC_MAX;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedId(p.id)}
                className={cn("w-full rounded-xl border bg-card p-3 text-left transition-colors hover:border-brand-300", selected?.id === p.id && "border-brand-500 ring-1 ring-brand-500/30")}
              >
                <p className="truncate text-sm font-medium">{p.title}</p>
                <p className="truncate text-[11px] text-muted-foreground">{pathFor(p)}</p>
                <div className="mt-1.5">
                  <Pill tone={bad ? "warning" : "success"}>{bad ? "Needs attention" : "Complete"}</Pill>
                </div>
              </button>
            );
          })}
          {!pages.length ? <EmptyState icon={Globe} title="No pages" description="Create a landing page first." /> : null}
        </div>

        {!selected ? (
          <EmptyState icon={Search} title="Pick a page" description="Metadata is edited per page." />
        ) : (
          <div className="space-y-4">
            <Section
              title={`Metadata · ${selected.title}`}
              description={pathFor(selected)}
              actions={<Button size="sm" onClick={save} disabled={!dirty}><Save className="size-4" aria-hidden /> {dirty ? "Save metadata" : "Saved"}</Button>}
            >
              <div className="space-y-3">
                <Field label="Meta title" htmlFor="seo-title">
                  <Input id="seo-title" value={title} onChange={(e) => setTitle(e.target.value)} />
                  <p className={cn("text-[11px] tabular-nums", counterTone(title.length, TITLE_MAX))}>
                    {title.length} / {TITLE_MAX} characters {title.length > TITLE_MAX ? "· Google will truncate this" : title.length === 0 ? "· required" : ""}
                  </p>
                </Field>
                <Field label="Meta description" htmlFor="seo-desc">
                  <Textarea id="seo-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
                  <p className={cn("text-[11px] tabular-nums", counterTone(description.length, DESC_MAX))}>
                    {description.length} / {DESC_MAX} characters {description.length > DESC_MAX ? "· will be cut mid sentence" : description.length === 0 ? "· required" : ""}
                  </p>
                </Field>
              </div>
            </Section>

            <Section title="Search result preview" description="Roughly how this page appears on a results page.">
              <div className="max-w-xl rounded-lg border bg-background p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="flex size-5 items-center justify-center rounded-full bg-brand-500 text-[9px] font-bold text-white">AP</span>
                  <span>
                    Aeropath
                    <span className="block text-[11px]">aeropath.co.tz{pathFor(selected)}</span>
                  </span>
                </div>
                <p className="mt-1.5 text-lg leading-6 text-[#1a0dab] dark:text-brand-300">
                  {(title || selected.title).slice(0, TITLE_MAX)}{(title || selected.title).length > TITLE_MAX ? "…" : ""}
                </p>
                <p className="mt-1 text-sm leading-5 text-muted-foreground">
                  {(description || selected.subtitle).slice(0, DESC_MAX)}{(description || selected.subtitle).length > DESC_MAX ? "…" : ""}
                </p>
              </div>
            </Section>

            <Section title="Structured data" description="Generated from the page blocks — rails become an ItemList, FAQ blocks become a FAQPage.">
              <pre className="max-h-80 overflow-auto rounded-lg border bg-muted/40 p-3 text-[11px] leading-relaxed">
                <code>{JSON.stringify(structuredData({ ...selected, seo: { title, description } }, products), null, 2)}</code>
              </pre>
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <Braces className="size-4" aria-hidden />
                Emitted as a single application/ld+json script tag in the page head.
              </div>
            </Section>

            <Note title="Internal link blocks">
              Every rail on this page is also an internal link block: each product card links to the product page, which links back to the
              destination. That reciprocal linking is why rails are worth more than a hand written list of links.
            </Note>
          </div>
        )}
      </div>
    </div>
  );
}
