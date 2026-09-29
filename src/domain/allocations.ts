import type { Currency, Money } from "./types";
import { convert, money } from "./money";

/**
 * Allocation checks (spec §15): allocations must add up to the payment amount after FX, within 1 minor unit.
 * The comparison is made in whichever direction is exact enough: a TZS payment split onto USD bookings is compared
 * in USD cents, so rounding to the cent never blocks a correct allocation.
 */

export const ALLOCATION_TOLERANCE_MINOR = 1;

function sumIn(list: Money[], currency: Currency): number {
  return list.filter((m) => m.currency === currency).reduce((s, m) => s + m.amountMinor, 0);
}

export function allocationsMatchAmount(amount: Money, allocations: Money[], usdTzs: number): boolean {
  const other: Currency = amount.currency === "TZS" ? "USD" : "TZS";
  const residual = amount.amountMinor - sumIn(allocations, amount.currency);
  const otherSum = sumIn(allocations, other);
  if (!allocations.some((a) => a.currency === other)) return Math.abs(residual) <= ALLOCATION_TOLERANCE_MINOR;
  const residualInOther = convert(money(residual, amount.currency), other, usdTzs).amountMinor;
  const otherInPayment = convert(money(otherSum, other), amount.currency, usdTzs).amountMinor;
  return Math.abs(residualInOther - otherSum) <= ALLOCATION_TOLERANCE_MINOR || Math.abs(otherInPayment - residual) <= ALLOCATION_TOLERANCE_MINOR;
}

/** Total of allocations expressed in `currency` (for messages and previews). */
export function allocationsTotal(allocations: Money[], currency: Currency, usdTzs: number): Money {
  return money(
    allocations.reduce((s, m) => s + convert(m, currency, usdTzs).amountMinor, 0),
    currency,
  );
}
