/**
 * Hotel search for the demo: a small portfolio of partner hotels with nightly rates generated per date.
 * Three hotels are direct contracts (the seeded hotel suppliers); the rest are sold through a bed bank.
 * Deterministic for a given search, like ./flights.ts. Names are fictional.
 */
import type { Board, HotelDetails, ISODate, ISODateTime, Money } from "@/domain/types";
import { addDaysIso, darLocalToUtcIso, diffDaysIso } from "@/providers/util/dates";
import { seeded } from "./network";

export const BED_BANK_SUPPLIER = "EA Hotel Bank";

export interface HotelDestination {
  code: string;
  name: string;
  country: string;
  hint: string;
}

export const HOTEL_DESTINATIONS: HotelDestination[] = [
  { code: "ZNZ", name: "Zanzibar", country: "Tanzania", hint: "Stone Town, Nungwi, Kendwa, Paje" },
  { code: "DAR", name: "Dar es Salaam", country: "Tanzania", hint: "Masaki, Oyster Bay, city centre" },
  { code: "ARK", name: "Arusha", country: "Tanzania", hint: "Safari gateway, Usa River" },
  { code: "SEU", name: "Serengeti", country: "Tanzania", hint: "Tented camps and lodges" },
  { code: "JRO", name: "Moshi and Kilimanjaro", country: "Tanzania", hint: "Moshi town, Marangu" },
  { code: "MFA", name: "Mafia Island", country: "Tanzania", hint: "Marine park, diving" },
  { code: "MWZ", name: "Mwanza", country: "Tanzania", hint: "Lake Victoria" },
  { code: "DOD", name: "Dodoma", country: "Tanzania", hint: "Capital, business" },
  { code: "DXB", name: "Dubai", country: "United Arab Emirates", hint: "Deira, Palm Jumeirah" },
  { code: "NBO", name: "Nairobi", country: "Kenya", hint: "Westlands" },
];

export const findDestination = (code: string | null | undefined) => HOTEL_DESTINATIONS.find((d) => d.code === code);

export type Amenity = "wifi" | "pool" | "breakfast" | "restaurant" | "airport_transfer" | "spa" | "beach" | "parking" | "gym" | "family" | "game_drives";

export const AMENITY_LABEL: Record<Amenity, string> = {
  wifi: "Free Wi-Fi",
  pool: "Pool",
  breakfast: "Breakfast available",
  restaurant: "Restaurant",
  airport_transfer: "Airport transfer",
  spa: "Spa",
  beach: "On the beach",
  parking: "Free parking",
  gym: "Gym",
  family: "Family rooms",
  game_drives: "Game drives",
};

export const BOARD_LABEL: Record<Board, string> = {
  RO: "Room only",
  BB: "Breakfast included",
  HB: "Breakfast and dinner",
  FB: "All meals",
  AI: "All inclusive",
};

/** Supplement per adult per night on top of the room rate, USD. */
const BOARD_SUPPLEMENT: Record<Board, number> = { RO: 0, BB: 12, HB: 32, FB: 50, AI: 78 };

export interface RoomType {
  id: string;
  name: string;
  bed: string;
  sizeM2: number;
  maxAdults: number;
  maxChildren: number;
  /** Average nightly rate for the room, USD. */
  nightly: number;
}

export interface HotelProperty {
  id: string;
  name: string;
  destination: string;
  area: string;
  stars: 2 | 3 | 4 | 5;
  rating: number;
  reviews: number;
  images: string[];
  amenities: Amenity[];
  blurb: string;
  /** Direct contract: the supplier record with this name. Otherwise sold through the bed bank. */
  supplierName?: string;
  boards: Board[];
  /** Free cancellation up to this many days before check-in on refundable rates. */
  cancelDays: number;
  rooms: RoomType[];
}

/** Web-sized copies of the photos in public/hotels (originals are kept out of git). */
const img = (f: string) => `/images/hotels/${f}`;
const BEACH = img("beautiful-beach-chairs-sandy-beach-near-sea-summer-holiday-vacation-concept.jpg");
const PROMENADE = img("beautiful-promenade-with-palm-trees-marmaris.jpg");
const PATIO = img("empty-wood-chair-table-outdoor-patio-with-beautiful-tropical-beach-sea.jpg");
const POOL = img("hotel-pool.jpg");
const CITY_NIGHT = img("miami-south-beach-street-view-with-water-reflections-night.jpg");
const RESORT_POOL = img("palms-rocks-against-swimming-pool-morning-mediterranean-summer-resort-hotel-turkey-bodrum.jpg");
const SQUARE_EVENING = img("placa-del-ajuntament-summer-evening-valencia.jpg");
const SQUARE = img("placa-del-ajuntament-valencia-spain.jpg");
const POOL_VILLA = img("pool-villa-are-located-heart-resort.jpg");
const BIG_RESORT = img("popular-resort-amara-dolce-vita-luxury-hotel-with-pools-water-parks-recreational-area-along-sea-coast-turkey-sunset-tekirova-kemer.jpg");
const BUNGALOW = img("rest-sunshine-atoll-bungalow-holiday.jpg");
const SEA_HOUSE = img("sea-house-resort-exotic-sky.jpg");
const SPA = img("sky-summer-resort-nobody-spa.jpg");
const LUX_POOL = img("swimming-pool-beach-luxury-hotel-type-entertainment-complex-amara-dolce-vita-luxury-hotel-resort-tekirova-kemer-turkey.jpg");
const SWIM = img("swimming-pool.jpg");
const COMPLEX = img("type-entertainment-complex-popular-resort-with-pools-water-parks-turkey-with-more-than-5-million-visitors-year-amara-dolce-vita-luxury-hotel-resort-tekirova-kemer.jpg");

const room = (id: string, name: string, bed: string, sizeM2: number, maxAdults: number, maxChildren: number, nightly: number): RoomType => ({ id, name, bed, sizeM2, maxAdults, maxChildren, nightly });

export const HOTELS: HotelProperty[] = [
  // Zanzibar
  {
    id: "forodhani-heritage",
    name: "Forodhani Heritage Hotel",
    destination: "ZNZ",
    area: "Stone Town",
    stars: 4,
    rating: 8.8,
    reviews: 1243,
    images: [SQUARE_EVENING, PATIO, SWIM],
    amenities: ["wifi", "pool", "restaurant", "airport_transfer", "breakfast"],
    blurb: "Restored merchant house by the Forodhani Gardens, a short walk to the ferry and the night food market.",
    supplierName: "Forodhani Heritage Hotel",
    boards: ["BB", "HB"],
    cancelDays: 3,
    rooms: [room("heritage-double", "Heritage double", "1 king bed", 26, 2, 1, 95), room("sea-view-deluxe", "Sea-view deluxe", "1 king bed", 34, 2, 2, 140), room("sultan-suite", "Sultan suite", "1 king bed and sofa bed", 58, 3, 2, 260)],
  },
  {
    id: "kendwa-sands",
    name: "Kendwa Sands Beach Resort",
    destination: "ZNZ",
    area: "Kendwa",
    stars: 4,
    rating: 8.6,
    reviews: 2210,
    images: [BEACH, SEA_HOUSE, LUX_POOL],
    amenities: ["beach", "pool", "wifi", "restaurant", "spa", "family"],
    blurb: "On the widest swimming beach of the north coast; sunsets over the water and no tide worries.",
    boards: ["BB", "HB", "AI"],
    cancelDays: 7,
    rooms: [room("garden", "Garden room", "1 king or 2 single beds", 32, 2, 2, 120), room("ocean-front", "Ocean-front room", "1 king bed", 38, 2, 2, 175), room("beach-villa", "Beach villa", "2 king beds", 80, 4, 2, 320)],
  },
  {
    id: "nungwi-coral",
    name: "Nungwi Coral Bay Hotel",
    destination: "ZNZ",
    area: "Nungwi",
    stars: 3,
    rating: 8.1,
    reviews: 864,
    images: [BUNGALOW, POOL],
    amenities: ["beach", "pool", "wifi", "restaurant"],
    blurb: "Simple, friendly rooms steps from the dhow harbour and the lively Nungwi beach.",
    boards: ["BB", "HB"],
    cancelDays: 3,
    rooms: [room("standard", "Standard double", "1 double bed", 22, 2, 1, 70), room("deluxe-sea", "Deluxe sea view", "1 king bed", 28, 2, 2, 105)],
  },
  {
    id: "paje-palm",
    name: "Paje Palm Lagoon Lodge",
    destination: "ZNZ",
    area: "Paje",
    stars: 3,
    rating: 8.4,
    reviews: 692,
    images: [PATIO, PROMENADE],
    amenities: ["beach", "wifi", "restaurant", "family"],
    blurb: "Bungalows in a palm garden on the kite-surfing lagoon of the east coast.",
    boards: ["BB", "HB"],
    cancelDays: 5,
    rooms: [room("bungalow", "Garden bungalow", "1 queen bed", 24, 2, 1, 85), room("family-bungalow", "Family bungalow", "1 queen and 2 single beds", 40, 4, 2, 130)],
  },
  {
    id: "matemwe-reef",
    name: "Matemwe Reef Villas",
    destination: "ZNZ",
    area: "Matemwe",
    stars: 5,
    rating: 9.2,
    reviews: 418,
    images: [POOL_VILLA, RESORT_POOL, SPA],
    amenities: ["beach", "pool", "spa", "wifi", "restaurant", "airport_transfer"],
    blurb: "Private pool villas facing Mnemba Atoll; snorkelling and diving from the house reef.",
    boards: ["HB", "FB", "AI"],
    cancelDays: 14,
    rooms: [room("pool-villa", "Pool villa", "1 king bed", 110, 2, 1, 420), room("two-bed-villa", "Two-bedroom pool villa", "2 king beds", 190, 4, 2, 690)],
  },
  {
    id: "spice-route",
    name: "Spice Route Boutique Hotel",
    destination: "ZNZ",
    area: "Stone Town",
    stars: 3,
    rating: 8.3,
    reviews: 537,
    images: [SQUARE, POOL],
    amenities: ["wifi", "breakfast", "restaurant"],
    blurb: "Carved doors and rooftop breakfasts in the heart of the old town.",
    boards: ["RO", "BB"],
    cancelDays: 2,
    rooms: [room("classic", "Classic double", "1 double bed", 18, 2, 0, 65), room("superior", "Superior double", "1 king bed", 24, 2, 1, 88)],
  },
  // Dar es Salaam
  {
    id: "coco-beach-suites",
    name: "Coco Beach Suites",
    destination: "DAR",
    area: "Oyster Bay",
    stars: 4,
    rating: 8.5,
    reviews: 978,
    images: [PROMENADE, POOL, SWIM],
    amenities: ["wifi", "pool", "gym", "parking", "breakfast"],
    blurb: "Serviced suites across from Coco Beach, popular with business travellers and longer stays.",
    supplierName: "Coco Beach Suites",
    boards: ["RO", "BB"],
    cancelDays: 2,
    rooms: [room("studio", "Studio suite", "1 king bed", 36, 2, 1, 130), room("one-bed", "One-bedroom suite", "1 king bed and sofa bed", 58, 3, 2, 185)],
  },
  {
    id: "msasani-bay",
    name: "Msasani Bay Hotel",
    destination: "DAR",
    area: "Masaki",
    stars: 4,
    rating: 8.2,
    reviews: 1320,
    images: [CITY_NIGHT, SWIM],
    amenities: ["wifi", "pool", "restaurant", "gym", "airport_transfer"],
    blurb: "Bay views, a rooftop pool and quick access to Masaki's restaurants.",
    boards: ["RO", "BB", "HB"],
    cancelDays: 2,
    rooms: [room("superior-king", "Superior king", "1 king bed", 30, 2, 1, 110), room("executive", "Executive room", "1 king bed", 42, 2, 2, 160)],
  },
  {
    id: "posta-city-inn",
    name: "Posta City Inn",
    destination: "DAR",
    area: "City centre",
    stars: 3,
    rating: 7.8,
    reviews: 1502,
    images: [SQUARE_EVENING, POOL],
    amenities: ["wifi", "breakfast", "parking"],
    blurb: "Walking distance to the ministries, banks and the Kivukoni ferry.",
    boards: ["RO", "BB"],
    cancelDays: 1,
    rooms: [room("standard", "Standard room", "1 double bed", 20, 2, 0, 58), room("business", "Business room", "1 king bed", 26, 2, 1, 79)],
  },
  {
    id: "jnia-transit",
    name: "JNIA Transit Hotel",
    destination: "DAR",
    area: "Near the airport",
    stars: 3,
    rating: 7.6,
    reviews: 744,
    images: [POOL],
    amenities: ["wifi", "airport_transfer", "restaurant", "parking"],
    blurb: "Five minutes from Terminal 3 with a free shuttle; handy for early flights.",
    boards: ["RO", "BB"],
    cancelDays: 1,
    rooms: [room("standard", "Standard room", "1 double bed", 20, 2, 1, 62)],
  },
  // Arusha
  {
    id: "themi-river-lodge",
    name: "Themi River Lodge",
    destination: "ARK",
    area: "Arusha town",
    stars: 4,
    rating: 8.7,
    reviews: 866,
    images: [SPA, RESORT_POOL, SWIM],
    amenities: ["pool", "wifi", "restaurant", "spa", "airport_transfer"],
    blurb: "Cottages in coffee gardens by the Themi river; the usual first night before safari.",
    supplierName: "Themi River Lodge",
    boards: ["BB", "HB", "FB"],
    cancelDays: 7,
    rooms: [room("garden-cottage", "Garden cottage", "1 king or 2 single beds", 34, 2, 2, 110), room("river-suite", "River suite", "1 king bed", 52, 3, 2, 170)],
  },
  {
    id: "meru-view",
    name: "Mount Meru View Hotel",
    destination: "ARK",
    area: "Usa River",
    stars: 4,
    rating: 8.4,
    reviews: 610,
    images: [RESORT_POOL, POOL],
    amenities: ["pool", "wifi", "restaurant", "family", "parking"],
    blurb: "Views of Mount Meru on a clear morning; halfway between town and Kilimanjaro airport.",
    boards: ["BB", "HB"],
    cancelDays: 5,
    rooms: [room("deluxe", "Deluxe room", "1 king bed", 32, 2, 1, 95), room("family", "Family room", "1 king and 2 single beds", 48, 4, 2, 150)],
  },
  {
    id: "clock-tower",
    name: "Clock Tower Business Hotel",
    destination: "ARK",
    area: "Arusha centre",
    stars: 3,
    rating: 7.9,
    reviews: 488,
    images: [CITY_NIGHT, SWIM],
    amenities: ["wifi", "breakfast", "parking", "gym"],
    blurb: "Central and practical, a few steps from the Clock Tower and the tour operators' offices.",
    boards: ["RO", "BB"],
    cancelDays: 1,
    rooms: [room("standard", "Standard room", "1 double bed", 22, 2, 1, 60), room("executive", "Executive room", "1 king bed", 30, 2, 1, 85)],
  },
  // Serengeti
  {
    id: "acacia-camp",
    name: "Serengeti Acacia Tented Camp",
    destination: "SEU",
    area: "Central Serengeti",
    stars: 4,
    rating: 9.1,
    reviews: 356,
    images: [SPA, POOL_VILLA],
    amenities: ["game_drives", "restaurant", "wifi", "airport_transfer"],
    blurb: "Canvas tents under acacias near Seronera; game drives and airstrip transfers arranged by the camp.",
    boards: ["FB", "AI"],
    cancelDays: 21,
    rooms: [room("luxury-tent", "Luxury tent", "1 king or 2 single beds", 45, 2, 1, 380), room("family-tent", "Family tent", "1 king and 2 single beds", 70, 4, 2, 560)],
  },
  {
    id: "seronera-plains",
    name: "Seronera Plains Lodge",
    destination: "SEU",
    area: "Seronera",
    stars: 4,
    rating: 8.6,
    reviews: 512,
    images: [LUX_POOL, POOL],
    amenities: ["game_drives", "pool", "restaurant", "family"],
    blurb: "Stone-built lodge on a kopje with a pool overlooking the plains.",
    boards: ["FB"],
    cancelDays: 14,
    rooms: [room("standard", "Standard room", "2 single beds", 30, 2, 1, 290), room("family", "Family room", "1 king and 2 single beds", 46, 4, 2, 430)],
  },
  // Moshi and Kilimanjaro
  {
    id: "kibo-gate",
    name: "Kibo Gate Hotel",
    destination: "JRO",
    area: "Moshi town",
    stars: 3,
    rating: 8.2,
    reviews: 903,
    images: [POOL, SWIM],
    amenities: ["pool", "wifi", "restaurant", "parking"],
    blurb: "Climbers' favourite for the night before and after Kilimanjaro, with gear storage.",
    boards: ["BB", "HB"],
    cancelDays: 3,
    rooms: [room("standard", "Standard room", "1 double or 2 single beds", 22, 2, 1, 55), room("mountain-view", "Mountain-view room", "1 king bed", 28, 2, 1, 75)],
  },
  {
    id: "marangu-hillside",
    name: "Marangu Hillside Lodge",
    destination: "JRO",
    area: "Marangu",
    stars: 3,
    rating: 8.5,
    reviews: 344,
    images: [SPA],
    amenities: ["restaurant", "wifi", "family", "parking"],
    blurb: "Cottages on the banana-shaded slopes near the Marangu park gate.",
    boards: ["BB", "HB", "FB"],
    cancelDays: 5,
    rooms: [room("cottage", "Garden cottage", "1 queen bed", 26, 2, 2, 80)],
  },
  // Mafia, Mwanza, Dodoma
  {
    id: "mafia-blue-reef",
    name: "Mafia Blue Reef Lodge",
    destination: "MFA",
    area: "Utende",
    stars: 4,
    rating: 9,
    reviews: 229,
    images: [BUNGALOW, BEACH],
    amenities: ["beach", "restaurant", "airport_transfer", "wifi"],
    blurb: "Beach bungalows inside the marine park; whale sharks from October to March.",
    boards: ["HB", "FB"],
    cancelDays: 14,
    rooms: [room("beach-bungalow", "Beach bungalow", "1 king bed", 40, 2, 1, 210)],
  },
  {
    id: "rock-city-lakeview",
    name: "Rock City Lakeview Hotel",
    destination: "MWZ",
    area: "Capri Point",
    stars: 3,
    rating: 8,
    reviews: 587,
    images: [CITY_NIGHT, SWIM],
    amenities: ["pool", "wifi", "restaurant", "parking"],
    blurb: "Lake Victoria views from every room on the Capri Point peninsula.",
    boards: ["RO", "BB"],
    cancelDays: 2,
    rooms: [room("lake-view", "Lake-view double", "1 king bed", 26, 2, 1, 70), room("suite", "Lake suite", "1 king bed and sofa bed", 44, 3, 2, 120)],
  },
  {
    id: "capital-hill",
    name: "Capital Hill Hotel",
    destination: "DOD",
    area: "Dodoma centre",
    stars: 3,
    rating: 7.7,
    reviews: 412,
    images: [SQUARE, POOL],
    amenities: ["wifi", "restaurant", "parking", "gym"],
    blurb: "Near Parliament and the ministries; meeting rooms and a quiet garden.",
    boards: ["RO", "BB"],
    cancelDays: 1,
    rooms: [room("standard", "Standard room", "1 double bed", 22, 2, 0, 50), room("executive", "Executive room", "1 king bed", 30, 2, 1, 75)],
  },
  // Abroad
  {
    id: "deira-creek",
    name: "Deira Creek Hotel",
    destination: "DXB",
    area: "Deira",
    stars: 4,
    rating: 8.3,
    reviews: 3120,
    images: [CITY_NIGHT, POOL],
    amenities: ["wifi", "pool", "gym", "restaurant", "airport_transfer"],
    blurb: "Close to the gold and spice souks and 15 minutes from the airport; a favourite for shopping trips.",
    boards: ["RO", "BB"],
    cancelDays: 3,
    rooms: [room("deluxe", "Deluxe room", "1 king or 2 single beds", 30, 2, 1, 115), room("club", "Club room", "1 king bed", 38, 2, 2, 165)],
  },
  {
    id: "palm-marina",
    name: "Palm Marina Resort",
    destination: "DXB",
    area: "Palm Jumeirah",
    stars: 5,
    rating: 9,
    reviews: 2455,
    images: [BIG_RESORT, COMPLEX, LUX_POOL],
    amenities: ["beach", "pool", "spa", "gym", "family", "restaurant"],
    blurb: "Private beach, water park and a dozen restaurants on the Palm.",
    boards: ["BB", "HB", "AI"],
    cancelDays: 7,
    rooms: [room("deluxe-sea", "Deluxe sea view", "1 king bed", 45, 2, 2, 290), room("family-suite", "Family suite", "1 king and 2 single beds", 80, 4, 2, 520)],
  },
  {
    id: "westlands-garden",
    name: "Westlands Garden Hotel",
    destination: "NBO",
    area: "Westlands",
    stars: 4,
    rating: 8.4,
    reviews: 1188,
    images: [POOL, SWIM],
    amenities: ["wifi", "pool", "gym", "restaurant", "airport_transfer"],
    blurb: "Garden hotel near the Sarit Centre, 30 minutes from the airport outside rush hour.",
    boards: ["RO", "BB"],
    cancelDays: 2,
    rooms: [room("superior", "Superior room", "1 king bed", 30, 2, 1, 120), room("executive", "Executive room", "1 king bed", 38, 2, 2, 165)],
  },
];

export const findHotel = (id: string | null | undefined) => HOTELS.find((h) => h.id === id);

// ─────────────────────────────── Search and rates ───────────────────────────────

export interface HotelSearch {
  destination: string;
  checkIn: ISODate;
  checkOut: ISODate;
  adults: number;
  children: number;
  rooms: number;
}

export interface RoomRate {
  id: string;
  room: RoomType;
  board: Board;
  refundable: boolean;
  /** Last day to cancel free of charge (refundable rates). */
  freeCancelUntil?: ISODate;
  /** Nightly price for all rooms, USD minor units, one per night. */
  nights: number[];
  total: number;
  /** Rooms of this type still free for the whole stay. */
  left: number;
}

export interface HotelResult {
  hotel: HotelProperty;
  cheapest: RoomRate;
  /** Some rate on this hotel can be cancelled free of charge. */
  freeCancellation: boolean;
  nights: number;
}

const nightsOf = (s: Pick<HotelSearch, "checkIn" | "checkOut">) => Math.max(0, diffDaysIso(s.checkOut, s.checkIn));

/** High season July–October and mid-December to February; long rains April–May are cheaper. */
function seasonFactor(iso: ISODate): number {
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  if (m >= 7 && m <= 10) return 1.18;
  if ((m === 12 && d >= 15) || m === 1 || m === 2) return 1.25;
  if (m === 4 || m === 5) return 0.8;
  return 1;
}

/** Every bookable rate of a hotel for a stay, cheapest first. Rooms that cannot sleep the party are left out. */
export function hotelRates(h: HotelProperty, s: HotelSearch, today: ISODate): RoomRate[] {
  const n = nightsOf(s);
  if (n < 1 || n > 30 || diffDaysIso(s.checkIn, today) < 0) return [];
  const perRoomAdults = Math.ceil(s.adults / Math.max(1, s.rooms));
  const perRoomChildren = Math.ceil(s.children / Math.max(1, s.rooms));
  const rates: RoomRate[] = [];
  for (const rt of h.rooms) {
    if (rt.maxAdults < perRoomAdults || rt.maxChildren < perRoomChildren) continue;
    const avail = seeded(`${h.id}|${rt.id}|${s.checkIn}|${n}`);
    const left = Math.floor(avail() * 7) - 1; // some rooms sell out
    for (const board of h.boards) {
      const nights: number[] = [];
      for (let i = 0; i < n; i++) {
        const date = addDaysIso(s.checkIn, i);
        const wd = new Date(`${date}T12:00:00Z`).getUTCDay();
        const noise = 0.94 + seeded(`${h.id}|${rt.id}|${date}`)() * 0.14;
        const weekend = wd === 5 || wd === 6 ? 1.08 : 1;
        const roomRate = rt.nightly * seasonFactor(date) * weekend * noise;
        const meals = BOARD_SUPPLEMENT[board] * (perRoomAdults + perRoomChildren * 0.5);
        nights.push(Math.round(roomRate + meals) * 100 * s.rooms);
      }
      const total = nights.reduce((a, b) => a + b, 0);
      const cancelBy = addDaysIso(s.checkIn, -h.cancelDays);
      const canCancel = diffDaysIso(cancelBy, today) >= 0;
      if (canCancel) rates.push({ id: `${rt.id}.${board}.free`, room: rt, board, refundable: true, freeCancelUntil: cancelBy, nights, total, left: Math.max(0, left) });
      const nr = nights.map((x) => Math.round((x * 0.88) / 100) * 100);
      rates.push({ id: `${rt.id}.${board}.nr`, room: rt, board, refundable: false, nights: nr, total: nr.reduce((a, b) => a + b, 0), left: Math.max(0, left) });
    }
  }
  return rates.sort((a, b) => a.total - b.total);
}

export function searchHotels(s: HotelSearch, today: ISODate): HotelResult[] {
  const n = nightsOf(s);
  const out: HotelResult[] = [];
  for (const h of HOTELS.filter((x) => x.destination === s.destination)) {
    const rates = hotelRates(h, s, today).filter((r) => r.left >= s.rooms);
    if (!rates.length) continue;
    out.push({ hotel: h, cheapest: rates[0], freeCancellation: rates.some((r) => r.refundable), nights: n });
  }
  return out;
}

export function findRate(h: HotelProperty, s: HotelSearch, today: ISODate, rateId: string): RoomRate | undefined {
  return hotelRates(h, s, today).find((r) => r.id === rateId);
}

const CONF_CHARS = "0123456789";

/** Book a rate: the hotel's confirmation comes back at once, as a bed bank or a direct contract would send it. */
export function bookRoom(args: { hotel: HotelProperty; search: HotelSearch; rate: RoomRate; random?: () => number }): { details: HotelDetails; cost: Money } {
  const { hotel, search, rate } = args;
  const random = args.random ?? Math.random;
  let conf = "";
  for (let i = 0; i < 7; i++) conf += CONF_CHARS[Math.floor(random() * CONF_CHARS.length)];
  // Spread the party over the rooms as evenly as possible.
  const split = (count: number, i: number) => Math.floor(count / search.rooms) + (i < count % search.rooms ? 1 : 0);
  const rooms = Array.from({ length: search.rooms }, (_, i) => ({ roomType: rate.room.name, board: rate.board, adults: split(search.adults, i), children: split(search.children, i) }));
  const freeCancelUntil: ISODateTime | undefined = rate.freeCancelUntil ? darLocalToUtcIso(rate.freeCancelUntil, 23, 59) : undefined;
  const destination = findDestination(hotel.destination);
  return {
    details: {
      hotelName: hotel.name,
      city: `${hotel.area}, ${destination?.name ?? hotel.destination}`,
      checkIn: search.checkIn,
      checkOut: search.checkOut,
      rooms,
      confirmationNumber: `${hotel.supplierName ? "HTL" : "EAB"}-${conf}`,
      cancellationPolicy: rate.refundable ? `Free cancellation until ${rate.freeCancelUntil}; after that the first night is charged.` : "Non-refundable: the full stay is charged if cancelled or not used.",
      freeCancelUntil,
    },
    cost: { amountMinor: rate.total, currency: "USD" },
  };
}
