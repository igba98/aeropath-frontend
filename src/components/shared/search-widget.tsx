"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { ArrowRight, ArrowRightLeft, CalendarDays, Car, MapPin, Minus, Plane, Plus, Search, Tent, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { addDays, today } from "@/lib/format";
import type { Vertical } from "@/lib/domain/types";

export const VERTICALS: Array<{ id: Vertical; label: string; icon: typeof Tent; path: string; blurb: string }> = [
  { id: "stay", label: "Hotels & Lodges", icon: Tent, path: "/stays", blurb: "Lodges, camps, beach resorts and city hotels" },
  { id: "flight", label: "Flights", icon: Plane, path: "/flights", blurb: "Domestic and regional flights" },
  { id: "tour", label: "Tours & Safari", icon: MapPin, path: "/tours", blurb: "Safaris, treks and day tours" },
  { id: "transfer", label: "Transfers & Car hire", icon: Car, path: "/transfers", blurb: "Airport transfers, road transfers and self drive" },
];

export interface SearchValues {
  vertical: Vertical;
  q: string;
  from: string;
  to: string;
  dateFrom: string;
  dateTo: string;
  adults: number;
  children: number;
  infants: number;
}

export function defaultSearchValues(vertical: Vertical = "stay"): SearchValues {
  return { vertical, q: "", from: "", to: "", dateFrom: addDays(today(), 14), dateTo: addDays(today(), 17), adults: 2, children: 0, infants: 0 };
}

export function searchValuesFromParams(params: URLSearchParams, vertical: Vertical): SearchValues {
  const d = defaultSearchValues(vertical);
  return {
    vertical,
    q: params.get("q") ?? "",
    from: params.get("from") ?? "",
    to: params.get("to") ?? "",
    dateFrom: params.get("dateFrom") ?? d.dateFrom,
    dateTo: params.get("dateTo") ?? d.dateTo,
    adults: Number(params.get("adults") ?? 2),
    children: Number(params.get("children") ?? 0),
    infants: Number(params.get("infants") ?? 0),
  };
}

export function searchQueryString(v: SearchValues, extra: Record<string, string | undefined> = {}) {
  const p = new URLSearchParams();
  if (v.q) p.set("q", v.q);
  if (v.from) p.set("from", v.from);
  if (v.to) p.set("to", v.to);
  p.set("dateFrom", v.dateFrom);
  p.set("dateTo", v.dateTo);
  p.set("adults", String(v.adults));
  if (v.children) p.set("children", String(v.children));
  if (v.infants) p.set("infants", String(v.infants));
  for (const [k, val] of Object.entries(extra)) if (val) p.set(k, val);
  return p.toString();
}

/**
 * One search card at three densities (tech spec §31.1): hero on the home page,
 * a compressed bar on results pages, a sidebar on product detail. Never forked.
 */
type SearchWidgetProps = { density?: "hero" | "bar" | "sidebar"; initial?: Partial<SearchValues>; className?: string; onSearch?: (v: SearchValues) => void;
  /** Renders the category tabs above the card, styled to sit on a photograph. */
  floatingTabs?: boolean };

/**
 * `useSearchParams` opts a component out of prerendering unless it sits inside a Suspense
 * boundary. The widget owns that boundary itself so every page that embeds it — home,
 * destination pages, results, product detail — stays statically prerenderable.
 */
export function SearchWidget(props: SearchWidgetProps) {
  return (
    <Suspense fallback={<SearchWidgetSkeleton density={props.density ?? "hero"} className={props.className} />}>
      <SearchWidgetInner {...props} />
    </Suspense>
  );
}

function SearchWidgetSkeleton({ density = "hero", className }: { density?: "hero" | "bar" | "sidebar"; className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "animate-pulse rounded-2xl bg-muted",
        density === "hero" ? "h-32 sm:h-24" : density === "bar" ? "h-16" : "h-64",
        className,
      )}
    />
  );
}

function SearchWidgetInner({ density = "hero", initial, className, onSearch, floatingTabs }: SearchWidgetProps) {
  const router = useRouter();
  const params = useSearchParams();
  const [values, setValues] = useState<SearchValues>({ ...defaultSearchValues(initial?.vertical ?? "stay"), ...initial });
  const set = <K extends keyof SearchValues>(k: K, v: SearchValues[K]) => setValues((s) => ({ ...s, [k]: v }));

  const vertical = VERTICALS.find((v) => v.id === values.vertical)!;
  const paxLabel = `${values.adults} adult${values.adults === 1 ? "" : "s"}${values.children ? `, ${values.children} child${values.children === 1 ? "" : "ren"}` : ""}${values.infants ? `, ${values.infants} infant${values.infants === 1 ? "" : "s"}` : ""}`;

  function submit() {
    if (onSearch) return onSearch(values);
    const keep = params.get("sort");
    router.push(`${vertical.path}?${searchQueryString(values, { sort: keep ?? undefined })}`);
  }

  const isRoute = values.vertical === "flight" || values.vertical === "transfer";
  const showDateTo = values.vertical === "stay" || values.vertical === "transfer";

  const tabs = density === "sidebar" ? null : (
    <div
      className={cn(
        "no-scrollbar flex gap-1 overflow-x-auto",
        floatingTabs ? "gap-2 pb-0" : density === "bar" ? "mb-2" : "mb-3",
      )}
      role="tablist"
      aria-label="Search category"
    >
      {VERTICALS.map((v) => {
        const Icon = v.icon;
        const active = v.id === values.vertical;
        return (
          <button
            key={v.id}
            role="tab"
            aria-selected={active}
            onClick={() => set("vertical", v.id)}
            className={cn(
              "inline-flex shrink-0 items-center gap-2 text-sm font-medium transition-colors",
              floatingTabs
                ? cn(
                    "rounded-t-xl px-4 py-2.5 backdrop-blur",
                    active
                      ? "bg-card text-brand-text shadow-[0_-2px_12px_rgba(0,0,0,0.06)]"
                      : "bg-white/25 text-white hover:bg-white/40",
                  )
                : cn(
                    "rounded-full px-3.5 py-2",
                    active ? "bg-brand-50 text-brand-text-strong ring-1 ring-brand-300" : "text-muted-foreground hover:bg-muted",
                  ),
            )}
          >
            <Icon className="size-4" aria-hidden />
            {density === "bar" ? v.label.split(" ")[0] : v.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div className={floatingTabs ? className : undefined}>
      {floatingTabs ? tabs : null}
    <div className={cn("border bg-card", floatingTabs ? "rounded-2xl rounded-tl-none p-3 shadow-xl shadow-brand-900/10 sm:p-4" : "rounded-2xl", !floatingTabs && (density === "hero" ? "p-3 shadow-lg shadow-brand-900/5 sm:p-4" : density === "bar" ? "p-2.5" : "p-3"), !floatingTabs && className)}>
      {!floatingTabs ? tabs : null}

      <div className={cn("grid gap-2", density === "sidebar" ? "grid-cols-1" : isRoute ? "sm:grid-cols-[1fr_1fr_auto_auto_auto]" : "sm:grid-cols-[1.4fr_auto_auto_auto]")}>
        {isRoute ? (
          <>
            <Field label="From" icon={MapPin} density={density}>
              <Input value={values.from} onChange={(e) => set("from", e.target.value)} placeholder={values.vertical === "flight" ? "Dar es Salaam (DAR)" : "Kilimanjaro Airport"} className="h-9 border-0 px-0 shadow-none focus-visible:ring-0" />
            </Field>
            <Field label="To" icon={ArrowRightLeft} density={density}>
              <Input value={values.to} onChange={(e) => set("to", e.target.value)} placeholder={values.vertical === "flight" ? "Zanzibar (ZNZ)" : "Arusha"} className="h-9 border-0 px-0 shadow-none focus-visible:ring-0" />
            </Field>
          </>
        ) : (
          <Field label={values.vertical === "tour" ? "Destination or experience" : "Where to?"} icon={MapPin} density={density}>
            <Input value={values.q} onChange={(e) => set("q", e.target.value)} placeholder={values.vertical === "tour" ? "Serengeti, Kilimanjaro, Zanzibar" : "Serengeti, Zanzibar, Arusha"} className="h-9 border-0 px-0 shadow-none focus-visible:ring-0" />
          </Field>
        )}

        <Field label={showDateTo ? "Dates" : values.vertical === "flight" ? "Departure" : "Date"} icon={CalendarDays} density={density}>
          <div className="flex items-center gap-1">
            <input type="date" value={values.dateFrom} min={today()} onChange={(e) => set("dateFrom", e.target.value)} className="h-9 w-full bg-transparent text-sm outline-none tabular-nums" aria-label="Start date" />
            {showDateTo ? (
              <>
                <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <input type="date" value={values.dateTo} min={values.dateFrom} onChange={(e) => set("dateTo", e.target.value)} className="h-9 w-full bg-transparent text-sm outline-none tabular-nums" aria-label="End date" />
              </>
            ) : null}
          </div>
        </Field>

        <Popover>
          <PopoverTrigger asChild>
            <button className={cn("flex min-w-0 flex-col items-start rounded-xl border bg-background px-3 py-1.5 text-left transition-colors hover:bg-muted", density === "sidebar" && "w-full")}>
              <span className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                <Users className="size-3" aria-hidden /> {values.vertical === "transfer" ? "Passengers" : "Guests"}
              </span>
              <span className="truncate text-sm">{paxLabel}</span>
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72">
            <div className="space-y-3">
              <Stepper label="Adults" hint="18 and over" value={values.adults} min={1} max={16} onChange={(n) => set("adults", n)} />
              <Stepper label="Children" hint="2 to 17" value={values.children} min={0} max={10} onChange={(n) => set("children", n)} />
              <Stepper label="Infants" hint="Under 2" value={values.infants} min={0} max={6} onChange={(n) => set("infants", n)} />
            </div>
          </PopoverContent>
        </Popover>

        <Button onClick={submit} size={density === "hero" ? "lg" : "default"} className={cn("gap-2", density === "sidebar" && "w-full")}>
          <Search className="size-4" aria-hidden />
          Search
        </Button>
      </div>
    </div>
    </div>
  );
}

function Field({ label, icon: Icon, children, density }: { label: string; icon: typeof MapPin; children: React.ReactNode; density: string }) {
  return (
    <div className={cn("flex min-w-0 flex-col rounded-xl border bg-background px-3 py-1.5", density === "sidebar" && "w-full")}>
      <Label className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3" aria-hidden /> {label}
      </Label>
      {children}
    </div>
  );
}

function Stepper({ label, hint, value, min, max, onChange }: { label: string; hint: string; value: number; min: number; max: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="icon-sm" onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`Fewer ${label}`}>
          <Minus className="size-3.5" />
        </Button>
        <span className="w-6 text-center text-sm tabular-nums">{value}</span>
        <Button variant="outline" size="icon-sm" onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`More ${label}`}>
          <Plus className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
