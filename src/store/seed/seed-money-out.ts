/**
 * Seed money flows that span bookings: the corporate bulk payment, supplier payments (including the consolidator
 * settlements) and three months of office expenses.
 */
import { diffDaysISO } from "@/domain/dates";
import type { FileBuilder } from "./seed-file";
import type { Seeder } from "./seed-kit";
import { bulkPay, expense, paySupplier } from "./seed-money";

/** Days since the 1st of the month `monthsBack` months before today's month (Dar calendar). */
function daysSinceMonthStart(s: Seeder, monthsBack: number): number {
  const [y, m] = s.today.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 - monthsBack, 1));
  return diffDaysISO(d.toISOString().slice(0, 10), s.today);
}

export function moneyOut(s: Seeder, files: Record<string, FileBuilder>): void {
  const F = (key: string): FileBuilder => {
    const f = files[key];
    if (!f) throw new Error(`Seed data error: unknown booking ${key}`);
    return f;
  };

  // Kivukoni Logistics pays three invoices (one USD, two TZS) with one bank transfer in TZS.
  bulkPay(s, "Kivukoni bulk payment", s.day(8, "10:30"), "peter", [F("P1"), F("P2"), F("P3")], {
    method: "bank_transfer",
    account: "crdb_tzs",
    cur: "TZS",
    note: "Kivukoni Logistics: settlement of three invoices",
  });

  // Consolidator settlements (air tickets), paid from CRDB USD; TZS-priced tickets converted at the settings rate.
  paySupplier(s, "Consolidator settlement 1", s.day(30, "11:00"), "consolidator", "crdb_usd", [
    [F("C1a"), "fl"],
    [F("T1"), "fl"],
    [F("T3"), "fl"],
    [F("C1b"), "fl"],
    [F("T2"), "fl"],
    [F("C1c"), "fl"],
  ], "Consolidator statement: tickets issued in the first period");
  paySupplier(s, "Consolidator settlement 2", s.day(10, "11:00"), "consolidator", "crdb_usd", [
    [F("P1"), "fl"],
    [F("R3"), "fl"],
    [F("X1"), "fl"],
    [F("P2"), "fl"],
    [F("P3"), "fl"],
    [F("R1"), "fl"],
    [F("P8"), "fl"],
  ], "Consolidator statement: tickets issued in the second period (R3 penalty only)");

  // Hotels, car hire, transfers and visas.
  paySupplier(s, "Coco Beach Suites payment", s.day(18, "14:00"), "hotel_dar", "crdb_usd", [[F("P2"), "ht"]]);
  paySupplier(s, "Themi River Lodge payment", s.day(12, "14:10"), "hotel_ark", "crdb_usd", [[F("P5"), "ht"]]);
  paySupplier(s, "Forodhani Heritage Hotel payment", s.day(7, "14:20"), "hotel_znz", "crdb_usd", [[F("P4"), "ht"]]);
  paySupplier(s, "Twiga Car Rentals payment", s.day(4, "14:30"), "car_1", "crdb_tzs", [[F("P6"), "car"]]);
  paySupplier(s, "Uhuru Airport Transfers payment", s.day(15, "14:40"), "transfer", "nmb_tzs", [[F("P2"), "tr"]]);
  paySupplier(s, "Posta Visa Services payment", s.day(17, "14:50"), "visa", "crdb_usd", [[F("P7"), "visa"]]);

  // Office expenses over the last three months (recorded by Peter).
  for (const m of [0, 1, 2]) {
    const sinceFirst = daysSinceMonthStart(s, m);
    expense(s, Math.max(1, sinceFirst), "rent", "Mkwepu Street Properties Ltd", [3_200_000, "TZS"], "crdb_tzs", "Office rent, Samora Avenue");
    expense(s, sinceFirst + 1, "salaries", "Staff payroll", [9_400_000, "TZS"], "crdb_tzs", "Monthly salaries, 4 staff");
  }
  expense(s, 8, "utilities", "TANESCO (LUKU tokens)", [350_000, "TZS"], "mpesa");
  expense(s, 38, "utilities", "TANESCO (LUKU tokens)", [320_000, "TZS"], "mpesa");
  expense(s, 20, "utilities", "DAWASA water bill", [85_000, "TZS"], "cash_tzs");
  expense(s, 5, "internet_phone", "TTCL Fibre", [280_000, "TZS"], "nmb_tzs", "Office fibre, monthly");
  expense(s, 35, "internet_phone", "TTCL Fibre", [280_000, "TZS"], "nmb_tzs", "Office fibre, monthly");
  expense(s, 64, "internet_phone", "Vodacom bundles", [120_000, "TZS"], "mpesa", "Staff phone bundles");
  expense(s, 14, "marketing", "Instagram and Facebook ads", [150, "USD"], "crdb_usd", "Holiday season promotion");
  expense(s, 47, "marketing", "Print Hub Kariakoo", [240_000, "TZS"], "cash_tzs", "Flyers and roll-up banner");
  expense(s, 3, "transport", "Bajaji and taxi fares", [45_000, "TZS"], "cash_tzs", "Ticket and passport deliveries");
  expense(s, 26, "transport", "Bajaji and taxi fares", [38_000, "TZS"], "cash_tzs", "Embassy runs");
  expense(s, 58, "transport", "Puma Energy station", [90_000, "TZS"], "cash_tzs", "Fuel for the office runner");
  expense(s, 16, "office_supplies", "Kariakoo Stationers", [185_000, "TZS"], "cash_tzs", "Paper, receipt books, pens");
  expense(s, 71, "office_supplies", "Computer Point Posta", [260_000, "TZS"], "nmb_tzs", "Printer toner");
  expense(s, 30, "bank_charges", "CRDB Bank", [38_500, "TZS"], "crdb_tzs", "Monthly account charges");
  expense(s, 60, "bank_charges", "CRDB Bank", [25, "USD"], "crdb_usd", "USD account charges");
  expense(s, 11, "gds_fees", "Amadeus GDS subscription", [450, "USD"], "crdb_usd", "Monthly terminal subscription");
  expense(s, 41, "gds_fees", "Amadeus GDS subscription", [450, "USD"], "crdb_usd", "Monthly terminal subscription");
  expense(s, 52, "taxes_licences", "Dar es Salaam City Council", [450_000, "TZS"], "nmb_tzs", "Business licence renewal");
  expense(s, 24, "other", "Usafi Cleaning Services", [150_000, "TZS"], "cash_tzs", "Office cleaning, monthly");
}
