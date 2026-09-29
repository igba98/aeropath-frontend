import type { Currency, ID, ISODate, Money } from "../../types";

/** Shapes shared by every report (spec §9.10). */

export interface ReportParams {
  from: ISODate;
  to: ISODate;
  /** File owner filter (My sales always passes the signed-in agent). */
  agentId?: ID;
  /** Currency every cross-currency total is shown in (converted at the current rate). */
  displayCurrency: Currency;
  now: Date;
}

export interface SummaryItem {
  label: string;
  /** Money renders with <Amount>, numbers as counts, strings as they are (e.g. "12.4 %"). */
  value: Money | number | string;
  /** Relative change vs the previous period of the same length (0.12 = +12 %). */
  trend?: number;
  /** When true, a fall is good news (e.g. expenses, overdue). */
  invertTrend?: boolean;
  hint?: string;
}

export interface ChartSeries {
  key: string;
  label: string;
  /** Index into var(--chart-1..5): 1 = brand (primary series), 2 = ink (second series). */
  color: 1 | 2 | 3 | 4 | 5;
  /** Per-series mark when the chart mixes bars and a line. */
  mark?: "bar" | "line";
}

export interface ChartSpec {
  kind: "bar" | "line" | "composed";
  title: string;
  xKey: string;
  /** How to label the x values: ISO dates, "YYYY-MM" months, or plain text. */
  xFormat: "date" | "month" | "text";
  /** Values are major units in `unit` (or plain counts). */
  data: Record<string, string | number>[];
  series: ChartSeries[];
  unit: Currency | "count";
  stacked?: boolean;
  /** Horizontal bars (categories on the y axis). */
  horizontal?: boolean;
}

export interface ReportResult<Row, Totals = undefined> {
  summary: SummaryItem[];
  charts: ChartSpec[];
  rows: Row[];
  totals?: Totals;
  /** Currency of converted totals. */
  currency: Currency;
  /** TZS per USD used for conversions. */
  fxRate: number;
  /** True when the source amounts were in more than one currency (show "Converted at 1 USD = TZS x"). */
  converted: boolean;
  notes?: string[];
}

/** One slice of a breakdown table (by agent, type, client, airline, method…). */
export interface Breakdown {
  key: string;
  label: string;
  count: number;
  sell: Money;
  margin: Money;
  /** Share of the total sell (0..1). */
  share: number;
}
