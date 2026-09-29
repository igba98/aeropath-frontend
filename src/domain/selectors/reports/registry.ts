import type { Action } from "../../permissions";

/** The report catalogue (spec §9.10), in the order the index lists them. */

export type ReportSlug =
  | "my-sales"
  | "sales"
  | "profit"
  | "airline-sales"
  | "receivables"
  | "payables"
  | "cash-book"
  | "receipts"
  | "voids-refunds"
  | "expenses"
  | "pnl"
  | "bsp-period";

export interface ReportDef {
  slug: ReportSlug;
  name: string;
  description: string;
  group: "Sales" | "Money in and out" | "Accounts";
  permission: Action;
  /** Show the agent filter. */
  agentFilter: boolean;
  /** 'period' reports take a date range; 'asOf' reports are balances today. */
  range: "period" | "asOf";
}

export const REPORTS: ReportDef[] = [
  { slug: "my-sales", name: "My sales", description: "Bookings and services you issued: count, value and margin, by service type.", group: "Sales", permission: "report.my_sales", agentFilter: true, range: "period" },
  { slug: "sales", name: "Sales", description: "Issued services by day, week or month, with breakdowns by agent, service type, client and airline.", group: "Sales", permission: "report.view", agentFilter: true, range: "period" },
  { slug: "profit", name: "Profit by booking", description: "Charges, cost and margin per booking. Sort by margin % to find thin or negative bookings.", group: "Sales", permission: "report.view", agentFilter: true, range: "period" },
  { slug: "airline-sales", name: "Airline sales", description: "By validating carrier: tickets issued, voided and refunded, fare, commission and net to settle.", group: "Sales", permission: "report.view", agentFilter: true, range: "period" },
  { slug: "voids-refunds", name: "Voids and refunds", description: "Every void, refund and exchange with amounts, penalties, agency fees and who approved.", group: "Sales", permission: "report.view", agentFilter: true, range: "period" },
  { slug: "receivables", name: "Who owes us", description: "Client balances by age: not due, 0–30, 31–60, 61–90 and 90+ days past due.", group: "Money in and out", permission: "report.view", agentFilter: true, range: "asOf" },
  { slug: "payables", name: "What we owe", description: "Open supplier cost per supplier, aged by days past the supplier's terms.", group: "Money in and out", permission: "report.view", agentFilter: false, range: "asOf" },
  { slug: "receipts", name: "Receipts by method", description: "Money received by payment method and account, with verification status.", group: "Money in and out", permission: "report.view", agentFilter: true, range: "period" },
  { slug: "cash-book", name: "Cash book", description: "Per money account: opening, money in, money out and closing, with every movement.", group: "Money in and out", permission: "report.view", agentFilter: false, range: "period" },
  { slug: "expenses", name: "Expenses", description: "Office spending by category and month.", group: "Accounts", permission: "report.view", agentFilter: false, range: "period" },
  { slug: "pnl", name: "Profit and loss", description: "Revenue less expenses by month. Management view, not statutory accounts.", group: "Accounts", permission: "report.view", agentFilter: false, range: "period" },
  { slug: "bsp-period", name: "Air settlement period", description: "Tickets issued, voided and refunded in a settlement period, with document numbers.", group: "Accounts", permission: "report.view", agentFilter: false, range: "period" },
];

export const reportBySlug = (slug: string): ReportDef | undefined => REPORTS.find((r) => r.slug === slug);
