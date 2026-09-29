import type { Currency, FlightDetails, LineType, Money, Pricing, ServiceLine, Settings } from "./types";
import { add, convert, CurrencyMismatchError, fxFactor, mul, roundHalfUp, sub, sum, zero } from "./money";

/**
 * Pricing rules (spec §8.2).
 *
 *   flight cost = fare.totalFare − fare.totalFare × commissionPct   (non-flight: cost is typed)
 *   vat base    = serviceFee (+ markup when settings.vatBase = 'service_fee_and_markup'), never below 0
 *   vat         = round(vat base × vatRate)
 *   sell        = cost + markup + serviceFee + vat
 *   margin      = markup + serviceFee   (VAT is not margin)
 */

export type PricingSettings = Pick<Settings, "vatRate" | "vatBase" | "defaultServiceFee" | "fx">;

export interface PricingInput {
  /** Pricing currency. Ignored for flights with a fare: a flight is priced in its fare currency. */
  currency: Currency;
  /** Net cost payable to the supplier. Ignored for flights with a fare (computed from the fare). */
  cost?: Money;
  /** Agency markup; may be negative (selling below cost needs a Manager override). */
  markup: Money;
  /** Visible agency service fee. When omitted, defaults from settings.defaultServiceFee[type]. */
  serviceFee?: Money;
  /** File-currency units per 1 line-currency unit, captured when the line and file currencies differ. */
  fxToFile?: number;
  /** Flight fare; when present, cost is derived from it. */
  fare?: Pick<FlightDetails["fare"], "totalFare" | "commissionPct">;
}

/** Flight net cost: totalFare − round(totalFare × commissionPct). */
export function flightCost(fare: Pick<FlightDetails["fare"], "totalFare" | "commissionPct">): Money {
  return sub(fare.totalFare, mul(fare.totalFare, fare.commissionPct || 0));
}

export function computeVat(serviceFee: Money, markup: Money, settings: Pick<Settings, "vatRate" | "vatBase">): Money {
  let base = serviceFee;
  if (settings.vatBase === "service_fee_and_markup") base = add(base, markup);
  if (base.amountMinor <= 0) return zero(base.currency);
  return mul(base, settings.vatRate);
}

/** The settings default service fee for a line type, converted into `currency` at the settings rate. */
export function defaultServiceFeeFor(type: LineType, currency: Currency, settings: Pick<Settings, "defaultServiceFee" | "fx">): Money {
  const fee = settings.defaultServiceFee[type];
  return fee ? convert(fee, currency, settings.fx.USD_TZS) : zero(currency);
}

export function computePricing(input: PricingInput, settings: PricingSettings, type: LineType): Pricing {
  const rate = settings.fx.USD_TZS;
  const isFlightWithFare = type === "flight" && !!input.fare;
  const currency: Currency = isFlightWithFare ? input.fare!.totalFare.currency : input.currency;
  const inCur = (m: Money) => convert(m, currency, rate);

  const cost = isFlightWithFare ? flightCost(input.fare!) : input.cost ? inCur(input.cost) : zero(currency);
  const markup = inCur(input.markup);
  const serviceFee = input.serviceFee ? inCur(input.serviceFee) : defaultServiceFeeFor(type, currency, settings);
  const vat = computeVat(serviceFee, markup, settings);
  const sell = sum([cost, markup, serviceFee, vat], currency);

  const pricing: Pricing = { currency, cost, markup, serviceFee, vat, sell };
  if (input.fxToFile !== undefined) pricing.fxToFile = input.fxToFile;
  return pricing;
}

export const margin = (p: Pick<Pricing, "markup" | "serviceFee">): Money => add(p.markup, p.serviceFee);

/** True when the selling price is below the net cost (only possible with a negative markup). */
export const isBelowCost = (p: Pick<Pricing, "sell" | "cost">): boolean => p.sell.amountMinor < p.cost.amountMinor;

/** fxToFile to capture for a line priced in `lineCurrency` inside a file invoiced in `fileCurrency` (undefined when equal). */
export function fxToFileFor(lineCurrency: Currency, fileCurrency: Currency, usdTzs: number): number | undefined {
  return lineCurrency === fileCurrency ? undefined : fxFactor(lineCurrency, fileCurrency, usdTzs);
}

/**
 * Converts a line-currency amount into the file currency using the rate captured on the line (`fxToFile`),
 * or the fallback settings rate `usdTzs` when the line has none.
 */
export function toFileMoney(m: Money, fileCurrency: Currency, fxToFile: number | undefined, usdTzs?: number): Money {
  if (m.currency === fileCurrency) return m;
  if (fxToFile !== undefined && fxToFile > 0) return { amountMinor: roundHalfUp(m.amountMinor * fxToFile), currency: fileCurrency };
  if (usdTzs === undefined) throw new CurrencyMismatchError(m.currency, fileCurrency);
  return convert(m, fileCurrency, usdTzs);
}

/** A line's selling price in its file's currency (rate saved on the line; `usdTzs` is the fallback). */
export function lineSellInFileCurrency(line: Pick<ServiceLine, "pricing">, fileCurrency: Currency, usdTzs?: number): Money {
  return toFileMoney(line.pricing.sell, fileCurrency, line.pricing.fxToFile, usdTzs);
}

/** Converts every amount of a pricing into the file currency (for totals and documents). */
export function pricingInFileCurrency(p: Pricing, fileCurrency: Currency, usdTzs?: number): Pick<Pricing, "cost" | "markup" | "serviceFee" | "vat" | "sell"> {
  const f = (m: Money) => toFileMoney(m, fileCurrency, p.fxToFile, usdTzs);
  return { cost: f(p.cost), markup: f(p.markup), serviceFee: f(p.serviceFee), vat: f(p.vat), sell: f(p.sell) };
}

/** True when two pricings carry the same amounts (used to keep an existing below-cost override when nothing changed). */
export function samePricingAmounts(a: Pricing, b: Pricing): boolean {
  const keys = ["cost", "markup", "serviceFee", "vat", "sell"] as const;
  return a.currency === b.currency && keys.every((k) => a[k].amountMinor === b[k].amountMinor && a[k].currency === b[k].currency);
}
