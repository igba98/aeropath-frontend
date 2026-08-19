"use client";

import Link from "next/link";
import { Heart, MapPin, Star, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MoneyText } from "@/components/shared/money-text";
import { ProductImage } from "@/components/shared/product-image";
import { Pill } from "@/components/shared/status-chip";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store";
import { wishlist } from "@/lib/api";
import type { SearchHit } from "@/lib/api";
import type { Vertical } from "@/lib/domain/types";

const DETAIL_PATH: Record<Vertical, string> = { stay: "/stays", flight: "/flights", tour: "/tours", transfer: "/transfers" };

export function ProductCard({ hit, query, layout = "list" }: { hit: SearchHit; query?: string; layout?: "list" | "grid" }) {
  const { product: p, fromRatePlan, unitMinor, available, unitsLeft } = hit;
  const saved = useStore((st) => (st.wishlists[st.session.userId ?? "guest"] ?? []).some((w) => w.productId === p.id));
  const href = `${DETAIL_PATH[p.vertical]}/${p.slug}${query ? `?${query}` : ""}`;

  const nightly = p.vertical === "stay";
  const unitLabel = nightly ? "per night, all in" : p.vertical === "transfer" ? "per vehicle, all in" : "per person, all in";

  return (
    <article className={cn("group relative overflow-hidden rounded-2xl border bg-card transition-shadow hover:shadow-lg", layout === "list" ? "flex flex-col sm:flex-row" : "flex flex-col")}>
      <Link href={href} className={cn("relative shrink-0", layout === "list" ? "sm:w-64" : "")} aria-label={p.title}>
        <ProductImage slug={p.slug} alt="" className={cn(layout === "list" ? "h-44 w-full sm:h-full" : "h-44 w-full")}>
          <div className="absolute bottom-2 left-2 flex flex-wrap gap-1.5">
            {p.instantConfirm ? <Pill tone="success" icon={Zap} className="bg-success/90 text-white shadow-sm backdrop-blur">Instant</Pill> : null}
            {!available ? <Pill tone="danger" className="bg-white/95">Sold out</Pill> : unitsLeft !== null && unitsLeft <= 3 ? <Pill tone="warning" className="bg-white/95">Only {unitsLeft} left</Pill> : null}
          </div>
        </ProductImage>
      </Link>

      <button
        onClick={() => wishlist.toggle(p.id)}
        aria-label={saved ? `Remove ${p.title} from wishlist` : `Save ${p.title} to wishlist`}
        aria-pressed={saved}
        className="absolute right-3 top-3 z-10 flex size-9 items-center justify-center rounded-full bg-white/90 text-neutral-700 shadow-sm backdrop-blur transition-colors hover:bg-white"
      >
        <Heart className={cn("size-4", saved && "fill-destructive text-destructive")} />
      </button>

      <div className="flex flex-1 flex-col p-4">
        <div className="flex flex-wrap items-center gap-2">
          {p.starRating ? (
            <span className="flex items-center gap-0.5 text-warning" aria-label={`${p.starRating} star`}>
              {Array.from({ length: p.starRating }).map((_, i) => <Star key={i} className="size-3.5 fill-current" aria-hidden />)}
            </span>
          ) : null}
          {p.reviewScore ? (
            <span className="text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">{p.reviewScore.toFixed(1)}</span> · {p.reviewCount} reviews
            </span>
          ) : null}
        </div>

        <h3 className="mt-1.5 font-display text-lg leading-snug">
          <Link href={href} className="after:absolute after:inset-0 hover:text-brand-text">{p.title}</Link>
        </h3>

        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="size-3" aria-hidden /> {p.location.city}, {p.location.region}
        </p>

        <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{p.description}</p>

        <div className="mt-2 flex flex-wrap gap-1.5">
          {p.amenities.slice(0, 3).map((a) => (
            <span key={a} className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{a}</span>
          ))}
          {p.freeCancellation ? <span className="rounded-md bg-success/10 px-2 py-0.5 text-[11px] font-medium text-success-foreground">Free cancellation</span> : null}
        </div>

        <div className="mt-auto flex items-end justify-between gap-3 pt-3">
          <div>
            <p className="text-[11px] text-muted-foreground">{fromRatePlan.name}</p>
            <MoneyText minor={unitMinor} currency={p.currency} convert size="lg" className="mt-0.5 block" />
            <p className="text-[11px] text-muted-foreground">{unitLabel}</p>
          </div>
          <Button asChild size="sm" variant={available ? "default" : "outline"} className="relative z-10">
            <Link href={href}>{available ? "View" : "See dates"}</Link>
          </Button>
        </div>
      </div>
    </article>
  );
}
