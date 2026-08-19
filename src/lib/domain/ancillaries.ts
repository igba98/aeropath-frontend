import type { BagOffer, SeatClass, SeatRow } from "./types";

/**
 * Seat maps and baggage offers.
 *
 * In production these come back from Amadeus per offer. Here they are generated from the flight
 * id so a cabin is stable: the same flight always shows the same occupied seats, on every render
 * and after a reload. Nothing uses `Math.random()`, which would reshuffle the map underneath a
 * traveller mid-selection.
 */

function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** A deterministic 0–1 value for a given seat on a given flight. */
function noise(flightId: string, row: number, letter: string): number {
  return (hash(`${flightId}:${row}${letter}`) % 1000) / 1000;
}

export const EXTRA_LEGROOM_MINOR = 167_310;

/**
 * The economy cabin for a flight: rows 30–44 in a 3-3-3 layout, with the exit row and the row
 * behind it sold as extra legroom.
 */
export function seatMap(flightId: string, opts?: { fromRow?: number; toRow?: number }): SeatRow[] {
  const from = opts?.fromRow ?? 30;
  const to = opts?.toRow ?? 44;
  const letters = ["A", "B", "C", null, "D", "E", "F", null, "H", "J", "K"] as const;
  const rows: SeatRow[] = [];

  for (let row = from; row <= to; row++) {
    const exit = row === from;
    // The last row is usually a short galley row.
    const isBackRow = row === to;
    rows.push({
      row,
      exit,
      seats: letters.map((letter) => {
        if (letter === null) return null;
        if (isBackRow && !["D", "E", "F"].includes(letter)) return null;
        const n = noise(flightId, row, letter);
        const legroom = exit || row === from + 1;
        const klass: SeatClass = n < 0.22 ? "occupied" : legroom ? "extra_legroom" : "standard";
        return {
          letter,
          klass,
          priceMinor: klass === "extra_legroom" ? EXTRA_LEGROOM_MINOR : 0,
        };
      }),
    });
  }
  return rows;
}

/** Find a seat's class and price without walking the whole map. */
export function seatAt(flightId: string, code: string): { klass: SeatClass; priceMinor: number } | undefined {
  const row = Number(code.slice(0, -1));
  const letter = code.slice(-1);
  return seatMap(flightId).find((r) => r.row === row)?.seats.find((s) => s?.letter === letter) ?? undefined;
}

/**
 * Baggage offers for a cabin. One free cabin bag is always included — charging for a personal
 * item is the kind of thing that makes a fare look dishonest at the last step.
 */
export function bagOffers(cabin: "economy" | "business" = "economy"): BagOffer[] {
  const business = cabin === "business";
  return [
    { id: "bag_personal", kind: "cabin", label: "Small personal bag", weightKg: 7, dimensions: "40x20x25 cm", priceMinor: 0, includedInFare: true },
    { id: "bag_priority", kind: "cabin", label: "Priority cabin bag", weightKg: 10, dimensions: "55x40x20 cm", priceMinor: business ? 0 : 62_000, includedInFare: business },
    { id: "bag_checked_15", kind: "checked", label: "Checked bag", weightKg: 15, dimensions: "70x45x25 cm", priceMinor: business ? 0 : 78_000, includedInFare: business },
    { id: "bag_checked_23", kind: "checked", label: "Checked bag", weightKg: 23, dimensions: "78x28x52 cm", priceMinor: business ? 0 : 124_000 },
    { id: "bag_checked_32", kind: "checked", label: "Heavy checked bag", weightKg: 32, dimensions: "78x28x52 cm", priceMinor: 198_000 },
  ];
}
