import type { AccountCode, ExpenseCategory } from "../types";

/**
 * Chart of accounts (spec §8.4), laid out like a Tanzanian SME's books under IFRS for SMEs:
 * 1xxx assets, 2xxx liabilities, 3xxx equity, 4xxx income, 5xxx expenses.
 */

export type AccountKind = "asset" | "liability" | "equity" | "revenue" | "expense";
export type Subledger = "money_account" | "client" | "supplier";

export interface AccountDef {
  code: AccountCode;
  name: string;
  kind: AccountKind;
  subledger?: Subledger;
}

export const ACCOUNTS: Record<AccountCode, AccountDef> = {
  "1100": { code: "1100", name: "Cash, bank and mobile money", kind: "asset", subledger: "money_account" },
  "1200": { code: "1200", name: "Client receivables", kind: "asset", subledger: "client" },
  "1300": { code: "1300", name: "Prepayments and deposits", kind: "asset" },
  "1400": { code: "1400", name: "Staff advances", kind: "asset" },
  "1500": { code: "1500", name: "Office equipment and furniture", kind: "asset" },
  "1510": { code: "1510", name: "Accumulated depreciation", kind: "asset" },
  "2100": { code: "2100", name: "Supplier payables", kind: "liability", subledger: "supplier" },
  "2200": { code: "2200", name: "Accrued expenses", kind: "liability" },
  "2300": { code: "2300", name: "VAT payable", kind: "liability" },
  "2400": { code: "2400", name: "Withholding tax and PAYE payable", kind: "liability" },
  "2500": { code: "2500", name: "Loans and borrowings", kind: "liability" },
  "3100": { code: "3100", name: "Share capital", kind: "equity" },
  "3200": { code: "3200", name: "Retained earnings", kind: "equity" },
  "3300": { code: "3300", name: "Opening balance equity", kind: "equity" },
  "4100": { code: "4100", name: "Service fee revenue", kind: "revenue" },
  "4200": { code: "4200", name: "Markup revenue", kind: "revenue" },
  "4300": { code: "4300", name: "Refund and change fee revenue", kind: "revenue" },
  "4900": { code: "4900", name: "Other income", kind: "revenue" },
  "5100": { code: "5100", name: "Rent", kind: "expense" },
  "5200": { code: "5200", name: "Salaries", kind: "expense" },
  "5300": { code: "5300", name: "Utilities", kind: "expense" },
  "5400": { code: "5400", name: "Internet and phone", kind: "expense" },
  "5500": { code: "5500", name: "Marketing", kind: "expense" },
  "5600": { code: "5600", name: "Transport", kind: "expense" },
  "5700": { code: "5700", name: "Office supplies", kind: "expense" },
  "5750": { code: "5750", name: "Bank charges", kind: "expense" },
  "5800": { code: "5800", name: "GDS fees", kind: "expense" },
  "5850": { code: "5850", name: "Taxes and licences", kind: "expense" },
  "5900": { code: "5900", name: "Other expenses", kind: "expense" },
  "5950": { code: "5950", name: "Depreciation", kind: "expense" },
  "5960": { code: "5960", name: "Interest and finance costs", kind: "expense" },
};

export const EXPENSE_ACCOUNT: Record<ExpenseCategory, AccountCode> = {
  rent: "5100",
  salaries: "5200",
  utilities: "5300",
  internet_phone: "5400",
  marketing: "5500",
  transport: "5600",
  office_supplies: "5700",
  bank_charges: "5750",
  gds_fees: "5800",
  taxes_licences: "5850",
  other: "5900",
};

export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  rent: "Rent",
  salaries: "Salaries",
  utilities: "Utilities",
  internet_phone: "Internet and phone",
  marketing: "Marketing",
  transport: "Transport",
  office_supplies: "Office supplies",
  bank_charges: "Bank charges",
  gds_fees: "GDS fees",
  taxes_licences: "Taxes and licences",
  other: "Other",
};

export const REVENUE_ACCOUNTS: AccountCode[] = ["4100", "4200", "4300", "4900"];
export const EXPENSE_ACCOUNTS: AccountCode[] = Object.values(EXPENSE_ACCOUNT);

export const accountName = (code: AccountCode): string => ACCOUNTS[code]?.name ?? code;
