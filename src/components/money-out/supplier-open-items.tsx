"use client";

import * as React from "react";
import Link from "next/link";
import { CircleCheck } from "lucide-react";

import type { Currency, DbState, ID } from "@/domain/types";
import type { SupplierOpenItem } from "@/domain/selectors/balances";
import { sumIn } from "@/lib/view-models";
import { fmtDate } from "@/lib/dates";

import { Button } from "@/components/ui/button";
import { DataTable, TotalsRow, type Column } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/page";
import { Amount } from "@/components/shared/amount";
import { StatusChip } from "@/components/shared/status-chip";
import { Code } from "@/components/shared/bits";

const tickets = (i: SupplierOpenItem) => (i.line.type === "flight" ? i.line.details.passengers.map((p) => p.ticketNumber).filter(Boolean) as string[] : []);

/** Open items of a supplier: issued lines with unpaid cost, oldest first (spec §9.9). */
export function SupplierOpenItems({ db, items, currency, onPay }: { db: DbState; items: SupplierOpenItem[]; currency: Currency; onPay?: (lineId: ID) => void }) {
  const rate = db.settings.fx.USD_TZS;
  const toTzs = (m: { amountMinor: number; currency: Currency }) => (m.currency === "USD" ? m.amountMinor * rate : m.amountMinor);

  const columns: Column<SupplierOpenItem>[] = [
    {
      key: "booking",
      header: "Booking",
      sort: (i) => i.file.number,
      csv: (i) => i.file.number,
      cell: (i) => (
        <span className="block leading-tight">
          <Link href={`/bookings/${i.file.id}`} className="font-mono whitespace-nowrap text-[13.5px] font-semibold text-ink hover:underline">
            {i.file.number}
          </Link>
          <span className="block max-w-[200px] truncate text-xs text-ink-3">{db.clients[i.file.clientId]?.name ?? i.file.title}</span>
        </span>
      ),
    },
    {
      key: "line",
      header: "Line",
      csv: (i) => i.line.description,
      className: "max-w-[300px]",
      cell: (i) => {
        const t = tickets(i);
        return (
          <span className="block min-w-0 leading-tight">
            <span className="block truncate text-ink">{i.line.description}</span>
            <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
              {i.remaining.amountMinor < 0 ? <StatusChip status="pay.credit" size="xs" /> : <StatusChip status={`line.${i.line.status}`} size="xs" />}
              {t[0] && <Code className="text-xs text-ink-3">{t.length > 1 ? `${t[0]} +${t.length - 1}` : t[0]}</Code>}
            </span>
          </span>
        );
      },
    },
    { key: "service", header: "Service date", sort: (i) => i.serviceDate ?? "9999", csv: (i) => i.serviceDate, hideBelow: "xl", cell: (i) => <span className="tnum text-ink-2">{fmtDate(i.serviceDate)}</span> },
    { key: "cost", header: "Cost", align: "right", sort: (i) => toTzs(i.cost), csv: (i) => i.cost.amountMinor / 100, hideBelow: "md", cell: (i) => <Amount value={i.cost} tone="muted" /> },
    { key: "paid", header: "Paid", align: "right", sort: (i) => toTzs(i.paid), csv: (i) => i.paid.amountMinor / 100, hideBelow: "md", cell: (i) => (i.paid.amountMinor ? <Amount value={i.paid} tone="muted" /> : <span className="text-ink-4">—</span>) },
    { key: "remaining", header: "Remaining", align: "right", sort: (i) => toTzs(i.remaining), csv: (i) => i.remaining.amountMinor / 100, cell: (i) => <Amount value={i.remaining} tone="balance" className="font-medium text-ink" /> },
    {
      key: "days",
      header: "Days",
      align: "right",
      sort: (i) => i.daysOutstanding,
      csv: (i) => i.daysOutstanding,
      hideBelow: "sm",
      cell: (i) => (
        <span className="flex flex-col items-end gap-1">
          <span className="tnum text-ink-2">{i.daysOutstanding}</span>
          {i.overdue && <StatusChip status="pay.overdue" size="xs" title={i.dueDate ? `Due ${fmtDate(i.dueDate)}` : undefined} />}
        </span>
      ),
    },
    ...(onPay
      ? [
          {
            key: "pay",
            header: <span className="sr-only">Pay</span>,
            align: "right" as const,
            width: "56px",
            cell: (i: SupplierOpenItem) => (i.remaining.amountMinor > 0 ? <Button variant="outline" size="xs" onClick={() => onPay(i.line.id)}>Pay</Button> : null),
          },
        ]
      : []),
  ];

  const sum = (pick: (i: SupplierOpenItem) => { amountMinor: number; currency: Currency }) => sumIn(items.map(pick), currency, rate);

  return (
    <DataTable
      rows={items}
      columns={columns}
      rowKey={(i) => i.line.id}
      search={(i) => [i.file.number, i.line.description, db.clients[i.file.clientId]?.name, ...tickets(i), i.line.type === "flight" ? i.line.details.recordLocator : ""].filter(Boolean).join(" ")}
      searchPlaceholder="Search file no., ticket, PNR, client"
      exportName="supplier-open-items"
      dense
      footer={
        items.length > 0 && (
          <TotalsRow
            cells={[
              { content: `${items.length} open` },
              {},
              { className: "hidden lg:table-cell" },
              { content: <Amount value={sum((i) => i.cost)} />, align: "right", className: "hidden md:table-cell" },
              { content: <Amount value={sum((i) => i.paid)} />, align: "right", className: "hidden md:table-cell" },
              { content: <Amount value={sum((i) => i.remaining)} tone="balance" />, align: "right" },
              { className: "hidden sm:table-cell" },
              ...(onPay ? [{}] : []),
            ]}
          />
        )
      }
      empty={<EmptyState icon={CircleCheck} title="Nothing open with this supplier" body="Every issued line is paid. New issued lines appear here." />}
    />
  );
}
