"use client";

import * as React from "react";
import Link from "next/link";
import { Download, Printer } from "lucide-react";

import type { Client, Currency, Money } from "@/domain/types";
import { useApp } from "@/store";
import { fmtDate } from "@/lib/dates";
import { downloadCsv } from "@/lib/csv";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Section, Segmented } from "@/components/shared/page";
import { Amount } from "@/components/shared/amount";
import { Banner } from "@/components/shared/field";
import { DateRangeFilter } from "@/components/payments/date-range";
import { clientStatement, type StatementRow } from "./statement";

const csvMoney = (m?: Money) => (m ? (m.amountMinor / 100).toFixed(2) : "");

/** Statement: invoices and payments in time order with a running balance, a date range and "Print statement". */
export function ClientStatement({ client }: { client: Client }) {
  const db = useApp((s) => s.db)!;
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [currency, setCurrency] = React.useState<Currency | "">("");
  const st = React.useMemo(() => clientStatement(db, client.id, { from, to, currency }), [db, client.id, from, to, currency]);
  if (!st) return null;

  const qs = new URLSearchParams();
  if (from) qs.set("from", from);
  if (to) qs.set("to", to);
  if (st.currencies.length > 1) qs.set("currency", st.currency);
  const printHref = `/print/statement/${client.id}${qs.toString() ? `?${qs}` : ""}`;

  const exportCsv = () =>
    downloadCsv(
      `statement-${client.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${st.currency}`,
      ["Date", "Reference", "Description", "Debit", "Credit", "Balance", "Note"],
      [
        [from || "", "", "Opening balance", "", "", csvMoney(st.opening), ""],
        ...st.rows.map((r) => [r.date, r.number, r.description, r.struck ? "" : csvMoney(r.debit), r.struck ? "" : csvMoney(r.credit), csvMoney(r.balance), r.note ?? ""]),
        [to || "", "", "Closing balance", csvMoney(st.totalDebit), csvMoney(st.totalCredit), csvMoney(st.closing), ""],
      ],
    );

  return (
    <Section
      title="Statement"
      description={`Invoices issued and payments, in ${st.currency}.`}
      actions={
        <>
          {st.currencies.length > 1 && <Segmented label="Statement currency" value={st.currency} onChange={(c) => setCurrency(c)} options={st.currencies.map((c) => ({ value: c, label: c }))} />}
          <DateRangeFilter from={from} to={to} onChange={(f, t) => (setFrom(f), setTo(t))} label="All dates" idPrefix="st" />
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download /> CSV
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={printHref} target="_blank">
              <Printer /> Print statement
            </Link>
          </Button>
        </>
      }
    >
      <StatementTable rows={st.rows} opening={st.opening} closing={st.closing} totalDebit={st.totalDebit} totalCredit={st.totalCredit} from={from} to={to} />
      {st.unbilled.amountMinor !== 0 && (
        <Banner tone="info" className="mt-3">
          The bookings’ live balance is <Amount value={st.liveBalance} className="font-semibold" />. <Amount value={st.unbilled} /> of it is not on a current invoice yet (an invoice is missing or outdated); issue or re-issue invoices to bring the statement up to date.
        </Banner>
      )}
    </Section>
  );
}

/** Statement grid, shared with the printed statement. Struck rows (replaced invoices, reversed payments) do not count. */
export function StatementTable({
  rows,
  opening,
  closing,
  totalDebit,
  totalCredit,
  from,
  to,
  links = true,
}: {
  rows: StatementRow[];
  opening: Money;
  closing: Money;
  totalDebit: Money;
  totalCredit: Money;
  from?: string;
  to?: string;
  links?: boolean;
}) {
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="rule-head">
            <th className="col-head h-8 pr-3 pb-2 text-left align-bottom">Date</th>
            <th className="col-head h-8 px-3 pb-2 text-left align-bottom">Reference</th>
            <th className="col-head h-8 px-3 pb-2 text-left align-bottom">Description</th>
            <th className="col-head h-8 px-3 pb-2 text-right align-bottom">Charges</th>
            <th className="col-head h-8 px-3 pb-2 text-right align-bottom">Payments</th>
            <th className="col-head h-8 pb-2 pl-3 text-right align-bottom">Balance</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-rule">
            <td className="tnum py-2 pr-3 text-ink-3">{from ? fmtDate(from) : ""}</td>
            <td className="px-3" />
            <td className="px-3 py-2 font-medium text-ink">Opening balance</td>
            <td className="px-3" />
            <td className="px-3" />
            <td className="py-2 pl-3 text-right">
              <Amount value={opening} tone="balance" className="font-medium" />
            </td>
          </tr>
          {rows.map((r) => (
            <tr key={r.id} className={cn("border-t border-rule first:border-t-0", r.struck && "text-ink-4")}>
              <td className="tnum py-2 pr-3 whitespace-nowrap text-ink-2">{fmtDate(r.date)}</td>
              <td className="px-3 py-2 whitespace-nowrap">
                {links ? (
                  <Link href={r.href} target={r.kind === "invoice" ? "_blank" : undefined} className={cn("font-mono whitespace-nowrap text-[13.5px] hover:underline", r.struck ? "text-ink-4 line-through" : "text-ink")}>
                    {r.number}
                  </Link>
                ) : (
                  <span className={cn("font-mono whitespace-nowrap text-[13px]", r.struck && "line-through")}>{r.number}</span>
                )}
              </td>
              <td className="px-3 py-2">
                <span className={cn("block", r.struck ? "text-ink-4 line-through" : "text-ink-2")}>{r.description}</span>
                {r.note && <span className="block text-xs text-ink-3">{r.note}</span>}
              </td>
              <td className="px-3 py-2 text-right">{r.debit && <Amount value={r.debit} className={cn(r.struck && "line-through")} />}</td>
              <td className="px-3 py-2 text-right">{r.credit && <Amount value={r.credit} className={cn(r.struck && "line-through")} />}</td>
              <td className="py-2 pl-3 text-right">{r.balance ? <Amount value={r.balance} tone="balance" /> : <span className="text-xs">not counted</span>}</td>
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={6} className="py-6 text-center text-sm text-ink-3">
                No invoices or payments {from || to ? "in this period" : "yet"}.
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr className="border-t-[1.5px] border-rule-strong">
            <td className="tnum h-10 pr-3 text-ink-3">{to ? fmtDate(to) : ""}</td>
            <td className="px-3" />
            <td className="px-3 font-semibold text-ink">Closing balance</td>
            <td className="px-3 text-right">
              <Amount value={totalDebit} className="font-medium" />
            </td>
            <td className="px-3 text-right">
              <Amount value={totalCredit} className="font-medium" />
            </td>
            <td className="pl-3 text-right">
              <Amount value={closing} tone="balance" className="font-semibold" />
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
