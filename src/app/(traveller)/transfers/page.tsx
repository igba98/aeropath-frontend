"use client";

import { Suspense } from "react";
import Link from "next/link";
import { Clock, Luggage, Route, Users } from "lucide-react";
import { ResultsShell } from "@/features/traveller/results-shell";
import { Button } from "@/components/ui/button";
import { MoneyText } from "@/components/shared/money-text";
import { ProductImage } from "@/components/shared/product-image";
import { Pill } from "@/components/shared/status-chip";
import { useStore } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";
import { catalog } from "@/lib/api";
import type { SearchHit } from "@/lib/api";

/** T05 · Search results, transfers. Route based, vehicle class cards. */
export default function TransfersPage() {
  return (
    <Suspense>
      <ResultsShell
        vertical="transfer"
        title="Transfers & car hire"
        subtitle="Per vehicle, all in — meet and greet included on airport routes"
        renderResults={(hits, query) => <div className="space-y-4">{hits.map((h) => <TransferCard key={h.product.id} hit={h} query={query} />)}</div>}
      />
    </Suspense>
  );
}

function TransferCard({ hit, query }: { hit: SearchHit; query: string }) {
  const p = hit.product;
  const plans = useStore(useShallow((s) => catalog.ratePlansFor(p.id, s)));
  const route = p.attributes.route as { from: string; to: string } | undefined;
  const classes = (p.attributes.vehicleClasses ?? []) as Array<{ id: string; name: string; pax: number; bags: number }>;
  const duration = Number(p.attributes.durationMinutes ?? 0);

  return (
    <article className="overflow-hidden rounded-2xl border bg-card">
      <div className="flex flex-col sm:flex-row">
        <ProductImage slug={p.slug} alt="" className="h-32 w-full shrink-0 sm:h-auto sm:w-48" />
        <div className="flex-1 p-4">
          <h3 className="font-display text-lg">{p.title}</h3>
          {route ? (
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Route className="size-3" aria-hidden /> {route.from} → {route.to}</span>
              {duration ? <span className="flex items-center gap-1"><Clock className="size-3" aria-hidden /> about {duration >= 60 ? `${Math.round(duration / 60)}h` : `${duration} min`}</span> : null}
              {p.instantConfirm ? <Pill tone="success" >Instant</Pill> : null}
            </p>
          ) : null}
          <p className="mt-2 text-sm text-muted-foreground">{p.description}</p>
        </div>
      </div>
      <div className="grid gap-px border-t bg-border sm:grid-cols-3">
        {plans.map((rp) => {
          const cls = classes.find((c) => rp.name.toLowerCase().includes(c.name.toLowerCase().split(" ")[0])) ?? classes[0];
          const allIn = Math.round(rp.baseMinor * 1.21);
          return (
            <div key={rp.id} className="flex flex-col bg-card p-4">
              <p className="font-medium">{rp.name}</p>
              {cls ? (
                <p className="mt-0.5 flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1"><Users className="size-3" aria-hidden /> {cls.pax}</span>
                  <span className="flex items-center gap-1"><Luggage className="size-3" aria-hidden /> {cls.bags}</span>
                </p>
              ) : null}
              <div className="mt-auto flex items-end justify-between gap-2 pt-3">
                <div>
                  <MoneyText minor={allIn} currency={rp.currency} convert size="md" />
                  <p className="text-[11px] text-muted-foreground">all in, per vehicle</p>
                </div>
                <Button asChild size="sm"><Link href={`/transfers/${p.slug}?${query}&rate=${rp.id}`}>Select</Link></Button>
              </div>
            </div>
          );
        })}
      </div>
    </article>
  );
}
