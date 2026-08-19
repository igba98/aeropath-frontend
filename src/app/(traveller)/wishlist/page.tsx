"use client";

import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Heart, Minus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { MoneyText } from "@/components/shared/money-text";
import { ProductImage } from "@/components/shared/product-image";
import { Pill } from "@/components/shared/status-chip";
import { useStore } from "@/lib/store";
import { wishlist } from "@/lib/api";
import { addDays, formatDate, today } from "@/lib/format";
import { pct } from "@/lib/domain/money";
import type { Vertical } from "@/lib/domain/types";

/** A stable empty array — returning a fresh `[]` from a selector re-renders forever. */
const EMPTY: never[] = [];

const PATH: Record<Vertical, string> = { stay: "/stays", flight: "/flights", tour: "/tours", transfer: "/transfers" };

/** T23 · Wishlist. Saved products with a price change indicator since the day you saved them. */
export default function WishlistPage() {
  const hydrated = useStore((s) => s.hydrated);
  const saved = useStore((s) => s.wishlists[s.session.userId ?? "guest"]) ?? EMPTY;
  const products = useStore((s) => s.products);

  if (!hydrated) return <Wrap><div className="h-40 animate-pulse rounded-xl bg-muted" /></Wrap>;

  const rows = saved.map((w) => ({ w, product: products[w.productId] })).filter((r) => r.product);
  const q = `dateFrom=${addDays(today(), 14)}&dateTo=${addDays(today(), 17)}&adults=2`;

  return (
    <Wrap>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Wishlist</h1>
          <p className="text-sm text-muted-foreground">
            {rows.length ? `${rows.length} saved · we track the price so you can see if it moved.` : "Save anything you like the look of and watch its price."}
          </p>
        </div>
        {rows.length ? <Button asChild variant="outline"><Link href="/stays">Keep browsing</Link></Button> : null}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={Heart}
          title="Nothing saved yet"
          description="Tap the heart on any lodge, safari, flight or transfer and it lands here with a price watch."
          action={<Button asChild><Link href="/stays">Browse lodges</Link></Button>}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map(({ w, product }) => {
            const now = product.priceFromMinor;
            const then = w.priceAtSaveMinor || now;
            const delta = now - then;
            const deltaPct = pct(Math.abs(delta), then);
            return (
              <article key={w.productId} className="group relative overflow-hidden rounded-2xl border bg-card transition-shadow hover:shadow-lg">
                <Link href={`${PATH[product.vertical]}/${product.slug}?${q}`}>
                  <ProductImage slug={product.slug} alt="" className="h-40" />
                </Link>
                <button
                  onClick={() => { wishlist.toggle(product.id); toast.info("Removed from wishlist"); }}
                  aria-label={`Remove ${product.title} from wishlist`}
                  className="absolute right-3 top-3 z-10 flex size-9 items-center justify-center rounded-full bg-white/90 text-neutral-700 shadow-sm backdrop-blur transition-colors hover:bg-white hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </button>
                <div className="p-4">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{product.location.region} · {product.vertical}</p>
                  <h2 className="mt-0.5 font-display text-lg leading-snug">
                    <Link href={`${PATH[product.vertical]}/${product.slug}?${q}`} className="after:absolute after:inset-0 hover:text-brand-text">{product.title}</Link>
                  </h2>
                  <div className="mt-2 flex items-end justify-between gap-2">
                    <div>
                      <MoneyText minor={now} currency={product.currency} convert size="md" />
                      <p className="text-[11px] text-muted-foreground">
                        {product.vertical === "stay" ? "per night, all in" : product.vertical === "transfer" ? "per vehicle, all in" : "per person, all in"}
                      </p>
                    </div>
                    {delta === 0 ? (
                      <Pill tone="neutral" icon={Minus}>No change</Pill>
                    ) : delta < 0 ? (
                      <Pill tone="success" icon={ArrowDownRight}>Down {deltaPct}%</Pill>
                    ) : (
                      <Pill tone="warning" icon={ArrowUpRight}>Up {deltaPct}%</Pill>
                    )}
                  </div>
                  <p className="mt-1.5 text-[11px] text-muted-foreground">Saved {formatDate(w.addedAt)}</p>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </Wrap>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-[1100px] px-4 py-6">{children}</div>;
}
