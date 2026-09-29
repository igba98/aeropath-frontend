/**
 * Seed master data (spec §14): staff, money accounts, suppliers, clients and travellers. Names, phones, TINs and
 * passport numbers are synthetic. Passport expiries are days from today so "expiring soon" always shows.
 */
import type { ClientSource, Currency, MoneyAccount, PaxType, Role, SupplierKind, Title } from "@/domain/types";
import type { StaffKey } from "./seed-kit";

export const STAFF: { key: StaffKey; name: string; role: Role; phone: string }[] = [
  { key: "grace", name: "Grace Kimaro", role: "manager", phone: "0754 100 401" },
  { key: "neema", name: "Neema Mushi", role: "agent", phone: "0754 100 402" },
  { key: "baraka", name: "Baraka Lema", role: "agent", phone: "0713 100 403" },
  { key: "peter", name: "Peter Mwakalinga", role: "accountant", phone: "0754 100 404" },
];

export const ACCOUNTS: { key: string; name: string; kind: MoneyAccount["kind"]; currency: Currency; opening: number }[] = [
  { key: "cash_tzs", name: "Cash box TZS", kind: "cash", currency: "TZS", opening: 2_500_000 },
  { key: "cash_usd", name: "Cash box USD", kind: "cash", currency: "USD", opening: 1_500 },
  { key: "crdb_tzs", name: "CRDB TZS", kind: "bank", currency: "TZS", opening: 38_000_000 },
  { key: "crdb_usd", name: "CRDB USD", kind: "bank", currency: "USD", opening: 42_000 },
  { key: "nmb_tzs", name: "NMB TZS", kind: "bank", currency: "TZS", opening: 12_000_000 },
  { key: "mpesa", name: "M-Pesa Till 123456", kind: "mobile_money", currency: "TZS", opening: 1_800_000 },
  { key: "airtel", name: "Airtel Money", kind: "mobile_money", currency: "TZS", opening: 650_000 },
];

export const SUPPLIERS: { key: string; name: string; kind: SupplierKind; currency: Currency; terms: number; contact: string; phone: string; email: string; active?: boolean; notes?: string }[] = [
  { key: "consolidator", name: "Kilimanjaro Air Consolidators Ltd", kind: "air_settlement", currency: "USD", terms: 14, contact: "Musa Kileo", phone: "0754 310 220", email: "settlements@kiliair.example", notes: "Air settlement: tickets issued on their plating. Fortnightly statement." },
  { key: "bsp", name: "BSP Tanzania (IATA)", kind: "air_settlement", currency: "USD", terms: 15, contact: "IATA BSP Desk", phone: "0222 120 900", email: "bsp.tz@iata.example", active: false, notes: "Inactive until settlement mode switches to BSP." },
  { key: "hotel_dar", name: "Coco Beach Suites", kind: "hotel", currency: "USD", terms: 7, contact: "Lilian Mushi", phone: "0763 221 540", email: "reservations@cocobeachsuites.example" },
  { key: "hotel_znz", name: "Forodhani Heritage Hotel", kind: "hotel", currency: "USD", terms: 14, contact: "Khamis Suleiman", phone: "0777 431 208", email: "sales@forodhaniheritage.example" },
  { key: "hotel_ark", name: "Themi River Lodge", kind: "hotel", currency: "USD", terms: 14, contact: "Elia Laizer", phone: "0754 882 016", email: "book@themiriverlodge.example" },
  { key: "bedbank", name: "EA Hotel Bank", kind: "hotel", currency: "USD", terms: 14, contact: "Reservations desk", phone: "0222 110 450", email: "res@eahotelbank.example", notes: "Hotel bed bank: partner hotels booked from Search and book." },
  { key: "car_1", name: "Twiga Car Rentals", kind: "car_rental", currency: "TZS", terms: 14, contact: "Hassan Kiwelu", phone: "0715 330 772", email: "bookings@twigacars.example" },
  { key: "car_2", name: "Kariakoo Car Hire", kind: "car_rental", currency: "TZS", terms: 7, contact: "Omari Chande", phone: "0689 204 311", email: "hire@kariakoocars.example" },
  { key: "transfer", name: "Uhuru Airport Transfers", kind: "transfer", currency: "TZS", terms: 7, contact: "Juma Mfinanga", phone: "0655 118 430", email: "ops@uhurutransfers.example" },
  { key: "visa", name: "Posta Visa Services", kind: "visa", currency: "USD", terms: 7, contact: "Beatrice Swai", phone: "0713 667 205", email: "desk@postavisa.example" },
  { key: "insurance", name: "Kinga Travel Insurance", kind: "insurance", currency: "TZS", terms: 14, contact: "Selemani Nduta", phone: "0784 509 118", email: "travel@kingainsurance.example" },
];

export interface TravSpec {
  key: string;
  title: Title;
  given: string;
  surname: string;
  pax?: PaxType;
  dob: string;
  gender: "M" | "F";
  nat?: string;
  passport: string;
  /** Passport expiry in days from today. */
  expiry: number;
  ff?: [string, string];
}

export interface ClientSpec {
  key: string;
  type: "individual" | "corporate";
  name: string;
  phone: string;
  email?: string;
  address?: string;
  tin?: string;
  vrn?: string;
  contact?: string;
  /** Corporates: credit limit in TZS (set by Grace) and payment terms. */
  credit?: number;
  terms?: number;
  currency: Currency;
  source?: ClientSource;
  notes?: string;
  tags?: string[];
  by: StaffKey;
  daysAgo: number;
  travellers: TravSpec[];
}

const T = (key: string, title: Title, given: string, surname: string, dob: string, gender: "M" | "F", passport: string, expiry: number, extra: Partial<TravSpec> = {}): TravSpec => ({
  key,
  title,
  given,
  surname,
  dob,
  gender,
  passport,
  expiry,
  nat: "TZ",
  ...extra,
});

export const CLIENTS: ClientSpec[] = [
  { key: "mwakalinga", type: "individual", name: "Peter Mwakalinga", phone: "0754 218 330", email: "mwakalinga.family@example.com", currency: "TZS", source: "referral", tags: ["family"], by: "neema", daysAgo: 110, notes: "Family account: Peter, Anna and David (child).",
    travellers: [T("peter", "MR", "PETER", "MWAKALINGA", "1981-06-14", "M", "TAE204518", 1460, { ff: ["EK", "EK418822301"] }), T("anna", "MRS", "ANNA", "MWAKALINGA", "1985-09-02", "F", "TAE204519", 1460), T("david", "MSTR", "DAVID", "MWAKALINGA", "2017-03-12", "M", "TAE377120", 900, { pax: "CHD" })] },
  { key: "halima", type: "individual", name: "Halima Salim Mohamed", phone: "0777 412 905", email: "halima.salim@example.com", currency: "TZS", source: "whatsapp", by: "baraka", daysAgo: 95,
    travellers: [T("halima", "MRS", "HALIMA SALIM", "MOHAMED", "1979-02-21", "F", "TAE118204", 2100), T("ali", "MR", "ALI SALUM", "MOHAMED", "1976-11-08", "M", "TAE118190", 1250)] },
  { key: "mrema", type: "individual", name: "Joseph Mrema", phone: "0713 556 201", email: "joseph.mrema@example.com", currency: "USD", source: "walk_in", by: "baraka", daysAgo: 90,
    travellers: [T("joseph", "MR", "JOSEPH", "MREMA", "1983-04-30", "M", "TAE290331", 1700, { ff: ["EK", "EK310045879"] })] },
  { key: "fatma", type: "individual", name: "Fatma Ally Hassan", phone: "0715 889 340", currency: "USD", source: "phone", tags: ["family"], by: "neema", daysAgo: 85,
    travellers: [T("fatma", "MRS", "FATMA ALLY", "HASSAN", "1988-07-19", "F", "TAE331876", 1900), T("ally", "MR", "ALLY", "HASSAN", "1984-01-05", "M", "TAE331875", 140), T("zuhura", "MISS", "ZUHURA", "HASSAN", "2016-05-27", "F", "TAE402211", 1200, { pax: "CHD" })] },
  { key: "kweka", type: "individual", name: "Emmanuel Kweka", phone: "0756 330 118", email: "e.kweka@example.com", currency: "USD", source: "email", by: "neema", daysAgo: 80,
    travellers: [T("emmanuel", "MR", "EMMANUEL", "KWEKA", "1975-10-11", "M", "TAE087640", 75, { ff: ["QR", "QR502318447"] })] },
  { key: "mollel", type: "individual", name: "Rehema Mollel", phone: "0762 145 870", email: "rehema.mollel@example.com", currency: "USD", source: "phone", by: "baraka", daysAgo: 75,
    travellers: [T("rehema", "MRS", "REHEMA", "MOLLEL", "1970-12-03", "F", "TAE150998", 1100), T("brian", "MR", "BRIAN", "MOLLEL", "2001-08-16", "M", "TAE366014", 2400)] },
  { key: "massawe", type: "individual", name: "Daudi Massawe", phone: "0784 220 649", email: "daudi.massawe@example.com", currency: "USD", source: "walk_in", tags: ["trader"], by: "neema", daysAgo: 70,
    travellers: [T("daudi", "MR", "DAUDI", "MASSAWE", "1980-03-25", "M", "TAE221450", 1300), T("isaya", "MR", "ISAYA", "MASSAWE", "1986-06-09", "M", "TAE221733", 120)] },
  { key: "mbwambo", type: "individual", name: "Zawadi Mbwambo", phone: "0654 781 332", email: "zawadi.m@example.com", currency: "USD", source: "whatsapp", by: "neema", daysAgo: 60,
    travellers: [T("zawadi", "MS", "ZAWADI", "MBWAMBO", "1992-09-14", "F", "TAE410287", 2600)] },
  { key: "omar", type: "individual", name: "Salim Abdallah Omar", phone: "0773 902 116", email: "salim.omar@example.com", currency: "USD", source: "phone", tags: ["business"], by: "neema", daysAgo: 58, notes: "Imports from Türkiye; books for visiting partners.",
    travellers: [T("salim", "MR", "SALIM ABDALLAH", "OMAR", "1977-01-30", "M", "TAE140662", 1600), T("mehmet", "MR", "MEHMET", "YILMAZ", "1979-04-18", "M", "U18840215", 2000, { nat: "TR" }), T("emre", "MR", "EMRE", "KAYA", "1990-10-02", "M", "U20735561", 150, { nat: "TR" })] },
  { key: "temba", type: "individual", name: "Janeth Temba", phone: "0715 604 287", email: "janeth.temba@example.com", currency: "TZS", source: "email", by: "baraka", daysAgo: 55,
    travellers: [T("janeth", "MS", "JANETH", "TEMBA", "1991-02-11", "F", "TAE300415", 1800, { ff: ["KL", "KL2094471830"] })] },
  { key: "shirima", type: "individual", name: "Frank Shirima", phone: "0754 903 772", email: "frank.shirima@example.com", currency: "TZS", source: "walk_in", tags: ["family"], by: "neema", daysAgo: 50,
    travellers: [T("frank", "MR", "FRANK", "SHIRIMA", "1982-05-06", "M", "TAE250871", 1500), T("lucy", "MRS", "LUCY", "SHIRIMA", "1986-08-22", "F", "TAE250872", 1500), T("kelvin", "MSTR", "KELVIN", "SHIRIMA", "2015-12-01", "M", "TAE389004", 700, { pax: "CHD" })] },
  { key: "lyimo", type: "individual", name: "Godfrey Lyimo", phone: "0688 315 940", email: "godfrey.lyimo@example.com", currency: "USD", source: "referral", by: "baraka", daysAgo: 45,
    travellers: [T("godfrey", "MR", "GODFREY", "LYIMO", "1973-07-28", "M", "TAE060318", 1000), T("irene", "MRS", "IRENE", "LYIMO", "1978-03-15", "F", "TAE060319", 1000)] },
  // Corporates (credit limits and terms set by Grace)
  { key: "kivukoni", type: "corporate", name: "Kivukoni Logistics Ltd", phone: "0222 110 845", email: "accounts@kivukonilogistics.example", address: "Plot 14, Kivukoni Front, Dar es Salaam", tin: "105-882-431", vrn: "40-015882-K", contact: "Agnes Kessy", credit: 25_000_000, terms: 30, currency: "TZS", source: "referral", tags: ["corporate"], by: "grace", daysAgo: 100,
    travellers: [T("agnes", "MS", "AGNES", "KESSY", "1984-11-20", "F", "TAE171204", 1400), T("paul", "MR", "PAUL", "NJAU", "1980-02-14", "M", "TAE171377", 1650), T("kevin", "MR", "KEVIN", "OTIENO", "1987-09-09", "M", "AK0412355", 1100, { nat: "KE" })] },
  { key: "pwani", type: "corporate", name: "Pwani Energy Services Ltd", phone: "0222 601 390", email: "finance@pwanienergy.example", address: "Nyerere Road, Plot 1022, Dar es Salaam", tin: "117-305-662", vrn: "40-021733-P", contact: "Hamisi Mbaraka", credit: 8_500_000, terms: 30, currency: "TZS", source: "email", tags: ["corporate"], by: "grace", daysAgo: 92,
    travellers: [T("hamisi", "MR", "HAMISI", "MBARAKA", "1976-06-30", "M", "TAE099820", 40), T("gasper", "MR", "GASPER", "MALLYA", "1989-12-12", "M", "TAE312460", 2200), T("rajesh", "MR", "RAJESH", "NAIR", "1982-08-04", "M", "Z4518270", 1300, { nat: "IN" })] },
  { key: "bahari", type: "corporate", name: "Bahari Freight & Clearing Ltd", phone: "0222 865 214", email: "admin@baharifreight.example", address: "Bandari Road, Kurasini, Dar es Salaam", tin: "121-440-908", vrn: "40-030117-B", contact: "Mwanaisha Juma", credit: 15_000_000, terms: 30, currency: "TZS", source: "phone", tags: ["corporate"], by: "grace", daysAgo: 88,
    travellers: [T("mwanaisha", "MS", "MWANAISHA", "JUMA", "1985-04-07", "F", "TAE140019", 1250), T("abdul", "MR", "ABDUL", "RAMADHANI", "1979-09-23", "M", "TAE140311", 950), T("yusufu", "MR", "YUSUFU", "KOMBO", "1991-01-17", "M", "TAE402877", 2300)] },
];
