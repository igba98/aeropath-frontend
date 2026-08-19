"use client";

import { cn } from "@/lib/utils";
import { MoneyText } from "@/components/shared/money-text";
import { seatMap, EXTRA_LEGROOM_MINOR } from "@/lib/domain/ancillaries";
import type { SeatAssignment, SeatClass } from "@/lib/domain/types";

/**
 * Cabin seat map.
 *
 * Seats are real buttons rather than clickable divs: a seat is a control, so it must be
 * reachable by keyboard and announce its own state. Colour alone never carries the meaning —
 * every seat exposes its class and price in its accessible name, because the four seat types
 * are otherwise distinguishable only by hue (WCAG 1.4.1).
 */
export function SeatMap({
  flightId,
  leg,
  travellers,
  activeTraveller,
  assignments,
  onSelect,
  onActiveTravellerChange,
}: {
  flightId: string;
  leg: "out" | "in";
  travellers: Array<{ label: string }>;
  activeTraveller: number;
  assignments: SeatAssignment[];
  onSelect: (seat: string, priceMinor: number) => void;
  onActiveTravellerChange: (index: number) => void;
}) {
  const rows = seatMap(flightId);
  const letters = ["A", "B", "C", null, "D", "E", "F", null, "H", "J", "K"] as const;

  const takenBy = (code: string) => assignments.findIndex((a) => a.leg === leg && a.seat === code);

  return (
    <div className="grid gap-5 lg:grid-cols-[240px_1fr]">
      {/* Legend and passengers */}
      <div className="space-y-4">
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-1">
          <Legend klass="extra_legroom" label="Extra legroom" note={<MoneyText minor={EXTRA_LEGROOM_MINOR} currency="TZS" size="xs" />} />
          <Legend klass="standard" label="Standard" note={<span className="text-xs text-muted-foreground">No charge</span>} />
          <Legend klass="occupied" label="Occupied" />
          <Legend klass="selected" label="Your selection" />
        </ul>

        <div className="space-y-2">
          {travellers.map((t, i) => {
            const seat = assignments.find((a) => a.leg === leg && a.travellerIndex === i);
            const active = i === activeTraveller;
            return (
              <button
                key={i}
                onClick={() => onActiveTravellerChange(i)}
                aria-pressed={active}
                className={cn(
                  "w-full rounded-xl border p-3 text-left transition-colors",
                  active ? "border-brand-500 bg-brand-50/60" : "bg-card hover:border-brand-300",
                )}
              >
                <span className="block truncate text-sm">{t.label}</span>
                <span className={cn("mt-0.5 block font-display text-lg", seat ? "text-brand-text" : "text-placeholder")}>
                  {seat?.seat ?? "Pick a seat"}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Cabin */}
      <div className="overflow-x-auto rounded-2xl border bg-card p-4">
        <div className="mx-auto w-fit">
          <div className="mb-2 grid grid-cols-[2rem_repeat(11,2.25rem)] items-center gap-1">
            <span />
            {letters.map((l, i) => (
              <span key={i} className="text-center text-xs font-medium text-muted-foreground">{l ?? ""}</span>
            ))}
          </div>

          {rows.map((r) => (
            <div key={r.row}>
              {r.exit ? (
                <p className="mb-1 flex items-center justify-between px-1 text-[11px] font-medium text-destructive">
                  <span>← Exit</span><span>Exit →</span>
                </p>
              ) : null}
              <div className="mb-1 grid grid-cols-[2rem_repeat(11,2.25rem)] items-center gap-1">
                <span className="text-right text-xs tabular-nums text-muted-foreground">{r.row}</span>
                {r.seats.map((s, i) => {
                  if (!s) return <span key={i} />;
                  const code = `${r.row}${s.letter}`;
                  const owner = takenBy(code);
                  const mine = owner !== -1;
                  const disabled = s.klass === "occupied";
                  return (
                    <Seat
                      key={i}
                      code={code}
                      klass={s.klass}
                      priceMinor={s.priceMinor}
                      selected={mine}
                      disabled={disabled}
                      onClick={() => onSelect(code, s.priceMinor)}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const SEAT_CLASS: Record<SeatClass | "selected", string> = {
  extra_legroom: "bg-success/20 text-success-foreground hover:bg-success/35",
  standard: "bg-warning/25 text-warning-foreground hover:bg-warning/40",
  occupied: "bg-neutral-300 text-placeholder",
  selected: "bg-brand-500 text-white",
};

function Seat({
  code, klass, priceMinor, selected, disabled, onClick,
}: {
  code: string; klass: SeatClass; priceMinor: number; selected: boolean; disabled: boolean; onClick: () => void;
}) {
  const label =
    disabled ? `Seat ${code}, already taken`
      : selected ? `Seat ${code}, your selection. Press to release`
        : priceMinor > 0 ? `Seat ${code}, extra legroom, ${priceMinor.toLocaleString()} shillings`
          : `Seat ${code}, standard, no charge`;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      aria-pressed={selected}
      title={code}
      className={cn(
        "flex h-8 w-9 items-end justify-center rounded-t-md rounded-b-lg pb-0.5 text-[10px] font-medium transition-colors",
        selected ? SEAT_CLASS.selected : SEAT_CLASS[klass],
        disabled && "cursor-not-allowed",
      )}
    >
      {selected ? code.slice(-1) : ""}
    </button>
  );
}

function Legend({ klass, label, note }: { klass: SeatClass | "selected"; label: string; note?: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2.5">
      <span className={cn("h-6 w-7 shrink-0 rounded-t-md rounded-b-lg", SEAT_CLASS[klass])} aria-hidden />
      <span className="min-w-0">
        <span className="block text-sm font-medium leading-tight">{label}</span>
        {note}
      </span>
    </li>
  );
}
