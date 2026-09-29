import type { AccountCode, DbState, ID, ISODate } from "../types";
import { roundHalfUp } from "../money";
import { addDaysISO } from "../dates";
import { books, countsUpTo, isPnlAccount, rateOf, realEntries, type BookEntry } from "./books";
import { dayBefore, monthEnd } from "./periods";
import type { StatementRow } from "./statement";

/**
 * VAT return for a period, laid out like the TRA monthly return (VAT Act 2014): output tax on the agency's own
 * supplies (service fees, refund and change fees, and markup when Settings put markup in the VAT base), less credit
 * notes from voids and refunds; input tax recorded by journal; the net VAT payable; and a reconciliation of the VAT
 * control account (2300). Figures are TZS; USD transactions convert at the settings rate.
 */

const SALES_KINDS = new Set(["line_issue", "refund_retained"]);
const CREDIT_KINDS = new Set(["line_void", "refund_reversal"]);
const JOURNAL_KINDS = new Set(["journal", "journal_reversal", "transfer"]);

export interface VatDocument {
  groupId: ID;
  day: ISODate;
  kind: "sale" | "credit_note";
  memo: string;
  fileId?: ID;
  lineId?: ID;
  /** TZS, signed: credit notes negative. */
  value: number;
  vat: number;
  currency: "TZS" | "USD";
}

export interface VatReturn {
  from: ISODate;
  to: ISODate;
  rate: number;
  converted: boolean;
  /** 20th of the month after the period. */
  dueDate: ISODate;
  vatRate: number;
  standardRated: { value: number; vat: number };
  zeroRatedOrExempt: { value: number };
  creditNotes: { value: number; vat: number };
  outputTax: number;
  inputTax: number;
  netPayable: number;
  control: { opening: number; outputTax: number; inputTax: number; paymentsToTra: number; otherAdjustments: number; closing: number; closingPerLedger: number };
  documents: VatDocument[];
  rows: StatementRow[];
  notes: string[];
}

const toTzs = (minor: number, cur: "TZS" | "USD", rate: number) => (cur === "USD" ? roundHalfUp(minor * rate) : minor);

/** VAT control account (2300) credit balance in TZS as at a day. */
function vatBalance(db: DbState, day: ISODate): number {
  const rate = rateOf(db);
  let b = 0;
  for (const e of books(db)) if (e.account === "2300" && countsUpTo(e, day)) b += toTzs(e.creditMinor - e.debitMinor, e.currency, rate);
  return b;
}

export function vatReturn(db: DbState, p: { from: ISODate; to: ISODate }): VatReturn {
  const rate = rateOf(db);
  const withMarkup = db.settings.vatBase === "service_fee_and_markup";
  const baseAccounts = new Set<AccountCode>(withMarkup ? ["4100", "4300", "4200"] : ["4100", "4300"]);
  const groups = new Map<ID, BookEntry[]>();
  for (const e of realEntries(db)) {
    if (e.day < p.from || e.day > p.to) continue;
    const list = groups.get(e.groupId);
    if (list) list.push(e);
    else groups.set(e.groupId, [e]);
  }
  const standardRated = { value: 0, vat: 0 };
  const zeroRatedOrExempt = { value: 0 };
  const creditNotes = { value: 0, vat: 0 };
  let inputTax = 0;
  let paymentsToTra = 0;
  let otherAdjustments = 0;
  let converted = false;
  const documents: VatDocument[] = [];
  for (const [groupId, list] of groups) {
    const kind = list[0].kind ?? "";
    const cur = list[0].currency;
    const has2300 = list.some((e) => e.account === "2300");
    if (SALES_KINDS.has(kind) || CREDIT_KINDS.has(kind)) {
      let value = 0;
      let vat = 0;
      for (const e of list) {
        const net = toTzs(e.creditMinor - e.debitMinor, e.currency, rate);
        if (e.account === "2300") vat += net;
        else if (baseAccounts.has(e.account)) value += net;
      }
      if (!value && !vat) continue;
      if (cur === "USD") converted = true;
      const credit = CREDIT_KINDS.has(kind);
      if (credit) {
        creditNotes.value += value;
        creditNotes.vat += vat;
      } else if (vat !== 0) {
        standardRated.value += value;
        standardRated.vat += vat;
      } else {
        zeroRatedOrExempt.value += value;
      }
      const lineEntry = list.find((e) => e.lineId) ?? list[0];
      documents.push({ groupId, day: list[0].day, kind: credit ? "credit_note" : "sale", memo: list[0].memo, fileId: lineEntry.fileId, lineId: lineEntry.lineId, value, vat, currency: cur });
    } else if (JOURNAL_KINDS.has(kind) && has2300) {
      if (cur === "USD") converted = true;
      const vatDebit = list.filter((e) => e.account === "2300").reduce((s, e) => s + toTzs(e.debitMinor - e.creditMinor, e.currency, rate), 0);
      const hasCostLine = list.some((e) => isPnlAccount(e.account) || e.account === "1500");
      const hasMoney = list.some((e) => e.account === "1100");
      if (hasCostLine && !list.some((e) => e.account.startsWith("4"))) inputTax += vatDebit;
      else if (hasMoney && !hasCostLine) paymentsToTra += vatDebit;
      else otherAdjustments -= vatDebit;
    } else if (has2300) {
      // Any other posting that touched VAT (should not happen today) is shown as an adjustment.
      otherAdjustments += list.filter((e) => e.account === "2300").reduce((s, e) => s + toTzs(e.creditMinor - e.debitMinor, e.currency, rate), 0);
    }
  }
  documents.sort((a, b) => a.day.localeCompare(b.day));
  const outputTax = standardRated.vat + creditNotes.vat;
  const netPayable = outputTax - inputTax;
  const opening = vatBalance(db, dayBefore(p.from));
  const closingPerLedger = vatBalance(db, p.to);
  const closing = opening + outputTax - inputTax - paymentsToTra + otherAdjustments;
  const vatRate = db.settings.vatRate;
  const pct = `${Math.round(vatRate * 1000) / 10}%`;
  const L = (key: string, label: string, values: number[], style: StatementRow["style"] = "line", hint?: string, code?: AccountCode): StatementRow => ({
    key,
    label,
    style,
    values,
    indent: style === "line" ? 1 : 0,
    hint,
    code,
    drill: code ? { kind: "ledger", account: code, from: p.from, to: p.to } : undefined,
  });
  const rows: StatementRow[] = [
    { key: "h-out", label: "Output tax (sales)", style: "heading", indent: 0 },
    L("1", "Standard-rated supplies", [standardRated.value, standardRated.vat], "line", `VAT at ${pct}`),
    L("2", "Zero-rated and exempt supplies", [zeroRatedOrExempt.value, 0], "line", "Fees billed without VAT"),
    L("3", "Less credit notes (voids and refunds)", [creditNotes.value, creditNotes.vat], "line"),
    L("4", "Total output tax", [standardRated.value + zeroRatedOrExempt.value + creditNotes.value, outputTax], "subtotal"),
    { key: "h-in", label: "Input tax (purchases)", style: "heading", indent: 0 },
    { ...L("5", "Input tax claimed by journal", [0, inputTax], "line", "Journals debiting VAT with an expense or equipment line"), blank: [0] },
    { ...L("6", "Total input tax", [0, inputTax], "subtotal"), blank: [0] },
    { ...L("7", netPayable >= 0 ? "Net VAT payable to TRA" : "Net VAT refundable by TRA", [0, netPayable], "grand"), blank: [0] },
  ];
  const notes = [
    `File the return and pay by ${dueDateLabel(addDaysISO(monthEnd(p.to), 20))}: the 20th of the month after the period.`,
    withMarkup ? "The VAT base in Settings is the service fee and markup." : "The VAT base in Settings is the service fee only: fares, supplier costs and markup are not part of the taxable value.",
    "Input tax on purchases is not captured on expenses. Claim it with a journal: debit 2300 VAT with the VAT on the supplier's tax invoice, debit the expense, credit the bank or supplier.",
  ];
  if (converted) notes.push(`USD amounts are converted at the settings rate. TRA expects the Bank of Tanzania rate on the date of each supply; adjust by journal if they differ materially.`);
  return {
    from: p.from,
    to: p.to,
    rate,
    converted,
    dueDate: addDaysISO(monthEnd(p.to), 20),
    vatRate,
    standardRated,
    zeroRatedOrExempt,
    creditNotes,
    outputTax,
    inputTax,
    netPayable,
    control: { opening, outputTax, inputTax, paymentsToTra, otherAdjustments, closing, closingPerLedger },
    documents,
    rows,
    notes,
  };
}

function dueDateLabel(d: ISODate): string {
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${Number(d.slice(8, 10))} ${months[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
}
