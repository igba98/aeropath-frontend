"use client";

import * as React from "react";
import { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, CalendarSearch, Pencil, PlaneTakeoff, SlidersHorizontal } from "lucide-react";

import type { ISODate } from "@/domain/types";
import { adultTotal, findOffer, leadFare, searchFlights, type FlightOffer, type FlightSearch } from "@/providers/inventory/flights";
import { addDaysIso, diffDaysIso } from "@/providers/util/dates";
import { cityOf } from "@/store/seed/reference";
import { fmtWeekday, splitLocal } from "@/lib/dates";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { EmptyState, PageHeader, QuickTabs } from "@/components/shared/page";
import { Amount } from "@/components/shared/amount";
import { FlightSearchForm } from "@/components/book/search-form";
import { FlightCard, type OfferTag } from "@/components/book/flight-card";
import { FlightDetailsSheet } from "@/components/book/flight-details";
import { fmtDuration, useAirlineName } from "@/components/book/bits";
import { Steps } from "@/components/book/steps";
import { flightQs, paxLabel, paxOf } from "@/components/book/query";
import { useBookCtx, useFlightQuery } from "@/components/book/use-book";

export default function FlightResultsPage() {
  return (
    <Suspense>
      <FlightResults />
    </Suspense>
  );
}

type Sort = "best" | "cheapest" | "fastest" | "earliest";
type TimeBand = "morning" | "afternoon" | "evening" | "night";
const BANDS: { id: TimeBand; label: string; hint: string; test: (h: number) => boolean }[] = [
  { id: "morning", label: "Morning", hint: "05:00–11:59", test: (h) => h >= 5 && h < 12 },
  { id: "afternoon", label: "Afternoon", hint: "12:00–17:59", test: (h) => h >= 12 && h < 18 },
  { id: "evening", label: "Evening", hint: "18:00–23:59", test: (h) => h >= 18 },
  { id: "night", label: "Night", hint: "00:00–04:59", test: (h) => h < 5 },
];

interface Filters {
  stops: Set<number>;
  airlines: Set<string>;
  bands: Set<TimeBand>;
}
const noFilters = (): Filters => ({ stops: new Set(), airlines: new Set(), bands: new Set() });

function FlightResults() {
  const router = useRouter();
  const sp = useSearchParams();
  const { q, qs } = useFlightQuery();
  const { today, fx } = useBookCtx();
  const airline = useAirlineName();
  const ctx = React.useMemo(() => ({ today, fx }), [today, fx]);

  const leg: "out" | "return" = sp.get("leg") === "return" && q.ret ? "return" : "out";
  const outId = sp.get("out");
  const outFareId = sp.get("outFare");
  const base = { adults: q.adults, children: q.children, infants: q.infants, cabin: q.cabin };
  const outSearch: FlightSearch = { ...base, from: q.from, to: q.to, date: q.depart };
  const search: FlightSearch = leg === "out" ? outSearch : { ...base, from: q.to, to: q.from, date: q.ret! };
  const minDate: ISODate = leg === "out" ? today : q.depart;

  const offers = React.useMemo(() => (q.to ? searchFlights(search, ctx) : []), [q.to, search.from, search.to, search.date, search.adults, search.children, search.infants, search.cabin, ctx]); // eslint-disable-line react-hooks/exhaustive-deps
  const outbound = React.useMemo(() => (leg === "return" && outId ? findOffer(outSearch, outId, ctx) : undefined), [leg, outId, qs, ctx]); // eslint-disable-line react-hooks/exhaustive-deps

  const [editing, setEditing] = React.useState(!q.to);
  const [sort, setSort] = React.useState<Sort>("best");
  const [filters, setFilters] = React.useState<Filters>(noFilters);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = React.useState(false);

  const priced = offers.map((o) => ({ o, f: leadFare(o, q.cabin) })).filter((x): x is { o: FlightOffer; f: NonNullable<typeof x.f> } => Boolean(x.f));
  const visible = priced.filter(({ o }) => {
    if (filters.stops.size && !filters.stops.has(Math.min(o.stops, 1))) return false;
    if (filters.airlines.size && !filters.airlines.has(o.carrier)) return false;
    if (filters.bands.size) {
      const h = Number(o.departureLocal.slice(11, 13));
      if (!BANDS.some((b) => filters.bands.has(b.id) && b.test(h))) return false;
    }
    return true;
  });

  // Tags across everything shown, and a "best" score that weighs price and time together.
  const minPrice = Math.min(...visible.map((x) => adultTotal(x.f)));
  const maxPrice = Math.max(...visible.map((x) => adultTotal(x.f)));
  const minDur = Math.min(...visible.map((x) => x.o.durationMin));
  const maxDur = Math.max(...visible.map((x) => x.o.durationMin));
  const score = (x: (typeof visible)[number]) => (adultTotal(x.f) - minPrice) / Math.max(1, maxPrice - minPrice) + (0.8 * (x.o.durationMin - minDur)) / Math.max(1, maxDur - minDur);
  const bestId = [...visible].sort((a, b) => score(a) - score(b))[0]?.o.id;
  const cheapestId = visible.find((x) => adultTotal(x.f) === minPrice)?.o.id;
  const fastestId = visible.find((x) => x.o.durationMin === minDur)?.o.id;
  const sorted = [...visible].sort((a, b) => {
    if (sort === "cheapest") return adultTotal(a.f) - adultTotal(b.f);
    if (sort === "fastest") return a.o.durationMin - b.o.durationMin;
    if (sort === "earliest") return a.o.departureLocal.localeCompare(b.o.departureLocal);
    return score(a) - score(b);
  });
  const tagsFor = (id: string): OfferTag[] => [...(id === bestId && visible.length > 2 ? ["best" as const] : []), ...(id === cheapestId ? ["cheapest" as const] : []), ...(id === fastestId && visible.length > 1 ? ["fastest" as const] : [])];

  // Cheapest fare on the days around the chosen date.
  const days = React.useMemo(() => {
    if (!q.to) return [];
    const start = diffDaysIso(search.date, minDate) < 3 ? minDate : addDaysIso(search.date, -3);
    return Array.from({ length: 7 }, (_, i) => addDaysIso(start, i)).map((date) => {
      const res = searchFlights({ ...search, date }, ctx);
      const prices = res.map((o) => leadFare(o, q.cabin)).filter(Boolean).map((f) => adultTotal(f!));
      return { date, price: prices.length ? Math.min(...prices) : null, currency: res[0]?.currency ?? "USD" };
    });
  }, [q.to, search.from, search.to, search.date, minDate, ctx, q.cabin]); // eslint-disable-line react-hooks/exhaustive-deps

  const setDate = (d: ISODate) => {
    const next = leg === "out" ? { ...q, depart: d, ret: q.ret && diffDaysIso(q.ret, d) < 0 ? d : q.ret } : { ...q, ret: d };
    router.replace(`/book/flights?${flightQs(next, { leg: leg === "return" ? "return" : undefined, out: outId, outFare: outFareId })}`, { scroll: false });
  };

  const openOffer = openId ? offers.find((o) => o.id === openId) ?? null : null;
  const choose = (o: FlightOffer, fareId: string) => {
    if (leg === "out" && q.ret) router.push(`/book/flights?${flightQs(q, { leg: "return", out: o.id, outFare: fareId })}`);
    else if (leg === "return") router.push(`/book/flights/checkout?${flightQs(q, { out: outId, outFare: outFareId, ret: o.id, retFare: fareId })}`);
    else router.push(`/book/flights/checkout?${flightQs(q, { out: o.id, outFare: fareId })}`);
  };

  const carriers = [...new Set(priced.map((x) => x.o.carrier))].map((c) => ({ c, from: Math.min(...priced.filter((x) => x.o.carrier === c).map((x) => adultTotal(x.f))), n: priced.filter((x) => x.o.carrier === c).length }));
  const activeFilters = filters.stops.size + filters.airlines.size + filters.bands.size;
  const toggle = <K extends keyof Filters>(k: K, v: Filters[K] extends Set<infer T> ? T : never) =>
    setFilters((f) => {
      const s = new Set(f[k] as Set<unknown>);
      if (s.has(v)) s.delete(v);
      else s.add(v);
      return { ...f, [k]: s };
    });

  const filterPanel = (
    <div className="space-y-6">
      <FilterGroup title="Stops">
        {[0, 1].map((n) => {
          const count = priced.filter((x) => Math.min(x.o.stops, 1) === n).length;
          return <FilterRow key={n} label={n ? "1 stop" : "Nonstop"} hint={`${count}`} checked={filters.stops.has(n)} disabled={!count} onChange={() => toggle("stops", n)} />;
        })}
      </FilterGroup>
      <FilterGroup title="Airlines">
        {carriers.map(({ c, from, n }) => (
          <FilterRow
            key={c}
            label={airline(c)}
            hint={<Amount value={{ amountMinor: from, currency: priced[0]?.o.currency ?? "USD" }} className="text-xs text-ink-3" />}
            checked={filters.airlines.has(c)}
            onChange={() => toggle("airlines", c)}
            aria={`${airline(c)}, ${n} flights`}
          />
        ))}
      </FilterGroup>
      <FilterGroup title="Departure time">
        {BANDS.map((b) => (
          <FilterRow key={b.id} label={b.label} hint={b.hint} checked={filters.bands.has(b.id)} onChange={() => toggle("bands", b.id)} />
        ))}
      </FilterGroup>
      {activeFilters > 0 && (
        <Button variant="ghost" size="sm" onClick={() => setFilters(noFilters())} className="-ml-2">
          Clear filters
        </Button>
      )}
    </div>
  );

  const title = q.to ? `${cityOf(search.from)} to ${cityOf(search.to)}` : "Search flights";

  return (
    <>
      <PageHeader
        back={{ href: "/book", label: "Search and book" }}
        title={title}
        meta={
          q.to ? <span>{[fmtWeekday(search.date), paxLabel(q), q.cabin === "business" ? "Business" : "Economy", q.ret ? `return ${fmtWeekday(q.ret)}` : "one way"].join(" · ")}</span> : undefined
        }
        actions={
          q.to && (
            <Button variant="outline" onClick={() => setEditing((e) => !e)} aria-expanded={editing}>
              <Pencil /> {editing ? "Close" : "Change search"}
            </Button>
          )
        }
      />

      {editing && (
        <Card className="mb-6 block p-4 sm:p-5">
          <FlightSearchForm key={qs} initial={q} today={today} onSearched={() => setEditing(false)} />
        </Card>
      )}

      {q.to && (
        <>
          <Steps className="mb-5" steps={q.ret ? ["Departure flight", "Return flight", "Travellers and booking"] : ["Choose a flight", "Travellers and booking"]} current={leg === "out" ? 1 : 2} />

          {leg === "return" && outbound && (
            <div className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-[var(--st-green-bd)] bg-[var(--st-green-bg)] px-4 py-3 text-sm">
              <PlaneTakeoff className="size-4 text-[var(--st-green-fg)]" />
              <span className="font-semibold text-ink">Departure chosen:</span>
              <span className="text-ink-2">
                {airline(outbound.carrier)} · {fmtWeekday(outbound.departureLocal.slice(0, 10))} · {splitLocal(outbound.departureLocal).time} → {splitLocal(outbound.arrivalLocal).time} · {fmtDuration(outbound.durationMin)}
              </span>
              <Link href={`/book/flights?${flightQs(q)}`} className="ml-auto font-semibold text-brand-700 hover:underline dark:text-brand-300">
                Change
              </Link>
            </div>
          )}

          <nav aria-label="Nearby dates" className="no-scrollbar -mx-4 mb-6 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <ul className="grid min-w-[640px] grid-cols-7 gap-2">
              {days.map((d) => {
                const on = d.date === search.date;
                const cheapest = d.price !== null && d.price === Math.min(...days.filter((x) => x.price !== null).map((x) => x.price!));
                return (
                  <li key={d.date}>
                    <button
                      type="button"
                      onClick={() => setDate(d.date)}
                      aria-current={on ? "date" : undefined}
                      className={cn(
                        "flex w-full flex-col items-center rounded-xl border px-2 py-2.5 text-center transition-colors",
                        on ? "border-brand-500 bg-band ring-1 ring-brand-500" : "border-rule bg-paper hover:border-brand-300",
                      )}
                    >
                      <span className={cn("text-xs font-semibold", on ? "text-brand-700 dark:text-brand-200" : "text-ink-3")}>{fmtWeekday(d.date)}</span>
                      {d.price !== null ? (
                        <Amount value={{ amountMinor: d.price, currency: d.currency }} className={cn("mt-0.5 text-[13px] font-semibold", cheapest ? "text-[var(--st-green-fg)]" : "text-ink")} codeClassName="hidden" />
                      ) : (
                        <span className="mt-0.5 text-[13px] text-ink-4">No flights</span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[250px_minmax(0,1fr)]">
            <aside className="hidden lg:block">
              <div className="sticky top-20">{filterPanel}</div>
            </aside>

            <div className="min-w-0">
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <p className="mr-auto text-[15px] text-ink-2">
                  <span className="font-semibold text-ink">{sorted.length}</span> of {priced.length} flights
                </p>
                <QuickTabs<Sort>
                  value={sort}
                  onChange={setSort}
                  controls="flight-results"
                  options={[
                    { value: "best", label: "Best" },
                    { value: "cheapest", label: "Cheapest" },
                    { value: "fastest", label: "Fastest" },
                    { value: "earliest", label: "Earliest" },
                  ]}
                />
                <Button variant="outline" size="sm" className="lg:hidden" onClick={() => setFiltersOpen(true)}>
                  <SlidersHorizontal /> Filters
                  {activeFilters > 0 && <span className="tnum rounded-full bg-primary px-1.5 text-[11px] leading-5 text-primary-foreground">{activeFilters}</span>}
                </Button>
              </div>

              {sorted.length ? (
                <ul id="flight-results" className="grid grid-cols-1 gap-4 2xl:grid-cols-2">
                  {sorted.map(({ o, f }) => (
                    <li key={o.id}>
                      <FlightCard
                        offer={o}
                        fare={f}
                        pax={paxOf(q)}
                        tags={tagsFor(o.id)}
                        onOpen={() => {
                          setOpenId(o.id);
                          setSheetOpen(true);
                        }}
                      />
                    </li>
                  ))}
                </ul>
              ) : (
                <Card className="block">
                  <EmptyState
                    icon={CalendarSearch}
                    title={priced.length ? "No flights match these filters" : `No flights on ${fmtWeekday(search.date)}`}
                    body={priced.length ? "Clear a filter to see more flights." : "Pick another day above; the cheapest days are shown in green."}
                    action={
                      priced.length ? (
                        <Button variant="outline" onClick={() => setFilters(noFilters())}>
                          Clear filters
                        </Button>
                      ) : undefined
                    }
                  />
                </Card>
              )}
            </div>
          </div>
        </>
      )}

      {!q.to && !editing && (
        <Card className="block">
          <EmptyState
            icon={PlaneTakeoff}
            title="Where is the flight going?"
            body="Choose the destination to see flights."
            action={
              <Button onClick={() => setEditing(true)}>
                Search flights <ArrowRight />
              </Button>
            }
          />
        </Card>
      )}

      <FlightDetailsSheet
        offer={openOffer}
        open={sheetOpen && Boolean(openOffer)}
        onOpenChange={setSheetOpen}
        pax={paxOf(q)}
        cabin={q.cabin}
        cta={leg === "out" && q.ret ? "Choose return flight" : "Continue to travellers"}
        onChoose={(f) => openOffer && choose(openOffer, f.id)}
      />

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
          </SheetHeader>
          <SheetBody>{filterPanel}</SheetBody>
          <SheetFooter>
            <Button onClick={() => setFiltersOpen(false)}>
              Show {sorted.length} flight{sorted.length === 1 ? "" : "s"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-2 text-[13px] font-semibold text-ink-3">{title}</legend>
      <div className="space-y-0.5">{children}</div>
    </fieldset>
  );
}

function FilterRow({ label, hint, checked, onChange, disabled, aria }: { label: React.ReactNode; hint?: React.ReactNode; checked: boolean; onChange: () => void; disabled?: boolean; aria?: string }) {
  const id = React.useId();
  return (
    <label htmlFor={id} className={cn("flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-canvas-2", disabled && "cursor-not-allowed opacity-50")}>
      <Checkbox id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} aria-label={aria} />
      <span className="min-w-0 flex-1 font-medium text-ink">{label}</span>
      {hint && <span className="shrink-0 text-xs text-ink-3">{hint}</span>}
    </label>
  );
}
