"use client";

import * as React from "react";
import { CalendarDays, MapPin, Minus, Plane, Plus, Users } from "lucide-react";

import type { ISODate } from "@/domain/types";
import { AIRPORTS, findAirport, type AirportRef } from "@/store/seed/reference";
import { TANZANIA } from "@/providers/inventory/network";
import { HOTEL_DESTINATIONS, findDestination } from "@/providers/inventory/hotels";
import type { CabinChoice } from "@/providers/inventory/flights";
import { fmtWeekday } from "@/lib/dates";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

import { Calendar } from "@/components/ui/calendar";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/shared/page";

// ─────────────────────────────── Tile ───────────────────────────────

/** The big tappable box every search field uses: small label on top, the value large beneath. */
export const Tile = React.forwardRef<HTMLButtonElement, React.ComponentProps<"button"> & { label: string; icon?: React.ComponentType<{ className?: string }>; invalid?: boolean }>(
  function Tile({ label, icon: Icon, invalid, className, children, ...props }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        className={cn(
          "group flex h-[68px] w-full min-w-0 items-center gap-3 rounded-xl border bg-paper px-4 text-left transition-[border-color,box-shadow] outline-none hover:border-ink-4/50 focus-visible:border-brand-400 focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--brand-400)_22%,transparent)] data-[state=open]:border-brand-400",
          invalid ? "border-destructive" : "border-rule-2",
          className,
        )}
        {...props}
      >
        {Icon && <Icon className="size-5 shrink-0 text-ink-3 group-data-[state=open]:text-brand-600" />}
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold text-ink-3">{label}</span>
          {children}
        </span>
      </button>
    );
  },
);

const Value = ({ children, muted }: { children: React.ReactNode; muted?: boolean }) => <span className={cn("block truncate text-base leading-6 font-semibold", muted ? "font-medium text-ink-4" : "text-ink")}>{children}</span>;
const Sub = ({ children }: { children: React.ReactNode }) => <span className="block truncate text-[13px] leading-5 text-ink-3">{children}</span>;

// ─────────────────────────────── Airports ───────────────────────────────

const HOME = AIRPORTS.filter((a) => TANZANIA.has(a.code));
const ABROAD = AIRPORTS.filter((a) => !TANZANIA.has(a.code));

function AirportItem({ a, onPick }: { a: AirportRef; onPick: (code: string) => void }) {
  return (
    <CommandItem value={a.code} keywords={[a.city, a.name, a.country]} onSelect={() => onPick(a.code)} className="gap-3 py-2">
      <MapPin className="size-4 text-ink-3" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-semibold text-ink">{a.city}</span>
        <span className="block truncate text-xs text-ink-3">
          {a.name}
          {a.countryCode !== "TZ" && `, ${a.country}`}
        </span>
      </span>
      <span className="font-mono text-xs font-semibold text-ink-2">{a.code}</span>
    </CommandItem>
  );
}

export function AirportField({ label, value, onChange, exclude, invalid, icon = Plane }: { label: string; value: string; onChange: (code: string) => void; exclude?: string; invalid?: boolean; icon?: React.ComponentType<{ className?: string }> }) {
  const [open, setOpen] = React.useState(false);
  const a = findAirport(value);
  const pick = (code: string) => {
    onChange(code);
    setOpen(false);
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Tile label={label} icon={icon} invalid={invalid}>
          {a ? (
            <>
              <Value>{a.city}</Value>
              <Sub>
                <span className="font-mono font-semibold text-ink-2">{a.code}</span> · {a.name}
              </Sub>
            </>
          ) : (
            <>
              <Value muted>Choose a city</Value>
              <Sub>City or airport</Sub>
            </>
          )}
        </Tile>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(380px,calc(100vw-2rem))] p-0">
        <Command>
          <CommandInput placeholder="Type a city or airport" />
          <CommandList className="max-h-[340px]">
            <CommandEmpty>No airport matches. Try the city name.</CommandEmpty>
            <CommandGroup heading="Tanzania">
              {HOME.filter((x) => x.code !== exclude).map((x) => (
                <AirportItem key={x.code} a={x} onPick={pick} />
              ))}
            </CommandGroup>
            <CommandGroup heading="International">
              {ABROAD.filter((x) => x.code !== exclude).map((x) => (
                <AirportItem key={x.code} a={x} onPick={pick} />
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function DestinationField({ value, onChange, invalid, className }: { value: string; onChange: (code: string) => void; invalid?: boolean; className?: string }) {
  const [open, setOpen] = React.useState(false);
  const d = findDestination(value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Tile label="Where are you going?" icon={MapPin} invalid={invalid} className={className}>
          {d ? (
            <>
              <Value>{d.name}</Value>
              <Sub>{d.hint}</Sub>
            </>
          ) : (
            <>
              <Value muted>Choose a destination</Value>
              <Sub>Zanzibar, Arusha, Serengeti, Dubai…</Sub>
            </>
          )}
        </Tile>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(380px,calc(100vw-2rem))] p-0">
        <Command>
          <CommandInput placeholder="Type a place" />
          <CommandList className="max-h-[340px]">
            <CommandEmpty>We don&rsquo;t have hotels there yet.</CommandEmpty>
            {(["Tanzania", "Abroad"] as const).map((g) => (
              <CommandGroup key={g} heading={g}>
                {HOTEL_DESTINATIONS.filter((x) => (g === "Tanzania" ? x.country === "Tanzania" : x.country !== "Tanzania")).map((x) => (
                  <CommandItem
                    key={x.code}
                    value={x.code}
                    keywords={[x.name, x.hint, x.country]}
                    onSelect={() => {
                      onChange(x.code);
                      setOpen(false);
                    }}
                    className="gap-3 py-2"
                  >
                    <MapPin className="size-4 text-ink-3" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold text-ink">{x.name}</span>
                      <span className="block truncate text-xs text-ink-3">{x.hint}</span>
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ─────────────────────────────── Dates ───────────────────────────────

const toDate = (iso: ISODate) => new Date(`${iso}T12:00:00`);
const toIso = (d: Date): ISODate => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function DateField({
  label,
  value,
  onChange,
  min,
  placeholder = "Add date",
  sub,
  onClear,
}: {
  label: string;
  value?: ISODate;
  onChange: (iso: ISODate) => void;
  min: ISODate;
  placeholder?: string;
  sub?: React.ReactNode;
  onClear?: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const mobile = useIsMobile();
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Tile label={label} icon={CalendarDays}>
          {value ? (
            <>
              <Value>{fmtWeekday(value)}</Value>
              <Sub>{sub ?? value.slice(0, 4)}</Sub>
            </>
          ) : (
            <>
              <Value muted>{placeholder}</Value>
              <Sub>{sub ?? "Optional"}</Sub>
            </>
          )}
        </Tile>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          numberOfMonths={mobile ? 1 : 2}
          selected={value ? toDate(value) : undefined}
          defaultMonth={toDate(value ?? min)}
          disabled={{ before: toDate(min) }}
          onSelect={(d) => {
            if (!d) return;
            onChange(toIso(d));
            setOpen(false);
          }}
          className="[--cell-size:--spacing(10)]"
        />
        {onClear && value && (
          <div className="flex justify-end border-t border-rule px-3 py-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                onClear();
                setOpen(false);
              }}
            >
              Remove this date
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ─────────────────────────────── People ───────────────────────────────

export function Counter({ label, hint, value, onChange, min = 0, max = 9 }: { label: string; hint?: string; value: number; onChange: (n: number) => void; min?: number; max?: number }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div>
        <p className="text-[15px] font-semibold text-ink">{label}</p>
        {hint && <p className="text-[13px] text-ink-3">{hint}</p>}
      </div>
      <div className="flex items-center gap-3">
        <Button type="button" variant="outline" size="icon-sm" className="rounded-full" onClick={() => onChange(value - 1)} disabled={value <= min} aria-label={`Fewer ${label.toLowerCase()}`}>
          <Minus />
        </Button>
        <span className="tnum w-5 text-center text-base font-semibold text-ink" aria-live="polite">
          {value}
        </span>
        <Button type="button" variant="outline" size="icon-sm" className="rounded-full" onClick={() => onChange(value + 1)} disabled={value >= max} aria-label={`More ${label.toLowerCase()}`}>
          <Plus />
        </Button>
      </div>
    </div>
  );
}

export interface Party {
  adults: number;
  children: number;
  infants: number;
  cabin: CabinChoice;
}

export function TravellersField({ value, onChange }: { value: Party; onChange: (v: Party) => void }) {
  const total = value.adults + value.children + value.infants;
  const set = (patch: Partial<Party>) => {
    const next = { ...value, ...patch };
    next.infants = Math.min(next.infants, next.adults);
    onChange(next);
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Tile label="Travellers" icon={Users}>
          <Value>
            {total} traveller{total === 1 ? "" : "s"}
          </Value>
          <Sub>{value.cabin === "business" ? "Business class" : "Economy"}</Sub>
        </Tile>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(340px,calc(100vw-2rem))] p-4">
        <div className="divide-y divide-rule">
          <Counter label="Adults" hint="12 years and over" value={value.adults} min={1} max={9 - value.children} onChange={(n) => set({ adults: n })} />
          <Counter label="Children" hint="2 to 11 years" value={value.children} max={9 - value.adults} onChange={(n) => set({ children: n })} />
          <Counter label="Infants" hint="Under 2, on an adult's lap" value={value.infants} max={value.adults} onChange={(n) => set({ infants: n })} />
        </div>
        <div className="mt-3 border-t border-rule pt-3">
          <p className="mb-2 text-[13px] font-semibold text-ink-3">Cabin</p>
          <Segmented
            label="Cabin"
            value={value.cabin}
            onChange={(c) => set({ cabin: c })}
            options={[
              { value: "economy", label: "Economy" },
              { value: "business", label: "Business" },
            ]}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

export interface Guests {
  adults: number;
  children: number;
  rooms: number;
}

export function GuestsField({ value, onChange }: { value: Guests; onChange: (v: Guests) => void }) {
  const set = (patch: Partial<Guests>) => {
    const next = { ...value, ...patch };
    next.adults = Math.max(next.adults, next.rooms);
    onChange(next);
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Tile label="Guests" icon={Users}>
          <Value>
            {value.adults + value.children} guest{value.adults + value.children === 1 ? "" : "s"}
          </Value>
          <Sub>
            {value.rooms} room{value.rooms === 1 ? "" : "s"}
          </Sub>
        </Tile>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(340px,calc(100vw-2rem))] p-4">
        <div className="divide-y divide-rule">
          <Counter label="Adults" hint="18 years and over" value={value.adults} min={Math.max(1, value.rooms)} max={12} onChange={(n) => set({ adults: n })} />
          <Counter label="Children" hint="Under 18" value={value.children} max={8} onChange={(n) => set({ children: n })} />
          <Counter label="Rooms" value={value.rooms} min={1} max={5} onChange={(n) => set({ rooms: n })} />
        </div>
      </PopoverContent>
    </Popover>
  );
}
