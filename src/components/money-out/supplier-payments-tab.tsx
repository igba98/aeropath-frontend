"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarRange, HandCoins, X } from "lucide-react";

import type { SupplierPayment } from "@/domain/types";
import { toDarDate } from "@/domain/dates";
import { useApp, useUi } from "@/store";
import { sumIn } from "@/lib/view-models";
import { fmtDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DataTable, TotalsRow, type Column } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/page";
import { Amount } from "@/components/shared/amount";
import { Code, UserMark } from "@/components/shared/bits";
import { Field } from "@/components/shared/field";
import { FilterSelect, FILTER_ON } from "@/components/shared/filter-select";

/** Money out → Supplier payments: every payment made to a supplier. */
export function SupplierPaymentsTab() {
  const db = useApp((s) => s.db)!;
  const displayCur = useUi((s) => s.displayCurrency);
  const rate = db.settings.fx.USD_TZS;
  const [supplier, setSupplier] = React.useState("all");
  const [account, setAccount] = React.useState("all");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");

  const all = React.useMemo(() => Object.values(db.supplierPayments), [db.supplierPayments]);
  const rows = all.filter((p) => {
    if (supplier !== "all" && p.supplierId !== supplier) return false;
    if (account !== "all" && p.accountId !== account) return false;
    const d = toDarDate(p.paidAt);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  });
  const total = sumIn(rows.map((p) => p.amount), displayCur, rate);
  const anyFilter = supplier !== "all" || account !== "all" || from || to;
  const clear = () => {
    setSupplier("all");
    setAccount("all");
    setFrom("");
    setTo("");
  };

  const supplierOptions = Array.from(new Set(all.map((p) => p.supplierId)))
    .map((id) => ({ value: id, label: db.suppliers[id]?.name ?? "Unknown supplier" }))
    .sort((a, b) => a.label.localeCompare(b.label));
  const accountOptions = Object.values(db.moneyAccounts).map((a) => ({ value: a.id, label: a.name }));
  const files = (p: SupplierPayment) => Array.from(new Set(p.allocations.map((a) => db.lines[a.lineId]?.fileId).filter(Boolean) as string[])).map((id) => db.files[id]).filter(Boolean);

  const columns: Column<SupplierPayment>[] = [
    {
      key: "number",
      header: "Payment no.",
      sort: (p) => p.number,
      csv: (p) => p.number,
      cell: (p) => (
        <span className="block leading-tight">
          <Code strong>{p.number}</Code>
          <span className="tnum block text-xs text-ink-4">{fmtDate(p.paidAt)}</span>
        </span>
      ),
    },
    {
      key: "supplier",
      header: "Supplier",
      sort: (p) => db.suppliers[p.supplierId]?.name,
      csv: (p) => db.suppliers[p.supplierId]?.name,
      cell: (p) => (
        <span className="block max-w-[240px] leading-tight">
          <Link href={`/money-out/suppliers/${p.supplierId}`} className="block truncate text-ink hover:underline">
            {db.suppliers[p.supplierId]?.name ?? "Unknown supplier"}
          </Link>
          <span className="block truncate text-[13px] text-ink-3">
            {p.allocations.length} line{p.allocations.length === 1 ? "" : "s"}
            {files(p).length ? ` · ${files(p).map((f) => f.number).slice(0, 2).join(", ")}${files(p).length > 2 ? ` +${files(p).length - 2}` : ""}` : ""}
          </span>
        </span>
      ),
    },
    { key: "date", header: "Paid", sort: (p) => p.paidAt, csv: (p) => p.paidAt.slice(0, 10), hideBelow: "2xl", cell: (p) => <span className="tnum text-ink-2">{fmtDate(p.paidAt)}</span> },
    { key: "account", header: "From account", sort: (p) => db.moneyAccounts[p.accountId]?.name, csv: (p) => db.moneyAccounts[p.accountId]?.name, hideBelow: "md", cell: (p) => <span className="text-ink-2">{db.moneyAccounts[p.accountId]?.name ?? "—"}</span> },
    { key: "reference", header: "Reference", sort: (p) => p.reference, csv: (p) => p.reference, hideBelow: "xl", cell: (p) => (p.reference ? <Code>{p.reference}</Code> : <span className="text-ink-4">—</span>) },
    { key: "lines", header: "Lines", align: "right", sort: (p) => p.allocations.length, csv: (p) => p.allocations.length, hideBelow: "2xl", cell: (p) => p.allocations.length },
    { key: "by", header: "By", align: "center", sort: (p) => db.users[p.recordedBy]?.name, csv: (p) => db.users[p.recordedBy]?.name, hideBelow: "xl", cell: (p) => <UserMark user={db.users[p.recordedBy]} /> },
    { key: "amount", header: "Amount", align: "right", sort: (p) => (p.amount.currency === "USD" ? p.amount.amountMinor * rate : p.amount.amountMinor), csv: (p) => `${p.amount.currency} ${(p.amount.amountMinor / 100).toFixed(2)}`, cell: (p) => <Amount value={p.amount} className="font-medium text-ink" /> },
  ];

  return (
    <div>
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(p) => p.id}
        rowHref={(p) => `/money-out/suppliers/${p.supplierId}`}
        search={(p) => [p.number, p.reference, p.note, db.suppliers[p.supplierId]?.name, ...files(p).map((f) => f.number)].filter(Boolean).join(" ")}
        searchPlaceholder="Search payment no., supplier, reference, file no."
        exportName="supplier-payments"
        initialSort={{ key: "number", dir: "desc" }}
        toolbar={
          <>
            <FilterSelect label="Supplier" value={supplier} onChange={setSupplier} options={[{ value: "all", label: "All suppliers" }, ...supplierOptions]} />
            <FilterSelect label="Account" value={account} onChange={setAccount} options={[{ value: "all", label: "All accounts" }, ...accountOptions]} />
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn((from || to) && FILTER_ON)}>
                  <CalendarRange />
                  {from || to ? `${from ? fmtDate(from) : "…"} – ${to ? fmtDate(to) : "…"}` : "Dates"}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72 p-3">
                <div className="grid grid-cols-2 gap-2">
                  <Field label="From" htmlFor="sp-from">
                    <Input id="sp-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                  </Field>
                  <Field label="To" htmlFor="sp-to">
                    <Input id="sp-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                  </Field>
                </div>
              </PopoverContent>
            </Popover>
            {anyFilter && (
              <Button variant="ghost" size="sm" onClick={clear}>
                <X /> Clear filters
              </Button>
            )}
          </>
        }
        footer={
          rows.length > 0 && (
            <TotalsRow
              cells={[
                { content: `${rows.length} payment${rows.length === 1 ? "" : "s"}` },
                {},
                { className: "hidden xl:table-cell" },
                { className: "hidden md:table-cell" },
                { className: "hidden lg:table-cell" },
                { className: "hidden xl:table-cell" },
                { className: "hidden lg:table-cell" },
                { content: <Amount value={total} />, align: "right" },
              ]}
            />
          )
        }
        empty={
          all.length === 0 ? (
            <EmptyState icon={HandCoins} title="No supplier payments yet" body="Open a supplier from the Suppliers tab and choose Pay supplier." action={<Button variant="outline" asChild><Link href="/money-out?tab=suppliers">Go to suppliers</Link></Button>} />
          ) : (
            <EmptyState title="No payments match" body="Widen the dates or clear the filters." action={anyFilter ? <Button variant="outline" size="sm" onClick={clear}>Clear filters</Button> : undefined} />
          )
        }
      />
      {rows.some((p) => p.amount.currency !== displayCur) && <p className="mt-2 text-[13px] text-ink-3">Total converted at 1 USD = TZS {rate.toLocaleString("en-US")}.</p>}
    </div>
  );
}
