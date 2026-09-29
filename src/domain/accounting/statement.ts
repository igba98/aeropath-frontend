import type { AccountCode, Currency, ID, ISODate } from "../types";
import type { CurrencyView } from "./books";

/**
 * A financial statement as rows the screen, the printout and the CSV all read. Figures are minor units of the
 * statement currency, signed as presented: a negative prints in parentheses.
 */

export type RowStyle = "heading" | "line" | "subtotal" | "total" | "grand" | "check";

/** Where a statement line drills to. */
export type Drill = { kind: "ledger"; account: AccountCode; from?: ISODate; to: ISODate; subId?: ID } | { kind: "pnl"; from: ISODate; to: ISODate };

export interface StatementRow {
  key: string;
  label: string;
  style: RowStyle;
  /** One figure per column; undefined on headings. */
  values?: number[];
  code?: AccountCode;
  drill?: Drill;
  /** 0 section heading level, 1 a line under it, 2 a detail under a line. */
  indent?: 0 | 1 | 2;
  /** Quiet text after the label (e.g. "18% of taxable value"). */
  hint?: string;
  /** Column indexes left empty (no figure, no rule), e.g. the value column of a tax-only line. */
  blank?: number[];
}

export interface StatementColumn {
  key: string;
  /** "30 Sep 2026" or "Sep 2026" — the UI formats; the domain gives the dates. */
  from?: ISODate;
  to: ISODate;
}

export interface Statement {
  rows: StatementRow[];
  columns: StatementColumn[];
  view: CurrencyView;
  currency: Currency;
  /** TZS per USD used for conversions. */
  rate: number;
  /** True when USD amounts were converted into TZS. */
  converted: boolean;
  notes: string[];
}

/** CSV rows for a statement: code, label, then one number (major units) per column. */
export function statementCsvRows(s: Pick<Statement, "rows">): (string | number)[][] {
  return s.rows.map((r) => [r.code ?? "", `${"  ".repeat(r.indent ?? 0)}${r.label}`, ...(r.values ?? []).map((v, i) => (r.blank?.includes(i) ? "" : v / 100))]);
}

export const anyNonZero = (values: number[] | undefined): boolean => !!values && values.some((v) => v !== 0);
