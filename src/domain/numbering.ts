import type { DbState, NumberSeries, Settings } from "./types";
import { darYear } from "./dates";

/**
 * Document numbering (spec §6.3, Settings → Numbering). Format: `${prefix}-${yyyy}-${zeroPad(n, pad)}`,
 * e.g. AP-2026-000123, INV-2026-00088. The year is the Dar es Salaam calendar year of `now`.
 * Counters are simple running numbers per series.
 */

export const zeroPad = (n: number, pad: number): string => String(n).padStart(pad, "0");

export function formatNumber(prefix: string, year: number, n: number, pad: number): string {
  return `${prefix}-${year}-${zeroPad(n, pad)}`;
}

export function nextNumber(
  state: Pick<DbState, "counters" | "settings">,
  series: NumberSeries,
  now: Date,
): { number: string; counters: Record<NumberSeries, number> } {
  const n = (state.counters[series] ?? 0) + 1;
  const { prefix, pad } = state.settings.numbering[series];
  return { number: formatNumber(prefix, darYear(now), n, pad), counters: { ...state.counters, [series]: n } };
}

/** What the next number of a series will look like (Settings → Numbering preview). */
export function previewNumber(settings: Pick<Settings, "numbering">, counters: Record<NumberSeries, number>, series: NumberSeries, now: Date): string {
  const { prefix, pad } = settings.numbering[series];
  return formatNumber(prefix, darYear(now), (counters[series] ?? 0) + 1, pad);
}
