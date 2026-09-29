"use client";

import * as React from "react";
import { Suspense } from "react";
import { BedDouble, Pencil, SlidersHorizontal } from "lucide-react";

import type { Board } from "@/domain/types";
import { BOARD_LABEL, findDestination, searchHotels } from "@/providers/inventory/hotels";
import { fmtWeekday } from "@/lib/dates";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { EmptyState, PageHeader, QuickTabs } from "@/components/shared/page";
import { HotelSearchForm } from "@/components/book/search-form";
import { HotelCard } from "@/components/book/hotel-card";
import { Steps } from "@/components/book/steps";
import { guestsLabel, nightsBetween } from "@/components/book/query";
import { useBookCtx, useHotelQuery } from "@/components/book/use-book";

export default function HotelResultsPage() {
  return (
    <Suspense>
      <HotelResults />
    </Suspense>
  );
}

type Sort = "recommended" | "price" | "rating";

function HotelResults() {
  const { q, qs } = useHotelQuery();
  const { today } = useBookCtx();
  const dest = findDestination(q.dest);
  const nights = nightsBetween(q.checkIn, q.checkOut);
  const search = { destination: q.dest, checkIn: q.checkIn, checkOut: q.checkOut, adults: q.adults, children: q.children, rooms: q.rooms };
  const results = React.useMemo(() => (q.dest ? searchHotels(search, today) : []), [qs, today]); // eslint-disable-line react-hooks/exhaustive-deps

  const [editing, setEditing] = React.useState(!q.dest);
  const [sort, setSort] = React.useState<Sort>("recommended");
  const [stars, setStars] = React.useState<Set<number>>(new Set());
  const [freeCancel, setFreeCancel] = React.useState(false);
  const [boards, setBoards] = React.useState<Set<Board>>(new Set());
  const [areas, setAreas] = React.useState<Set<string>>(new Set());
  const [filtersOpen, setFiltersOpen] = React.useState(false);

  const visible = results.filter((r) => {
    if (stars.size && !stars.has(r.hotel.stars)) return false;
    if (freeCancel && !r.freeCancellation) return false;
    if (areas.size && !areas.has(r.hotel.area)) return false;
    if (boards.size && !r.hotel.boards.some((b) => boards.has(b))) return false;
    return true;
  });
  const sorted = [...visible].sort((a, b) => {
    if (sort === "price") return a.cheapest.total - b.cheapest.total;
    if (sort === "rating") return b.hotel.rating - a.hotel.rating;
    // Recommended: rating per price, direct contracts first on a tie.
    const s = (r: (typeof visible)[number]) => r.hotel.rating * 20 - r.cheapest.total / 100 / Math.max(1, nights) / 8 + (r.hotel.supplierName ? 4 : 0);
    return s(b) - s(a);
  });
  const toggle = <T,>(set: React.Dispatch<React.SetStateAction<Set<T>>>, v: T) =>
    set((s) => {
      const n = new Set(s);
      if (n.has(v)) n.delete(v);
      else n.add(v);
      return n;
    });
  const active = stars.size + boards.size + areas.size + (freeCancel ? 1 : 0);
  const allAreas = [...new Set(results.map((r) => r.hotel.area))];
  const allBoards = [...new Set(results.flatMap((r) => r.hotel.boards))] as Board[];

  const panel = (
    <div className="space-y-6">
      <Group title="Cancellation">
        <Row label="Free cancellation" hint={`${results.filter((r) => r.freeCancellation).length}`} checked={freeCancel} onChange={() => setFreeCancel((f) => !f)} />
      </Group>
      <Group title="Stars">
        {[5, 4, 3].map((n) => {
          const count = results.filter((r) => r.hotel.stars === n).length;
          return <Row key={n} label={`${n} stars`} hint={`${count}`} checked={stars.has(n)} disabled={!count} onChange={() => toggle(setStars, n)} />;
        })}
      </Group>
      <Group title="Meals">
        {allBoards.map((b) => (
          <Row key={b} label={BOARD_LABEL[b]} checked={boards.has(b)} onChange={() => toggle(setBoards, b)} />
        ))}
      </Group>
      {allAreas.length > 1 && (
        <Group title="Area">
          {allAreas.map((a) => (
            <Row key={a} label={a} hint={`${results.filter((r) => r.hotel.area === a).length}`} checked={areas.has(a)} onChange={() => toggle(setAreas, a)} />
          ))}
        </Group>
      )}
      {active > 0 && (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2"
          onClick={() => {
            setStars(new Set());
            setBoards(new Set());
            setAreas(new Set());
            setFreeCancel(false);
          }}
        >
          Clear filters
        </Button>
      )}
    </div>
  );

  return (
    <>
      <PageHeader
        back={{ href: "/book?tab=hotels", label: "Search and book" }}
        title={dest ? `Hotels in ${dest.name}` : "Search hotels"}
        meta={dest ? <span>{`${fmtWeekday(q.checkIn)} – ${fmtWeekday(q.checkOut)} · ${nights} night${nights === 1 ? "" : "s"} · ${guestsLabel(q)}`}</span> : undefined}
        actions={
          dest && (
            <Button variant="outline" onClick={() => setEditing((e) => !e)} aria-expanded={editing}>
              <Pencil /> {editing ? "Close" : "Change search"}
            </Button>
          )
        }
      />
      {editing && (
        <Card className="mb-6 block p-4 sm:p-5">
          <HotelSearchForm key={qs} initial={q} today={today} onSearched={() => setEditing(false)} />
        </Card>
      )}

      {dest && (
        <>
          <Steps className="mb-6" steps={["Choose a hotel", "Choose a room", "Guests and booking"]} current={1} />
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-[230px_minmax(0,1fr)]">
            <aside className="hidden lg:block">
              <div className="sticky top-20">{panel}</div>
            </aside>
            <div className="min-w-0">
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <p className="mr-auto text-[15px] text-ink-2">
                  <span className="font-semibold text-ink">{sorted.length}</span> of {results.length} hotels
                </p>
                <QuickTabs<Sort>
                  value={sort}
                  onChange={setSort}
                  controls="hotel-results"
                  options={[
                    { value: "recommended", label: "Recommended" },
                    { value: "price", label: "Lowest price" },
                    { value: "rating", label: "Top rated" },
                  ]}
                />
                <Button variant="outline" size="sm" className="lg:hidden" onClick={() => setFiltersOpen(true)}>
                  <SlidersHorizontal /> Filters
                  {active > 0 && <span className="tnum rounded-full bg-primary px-1.5 text-[11px] leading-5 text-primary-foreground">{active}</span>}
                </Button>
              </div>
              {sorted.length ? (
                <ul id="hotel-results" className="grid grid-cols-1 gap-4 sm:grid-cols-2 2xl:grid-cols-3">
                  {sorted.map((r) => (
                    <li key={r.hotel.id}>
                      <HotelCard result={r} href={`/book/hotels/${r.hotel.id}?${qs}`} />
                    </li>
                  ))}
                </ul>
              ) : (
                <Card className="block">
                  <EmptyState
                    icon={BedDouble}
                    title={results.length ? "No hotels match these filters" : "Nothing free for these dates"}
                    body={results.length ? "Clear a filter to see more hotels." : "Try other dates or fewer rooms."}
                  />
                </Card>
              )}
            </div>
          </div>
        </>
      )}

      <Sheet open={filtersOpen} onOpenChange={setFiltersOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
          </SheetHeader>
          <SheetBody>{panel}</SheetBody>
          <SheetFooter>
            <Button onClick={() => setFiltersOpen(false)}>
              Show {sorted.length} hotel{sorted.length === 1 ? "" : "s"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-2 text-[13px] font-semibold text-ink-3">{title}</legend>
      <div className="space-y-0.5">{children}</div>
    </fieldset>
  );
}

function Row({ label, hint, checked, onChange, disabled }: { label: string; hint?: string; checked: boolean; onChange: () => void; disabled?: boolean }) {
  const id = React.useId();
  return (
    <label htmlFor={id} className={cn("flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-canvas-2", disabled && "cursor-not-allowed opacity-50")}>
      <Checkbox id={id} checked={checked} onCheckedChange={onChange} disabled={disabled} />
      <span className="min-w-0 flex-1 font-medium text-ink">{label}</span>
      {hint && <span className="shrink-0 text-xs text-ink-3">{hint}</span>}
    </label>
  );
}
