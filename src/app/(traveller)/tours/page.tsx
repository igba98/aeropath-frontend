"use client";

import { Suspense } from "react";
import { ResultsShell } from "@/features/traveller/results-shell";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ProductCard } from "@/features/traveller/product-card";

const DURATIONS = [
  { value: "1", label: "Day tours" },
  { value: "2-4", label: "2 to 4 days" },
  { value: "5-8", label: "5 to 8 days" },
  { value: "9", label: "9 days or more" },
];

/** T04 · Search results, tours. Duration filter and departure availability. */
export default function ToursPage() {
  return (
    <Suspense>
      <ResultsShell
        vertical="tour"
        title="Tours & safari"
        subtitle="Per person, all in, park fees included where stated"
        extraFilters={(params, setParam) => {
          const current = params.get("duration") ?? "";
          return (
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Duration</legend>
              <div className="space-y-2">
                {DURATIONS.map((d) => (
                  <div key={d.value} className="flex items-center gap-2">
                    <Checkbox id={`dur-${d.value}`} checked={current === d.value} onCheckedChange={(c) => setParam("duration", c ? d.value : undefined)} />
                    <Label htmlFor={`dur-${d.value}`} className="text-sm font-normal">{d.label}</Label>
                  </div>
                ))}
              </div>
            </fieldset>
          );
        }}
        renderResults={(hits, query) => {
          const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
          const duration = params.get("duration");
          const filtered = hits.filter((h) => {
            if (!duration) return true;
            const days = Number(h.product.attributes.durationDays ?? 1);
            if (duration === "1") return days === 1;
            if (duration === "2-4") return days >= 2 && days <= 4;
            if (duration === "5-8") return days >= 5 && days <= 8;
            return days >= 9;
          });
          return <div className="space-y-4">{filtered.map((h) => <ProductCard key={h.product.id} hit={h} query={query} />)}</div>;
        }}
      />
    </Suspense>
  );
}
