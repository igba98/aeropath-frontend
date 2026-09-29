/**
 * Seed bookings, part A: drafts (quotes) and booked flights waiting to be ticketed.
 */
import { FileBuilder } from "./seed-file";
import type { Seeder } from "./seed-kit";
import { pay } from "./seed-money";
import { seg } from "./seed-routes";

export function draftsAndBooked(s: Seeder): Record<string, FileBuilder> {
  const out: Record<string, FileBuilder> = {};

  // D1 — draft, older than 3 days: Zanzibar family break (flight + hotel + transfer), quoted.
  {
    const at = s.day(6, "10:15");
    const f = new FileBuilder(s, { key: "D1", client: "shirima", owner: "neema", currency: "TZS", source: "walk_in", title: "Zanzibar family break · Shirima", pax: ["shirima.frank", "shirima.lucy", "shirima.kelvin"], at, tags: ["holiday"] });
    f.flight("fl", s.plusMs(at, 10 * 60_000), {
      pax: ["shirima.frank", "shirima.lucy", "shirima.kelvin"],
      segs: [seg("PW710", 20), seg("PW711", 24)],
      fare: { cur: "TZS", base: 145_000, tax: [["TZ", 20_000], ["YQ", 15_000]] },
      markup: 45_000,
      status: "quoted",
      baggage: "20K",
    });
    f.hotel("ht", s.plusMs(at, 20 * 60_000), { supplier: "hotel_znz", pax: ["shirima.frank", "shirima.lucy", "shirima.kelvin"], name: "Forodhani Heritage Hotel", city: "Zanzibar", inD: 20, outD: 24, rooms: [{ roomType: "Family room, sea view", board: "BB", adults: 2, children: 1 }], perNight: 165, markup: 60, status: "quoted" });
    f.transfer("tr", s.plusMs(at, 25 * 60_000), { supplier: "transfer", pax: ["shirima.frank", "shirima.lucy", "shirima.kelvin"], from: "Zanzibar Airport (ZNZ)", to: "Forodhani Heritage Hotel, Stone Town", when: [20, "08:30"], vehicle: "Toyota Noah minivan", cost: 60_000, markup: 15_000, flightRef: "PW 710", status: "quoted" });
    f.quote(s.plusMs(at, 35 * 60_000));
    out.D1 = f;
  }

  // D2 — draft: Dubai trip for two brothers, quoted.
  {
    const at = s.day(2, "14:10");
    const f = new FileBuilder(s, { key: "D2", client: "massawe", owner: "baraka", currency: "USD", source: "walk_in", title: "Dar → Dubai · Massawe brothers", pax: ["massawe.daudi", "massawe.isaya"], at });
    f.flight("fl", s.plusMs(at, 8 * 60_000), {
      pax: ["massawe.daudi", "massawe.isaya"],
      segs: [seg("EK726", 35), seg("EK725", 42)],
      fare: { cur: "USD", base: 420, tax: [["YQ", 180], ["TZ", 48], ["XT", 62]] },
      markup: 40,
      status: "quoted",
    });
    f.quote(s.plusMs(at, 15 * 60_000));
    out.D2 = f;
  }

  // D3 — draft: Arusha weekend, hotel + car with driver, quoted.
  {
    const at = s.day(1, "11:30");
    const f = new FileBuilder(s, { key: "D3", client: "mbwambo", owner: "neema", currency: "USD", source: "whatsapp", title: "Arusha weekend · Zawadi Mbwambo", pax: ["mbwambo.zawadi"], at });
    f.hotel("ht", s.plusMs(at, 6 * 60_000), { supplier: "hotel_ark", pax: ["mbwambo.zawadi"], name: "Themi River Lodge", city: "Arusha", inD: 30, outD: 33, rooms: [{ roomType: "Deluxe double", board: "BB", adults: 1 }], perNight: 140, markup: 45, status: "quoted" });
    f.car("car", s.plusMs(at, 12 * 60_000), {
      supplier: "car_2",
      pax: ["mbwambo.zawadi"],
      company: "Kariakoo Car Hire",
      carClass: "Toyota Land Cruiser Prado",
      withDriver: true,
      pickup: ["Kilimanjaro Airport (JRO)", 30, "10:00"],
      dropoff: ["Kilimanjaro Airport (JRO)", 33, "16:00"],
      perDay: 250_000,
      markup: 60_000,
      status: "quoted",
    });
    f.quote(s.plusMs(at, 20 * 60_000));
    out.D3 = f;
  }

  // D4 — draft created this morning: Kigali on RwandAir, quoted.
  {
    const at = s.todayAt(0.3);
    const f = new FileBuilder(s, { key: "D4", client: "lyimo", owner: "baraka", currency: "USD", source: "phone", title: "Dar → Kigali · Lyimo", pax: ["lyimo.godfrey", "lyimo.irene"], at });
    f.flight("fl", s.todayAt(0.33), {
      pax: ["lyimo.godfrey", "lyimo.irene"],
      segs: [seg("WB401", 18), seg("WB400", 22)],
      fare: { cur: "USD", base: 290, tax: [["TZ", 40], ["XT", 55]] },
      markup: 30,
      status: "quoted",
    });
    f.quote(s.todayAt(0.36));
    out.D4 = f;
  }

  // B1 — booked, ticketing time limit in 20 h, deposit received.
  {
    const at = s.day(4, "09:40");
    const f = new FileBuilder(s, { key: "B1", client: "kweka", owner: "neema", currency: "USD", source: "email", title: "Dar → London · Emmanuel Kweka", pax: ["kweka.emmanuel"], at });
    f.flight("fl", s.plusMs(at, 15 * 60_000), {
      pax: ["kweka.emmanuel"],
      segs: [seg("QR1350", 12), seg("QR5", 13), seg("QR4", 26), seg("QR1349", 27)],
      fare: { cur: "USD", base: 780, tax: [["YQ", 260], ["GB", 120], ["TZ", 48], ["XT", 40]] },
      markup: 55,
      status: "booked",
      ttl: s.fromNow(20),
    });
    f.invoice(s.plusMs(at, 25 * 60_000));
    pay(f, "dep", s.day(3, "11:20"), "neema", { method: "bank_transfer", account: "crdb_usd", amount: { exact: 500 }, note: "Deposit" });
    out.B1 = f;
  }

  // B2 — booked, ticketing time limit in 40 h, unpaid.
  {
    const at = s.day(3, "15:20");
    const f = new FileBuilder(s, { key: "B2", client: "mollel", owner: "baraka", currency: "USD", source: "phone", title: "Dar → Amsterdam · Rehema Mollel", pax: ["mollel.rehema"], at });
    f.flight("fl", s.plusMs(at, 10 * 60_000), {
      pax: ["mollel.rehema"],
      segs: [seg("KQ485", 15), seg("KQ116", 15), seg("KQ117", 29), seg("KQ484", 30)],
      fare: { cur: "USD", base: 690, tax: [["YQ", 210], ["NL", 45], ["TZ", 48], ["XT", 37]] },
      markup: 45,
      status: "booked",
      ttl: s.fromNow(40),
    });
    f.invoice(s.plusMs(at, 15 * 60_000));
    out.B2 = f;
  }

  // B3 — booked on flydubai, M-Pesa deposit in TZS still unverified after 2 days.
  {
    const at = s.day(5, "12:05");
    const f = new FileBuilder(s, { key: "B3", client: "omar", owner: "neema", currency: "USD", source: "phone", title: "Dar → Dubai · Salim Omar", pax: ["omar.salim"], at });
    f.flight("fl", s.plusMs(at, 8 * 60_000), {
      pax: ["omar.salim"],
      segs: [seg("FZ687", 9), seg("FZ686", 16)],
      fare: { cur: "USD", base: 330, tax: [["TZ", 48], ["AE", 35], ["XT", 42]] },
      markup: 35,
      status: "booked",
      ttl: s.fromNow(96),
      baggage: "30K",
    });
    f.invoice(s.plusMs(at, 15 * 60_000));
    pay(f, "dep", s.day(2, "10:45"), "neema", { method: "mpesa", account: "mpesa", cur: "TZS", amount: 0.5, verify: false, note: "Deposit by M-Pesa" });
    out.B3 = f;
  }

  // B4 — booked domestic (Air Tanzania, TZS), deposit by M-Pesa.
  {
    const at = s.day(3, "10:10");
    const f = new FileBuilder(s, { key: "B4", client: "halima", owner: "baraka", currency: "TZS", source: "whatsapp", title: "Dar → Mwanza · Halima & Ali", pax: ["halima.halima", "halima.ali"], at });
    f.flight("fl", s.plusMs(at, 12 * 60_000), {
      pax: ["halima.halima", "halima.ali"],
      segs: [seg("TC110", 10), seg("TC111", 13)],
      fare: { cur: "TZS", base: 210_000, tax: [["TZ", 20_000], ["YQ", 10_000]] },
      markup: 30_000,
      status: "booked",
      ttl: s.fromNow(72),
      baggage: "23K",
    });
    f.invoice(s.plusMs(at, 18 * 60_000));
    pay(f, "dep", s.day(1, "16:00"), "baraka", { method: "mpesa", account: "mpesa", amount: 0.5 });
    out.B4 = f;
  }

  // B5 — booked for a corporate on credit (counts toward its credit usage).
  {
    const at = s.day(6, "09:15");
    const f = new FileBuilder(s, { key: "B5", client: "pwani", owner: "baraka", currency: "TZS", source: "corporate", title: "Dar → Dodoma · Pwani Energy site visit", pax: ["pwani.hamisi", "pwani.gasper"], at });
    f.flight("fl", s.plusMs(at, 10 * 60_000), {
      pax: ["pwani.hamisi", "pwani.gasper"],
      segs: [seg("TC104", 8), seg("TC105", 10)],
      fare: { cur: "TZS", base: 300_000, tax: [["TZ", 50_000], ["YQ", 35_000]] },
      markup: 40_000,
      status: "booked",
      ttl: s.fromNow(120),
      baggage: "23K",
    });
    f.invoice(s.plusMs(at, 20 * 60_000));
    out.B5 = f;
  }

  return out;
}
