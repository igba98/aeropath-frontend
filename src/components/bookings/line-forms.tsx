"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { differenceInCalendarDays, parseISO } from "date-fns";

import type {
  Board,
  CarDetails,
  Currency,
  FlightDetails,
  FlightPassenger,
  FlightSegment,
  HotelDetails,
  InsuranceDetails,
  LineDetailsByType,
  LineType,
  SegmentStatus,
  Settings,
  TourDetails,
  TransferDetails,
  Traveller,
  VisaDetails,
} from "@/domain/types";
import { nameInPnrFor } from "@/domain/describe";
import { AIRPORTS, cabinForClass, findAirline, findAirport } from "@/store/seed/reference";
import { fromDarInput, toDarInput } from "@/lib/dates";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Combobox } from "@/components/shared/combobox";
import { Field, FieldGrid, FormSection } from "@/components/shared/field";
import { MoneyInput } from "@/components/shared/money-input";

export type Errors = Record<string, string>;
type Props<T> = { value: T; onChange: (v: T) => void; errors: Errors };

const req = (v: unknown) => v === undefined || v === null || (typeof v === "string" && !v.trim());
const isoOrEmpty = (s?: string) => (s ? toDarInput(s) : "");
const fromLocalInput = (v: string) => (v ? fromDarInput(v) : "");

// ───────────────────────────── Defaults ─────────────────────────────

export function defaultDetails(type: LineType, ctx: { start?: string; end?: string; pax: number; settings: Settings }): LineDetailsByType[LineType] {
  const start = ctx.start ?? "";
  const end = ctx.end ?? ctx.start ?? "";
  switch (type) {
    case "hotel":
      return { hotelName: "", city: "", checkIn: start, checkOut: end, rooms: [{ roomType: "Double", board: "BB", adults: Math.max(1, Math.min(2, ctx.pax)), children: 0 }] } satisfies HotelDetails;
    case "car":
      return { company: "", carClass: "", withDriver: false, pickupLocation: "", pickupAt: start ? fromDarInput(`${start}T09:00`) : "", dropoffLocation: "", dropoffAt: end ? fromDarInput(`${end}T09:00`) : "" } satisfies CarDetails;
    case "transfer":
      return { from: "", to: "", at: start ? fromDarInput(`${start}T09:00`) : "", vehicle: "Saloon", pax: Math.max(1, ctx.pax) } satisfies TransferDetails;
    case "tour":
      return { name: "", startDate: start, endDate: end, pax: Math.max(1, ctx.pax) } satisfies TourDetails;
    case "visa":
      return { country: "", visaType: "Tourist e-visa", decision: "pending" } satisfies VisaDetails;
    case "insurance":
      return { provider: "", plan: "", coverStart: start, coverEnd: end } satisfies InsuranceDetails;
    case "service_fee":
      return { reason: "" };
    case "other":
      return { label: "" };
    case "flight":
      return emptyFlight(ctx.settings);
  }
}

export function emptySegment(no: number, prev?: FlightSegment): FlightSegment {
  return {
    segmentNo: no,
    carrier: prev?.carrier ?? "",
    flightNumber: "",
    bookingClass: prev?.bookingClass ?? "Y",
    cabin: prev?.cabin ?? "economy",
    origin: prev?.destination ?? "DAR",
    destination: prev?.origin ?? "",
    departureLocal: "",
    arrivalLocal: "",
    arrivalDayOffset: 0,
    statusCode: "HK",
    seats: prev?.seats ?? 1,
  };
}

export function emptyFlight(settings: Settings): FlightDetails {
  return {
    recordLocator: "",
    officeId: settings.integrations.amadeus.officeId,
    validatingCarrier: "",
    tripType: "return",
    segments: [emptySegment(1)],
    passengers: [],
    fare: { currency: "USD", baseFare: { amountMinor: 0, currency: "USD" }, taxes: [], totalFare: { amountMinor: 0, currency: "USD" }, commissionPct: 0 },
  };
}

// ───────────────────────────── Validation ─────────────────────────────

export function validateDetails(type: LineType, d: LineDetailsByType[LineType]): Errors {
  const e: Errors = {};
  const need = (k: string, v: unknown, msg: string) => {
    if (req(v)) e[k] = msg;
  };
  switch (type) {
    case "hotel": {
      const h = d as HotelDetails;
      need("hotelName", h.hotelName, "Enter the hotel name.");
      need("city", h.city, "Enter the city.");
      need("checkIn", h.checkIn, "Pick the check-in date.");
      need("checkOut", h.checkOut, "Pick the check-out date.");
      if (h.checkIn && h.checkOut && h.checkOut <= h.checkIn) e.checkOut = "Check-out must be after check-in.";
      if (!h.rooms.length) e.rooms = "Add at least one room.";
      break;
    }
    case "car": {
      const c = d as CarDetails;
      need("company", c.company, "Enter the car hire company.");
      need("carClass", c.carClass, "Enter the car class, e.g. SUV.");
      need("pickupLocation", c.pickupLocation, "Where is the pick-up?");
      need("pickupAt", c.pickupAt, "When is the pick-up?");
      need("dropoffLocation", c.dropoffLocation, "Where is the drop-off?");
      need("dropoffAt", c.dropoffAt, "When is the drop-off?");
      if (c.pickupAt && c.dropoffAt && c.dropoffAt <= c.pickupAt) e.dropoffAt = "Drop-off must be after pick-up.";
      break;
    }
    case "transfer": {
      const t = d as TransferDetails;
      need("from", t.from, "Where from?");
      need("to", t.to, "Where to?");
      need("at", t.at, "When?");
      need("vehicle", t.vehicle, "Which vehicle?");
      if (!t.pax || t.pax < 1) e.pax = "At least one passenger.";
      break;
    }
    case "tour": {
      const t = d as TourDetails;
      need("name", t.name, "Name the tour.");
      need("startDate", t.startDate, "Pick the start date.");
      need("endDate", t.endDate, "Pick the end date.");
      if (t.startDate && t.endDate && t.endDate < t.startDate) e.endDate = "The tour ends before it starts.";
      break;
    }
    case "visa": {
      const v = d as VisaDetails;
      need("country", v.country, "Which country is the visa for?");
      need("visaType", v.visaType, "Which visa type?");
      break;
    }
    case "insurance": {
      const i = d as InsuranceDetails;
      need("provider", i.provider, "Enter the insurer.");
      need("plan", i.plan, "Enter the plan.");
      need("coverStart", i.coverStart, "When does cover start?");
      need("coverEnd", i.coverEnd, "When does cover end?");
      if (i.coverStart && i.coverEnd && i.coverEnd < i.coverStart) e.coverEnd = "Cover ends before it starts.";
      break;
    }
    case "service_fee":
      need("reason", (d as { reason: string }).reason, "Say what the fee is for.");
      break;
    case "other":
      need("label", (d as { label: string }).label, "Describe the service.");
      break;
    case "flight": {
      const f = d as FlightDetails;
      if (f.recordLocator && !/^[A-Z0-9]{6}$/.test(f.recordLocator)) e.recordLocator = "A record locator is 6 letters or digits.";
      need("validatingCarrier", f.validatingCarrier, "Which airline issues the ticket?");
      if (!f.segments.length) e.segments = "Add at least one flight.";
      f.segments.forEach((s, i) => {
        if (!/^[A-Z0-9]{2}$/.test(s.carrier)) e[`seg.${i}.carrier`] = "2-letter code";
        if (!/^\d{1,4}[A-Z]?$/.test(s.flightNumber)) e[`seg.${i}.flightNumber`] = "Flight no.";
        if (!/^[A-Z]{3}$/.test(s.origin)) e[`seg.${i}.origin`] = "From";
        if (!/^[A-Z]{3}$/.test(s.destination)) e[`seg.${i}.destination`] = "To";
        if (!s.departureLocal) e[`seg.${i}.departureLocal`] = "Departure";
        if (!s.arrivalLocal) e[`seg.${i}.arrivalLocal`] = "Arrival";
        if (s.departureLocal && s.arrivalLocal && s.arrivalLocal <= s.departureLocal) e[`seg.${i}.arrivalLocal`] = "Arrives before it departs";
      });
      if (!f.passengers.length) e.passengers = "Tick at least one traveller.";
      if (f.fare.totalFare.amountMinor <= 0) e.totalFare = "Enter the total fare for all passengers.";
      break;
    }
  }
  return e;
}

// ───────────────────────────── Shared bits ─────────────────────────────

function TextField({ id, label, value, onChange, error, required, placeholder, hint, autoFocus, upper, mono }: {
  id: string;
  label: string;
  value?: string;
  onChange: (v: string) => void;
  error?: string;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  autoFocus?: boolean;
  upper?: boolean;
  mono?: boolean;
}) {
  return (
    <Field label={label} htmlFor={id} required={required} error={error} hint={hint}>
      <Input
        id={id}
        value={value ?? ""}
        onChange={(e) => onChange(upper ? e.target.value.toUpperCase() : e.target.value)}
        placeholder={placeholder}
        aria-invalid={Boolean(error) || undefined}
        autoFocus={autoFocus}
        className={cn(mono && "font-mono uppercase")}
      />
    </Field>
  );
}

function DateField({ id, label, value, onChange, error, required, hint, type = "date" }: {
  id: string;
  label: string;
  value?: string;
  onChange: (v: string) => void;
  error?: string;
  required?: boolean;
  hint?: string;
  type?: "date" | "datetime-local";
}) {
  return (
    <Field label={label} htmlFor={id} required={required} error={error} hint={hint}>
      <Input id={id} type={type} value={value ?? ""} onChange={(e) => onChange(e.target.value)} aria-invalid={Boolean(error) || undefined} className="tnum" />
    </Field>
  );
}

function NumberField({ id, label, value, onChange, error, min = 0 }: { id: string; label: string; value: number; onChange: (v: number) => void; error?: string; min?: number }) {
  return (
    <Field label={label} htmlFor={id} error={error}>
      <Input id={id} type="number" inputMode="numeric" min={min} value={Number.isFinite(value) ? value : ""} onChange={(e) => onChange(Math.max(min, parseInt(e.target.value || "0", 10)))} className="tnum" />
    </Field>
  );
}

// ───────────────────────────── Type forms ─────────────────────────────

const BOARDS: { value: Board; label: string }[] = [
  { value: "RO", label: "Room only" },
  { value: "BB", label: "Bed & breakfast" },
  { value: "HB", label: "Half board" },
  { value: "FB", label: "Full board" },
  { value: "AI", label: "All inclusive" },
];

export function HotelForm({ value: h, onChange, errors }: Props<HotelDetails>) {
  const set = (p: Partial<HotelDetails>) => onChange({ ...h, ...p });
  const nights = h.checkIn && h.checkOut && h.checkOut > h.checkIn ? differenceInCalendarDays(parseISO(h.checkOut), parseISO(h.checkIn)) : null;
  return (
    <div className="space-y-4">
      <FieldGrid cols={2}>
        <TextField id="h-name" label="Hotel" required value={h.hotelName} onChange={(v) => set({ hotelName: v })} error={errors.hotelName} placeholder="e.g. Hyatt Regency" autoFocus />
        <TextField id="h-city" label="City" required value={h.city} onChange={(v) => set({ city: v })} error={errors.city} placeholder="e.g. Dubai" />
        <DateField id="h-in" label="Check-in" required value={h.checkIn} onChange={(v) => set({ checkIn: v })} error={errors.checkIn} />
        <DateField id="h-out" label="Check-out" required value={h.checkOut} onChange={(v) => set({ checkOut: v })} error={errors.checkOut} hint={nights ? `${nights} night${nights > 1 ? "s" : ""}` : undefined} />
      </FieldGrid>
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[13px] font-medium text-ink-2">Rooms</span>
          <Button type="button" variant="ghost" size="xs" onClick={() => set({ rooms: [...h.rooms, { ...(h.rooms[h.rooms.length - 1] ?? { roomType: "Double", board: "BB", adults: 2, children: 0 }) }] })}>
            <Plus /> Add room
          </Button>
        </div>
        <div className="space-y-2">
          {h.rooms.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_64px_64px_28px] items-end gap-2">
              <Field label={i === 0 ? "Room type" : ""} htmlFor={`h-room-${i}`}>
                <Input id={`h-room-${i}`} value={r.roomType} onChange={(e) => set({ rooms: h.rooms.map((x, j) => (j === i ? { ...x, roomType: e.target.value } : x)) })} />
              </Field>
              <Field label={i === 0 ? "Board" : ""}>
                <Select value={r.board} onValueChange={(v) => set({ rooms: h.rooms.map((x, j) => (j === i ? { ...x, board: v as Board } : x)) })}>
                  <SelectTrigger aria-label="Board">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BOARDS.map((b) => (
                      <SelectItem key={b.value} value={b.value}>
                        {b.value} · {b.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <NumberField id={`h-ad-${i}`} label={i === 0 ? "Adults" : ""} value={r.adults} min={1} onChange={(v) => set({ rooms: h.rooms.map((x, j) => (j === i ? { ...x, adults: v } : x)) })} />
              <NumberField id={`h-ch-${i}`} label={i === 0 ? "Children" : ""} value={r.children} onChange={(v) => set({ rooms: h.rooms.map((x, j) => (j === i ? { ...x, children: v } : x)) })} />
              <Button type="button" variant="ghost" size="icon-sm" disabled={h.rooms.length === 1} onClick={() => set({ rooms: h.rooms.filter((_, j) => j !== i) })} aria-label="Remove room">
                <Trash2 />
              </Button>
            </div>
          ))}
        </div>
        {errors.rooms && <p className="mt-1 text-[13px] text-[var(--st-red-fg)]">{errors.rooms}</p>}
      </div>
      <FieldGrid cols={2}>
        <TextField id="h-conf" label="Confirmation no." value={h.confirmationNumber} onChange={(v) => set({ confirmationNumber: v || undefined })} hint="Needed before the line can be issued" mono />
        <DateField id="h-free" type="datetime-local" label="Free cancellation until" value={isoOrEmpty(h.freeCancelUntil)} onChange={(v) => set({ freeCancelUntil: fromLocalInput(v) || undefined })} />
      </FieldGrid>
      <Field label="Cancellation policy" htmlFor="h-policy" optional>
        <Textarea id="h-policy" rows={2} value={h.cancellationPolicy ?? ""} onChange={(e) => set({ cancellationPolicy: e.target.value || undefined })} placeholder="As the hotel states it; saved with the booking." />
      </Field>
    </div>
  );
}

export function CarForm({ value: c, onChange, errors }: Props<CarDetails>) {
  const set = (p: Partial<CarDetails>) => onChange({ ...c, ...p });
  return (
    <div className="space-y-4">
      <FieldGrid cols={2}>
        <TextField id="c-co" label="Company" required value={c.company} onChange={(v) => set({ company: v })} error={errors.company} autoFocus />
        <TextField id="c-class" label="Car class" required value={c.carClass} onChange={(v) => set({ carClass: v })} error={errors.carClass} placeholder="e.g. SUV, Land Cruiser" />
      </FieldGrid>
      <label className="flex items-center gap-2.5 text-sm text-ink">
        <Switch checked={c.withDriver} onCheckedChange={(v) => set({ withDriver: v })} /> With driver
      </label>
      <FieldGrid cols={2}>
        <TextField id="c-pl" label="Pick-up location" required value={c.pickupLocation} onChange={(v) => set({ pickupLocation: v })} error={errors.pickupLocation} />
        <DateField id="c-pa" type="datetime-local" label="Pick-up" required value={isoOrEmpty(c.pickupAt)} onChange={(v) => set({ pickupAt: fromLocalInput(v) })} error={errors.pickupAt} />
        <TextField id="c-dl" label="Drop-off location" required value={c.dropoffLocation} onChange={(v) => set({ dropoffLocation: v })} error={errors.dropoffLocation} />
        <DateField id="c-da" type="datetime-local" label="Drop-off" required value={isoOrEmpty(c.dropoffAt)} onChange={(v) => set({ dropoffAt: fromLocalInput(v) })} error={errors.dropoffAt} />
      </FieldGrid>
      <TextField id="c-conf" label="Confirmation no." value={c.confirmationNumber} onChange={(v) => set({ confirmationNumber: v || undefined })} mono hint="Needed before the line can be issued" />
    </div>
  );
}

export function TransferForm({ value: t, onChange, errors }: Props<TransferDetails>) {
  const set = (p: Partial<TransferDetails>) => onChange({ ...t, ...p });
  return (
    <div className="space-y-4">
      <FieldGrid cols={2}>
        <TextField id="t-from" label="From" required value={t.from} onChange={(v) => set({ from: v })} error={errors.from} placeholder="e.g. DAR airport" autoFocus />
        <TextField id="t-to" label="To" required value={t.to} onChange={(v) => set({ to: v })} error={errors.to} placeholder="e.g. Serena Hotel" />
        <DateField id="t-at" type="datetime-local" label="Pick-up time" required value={isoOrEmpty(t.at)} onChange={(v) => set({ at: fromLocalInput(v) })} error={errors.at} />
        <TextField id="t-flt" label="Meet flight" value={t.flightRef} onChange={(v) => set({ flightRef: v || undefined })} placeholder="e.g. EK 725" upper mono />
      </FieldGrid>
      <FieldGrid cols={3}>
        <TextField id="t-veh" label="Vehicle" required value={t.vehicle} onChange={(v) => set({ vehicle: v })} error={errors.vehicle} />
        <NumberField id="t-pax" label="Passengers" value={t.pax} min={1} onChange={(v) => set({ pax: v })} error={errors.pax} />
        <TextField id="t-conf" label="Confirmation no." value={t.confirmationNumber} onChange={(v) => set({ confirmationNumber: v || undefined })} mono />
      </FieldGrid>
    </div>
  );
}

export function TourForm({ value: t, onChange, errors }: Props<TourDetails>) {
  const set = (p: Partial<TourDetails>) => onChange({ ...t, ...p });
  return (
    <div className="space-y-4">
      <TextField id="to-name" label="Tour" required value={t.name} onChange={(v) => set({ name: v })} error={errors.name} placeholder="e.g. 3-day Serengeti safari" autoFocus />
      <FieldGrid cols={3}>
        <DateField id="to-s" label="Starts" required value={t.startDate} onChange={(v) => set({ startDate: v })} error={errors.startDate} />
        <DateField id="to-e" label="Ends" required value={t.endDate} onChange={(v) => set({ endDate: v })} error={errors.endDate} />
        <NumberField id="to-pax" label="Passengers" value={t.pax} min={1} onChange={(v) => set({ pax: v })} />
      </FieldGrid>
      <Field label="Inclusions" htmlFor="to-inc" optional>
        <Textarea id="to-inc" rows={2} value={t.inclusions ?? ""} onChange={(e) => set({ inclusions: e.target.value || undefined })} />
      </Field>
      <TextField id="to-conf" label="Confirmation no." value={t.confirmationNumber} onChange={(v) => set({ confirmationNumber: v || undefined })} mono hint="Needed before the line can be issued" />
    </div>
  );
}

export function VisaForm({ value: v, onChange, errors }: Props<VisaDetails>) {
  const set = (p: Partial<VisaDetails>) => onChange({ ...v, ...p });
  return (
    <div className="space-y-4">
      <FieldGrid cols={2}>
        <TextField id="v-c" label="Country" required value={v.country} onChange={(x) => set({ country: x })} error={errors.country} placeholder="e.g. United Arab Emirates" autoFocus />
        <TextField id="v-t" label="Visa type" required value={v.visaType} onChange={(x) => set({ visaType: x })} error={errors.visaType} />
        <DateField id="v-s" label="Submitted" value={v.submittedAt} onChange={(x) => set({ submittedAt: x || undefined })} />
        <Field label="Decision">
          <Select value={v.decision} onValueChange={(x) => set({ decision: x as VisaDetails["decision"] })}>
            <SelectTrigger aria-label="Decision">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </FieldGrid>
      <TextField id="v-ref" label="Reference" value={v.reference} onChange={(x) => set({ reference: x || undefined })} mono />
    </div>
  );
}

export function InsuranceForm({ value: i, onChange, errors }: Props<InsuranceDetails>) {
  const set = (p: Partial<InsuranceDetails>) => onChange({ ...i, ...p });
  return (
    <div className="space-y-4">
      <FieldGrid cols={2}>
        <TextField id="i-p" label="Insurer" required value={i.provider} onChange={(v) => set({ provider: v })} error={errors.provider} autoFocus />
        <TextField id="i-plan" label="Plan" required value={i.plan} onChange={(v) => set({ plan: v })} error={errors.plan} placeholder="e.g. Travel Silver" />
        <DateField id="i-s" label="Cover starts" required value={i.coverStart} onChange={(v) => set({ coverStart: v })} error={errors.coverStart} />
        <DateField id="i-e" label="Cover ends" required value={i.coverEnd} onChange={(v) => set({ coverEnd: v })} error={errors.coverEnd} />
      </FieldGrid>
      <TextField id="i-no" label="Policy no." value={i.policyNumber} onChange={(v) => set({ policyNumber: v || undefined })} mono />
    </div>
  );
}

export function ServiceFeeForm({ value, onChange, errors }: Props<{ reason: string }>) {
  return <TextField id="sf-r" label="What is the fee for?" required value={value.reason} onChange={(v) => onChange({ reason: v })} error={errors.reason} placeholder="e.g. Rebooking on client request" autoFocus />;
}

export function OtherForm({ value, onChange, errors }: Props<{ label: string }>) {
  return <TextField id="o-l" label="Service" required value={value.label} onChange={(v) => onChange({ label: v })} error={errors.label} placeholder="e.g. Airport lounge access" autoFocus />;
}

// ───────────────────────────── Manual flight ─────────────────────────────

const STATUS_CODES: SegmentStatus[] = ["HK", "KK", "TK", "HL", "UN", "UC", "NO", "HX", "XX"];

function localParts(l: string) {
  return { date: l.slice(0, 10), time: l.slice(11, 16) };
}

/** Day offset of arrival vs departure (0-2), from two airport-local datetimes. */
function dayOffset(dep: string, arr: string): 0 | 1 | 2 {
  if (!dep || !arr) return 0;
  const d = differenceInCalendarDays(parseISO(arr.slice(0, 10)), parseISO(dep.slice(0, 10)));
  return (d <= 0 ? 0 : d >= 2 ? 2 : 1) as 0 | 1 | 2;
}

export function FlightManualForm({
  value: f,
  onChange,
  errors,
  travellers,
  airlines,
}: Props<FlightDetails> & { travellers: Traveller[]; airlines: Settings["airlines"] }) {
  const set = (p: Partial<FlightDetails>) => onChange({ ...f, ...p });
  const airlineOptions = airlines.map((a) => ({ value: a.code, label: a.code, hint: a.name, keywords: [a.name] }));

  const cur = f.fare.currency;
  const totalFromParts = f.fare.baseFare.amountMinor + f.fare.taxes.reduce((s, t) => s + t.amount.amountMinor, 0);
  const setFare = (p: Partial<FlightDetails["fare"]>) => {
    const fare = { ...f.fare, ...p };
    // Total follows base + taxes whenever either is typed.
    if (p.baseFare || p.taxes) {
      const t = fare.baseFare.amountMinor + fare.taxes.reduce((s, x) => s + x.amount.amountMinor, 0);
      fare.totalFare = { amountMinor: t, currency: fare.currency };
    }
    set({ fare });
  };
  const setCurrency = (c: Currency) =>
    set({
      fare: {
        ...f.fare,
        currency: c,
        baseFare: { ...f.fare.baseFare, currency: c },
        totalFare: { ...f.fare.totalFare, currency: c },
        taxes: f.fare.taxes.map((t) => ({ ...t, amount: { ...t.amount, currency: c } })),
      },
    });

  const paxOn = (id: string) => f.passengers.some((p) => p.travellerId === id);
  const togglePax = (t: Traveller, on: boolean) => {
    const passengers: FlightPassenger[] = on
      ? [...f.passengers, { travellerId: t.id, nameInPnr: nameInPnrFor(t), paxType: t.paxType, emdNumbers: [] }]
      : f.passengers.filter((p) => p.travellerId !== t.id);
    const segments = f.segments.map((s) => ({ ...s, seats: passengers.filter((p) => p.paxType !== "INF").length || 1 }));
    set({ passengers, segments });
  };

  return (
    <div className="space-y-5">
      <FormSection title="Booking">
        <FieldGrid cols={3}>
          <TextField id="f-pnr" label="Record locator" value={f.recordLocator} onChange={(v) => set({ recordLocator: v.replace(/[^A-Za-z0-9]/g, "").slice(0, 6).toUpperCase() })} error={errors.recordLocator} placeholder="Z8K4QM" mono hint="Needed to mark booked" autoFocus />
          <Field label="Validating carrier" required error={errors.validatingCarrier}>
            <Combobox value={f.validatingCarrier} onChange={(v) => set({ validatingCarrier: v })} options={airlineOptions} placeholder="Airline" mono invalid={Boolean(errors.validatingCarrier)} />
          </Field>
          <TextField id="f-office" label="Office ID" value={f.officeId} onChange={(v) => set({ officeId: v.toUpperCase() || undefined })} mono />
        </FieldGrid>
      </FormSection>

      <FormSection
        title="Flights"
        description="Times are local at each airport."
      >
        <SegmentsEditor segments={f.segments} onChange={(segments) => set({ segments, validatingCarrier: f.validatingCarrier || segments[0]?.carrier || "" })} errors={errors} airlines={airlines} />
        {errors.segments && <p className="mt-1 text-[13px] text-[var(--st-red-fg)]">{errors.segments}</p>}
      </FormSection>

      <FormSection title="Passengers" description="Tick the travellers flying. Names follow the passport, as in the PNR.">
        {travellers.length === 0 ? (
          <p className="text-sm text-ink-3">Add travellers to the booking first.</p>
        ) : (
          <ul className="divide-y divide-rule border-y border-rule">
            {travellers.map((t) => {
              const on = paxOn(t.id);
              const p = f.passengers.find((x) => x.travellerId === t.id);
              return (
                <li key={t.id} className="flex items-center gap-3 py-2">
                  <Checkbox id={`pax-${t.id}`} checked={on} onCheckedChange={(v) => togglePax(t, v === true)} />
                  <label htmlFor={`pax-${t.id}`} className="min-w-0 flex-1 text-sm">
                    <span className="font-mono whitespace-nowrap text-[13.5px] font-medium">{p?.nameInPnr ?? nameInPnrFor(t)}</span>
                    <span className="ml-2 text-[13px] text-ink-3">{t.paxType}</span>
                  </label>
                  {on && (
                    <Input
                      aria-label="Name in PNR"
                      value={p?.nameInPnr ?? ""}
                      onChange={(e) => set({ passengers: f.passengers.map((x) => (x.travellerId === t.id ? { ...x, nameInPnr: e.target.value.toUpperCase() } : x)) })}
                      className="h-7 w-52 font-mono text-[13px]"
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {errors.passengers && <p className="mt-1 text-[13px] text-[var(--st-red-fg)]">{errors.passengers}</p>}
      </FormSection>

      <FormSection title="Fare" description="For all passengers together.">
        <FieldGrid cols={3}>
          <Field label="Base fare" htmlFor="fare-base">
            <MoneyInput id="fare-base" value={f.fare.baseFare.amountMinor} onChange={(v) => setFare({ baseFare: { amountMinor: v ?? 0, currency: cur } })} currency={cur} onCurrencyChange={setCurrency} />
          </Field>
          <Field label="Total fare" htmlFor="fare-total" required error={errors.totalFare} hint={f.fare.taxes.length ? `Base + taxes = ${(totalFromParts / 100).toLocaleString("en-US")}` : "Base + taxes"}>
            <MoneyInput id="fare-total" value={f.fare.totalFare.amountMinor || null} onChange={(v) => setFare({ totalFare: { amountMinor: v ?? 0, currency: cur } })} currency={cur} invalid={Boolean(errors.totalFare)} />
          </Field>
          <Field label="Commission %" htmlFor="fare-comm" hint="Usually 0">
            <Input id="fare-comm" type="number" inputMode="decimal" min={0} max={100} step="0.5" value={f.fare.commissionPct ? +(f.fare.commissionPct * 100).toFixed(2) : 0} onChange={(e) => setFare({ commissionPct: Math.max(0, Math.min(100, parseFloat(e.target.value || "0"))) / 100 })} className="tnum text-right" />
          </Field>
        </FieldGrid>
        <div className="mt-3 space-y-2">
          {f.fare.taxes.map((t, i) => (
            <div key={i} className="grid grid-cols-[80px_1fr_28px] items-end gap-2">
              <Field label={i === 0 ? "Tax code" : ""} htmlFor={`tax-c-${i}`}>
                <Input id={`tax-c-${i}`} value={t.code} maxLength={2} onChange={(e) => setFare({ taxes: f.fare.taxes.map((x, j) => (j === i ? { ...x, code: e.target.value.toUpperCase() } : x)) })} className="font-mono uppercase" placeholder="YQ" />
              </Field>
              <Field label={i === 0 ? "Amount" : ""}>
                <MoneyInput value={t.amount.amountMinor} onChange={(v) => setFare({ taxes: f.fare.taxes.map((x, j) => (j === i ? { ...x, amount: { amountMinor: v ?? 0, currency: cur } } : x)) })} currency={cur} aria-label={`Tax ${t.code} amount`} />
              </Field>
              <Button type="button" variant="ghost" size="icon-sm" onClick={() => setFare({ taxes: f.fare.taxes.filter((_, j) => j !== i) })} aria-label="Remove tax">
                <Trash2 />
              </Button>
            </div>
          ))}
          <Button type="button" variant="ghost" size="xs" onClick={() => setFare({ taxes: [...f.fare.taxes, { code: "", amount: { amountMinor: 0, currency: cur } }] })}>
            <Plus /> Add a tax line (optional)
          </Button>
        </div>
        <FieldGrid cols={3} className="mt-3">
          <TextField id="f-fb" label="Fare basis" value={f.fare.fareBasis} onChange={(v) => setFare({ fareBasis: v.toUpperCase() || undefined })} mono />
          <TextField id="f-bag" label="Baggage" value={f.baggage} onChange={(v) => set({ baggage: v.toUpperCase() || undefined })} placeholder="2PC or 30K" mono />
          <DateField id="f-ttl" type="datetime-local" label="Ticketing time limit" value={isoOrEmpty(f.ticketingTimeLimit)} onChange={(v) => set({ ticketingTimeLimit: fromLocalInput(v) || undefined })} />
        </FieldGrid>
      </FormSection>
    </div>
  );
}

/** Type → form renderer, for non-flight lines. */
export function DetailsForm({ type, value, onChange, errors }: { type: Exclude<LineType, "flight">; value: LineDetailsByType[LineType]; onChange: (v: LineDetailsByType[LineType]) => void; errors: Errors }) {
  switch (type) {
    case "hotel":
      return <HotelForm value={value as HotelDetails} onChange={onChange} errors={errors} />;
    case "car":
      return <CarForm value={value as CarDetails} onChange={onChange} errors={errors} />;
    case "transfer":
      return <TransferForm value={value as TransferDetails} onChange={onChange} errors={errors} />;
    case "tour":
      return <TourForm value={value as TourDetails} onChange={onChange} errors={errors} />;
    case "visa":
      return <VisaForm value={value as VisaDetails} onChange={onChange} errors={errors} />;
    case "insurance":
      return <InsuranceForm value={value as InsuranceDetails} onChange={onChange} errors={errors} />;
    case "service_fee":
      return <ServiceFeeForm value={value as { reason: string }} onChange={onChange} errors={errors} />;
    case "other":
      return <OtherForm value={value as { label: string }} onChange={onChange} errors={errors} />;
  }
}

/** Repeatable flight segments; airport and airline fields autocomplete from reference data. */
export function SegmentsEditor({
  segments,
  onChange,
  errors,
  airlines,
  minSegments = 1,
}: {
  segments: FlightSegment[];
  onChange: (s: FlightSegment[]) => void;
  errors: Errors;
  airlines: Settings["airlines"];
  minSegments?: number;
}) {
  const setSeg = (i: number, p: Partial<FlightSegment>) => {
    onChange(
      segments.map((s, j) => {
        if (j !== i) return s;
        const next = { ...s, ...p };
        if (p.bookingClass !== undefined) next.cabin = cabinForClass(p.bookingClass || "Y");
        next.arrivalDayOffset = dayOffset(next.departureLocal, next.arrivalLocal);
        return next;
      }),
    );
  };
  const airportOptions = AIRPORTS.map((a) => ({ value: a.code, label: a.code, hint: a.city, keywords: [a.city, a.name, a.country] }));
  const airlineOptions = airlines.map((a) => ({ value: a.code, label: a.code, hint: a.name, keywords: [a.name] }));
  return (
    <div className="space-y-3">
          {segments.map((s, i) => {
            const e = (k: string) => errors[`seg.${i}.${k}`];
            const dep = localParts(s.departureLocal);
            const arr = localParts(s.arrivalLocal);
            const unknownFrom = s.origin.length === 3 && !findAirport(s.origin);
            const unknownTo = s.destination.length === 3 && !findAirport(s.destination);
            const unknownCarrier = s.carrier.length === 2 && !findAirline(s.carrier, airlines);
            return (
              <div key={i} className="rounded-md border border-rule p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="col-head">Flight {i + 1}</span>
                  <Button type="button" variant="ghost" size="icon-xs" disabled={segments.length <= minSegments} onClick={() => onChange(segments.filter((_, j) => j !== i).map((x, j) => ({ ...x, segmentNo: j + 1 })))} aria-label={`Remove flight ${i + 1}`}>
                    <Trash2 />
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-[88px_88px_64px_1fr_1fr]">
                  <Field label="Airline" error={e("carrier") && " "}>
                    <Combobox value={s.carrier} onChange={(v) => setSeg(i, { carrier: v })} options={airlineOptions} placeholder="EK" mono invalid={Boolean(e("carrier"))} />
                  </Field>
                  <Field label="Flight no." htmlFor={`s-fn-${i}`}>
                    <Input id={`s-fn-${i}`} value={s.flightNumber} onChange={(ev) => setSeg(i, { flightNumber: ev.target.value.toUpperCase().replace(/\s/g, "") })} aria-invalid={Boolean(e("flightNumber")) || undefined} className="font-mono" placeholder="726" />
                  </Field>
                  <Field label="Class" htmlFor={`s-cl-${i}`}>
                    <Input id={`s-cl-${i}`} value={s.bookingClass} maxLength={1} onChange={(ev) => setSeg(i, { bookingClass: ev.target.value.toUpperCase() })} className="font-mono uppercase" />
                  </Field>
                  <Field label="From" error={unknownFrom ? "Not in our airport list" : undefined}>
                    <Combobox value={s.origin} onChange={(v) => setSeg(i, { origin: v })} options={airportOptions} placeholder="DAR" mono invalid={Boolean(e("origin"))} onCreate={(q) => setSeg(i, { origin: q.toUpperCase().slice(0, 3) })} createLabel={(q) => `Use ${q.toUpperCase().slice(0, 3)}`} />
                  </Field>
                  <Field label="To" error={unknownTo ? "Not in our airport list" : undefined}>
                    <Combobox value={s.destination} onChange={(v) => setSeg(i, { destination: v })} options={airportOptions} placeholder="DXB" mono invalid={Boolean(e("destination"))} onCreate={(q) => setSeg(i, { destination: q.toUpperCase().slice(0, 3) })} createLabel={(q) => `Use ${q.toUpperCase().slice(0, 3)}`} />
                  </Field>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_88px_64px]">
                  <Field label={`Departs (${s.origin || "local"})`} htmlFor={`s-dep-${i}`} error={e("departureLocal") && "Pick a time"}>
                    <Input id={`s-dep-${i}`} type="datetime-local" value={s.departureLocal} onChange={(ev) => setSeg(i, { departureLocal: ev.target.value })} className="tnum" aria-invalid={Boolean(e("departureLocal")) || undefined} />
                  </Field>
                  <Field label={`Arrives (${s.destination || "local"})`} htmlFor={`s-arr-${i}`} error={e("arrivalLocal")} hint={s.arrivalDayOffset ? `+${s.arrivalDayOffset} day` : undefined}>
                    <Input
                      id={`s-arr-${i}`}
                      type="datetime-local"
                      value={s.arrivalLocal}
                      onFocus={() => {
                        if (!s.arrivalLocal && dep.date) setSeg(i, { arrivalLocal: `${dep.date}T${dep.time || "00:00"}` });
                      }}
                      onChange={(ev) => setSeg(i, { arrivalLocal: ev.target.value })}
                      className="tnum"
                      aria-invalid={Boolean(e("arrivalLocal")) || undefined}
                    />
                  </Field>
                  <Field label="Status">
                    <Select value={s.statusCode} onValueChange={(v) => setSeg(i, { statusCode: v as SegmentStatus })}>
                      <SelectTrigger aria-label="Segment status" className="font-mono">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_CODES.map((c) => (
                          <SelectItem key={c} value={c}>
                            <span className="font-mono whitespace-nowrap">{c}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <NumberField id={`s-seats-${i}`} label="Seats" value={s.seats} min={1} onChange={(v) => setSeg(i, { seats: v })} />
                </div>
                {unknownCarrier && <p className="mt-1 text-[13px] text-[var(--st-amber-fg)]">{s.carrier} isn&apos;t in the airline list. It will still save.</p>}
                {arr.date && dep.date && s.arrivalDayOffset > 0 && <span className="sr-only">Arrives {s.arrivalDayOffset} day later</span>}
              </div>
            );
          })}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...segments, emptySegment(segments.length + 1, segments[segments.length - 1])])}>
        <Plus /> Add flight
      </Button>
    </div>
  );
}
