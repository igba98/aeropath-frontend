/**
 * The demo flight network: airport positions, which airline flies where, and on what aircraft.
 * Shaped on the real Tanzanian market (Air Tanzania and Precision Air on the trunk routes, Coastal and
 * Auric on the safari and island strips, the Gulf, Turkish, Ethiopian and Kenyan carriers through their hubs),
 * but schedules and prices are generated. Pure data; no framework imports.
 */

/** [latitude, longitude] per airport. */
export const GEO: Record<string, [number, number]> = {
  DAR: [-6.878, 39.202],
  ZNZ: [-6.222, 39.225],
  JRO: [-3.429, 37.074],
  ARK: [-3.368, 36.633],
  MWZ: [-2.444, 32.932],
  DOD: [-6.17, 35.753],
  TBO: [-5.076, 32.833],
  MYW: [-10.339, 40.182],
  SEU: [-2.458, 34.822],
  MFA: [-7.917, 39.668],
  PMA: [-5.257, 39.811],
  BKZ: [-1.332, 31.821],
  TKQ: [-4.886, 29.671],
  SGX: [-9.103, 33.271],
  TGT: [-5.092, 39.072],
  NBO: [-1.319, 36.928],
  MBA: [-4.035, 39.594],
  EBB: [0.042, 32.444],
  KGL: [-1.969, 30.139],
  ADD: [8.978, 38.799],
  JNB: [-26.139, 28.246],
  DXB: [25.253, 55.366],
  DOH: [25.273, 51.608],
  IST: [41.275, 28.752],
  AMS: [52.31, 4.768],
  LHR: [51.47, -0.454],
  CDG: [49.01, 2.548],
  FRA: [50.033, 8.571],
  BOM: [19.089, 72.868],
  CAN: [23.392, 113.299],
  JED: [21.68, 39.157],
  MCT: [23.593, 58.284],
  CAI: [30.122, 31.406],
};

export const TANZANIA = new Set(["DAR", "ZNZ", "JRO", "ARK", "MWZ", "DOD", "TBO", "MYW", "SEU", "MFA", "PMA", "BKZ", "TKQ", "SGX", "TGT"]);

export const isDomestic = (a: string, b: string) => TANZANIA.has(a) && TANZANIA.has(b);

/** Great-circle distance in km. */
export function distanceKm(a: string, b: string): number {
  const A = GEO[a];
  const B = GEO[b];
  if (!A || !B) return 0;
  const rad = Math.PI / 180;
  const dLat = (B[0] - A[0]) * rad;
  const dLon = (B[1] - A[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(A[0] * rad) * Math.cos(B[0] * rad) * Math.sin(dLon / 2) ** 2;
  return Math.round(2 * 6371 * Math.asin(Math.sqrt(h)));
}

export type Tier = "bush" | "regional" | "value" | "full" | "premium";

export interface CarrierNet {
  code: string;
  /** Connections are built through the hub: origin → hub → destination. */
  hub: string;
  /** Airports served nonstop from the hub. */
  spokes: string[];
  /** Nonstop pairs that do not touch the hub. */
  extra?: [string, string][];
  tier: Tier;
  /** First flight number; routes get their own block above it. */
  base: number;
  /** Departures per day on a route: [min, max]. */
  daily: [number, number];
}

export const CARRIERS: CarrierNet[] = [
  // Domestic and regional from Tanzania
  { code: "TC", hub: "DAR", spokes: ["ZNZ", "JRO", "MWZ", "DOD", "TBO", "MYW", "BKZ", "TKQ", "SGX", "DXB", "BOM", "JNB", "EBB", "CAN"], extra: [["JRO", "MWZ"], ["DOD", "MWZ"]], tier: "full", base: 100, daily: [1, 3] },
  { code: "PW", hub: "DAR", spokes: ["ZNZ", "JRO", "MWZ", "BKZ", "MYW", "NBO"], extra: [["ZNZ", "JRO"], ["MWZ", "BKZ"]], tier: "regional", base: 400, daily: [1, 3] },
  { code: "CQ", hub: "ARK", spokes: ["SEU", "ZNZ", "DAR", "JRO", "MWZ"], extra: [["DAR", "ZNZ"], ["DAR", "MFA"], ["ZNZ", "PMA"], ["DAR", "PMA"], ["DAR", "TGT"]], tier: "bush", base: 200, daily: [2, 2] },
  { code: "UI", hub: "DAR", spokes: ["ZNZ", "MFA", "PMA", "TGT"], extra: [["MWZ", "BKZ"], ["ARK", "SEU"], ["MWZ", "SEU"]], tier: "bush", base: 600, daily: [1, 2] },
  // Hubs abroad
  { code: "EK", hub: "DXB", spokes: ["DAR", "LHR", "CDG", "FRA", "AMS", "IST", "BOM", "CAN", "JED", "MCT", "CAI", "DOH", "JNB", "NBO", "EBB", "ADD"], tier: "premium", base: 700, daily: [1, 2] },
  { code: "FZ", hub: "DXB", spokes: ["ZNZ", "JRO", "DAR", "BOM", "JED", "MCT", "CAI", "ADD"], tier: "value", base: 600, daily: [1, 2] },
  { code: "QR", hub: "DOH", spokes: ["DAR", "ZNZ", "JRO", "LHR", "CDG", "FRA", "AMS", "IST", "BOM", "CAN", "JED", "MCT", "CAI", "DXB", "JNB", "NBO", "EBB", "KGL", "ADD", "MBA"], tier: "premium", base: 1300, daily: [1, 2] },
  { code: "TK", hub: "IST", spokes: ["DAR", "ZNZ", "JRO", "LHR", "CDG", "FRA", "AMS", "CAI", "JED", "DXB", "DOH", "BOM", "CAN", "NBO", "EBB", "KGL", "ADD", "JNB", "MBA"], tier: "full", base: 600, daily: [1, 2] },
  { code: "ET", hub: "ADD", spokes: ["DAR", "ZNZ", "JRO", "LHR", "CDG", "FRA", "AMS", "IST", "BOM", "CAN", "JED", "DXB", "CAI", "JNB", "NBO", "EBB", "KGL", "MBA"], tier: "full", base: 800, daily: [1, 3] },
  { code: "KQ", hub: "NBO", spokes: ["DAR", "ZNZ", "JRO", "LHR", "AMS", "CDG", "DXB", "BOM", "CAN", "JNB", "EBB", "KGL", "MBA"], tier: "full", base: 400, daily: [1, 3] },
  { code: "KL", hub: "AMS", spokes: ["JRO", "DAR", "LHR", "CDG", "FRA"], tier: "premium", base: 500, daily: [1, 1] },
  { code: "WB", hub: "KGL", spokes: ["DAR", "EBB", "NBO", "JNB", "DXB", "LHR"], tier: "value", base: 400, daily: [1, 1] },
  { code: "MS", hub: "CAI", spokes: ["DAR", "EBB", "NBO", "ADD", "JED", "DXB", "IST", "LHR", "CDG", "FRA", "AMS"], tier: "value", base: 800, daily: [1, 1] },
  { code: "SA", hub: "JNB", spokes: ["DAR", "NBO"], tier: "full", base: 180, daily: [1, 1] },
];

export const CARRIER_BY_CODE: Record<string, CarrierNet> = Object.fromEntries(CARRIERS.map((c) => [c.code, c]));

/** Aircraft type and cruise speed (km/h, block average) for a carrier on a stage length. */
export function aircraftFor(carrier: string, km: number): { equipment: string; speed: number; business: boolean } {
  switch (carrier) {
    case "CQ":
    case "UI":
      return { equipment: "Cessna 208B Grand Caravan", speed: 270, business: false };
    case "PW":
      return { equipment: km < 700 ? "ATR 42-600" : "ATR 72-600", speed: 460, business: false };
    case "TC":
      if (km < 650) return { equipment: "De Havilland Dash 8-400", speed: 500, business: false };
      if (km < 3000) return { equipment: "Airbus A220-300", speed: 760, business: true };
      return { equipment: "Boeing 787-8 Dreamliner", speed: 830, business: true };
    case "EK":
      return km > 5000 ? { equipment: "Airbus A380-800", speed: 860, business: true } : { equipment: "Boeing 777-300ER", speed: 840, business: true };
    case "FZ":
      return { equipment: "Boeing 737 MAX 8", speed: 780, business: true };
    case "QR":
      return km > 5000 ? { equipment: "Airbus A350-1000", speed: 860, business: true } : { equipment: "Boeing 787-8 Dreamliner", speed: 830, business: true };
    case "TK":
      return km > 3500 ? { equipment: "Airbus A330-300", speed: 830, business: true } : { equipment: "Airbus A321neo", speed: 790, business: true };
    case "ET":
      return km > 3000 ? { equipment: "Boeing 787-9 Dreamliner", speed: 840, business: true } : { equipment: "Boeing 737 MAX 8", speed: 780, business: true };
    case "KQ":
      return km > 2500 ? { equipment: "Boeing 787-8 Dreamliner", speed: 830, business: true } : { equipment: "Embraer 190", speed: 720, business: true };
    case "KL":
      return { equipment: "Boeing 787-10 Dreamliner", speed: 850, business: true };
    case "WB":
      return km > 3500 ? { equipment: "Airbus A330-200", speed: 830, business: true } : { equipment: "Boeing 737-800", speed: 780, business: true };
    case "MS":
      return { equipment: "Boeing 737-800", speed: 780, business: true };
    case "SA":
      return { equipment: "Airbus A320-200", speed: 780, business: true };
    default:
      return { equipment: "Airbus A320-200", speed: 780, business: true };
  }
}

/** Nonstop between two airports on this carrier? */
export function flies(c: CarrierNet, a: string, b: string): boolean {
  if (a === b) return false;
  if ((a === c.hub && c.spokes.includes(b)) || (b === c.hub && c.spokes.includes(a))) return true;
  return Boolean(c.extra?.some(([x, y]) => (x === a && y === b) || (x === b && y === a)));
}

/** A one-stop through the carrier's hub is offered when it is not a silly detour. */
export function connectsViaHub(c: CarrierNet, a: string, b: string): boolean {
  if (a === c.hub || b === c.hub || a === b) return false;
  if (!flies(c, a, c.hub) || !flies(c, c.hub, b)) return false;
  const direct = distanceKm(a, b);
  if (direct < 150) return false;
  const via = distanceKm(a, c.hub) + distanceKm(c.hub, b);
  return via <= direct * 1.45 + 150;
}

// ─────────────────────────────── Seeded randomness ───────────────────────────────

/** FNV-1a 32-bit hash. */
export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic generator in [0, 1) for a seed string (mulberry32). */
export function seeded(seed: string): () => number {
  let a = hash(seed);
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
