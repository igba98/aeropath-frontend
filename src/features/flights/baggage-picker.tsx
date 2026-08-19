"use client";

import { Briefcase, Check, Luggage, Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { MoneyText } from "@/components/shared/money-text";
import { bagOffers } from "@/lib/domain/ancillaries";
import type { BagSelection } from "@/lib/domain/types";

/**
 * Baggage, chosen per passenger.
 *
 * Cabin allowance is a single choice — you either bring the free personal item or pay for the
 * bigger one. Checked bags are quantities, because people genuinely buy two.
 */
export function BaggagePicker({
  cabin = "economy",
  travellers,
  activeTraveller,
  onActiveTravellerChange,
  selections,
  onChange,
  applyToAll,
  onApplyToAllChange,
}: {
  cabin?: "economy" | "business";
  travellers: Array<{ label: string }>;
  activeTraveller: number;
  onActiveTravellerChange: (i: number) => void;
  selections: BagSelection[];
  onChange: (next: BagSelection[]) => void;
  applyToAll: boolean;
  onApplyToAllChange: (v: boolean) => void;
}) {
  const offers = bagOffers(cabin);
  const cabinBags = offers.filter((o) => o.kind === "cabin");
  const checked = offers.filter((o) => o.kind === "checked");

  const qty = (offerId: string) =>
    selections.find((s) => s.travellerIndex === activeTraveller && s.offerId === offerId)?.quantity ?? 0;

  function setQty(offerId: string, quantity: number) {
    const targets = applyToAll ? travellers.map((_, i) => i) : [activeTraveller];
    let next = [...selections];
    for (const t of targets) {
      next = next.filter((s) => !(s.travellerIndex === t && s.offerId === offerId));
      if (quantity > 0) next.push({ travellerIndex: t, offerId, quantity });
    }
    onChange(next);
  }

  /** Cabin allowance is exclusive: choosing one clears the other. */
  function chooseCabin(offerId: string) {
    const targets = applyToAll ? travellers.map((_, i) => i) : [activeTraveller];
    let next = [...selections];
    for (const t of targets) {
      next = next.filter((s) => !(s.travellerIndex === t && cabinBags.some((o) => o.id === s.offerId)));
      next.push({ travellerIndex: t, offerId, quantity: 1 });
    }
    onChange(next);
  }

  const chosenCabin = cabinBags.find((o) => qty(o.id) > 0)?.id ?? cabinBags[0].id;

  return (
    <div className="space-y-6">
      {travellers.length > 1 ? (
        <div className="inline-flex rounded-full bg-muted p-1">
          {travellers.map((t, i) => (
            <button
              key={i}
              onClick={() => onActiveTravellerChange(i)}
              aria-pressed={i === activeTraveller}
              className={cn(
                "rounded-full px-4 py-2 text-sm transition-colors",
                i === activeTraveller ? "bg-brand-500 font-medium text-white" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      ) : null}

      <section>
        <h3 className="font-display text-xl">Cabin bag</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">Applies to the selected passenger on every flight in this trip.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {cabinBags.map((o) => {
            const active = chosenCabin === o.id;
            return (
              <button
                key={o.id}
                onClick={() => chooseCabin(o.id)}
                aria-pressed={active}
                className={cn(
                  "rounded-xl border p-4 text-left transition-colors",
                  active ? "border-brand-500 bg-brand-50/60" : "bg-card hover:border-brand-300",
                )}
              >
                <span className="flex items-start justify-between gap-3">
                  <span>
                    <span className="block font-medium">{o.label}</span>
                    <span className="mt-1 flex items-center gap-2 text-sm">
                      <Briefcase className="size-4 text-brand-text" aria-hidden />
                      <span className="font-medium">{o.weightKg} kg</span>
                      <span className="text-muted-foreground">{o.dimensions}</span>
                    </span>
                  </span>
                  {active ? <Check className="size-5 shrink-0 text-brand-500" aria-hidden /> : null}
                </span>
                <span className="mt-3 block border-t pt-2.5">
                  {o.priceMinor === 0
                    ? <span className="font-medium text-success-foreground">Included</span>
                    : <MoneyText minor={o.priceMinor} currency="TZS" size="sm" />}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <h3 className="font-display text-xl">Checked bag</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">Priced per bag, per passenger, for the whole trip.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {checked.map((o) => {
            const n = qty(o.id);
            return (
              <div key={o.id} className={cn("rounded-xl border p-4", n > 0 ? "border-brand-500 bg-brand-50/60" : "bg-card")}>
                <p className="flex items-center gap-2">
                  <Luggage className="size-4 text-brand-text" aria-hidden />
                  <span className="font-medium">{o.weightKg} kg</span>
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">{o.dimensions}</p>
                <div className="mt-3 flex items-center justify-between border-t pt-2.5">
                  {o.priceMinor === 0
                    ? <span className="text-sm font-medium text-success-foreground">Included</span>
                    : <MoneyText minor={o.priceMinor} currency="TZS" size="sm" />}
                  <span className="flex items-center gap-1.5">
                    <Button variant="outline" size="icon-sm" aria-label={`One fewer ${o.weightKg} kg bag`} disabled={n === 0} onClick={() => setQty(o.id, n - 1)}>
                      <Minus className="size-3.5" />
                    </Button>
                    <span className="w-5 text-center text-sm tabular-nums">{n}</span>
                    <Button variant="outline" size="icon-sm" aria-label={`One more ${o.weightKg} kg bag`} disabled={n >= 3} onClick={() => setQty(o.id, n + 1)}>
                      <Plus className="size-3.5" />
                    </Button>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {travellers.length > 1 ? (
        <label className="flex items-center gap-2.5">
          <Checkbox checked={applyToAll} onCheckedChange={(v) => onApplyToAllChange(Boolean(v))} />
          <span className="text-sm">Apply this baggage to every passenger</span>
        </label>
      ) : null}
    </div>
  );
}

/** Total price of a baggage selection, for the fare summary. */
export function bagsTotalMinor(selections: BagSelection[], cabin: "economy" | "business" = "economy"): number {
  const offers = bagOffers(cabin);
  return selections.reduce((sum, s) => {
    const o = offers.find((x) => x.id === s.offerId);
    return sum + (o ? o.priceMinor * s.quantity : 0);
  }, 0);
}
