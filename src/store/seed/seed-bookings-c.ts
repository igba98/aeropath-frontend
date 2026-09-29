/**
 * Seed bookings, part C: travelled and closed trips, the same-day void, refunds, the exchange and the overdue
 * corporate (Bahari Freight).
 */
import { FileBuilder } from "./seed-file";
import type { Seeder } from "./seed-kit";
import { decide, pay, payOutRefund, requestRefundOn, reverse, voidTicket } from "./seed-money";
import { seg } from "./seed-routes";

const min = (m: number) => m * 60_000;

export function afterSalesFiles(s: Seeder): Record<string, FileBuilder> {
  const out: Record<string, FileBuilder> = {};

  // T1 — travelled and closed: Mwakalinga family in Nairobi (TZS), three instalments, lines marked completed.
  {
    const at = s.day(55, "10:30");
    const pax = ["mwakalinga.peter", "mwakalinga.anna", "mwakalinga.david"];
    const f = new FileBuilder(s, { key: "T1", client: "mwakalinga", owner: "neema", currency: "TZS", source: "walk_in", title: "Dar → Nairobi · Mwakalinga family", pax, at, tags: ["family"] });
    f.flight("fl", s.plusMs(at, min(12)), { pax, segs: [seg("KQ485", -30), seg("KQ484", -24)], fare: { cur: "TZS", base: 760_000, tax: [["KE", 95_000], ["TZ", 65_000], ["YQ", 100_000]] }, markup: 90_000, status: "booked" });
    f.invoice(s.plusMs(at, min(20)));
    pay(f, "p1", s.plusMs(at, min(40)), "neema", { method: "mpesa", account: "mpesa", amount: 0.3 });
    pay(f, "p2", s.day(48, "12:15"), "neema", { method: "airtel_money", account: "airtel", amount: 0.5 });
    f.issue("fl", s.day(47, "10:00"));
    pay(f, "p3", s.day(40, "16:20"), "neema", { method: "cash", account: "cash_tzs", amount: "balance" });
    f.complete("fl", s.day(23, "09:10"));
    out.T1 = f;
  }

  // T2 — travelled and closed: Dubai (USD), card + M-Pesa (TZS at 2,600) + cash.
  {
    const at = s.day(40, "12:00");
    const pax = ["mrema.joseph"];
    const f = new FileBuilder(s, { key: "T2", client: "mrema", owner: "baraka", currency: "USD", source: "walk_in", title: "Dar → Dubai · Joseph Mrema", pax, at });
    f.flight("fl", s.plusMs(at, min(10)), { pax, segs: [seg("EK726", -20), seg("EK725", -14)], fare: { cur: "USD", base: 420, tax: [["YQ", 180], ["TZ", 48], ["XT", 62]] }, markup: 45, status: "booked" });
    f.invoice(s.plusMs(at, min(15)));
    pay(f, "p1", s.plusMs(at, min(25)), "baraka", { method: "card", account: "crdb_usd", amount: 0.5 });
    f.issue("fl", s.day(38, "11:30"));
    pay(f, "p2", s.day(30, "10:40"), "baraka", { method: "mpesa", account: "mpesa", cur: "TZS", amount: 0.5 });
    pay(f, "p3", s.day(25, "15:05"), "baraka", { method: "cash", account: "cash_usd", amount: "balance" });
    out.T2 = f;
  }

  // T3 — travelled and closed: Amsterdam (USD). The TZS cheque bounced and was reversed; paid again by bank transfer.
  {
    const at = s.day(45, "09:45");
    const pax = ["temba.janeth"];
    const f = new FileBuilder(s, { key: "T3", client: "temba", owner: "baraka", currency: "USD", source: "email", title: "Dar → Amsterdam · Janeth Temba", pax, at });
    f.flight("fl", s.plusMs(at, min(10)), { pax, segs: [seg("KL570", -22), seg("KL569", -12)], fare: { cur: "USD", base: 980, tax: [["YQ", 220], ["NL", 45], ["TZ", 48], ["XT", 47]] }, markup: 60, status: "booked" });
    f.invoice(s.plusMs(at, min(15)));
    pay(f, "chq", s.day(44, "11:00"), "baraka", { method: "cheque", account: "crdb_tzs", cur: "TZS", amount: "balance", verify: false });
    f.issue("fl", s.day(43, "10:20"));
    reverse(f, "chq", s.day(37, "09:30"), "Cheque returned unpaid by the bank (insufficient funds)");
    pay(f, "bank", s.day(36, "14:45"), "peter", { method: "bank_transfer", account: "crdb_usd", amount: "balance" });
    out.T3 = f;
  }

  // V1 — paid, issued this morning, voided today: the client is in credit.
  {
    const at = s.day(2, "09:30");
    const pax = ["mbwambo.zawadi"];
    const f = new FileBuilder(s, { key: "V1", client: "mbwambo", owner: "neema", currency: "USD", source: "whatsapp", title: "Dar → Dubai · Zawadi Mbwambo", pax, at });
    f.flight("fl", s.plusMs(at, min(10)), { pax, segs: [seg("EK726", 21), seg("EK725", 28)], fare: { cur: "USD", base: 420, tax: [["YQ", 180], ["TZ", 48], ["XT", 62]] }, markup: 40, status: "booked" });
    f.invoice(s.plusMs(at, min(15)));
    pay(f, "p1", s.todayAt(0.35), "neema", { method: "cash", account: "cash_usd", amount: "balance" });
    f.issue("fl", s.todayAt(0.5));
    voidTicket(f, "fl", s.todayAt(0.8), "Client's leave was cancelled by her employer; ticket voided the same day");
    out.V1 = f;
  }

  // R1 — refund requested yesterday, above the TZS 500,000 limit: only a Manager can approve.
  {
    const at = s.day(16, "10:00");
    const pax = ["lyimo.godfrey"];
    const f = new FileBuilder(s, { key: "R1", client: "lyimo", owner: "baraka", currency: "USD", source: "phone", title: "Dar → Paris · Godfrey Lyimo", pax, at });
    f.flight("fl", s.plusMs(at, min(10)), { pax, segs: [seg("QR1350", 25), seg("QR39", 26), seg("QR40", 40), seg("QR1351", 40)], fare: { cur: "USD", base: 1050, tax: [["YQ", 260], ["FR", 52], ["TZ", 48], ["XT", 40]] }, markup: 60, status: "booked" });
    f.invoice(s.plusMs(at, min(15)));
    pay(f, "p1", s.plusMs(at, min(40)), "peter", { method: "bank_transfer", account: "crdb_usd", amount: 0.5 });
    f.issue("fl", s.day(14, "11:00"));
    pay(f, "p2", s.day(13, "15:30"), "baraka", { method: "card", account: "crdb_usd", amount: "balance" });
    requestRefundOn(f, "fl", s.day(1, "14:20"), { kind: "refund", reason: "Conference in Paris postponed; client cancels the trip", penalty: [200, "USD"], agencyFee: [50_000, "TZS"] });
    out.R1 = f;
  }

  // R2 — refund approved by the Accountant (within the limit), not paid out yet. TZS.
  {
    const at = s.day(20, "12:40");
    const pax = ["halima.halima"];
    const f = new FileBuilder(s, { key: "R2", client: "halima", owner: "neema", currency: "TZS", source: "whatsapp", title: "Dar → Nairobi · Halima Mohamed", pax, at });
    f.flight("fl", s.plusMs(at, min(10)), { pax, segs: [seg("KQ485", 8), seg("KQ484", 12)], fare: { cur: "TZS", base: 870_000, tax: [["KE", 95_000], ["TZ", 65_000], ["YQ", 120_000]] }, markup: 50_000, status: "booked" });
    f.invoice(s.plusMs(at, min(15)));
    pay(f, "p1", s.plusMs(at, min(30)), "neema", { method: "mpesa", account: "mpesa", amount: 0.5 });
    f.issue("fl", s.day(18, "10:00"));
    pay(f, "p2", s.day(17, "11:45"), "neema", { method: "halopesa", account: "nmb_tzs", amount: "balance" });
    requestRefundOn(f, "fl", s.day(6, "11:00"), { kind: "refund", reason: "Family emergency; trip cancelled", penalty: [600_000, "TZS"] });
    decide(f, s.day(5, "10:30"), "peter", "approve", "Penalty confirmed with the consolidator");
    out.R2 = f;
  }

  // R3 — refunded and paid out: approved by the Manager (above the limit), paid from CRDB USD.
  {
    const at = s.day(30, "14:40");
    const pax = ["fatma.fatma"];
    const f = new FileBuilder(s, { key: "R3", client: "fatma", owner: "baraka", currency: "USD", source: "phone", title: "Dar → Addis Ababa · Fatma Hassan", pax, at });
    f.flight("fl", s.plusMs(at, min(10)), { pax, segs: [seg("ET806", 5), seg("ET815", 9)], fare: { cur: "USD", base: 520, tax: [["YQ", 90], ["TZ", 48], ["XT", 32]] }, markup: 35, status: "booked" });
    f.invoice(s.plusMs(at, min(15)));
    pay(f, "p1", s.plusMs(at, min(30)), "baraka", { method: "card", account: "crdb_usd", amount: 0.5 });
    pay(f, "p2", s.day(29, "10:20"), "peter", { method: "bank_transfer", account: "crdb_usd", amount: "balance" });
    f.issue("fl", s.day(28, "09:45"));
    requestRefundOn(f, "fl", s.day(12, "10:00"), { kind: "refund", reason: "Conference cancelled by the organisers", penalty: [150, "USD"] });
    decide(f, s.day(11, "09:30"), "grace", "approve");
    f.invoice(s.day(11, "09:45"));
    payOutRefund(f, s.day(9, "11:00"), "crdb_usd", "bank_transfer");
    out.R3 = f;
  }

  // X1 — exchange: return date moved; the original ticket is exchanged and the replacement issued.
  {
    const at = s.day(24, "16:00");
    const pax = ["shirima.frank"];
    const f = new FileBuilder(s, { key: "X1", client: "shirima", owner: "neema", currency: "USD", source: "walk_in", title: "Dar → Istanbul · Frank Shirima", pax, at });
    f.flight("fl", s.plusMs(at, min(10)), { pax, segs: [seg("TK604", 4), seg("TK603", 12)], fare: { cur: "USD", base: 640, tax: [["YQ", 180], ["TR", 35], ["TZ", 48], ["XT", 22]] }, markup: 40, status: "booked" });
    f.invoice(s.plusMs(at, min(15)));
    pay(f, "p1", s.day(23, "10:15"), "peter", { method: "bank_transfer", account: "crdb_usd", amount: 0.6 });
    pay(f, "p2", s.day(22, "11:00"), "neema", { method: "cash", account: "cash_usd", amount: "balance" });
    f.issue("fl", s.day(22, "15:00"));
    requestRefundOn(f, "fl", s.day(6, "12:00"), {
      kind: "exchange",
      reason: "Client extends his stay in Istanbul; return moved by 6 days",
      penalty: [80, "USD"],
      exchange: { segs: [seg("TK604", 4), seg("TK603", 18)], additionalFare: [120, "USD"], changeFee: [50_000, "TZS"] },
    });
    decide(f, s.day(5, "10:00"), "peter", "approve", "Change fee and fare difference confirmed", { from: "fl", newLineKey: "fl2" });
    f.issue("fl2", s.day(4, "11:00"));
    f.invoice(s.day(4, "11:10"));
    pay(f, "p3", s.day(3, "12:30"), "neema", { method: "airtel_money", account: "airtel", cur: "TZS", amount: "balance" });
    out.X1 = f;
  }

  // C1a–C1c — Bahari Freight (corporate, 30-day terms): overdue invoices, one travelled and unpaid.
  {
    const at = s.day(52, "09:20");
    const pax = ["bahari.abdul", "bahari.yusufu"];
    const f = new FileBuilder(s, { key: "C1a", client: "bahari", owner: "baraka", currency: "TZS", source: "corporate", title: "Dar → Nairobi · Bahari port clearing team", pax, at });
    f.flight("fl", s.plusMs(at, min(10)), { pax, segs: [seg("KQ485", -40), seg("KQ484", -36)], fare: { cur: "TZS", base: 870_000, tax: [["KE", 95_000], ["TZ", 65_000], ["YQ", 120_000]] }, markup: 80_000, status: "booked" });
    f.issue("fl", s.day(50, "10:00"));
    f.invoice(s.day(50, "10:10"));
    out.C1a = f;
  }
  {
    const at = s.day(44, "11:00");
    const pax = ["bahari.mwanaisha"];
    const f = new FileBuilder(s, { key: "C1b", client: "bahari", owner: "baraka", currency: "TZS", source: "corporate", title: "Dar → Addis Ababa · Mwanaisha Juma", pax, at });
    f.flight("fl", s.plusMs(at, min(10)), { pax, segs: [seg("ET806", 15), seg("ET815", 19)], fare: { cur: "TZS", base: 1_300_000, tax: [["YQ", 230_000], ["TZ", 125_000], ["XT", 95_000]] }, markup: 60_000, status: "booked" });
    f.issue("fl", s.day(42, "10:30"));
    f.invoice(s.day(42, "10:40"));
    pay(f, "p1", s.day(40, "14:00"), "peter", { method: "bank_transfer", account: "nmb_tzs", amount: 0.4 });
    pay(f, "p2", s.day(21, "10:30"), "peter", { method: "bank_transfer", account: "nmb_tzs", amount: 0.3 });
    out.C1b = f;
  }
  {
    const at = s.day(38, "15:30");
    const pax = ["bahari.yusufu"];
    const f = new FileBuilder(s, { key: "C1c", client: "bahari", owner: "baraka", currency: "TZS", source: "corporate", title: "Dar → Dubai · Yusufu Kombo", pax, at });
    f.flight("fl", s.plusMs(at, min(10)), { pax, segs: [seg("EK726", 12), seg("EK725", 16)], fare: { cur: "TZS", base: 1_100_000, tax: [["YQ", 468_000], ["TZ", 125_000], ["XT", 153_000]] }, markup: 60_000, status: "booked" });
    f.issue("fl", s.day(36, "09:40"));
    f.invoice(s.day(36, "09:50"));
    out.C1c = f;
  }

  return out;
}
