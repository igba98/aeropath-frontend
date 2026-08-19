"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Filter, Map as MapIcon, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchWidget, searchValuesFromParams, searchQueryString } from "@/components/shared/search-widget";
import { EmptyState } from "@/components/shared/empty-state";
import { ProductCard } from "./product-card";
import { useStore } from "@/lib/store";
import { catalog, type SearchHit } from "@/lib/api";
import { formatMoney } from "@/lib/domain/money";
import { cn } from "@/lib/utils";
import type { Vertical } from "@/lib/domain/types";

export interface FacetDef {
  key: string;
  label: string;
  options: Array<{ value: string; label: string; count?: number }>;
}

const SORTS = [
  { value: "recommended", label: "Recommended" },
  { value: "price_asc", label: "Price · low to high" },
  { value: "price_desc", label: "Price · high to low" },
  { value: "rating", label: "Guest rating" },
] as const;

/** Shared shell for T02–T05: search bar, filter rail, sort, results, map placeholder. */
export function ResultsShell({
  vertical, title, subtitle, renderResults, extraFilters, mapPanel,
}: {
  vertical: Vertical;
  title: string;
  subtitle: string;
  renderResults?: (hits: SearchHit[], query: string) => React.ReactNode;
  extraFilters?: (params: URLSearchParams, setParam: (k: string, v?: string) => void) => React.ReactNode;
  mapPanel?: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const data = useStore((s) => s);
  const hydrated = useStore((s) => s.hydrated);
  const [showMap, setShowMap] = useState(false);

  const values = searchValuesFromParams(new URLSearchParams(params.toString()), vertical);
  const sort = (params.get("sort") ?? "recommended") as (typeof SORTS)[number]["value"];

  function setParam(key: string, value?: string) {
    const next = new URLSearchParams(params.toString());
    if (value === undefined || value === "") next.delete(key);
    else next.set(key, value);
    router.replace(`?${next.toString()}`, { scroll: false });
  }

  function toggleMulti(key: string, value: string) {
    const current = (params.get(key) ?? "").split(",").filter(Boolean);
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    setParam(key, next.join(","));
  }

  const hits = useMemo(() => {
    if (!hydrated) return [];
    return catalog.search({
      vertical,
      q: values.q || undefined,
      from: values.from || undefined,
      to: values.to || undefined,
      dateFrom: values.dateFrom,
      dateTo: values.dateTo,
      adults: values.adults,
      children: values.children,
      infants: values.infants,
      sort,
      maxPrice: params.get("maxPrice") ? Number(params.get("maxPrice")) : undefined,
      freeCancellation: params.get("freeCancellation") === "1" || undefined,
      instantConfirm: params.get("instantConfirm") === "1" || undefined,
      stars: params.get("stars") ? params.get("stars")!.split(",").map(Number) : undefined,
      types: params.get("types") ? params.get("types")!.split(",") : undefined,
      amenities: params.get("amenities") ? params.get("amenities")!.split(",") : undefined,
      includeUnavailable: params.get("includeUnavailable") === "1",
    }, data);
  }, [hydrated, data, vertical, values.q, values.from, values.to, values.dateFrom, values.dateTo, values.adults, values.children, values.infants, sort, params]);

  const allForVertical = useMemo(
    () => (hydrated ? Object.values(data.products).filter((p) => p.vertical === vertical && p.status === "live") : []),
    [hydrated, data.products, vertical],
  );
  const priceCeiling = Math.max(...allForVertical.map((p) => p.priceFromMinor), 100_000);
  const propertyTypes = Array.from(new Set(allForVertical.map((p) => String(p.attributes.propertyType ?? "")).filter(Boolean)));
  const amenities = Array.from(new Set(allForVertical.flatMap((p) => p.amenities))).slice(0, 10);

  const activeFilters = ["maxPrice", "freeCancellation", "instantConfirm", "stars", "types", "amenities"].filter((k) => params.get(k));
  const query = searchQueryString(values);

  const filterRail = (
    <div className="space-y-5">
      <div>
        <p className="mb-2 text-sm font-medium">Max price {vertical === "stay" ? "per night" : vertical === "transfer" ? "per vehicle" : "per person"}</p>
        <input
          type="range"
          min={0}
          max={priceCeiling}
          step={Math.max(10_000, Math.round(priceCeiling / 40))}
          value={Number(params.get("maxPrice") ?? priceCeiling)}
          onChange={(e) => setParam("maxPrice", Number(e.target.value) >= priceCeiling ? undefined : e.target.value)}
          className="w-full accent-[var(--brand-500)]"
          aria-label="Maximum price"
        />
        <p className="mt-1 text-xs text-muted-foreground tabular-nums">
          up to {formatMoney(Number(params.get("maxPrice") ?? priceCeiling), "TZS")}
        </p>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium">Booking options</legend>
        <div className="space-y-2">
          <FilterCheck id="freeCancellation" label="Free cancellation" checked={params.get("freeCancellation") === "1"} onChange={(c) => setParam("freeCancellation", c ? "1" : undefined)} />
          <FilterCheck id="instantConfirm" label="Instant confirmation" checked={params.get("instantConfirm") === "1"} onChange={(c) => setParam("instantConfirm", c ? "1" : undefined)} />
          <FilterCheck id="includeUnavailable" label="Show sold out too" checked={params.get("includeUnavailable") === "1"} onChange={(c) => setParam("includeUnavailable", c ? "1" : undefined)} />
        </div>
      </fieldset>

      {vertical === "stay" ? (
        <>
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Star rating</legend>
            <div className="space-y-2">
              {[5, 4, 3].map((n) => (
                <FilterCheck key={n} id={`star-${n}`} label={`${n} star`} checked={(params.get("stars") ?? "").split(",").includes(String(n))} onChange={() => toggleMulti("stars", String(n))} />
              ))}
            </div>
          </fieldset>
          {propertyTypes.length ? (
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Property type</legend>
              <div className="space-y-2">
                {propertyTypes.map((t) => (
                  <FilterCheck key={t} id={`type-${t}`} label={t} checked={(params.get("types") ?? "").split(",").includes(t)} onChange={() => toggleMulti("types", t)} />
                ))}
              </div>
            </fieldset>
          ) : null}
          <fieldset>
            <legend className="mb-2 text-sm font-medium">Amenities</legend>
            <div className="space-y-2">
              {amenities.map((a) => (
                <FilterCheck key={a} id={`am-${a}`} label={a} checked={(params.get("amenities") ?? "").split(",").includes(a)} onChange={() => toggleMulti("amenities", a)} />
              ))}
            </div>
          </fieldset>
        </>
      ) : null}

      {extraFilters?.(new URLSearchParams(params.toString()), setParam)}

      {activeFilters.length ? (
        <Button variant="outline" size="sm" className="w-full gap-1.5" onClick={() => router.replace(`?${query}`, { scroll: false })}>
          <X className="size-3.5" aria-hidden /> Clear {activeFilters.length} filter{activeFilters.length === 1 ? "" : "s"}
        </Button>
      ) : null}
    </div>
  );

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-5">
      <SearchWidget density="bar" initial={values} className="mb-5" />

      <div className="flex flex-wrap items-baseline justify-between gap-3 pb-4">
        <div>
          <h1 className="font-display text-2xl">{title}</h1>
          <p className="text-sm text-muted-foreground">
            {hydrated ? `${hits.length} result${hits.length === 1 ? "" : "s"} · ${subtitle}` : subtitle}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {mapPanel ? (
            <Button variant="outline" size="sm" className="gap-1.5 lg:hidden" onClick={() => setShowMap((m) => !m)}>
              <MapIcon className="size-4" aria-hidden /> {showMap ? "List" : "Map"}
            </Button>
          ) : null}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5 lg:hidden">
                <SlidersHorizontal className="size-4" aria-hidden /> Filters{activeFilters.length ? ` (${activeFilters.length})` : ""}
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-80 overflow-y-auto">
              <SheetHeader><SheetTitle>Filters</SheetTitle></SheetHeader>
              <div className="p-4">{filterRail}</div>
            </SheetContent>
          </Sheet>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Sort</span>
            <select
              value={sort}
              onChange={(e) => setParam("sort", e.target.value)}
              className="h-9 rounded-lg border bg-background px-2 text-sm"
              aria-label="Sort results"
            >
              {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className={cn("gap-6", mapPanel ? "lg:grid lg:grid-cols-[240px_1fr_340px]" : "lg:grid lg:grid-cols-[240px_1fr]")}>
        <aside className="hidden lg:block">
          <div className="sticky top-20 rounded-xl border bg-card p-4">
            <p className="mb-4 flex items-center gap-1.5 text-sm font-semibold"><Filter className="size-4" aria-hidden /> Filters</p>
            {filterRail}
          </div>
        </aside>

        <div className={cn("min-w-0", showMap && "hidden lg:block")}>
          {!hydrated ? (
            <div className="space-y-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-44 w-full rounded-2xl" />)}</div>
          ) : hits.length === 0 ? (
            <EmptyState
              title="Nothing matches those filters"
              description="Try widening the dates, raising the price ceiling, or clearing a filter or two."
              action={<Button variant="outline" onClick={() => router.replace(`?${query}`, { scroll: false })}>Clear filters</Button>}
            />
          ) : renderResults ? (
            renderResults(hits, query)
          ) : (
            <div className="space-y-4">{hits.map((h) => <ProductCard key={h.product.id} hit={h} query={query} />)}</div>
          )}
        </div>

        {mapPanel ? (
          <aside className={cn("lg:block", showMap ? "block" : "hidden")}>
            <div className="sticky top-20 overflow-hidden rounded-xl border">
              <MapPanel hits={hits} />
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  );
}

function FilterCheck({ id, label, checked, onChange }: { id: string; label: string; checked: boolean; onChange: (c: boolean) => void }) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox id={id} checked={checked} onCheckedChange={(c) => onChange(Boolean(c))} />
      <Label htmlFor={id} className="text-sm font-normal">{label}</Label>
    </div>
  );
}

/** Schematic map: real coordinates plotted on a stylised plate. No tile provider needed in the prototype. */
function MapPanel({ hits }: { hits: SearchHit[] }) {
  if (!hits.length) return <div className="h-[420px] bg-muted" />;
  const lats = hits.map((h) => h.product.location.lat);
  const lngs = hits.map((h) => h.product.location.lng);
  const minLat = Math.min(...lats) - 0.6, maxLat = Math.max(...lats) + 0.6;
  const minLng = Math.min(...lngs) - 0.6, maxLng = Math.max(...lngs) + 0.6;
  const x = (lng: number) => ((lng - minLng) / (maxLng - minLng || 1)) * 100;
  const y = (lat: number) => (1 - (lat - minLat) / (maxLat - minLat || 1)) * 100;

  return (
    <div className="relative h-[420px] bg-gradient-to-br from-brand-100 via-brand-50 to-emerald-50">
      <div className="absolute inset-0 opacity-40" style={{ backgroundImage: "linear-gradient(var(--brand-200) 1px, transparent 1px), linear-gradient(90deg, var(--brand-200) 1px, transparent 1px)", backgroundSize: "28px 28px" }} aria-hidden />
      {hits.slice(0, 14).map((h) => (
        <span
          key={h.product.id}
          className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-brand-300 bg-white px-2 py-1 text-[11px] font-semibold tabular-nums shadow-sm"
          style={{ left: `${x(h.product.location.lng)}%`, top: `${y(h.product.location.lat)}%` }}
          title={h.product.title}
        >
          {formatMoney(h.unitMinor, h.product.currency, { showCurrency: false, compact: true })}
        </span>
      ))}
      <p className="absolute bottom-2 left-2 rounded bg-white/85 px-2 py-1 text-[10px] text-muted-foreground">
        Schematic map · real coordinates, no tile provider in the prototype
      </p>
    </div>
  );
}
