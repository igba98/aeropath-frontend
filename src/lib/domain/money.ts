import type { Currency } from "./types";

export const MINOR_UNITS: Record<Currency, number> = { TZS: 0, USD: 2 };

/** Fixed FX table for the prototype (flow spec §9.1). 1 USD = 2,600 TZS */
export const FX: Record<Currency, Record<Currency, number>> = {
  TZS: { TZS: 1, USD: 1 / 2600 },
  USD: { USD: 1, TZS: 2600 },
};

export function convertMinor(amountMinor: number, from: Currency, to: Currency): number {
  if (from === to) return amountMinor;
  const major = amountMinor / 10 ** MINOR_UNITS[from];
  const converted = major * FX[from][to];
  return Math.round(converted * 10 ** MINOR_UNITS[to]);
}

export function formatMoney(minor: number, currency: Currency, opts: { locale?: string; showCurrency?: boolean; compact?: boolean } = {}): string {
  const digits = MINOR_UNITS[currency];
  const value = minor / 10 ** digits;
  const { locale = "en-TZ", showCurrency = true, compact = false } = opts;
  if (compact && Math.abs(value) >= 1_000_000) {
    return `${showCurrency ? currency + " " : ""}${(value / 1_000_000).toFixed(1)}M`;
  }
  const f = new Intl.NumberFormat(locale, {
    style: showCurrency ? "currency" : "decimal",
    currency,
    currencyDisplay: "code",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
  // Intl renders "TZS 480,000" with a nbsp — normalise
  return f.replace(/ /g, " ");
}

export function pct(part: number, whole: number): number {
  if (!whole) return 0;
  return Math.round((part / whole) * 1000) / 10;
}
