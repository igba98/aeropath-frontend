"use client";

import * as React from "react";
import { Suspense } from "react";
import Link from "next/link";
import { BookOpenCheck, CalendarRange, Plus, X } from "lucide-react";

import type { FileSource, LineType } from "@/domain/types";
import { can } from "@/domain/permissions";
import { useApp, useMe, useUi } from "@/store";
import { useNow } from "@/lib/use-now";
import { bookingRows, PAY_KEY, sumIn, type BookingRow } from "@/lib/view-models";
import { fmtDate, fmtRange } from "@/lib/dates";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState, PageHeader, QuickTabs, useSetParam, useTab } from "@/components/shared/page";
import { StatusChip } from "@/components/shared/status-chip";
import { Amount } from "@/components/shared/amount";
import { Route, ServiceIcons, UserMark, LINE_LABEL } from "@/components/shared/bits";
import { Field } from "@/components/shared/field";
import { FilterSelect, FILTER_ON } from "@/components/shared/filter-select";
import { ResponsiveFilters } from "@/components/shared/responsive-filters";

type View = "all" | "draft" | "confirmed" | "unpaid" | "soon" | "travelled" | "cancelled";

const SOURCES: { value: FileSource; label: string }[] = [
  { value: "walk_in", label: "Walk-in" },
  { value: "phone", label: "Phone" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "Email" },
  { value: "corporate", label: "Corporate" },
];

export default function BookingsPage() {
  return (
    <Suspense>
      <Bookings />
    </Suspense>
  );
}

function Bookings() {
  const me = useMe();
  const db = useApp((s) => s.db)!;
  const now = useNow();
  const displayCur = useUi((s) => s.displayCurrency);
  const view = useTab("all", "view") as View;
  const setParam = useSetParam();

  const [agent, setAgent] = React.useState("all");
  const [service, setService] = React.useState<"all" | LineType>("all");
  const [pay, setPay] = React.useState("all");
  const [source, setSource] = React.useState<"all" | FileSource>("all");
  const [dateField, setDateField] = React.useState<"travel" | "created">("travel");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");

  const rows = React.useMemo(() => bookingRows(db, now), [db, now]);

  const inView = React.useCallback((r: BookingRow, v: View) => {
    switch (v) {
      case "all":
        return true;
      case "draft":
        return r.status === "draft";
      case "confirmed":
        return r.status === "confirmed";
      case "unpaid":
        return (r.pay === "unpaid" || r.pay === "partial") && r.status !== "cancelled";
      case "soon":
        return r.status === "confirmed" && r.daysToStart !== undefined && r.daysToStart >= 0 && r.daysToStart <= 7;
      case "travelled":
        return r.status === "travelled" || r.status === "closed";
      case "cancelled":
        return r.status === "cancelled";
    }
  }, []);

  const filtered = React.useMemo(
    () =>
      rows.filter((r) => {
        if (agent !== "all" && r.file.ownerId !== agent) return false;
        if (service !== "all" && !r.lineTypes.includes(service)) return false;
        if (pay !== "all" && (pay === "overdue" ? !r.overdue : r.pay !== pay)) return false;
        if (source !== "all" && r.file.source !== source) return false;
        if (from || to) {
          const d = dateField === "travel" ? r.start : r.createdAt.slice(0, 10);
          if (!d) return false;
          if (from && d < from) return false;
          if (to && d > to) return false;
        }
        return true;
      }),
    [rows, agent, service, pay, source, dateField, from, to],
  );

  const counts = React.useMemo(() => {
    const c = {} as Record<View, number>;
    (["all", "draft", "confirmed", "unpaid", "soon", "travelled", "cancelled"] as View[]).forEach((v) => (c[v] = filtered.filter((r) => inView(r, v)).length));
    return c;
  }, [filtered, inView]);

  const visible = React.useMemo(() => filtered.filter((r) => inView(r, view)), [filtered, view, inView]);
  const outstanding = React.useMemo(
    () =>
      sumIn(
        visible.filter((r) => r.totals.balance.amountMinor > 0).map((r) => r.totals.balance),
        displayCur,
        db.settings.fx.USD_TZS,
      ),
    [visible, displayCur, db.settings.fx.USD_TZS],
  );

  const agents = Object.values(db.users).filter((u) => u.role !== "accountant");
  const anyFilter = agent !== "all" || service !== "all" || pay !== "all" || source !== "all" || from || to;
  const clearFilters = () => {
    setAgent("all");
    setService("all");
    setPay("all");
    setSource("all");
    setFrom("");
    setTo("");
  };

  const columns: Column<BookingRow>[] = [
    {
      key: "number",
      header: "File no.",
      sort: (r) => r.number,
      csv: (r) => r.number,
      className: "whitespace-nowrap",
      cell: (r) => (
        <span className="block leading-tight">
          <span className="block font-mono whitespace-nowrap text-[13.5px] font-semibold text-ink">{r.number}</span>
          <span className="block text-xs text-ink-4">{fmtDate(r.createdAt)}</span>
        </span>
      ),
    },
    {
      key: "route",
      header: "Route / title",
      sort: (r) => r.route.join("") || r.title,
      csv: (r) => (r.route.length ? r.route.join("-") + " · " : "") + r.title,
      csvHeader: "Route / title",
      className: "max-w-[260px]",
      cell: (r) => (
        <span className="block min-w-0 leading-tight">
          {r.route.length ? <Route codes={r.route} size="sm" /> : <span className="text-[13px] text-ink-3">No flight</span>}
          <span className="mt-0.5 block truncate text-[13px] text-ink-3">{r.title}</span>
        </span>
      ),
    },
    {
      key: "client",
      header: "Client",
      sort: (r) => r.client?.name,
      csv: (r) => r.client?.name,
      hideBelow: "xl",
      cell: (r) => (
        <span className="block max-w-[180px] leading-tight">
          <span className="block truncate text-ink">{r.client?.name ?? "—"}</span>
          {r.client?.type === "corporate" && <span className="block text-xs text-ink-3">Corporate</span>}
        </span>
      ),
    },
    {
      key: "services",
      header: "Services",
      hideBelow: "2xl",
      csv: (r) => r.lineTypes.map((t) => LINE_LABEL[t]).join(" + "),
      cell: (r) => <ServiceIcons types={r.lineTypes} />,
    },
    {
      key: "travel",
      header: "Travel",
      sort: (r) => r.start ?? "9999",
      csv: (r) => fmtRange(r.start, r.end),
      hideBelow: "xl",
      cell: (r) => (
        <span className="block leading-tight whitespace-nowrap">
          <span className="tnum block text-ink">{r.start ? fmtRange(r.start, r.end) : "—"}</span>
          {r.daysToStart !== undefined && r.daysToStart >= 0 && r.daysToStart <= 14 && r.status !== "cancelled" && (
            <span className={cn("block text-xs", r.daysToStart <= 2 ? "font-medium text-[var(--st-amber-fg)]" : "text-ink-3")}>
              {r.daysToStart === 0 ? "Departs today" : r.daysToStart === 1 ? "Departs tomorrow" : `In ${r.daysToStart} days`}
            </span>
          )}
        </span>
      ),
    },
    {
      key: "agent",
      header: "Agent",
      sort: (r) => r.owner?.name,
      csv: (r) => r.owner?.name,
      hidden: true,
      cell: (r) => <UserMark user={r.owner} />,
    },
    {
      key: "status",
      header: "Status",
      sort: (r) => r.status,
      csv: (r) => r.status,
      cell: (r) => (
        <span className="flex items-center gap-1.5 whitespace-nowrap">
          <StatusChip status={`file.${r.status}`} />
          <UserMark user={r.owner} size="xs" />
        </span>
      ),
    },
    {
      key: "total",
      header: "Total",
      align: "right",
      sort: (r) => r.totals.charges.amountMinor * (r.totals.currency === "USD" ? db.settings.fx.USD_TZS : 1),
      csv: (r) => `${r.totals.currency} ${(r.totals.charges.amountMinor / 100).toFixed(2)}`,
      hideBelow: "2xl",
      cell: (r) => <Amount value={r.totals.charges} />,
    },
    {
      key: "balance",
      header: "Balance",
      align: "right",
      sort: (r) => r.totals.balance.amountMinor * (r.totals.currency === "USD" ? db.settings.fx.USD_TZS : 1),
      csv: (r) => `${r.totals.currency} ${(r.totals.balance.amountMinor / 100).toFixed(2)}`,
      cell: (r) => (
        <span className="flex flex-col items-end gap-1">
          <Amount value={r.totals.balance} tone="balance" className={cn(r.totals.balance.amountMinor === 0 && "text-ink-4")} />
          <span className="flex gap-1">
            {r.overdue && <StatusChip status="pay.overdue" size="xs" />}
            {r.pay !== "paid" && r.pay !== "none" && !r.overdue && <StatusChip status={PAY_KEY[r.pay]} size="xs" />}
            {r.pay === "paid" && <StatusChip status="pay.paid" size="xs" />}
          </span>
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Bookings"
        meta={
          <>
            <span className="tnum">{rows.length} files</span>
            <span aria-hidden>·</span>
            <span className="tnum">{counts.soon} departing in 7 days</span>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1">
              Outstanding in view <Amount value={outstanding} className="font-medium text-ink" />
            </span>
          </>
        }
      />

      <QuickTabs<View>
        controls="bookings-list"
        value={view}
        onChange={(v) => setParam("view", v === "all" ? null : v)}
        options={[
          { value: "all", label: "All", count: counts.all },
          { value: "draft", label: "Drafts", count: counts.draft },
          { value: "confirmed", label: "Confirmed", count: counts.confirmed },
          { value: "unpaid", label: "Unpaid", count: counts.unpaid },
          { value: "soon", label: "Departing soon", count: counts.soon },
          { value: "travelled", label: "Travelled", count: counts.travelled },
          { value: "cancelled", label: "Cancelled", count: counts.cancelled },
        ]}
        className="mb-4"
      />

      <DataTable
        id="bookings-list"
        rows={visible}
        columns={columns}
        rowKey={(r) => r.id}
        rowHref={(r) => `/bookings/${r.id}`}
        search={(r) => [r.number, r.title, r.client?.name, r.client?.phone, r.route.join(" "), r.pnrs.join(" "), r.owner?.name].filter(Boolean).join(" ")}
        searchPlaceholder="Search file no., client, route, PNR"
        exportName="bookings"
        initialSort={{ key: "number", dir: "desc" }}
        toolbar={
          <ResponsiveFilters active={[agent !== "all", service !== "all", pay !== "all", source !== "all", Boolean(from || to)].filter(Boolean).length} onClear={clearFilters}>
            <FilterSelect label="Agent" value={agent} onChange={setAgent} options={[{ value: "all", label: "All agents" }, ...agents.map((u) => ({ value: u.id, label: u.name }))]} />
            <FilterSelect
              label="Service"
              value={service}
              onChange={(v) => setService(v as typeof service)}
              options={[
                { value: "all", label: "All services" },
                ...(Object.keys(LINE_LABEL) as LineType[]).map((t) => ({
                  value: t,
                  label: LINE_LABEL[t],
                })),
              ]}
            />
            <FilterSelect
              label="Payment"
              value={pay}
              onChange={setPay}
              options={[
                { value: "all", label: "Any payment" },
                { value: "unpaid", label: "Unpaid" },
                { value: "partial", label: "Partial" },
                { value: "paid", label: "Paid" },
                { value: "credit", label: "Credit" },
                { value: "overdue", label: "Overdue" },
              ]}
            />
            <FilterSelect label="Source" value={source} onChange={(v) => setSource(v as typeof source)} options={[{ value: "all", label: "Any source" }, ...SOURCES]} />
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn((from || to) && FILTER_ON)}>
                  <CalendarRange />
                  {from || to ? `${dateField === "travel" ? "Travel" : "Created"} ${from ? fmtDate(from) : "…"} – ${to ? fmtDate(to) : "…"}` : "Dates"}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72 space-y-3 p-3">
                <FilterSelect
                  label="Date"
                  value={dateField}
                  onChange={(v) => setDateField(v as typeof dateField)}
                  options={[
                    { value: "travel", label: "Travel date" },
                    { value: "created", label: "Created date" },
                  ]}
                  full
                />
                <div className="grid grid-cols-2 gap-2">
                  <Field label="From" htmlFor="f-from">
                    <Input id="f-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                  </Field>
                  <Field label="To" htmlFor="f-to">
                    <Input id="f-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                  </Field>
                </div>
              </PopoverContent>
            </Popover>
            {anyFilter && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="hidden lg:inline-flex">
                <X /> Clear filters
              </Button>
            )}
          </ResponsiveFilters>
        }
        empty={
          rows.length === 0 ? (
            <EmptyState
              icon={BookOpenCheck}
              title="No bookings yet"
              body="Create the first one for a walk-in, phone or WhatsApp client."
              action={
                can(me, "booking.create") && (
                  <Button asChild>
                    <Link href="/book">
                      <Plus /> Create the first booking
                    </Link>
                  </Button>
                )
              }
            />
          ) : (
            <EmptyState
              title="No bookings in this view"
              body="Try another tab or clear the filters."
              action={
                anyFilter ? (
                  <Button variant="outline" size="sm" onClick={clearFilters}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          )
        }
      />
    </>
  );
}
