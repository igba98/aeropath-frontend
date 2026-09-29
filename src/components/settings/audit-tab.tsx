"use client";

import * as React from "react";
import Link from "next/link";
import { CalendarRange, ScrollText, X } from "lucide-react";

import type { AuditEvent } from "@/domain/types";
import { toDarDate } from "@/domain/dates";
import { useApp } from "@/store";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/page";
import { UserMark } from "@/components/shared/bits";
import { Field } from "@/components/shared/field";
import { FilterSelect, FILTER_ON } from "@/components/shared/filter-select";
import { TabHeading } from "./settings-kit";

const ENTITY_LABEL: Record<string, string> = {
  file: "Booking",
  booking: "Booking",
  line: "Service",
  client: "Client",
  traveller: "Traveller",
  payment: "Payment",
  refund: "Refund",
  invoice: "Invoice",
  quote: "Quote",
  supplier: "Supplier",
  supplier_payment: "Supplier payment",
  expense: "Expense",
  user: "User",
  money_account: "Money account",
  settings: "Settings",
  system: "System",
};
const entityLabel = (e: string) => ENTITY_LABEL[e] ?? e.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
/** "payment.verified" → "Payment verified". */
const actionLabel = (a: string) => a.replace(/[._]/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/** Settings → Audit log: everything anyone did, filterable, exportable. */
export function AuditTab() {
  const db = useApp((s) => s.db)!;
  const [actor, setActor] = React.useState("all");
  const [area, setArea] = React.useState("all");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");

  const events = db.audit;
  const actors = React.useMemo(() => {
    const ids = Array.from(new Set(events.map((e) => e.actorId)));
    return ids.map((id) => ({ value: id, label: db.users[id]?.name ?? (id === "usr_system" ? "System" : id) })).sort((a, b) => a.label.localeCompare(b.label));
  }, [events, db.users]);
  const actions = React.useMemo(() => Array.from(new Set(events.map((e) => e.action))).sort(), [events]);

  const rows = React.useMemo(
    () =>
      events.filter((e) => {
        if (actor !== "all" && e.actorId !== actor) return false;
        if (area !== "all" && e.action !== area) return false;
        if (from || to) {
          const d = toDarDate(e.at);
          if (from && d < from) return false;
          if (to && d > to) return false;
        }
        return true;
      }),
    [events, actor, area, from, to],
  );

  const anyFilter = actor !== "all" || area !== "all" || from || to;
  const clear = () => {
    setActor("all");
    setArea("all");
    setFrom("");
    setTo("");
  };
  const who = (e: AuditEvent) => db.users[e.actorId]?.name ?? (e.actorId === "usr_system" ? "System" : "Unknown user");

  const columns: Column<AuditEvent>[] = [
    { key: "at", header: "When", sort: (e) => e.at, csv: (e) => fmtDateTime(e.at), width: "150px", cell: (e) => <span className="tnum whitespace-nowrap text-ink-2">{fmtDateTime(e.at)}</span> },
    {
      key: "actor",
      header: "Who",
      sort: (e) => who(e),
      csv: (e) => who(e),
      hideBelow: "md",
      cell: (e) => (
        <span className="flex items-center gap-2 whitespace-nowrap">
          <UserMark user={db.users[e.actorId]} size="xs" />
          <span className="text-ink-2">{who(e)}</span>
        </span>
      ),
    },
    {
      key: "action",
      header: "Action",
      sort: (e) => e.action,
      csv: (e) => e.action,
      hideBelow: "xl",
      cell: (e) => (
        <span className="block leading-tight whitespace-nowrap">
          <span className="block text-ink">{actionLabel(e.action)}</span>
          <span className="block text-xs text-ink-3">{entityLabel(e.entity)}</span>
        </span>
      ),
    },
    {
      key: "summary",
      header: "What happened",
      csv: (e) => e.summary,
      className: "min-w-[260px]",
      cell: (e) => (
        <span className="block leading-snug">
          <span className="text-ink">{e.summary}</span>
          <span className="mt-0.5 block text-xs text-ink-3 md:hidden">
            {who(e)} · {actionLabel(e.action)}
          </span>
        </span>
      ),
    },
    {
      key: "file",
      header: "Booking",
      sort: (e) => (e.fileId ? db.files[e.fileId]?.number : undefined),
      csv: (e) => (e.fileId ? db.files[e.fileId]?.number : ""),
      hideBelow: "sm",
      cell: (e) => {
        const f = e.fileId ? db.files[e.fileId] : undefined;
        return f ? (
          <Link href={`/bookings/${f.id}`} className="font-mono text-[13.5px] whitespace-nowrap text-link hover:underline">
            {f.number}
          </Link>
        ) : (
          <span className="text-ink-4">—</span>
        );
      },
    },
  ];

  return (
    <div>
      <TabHeading title="Audit log" description="Every change anyone made, with who and when. Nothing here can be edited or deleted." />
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(e) => e.id}
        search={(e) => [e.summary, who(e), e.action, e.entity, e.fileId ? db.files[e.fileId]?.number : ""].join(" ")}
        searchPlaceholder="Search what happened, who, file no."
        exportName="audit-log"
        initialSort={{ key: "at", dir: "desc" }}
        dense
        toolbar={
          <>
            <FilterSelect label="Who" value={actor} onChange={setActor} options={[{ value: "all", label: "Anyone" }, ...actors]} />
            <FilterSelect label="Action" value={area} onChange={setArea} options={[{ value: "all", label: "Any action" }, ...actions.map((a) => ({ value: a, label: actionLabel(a) }))]} />
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={cn((from || to) && FILTER_ON)}>
                  <CalendarRange />
                  {from || to ? `${from ? fmtDate(from) : "…"} – ${to ? fmtDate(to) : "…"}` : "Dates"}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-72 p-3">
                <div className="grid grid-cols-2 gap-2">
                  <Field label="From" htmlFor="au-from">
                    <Input id="au-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                  </Field>
                  <Field label="To" htmlFor="au-to">
                    <Input id="au-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
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
        empty={
          events.length === 0 ? (
            <EmptyState icon={ScrollText} title="Nothing recorded yet" body="Every change made in the back office appears here." />
          ) : (
            <EmptyState title="No events match" body="Widen the dates or clear the filters." action={anyFilter ? <Button variant="outline" size="sm" onClick={clear}>Clear filters</Button> : undefined} />
          )
        }
      />
    </div>
  );
}
