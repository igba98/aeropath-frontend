"use client";

import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Tint for a toolbar control whose filter is applied (select, dates button). */
export const FILTER_ON = "border-brand-300 bg-band font-semibold text-brand-700 dark:border-brand-700 dark:text-brand-200";

/** Compact toolbar filter; tints brand blue when set away from "all" so applied filters read at a glance. */
export function FilterSelect({
  label,
  value,
  onChange,
  options,
  full,
  unset = "all",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  full?: boolean;
  /** The value that means "no filter" (tinted otherwise). */
  unset?: string;
}) {
  const active = value !== unset && !full;
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger size="sm" aria-label={label} className={cn(full ? "w-full" : "w-auto min-w-[120px]", active && FILTER_ON)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
