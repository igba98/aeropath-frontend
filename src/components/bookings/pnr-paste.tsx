"use client";

import * as React from "react";
import { ClipboardPaste, FileText, TriangleAlert, UserRoundPlus, Wand2 } from "lucide-react";

import type { ID, Traveller } from "@/domain/types";
import { parsePnr } from "@/providers/pnr-parser/parse";
import { autoMatchTravellers, formatNameInPnr, snapshotSummary } from "@/providers/mappers/pnr-to-flight-line";
import type { PnrSnapshot } from "@/providers/types";
import { fmtDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Banner } from "@/components/shared/field";
import { Code, Route } from "@/components/shared/bits";
import { StatusChip } from "@/components/shared/status-chip";
import { FlightTimetable } from "./flight-timetable";
import { PNR_SAMPLES, rebaseSample } from "./pnr-samples";

/** pnrPaxNo → existing traveller id, or "new" to create one from the PNR name. */
export type PaxMap = Record<number, ID | "new">;

export interface PnrPasteValue {
  text: string;
  snapshot: PnrSnapshot | null;
  map: PaxMap;
}

export const emptyPnrValue: PnrPasteValue = { text: "", snapshot: null, map: {} };

/** A parsed PNR is usable once it has a locator, at least one passenger and one segment. */
export function pnrReady(v: PnrPasteValue): boolean {
  const s = v.snapshot;
  return Boolean(s && /^[A-Z0-9]{6}$/.test(s.recordLocator) && s.passengers.length && s.segments.length);
}

/**
 * Paste PNR: the agent copies the PNR display from the Amadeus terminal and pastes it here.
 * It parses as they paste, previews passengers, segments and tickets in the same timetable block
 * the booking will show, and maps each PNR passenger to a traveller (auto-matched on name).
 */
export function PnrPaste({
  value,
  onChange,
  travellers,
  autoFocus,
  className,
}: {
  value: PnrPasteValue;
  onChange: (v: PnrPasteValue) => void;
  travellers: Traveller[];
  autoFocus?: boolean;
  className?: string;
}) {
  const textRef = React.useRef<HTMLTextAreaElement>(null);

  const apply = React.useCallback(
    (text: string, prevMap: PaxMap) => {
      if (!text.trim()) return onChange({ text, snapshot: null, map: {} });
      const snapshot = parsePnr(text, new Date());
      const auto = autoMatchTravellers(snapshot.passengers, travellers);
      const map: PaxMap = {};
      for (const p of snapshot.passengers) map[p.pnrPaxNo] = prevMap[p.pnrPaxNo] ?? auto[p.pnrPaxNo] ?? "new";
      onChange({ text, snapshot, map });
    },
    [onChange, travellers],
  );

  const pasteFromClipboard = async () => {
    try {
      const t = await navigator.clipboard.readText();
      if (t.trim()) apply(t, {});
      else textRef.current?.focus();
    } catch {
      textRef.current?.focus();
    }
  };

  const s = value.snapshot;

  return (
    <div className={cn("space-y-4", className)}>
      <div>
        <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
          <label htmlFor="pnr-text" className="text-[13px] font-medium text-ink-2">
            PNR display from the Amadeus terminal
          </label>
          <div className="flex items-center gap-1">
            <Button type="button" variant="ghost" size="xs" onClick={pasteFromClipboard}>
              <ClipboardPaste /> Paste from clipboard
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="ghost" size="xs">
                  <Wand2 /> Try a sample
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel className="col-head">Synthetic demo PNRs</DropdownMenuLabel>
                {PNR_SAMPLES.map((x) => (
                  <DropdownMenuItem key={x.id} onSelect={() => apply(rebaseSample(x.text, new Date()), {})} className="flex-col items-start gap-0">
                    <span className="text-sm text-ink">{x.label}</span>
                    <span className="font-mono whitespace-nowrap text-xs text-ink-3">{x.hint}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        <Textarea
          id="pnr-text"
          ref={textRef}
          value={value.text}
          autoFocus={autoFocus}
          spellCheck={false}
          autoCapitalize="characters"
          rows={value.text ? 7 : 5}
          onChange={(e) => apply(e.target.value, value.map)}
          placeholder={"RP/DARTZ2100/DARTZ2100            GK/SU  28SEP26/0812Z   Z8K4QM\n  1.MWAKALINGA/PETER MR   2.MWAKALINGA/ANNA MRS\n  3  EK 726 Y 12OCT 1 DARDXB HK3  1650 2305 …"}
          className="font-mono text-[13px] leading-[18px] whitespace-pre"
        />
        <p className="mt-1.5 text-[13px] text-ink-3">Paste the whole display. Lower case, extra spaces and page breaks are fine.</p>
      </div>

      {s && <PnrPreview value={value} onChange={onChange} travellers={travellers} />}

      {value.text.trim() && s && !pnrReady(value) && (
        <p className="flex items-center gap-1.5 text-[13px] text-[var(--st-red-fg)]">
          <TriangleAlert className="size-3.5" /> We need a record locator, at least one passenger and one flight segment to continue.
        </p>
      )}
    </div>
  );
}

/** Parsed PNR preview: header facts, warnings, passenger → traveller mapping, timetable, raw text. */
export function PnrPreview({
  value,
  onChange,
  travellers,
}: {
  value: PnrPasteValue;
  onChange: (v: PnrPasteValue) => void;
  travellers: Traveller[];
}) {
  const s = value.snapshot;
  if (!s) return null;
  const summary = snapshotSummary(s);
  const usedTravellers = new Set(Object.values(value.map).filter((v) => v !== "new"));
  return (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-y border-rule py-3">
            <div>
              <div className="col-head">Record locator</div>
              {s.recordLocator ? <Code copy strong className="text-base">{s.recordLocator}</Code> : <span className="text-sm text-[var(--st-red-fg)]">Not found</span>}
            </div>
            {s.officeId && (
              <div>
                <div className="col-head">Office</div>
                <Code>{s.officeId}</Code>
              </div>
            )}
            {summary.route && (
              <div>
                <div className="col-head">Route</div>
                <Route codes={summary.route.split(/\s*(?:→|·)\s*/)} />
              </div>
            )}
            <div className="ml-auto flex flex-wrap items-center gap-1.5">
              {summary.ticketed ? (
                <StatusChip label="Ticketed in Amadeus" tone="green" />
              ) : s.ticketingTimeLimit ? (
                <StatusChip label={`Ticket by ${fmtDateTime(s.ticketingTimeLimit)}`} tone="amber" />
              ) : null}
              <StatusChip label={`${s.passengers.length} pax · ${s.segments.length} segments`} tone="grey" />
            </div>
          </div>

          {s.warnings.length > 0 && (
            <Banner tone="warn" title={s.warnings.length === 1 ? "Check this before saving" : `Check these ${s.warnings.length} things before saving`}>
              <ul className="list-disc space-y-0.5 pl-4">
                {s.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </Banner>
          )}

          {s.passengers.length > 0 && (
            <div>
              <h4 className="mb-1 text-sm font-semibold text-ink">Passengers → travellers</h4>
              <p className="mb-2 text-[13px] text-ink-3">Matched by name where we could. Pick an existing traveller or keep “Create new”.</p>
              <Table className="min-w-[520px]">
                <TableHeader>
                  <TableRow className="rule-head border-0">
                    <TableHead className="h-7 w-10 px-0 pb-1.5 align-bottom first:pl-0">Pax</TableHead>
                    <TableHead className="h-7 px-0 pb-1.5 align-bottom whitespace-normal">Name in PNR</TableHead>
                    <TableHead className="h-7 px-3 pb-1.5 align-bottom">Ticket</TableHead>
                    <TableHead className="h-7 px-0 pb-1.5 align-bottom whitespace-normal last:pr-0">Traveller on file</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {s.passengers.map((p) => {
                    const ticket = s.tickets.find((t) => t.pnrPaxNo === p.pnrPaxNo);
                    const current = value.map[p.pnrPaxNo] ?? "new";
                    return (
                      <TableRow key={p.pnrPaxNo}>
                        <TableCell className="px-0 py-2 font-mono text-[13px] text-ink-3 first:pl-0">P{p.pnrPaxNo}</TableCell>
                        <TableCell className="px-0 py-2">
                          <span className="font-mono whitespace-nowrap text-[13.5px] font-medium text-ink">{formatNameInPnr(p)}</span>
                          <span className="ml-2 text-xs text-ink-3">
                            {p.paxType}
                            {p.dateOfBirth ? ` · born ${p.dateOfBirth}` : ""}
                          </span>
                        </TableCell>
                        <TableCell className="px-3 py-2">{ticket ? <Code>{ticket.ticketNumber}</Code> : <span className="text-[13px] text-ink-4">Not issued</span>}</TableCell>
                        <TableCell className="w-[220px] px-0 py-2 last:pr-0">
                          <Select
                            value={current}
                            onValueChange={(v) => onChange({ ...value, map: { ...value.map, [p.pnrPaxNo]: v as ID | "new" } })}
                          >
                            <SelectTrigger size="sm" aria-label={`Traveller for P${p.pnrPaxNo}`} className={cn(current === "new" && "text-brand-700 dark:text-brand-300")}>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="new">
                                <UserRoundPlus className="size-3.5" /> Create new
                              </SelectItem>
                              {travellers.map((t) => (
                                <SelectItem key={t.id} value={t.id} disabled={usedTravellers.has(t.id) && current !== t.id}>
                                  {t.surname}/{t.givenName} {t.title}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {s.segments.length > 0 && (
            <div>
              <h4 className="mb-1 text-sm font-semibold text-ink">Itinerary</h4>
              <FlightTimetable
                compact
                segments={s.segments.map((seg) => ({ ...seg, cabin: seg.cabin ?? "economy" }))}
              />
            </div>
          )}

          <details className="group text-[13px] text-ink-3">
            <summary className="inline-flex cursor-pointer items-center gap-1 select-none hover:text-ink">
              <FileText className="size-3.5" /> Raw text we&apos;ll keep with the booking
            </summary>
            <pre className="mt-2 max-h-48 overflow-auto rounded-md border border-rule bg-canvas p-3 font-mono text-xs leading-[17px] text-ink-2">{s.raw}</pre>
          </details>
        </div>
  );
}
