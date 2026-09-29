"use client";

import * as React from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, CircleAlert, Download, Printer } from "lucide-react";

import type { Currency, DbState, ISODate } from "@/domain/types";
import { roleLabel } from "@/domain/permissions";
import {
  ACCT_PRESETS,
  AS_AT_COMPARES,
  CURRENCY_VIEWS,
  acctPeriod,
  compareDate,
  isAcctPreset,
  isAsAtCompare,
  isCurrencyView,
  type AcctPreset,
  type AsAtCompare,
  type CurrencyView,
  type Drill,
  type EntrySource,
  type Period,
  type StatementRow,
} from "@/domain/accounting";
import { useApp, useMe } from "@/store";
import { useNow } from "@/lib/use-now";
import { darToday, fmtDate, fmtDateTime, fmtRange } from "@/lib/dates";
import { downloadCsv, type CsvCell } from "@/lib/csv";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Amount } from "@/components/shared/amount";
import { FilterSelect } from "@/components/shared/filter-select";
import { FxNote } from "@/components/shared/fx-note";
import { PageHeader, QuickTabs, Segmented } from "@/components/shared/page";
import { StatusChip } from "@/components/shared/status-chip";
import { useSetParams } from "@/components/reports/use-report-params";

// ───────────────────────────── Figures ─────────────────────────────

/**
 * A statement figure: tabular, no currency code (the column carries it), negatives in parentheses with the closing
 * bracket hanging so positive and negative figures line up; nil shows as a dash.
 */
export function Fig({ minor, currency, className }: { minor: number | undefined; currency: Currency; className?: string }) {
  if (minor === undefined) return null;
  if (minor === 0)
    return (
      <span className={cn("tnum text-ink-4", className)}>
        –
        <span aria-hidden className="invisible">
          )
        </span>
      </span>
    );
  const neg = minor < 0;
  return (
    <span className={cn("tnum inline-flex items-baseline whitespace-nowrap", className)}>
      {neg && <span aria-hidden>(</span>}
      {neg && <span className="sr-only">minus </span>}
      <Amount value={{ amountMinor: Math.abs(minor), currency }} hideCode className="text-current" />
      <span aria-hidden className={neg ? undefined : "invisible"}>
        )
      </span>
    </span>
  );
}

/** CSV value of a statement figure: major units, negative with a minus. */
export const csvFig = (minor: number | undefined): number | "" => (minor === undefined ? "" : minor / 100);

// ───────────────────────────── Links ─────────────────────────────

export function ledgerHref(p: { account: string; subId?: string; from?: ISODate; to?: ISODate; view?: CurrencyView }): string {
  const q = new URLSearchParams({ account: p.account });
  if (p.subId) q.set("sub", p.subId);
  if (p.from && p.to) {
    q.set("period", "custom");
    q.set("from", p.from);
    q.set("to", p.to);
  }
  if (p.view && p.view !== "base") q.set("view", p.view);
  return `/accounting/ledger?${q.toString()}`;
}

export function drillHref(d: Drill | undefined, view: CurrencyView): string | undefined {
  if (!d) return undefined;
  if (d.kind === "pnl") return `/accounting/profit-and-loss?period=custom&from=${d.from}&to=${d.to}${view !== "base" ? `&view=${view}` : ""}`;
  return ledgerHref({ account: d.account, subId: d.subId, from: d.from ?? `${d.to.slice(0, 4)}-01-01`, to: d.to, view });
}

/** Where a ledger entry's source document lives. */
export function sourceHref(src: EntrySource): string | undefined {
  switch (src.entity) {
    case "line":
    case "refund":
      return src.fileId ? `/bookings/${src.fileId}` : undefined;
    case "payment":
      return src.id ? `/payments?open=${src.id}` : undefined;
    case "supplier_payment":
      return src.supplierId ? `/money-out/suppliers/${src.supplierId}` : undefined;
    case "expense":
      return "/accounting/expenses";
    case "journal":
      return src.id ? `/accounting/journals?open=${src.id}` : undefined;
    default:
      return undefined;
  }
}

/** The source of an entry as a small link: "Receipt RCT-2026-00045". */
export function SourceLink({ src, className }: { src: EntrySource; className?: string }) {
  const href = sourceHref(src);
  const body = (
    <>
      <span className="text-ink-3">{src.label}</span>
      {src.number && <span className="font-mono text-[12.5px] whitespace-nowrap text-ink">{src.number}</span>}
    </>
  );
  if (!href) return <span className={cn("inline-flex flex-wrap items-baseline gap-x-1.5 text-[13px]", className)}>{body}</span>;
  return (
    <Link href={href} className={cn("inline-flex flex-wrap items-baseline gap-x-1.5 text-[13px] hover:underline", className)} data-no-row>
      {body}
    </Link>
  );
}

// ───────────────────────────── URL state ─────────────────────────────

export type PeriodChoice = AcctPreset | "custom";

const isDate = (s: string | null): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);

export interface AcctParams {
  today: ISODate;
  now: Date;
  choice: PeriodChoice;
  period: Period;
  asAt: ISODate;
  view: CurrencyView;
  /** Comparative for period statements: the previous period, or none. */
  cmpPrev: boolean;
  /** Comparative for "as at" statements. */
  asAtCompare: AsAtCompare;
  compareAt?: ISODate;
  set: (patch: Record<string, string | null>) => void;
  sp: URLSearchParams;
}

/** Period, as-at date, comparative and currency view, all kept in the URL so a statement can be shared or refreshed. */
export function useAcctParams(defaults: { period?: AcctPreset; asAtCompare?: AsAtCompare } = {}): AcctParams {
  const sp = useSearchParams();
  const set = useSetParams();
  const now = useNow();
  const today = darToday(now);
  const raw = sp.get("period");
  const choice: PeriodChoice = raw === "custom" || isAcctPreset(raw) ? raw : (defaults.period ?? "month");
  const fromP = sp.get("from");
  const toP = sp.get("to");
  const period = React.useMemo<Period>(() => {
    const at = new Date(`${today}T09:00:00Z`);
    const base = acctPeriod(choice === "custom" ? (defaults.period ?? "month") : choice, at);
    if (choice !== "custom") return base;
    const from = isDate(fromP) ? fromP : base.from;
    const to = isDate(toP) ? toP : base.to;
    return from <= to ? { from, to } : { from: to, to: from };
  }, [today, choice, fromP, toP, defaults.period]);
  const asAtP = sp.get("asAt");
  const asAt = isDate(asAtP) ? asAtP : today;
  const v = sp.get("view");
  const view: CurrencyView = isCurrencyView(v) ? v : "base";
  const cmpP = sp.get("cmp");
  const asAtCompare: AsAtCompare = isAsAtCompare(cmpP) ? cmpP : (defaults.asAtCompare ?? "prior_month_end");
  return {
    today,
    now,
    choice,
    period,
    asAt,
    view,
    cmpPrev: cmpP !== "none",
    asAtCompare,
    compareAt: compareDate(asAt, asAtCompare),
    set,
    sp: new URLSearchParams(sp.toString()),
  };
}

// ───────────────────────────── Controls ─────────────────────────────

/** Preset periods (month, quarter, year…) or a custom range. */
export function PeriodPicker({ p, presets = ACCT_PRESETS.map((x) => x.value) }: { p: AcctParams; presets?: AcctPreset[] }) {
  const options = [...ACCT_PRESETS.filter((x) => presets.includes(x.value)), { value: "custom" as const, label: "Custom" }];
  return (
    <>
      <QuickTabs<PeriodChoice>
        controls="statement-body"
        value={p.choice}
        onChange={(v) => p.set(v === "custom" ? { period: v, from: p.period.from, to: p.period.to } : { period: v, from: null, to: null })}
        options={options}
      />
      {p.choice === "custom" && (
        <div className="flex items-center gap-1.5">
          <Input type="date" aria-label="From" value={p.period.from} max={p.period.to} onChange={(e) => e.target.value && p.set({ from: e.target.value })} className="h-9 w-[150px]" />
          <span className="text-ink-4" aria-hidden>
            –
          </span>
          <Input type="date" aria-label="To" value={p.period.to} min={p.period.from} onChange={(e) => e.target.value && p.set({ to: e.target.value })} className="h-9 w-[150px]" />
        </div>
      )}
    </>
  );
}

/** A full-width select at form-control height (36px), for forms rather than toolbars. */
export function FormSelect({
  id,
  label,
  value,
  onChange,
  options,
  placeholder,
  invalid,
}: {
  id?: string;
  label: string;
  value: string | undefined;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  invalid?: boolean;
}) {
  return (
    <Select value={value ?? ""} onValueChange={onChange}>
      <SelectTrigger id={id} aria-label={label} aria-invalid={invalid || undefined} className="w-full">
        <SelectValue placeholder={placeholder ?? "Choose…"} />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** "As at" date with the comparative date choice. */
export function AsAtPicker({ p, compare = true }: { p: AcctParams; compare?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-2">
        <Label htmlFor="acct-asat" className="text-[13px] text-ink-3">
          As at
        </Label>
        <Input id="acct-asat" type="date" value={p.asAt} onChange={(e) => e.target.value && p.set({ asAt: e.target.value === p.today ? null : e.target.value })} className="h-9 w-[160px]" />
      </div>
      {compare && (
        <FilterSelect label="Compare with" value={p.asAtCompare} unset="__never" onChange={(v) => p.set({ cmp: v })} options={AS_AT_COMPARES.map((c) => ({ value: c.value, label: c.label }))} />
      )}
    </div>
  );
}

/** "All in TZS | TZS books | USD books". */
export function ViewSwitch({ p }: { p: AcctParams }) {
  return (
    <Segmented<CurrencyView>
      label="Currency"
      value={p.view}
      onChange={(v) => p.set({ view: v === "base" ? null : v })}
      options={CURRENCY_VIEWS.map((o) => ({ value: o.value, label: o.label, title: o.title }))}
    />
  );
}

export const viewNote = (view: CurrencyView): string =>
  view === "USD" ? "Presented in US dollars (USD): USD transactions only" : view === "TZS" ? "Presented in Tanzanian shillings (TZS): TZS transactions only" : "Presented in Tanzanian shillings (TZS)";

// ───────────────────────────── Print ─────────────────────────────

const PrintingContext = React.createContext(false);
/** True while printing: lists show every row instead of pages of 25. */
export const useAcctPageSize = () => (React.useContext(PrintingContext) ? 100_000 : 25);
export const PrintingProvider = PrintingContext.Provider;

/** Printing state for a page that prints (every row) and the print action. */
export function usePrinting(): [boolean, () => void] {
  const [printing, setPrinting] = React.useState(false);
  React.useEffect(() => {
    const before = () => flushSync(() => setPrinting(true));
    const after = () => setPrinting(false);
    window.addEventListener("beforeprint", before);
    window.addEventListener("afterprint", after);
    return () => {
      window.removeEventListener("beforeprint", before);
      window.removeEventListener("afterprint", after);
    };
  }, []);
  const print = () => {
    flushSync(() => setPrinting(true));
    window.print();
  };
  return [printing, print];
}

/** Company letterhead above a statement: name, TIN and VRN, the title, the period and the presentation currency. */
export function Letterhead({ title, periodText, view, converted, rate }: { title: string; periodText: string; view: CurrencyView; converted?: boolean; rate?: number }) {
  const company = useApp((s) => (s.db as DbState).settings.company);
  const me = useMe();
  const now = useNow();
  return (
    <div className="border-b border-rule px-5 py-5 text-center print:px-0">
      <p className="text-[15px] leading-6 font-bold text-ink">{company.name}</p>
      <p className="tnum text-[13px] text-ink-3">
        TIN {company.tin}
        {company.vrn ? ` · VRN ${company.vrn}` : ""}
        <span className="max-sm:hidden"> · {company.address}</span>
      </p>
      <h2 className="mt-3 text-[17px] leading-6 font-semibold text-ink">{title}</h2>
      <p className="tnum text-sm text-ink-2">{periodText}</p>
      <p className="mt-1 text-[13px] text-ink-3">
        {viewNote(view)}
        {converted && (
          <>
            {" · "}
            <FxNote rate={rate} />
          </>
        )}
      </p>
      <p className="mt-1 text-xs text-ink-4">
        Prepared by {me.name} ({roleLabel(me.role)}) · {fmtDateTime(now)}
      </p>
    </div>
  );
}

/** Print-only sign-off lines under a statement. */
function SignOff() {
  return (
    <div className="hidden grid-cols-3 gap-8 px-0 pt-10 text-xs text-ink-3 print:grid">
      {["Prepared by", "Reviewed by", "Approved by (Director)"].map((l) => (
        <div key={l}>
          <div className="h-8 border-b border-ink-3" />
          <p className="mt-1">{l}</p>
          <p className="mt-3">Date: ____________</p>
        </div>
      ))}
    </div>
  );
}

/**
 * The frame of every statement: page header with Print and Export CSV, the controls, then a card with the letterhead,
 * the statement (scrolling sideways inside the card on small screens, never the page) and its notes.
 */
export function StatementFrame({
  pageTitle,
  title,
  periodText,
  meta,
  controls,
  view,
  converted,
  rate,
  csv,
  status,
  notes,
  children,
  after,
}: {
  pageTitle: string;
  /** Statement title on the letterhead (e.g. "Statement of financial position"). */
  title: string;
  periodText: string;
  meta?: React.ReactNode;
  controls?: React.ReactNode;
  view: CurrencyView;
  converted?: boolean;
  rate?: number;
  csv?: { name: string; headers: string[]; rows: () => CsvCell[][] };
  /** A chip beside the controls, e.g. "Balanced". */
  status?: React.ReactNode;
  notes?: React.ReactNode[];
  children: React.ReactNode;
  /** Content under the statement card (e.g. a detail list). */
  after?: React.ReactNode;
}) {
  const [printing, print] = usePrinting();
  return (
    <PrintingContext.Provider value={printing}>
      <div data-print-report className="space-y-6">
        <div className="no-print">
          <PageHeader
            title={pageTitle}
            meta={
              <>
                <span className="tnum">{periodText}</span>
                <span aria-hidden>·</span>
                <span>{view === "USD" ? "USD books" : view === "TZS" ? "TZS books" : "In TZS"}</span>
                {converted && (
                  <>
                    <span aria-hidden>·</span>
                    <FxNote rate={rate} />
                  </>
                )}
                {meta}
              </>
            }
            actions={
              <>
                {csv && (
                  <Button variant="outline" size="sm" onClick={() => downloadCsv(`${csv.name}-${new Date().toISOString().slice(0, 10)}`, csv.headers, csv.rows())}>
                    <Download /> Export CSV
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={print}>
                  <Printer /> Print
                </Button>
              </>
            }
          />
        </div>
        {(controls || status) && (
          <div className="no-print -mt-2 flex flex-wrap items-center gap-2">
            {controls}
            {status && <div className="sm:ml-auto">{status}</div>}
          </div>
        )}
        <Card id="statement-body" className="block min-w-0 gap-0 overflow-hidden p-0 print:overflow-visible print:rounded-none print:border-0 print:bg-transparent print:shadow-none">
          <Letterhead title={title} periodText={periodText} view={view} converted={converted} rate={rate} />
          <div className="relative overflow-x-auto">{children}</div>
          {notes && notes.length > 0 && (
            <div className="space-y-1.5 border-t border-rule px-5 py-4 text-[13px] leading-5 text-ink-3 print:px-0">
              {notes.map((n, i) => (
                <p key={i}>{n}</p>
              ))}
            </div>
          )}
          <SignOff />
        </Card>
        {after}
      </div>
    </PrintingContext.Provider>
  );
}

/** "Balanced" / "Out by x" chip. */
export function BalanceChip({ ok, diff, currency, okLabel = "Balanced" }: { ok: boolean; diff?: number; currency?: Currency; okLabel?: string }) {
  return ok ? (
    <StatusChip tone="green" label={okLabel} />
  ) : (
    <StatusChip tone="red" label={diff !== undefined && currency ? `Out by ${currency} ${(Math.abs(diff) / 100).toLocaleString("en-US")}` : "Out of balance"} />
  );
}

// ───────────────────────────── Statement table ─────────────────────────────

export interface StatementCol {
  key: string;
  label: React.ReactNode;
  /** Quiet second line under the label (currency code, "comparative"). */
  sub?: React.ReactNode;
}

const INDENT = ["pl-5", "pl-9", "pl-13"] as const;

/**
 * A statement table: headings, lines (linking to the general ledger), subtotals with a single rule, totals, and the
 * grand totals ruled off with a double line, as on audited accounts.
 */
export function StatementTable({
  rows,
  columns,
  currency,
  view,
  showCodes,
  firstHeader = "",
  minWidth = "min-w-[520px]",
  compareFrom,
}: {
  rows: StatementRow[];
  columns: StatementCol[];
  currency: Currency;
  view: CurrencyView;
  showCodes?: boolean;
  firstHeader?: string;
  minWidth?: string;
  /** Index of the first comparative column (set in a quieter ink). */
  compareFrom?: number;
}) {
  return (
    // `relative` keeps screen-reader-only text inside the scroll box (an absolute child would widen the page).
    <table className={cn("relative w-full border-collapse text-sm", minWidth)}>
      <thead>
        <tr className="border-b border-rule bg-table-head">
          {showCodes && (
            <th scope="col" className="col-head h-11 w-[84px] pl-5 text-left">
              Code
            </th>
          )}
          <th scope="col" className={cn("col-head h-11 text-left", showCodes ? "pl-3" : "pl-5")}>
            {firstHeader}
          </th>
          {columns.map((c, i) => (
            <th key={c.key} scope="col" className={cn("col-head h-11 w-[150px] px-3 text-right align-bottom leading-tight sm:w-[170px]", i === columns.length - 1 && "pr-5")}>
              <span className="block py-2">
                <span className="block whitespace-nowrap text-ink-2">{c.label}</span>
                {c.sub && <span className="block text-xs font-medium text-ink-4">{c.sub}</span>}
              </span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <StatementTr key={r.key} r={r} columns={columns} currency={currency} view={view} showCodes={showCodes} compareFrom={compareFrom} />
        ))}
      </tbody>
    </table>
  );
}

function StatementTr({
  r,
  columns,
  currency,
  view,
  showCodes,
  compareFrom,
}: {
  r: StatementRow;
  columns: StatementCol[];
  currency: Currency;
  view: CurrencyView;
  showCodes?: boolean;
  compareFrom?: number;
}) {
  const muted = (i: number) => compareFrom !== undefined && i >= compareFrom;
  const href = drillHref(r.drill, view);
  const indent = INDENT[r.indent ?? 0];
  const labelPad = showCodes ? "pl-3" : indent;
  if (r.style === "heading")
    return (
      <tr>
        {showCodes && <td />}
        <td colSpan={columns.length + 1} className={cn(labelPad, "pt-5 pb-1.5 pr-5 print:pt-3", r.indent ? "text-sm font-semibold text-ink-2" : "text-[15px] font-semibold text-ink")}>
          {r.label}
        </td>
      </tr>
    );
  if (r.style === "check") {
    const ok = (r.values ?? []).every((v) => v === 0);
    return (
      <tr className="no-print">
        {showCodes && <td />}
        <td className={cn(labelPad, "py-3 pr-3 text-[13px] text-ink-3")}>
          <span className="inline-flex items-center gap-1.5">
            {ok ? <CheckCircle2 className="size-4 text-[var(--st-green-fg)]" aria-hidden /> : <CircleAlert className="size-4 text-[var(--st-red-fg)]" aria-hidden />}
            {r.label}
          </span>
        </td>
        {columns.map((c, i) => (
          <td key={c.key} className={cn("px-3 py-3 text-right text-[13px]", i === columns.length - 1 && "pr-5", ok ? "text-ink-3" : "font-semibold text-[var(--st-red-fg)]")}>
            <Fig minor={r.values?.[i]} currency={currency} />
          </td>
        ))}
      </tr>
    );
  }
  const strong = r.style !== "line";
  const figRule =
    r.style === "subtotal"
      ? "border-t border-rule-strong"
      : r.style === "total"
        ? "border-t border-ink-3"
        : r.style === "grand"
          ? "border-t border-ink-2 border-b-[3px] border-b-ink-2 border-double"
          : "";
  const label = href ? (
    <Link href={href} className="decoration-ink-4 underline-offset-4 hover:text-link hover:underline">
      {r.label}
    </Link>
  ) : (
    r.label
  );
  return (
    <tr className={cn(r.style === "line" && href && "hover:bg-band-hover")}>
      {showCodes && <td className="h-10 pl-5 align-middle font-mono text-[13px] whitespace-nowrap text-ink-3">{r.code ?? ""}</td>}
      <td className={cn(labelPad, "h-10 py-2 pr-3 align-middle print:h-7 print:py-0.5", strong ? "font-semibold text-ink" : "text-ink-2", r.style === "grand" && "font-bold")}>
        {label}
        {r.hint && <span className="ml-2 text-[13px] font-normal text-ink-4 max-md:hidden print:hidden">{r.hint}</span>}
        {!showCodes && r.code && r.style === "line" && <span className="ml-2 font-mono text-xs text-ink-4 no-print max-sm:hidden">{r.code}</span>}
      </td>
      {columns.map((c, i) => (
        <td
          key={c.key}
          className={cn(
            "h-10 px-3 py-2 text-right align-middle print:h-7 print:py-0.5",
            i === columns.length - 1 && "pr-5",
            muted(i) ? "text-ink-3" : "text-ink",
            strong && "font-semibold",
            r.style === "grand" && "font-bold",
          )}
        >
          <span className={cn("inline-block min-w-[110px] pt-1 pb-0.5", !r.blank?.includes(i) && figRule, r.blank?.includes(i) && "invisible")}>
            <Fig minor={r.values?.[i]} currency={currency} />
          </span>
        </td>
      ))}
    </tr>
  );
}

/** Column label for a period: "Sep 2026", "Jul – Sep 2026", "Year 2026" or the date range. */
export function periodLabel(p: Period): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const [fy, fm, fd] = p.from.split("-").map(Number);
  const [ty, tm, td] = p.to.split("-").map(Number);
  const lastDay = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
  if (fd === 1 && td === lastDay) {
    if (fy === ty && fm === 1 && tm === 12) return `Year ${fy}`;
    if (fy === ty && fm === tm) return `${months[fm - 1]} ${fy}`;
    if (fy === ty) return `${months[fm - 1]} – ${months[tm - 1]} ${fy}`;
  }
  return fmtRange(p.from, p.to);
}

/**
 * "For the month ended 30 September 2026", "For the period 1 Jul – 30 Sep 2026". A period that has not finished yet
 * reads "ending" instead of "ended".
 */
export function periodSentence(p: Period, today?: ISODate): string {
  const [fy, fm, fd] = p.from.split("-").map(Number);
  const [ty, tm, td] = p.to.split("-").map(Number);
  const lastDay = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
  const end = longDate(p.to);
  const verb = today && p.to > today ? "ending" : "ended";
  if (fd === 1 && td === lastDay) {
    const n = (ty - fy) * 12 + (tm - fm) + 1;
    if (n === 1) return `For the month ${verb} ${end}`;
    if (n === 3) return `For the quarter ${verb} ${end}`;
    if (n === 12) return `For the year ${verb} ${end}`;
  }
  return `For the period ${fmtDate(p.from)} to ${fmtDate(p.to)}`;
}

export function longDate(d: ISODate): string {
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${Number(d.slice(8, 10))} ${months[Number(d.slice(5, 7)) - 1]} ${d.slice(0, 4)}`;
}
