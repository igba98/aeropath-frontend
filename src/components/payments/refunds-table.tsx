"use client";

import * as React from "react";
import Link from "next/link";
import { Banknote, Undo2 } from "lucide-react";

import type { ID } from "@/domain/types";
import { can } from "@/domain/permissions";
import { convert } from "@/domain/money";
import { useApp, useMe } from "@/store";
import { useNow } from "@/lib/use-now";
import { fmtDate, fmtRelative } from "@/lib/dates";

import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState, QuickTabs } from "@/components/shared/page";
import { StatusChip } from "@/components/shared/status-chip";
import { Amount } from "@/components/shared/amount";
import { LINE_LABEL, UserMark } from "@/components/shared/bits";
import { refundRows, type RefundRow } from "./payment-rows";

type View = "open" | "decide" | "payout" | "all";

const inView = (r: RefundRow, v: View) => (v === "all" ? true : v === "decide" ? r.refund.status === "requested" : v === "payout" ? r.toPayOut : r.refund.status === "requested" || r.toPayOut);

/** Refund and exchange requests: decide, then pay out approved refunds. */
export function RefundsTable({ onOpen, openId }: { onOpen: (id: ID) => void; openId?: string | null }) {
  const me = useMe();
  const db = useApp((s) => s.db)!;
  const now = useNow();
  const rate = db.settings.fx.USD_TZS;
  const [view, setView] = React.useState<View>("open");
  const canPay = can(me, "refund.pay");

  const rows = React.useMemo(() => refundRows(db), [db]);
  const counts = React.useMemo(() => {
    const c = {} as Record<View, number>;
    (["open", "decide", "payout", "all"] as View[]).forEach((v) => (c[v] = rows.filter((r) => inView(r, v)).length));
    return c;
  }, [rows]);
  const visible = rows.filter((r) => inView(r, view));

  const columns: Column<RefundRow>[] = [
    {
      key: "number",
      header: "Request no.",
      sort: (r) => r.number,
      csv: (r) => r.number,
      cell: (r) => (
        <span className="block leading-tight">
          <span className="block font-mono whitespace-nowrap text-[13.5px] font-semibold text-ink">{r.number}</span>
          <span className="block text-xs text-ink-3">{r.refund.kind === "exchange" ? "Exchange" : "Refund"}</span>
        </span>
      ),
    },
    {
      key: "booking",
      header: "Booking",
      sort: (r) => r.file?.number,
      csv: (r) => r.file?.number,
      hideBelow: "sm",
      cell: (r) => (
        <span className="block max-w-[200px] leading-tight">
          {r.file ? (
            <Link href={`/bookings/${r.file.id}`} className="block font-mono whitespace-nowrap text-[13.5px] text-ink hover:underline">
              {r.file.number}
            </Link>
          ) : (
            "—"
          )}
          <span className="block truncate text-xs text-ink-3">{r.client?.name}</span>
        </span>
      ),
    },
    {
      key: "line",
      header: "Service",
      csv: (r) => r.line?.description,
      hideBelow: "xl",
      className: "max-w-[300px]",
      cell: (r) => (
        <span className="block min-w-0 leading-tight">
          <span className="block text-[13px] text-ink-3">{r.line ? LINE_LABEL[r.line.type] : "—"}</span>
          <span className="block truncate text-[13.5px] text-ink-2">{r.line?.description}</span>
        </span>
      ),
    },
    {
      key: "amount",
      header: "Client refund",
      align: "right",
      sort: (r) => convert(r.extraToCollect ?? r.refund.quote.clientRefund, "TZS", rate).amountMinor,
      csv: (r) => {
        const m = r.extraToCollect ?? r.refund.quote.clientRefund;
        return `${m.currency} ${(m.amountMinor / 100).toFixed(2)}`;
      },
      cell: (r) =>
        r.extraToCollect ? (
          <span className="flex flex-col items-end leading-tight">
            <Amount value={r.extraToCollect} />
            <span className="text-xs text-ink-3">to collect</span>
          </span>
        ) : (
          <span className="flex flex-col items-end gap-1">
            <Amount value={r.refund.quote.clientRefund} className="font-medium" />
            {r.needsManager && r.refund.status === "requested" && <StatusChip status="limit.manager" size="xs" />}
          </span>
        ),
    },
    {
      key: "status",
      header: "Status",
      sort: (r) => r.refund.status,
      csv: (r) => r.refund.status,
      cell: (r) => <StatusChip status={`refund.${r.refund.status}`} />,
    },
    {
      key: "by",
      header: "Requested by",
      sort: (r) => r.requestedBy?.name,
      csv: (r) => r.requestedBy?.name,
      hideBelow: "2xl",
      align: "center",
      cell: (r) => <UserMark user={r.requestedBy} />,
    },
    {
      key: "age",
      header: "Age",
      sort: (r) => r.refund.requestedAt,
      csv: (r) => fmtDate(r.refund.requestedAt),
      hideBelow: "md",
      cell: (r) => <span className="tnum whitespace-nowrap text-ink-3">{fmtRelative(r.refund.requestedAt, now).replace(" ago", "")}</span>,
    },
    {
      key: "action",
      header: <span className="sr-only">Action</span>,
      align: "right",
      cell: (r) =>
        r.toPayOut && canPay ? (
          <Button size="xs" variant="outline" onClick={() => onOpen(r.id)}>
            <Banknote /> Pay out
          </Button>
        ) : r.refund.status === "requested" &&
          can(me, "refund.approve", {
            settings: db.settings,
            refund: r.refund,
          }) ? (
          <Button size="xs" variant="outline" onClick={() => onOpen(r.id)}>
            Decide
          </Button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-3">
      <QuickTabs<View>
        controls="refunds-list"
        value={view}
        onChange={setView}
        options={[
          { value: "open", label: "Open", count: counts.open },
          { value: "decide", label: "Awaiting decision", count: counts.decide },
          { value: "payout", label: "To pay out", count: counts.payout },
          { value: "all", label: "All", count: counts.all },
        ]}
      />
      <DataTable
        id="refunds-list"
        rows={visible}
        columns={columns}
        rowKey={(r) => r.id}
        onRowClick={(r) => onOpen(r.id)}
        selectedKey={openId ?? undefined}
        search={(r) => [r.number, r.file?.number, r.client?.name, r.line?.description, r.refund.reason].filter(Boolean).join(" ")}
        searchPlaceholder="Search request, file no., client"
        exportName="refund-requests"
        initialSort={{ key: "age", dir: "asc" }}
        empty={
          rows.length === 0 ? (
            <EmptyState icon={Undo2} title="No refund requests" body="Agents request refunds and exchanges from an issued service on the booking page." />
          ) : (
            <EmptyState
              title={view === "decide" ? "Nothing waiting for a decision" : view === "payout" ? "Nothing to pay out" : "No open requests"}
              action={
                <Button variant="outline" size="sm" onClick={() => setView("all")}>
                  Show all requests
                </Button>
              }
            />
          )
        }
      />
    </div>
  );
}
