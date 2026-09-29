import type { FlightSegment } from "@/domain/types";
import { splitLocal } from "@/lib/dates";
import { cityOf, CABIN_LABELS } from "@/store/seed/reference";
import { cn } from "@/lib/utils";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

/**
 * Flight segments set as a timetable block: flight · from · dep · to · arr · class · status.
 * Times are airport-local and labelled with the airport code (spec §12).
 * The same block renders the PNR paste preview, so what the agent checks is what gets saved.
 */

const OK_STATUS = new Set(["HK", "KK", "TK"]);

export function SegmentStatusCode({ code }: { code: string }) {
  const ok = OK_STATUS.has(code);
  const bad = code === "UN" || code === "UC" || code === "NO" || code === "HX" || code === "XX";
  return (
    <span
      title={
        {
          HK: "Holding confirmed",
          KK: "Confirmed by airline",
          TK: "Schedule change, confirmed",
          HL: "Waitlisted",
          UN: "Unable, flight not operating",
          UC: "Unable to confirm",
          NO: "No action taken",
          HX: "Cancelled by airline",
          XX: "Cancelled",
        }[code] ?? code
      }
      className={cn(
        "inline-grid h-5 min-w-7 place-items-center rounded-[3px] border px-1 font-mono text-xs font-semibold",
        ok && "border-[var(--st-green-bd)] bg-[var(--st-green-bg)] text-[var(--st-green-fg)]",
        bad && "border-[var(--st-red-bd)] bg-[var(--st-red-bg)] text-[var(--st-red-fg)]",
        !ok && !bad && "border-[var(--st-amber-bd)] bg-[var(--st-amber-bg)] text-[var(--st-amber-fg)]",
      )}
    >
      {code}
    </span>
  );
}

export function CarrierMark({ code, className }: { code: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-grid size-7 shrink-0 place-items-center rounded-[5px] border border-rule-2 bg-canvas font-mono text-xs font-semibold tracking-tight text-ink-2",
        className,
      )}
    >
      {code}
    </span>
  );
}

export function FlightTimetable({ segments, className, compact = false }: { segments: FlightSegment[]; className?: string; compact?: boolean }) {
  if (!segments.length) return <p className="py-3 text-sm text-ink-3">No segments yet.</p>;
  return (
    <>
    {/* Phones: each segment as a two-line timetable entry */}
    <ol className={cn("divide-y divide-rule border-y-[1.5px] border-t-rule-strong border-b-rule sm:hidden", className)}>
      {segments.map((s, i) => {
        const dep = splitLocal(s.departureLocal);
        const arr = splitLocal(s.arrivalLocal);
        return (
          <li key={`${s.segmentNo}-${i}`} className={cn(compact ? "py-2" : "py-2.5")}>
            <div className="flex items-center gap-2 text-[13px]">
              <span className="font-mono whitespace-nowrap font-semibold text-ink">
                {s.carrier} {s.flightNumber}
              </span>
              <span className="text-ink-3">
                <span className="font-mono whitespace-nowrap text-ink-2">{s.bookingClass}</span> {CABIN_LABELS[s.cabin] ?? s.cabin}
              </span>
              <span className="ml-auto flex items-center gap-1">
                <SegmentStatusCode code={s.statusCode} />
                {s.seats > 0 && <span className="tnum text-xs text-ink-3">×{s.seats}</span>}
              </span>
            </div>
            <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-baseline gap-2">
              <span>
                <span className="font-mono whitespace-nowrap text-sm font-semibold text-ink">{s.origin}</span>{" "}
                <span className="tnum text-base font-semibold text-ink">{dep.time}</span>
                <span className="block text-xs text-ink-3">
                  {dep.weekday} {dep.date}
                </span>
              </span>
              <span aria-hidden className="text-brand">
                →
              </span>
              <span className="text-right">
                <span className="font-mono whitespace-nowrap text-sm font-semibold text-ink">{s.destination}</span>{" "}
                <span className="tnum text-base font-semibold text-ink">{arr.time}</span>
                {s.arrivalDayOffset > 0 && <sup className="ml-0.5 text-[10px] font-semibold text-[var(--st-amber-fg)]">+{s.arrivalDayOffset}</sup>}
                <span className="block text-xs text-ink-3">
                  {arr.weekday} {arr.date}
                </span>
              </span>
            </div>
          </li>
        );
      })}
    </ol>
    <Table className="min-w-[560px]" containerClassName={cn("hidden sm:block", className)}>
      <TableHeader>
        <TableRow className="rule-head border-0">
          <TableHead className="h-7 pr-3 pb-1.5 align-bottom first:pl-0">Flight</TableHead>
          <TableHead className="h-7 px-3 pb-1.5 align-bottom">From</TableHead>
          <TableHead className="h-7 px-3 pb-1.5 text-right align-bottom">Dep</TableHead>
          <TableHead className="h-auto w-6 px-0" aria-hidden />
          <TableHead className="h-7 px-3 pb-1.5 align-bottom">To</TableHead>
          <TableHead className="h-7 px-3 pb-1.5 text-right align-bottom">Arr</TableHead>
          <TableHead className="h-7 px-3 pb-1.5 align-bottom">Class</TableHead>
          <TableHead className="h-7 pr-0 pb-1.5 pl-3 text-right align-bottom last:pr-0">Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {segments.map((s, i) => {
          const dep = splitLocal(s.departureLocal);
          const arr = splitLocal(s.arrivalLocal);
          const prev = segments[i - 1];
          const newDay = !prev || prev.departureLocal.slice(0, 10) !== s.departureLocal.slice(0, 10);
          return (
            <TableRow key={`${s.segmentNo}-${i}`}>
              <TableCell className={cn("pr-3 align-middle first:pl-0", compact ? "py-1.5" : "py-2.5")}>
                <span className="flex items-center gap-2">
                  <CarrierMark code={s.carrier} />
                  <span className="leading-tight">
                    <span className="block font-mono text-[13.5px] font-semibold whitespace-nowrap text-ink">
                      {s.carrier} {s.flightNumber}
                    </span>
                    {s.operatingCarrier && s.operatingCarrier !== s.carrier ? (
                      <span className="block text-xs text-ink-3">Operated by {s.operatingCarrier}</span>
                    ) : s.equipment ? (
                      <span className="block text-xs text-ink-3">{s.equipment}</span>
                    ) : null}
                  </span>
                </span>
              </TableCell>
              <TableCell className="px-3 align-middle">
                <span className="block font-mono whitespace-nowrap text-sm font-semibold text-ink">{s.origin}</span>
                <span className="block max-w-[130px] truncate text-xs text-ink-3">{cityOf(s.origin)}</span>
              </TableCell>
              <TableCell className="px-3 text-right align-middle">
                <span className="tnum block text-base leading-5 font-semibold text-ink">{dep.time}</span>
                <span className={cn("block text-xs whitespace-nowrap", newDay ? "text-ink-2" : "text-ink-4")}>
                  {dep.weekday} {dep.date}
                </span>
              </TableCell>
              <TableCell aria-hidden className="px-0 text-center align-middle text-brand">
                →
              </TableCell>
              <TableCell className="px-3 align-middle">
                <span className="block font-mono whitespace-nowrap text-sm font-semibold text-ink">{s.destination}</span>
                <span className="block max-w-[130px] truncate text-xs text-ink-3">{cityOf(s.destination)}</span>
              </TableCell>
              <TableCell className="px-3 text-right align-middle">
                <span className="tnum inline-flex items-start gap-0.5 text-base leading-5 font-semibold text-ink">
                  {arr.time}
                  {s.arrivalDayOffset > 0 && (
                    <sup className="mt-0.5 rounded-[2px] bg-[var(--st-amber-bg)] px-0.5 text-[10px] leading-3 font-semibold text-[var(--st-amber-fg)]" title={`Arrives ${s.arrivalDayOffset} day(s) later`}>
                      +{s.arrivalDayOffset}
                    </sup>
                  )}
                </span>
                <span className="block text-xs whitespace-nowrap text-ink-4">
                  {arr.weekday} {arr.date}
                </span>
              </TableCell>
              <TableCell className="px-3 align-middle whitespace-nowrap">
                <span className="font-mono whitespace-nowrap text-[13.5px] font-semibold text-ink">{s.bookingClass}</span>
                <span className="ml-1.5 text-[13px] text-ink-3">{CABIN_LABELS[s.cabin] ?? s.cabin}</span>
              </TableCell>
              <TableCell className="pr-0 pl-3 text-right align-middle whitespace-nowrap last:pr-0">
                <SegmentStatusCode code={s.statusCode} />
                {s.seats > 0 && <span className="tnum ml-1.5 text-xs text-ink-3">×{s.seats}</span>}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
    </>
  );
}
