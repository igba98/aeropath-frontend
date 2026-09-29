"use client";

import { CalendarRange } from "lucide-react";
import { fmtDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Field } from "@/components/shared/field";
import { FILTER_ON } from "@/components/shared/filter-select";

/** Compact "Dates" toolbar filter: from/to calendar dates (inclusive, Dar dates). */
export function DateRangeFilter({
  from,
  to,
  onChange,
  label = "Dates",
  idPrefix = "dr",
}: {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  label?: string;
  idPrefix?: string;
}) {
  const set = from || to;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className={cn(set && FILTER_ON)}>
          <CalendarRange />
          {set ? `${from ? fmtDate(from) : "…"} – ${to ? fmtDate(to) : "…"}` : label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-3 p-3">
        <div className="grid grid-cols-2 gap-2">
          <Field label="From" htmlFor={`${idPrefix}-from`}>
            <Input id={`${idPrefix}-from`} type="date" value={from} max={to || undefined} onChange={(e) => onChange(e.target.value, to)} className="tnum" />
          </Field>
          <Field label="To" htmlFor={`${idPrefix}-to`}>
            <Input id={`${idPrefix}-to`} type="date" value={to} min={from || undefined} onChange={(e) => onChange(from, e.target.value)} className="tnum" />
          </Field>
        </div>
        {set && (
          <Button variant="ghost" size="sm" onClick={() => onChange("", "")}>
            Clear dates
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
