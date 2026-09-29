"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCheck, Plus, Wallet, X } from "lucide-react";
import { toast } from "sonner";

import type { ID, PaymentMethod } from "@/domain/types";
import { can } from "@/domain/permissions";
import { verifyPayment } from "@/domain/commands";
import { useApp, useDispatch, useMe, useUi } from "@/store";
import { useModals } from "@/store/modals";
import { useNow } from "@/lib/use-now";
import { toDarDate } from "@/domain/dates";
import { daysUntil, fmtDateTime, fmtRelative } from "@/lib/dates";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/page";
import { StatusChip } from "@/components/shared/status-chip";
import { Amount } from "@/components/shared/amount";
import { UserMark } from "@/components/shared/bits";
import { FilterSelect } from "@/components/shared/filter-select";
import { ResponsiveFilters } from "@/components/shared/responsive-filters";
import { PAYMENT_METHODS } from "@/store/seed/reference";
import { DateRangeFilter } from "./date-range";
import { METHOD_LABEL, netIn, paymentRows, type PaymentRow } from "./payment-rows";

const minorSort = (r: PaymentRow, rate: number) => r.signed.amountMinor * (r.signed.currency === "USD" ? rate : 1);

/** Received (all payments, in and out) or Unverified (recorded only, oldest first, bulk verify). */
export function PaymentsTable({ mode, onOpen, openId }: { mode: "received" | "unverified"; onOpen: (id: ID) => void; openId?: string | null }) {
  const me = useMe();
  const db = useApp((s) => s.db)!;
  const dispatch = useDispatch();
  const displayCur = useUi((s) => s.displayCurrency);
  const openPayment = useModals((s) => s.openPayment);
  const now = useNow();
  const rate = db.settings.fx.USD_TZS;
  const finance = can(me, "payment.verify");
  const unverified = mode === "unverified";

  const [direction, setDirection] = React.useState("all");
  const [method, setMethod] = React.useState("all");
  const [account, setAccount] = React.useState("all");
  const [status, setStatus] = React.useState("all");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [selected, setSelected] = React.useState<Set<ID>>(new Set());

  const rows = React.useMemo(() => paymentRows(db, unverified ? (p) => p.status === "recorded" : undefined), [db, unverified]);
  const filtered = React.useMemo(
    () =>
      rows.filter((r) => {
        const p = r.payment;
        if (direction !== "all" && p.direction !== direction) return false;
        if (method !== "all" && p.method !== method) return false;
        if (account !== "all" && p.accountId !== account) return false;
        if (status !== "all" && p.status !== status) return false;
        const d = toDarDate(p.receivedAt);
        if (from && d < from) return false;
        if (to && d > to) return false;
        return true;
      }),
    [rows, direction, method, account, status, from, to],
  );

  // Only rows still in the list count as selected (others were verified elsewhere or filtered out).
  const chosen = React.useMemo(() => new Set(filtered.filter((r) => selected.has(r.id)).map((r) => r.id)), [filtered, selected]);

  const anyFilter = direction !== "all" || method !== "all" || account !== "all" || status !== "all" || from || to;
  const clear = () => {
    setDirection("all");
    setMethod("all");
    setAccount("all");
    setStatus("all");
    setFrom("");
    setTo("");
  };

  const verifySelected = () => {
    let done = 0;
    const failed: string[] = [];
    for (const id of chosen) {
      const r = dispatch(verifyPayment, { paymentId: id }, { toast: false, quietErrors: true });
      if (r.ok) done++;
      else failed.push(`${db.payments[id]?.number}: ${r.error.message}`);
    }
    setSelected(new Set());
    if (done) toast.success(`${done} payment${done === 1 ? "" : "s"} verified`);
    if (failed.length) toast.error(failed.join(" · "));
  };

  const allOn = filtered.length > 0 && filtered.every((r) => chosen.has(r.id));
  const someOn = !allOn && chosen.size > 0;

  const columns: Column<PaymentRow>[] = [];
  if (unverified && finance) {
    columns.push({
      key: "select",
      width: "28px",
      header: (
        <Checkbox
          checked={allOn ? true : someOn ? "indeterminate" : false}
          onCheckedChange={(v) => setSelected(v === true ? new Set(filtered.map((r) => r.id)) : new Set())}
          aria-label="Select all unverified payments"
        />
      ),
      cell: (r) => (
        <Checkbox
          checked={chosen.has(r.id)}
          onCheckedChange={(v) =>
            setSelected((s) => {
              const n = new Set(s);
              if (v === true) n.add(r.id);
              else n.delete(r.id);
              return n;
            })
          }
          aria-label={`Select ${r.number}`}
        />
      ),
    });
  }
  columns.push(
    {
      key: "number",
      header: "Receipt no.",
      sort: (r) => r.number,
      csv: (r) => r.number,
      cell: (r) => (
        <span className="block leading-tight">
          <span className={cn("block font-mono whitespace-nowrap text-[13.5px] font-semibold text-ink", r.payment.status === "reversed" && "text-ink-3 line-through")}>{r.number}</span>
          {r.out && <span className="block text-xs text-ink-3">Refund payout</span>}
        </span>
      ),
    },
    {
      key: "date",
      header: "Date",
      sort: (r) => r.payment.receivedAt,
      csv: (r) => fmtDateTime(r.payment.receivedAt),
      // Unverified adds Age, which carries the recency; the full date returns on wide screens and in the drawer.
      hideBelow: unverified ? "2xl" : "sm",
      cell: (r) => <span className="tnum whitespace-nowrap text-ink-2">{fmtDateTime(r.payment.receivedAt)}</span>,
    },
  );
  if (unverified) {
    columns.push({
      key: "age",
      header: "Age",
      sort: (r) => r.payment.receivedAt,
      cell: (r) => {
        const days = -daysUntil(r.payment.receivedAt, now);
        return <span className={cn("tnum whitespace-nowrap", days >= 3 ? "font-medium text-[var(--st-amber-fg)]" : "text-ink-3")}>{fmtRelative(r.payment.receivedAt, now).replace(" ago", "")}</span>;
      },
    });
  }
  columns.push(
    {
      key: "client",
      header: "Client",
      sort: (r) => r.client?.name,
      csv: (r) => r.client?.name,
      hideBelow: "md",
      cell: (r) =>
        r.client ? (
          <Link href={`/clients/${r.client.id}`} className="block max-w-[200px] truncate text-ink hover:underline">
            {r.client.name}
          </Link>
        ) : (
          <span className="text-ink-4">—</span>
        ),
    },
    {
      key: "files",
      header: "Booking(s)",
      csv: (r) => r.files.map((f) => f.number).join(" "),
      hideBelow: "xl",
      cell: (r) => (
        <span className="flex max-w-[220px] flex-wrap gap-x-2">
          {r.files.map((f) => (
            <Link key={f.id} href={`/bookings/${f.id}`} className="font-mono whitespace-nowrap text-[13px] text-ink hover:underline">
              {f.number}
            </Link>
          ))}
        </span>
      ),
    },
    {
      key: "method",
      header: "Method",
      sort: (r) => METHOD_LABEL[r.payment.method],
      csv: (r) => METHOD_LABEL[r.payment.method],
      hideBelow: "sm",
      cell: (r) => <span className="whitespace-nowrap text-ink-2">{METHOD_LABEL[r.payment.method]}</span>,
    },
    {
      key: "account",
      header: "Account",
      sort: (r) => r.account?.name,
      csv: (r) => r.account?.name,
      hideBelow: "2xl",
      cell: (r) => <span className="whitespace-nowrap text-ink-2">{r.account?.name ?? "—"}</span>,
    },
    {
      key: "reference",
      header: "Reference",
      csv: (r) => r.payment.reference,
      hideBelow: "2xl",
      cell: (r) => (r.payment.reference ? <span className="font-mono whitespace-nowrap text-[13px] text-ink-2">{r.payment.reference}</span> : <span className="text-[13px] text-ink-4">Cash</span>),
    },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      sort: (r) => minorSort(r, rate),
      csv: (r) => `${r.signed.currency} ${(r.signed.amountMinor / 100).toFixed(2)}`,
      cell: (r) => <Amount value={r.signed} className={cn("font-medium", r.payment.status === "reversed" && "text-ink-4 line-through")} />,
    },
    {
      key: "status",
      header: "Status",
      sort: (r) => r.payment.status,
      csv: (r) => r.payment.status,
      hideBelow: "md",
      cell: (r) => <StatusChip status={`payment.${r.payment.status}`} />,
    },
    {
      key: "by",
      header: "Recorded by",
      sort: (r) => r.recordedBy?.name,
      csv: (r) => r.recordedBy?.name,
      hideBelow: "2xl",
      align: "center",
      cell: (r) => <UserMark user={r.recordedBy} />,
    },
  );

  const net = netIn(filtered, displayCur, rate);
  const accounts = Object.values(db.moneyAccounts);

  return (
    <div className="space-y-2">
      <p className="text-sm text-ink-3">
        {unverified ? "Check each against the bank or mobile money statement, then verify." : "Money received from clients and refunds paid out."}{" "}
        <span className="inline-flex items-center gap-1">
          Net in view <Amount value={net} className="font-medium text-ink" />
        </span>
        {filtered.some((r) => r.signed.currency !== displayCur) && <span className="text-ink-4"> · converted at 1 USD = TZS {rate.toLocaleString("en-US")}</span>}
      </p>
      <DataTable
        rows={filtered}
        columns={columns}
        rowKey={(r) => r.id}
        onRowClick={(r) => onOpen(r.id)}
        selectedKey={openId ?? undefined}
        search={(r) => [r.number, r.client?.name, r.client?.phone, r.payment.reference, r.files.map((f) => f.number).join(" "), r.account?.name].filter(Boolean).join(" ")}
        searchPlaceholder="Search receipt, client, reference, file no."
        exportName={unverified ? "unverified-payments" : "payments"}
        initialSort={unverified ? { key: "date", dir: "asc" } : { key: "date", dir: "desc" }}
        rowClassName={(r) => (r.payment.status === "reversed" ? "text-ink-3" : undefined)}
        toolbar={
          <>
            {unverified && finance && chosen.size > 0 && (
              <Button size="sm" onClick={verifySelected}>
                <CheckCheck /> Verify selected ({chosen.size})
              </Button>
            )}
            <ResponsiveFilters active={[direction !== "all", method !== "all", account !== "all", status !== "all", Boolean(from || to)].filter(Boolean).length} onClear={clear}>
              {!unverified && (
                <FilterSelect
                  label="Direction"
                  value={direction}
                  onChange={setDirection}
                  options={[
                    { value: "all", label: "In and out" },
                    { value: "in", label: "Received" },
                    { value: "out", label: "Refund payouts" },
                  ]}
                />
              )}
              <FilterSelect
                label="Method"
                value={method}
                onChange={(v) => setMethod(v as PaymentMethod | "all")}
                options={[
                  { value: "all", label: "All methods" },
                  ...PAYMENT_METHODS.map((m) => ({
                    value: m.value,
                    label: m.label,
                  })),
                ]}
              />
              <FilterSelect label="Account" value={account} onChange={setAccount} options={[{ value: "all", label: "All accounts" }, ...accounts.map((a) => ({ value: a.id, label: a.name }))]} />
              {!unverified && (
                <FilterSelect
                  label="Status"
                  value={status}
                  onChange={setStatus}
                  options={[
                    { value: "all", label: "Any status" },
                    { value: "recorded", label: "Unverified" },
                    { value: "verified", label: "Verified" },
                    { value: "reversed", label: "Reversed" },
                  ]}
                />
              )}
              <DateRangeFilter from={from} to={to} onChange={(f, t) => (setFrom(f), setTo(t))} idPrefix={`pay-${mode}`} />
              {anyFilter && (
                <Button variant="ghost" size="sm" onClick={clear} className="hidden lg:inline-flex">
                  <X /> Clear filters
                </Button>
              )}
            </ResponsiveFilters>
          </>
        }
        empty={
          rows.length === 0 ? (
            unverified ? (
              <EmptyState icon={CheckCheck} title="Everything is verified" body="No payments are waiting for a check against the bank or mobile money statements." />
            ) : (
              <EmptyState
                icon={Wallet}
                title="No payments yet"
                body="Record the first payment when a client pays a deposit or a balance."
                action={
                  can(me, "payment.record") && (
                    <Button onClick={() => openPayment()}>
                      <Plus /> Record payment
                    </Button>
                  )
                }
              />
            )
          ) : (
            <EmptyState
              title="No payments match these filters"
              body="Try another method, account or date range."
              action={
                anyFilter ? (
                  <Button variant="outline" size="sm" onClick={clear}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          )
        }
      />
    </div>
  );
}
