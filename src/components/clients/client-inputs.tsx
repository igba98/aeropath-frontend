"use client";

import * as React from "react";
import { Check, Plus, X, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox } from "@/components/shared/combobox";
import { COUNTRIES, TZ_REGIONS, countryName } from "./client-options";

/** Inputs used by the client stepper. Each takes an `id` so Field labels and error focus line up. */

/** Large radio card: icon tile, title and one line; band fill and brand ring when chosen. */
export function ChoiceCard({
  selected,
  onSelect,
  icon: Icon,
  title,
  description,
  invalid,
}: {
  selected: boolean;
  onSelect: () => void;
  icon: LucideIcon;
  title: string;
  description: string;
  invalid?: boolean;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "relative flex w-full items-start gap-4 rounded-xl border p-4 text-left transition-[border-color,background-color,box-shadow] duration-150 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring sm:p-5",
        selected ? "border-brand-400 bg-band shadow-[0_0_0_1px_var(--brand-400)]" : "border-rule-2 bg-paper hover:border-ink-4/50 hover:bg-band-hover",
        invalid && !selected && "border-destructive",
      )}
    >
      <span className={cn("grid size-11 shrink-0 place-items-center rounded-lg transition-colors", selected ? "bg-primary text-primary-foreground" : "bg-canvas-2 text-ink-2")}>
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1 pr-6">
        <span className="block text-[15px] leading-6 font-semibold text-ink">{title}</span>
        <span className="mt-0.5 block text-[13.5px] leading-5 text-ink-3">{description}</span>
      </span>
      <span
        aria-hidden
        className={cn(
          "absolute top-4 right-4 grid size-5 place-items-center rounded-full border transition-colors",
          selected ? "border-primary bg-primary text-primary-foreground" : "border-rule-2 bg-paper",
        )}
      >
        {selected && <Check className="size-3" strokeWidth={3} />}
      </span>
    </button>
  );
}

/** A short list of choices as chips (radio semantics). */
export function ChipGroup<T extends string>({
  id,
  label,
  value,
  onChange,
  options,
  invalid,
}: {
  id?: string;
  label: string;
  value: T | "";
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  invalid?: boolean;
}) {
  return (
    <div id={id} role="radiogroup" aria-label={label} aria-invalid={invalid || undefined} tabIndex={-1} className="flex flex-wrap gap-2 outline-none">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-lg border px-3.5 text-[13.5px] font-semibold transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
              on ? "border-brand-400 bg-band text-brand-700 dark:text-brand-200" : "border-rule-2 bg-paper text-ink-2 hover:bg-canvas hover:text-ink",
              invalid && !on && "border-destructive/60",
            )}
          >
            {on && <Check className="size-3.5" strokeWidth={3} aria-hidden />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

const NONE = "__none__";

/** Select with an optional "none" row (Radix Select cannot hold an empty value). */
export function SelectField({
  id,
  value,
  onChange,
  options,
  placeholder = "Choose",
  noneLabel,
  invalid,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[] | readonly string[];
  placeholder?: string;
  /** Adds a first row that clears the value. */
  noneLabel?: string;
  invalid?: boolean;
}) {
  const opts = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  return (
    <Select value={value || (noneLabel ? NONE : undefined)} onValueChange={(v) => onChange(v === NONE ? "" : v)}>
      <SelectTrigger id={id} className="w-full" aria-invalid={invalid || undefined}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {noneLabel && <SelectItem value={NONE}>{noneLabel}</SelectItem>}
        {opts.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const COUNTRY_OPTIONS = COUNTRIES.map((c) => ({ value: c.code, label: c.name, hint: c.code }));

/** Country by name, saved as its ISO-2 code; any other 2-letter code can be typed. */
export function CountryPicker({ id, value, onChange, invalid }: { id: string; value: string; onChange: (code: string) => void; invalid?: boolean }) {
  const known = COUNTRY_OPTIONS.some((o) => o.value === value.toUpperCase());
  const options = value && !known ? [{ value, label: countryName(value) ?? value, hint: value.toUpperCase() }, ...COUNTRY_OPTIONS] : COUNTRY_OPTIONS;
  return (
    <Combobox
      id={id}
      value={value ? (known ? value.toUpperCase() : value) : null}
      onChange={onChange}
      options={options}
      placeholder="Choose country"
      searchPlaceholder="Country or 2-letter code"
      emptyText="Not in the list. Type the 2-letter code."
      invalid={invalid}
      onCreate={(q) => onChange(/^[a-z]{2}$/i.test(q) ? q.toUpperCase() : q)}
      createLabel={(q) => (/^[a-z]{2}$/i.test(q) ? `Use country code ${q.toUpperCase()}` : `Use “${q}”`)}
    />
  );
}

const REGION_OPTIONS = TZ_REGIONS.map((r) => ({ value: r, label: r }));

/** Tanzanian regions to pick from; free text for other countries. */
export function RegionPicker({ id, value, onChange, country }: { id: string; value: string; onChange: (v: string) => void; country: string }) {
  if (country && country.toUpperCase() !== "TZ") return <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} autoComplete="address-level1" />;
  const options = value && !TZ_REGIONS.includes(value) ? [{ value, label: value }, ...REGION_OPTIONS] : REGION_OPTIONS;
  return <Combobox id={id} value={value || null} onChange={onChange} options={options} placeholder="Choose region" searchPlaceholder="Region" onCreate={onChange} createLabel={(q) => `Use “${q}”`} />;
}

/**
 * Tag input for short names (departments, cost centres): Enter or comma adds, Backspace on an empty input removes
 * the last one, pasting a comma list adds them all.
 */
export function TagInput({ id, value, onChange, suggestions = [], label }: { id: string; value: string[]; onChange: (v: string[]) => void; suggestions?: string[]; label: string }) {
  const [text, setText] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);
  const has = (s: string) => value.some((v) => v.toLowerCase() === s.toLowerCase());
  const add = (raw: string) => {
    const parts = raw
      .split(/[,;\n]/)
      .map((p) => p.trim().replace(/\s+/g, " "))
      .filter(Boolean);
    const next = [...value];
    for (const p of parts) if (!next.some((v) => v.toLowerCase() === p.toLowerCase())) next.push(p.slice(0, 60));
    if (next.length !== value.length) onChange(next);
    setText("");
  };
  const remove = (i: number) => onChange(value.filter((_, j) => j !== i));
  const open = suggestions.filter((s) => !has(s));

  return (
    <div className="space-y-2.5">
      <div
        onClick={() => inputRef.current?.focus()}
        className="flex min-h-9 w-full cursor-text flex-wrap items-center gap-1.5 rounded-lg border border-input bg-paper px-2 py-1.5 shadow-[0_1px_2px_rgb(15_23_42/0.04)] transition-[border-color,box-shadow] duration-150 hover:border-ink-4/50 focus-within:border-brand focus-within:shadow-[0_0_0_3px_color-mix(in_oklab,var(--brand-400)_22%,transparent)]"
      >
        {value.map((v, i) => (
          <span key={v} className="inline-flex h-6 max-w-full items-center gap-1 rounded-md bg-canvas-2 pr-0.5 pl-2 text-[13px] font-medium text-ink">
            <span className="truncate">{v}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                remove(i);
              }}
              className="grid size-5 place-items-center rounded-[4px] text-ink-3 hover:bg-rule hover:text-ink"
              aria-label={`Remove ${v}`}
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          id={id}
          value={text}
          aria-label={label}
          onChange={(e) => {
            const v = e.target.value;
            if (/[,;]/.test(v)) add(v);
            else setText(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (text.trim()) add(text);
            } else if (e.key === "Backspace" && !text && value.length) {
              remove(value.length - 1);
            }
          }}
          onBlur={() => text.trim() && add(text)}
          onPaste={(e) => {
            const p = e.clipboardData.getData("text");
            if (/[,;\n]/.test(p)) {
              e.preventDefault();
              add(p);
            }
          }}
          className="h-6 min-w-[8rem] flex-1 bg-transparent px-1 text-sm text-ink outline-none"
          autoComplete="off"
        />
      </div>
      {open.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[13px] text-ink-3">Common:</span>
          {open.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onChange([...value, s])}
              className="inline-flex h-7 items-center gap-1 rounded-md border border-dashed border-rule-2 px-2 text-[13px] font-medium text-ink-2 transition-colors hover:border-ink-4/60 hover:bg-canvas hover:text-ink"
            >
              <Plus className="size-3" aria-hidden /> {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** A setting with a switch: title, one line of explanation, and optional content when on. */
export function SwitchRow({
  id,
  checked,
  onChange,
  title,
  description,
  children,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("rounded-lg border px-4 py-3.5 transition-colors", checked ? "border-rule-2 bg-paper" : "border-rule bg-paper")}>
      <div className="flex items-start justify-between gap-4">
        <label htmlFor={id} className="min-w-0 cursor-pointer">
          <span className="block text-sm font-semibold text-ink">{title}</span>
          <span className="mt-0.5 block text-[13px] leading-5 text-ink-3">{description}</span>
        </label>
        <Switch id={id} checked={checked} onCheckedChange={onChange} className="mt-0.5" />
      </div>
      {checked && children && <div className="mt-3.5 border-t border-rule pt-3.5">{children}</div>}
    </div>
  );
}
