"use client";

import * as React from "react";
import type { Currency, Money } from "@/domain/types";
import { cn } from "@/lib/utils";
import { controlBase } from "@/components/ui/input";

/**
 * Amount entry: currency code fixed at the left, figures right-aligned and tabular.
 * Accepts "1,250,000" or "1450.5"; reformats on blur. Value is integer minor units.
 */
export function MoneyInput({
  value,
  onChange,
  currency,
  onCurrencyChange,
  id,
  placeholder = "0",
  invalid,
  disabled,
  readOnly,
  allowNegative = false,
  className,
  autoFocus,
  "aria-label": ariaLabel,
}: {
  value: number | null;
  onChange: (minor: number | null) => void;
  currency: Currency;
  /** When given, the currency code becomes a toggle between TZS and USD. */
  onCurrencyChange?: (c: Currency) => void;
  id?: string;
  placeholder?: string;
  invalid?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  allowNegative?: boolean;
  className?: string;
  autoFocus?: boolean;
  "aria-label"?: string;
}) {
  const fmt = React.useCallback(
    (minor: number | null) => {
      if (minor === null) return "";
      const v = minor / 100;
      return currency === "TZS"
        ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(v))
        : new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
    },
    [currency],
  );
  const [text, setText] = React.useState("");
  const [focused, setFocused] = React.useState(false);
  const display = focused ? text : fmt(value);

  const parse = (s: string): number | null => {
    const cleaned = s.replace(/[,\s]/g, "");
    if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
    const n = Number(cleaned);
    if (!Number.isFinite(n)) return null;
    const minor = Math.round(n * 100);
    return !allowNegative && minor < 0 ? Math.abs(minor) : minor;
  };

  return (
    <div
      className={cn(
        controlBase,
        "flex h-9 items-stretch overflow-hidden p-0 focus-within:border-brand focus-within:shadow-[0_0_0_3px_color-mix(in_oklab,var(--brand-400)_22%,transparent)]",
        invalid && "border-destructive",
        (disabled || readOnly) && "bg-canvas",
        className,
      )}
    >
      {onCurrencyChange && !disabled && !readOnly ? (
        <button
          type="button"
          onClick={() => onCurrencyChange(currency === "TZS" ? "USD" : "TZS")}
          className="flex items-center border-r border-rule bg-canvas px-2 text-xs font-semibold tracking-wide text-ink-2 hover:bg-canvas-2 hover:text-ink"
          title="Switch currency"
          aria-label={`Currency ${currency}, click to switch`}
        >
          {currency}
        </button>
      ) : (
        <span className="flex items-center border-r border-rule bg-canvas px-2 text-xs font-semibold tracking-wide text-ink-3">{currency}</span>
      )}
      <input
        id={id}
        inputMode="decimal"
        autoComplete="off"
        autoFocus={autoFocus}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        readOnly={readOnly}
        placeholder={placeholder}
        value={display}
        onFocus={(e) => {
          // Keep the visible text as is and select it now, so fast typing replaces it cleanly.
          setFocused(true);
          setText(e.target.value);
          e.target.select();
        }}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          const s = e.target.value.replace(allowNegative ? /[^\d.,\-]/g : /[^\d.,]/g, "");
          setText(s);
          onChange(parse(s));
        }}
        className="tnum min-w-0 flex-1 bg-transparent px-2.5 text-right text-sm outline-none placeholder:text-ink-4 disabled:cursor-not-allowed"
      />
    </div>
  );
}

/** Read-only computed amount, styled to sit in a form next to MoneyInputs. */
export function MoneyReadout({ value, className, strong }: { value: Money; className?: string; strong?: boolean }) {
  const v = value.amountMinor / 100;
  const s =
    value.currency === "TZS"
      ? new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(Math.round(v))
      : new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v);
  return (
    <div className={cn("flex h-9 items-center justify-between rounded-lg border border-dashed border-rule-2 px-2.5 text-sm", className)}>
      <span className="text-xs font-semibold tracking-wide text-ink-3">{value.currency}</span>
      <span className={cn("tnum", strong && "font-semibold")}>{value.amountMinor < 0 ? "−" + s.replace("-", "") : s}</span>
    </div>
  );
}
