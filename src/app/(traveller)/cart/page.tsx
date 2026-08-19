"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Car, Lightbulb, ShoppingBag, Ticket } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CheckoutSteps } from "@/features/traveller/checkout-steps";
import { TripItemRow } from "@/features/traveller/trip-item-row";
import { useCart } from "@/features/traveller/use-cart";
import { PriceBreakdown } from "@/components/shared/price-breakdown";
import { EmptyState } from "@/components/shared/empty-state";
import { MoneyText } from "@/components/shared/money-text";
import { ProductImage } from "@/components/shared/product-image";
import { useStore } from "@/lib/store";
import { cart, catalog } from "@/lib/api";
import { addDays } from "@/lib/format";
import type { Product } from "@/lib/domain/types";

/** T10 · Trip cart. Multi item itinerary builder with a running total and cross-sell. */
export default function CartPage() {
  const router = useRouter();
  const { hydrated, booking, items, breakdown } = useCart();
  const data = useStore((st) => st);

  if (!hydrated) return <Shell><div className="h-40 animate-pulse rounded-xl bg-muted" /></Shell>;

  if (!booking || items.length === 0) {
    return (
      <Shell>
        <EmptyState
          icon={ShoppingBag}
          title="Your trip is empty"
          description="Search for a lodge, a safari, a flight or a transfer and add it here. We hold inventory the moment you add it."
          action={<Button asChild><Link href="/stays">Start with a lodge</Link></Button>}
        />
      </Shell>
    );
  }

  // Cross-sell: transfers and experiences near the first item's region
  const region = items[0]?.productSnapshot.region;
  const have = new Set(items.map((i) => i.productId));
  const suggestions = Object.values(data.products)
    .filter((p) => p.status === "live" && !have.has(p.id) && (p.vertical === "transfer" || p.vertical === "tour") && (p.location.region === region || p.location.city === items[0]?.productSnapshot.city))
    .slice(0, 3) as Product[];

  return (
    <Shell>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <div>
            <h1 className="font-display text-2xl">Your trip</h1>
            <p className="text-sm text-muted-foreground">
              {items.length} item{items.length === 1 ? "" : "s"} · reference <span className="font-mono">{booking.reference}</span>
              
            </p>
          </div>

          {items.map((item) => (
            <TripItemRow
              key={item.id}
              item={item}
              slug={data.products[item.productId]?.slug}
              onRemove={() => { cart.remove(item.id); toast.info("Removed from trip", { description: "The hold has been released." }); }}
            />
          ))}

          {suggestions.length ? (
            <section className="rounded-xl border border-dashed bg-muted/40 p-4">
              <p className="flex items-center gap-1.5 text-sm font-medium"><Lightbulb className="size-4 text-warning" aria-hidden /> Travellers usually add these</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {suggestions.map((p) => {
                  const plan = catalog.ratePlansFor(p.id, data)[0];
                  const path = p.vertical === "transfer" ? "/transfers" : "/tours";
                  return (
                    <Link key={p.id} href={`${path}/${p.slug}?dateFrom=${items[0].travelDateFrom}&dateTo=${addDays(items[0].travelDateFrom, 1)}&adults=${items[0].pax.adults}`} className="group overflow-hidden rounded-lg border bg-card transition-shadow hover:shadow-md">
                      <ProductImage slug={p.slug} alt="" className="h-20" />
                      <div className="p-2.5">
                        <p className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
                          {p.vertical === "transfer" ? <Car className="size-3" aria-hidden /> : <Ticket className="size-3" aria-hidden />} {p.vertical === "transfer" ? "Transfer" : "Experience"}
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-sm font-medium group-hover:text-brand-text">{p.title}</p>
                        {plan ? <MoneyText minor={p.priceFromMinor} currency={p.currency} convert size="sm" className="mt-1 block" /> : null}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          ) : null}
        </div>

        <aside>
          <div className="sticky top-20 space-y-3">
            <PriceBreakdown data={breakdown} title="Running total" />
            <Button className="w-full gap-2" size="lg" onClick={() => router.push("/travellers")}>
              Continue <ArrowRight className="size-4" aria-hidden />
            </Button>
            <p className="text-center text-[11px] text-muted-foreground">
              Inventory is held while you complete these steps. You will see the exact final price before paying.
            </p>
          </div>
        </aside>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-[1200px] px-4 py-6">
      <CheckoutSteps />
      {children}
    </div>
  );
}
