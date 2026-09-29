import * as React from "react";
import type { Money, Settings } from "@/domain/types";
import { cn } from "@/lib/utils";
import { BrandWordmark } from "@/components/layout/brand";
import { Amount } from "@/components/shared/amount";

/** Seeded company placeholders are printed as such, never as real registration numbers. */
const isPlaceholderId = (v?: string) => !v || /^0{3}-?0{3}-?0{3}$/.test(v.trim());
const DEMO_PHONE = "+255754000000";

/** The agency phone, marked while it is still the seeded demo number. */
export const companyPhone = (phone: string) => (phone === DEMO_PHONE ? `${phone} (demo)` : phone);

/**
 * Building blocks for the printed documents (spec §9.12): letterhead, party block, timetable grid with a heavy rule
 * under the heads (a border, not a shadow, so it survives print), totals, watermark.
 */

export function Letterhead({ company, docTitle, number, meta }: { company: Settings["company"]; docTitle: string; number?: string; meta: { label: string; value: React.ReactNode }[] }) {
  return (
    <header className="flex flex-col gap-5 border-b-[1.5px] border-rule-strong pb-5 sm:flex-row sm:items-start sm:justify-between print:flex-row print:items-start print:justify-between">
      <div className="min-w-0 space-y-2">
        {company.logoDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- data URL from settings, not a remote asset
          <img src={company.logoDataUrl} alt={company.name} className="h-11 w-auto max-w-[200px] object-contain object-left" />
        ) : (
          <BrandWordmark sub={false} />
        )}
        <div className="text-[11.5px] leading-[1.5] text-ink-2">
          <p className="text-[12.5px] font-semibold text-ink">{company.name}</p>
          <p className="whitespace-pre-line">{company.address}</p>
          <p className="tnum">
            {companyPhone(company.phone)} · {company.email}
          </p>
          <p className="tnum">
            {isPlaceholderId(company.tin) ? "TIN not set (demo placeholder)" : <>TIN <span className="font-mono">{company.tin}</span></>}
            {company.vrn && (
              <>
                {" "}
                · {isPlaceholderId(company.vrn) ? "VRN not set (demo placeholder)" : <>VRN <span className="font-mono">{company.vrn}</span></>}
              </>
            )}
          </p>
        </div>
      </div>
      <div className="shrink-0 sm:text-right print:text-right">
        <h1 className="text-[22px] leading-7 font-semibold tracking-[0.02em] text-ink uppercase">{docTitle}</h1>
        {number && <p className="mt-0.5 font-mono text-[13px] font-semibold text-ink">{number}</p>}
        <dl className="mt-2 space-y-0.5 text-[11.5px]">
          {meta.map((m) => (
            <div key={m.label} className="flex gap-3 sm:justify-end print:justify-end">
              <dt className="text-ink-3">{m.label}</dt>
              <dd className="tnum font-medium text-ink">{m.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </header>
  );
}

/** "Bill to" / "Received from" block. */
export function Party({ label, name, lines, className }: { label: string; name: string; lines: (string | undefined | false)[]; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="col-head mb-1">{label}</p>
      <p className="text-[13.5px] font-semibold text-ink">{name}</p>
      {lines.filter(Boolean).map((l, i) => (
        <p key={i} className="text-[12px] text-ink-2">
          {l}
        </p>
      ))}
    </div>
  );
}

/** Column head cell for print grids. */
export function Th({ children, right, className }: { children?: React.ReactNode; right?: boolean; className?: string }) {
  return <th className={cn("col-head border-b-[1.5px] border-rule-strong px-2 pb-1.5 align-bottom first:pl-0 last:pr-0", right ? "text-right" : "text-left", className)}>{children}</th>;
}

export function Td({ children, right, className, colSpan }: { children?: React.ReactNode; right?: boolean; className?: string; colSpan?: number }) {
  return (
    <td colSpan={colSpan} className={cn("px-2 py-2 align-top first:pl-0 last:pr-0", right && "tnum text-right", className)}>
      {children}
    </td>
  );
}

/** Body row with a hairline above (none on the first row). */
export function Tr({ children, className }: { children: React.ReactNode; className?: string }) {
  return <tr className={cn("break-inside-avoid border-t border-rule first:border-t-0", className)}>{children}</tr>;
}

export function Grid({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="w-full overflow-x-auto print:overflow-visible">
      <table className={cn("w-full min-w-[520px] border-collapse text-[12.5px] print:min-w-0", className)}>{children}</table>
    </div>
  );
}

/** Totals column: label/amount rows, right-aligned; `strong` rows sit on a double rule. */
export function Totals({ rows, className }: { rows: { label: React.ReactNode; value: Money; strong?: boolean; rule?: boolean; muted?: boolean }[]; className?: string }) {
  return (
    <dl className={cn("ml-auto w-full max-w-[320px] text-[12.5px]", className)}>
      {rows.map((r, i) => (
        <div
          key={i}
          className={cn(
            "flex items-baseline justify-between gap-4 py-1",
            r.rule && "mt-1 border-t border-rule pt-1.5",
            r.strong && "mt-1 border-t-[1.5px] border-rule-strong pt-1.5 text-[14px] font-semibold",
            r.muted && "text-ink-3",
          )}
        >
          <dt className={cn(r.strong ? "text-ink" : "text-ink-2", r.muted && "text-ink-3")}>{r.label}</dt>
          <dd>
            <Amount value={r.value} className={cn(r.strong && "font-semibold text-ink")} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** A small section heading on a hairline, for itinerary blocks and notes. */
export function DocSection({ title, children, className }: { title: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("mt-6 break-inside-avoid-page", className)}>
      <h2 className="mb-2 text-[13px] font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}

/** Superseded / void / reversed: a faint diagonal word across the sheet plus a plain line under the heading. */
export function Watermark({ word, note }: { word: string; note?: React.ReactNode }) {
  return (
    <>
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden print:fixed">
        <span className="-rotate-[28deg] text-[88px] font-bold tracking-[0.18em] whitespace-nowrap text-ink uppercase opacity-[0.07]">{word}</span>
      </div>
      <p className="mt-4 border border-rule-strong px-3 py-2 text-[12.5px] font-semibold text-ink uppercase">
        {word}
        {note && <span className="ml-2 font-normal normal-case text-ink-2">{note}</span>}
      </p>
    </>
  );
}

/** Footer line: the agency's contact, always on the page. */
export function DocFooter({ company, children }: { company: Settings["company"]; children?: React.ReactNode }) {
  return (
    <footer className="mt-8 border-t border-rule pt-3 text-[11px] leading-[1.5] text-ink-3">
      {children}
      <p>
        {company.name} · {companyPhone(company.phone)} · {company.email}
      </p>
    </footer>
  );
}
