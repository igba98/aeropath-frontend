import type { Currency, Money } from "./types";

/**
 * Money helpers (spec §8.1). Integers only: `amountMinor` with exponent 2 for both TZS and USD.
 * Mixed-currency arithmetic throws unless converted first.
 */

export const money = (amountMinor: number, currency: Currency): Money => ({ amountMinor: Math.round(amountMinor), currency });
export const zero = (currency: Currency): Money => ({ amountMinor: 0, currency });
/** Major units → Money, e.g. major(1450, 'USD') = USD 1,450.00 */
export const major = (amount: number, currency: Currency): Money => money(roundHalfUp(amount * 100), currency);
export const toMajor = (m: Money): number => m.amountMinor / 100;

export class CurrencyMismatchError extends Error {
  constructor(a: Currency, b: Currency) {
    super(`Cannot combine ${a} and ${b} without converting first`);
  }
}

function same(a: Money, b: Money) {
  if (a.currency !== b.currency) throw new CurrencyMismatchError(a.currency, b.currency);
}

/** Round half away from zero to an integer (half-up for positives). */
export function roundHalfUp(x: number): number {
  // Guard against binary float noise like 2.4999999999 for 2.5
  const r = Math.round(Math.abs(x) * 1e6) / 1e6;
  return Math.sign(x) * Math.floor(r + 0.5);
}

export const add = (a: Money, b: Money): Money => (same(a, b), { amountMinor: a.amountMinor + b.amountMinor, currency: a.currency });
export const sub = (a: Money, b: Money): Money => (same(a, b), { amountMinor: a.amountMinor - b.amountMinor, currency: a.currency });
export const neg = (a: Money): Money => ({ amountMinor: -a.amountMinor, currency: a.currency });
export const mul = (a: Money, factor: number): Money => ({ amountMinor: roundHalfUp(a.amountMinor * factor), currency: a.currency });
export const isZero = (a: Money) => a.amountMinor === 0;
export const isNeg = (a: Money) => a.amountMinor < 0;
export const isPos = (a: Money) => a.amountMinor > 0;
export const abs = (a: Money): Money => ({ amountMinor: Math.abs(a.amountMinor), currency: a.currency });
export const compare = (a: Money, b: Money): -1 | 0 | 1 => {
  same(a, b);
  return a.amountMinor === b.amountMinor ? 0 : a.amountMinor < b.amountMinor ? -1 : 1;
};
export const min = (a: Money, b: Money): Money => (compare(a, b) <= 0 ? a : b);
export const max = (a: Money, b: Money): Money => (compare(a, b) >= 0 ? a : b);

export function sum(list: Money[], currency: Currency): Money {
  return list.reduce((acc, m) => add(acc, m), zero(currency));
}

/**
 * Convert between TZS and USD. `usdTzs` is TZS per 1 USD (settings.fx.USD_TZS).
 * Same-currency conversion is the identity.
 */
export function convert(m: Money, to: Currency, usdTzs: number): Money {
  if (m.currency === to) return m;
  if (m.currency === "USD" && to === "TZS") return { amountMinor: roundHalfUp(m.amountMinor * usdTzs), currency: "TZS" };
  if (m.currency === "TZS" && to === "USD") return { amountMinor: roundHalfUp(m.amountMinor / usdTzs), currency: "USD" };
  throw new CurrencyMismatchError(m.currency, to);
}

/** Factor to multiply a `from` amount by to get `to` units, given TZS per USD. */
export function fxFactor(from: Currency, to: Currency, usdTzs: number): number {
  if (from === to) return 1;
  return from === "USD" ? usdTzs : 1 / usdTzs;
}

const nfTZS = new Intl.NumberFormat("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const nfUSD = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Number only, no code: TZS "1,250,000" · USD "1,450.00". Negative with a leading minus sign. */
export function formatAmount(m: Money): string {
  const v = m.amountMinor / 100;
  const s = m.currency === "TZS" ? nfTZS.format(Math.abs(roundHalfUp(v))) : nfUSD.format(Math.abs(v));
  return (m.amountMinor < 0 ? "−" : "") + s;
}

/** "TZS 1,250,000" · "USD 1,450.00" */
export function format(m: Money): string {
  const s = formatAmount(m);
  return s.startsWith("−") ? `−${m.currency} ${s.slice(1)}` : `${m.currency} ${s}`;
}

/** Parse a user-typed major amount ("1,450.5" → 145050 minor). Returns null when not a number. */
export function parseMajor(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === "number") return Number.isFinite(input) ? roundHalfUp(input * 100) : null;
  const cleaned = input.replace(/[,\s]/g, "").replace(/^(TZS|USD)/i, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? roundHalfUp(n * 100) : null;
}

/** English words for receipts: "One million two hundred fifty thousand Tanzanian shillings". */
export function amountInWords(m: Money): string {
  const ones = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
  const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  const chunk = (n: number): string => {
    const h = Math.floor(n / 100);
    const r = n % 100;
    const parts: string[] = [];
    if (h) parts.push(`${ones[h]} hundred`);
    if (r) parts.push(r < 20 ? ones[r] : `${tens[Math.floor(r / 10)]}${r % 10 ? "-" + ones[r % 10] : ""}`);
    return parts.join(" ");
  };
  const words = (n: number): string => {
    if (n === 0) return "zero";
    const scales: [number, string][] = [
      [1e9, "billion"],
      [1e6, "million"],
      [1e3, "thousand"],
    ];
    const out: string[] = [];
    let rest = n;
    for (const [v, name] of scales) {
      if (rest >= v) {
        out.push(`${chunk(Math.floor(rest / v))} ${name}`);
        rest %= v;
      }
    }
    if (rest) out.push(chunk(rest));
    return out.join(" ");
  };
  const whole = Math.floor(Math.abs(m.amountMinor) / 100);
  const cents = Math.abs(m.amountMinor) % 100;
  const unit = m.currency === "TZS" ? "Tanzanian shillings" : "US dollars";
  let s = `${words(whole)} ${unit}`;
  if (m.currency === "USD" && cents) s += ` and ${words(cents)} cents`;
  return s.charAt(0).toUpperCase() + s.slice(1);
}
