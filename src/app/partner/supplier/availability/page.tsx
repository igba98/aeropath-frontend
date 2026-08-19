"use client";

import { useMemo, useState } from "react";
import { CalendarRange, ChevronLeft, ChevronRight, Package, Save, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/chrome/console-shell";
import { EmptyState } from "@/components/shared/empty-state";
import { Pill } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStore, type StoreData } from "@/lib/store";
import { catalog } from "@/lib/api";
import { formatDate, today } from "@/lib/format";
import { cn } from "@/lib/utils";
import { NotSupplier, VERTICAL_LABELS, useSupplierContext } from "@/features/supplier/shared";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const ymd = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

/** S06 · Availability calendar. Month grid per product with multi select and a bulk edit panel. */
export default function AvailabilityPage() {
  const { org, hydrated } = useSupplierContext();
  const products = useStore((s) => s.products);
  const [productId, setProductId] = useState<string | null>(null);

  if (!hydrated) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!org) {
    return (
      <>
        <PageHeader title="Availability" code="S06" description="Capacity, stop sell and minimum stay, date by date." />
        <NotSupplier what="The availability calendar" />
      </>
    );
  }

  const mine = Object.values(products)
    .filter((p) => p.supplierId === org.id && p.status !== "archived")
    .sort((a, b) => a.title.localeCompare(b.title));
  const selected = productId && products[productId]?.supplierId === org.id ? productId : mine[0]?.id ?? null;

  return (
    <>
      <PageHeader
        title="Availability"
        code="S06"
        description="Click dates to select them, then bulk edit capacity, stop sell and minimum stay. Changes take effect in search immediately."
        actions={
          mine.length ? (
            <div className="flex items-center gap-2">
              <Label htmlFor="product" className="text-xs text-muted-foreground">Product</Label>
              <Select value={selected ?? ""} onValueChange={setProductId}>
                <SelectTrigger id="product" className="w-[280px]"><SelectValue placeholder="Select a product" /></SelectTrigger>
                <SelectContent>
                  {mine.map((p) => <SelectItem key={p.id} value={p.id}>{p.title} · {VERTICAL_LABELS[p.vertical]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ) : null
        }
      />
      {selected ? (
        <MonthGrid key={selected} productId={selected} />
      ) : (
        <EmptyState icon={Package} title="No products to schedule" description="Create a product first — availability is set per product and per date." />
      )}
    </>
  );
}

function MonthGrid({ productId }: { productId: string }) {
  const data = useStore((s) => s) as StoreData;
  const product = data.products[productId];

  const start = useMemo(() => {
    const todayIso = today();
    const overrides = Object.values(data.inventory)
      .filter((u) => u.productId === productId && u.date >= todayIso)
      .map((u) => u.date)
      .sort();
    const anchor = overrides[0] ?? todayIso;
    return { year: Number(anchor.slice(0, 4)), month: Number(anchor.slice(5, 7)) - 1 };
    // anchor only needs computing when the product changes; the component is keyed by product id
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  const [cursor, setCursor] = useState(start);
  const [selection, setSelection] = useState<string[]>([]);
  const [capacity, setCapacity] = useState("");
  const [minStay, setMinStay] = useState("");
  const [stopSell, setStopSell] = useState<"keep" | "stop" | "open">("keep");

  const todayIso = today();
  const firstOfMonth = new Date(Date.UTC(cursor.year, cursor.month, 1));
  const daysInMonth = new Date(Date.UTC(cursor.year, cursor.month + 1, 0)).getUTCDate();
  const leading = (firstOfMonth.getUTCDay() + 6) % 7; // Monday-first grid

  const dates = Array.from({ length: daysInMonth }, (_, i) => ymd(cursor.year, cursor.month, i + 1));
  const selectable = dates.filter((d) => d >= todayIso);

  function toggle(date: string) {
    setSelection((s) => (s.includes(date) ? s.filter((x) => x !== date) : [...s, date]));
  }

  function shiftMonth(delta: number) {
    setSelection([]);
    setCursor((c) => {
      const m = c.month + delta;
      return { year: c.year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 };
    });
  }

  function apply() {
    if (!selection.length) return;
    const patch: { capacityTotal?: number; stopSell?: boolean; minStay?: number } = {};
    if (capacity.trim() !== "") patch.capacityTotal = Math.max(0, Number(capacity) || 0);
    if (minStay.trim() !== "") patch.minStay = Math.max(0, Number(minStay) || 0);
    if (stopSell !== "keep") patch.stopSell = stopSell === "stop";
    if (Object.keys(patch).length === 0) {
      toast.error("Nothing to change", { description: "Set a capacity, a minimum stay or a stop sell state first." });
      return;
    }
    catalog.setInventory(productId, [...selection].sort(), patch);
    toast.success(`${selection.length} date${selection.length === 1 ? "" : "s"} updated`, {
      description: [
        patch.capacityTotal != null ? `capacity ${patch.capacityTotal}` : null,
        patch.stopSell != null ? (patch.stopSell ? "stop sell on" : "stop sell off") : null,
        patch.minStay != null ? `min stay ${patch.minStay}` : null,
      ].filter(Boolean).join(" · "),
    });
    setSelection([]);
    setCapacity("");
    setMinStay("");
    setStopSell("keep");
  }

  const summary = selection.map((d) => catalog.unit(data, productId, d));
  const selectedCapacity = summary.reduce((s, u) => s + u.capacityTotal, 0);
  const selectedLeft = summary.reduce((s, u) => s + Math.max(0, u.capacityTotal - u.capacityHeld - u.capacitySold), 0);

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
      <div className="rounded-xl border bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            <Button size="icon-sm" variant="outline" aria-label="Previous month" onClick={() => shiftMonth(-1)}><ChevronLeft className="size-4" aria-hidden /></Button>
            <h2 className="min-w-[190px] px-2 text-center font-display text-lg">{MONTHS[cursor.month]} {cursor.year}</h2>
            <Button size="icon-sm" variant="outline" aria-label="Next month" onClick={() => shiftMonth(1)}><ChevronRight className="size-4" aria-hidden /></Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => setSelection(selectable)}>Select all upcoming</Button>
            <Button size="sm" variant="ghost" onClick={() => setSelection([])} disabled={!selection.length}>Clear</Button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {WEEKDAYS.map((w) => <div key={w} className="py-1">{w}</div>)}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {Array.from({ length: leading }).map((_, i) => <div key={`pad-${i}`} />)}
          {dates.map((date) => {
            const unit = catalog.unit(data, productId, date);
            const left = Math.max(0, unit.capacityTotal - unit.capacityHeld - unit.capacitySold);
            const past = date < todayIso;
            const isSelected = selection.includes(date);
            const soldOut = !unit.stopSell && left === 0;
            return (
              <button
                key={date}
                type="button"
                disabled={past}
                aria-pressed={isSelected}
                aria-label={`${formatDate(date)} · ${unit.stopSell ? "stop sell" : `${left} of ${unit.capacityTotal} left`}`}
                onClick={() => toggle(date)}
                className={cn(
                  "flex min-h-[64px] flex-col items-start gap-1 rounded-lg border p-1.5 text-left transition-colors",
                  past && "cursor-not-allowed opacity-40",
                  !past && "hover:border-brand-400",
                  isSelected && "border-brand-500 bg-brand-50 ring-2 ring-brand-300",
                  !isSelected && unit.stopSell && "border-destructive/40 bg-destructive/10",
                  !isSelected && soldOut && "border-warning/40 bg-warning/10",
                )}
              >
                <span className="text-xs font-semibold tabular-nums">{Number(date.slice(8, 10))}</span>
                {unit.stopSell ? (
                  <span className="text-[10px] font-medium text-destructive">Stop sell</span>
                ) : (
                  <span className={cn("text-[10px] tabular-nums", soldOut ? "font-medium text-warning-foreground" : "text-muted-foreground")}>
                    {soldOut ? "Sold out" : `${left}/${unit.capacityTotal} left`}
                  </span>
                )}
                {unit.minStay ? <span className="text-[10px] text-muted-foreground">min {unit.minStay}n</span> : null}
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded border bg-card" aria-hidden />Open</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded border border-warning/40 bg-warning/10" aria-hidden />Sold out</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded border border-destructive/40 bg-destructive/10" aria-hidden />Stop sell</span>
          <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded border border-brand-500 bg-brand-50" aria-hidden />Selected</span>
        </div>
      </div>

      <aside className="space-y-3">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{product?.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {product ? VERTICAL_LABELS[product.vertical] : ""} · capacity is per {product?.vertical === "stay" ? "night" : "departure"}.
          </p>
        </div>

        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-lg">Bulk edit</h2>
            {selection.length ? <Pill tone="brand">{selection.length} selected</Pill> : null}
          </div>
          {selection.length ? (
            <p className="mt-1 text-xs text-muted-foreground">{selectedLeft} of {selectedCapacity} units currently free across the selected dates.</p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">Click dates in the grid to select them.</p>
          )}

          <div className="mt-4 space-y-3">
            <div>
              <Label htmlFor="capacity">Capacity per date</Label>
              <Input id="capacity" type="number" min={0} className="mt-1.5" value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="leave blank to keep" disabled={!selection.length} />
            </div>
            <div>
              <Label htmlFor="stopsell">Stop sell</Label>
              <Select value={stopSell} onValueChange={(v) => setStopSell(v as "keep" | "stop" | "open")} disabled={!selection.length}>
                <SelectTrigger id="stopsell" className="mt-1.5 w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="keep">Leave unchanged</SelectItem>
                  <SelectItem value="stop">Stop selling these dates</SelectItem>
                  <SelectItem value="open">Open these dates for sale</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="minstay">Minimum stay (nights)</Label>
              <Input id="minstay" type="number" min={0} className="mt-1.5" value={minStay} onChange={(e) => setMinStay(e.target.value)} placeholder="leave blank to keep" disabled={!selection.length} />
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={apply} disabled={!selection.length}><Save className="size-4" aria-hidden />Apply to {selection.length || 0} date{selection.length === 1 ? "" : "s"}</Button>
              {selection.length ? <Button variant="outline" size="icon" aria-label="Clear selection" onClick={() => setSelection([])}><X className="size-4" aria-hidden /></Button> : null}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-dashed bg-muted/40 p-4 text-xs text-muted-foreground">
          <p className="flex items-center gap-2 text-sm font-medium text-foreground"><CalendarRange className="size-4 text-brand-text" aria-hidden />Stop sell vs zero capacity</p>
          <p className="mt-1">Stop sell hides the date from search even if units are free — use it for maintenance or a private buyout. Setting capacity to zero shows the date as sold out.</p>
        </div>
      </aside>
    </div>
  );
}
