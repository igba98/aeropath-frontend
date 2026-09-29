/**
 * Reference data (spec §13): airports, airlines, booking class → cabin, expense categories,
 * payment methods, line types and supplier kinds. Static, framework-free, safe to import anywhere.
 */
import type {
  AccountCode,
  AirlineRef,
  Cabin,
  ExpenseCategory,
  LineType,
  PaymentMethod,
  SupplierKind,
} from "@/domain/types";

// ─────────────────────────────── Airports ───────────────────────────────

export interface AirportRef {
  code: string; // IATA 3-letter
  name: string; // airport name
  city: string;
  country: string;
  countryCode: string; // ISO-3166 alpha-2
  tz: string; // IANA timezone
}

/** Codes and IANA zones checked by hand. Tanzania, Kenya, Uganda, Ethiopia, Qatar and Saudi Arabia are UTC+3 all year. */
export const AIRPORTS: AirportRef[] = [
  // Tanzania
  { code: "DAR", name: "Julius Nyerere International Airport", city: "Dar es Salaam", country: "Tanzania", countryCode: "TZ", tz: "Africa/Dar_es_Salaam" },
  { code: "ZNZ", name: "Abeid Amani Karume International Airport", city: "Zanzibar", country: "Tanzania", countryCode: "TZ", tz: "Africa/Dar_es_Salaam" },
  { code: "JRO", name: "Kilimanjaro International Airport", city: "Kilimanjaro", country: "Tanzania", countryCode: "TZ", tz: "Africa/Dar_es_Salaam" },
  { code: "ARK", name: "Arusha Airport", city: "Arusha", country: "Tanzania", countryCode: "TZ", tz: "Africa/Dar_es_Salaam" },
  { code: "MWZ", name: "Mwanza Airport", city: "Mwanza", country: "Tanzania", countryCode: "TZ", tz: "Africa/Dar_es_Salaam" },
  { code: "DOD", name: "Dodoma Airport", city: "Dodoma", country: "Tanzania", countryCode: "TZ", tz: "Africa/Dar_es_Salaam" },
  { code: "TBO", name: "Tabora Airport", city: "Tabora", country: "Tanzania", countryCode: "TZ", tz: "Africa/Dar_es_Salaam" },
  { code: "MYW", name: "Mtwara Airport", city: "Mtwara", country: "Tanzania", countryCode: "TZ", tz: "Africa/Dar_es_Salaam" },
  { code: "SEU", name: "Seronera Airstrip", city: "Serengeti", country: "Tanzania", countryCode: "TZ", tz: "Africa/Dar_es_Salaam" },
  { code: "MFA", name: "Mafia Airport", city: "Mafia Island", country: "Tanzania", countryCode: "TZ", tz: "Africa/Dar_es_Salaam" },
  { code: "PMA", name: "Pemba Airport", city: "Pemba", country: "Tanzania", countryCode: "TZ", tz: "Africa/Dar_es_Salaam" },
  { code: "BKZ", name: "Bukoba Airport", city: "Bukoba", country: "Tanzania", countryCode: "TZ", tz: "Africa/Dar_es_Salaam" },
  { code: "TKQ", name: "Kigoma Airport", city: "Kigoma", country: "Tanzania", countryCode: "TZ", tz: "Africa/Dar_es_Salaam" },
  { code: "SGX", name: "Songwe Airport", city: "Mbeya", country: "Tanzania", countryCode: "TZ", tz: "Africa/Dar_es_Salaam" },
  { code: "TGT", name: "Tanga Airport", city: "Tanga", country: "Tanzania", countryCode: "TZ", tz: "Africa/Dar_es_Salaam" },
  // Region
  { code: "NBO", name: "Jomo Kenyatta International Airport", city: "Nairobi", country: "Kenya", countryCode: "KE", tz: "Africa/Nairobi" },
  { code: "MBA", name: "Moi International Airport", city: "Mombasa", country: "Kenya", countryCode: "KE", tz: "Africa/Nairobi" },
  { code: "EBB", name: "Entebbe International Airport", city: "Entebbe", country: "Uganda", countryCode: "UG", tz: "Africa/Kampala" },
  { code: "KGL", name: "Kigali International Airport", city: "Kigali", country: "Rwanda", countryCode: "RW", tz: "Africa/Kigali" },
  { code: "ADD", name: "Addis Ababa Bole International Airport", city: "Addis Ababa", country: "Ethiopia", countryCode: "ET", tz: "Africa/Addis_Ababa" },
  { code: "JNB", name: "O. R. Tambo International Airport", city: "Johannesburg", country: "South Africa", countryCode: "ZA", tz: "Africa/Johannesburg" },
  // Middle East and beyond
  { code: "DXB", name: "Dubai International Airport", city: "Dubai", country: "United Arab Emirates", countryCode: "AE", tz: "Asia/Dubai" },
  { code: "DOH", name: "Hamad International Airport", city: "Doha", country: "Qatar", countryCode: "QA", tz: "Asia/Qatar" },
  { code: "IST", name: "Istanbul Airport", city: "Istanbul", country: "Türkiye", countryCode: "TR", tz: "Europe/Istanbul" },
  { code: "AMS", name: "Amsterdam Airport Schiphol", city: "Amsterdam", country: "Netherlands", countryCode: "NL", tz: "Europe/Amsterdam" },
  { code: "LHR", name: "London Heathrow Airport", city: "London", country: "United Kingdom", countryCode: "GB", tz: "Europe/London" },
  { code: "CDG", name: "Paris Charles de Gaulle Airport", city: "Paris", country: "France", countryCode: "FR", tz: "Europe/Paris" },
  { code: "FRA", name: "Frankfurt Airport", city: "Frankfurt", country: "Germany", countryCode: "DE", tz: "Europe/Berlin" },
  { code: "BOM", name: "Chhatrapati Shivaji Maharaj International Airport", city: "Mumbai", country: "India", countryCode: "IN", tz: "Asia/Kolkata" },
  { code: "CAN", name: "Guangzhou Baiyun International Airport", city: "Guangzhou", country: "China", countryCode: "CN", tz: "Asia/Shanghai" },
  { code: "JED", name: "King Abdulaziz International Airport", city: "Jeddah", country: "Saudi Arabia", countryCode: "SA", tz: "Asia/Riyadh" },
  { code: "MCT", name: "Muscat International Airport", city: "Muscat", country: "Oman", countryCode: "OM", tz: "Asia/Muscat" },
  { code: "CAI", name: "Cairo International Airport", city: "Cairo", country: "Egypt", countryCode: "EG", tz: "Africa/Cairo" },
];

const AIRPORT_BY_CODE: Record<string, AirportRef> = Object.fromEntries(AIRPORTS.map((a) => [a.code, a]));

export function findAirport(code: string | null | undefined): AirportRef | undefined {
  return code ? AIRPORT_BY_CODE[code.trim().toUpperCase()] : undefined;
}

/** "Julius Nyerere International Airport", or the code itself when unknown. */
export function airportName(code: string): string {
  return findAirport(code)?.name ?? code;
}

/** "Dar es Salaam", or the code itself when unknown. */
export function cityOf(code: string): string {
  return findAirport(code)?.city ?? code;
}

/** IANA timezone of an airport; falls back to Dar es Salaam (display timezone). */
export function airportTz(code: string): string {
  return findAirport(code)?.tz ?? "Africa/Dar_es_Salaam";
}

// ─────────────────────────────── Airlines ───────────────────────────────

/**
 * Seed list for Settings → Airlines (Settings.airlines is the editable copy).
 * `ticketPrefix` is the 3-digit airline accounting code. Left blank where unconfirmed (spec §13);
 * the Manager fills those in Settings.
 */
export const AIRLINES: AirlineRef[] = [
  { code: "TC", name: "Air Tanzania", ticketPrefix: "197" },
  { code: "PW", name: "Precision Air", ticketPrefix: "031" },
  { code: "KQ", name: "Kenya Airways", ticketPrefix: "706" },
  { code: "ET", name: "Ethiopian Airlines", ticketPrefix: "071" },
  { code: "QR", name: "Qatar Airways", ticketPrefix: "157" },
  { code: "EK", name: "Emirates", ticketPrefix: "176" },
  { code: "TK", name: "Turkish Airlines", ticketPrefix: "235" },
  { code: "KL", name: "KLM", ticketPrefix: "074" },
  { code: "MS", name: "EgyptAir", ticketPrefix: "077" },
  { code: "WB", name: "RwandAir", ticketPrefix: "459" },
  { code: "FZ", name: "flydubai", ticketPrefix: "141" },
  { code: "SA", name: "South African Airways", ticketPrefix: "083" },
  { code: "CQ", name: "Coastal Aviation" },
  { code: "UI", name: "Auric Air" },
];

export function findAirline(code: string | null | undefined, airlines: AirlineRef[] = AIRLINES): AirlineRef | undefined {
  if (!code) return undefined;
  const c = code.trim().toUpperCase();
  return airlines.find((a) => a.code === c);
}

/** "Emirates", or the code itself when unknown. */
export function airlineName(code: string, airlines: AirlineRef[] = AIRLINES): string {
  return findAirline(code, airlines)?.name ?? code;
}

/** Airline whose 3-digit ticket prefix matches, e.g. "176" → Emirates. Accepts a full ticket number too. */
export function airlineByTicketPrefix(prefixOrTicket: string, airlines: AirlineRef[] = AIRLINES): AirlineRef | undefined {
  const prefix = prefixOrTicket.replace(/\D/g, "").slice(0, 3);
  if (prefix.length !== 3) return undefined;
  return airlines.find((a) => a.ticketPrefix === prefix);
}

// ─────────────────────────── Booking class → cabin ───────────────────────────

const cabinMap = (): Record<string, Cabin> => {
  const map: Record<string, Cabin> = {};
  for (const letter of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") map[letter] = "economy";
  for (const letter of "FA") map[letter] = "first";
  for (const letter of "JCDIZ") map[letter] = "business";
  for (const letter of "WP") map[letter] = "premium_economy";
  return map;
};

/** Default RBD → cabin map (§11.4). Airlines differ; callers may pass an edited copy. */
export const CABIN_BY_CLASS: Record<string, Cabin> = cabinMap();

export function cabinForClass(rbd: string, map: Record<string, Cabin> = CABIN_BY_CLASS): Cabin {
  return map[rbd.trim().toUpperCase()] ?? "economy";
}

export const CABIN_LABELS: Record<Cabin, string> = {
  economy: "Economy",
  premium_economy: "Premium economy",
  business: "Business",
  first: "First",
};

// ─────────────────────────── Expense categories ───────────────────────────

export const EXPENSE_CATEGORIES: { value: ExpenseCategory; label: string; code: AccountCode }[] = [
  { value: "rent", label: "Rent", code: "5100" },
  { value: "salaries", label: "Salaries", code: "5200" },
  { value: "utilities", label: "Utilities", code: "5300" },
  { value: "internet_phone", label: "Internet and phone", code: "5400" },
  { value: "marketing", label: "Marketing", code: "5500" },
  { value: "transport", label: "Transport", code: "5600" },
  { value: "office_supplies", label: "Office supplies", code: "5700" },
  { value: "bank_charges", label: "Bank charges", code: "5750" },
  { value: "gds_fees", label: "GDS fees", code: "5800" },
  { value: "taxes_licences", label: "Taxes and licences", code: "5850" },
  { value: "other", label: "Other", code: "5900" },
];

// ───────────────────────────── Payment methods ─────────────────────────────

export type PaymentMethodKind = "cash" | "bank" | "mobile_money" | "card" | "cheque";

export const PAYMENT_METHODS: { value: PaymentMethod; label: string; kind: PaymentMethodKind }[] = [
  { value: "cash", label: "Cash", kind: "cash" },
  { value: "bank_transfer", label: "Bank transfer", kind: "bank" },
  { value: "mpesa", label: "M-Pesa", kind: "mobile_money" },
  { value: "airtel_money", label: "Airtel Money", kind: "mobile_money" },
  { value: "mixx", label: "Mixx by Yas", kind: "mobile_money" },
  { value: "halopesa", label: "HaloPesa", kind: "mobile_money" },
  { value: "card", label: "Card", kind: "card" },
  { value: "cheque", label: "Cheque", kind: "cheque" },
];

// ─────────────────────────────── Line types ───────────────────────────────

export const LINE_TYPES: { value: LineType; label: string }[] = [
  { value: "flight", label: "Flight" },
  { value: "hotel", label: "Hotel" },
  { value: "car", label: "Car hire" },
  { value: "transfer", label: "Transfer" },
  { value: "tour", label: "Tour" },
  { value: "visa", label: "Visa" },
  { value: "insurance", label: "Travel insurance" },
  { value: "service_fee", label: "Service fee" },
  { value: "other", label: "Other" },
];

// ───────────────────────────── Supplier kinds ─────────────────────────────

export const SUPPLIER_KINDS: { value: SupplierKind; label: string }[] = [
  { value: "air_settlement", label: "Air settlement (BSP or consolidator)" },
  { value: "hotel", label: "Hotel" },
  { value: "car_rental", label: "Car hire" },
  { value: "transfer", label: "Transfers" },
  { value: "tour", label: "Tours" },
  { value: "visa", label: "Visa agent" },
  { value: "insurance", label: "Insurance" },
  { value: "other", label: "Other" },
];

/** Label lookup helper for the arrays above: labelOf(LINE_TYPES, 'car') → "Car hire". */
export function labelOf<V extends string>(list: { value: V; label: string }[], value: V): string {
  return list.find((x) => x.value === value)?.label ?? value;
}
