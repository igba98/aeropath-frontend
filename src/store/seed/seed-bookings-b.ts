/**
 * Seed bookings, part B: issued business travelling soon — fully paid, partially paid and unpaid.
 * (The three Kivukoni files P1–P3 are paid by one corporate bulk transfer in seed-money-out.)
 */
import { FileBuilder } from "./seed-file";
import type { Seeder } from "./seed-kit";
import { pay } from "./seed-money";
import { seg } from "./seed-routes";

const min = (m: number) => m * 60_000;

export function issuedFiles(s: Seeder): Record<string, FileBuilder> {
  const out: Record<string, FileBuilder> = {};

  // P1 — Kivukoni (corporate, healthy): Dubai sales trip, USD.
  {
    const at = s.day(30, "10:05");
    const pax = ["kivukoni.agnes", "kivukoni.paul"];
    const f = new FileBuilder(s, { key: "P1", client: "kivukoni", owner: "baraka", currency: "USD", source: "corporate", title: "Dar → Dubai · Kivukoni sales team", pax, at });
    f.flight("fl", s.plusMs(at, min(10)), { pax, segs: [seg("EK726", 14), seg("EK725", 19)], fare: { cur: "USD", base: 420, tax: [["YQ", 180], ["TZ", 48], ["XT", 62]] }, markup: 40, status: "booked" });
    f.invoice(s.plusMs(at, min(20)));
    f.issue("fl", s.day(27, "11:00"));
    out.P1 = f;
  }

  // P2 — Kivukoni: Nairobi partner visiting Dar — flight + hotel + transfer (multi-service), TZS.
  {
    const at = s.day(25, "11:30");
    const pax = ["kivukoni.kevin"];
    const f = new FileBuilder(s, { key: "P2", client: "kivukoni", owner: "baraka", currency: "TZS", source: "corporate", title: "Nairobi partner visit · Kevin Otieno", pax, at });
    f.flight("fl", s.plusMs(at, min(8)), { pax, segs: [seg("KQ484", 6), seg("KQ485", 10)], fare: { cur: "TZS", base: 820_000, tax: [["KE", 95_000], ["TZ", 65_000], ["YQ", 100_000]] }, markup: 50_000, status: "booked" });
    f.hotel("ht", s.plusMs(at, min(15)), { supplier: "hotel_dar", pax, name: "Coco Beach Suites", city: "Dar es Salaam", inD: 6, outD: 10, rooms: [{ roomType: "Executive king", board: "BB", adults: 1 }], perNight: 140, markup: 40, status: "booked" });
    f.transfer("tr", s.plusMs(at, min(20)), { supplier: "transfer", pax, from: "Julius Nyerere Airport (DAR)", to: "Coco Beach Suites, Msasani", when: [6, "11:30"], vehicle: "Toyota Alphard", cost: 70_000, markup: 15_000, flightRef: "KQ 484", status: "booked" });
    f.invoice(s.plusMs(at, min(30)));
    f.issue("fl", s.day(22, "09:30")).issue("ht", s.day(22, "09:40")).issue("tr", s.day(22, "09:45"));
    out.P2 = f;
  }

  // P3 — Kivukoni: Istanbul trade fair, TK fare in TZS.
  {
    const at = s.day(21, "14:20");
    const pax = ["kivukoni.paul"];
    const f = new FileBuilder(s, { key: "P3", client: "kivukoni", owner: "neema", currency: "TZS", source: "corporate", title: "Dar → Istanbul · Paul Njau (trade fair)", pax, at });
    f.flight("fl", s.plusMs(at, min(10)), { pax, segs: [seg("TK604", 24), seg("TK603", 30)], fare: { cur: "TZS", base: 1_650_000, tax: [["YQ", 520_000], ["TZ", 125_000], ["XT", 110_000]] }, markup: 70_000, status: "booked" });
    f.invoice(s.plusMs(at, min(18)));
    f.issue("fl", s.day(19, "10:15"));
    out.P3 = f;
  }

  // P4 — hotel only (Zanzibar), card deposit + cash balance in USD.
  {
    const at = s.day(15, "16:10");
    const pax = ["fatma.fatma", "fatma.ally", "fatma.zuhura"];
    const f = new FileBuilder(s, { key: "P4", client: "fatma", owner: "neema", currency: "USD", source: "phone", title: "Zanzibar stay · Hassan family", pax, at, tags: ["holiday"] });
    f.hotel("ht", s.plusMs(at, min(10)), { supplier: "hotel_znz", pax, name: "Forodhani Heritage Hotel", city: "Zanzibar", inD: 9, outD: 14, rooms: [{ roomType: "Family room, garden view", board: "HB", adults: 2, children: 1 }], perNight: 150, markup: 70, status: "booked" });
    f.invoice(s.plusMs(at, min(15)));
    pay(f, "dep", s.plusMs(at, min(30)), "neema", { method: "card", account: "crdb_usd", amount: 0.5 });
    f.issue("ht", s.day(13, "10:00"));
    pay(f, "bal", s.day(6, "12:30"), "neema", { method: "cash", account: "cash_usd", amount: "balance" });
    out.P4 = f;
  }

  // P5 — hotel only (Arusha), bank deposit + cash balance in USD.
  {
    const at = s.day(18, "09:50");
    const pax = ["mrema.joseph"];
    const f = new FileBuilder(s, { key: "P5", client: "mrema", owner: "baraka", currency: "USD", source: "walk_in", title: "Arusha stay · Joseph Mrema", pax, at });
    f.hotel("ht", s.plusMs(at, min(10)), { supplier: "hotel_ark", pax, name: "Themi River Lodge", city: "Arusha", inD: 4, outD: 7, rooms: [{ roomType: "Garden cottage", board: "FB", adults: 1 }], perNight: 180, markup: 50, status: "booked" });
    f.invoice(s.plusMs(at, min(15)));
    pay(f, "dep", s.day(17, "14:05"), "peter", { method: "bank_transfer", account: "crdb_usd", amount: 0.5 });
    f.issue("ht", s.day(16, "11:20"));
    pay(f, "bal", s.day(10, "10:10"), "baraka", { method: "cash", account: "cash_usd", amount: "balance" });
    out.P5 = f;
  }

  // P6 — car hire only (TZS): M-Pesa deposit, balance by Mixx still unverified.
  {
    const at = s.day(9, "10:30");
    const pax = ["lyimo.godfrey"];
    const f = new FileBuilder(s, { key: "P6", client: "lyimo", owner: "neema", currency: "TZS", source: "phone", title: "Car with driver · Godfrey Lyimo", pax, at });
    f.car("car", s.plusMs(at, min(10)), {
      supplier: "car_1",
      pax,
      company: "Twiga Car Rentals",
      carClass: "Toyota Land Cruiser V8",
      withDriver: true,
      pickup: ["Mikocheni, Dar es Salaam", 3, "08:00"],
      dropoff: ["Mikocheni, Dar es Salaam", 6, "18:00"],
      perDay: 220_000,
      markup: 90_000,
      status: "booked",
    });
    f.invoice(s.plusMs(at, min(15)));
    pay(f, "dep", s.plusMs(at, min(40)), "neema", { method: "mpesa", account: "mpesa", amount: 0.5 });
    f.issue("car", s.day(8, "09:30"));
    pay(f, "bal", s.day(2, "15:40"), "neema", { method: "mixx", account: "nmb_tzs", amount: "balance", verify: false });
    out.P6 = f;
  }

  // P7 — visa + insurance (TZS file; the visa is priced in USD).
  {
    const at = s.day(20, "11:10");
    const pax = ["temba.janeth"];
    const f = new FileBuilder(s, { key: "P7", client: "temba", owner: "baraka", currency: "TZS", source: "email", title: "UK visa and cover · Janeth Temba", pax, at });
    f.visa("visa", s.plusMs(at, min(10)), { supplier: "visa", pax, country: "United Kingdom", visaType: "Standard Visitor (6 months)", submittedD: -20, decision: "approved", cost: 175, markup: 15, status: "booked" });
    f.insurance("ins", s.plusMs(at, min(15)), { supplier: "insurance", pax, provider: "Kinga Travel Insurance", plan: "Travel Silver (worldwide excl. USA)", startD: 10, endD: 40, cost: 120_000, markup: 20_000, status: "booked" });
    f.invoice(s.plusMs(at, min(20)));
    pay(f, "dep", s.plusMs(at, min(35)), "baraka", { method: "cash", account: "cash_tzs", amount: 0.5 });
    f.issue("visa", s.day(18, "12:00")).issue("ins", s.day(18, "12:05"));
    pay(f, "bal", s.day(12, "17:15"), "baraka", { method: "halopesa", account: "nmb_tzs", amount: "balance" });
    out.P7 = f;
  }

  // P8 — EgyptAir to Cairo, USD cash deposit + Mixx balance in TZS at 2,600.
  {
    const at = s.day(12, "13:15");
    const pax = ["kweka.emmanuel"];
    const f = new FileBuilder(s, { key: "P8", client: "kweka", owner: "neema", currency: "USD", source: "email", title: "Dar → Cairo · Emmanuel Kweka", pax, at });
    f.flight("fl", s.plusMs(at, min(10)), { pax, segs: [seg("MS850", 30), seg("MS849", 37)], fare: { cur: "USD", base: 560, tax: [["EG", 60], ["YQ", 90], ["TZ", 48], ["XT", 12]] }, markup: 45, status: "booked" });
    f.invoice(s.plusMs(at, min(15)));
    pay(f, "dep", s.plusMs(at, min(30)), "neema", { method: "cash", account: "cash_usd", amount: 0.5 });
    f.issue("fl", s.day(11, "10:30"));
    pay(f, "bal", s.day(7, "09:50"), "neema", { method: "mixx", account: "nmb_tzs", cur: "TZS", amount: "balance" });
    out.P8 = f;
  }

  // PP1 — partial: son flying home from London + Arusha lodge + airport transfer (multi-service), USD.
  {
    const at = s.day(14, "10:20");
    const f = new FileBuilder(s, { key: "PP1", client: "mollel", owner: "baraka", currency: "USD", source: "phone", title: "London → Kilimanjaro · Brian Mollel home visit", pax: ["mollel.brian", "mollel.rehema"], at });
    f.flight("fl", s.plusMs(at, min(10)), { pax: ["mollel.brian"], segs: [seg("QR4", 16), seg("QR1343", 17)], fare: { cur: "USD", base: 690, tax: [["GB", 120], ["YQ", 150], ["XT", 40]] }, markup: 50, status: "booked" });
    f.transfer("tr", s.plusMs(at, min(15)), { supplier: "transfer", pax: ["mollel.brian"], from: "Kilimanjaro Airport (JRO)", to: "Themi River Lodge, Arusha", when: [17, "14:30"], vehicle: "Toyota Land Cruiser", cost: 120_000, markup: 20_000, flightRef: "QR 1343", status: "booked" });
    f.hotel("ht", s.plusMs(at, min(20)), { supplier: "hotel_ark", pax: ["mollel.rehema", "mollel.brian"], name: "Themi River Lodge", city: "Arusha", inD: 17, outD: 20, rooms: [{ roomType: "Deluxe twin", board: "BB", adults: 2 }], perNight: 160, markup: 60, status: "booked" });
    f.invoice(s.plusMs(at, min(30)));
    pay(f, "dep", s.plusMs(at, min(50)), "peter", { method: "bank_transfer", account: "crdb_usd", amount: 0.4 });
    f.issue("fl", s.day(12, "10:00")).issue("tr", s.day(12, "10:05")).issue("ht", s.day(12, "10:10"));
    pay(f, "p2", s.day(6, "13:25"), "baraka", { method: "mpesa", account: "mpesa", cur: "TZS", amount: 0.3 });
    out.PP1 = f;
  }

  // PP2 — partial: Turkish partners flying into Zanzibar + hotel + transfer (multi-service), USD.
  {
    const at = s.day(10, "11:45");
    const pax = ["omar.mehmet", "omar.emre"];
    const f = new FileBuilder(s, { key: "PP2", client: "omar", owner: "neema", currency: "USD", source: "phone", title: "Istanbul → Zanzibar · Omar's business partners", pax, at });
    f.flight("fl", s.plusMs(at, min(10)), { pax, segs: [seg("TK675", 11), seg("TK676", 18)], fare: { cur: "USD", base: 710, tax: [["YQ", 150], ["TR", 45], ["XT", 55]] }, markup: 60, status: "booked" });
    f.hotel("ht", s.plusMs(at, min(18)), {
      supplier: "hotel_znz",
      pax,
      name: "Forodhani Heritage Hotel",
      city: "Zanzibar",
      inD: 12,
      outD: 18,
      rooms: [
        { roomType: "Superior double", board: "BB", adults: 1 },
        { roomType: "Superior double", board: "BB", adults: 1 },
      ],
      perNight: 130,
      markup: 120,
      status: "booked",
    });
    f.transfer("tr", s.plusMs(at, min(22)), { supplier: "transfer", pax, from: "Zanzibar Airport (ZNZ)", to: "Forodhani Heritage Hotel, Stone Town", when: [12, "04:45"], vehicle: "Toyota Noah minivan", cost: 60_000, markup: 15_000, flightRef: "TK 675", status: "booked" });
    f.invoice(s.plusMs(at, min(30)));
    pay(f, "dep", s.day(9, "10:05"), "peter", { method: "bank_transfer", account: "crdb_usd", amount: 0.5 });
    f.issue("fl", s.day(8, "09:15")).issue("ht", s.day(8, "09:20")).issue("tr", s.day(8, "09:25"));
    pay(f, "p2", s.day(3, "18:10"), "neema", { method: "airtel_money", account: "airtel", cur: "TZS", amount: 0.4, verify: false });
    out.PP2 = f;
  }

  // U1 — issued on trust, unpaid, departing in 3 days (Guangzhou buying trip).
  {
    const at = s.day(6, "15:00");
    const pax = ["massawe.daudi", "massawe.isaya"];
    const f = new FileBuilder(s, { key: "U1", client: "massawe", owner: "neema", currency: "USD", source: "walk_in", title: "Dar → Guangzhou · Massawe buying trip", pax, at, notes: "Regular client; promised to pay before departure." });
    f.flight("fl", s.plusMs(at, min(12)), { pax, segs: [seg("ET806", 3), seg("ET606", 3), seg("ET607", 17), seg("ET815", 17)], fare: { cur: "USD", base: 890, tax: [["YQ", 150], ["TZ", 48], ["XT", 40]] }, markup: 70, status: "booked" });
    f.invoice(s.plusMs(at, min(20)));
    f.issue("fl", s.day(4, "12:00"));
    out.U1 = f;
  }

  // U2 — corporate on credit (Pwani, near its limit): contractor from Dubai — flight + hotel + transfer, unpaid, arriving in 5 days.
  {
    const at = s.day(12, "10:40");
    const pax = ["pwani.rajesh"];
    const f = new FileBuilder(s, { key: "U2", client: "pwani", owner: "baraka", currency: "TZS", source: "corporate", title: "Dubai → Dar · contractor Rajesh Nair", pax, at });
    f.flight("fl", s.plusMs(at, min(10)), { pax, segs: [seg("EK725", 5), seg("EK726", 19)], fare: { cur: "TZS", base: 1_150_000, tax: [["YQ", 420_000], ["TZ", 125_000], ["XT", 73_000]] }, markup: 60_000, status: "booked" });
    f.hotel("ht", s.plusMs(at, min(18)), { supplier: "hotel_dar", pax, name: "Coco Beach Suites", city: "Dar es Salaam", inD: 5, outD: 19, rooms: [{ roomType: "Studio apartment", board: "BB", adults: 1 }], perNight: 120, markup: 150, status: "booked" });
    f.transfer("tr", s.plusMs(at, min(22)), { supplier: "transfer", pax, from: "Julius Nyerere Airport (DAR)", to: "Coco Beach Suites, Msasani", when: [5, "15:45"], vehicle: "Toyota Alphard", cost: 70_000, markup: 15_000, flightRef: "EK 725", status: "booked" });
    f.issue("fl", s.day(10, "09:00")).issue("ht", s.day(10, "09:05")).issue("tr", s.day(10, "09:10"));
    f.invoice(s.day(10, "09:20"));
    out.U2 = f;
  }

  return out;
}
