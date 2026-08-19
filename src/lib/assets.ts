import { products as productFixtures } from "./fixtures/products";
import type { Vertical } from "./domain/types";

/**
 * The bridge between catalogue data and the real photography in `public/img`.
 *
 * Products carry a stable slug, so the mapping lives here rather than in the fixtures — an
 * image can be re-shot or re-cropped without touching the domain data. Anything unmapped falls
 * back deterministically (never at random, which would reshuffle on every render) so a new
 * product still gets a sensible picture the moment it is created.
 */

const P = "/img/stays";
const A = "/img/airlines";

/** Product slug → photo name in `public/img/stays`. */
const PHOTO_BY_SLUG: Record<string, string> = {
  // Stays — resort and beach photography fits these directly.
  "serengeti-serena-safari-lodge": "pool-villa",
  "kubu-kubu-tented-camp": "atoll-bungalow",
  "zuri-zanzibar": "beach-chairs",
  "gran-melia-arusha": "hotel-pool",
  "ngorongoro-crater-lodge": "resort-spa",
  "ngorongoro-farm-house": "palms-pool",
  "park-hyatt-zanzibar": "beach-pool",
  "kilimanjaro-view-cottages": "swimming-pool",

  // Tours. NOTE: the supplied library has no safari, bush or mountain photography, so these are
  // the least-wrong frames available (wide sunsets and streetscapes rather than swimming pools).
  // Drop safari/Kilimanjaro images into public/hotels, add them to scripts/optimize-images.mjs,
  // and point these three keys at them — nothing else needs to change.
  "7-day-northern-circuit-safari": "resort-sunset",
  "kilimanjaro-machame-7-days": "palm-promenade",
  "3-day-tarangire-manyara": "resort-pools",
  "serengeti-hot-air-balloon": "sea-house",
  "stone-town-spice-farm-day-tour": "town-square",

  // Transfers and car hire — streetscapes and arrival points.
  "jro-arusha-transfer": "town-square-evening",
  "dar-airport-city-transfer": "city-night",
  "znz-kendwa-nungwi-transfer": "beach-patio",
  "zanzibar-jimny-hire": "beach-guest",
  "arusha-serengeti-road-transfer": "resort-sunset",
};

/** Everything available, used as the deterministic fallback pool. */
const ALL_PHOTOS = [
  "pool-villa", "atoll-bungalow", "beach-chairs", "hotel-pool", "sea-house", "palms-pool",
  "beach-pool", "resort-spa", "resort-sunset", "palm-promenade", "town-square", "resort-pools",
  "beach-patio", "town-square-evening", "city-night", "beach-guest", "swimming-pool",
];

/** Carrier name or IATA code → logo in `public/img/airlines`. */
const LOGO_BY_CARRIER: Record<string, string> = {
  "precision air": "precision-air",
  pw: "precision-air",
  "coastal aviation": "coastal-aviation",
  cq: "coastal-aviation",
  "air tanzania": "air-tanzania",
  tc: "air-tanzania",
  "kenya airways": "kenya-airways",
  kq: "kenya-airways",
  "ethiopian airlines": "ethiopian-airlines",
  et: "ethiopian-airlines",
  "british airways": "british-airways",
  ba: "british-airways",
  "qatar airways": "qatar-airways",
  qr: "qatar-airways",
  emirates: "emirates",
  ek: "emirates",
  "turkish airlines": "turkish-airlines",
  tk: "turkish-airlines",
  qantas: "qantas",
  swiss: "swiss",
  lufthansa: "lufthansa",
  lh: "lufthansa",
  ryanair: "ryanair",
  "south african airways": "south-african-airways",
  srilankan: "srilankan",
  "virgin atlantic": "virgin-atlantic",
  "air canada": "air-canada",
  "air india": "air-india",
};

/**
 * Product id → slug, built once from the catalogue.
 *
 * Screens reach for photography with whatever key they happen to hold — a slug on a product
 * page, an id on a booking item whose snapshot never captured the slug. Resolving both here is
 * what stops the same lodge showing one photo in search and a different one in My Trips.
 */
const SLUG_BY_ID: Record<string, string> = Object.fromEntries(
  productFixtures.map((p) => [p.id, p.slug]),
);

/** Stable small hash, so an unmapped product keeps the same photo across renders and reloads. */
function hash(input: string): number {
  let h = 0;
  for (const ch of input) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

export interface Photo {
  /** Default `src` — the mid width. */
  src: string;
  /** Width-descriptor srcset so the browser picks by layout width, not guesswork. */
  srcSet: string;
}

function photo(name: string): Photo {
  return {
    src: `${P}/${name}-960.webp`,
    srcSet: `${P}/${name}-480.webp 480w, ${P}/${name}-960.webp 960w, ${P}/${name}-1600.webp 1600w`,
  };
}

/** The photo for a product, by slug or id. Always returns something. */
export function productPhoto(key?: string, index = 0): Photo {
  const slug = key ? SLUG_BY_ID[key] ?? key : undefined;
  const mapped = slug ? PHOTO_BY_SLUG[slug] : undefined;
  if (mapped && index === 0) return photo(mapped);
  // Gallery positions after the first, and unmapped products, walk the pool deterministically.
  const seed = hash((slug ?? "aeropath") + ":" + index);
  return photo(ALL_PHOTOS[seed % ALL_PHOTOS.length]);
}

/** The logo for an airline, by carrier name or IATA code. Undefined when we have no artwork. */
export function airlineLogo(carrierOrCode?: string): string | undefined {
  if (!carrierOrCode) return undefined;
  const name = LOGO_BY_CARRIER[carrierOrCode.trim().toLowerCase()];
  return name ? `${A}/${name}.webp` : undefined;
}

/** True when a vertical is normally shown with photography rather than a logo. */
export const usesPhotography = (v: Vertical) => v !== "flight";
