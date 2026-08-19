"use client";

import Link from "next/link";
import { ArrowRight, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { SearchWidget } from "@/components/shared/search-widget";
import { EmptyState } from "@/components/shared/empty-state";
import { MoneyText } from "@/components/shared/money-text";
import { ProductImage } from "@/components/shared/product-image";
import { useStore } from "@/lib/store";
import { addDays, today } from "@/lib/format";
import type { ContentPage, Vertical } from "@/lib/domain/types";

const PATH: Record<Vertical, string> = { stay: "/stays", flight: "/flights", tour: "/tours", transfer: "/transfers" };

/**
 * T24 / T25 · Destination and collection pages, rendered from the content service.
 * Editors change these in the back office (M01) without a code deploy.
 */
export function ContentPageView({ slug, kind }: { slug: string; kind: ContentPage["kind"] }) {
  const hydrated = useStore((s) => s.hydrated);
  const page = useStore((s) => Object.values(s.content).find((c) => c.slug === slug && c.kind === kind));
  const products = useStore((s) => s.products);

  if (!hydrated) return <div className="mx-auto max-w-[1200px] px-4 py-10"><div className="h-64 animate-pulse rounded-2xl bg-muted" /></div>;
  if (!page) {
    return (
      <div className="mx-auto max-w-[1200px] px-4 py-16">
        <EmptyState
          title="Page not found"
          description="This destination or collection has not been published yet."
          action={<Button asChild><Link href="/">Back to home</Link></Button>}
        />
      </div>
    );
  }

  const q = `dateFrom=${addDays(today(), 14)}&dateTo=${addDays(today(), 17)}&adults=2`;

  return (
    <>
      {/* Same hero pattern as the home page: photograph behind an upper band, category tabs sitting
          on the image, and the search card breaking out of its bottom edge. */}
      <section className="relative">
        <div className="absolute inset-x-0 top-0 h-72 overflow-hidden sm:h-96">
          <ProductImage slug={page.slug} priority alt="" className="size-full" />
          <div className="absolute inset-0 bg-gradient-to-r from-brand-900/80 via-brand-900/40 to-transparent" aria-hidden />
          <div className="absolute inset-0 bg-gradient-to-t from-brand-900/35 via-transparent to-brand-900/15" aria-hidden />
        </div>

        <div className="relative mx-auto max-w-[1200px] px-4 pt-12 sm:pt-16">
          <nav className="text-xs text-white/75" aria-label="Breadcrumb">
            <Link href="/" className="hover:text-white">Home</Link> <span>/</span>{" "}
            <span className="capitalize">{kind === "destination" ? "Destinations" : "Collections"}</span>
          </nav>
          <h1 className="mt-2 font-display text-4xl text-white sm:text-5xl">{page.title}</h1>
          <p className="mt-2 max-w-2xl text-white/85">{page.subtitle}</p>

          <div className="mt-8 sm:mt-12">
            <SearchWidget density="hero" floatingTabs initial={{ q: kind === "destination" ? page.title : "" }} />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1200px] px-4 pt-10">

        <div className="space-y-12 pb-10">
          {page.blocks.filter((b) => b.type !== "hero").map((block) => {
            if (block.type === "editorial") {
              return (
                <section key={block.id} className="max-w-3xl">
                  {block.title ? <h2 className="font-display text-2xl">{block.title}</h2> : null}
                  {block.body ? <p className="mt-2 text-base leading-relaxed text-muted-foreground">{block.body}</p> : null}
                </section>
              );
            }
            if (block.type === "faq") {
              return (
                <section key={block.id} className="max-w-3xl">
                  <h2 className="font-display text-2xl">{block.title ?? "Good to know"}</h2>
                  <Accordion type="single" collapsible className="mt-3">
                    <AccordionItem value="a">
                      <AccordionTrigger>{block.title ?? "Good to know"}</AccordionTrigger>
                      <AccordionContent><p className="text-sm text-muted-foreground">{block.body}</p></AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </section>
              );
            }
            if (block.type === "cta") {
              return (
                <section key={block.id} className="rounded-2xl bg-gradient-to-br from-brand-700 to-brand-500 p-8 text-center">
                  <h2 className="font-display text-2xl text-white">{block.title}</h2>
                  {block.body ? <p className="mt-1.5 text-white/85">{block.body}</p> : null}
                  <Button asChild variant="secondary" className="mt-4"><Link href="/stays">Start searching</Link></Button>
                </section>
              );
            }
            // rail
            const items = (block.productIds ?? []).map((id) => products[id]).filter(Boolean);
            if (!items.length) return null;
            return (
              <section key={block.id}>
                <div className="mb-4 flex items-baseline justify-between gap-4">
                  <h2 className="font-display text-2xl">{block.title}</h2>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {items.map((p) => (
                    <Link key={p.id} href={`${PATH[p.vertical]}/${p.slug}?${q}`} className="group overflow-hidden rounded-2xl border bg-card transition-shadow hover:shadow-lg">
                      <ProductImage slug={p.slug} alt="" className="h-40" />
                      <div className="p-4">
                        <p className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                          <MapPin className="size-3" aria-hidden /> {p.location.city}
                        </p>
                        <p className="mt-0.5 line-clamp-2 font-display text-lg leading-snug group-hover:text-brand-text">{p.title}</p>
                        {p.reviewScore ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            <span className="font-semibold text-foreground">{p.reviewScore.toFixed(1)}</span> · {p.reviewCount} reviews
                          </p>
                        ) : null}
                        <div className="mt-2 flex items-baseline justify-between gap-2">
                          <span className="text-xs text-muted-foreground">from</span>
                          <MoneyText minor={p.priceFromMinor} currency={p.currency} convert size="md" />
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}

          <section className="rounded-2xl border bg-muted/40 p-6 text-center">
            <h2 className="font-display text-xl">Not sure where to start?</h2>
            <p className="mx-auto mt-1.5 max-w-lg text-sm text-muted-foreground">
              Tell us the dates and party size and we will show you what is actually available — with the all-in price,
              park fees included, before you pay anything.
            </p>
            <Button asChild className="mt-4 gap-1.5">
              <Link href={`/stays?q=${encodeURIComponent(page.title)}&${q}`}>See what is available <ArrowRight className="size-4" aria-hidden /></Link>
            </Button>
          </section>
        </div>
      </div>
    </>
  );
}
