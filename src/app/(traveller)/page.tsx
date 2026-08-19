"use client";

import Link from "next/link";
import { ArrowRight, BadgeCheck, Clock3, ShieldCheck, Smartphone, Sparkles } from "lucide-react";
import { SearchWidget, VERTICALS } from "@/components/shared/search-widget";
import { ProductImage } from "@/components/shared/product-image";
import { MoneyText } from "@/components/shared/money-text";
import { useStore } from "@/lib/store";
import { addDays, today } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Product } from "@/lib/domain/types";

/** T01 · Home. Vertical switcher over one shared search card. */
export default function HomePage() {
  const data = useStore((s) => s);
  const hydrated = useStore((s) => s.hydrated);

  const live = Object.values(data.products).filter((p) => p.status === "live");
  const rail = (ids: string[]) => ids.map((id) => data.products[id]).filter(Boolean) as Product[];
  const trending = rail(["prd_serena_lodge", "prd_zuri", "prd_tour_northern_7d", "prd_ngoro_lodge"]);
  const experiences = rail(["prd_tour_balloon", "prd_tour_kili_machame", "prd_tour_zanzibar_spice", "prd_xfer_arusha_serengeti"]);
  const destinations = Object.values(data.content).filter((c) => c.kind === "destination" && c.status === "published");

  return (
    <>
      {/* Hero.
          The photograph is bright and sits behind only the upper band; the search card breaks out
          of its bottom edge onto the page, and the category tabs sit on the image above it. */}
      <section className="relative">
        <div className="absolute inset-x-0 top-0 h-[430px] overflow-hidden sm:h-[480px]">
          {/* eslint-disable-next-line @next/next/no-img-element -- pre-optimised WebP, see scripts/optimize-images.mjs */}
          <img
            src="/img/stays/sea-house-1600.webp"
            srcSet="/img/stays/sea-house-960.webp 960w, /img/stays/sea-house-1600.webp 1600w"
            sizes="100vw"
            alt=""
            fetchPriority="high"
            decoding="async"
            className="size-full object-cover"
          />
          {/* Weighted to the left so the headline holds contrast while the right stays open sky. */}
          <div className="absolute inset-0 bg-gradient-to-r from-brand-900/80 via-brand-900/40 to-transparent" aria-hidden />
          <div className="absolute inset-0 bg-gradient-to-t from-brand-900/35 via-transparent to-brand-900/15" aria-hidden />
        </div>

        <div className="relative mx-auto max-w-[1400px] px-4 pt-14 sm:pt-20">
          <div className="max-w-2xl">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white ring-1 ring-white/25 backdrop-blur">
              <Sparkles className="size-3.5" aria-hidden /> Tanzania and East Africa
            </span>
            <h1 className="mt-4 font-display text-4xl leading-[1.08] tracking-tight text-white sm:text-5xl lg:text-[3.5rem]">
              <span className="font-normal">The whole trip,</span>
              <br />
              <span className="font-semibold">booked in one place</span>
              <span className="text-brand-200">.</span>
            </h1>
            <p className="mt-4 max-w-xl text-base text-white/85">
              Lodges and camps, safaris and treks, domestic flights and airport transfers. One price that includes
              park fees, VAT and everything else — paid with the mobile money you already use.
            </p>
          </div>

          <div className="mt-9 sm:mt-12">
            <SearchWidget density="hero" floatingTabs />
          </div>

          <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
            {[
              [ShieldCheck, "All-in prices · no surprise fees at checkout"],
              [Smartphone, "M-Pesa, Tigo Pesa, Airtel Money, card"],
              [Clock3, "Confirmation usually under 2 hours"],
              [BadgeCheck, "Every supplier vetted before listing"],
            ].map(([Icon, text]) => {
              const I = Icon as typeof ShieldCheck;
              return (
                <li key={text as string} className="flex items-center gap-1.5">
                  <I className="size-3.5" aria-hidden /> {text as string}
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <div className="mx-auto max-w-[1400px] space-y-14 px-4 py-12">
        {/* Verticals */}
        <section>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {VERTICALS.map((v) => {
              const count = live.filter((p) => p.vertical === v.id).length;
              return (
                <Link key={v.id} href={v.path} className="group flex items-start gap-3 rounded-xl border bg-card p-4 transition-all hover:border-brand-300 hover:shadow-md">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-text-strong">
                    <v.icon className="size-5" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 font-medium">
                      {v.label}
                      <ArrowRight className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{v.blurb}</span>
                    <span className="mt-1 block text-[11px] text-brand-text">{hydrated ? `${count} live` : "—"}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        <Rail title="Trending this month" subtitle="Most booked across the platform" products={trending} />

        {/* Destinations */}
        <section>
          <div className="mb-4 flex items-baseline justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl">Where to go</h2>
              <p className="text-sm text-muted-foreground">Guides built by our content team, updated weekly</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {destinations.map((d) => (
              <Link key={d.id} href={`/destinations/${d.slug}`} className="group relative overflow-hidden rounded-2xl">
                <ProductImage slug={d.slug} alt="" className="h-52">
                  <div className="absolute inset-x-0 bottom-0 p-4">
                    <p className="font-display text-xl text-white">{d.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-white/80">{d.subtitle}</p>
                  </div>
                </ProductImage>
              </Link>
            ))}
          </div>
        </section>

        <Rail title="Experiences worth the trip" subtitle="Curated by the Aeropath team" products={experiences} />

        {/* Partner strip */}
        <section className="grid gap-3 rounded-2xl border bg-muted/40 p-6 sm:grid-cols-3">
          {[
            { title: "List your lodge or fleet", body: "Self serve inventory, availability calendar, SLA-tracked confirmations and fortnightly payouts.", href: "/partner/supplier/onboarding", cta: "Become a supplier" },
          ].map((x) => (
            <div key={x.title} className="flex flex-col rounded-xl bg-card p-5">
              <h3 className="font-display text-lg">{x.title}</h3>
              <p className="mt-1.5 flex-1 text-sm text-muted-foreground">{x.body}</p>
              <Link href={x.href} className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand-text hover:underline">
                {x.cta} <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}

function Rail({ title, subtitle, products }: { title: string; subtitle: string; products: Product[] }) {
  const q = `dateFrom=${addDays(today(), 14)}&dateTo=${addDays(today(), 17)}&adults=2`;
  const path = { stay: "/stays", flight: "/flights", tour: "/tours", transfer: "/transfers" } as const;
  if (!products.length) return null;
  return (
    <section>
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl">{title}</h2>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <div className="no-scrollbar -mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4">
        {products.map((p) => (
          <Link key={p.id} href={`${path[p.vertical]}/${p.slug}?${q}`} className={cn("group w-[78vw] shrink-0 snap-start overflow-hidden rounded-2xl border bg-card transition-shadow hover:shadow-lg sm:w-auto")}>
            <ProductImage slug={p.slug} alt="" className="h-44" />
            <div className="p-4">
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{p.location.region}</p>
              <p className="mt-0.5 line-clamp-1 font-display text-lg group-hover:text-brand-text">{p.title}</p>
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
}
