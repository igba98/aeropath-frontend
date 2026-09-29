/**
 * Reports (spec §9.10) and the Manager home figures (§9.1). One function per report slug, each taking
 * (db, { from, to, agentId?, displayCurrency, now }) and returning { summary, charts, rows, totals, … }.
 */

export * from "./types";
export {
  PERIOD_PRESETS,
  presetPeriod,
  previousPeriod,
  inPeriod,
  lineIssuedAt,
  lineEventAt,
  lineStatusAt,
  monthStart,
  monthEnd,
  shiftMonth,
  type Period,
  type PeriodPreset,
} from "./common";
export { REPORTS, reportBySlug, type ReportDef, type ReportSlug } from "./registry";
export {
  mySalesReport,
  salesReport,
  profitReport,
  salesRows,
  salesSeries,
  salesByAgent,
  topClients,
  autoGrouping,
  breakdown,
  pctText,
  type SaleRow,
  type MySalesReport,
  type SalesReport,
  type SalesGrouping,
  type ProfitRow,
  type SalesPoint,
  type AgentSales,
  type ClientSales,
} from "./sales";
export {
  airlineSalesReport,
  voidsRefundsReport,
  bspPeriodReport,
  matchBspBilling,
  type AirlineRow,
  type VoidRefundRow,
  type BspRow,
  type BspMatchRow,
} from "./air";
export {
  receivablesReport,
  payablesReport,
  cashBookReport,
  LEDGER_KIND_LABELS,
  type ReceivableReportRow,
  type PayableReportRow,
  type CashBookReport,
  type CashBookRow,
  type CashAccountSummary,
} from "./money-reports";
export {
  receiptsReport,
  expensesReport,
  pnlReport,
  type ReceiptsReport,
  type ReceiptRow,
  type ReceiptGroup,
  type ExpensesReport,
  type ExpenseRow,
  type PnlReport,
  type PnlRow,
} from "./ledger-reports";
export { monthKpis, receivablesAt, payablesAt, cashAt, cashInFor, type Kpi, type MonthKpis } from "./kpis";
