"use client";

import * as React from "react";
import { Suspense } from "react";
import { Plus, Users, X } from "lucide-react";

import type { ClientSource } from "@/domain/types";
import { can } from "@/domain/permissions";
import { convert } from "@/domain/money";
import { useApp, useMe, useUi } from "@/store";
import { useModals } from "@/store/modals";
import { useNow } from "@/lib/use-now";
import { sumIn } from "@/lib/view-models";
import { fmtDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState, PageHeader, QuickTabs, useSetParam, useTab } from "@/components/shared/page";
import { StatusChip } from "@/components/shared/status-chip";
import { Amount } from "@/components/shared/amount";
import { FilterSelect } from "@/components/shared/filter-select";
import { CLIENT_SOURCES, clientTypeLabel } from "@/components/clients/client-options";
import { CorporateTag } from "@/components/clients/client-bits";
import { balanceChip, clientRows, type ClientRow } from "@/components/clients/client-rows";

type View = "all" | "individual" | "corporate" | "owing";

export default function ClientsPage() {
  return (
    <Suspense>
      <Clients />
    </Suspense>
  );
}

function Clients() {
  const me = useMe();
  const db = useApp((s) => s.db)!;
  const now = useNow();
  const displayCur = useUi((s) => s.displayCurrency);
  const rate = db.settings.fx.USD_TZS;
  const view = useTab("all", "view") as View;
  const setParam = useSetParam();
  const [archived, setArchived] = React.useState("active");
  const [source, setSource] = React.useState("all");
  const openClient = useModals((s) => s.openClient);

  const rows = React.useMemo(() => clientRows(db, now), [db, now]);
  const filtered = React.useMemo(
    () =>
      rows.filter((r) => {
        if (archived !== "all" && r.client.archived !== (archived === "archived")) return false;
        if (source !== "all" && r.client.source !== source) return false;
        return true;
      }),
    [rows, archived, source],
  );
  const inView = (r: ClientRow, v: View) => (v === "all" ? true : v === "owing" ? r.state === "owing" : r.client.type === v);
  const counts = React.useMemo(() => {
    const c = {} as Record<View, number>;
    (["all", "individual", "corporate", "owing"] as View[]).forEach((v) => (c[v] = filtered.filter((r) => inView(r, v)).length));
    return c;
  }, [filtered]);
  const visible = filtered.filter((r) => inView(r, view));
  const owed = sumIn(
    visible.filter((r) => r.state === "owing").map((r) => r.bal.balance),
    displayCur,
    rate,
  );
  const mixed = visible.some((r) => r.state === "owing" && r.bal.currency !== displayCur);
  const anyFilter = archived !== "active" || source !== "all";
  const tzs = (r: ClientRow) => convert(r.bal.balance, "TZS", rate).amountMinor;

  const columns: Column<ClientRow>[] = [
    {
      key: "name",
      header: "Name",
      sort: (r) => r.client.name.toLowerCase(),
      csv: (r) => r.client.name,
      cell: (r) => (
        <span className="block max-w-[280px] leading-tight">
          <span className="flex items-center gap-1.5">
            <span className={cn("truncate font-medium text-ink", r.client.archived && "text-ink-3")}>{r.client.name}</span>
            {r.client.type === "corporate" && <CorporateTag />}
            {r.client.archived && <StatusChip label="Archived" tone="grey" size="xs" />}
          </span>
          {(r.client.contactPerson || r.client.email) && <span className="block truncate text-xs text-ink-3">{r.client.contactPerson || r.client.email}</span>}
        </span>
      ),
    },
    {
      key: "type",
      header: "Type",
      sort: (r) => r.client.type,
      csv: (r) => clientTypeLabel(r.client.type),
      hideBelow: "xl",
      cell: (r) => <span className="text-ink-2">{clientTypeLabel(r.client.type)}</span>,
    },
    {
      key: "sector",
      header: "Sector",
      sort: (r) => r.client.sector?.toLowerCase(),
      csv: (r) => r.client.sector ?? "",
      hideBelow: "xl",
      cell: (r) => (r.client.sector ? <span className="block max-w-[180px] truncate text-ink-2">{r.client.sector}</span> : <span className="text-ink-4">—</span>),
    },
    {
      key: "phone",
      header: "Phone",
      csv: (r) => r.client.phone,
      hideBelow: "sm",
      cell: (r) => <span className="tnum whitespace-nowrap text-ink-2">{r.client.phone}</span>,
    },
    {
      key: "bookings",
      header: "Bookings",
      align: "right",
      sort: (r) => r.bookings,
      csv: (r) => r.bookings,
      hideBelow: "md",
      cell: (r) => <span className={cn(r.bookings === 0 && "text-ink-4")}>{r.bookings}</span>,
    },
    {
      key: "last",
      header: "Last booking",
      sort: (r) => r.lastFile?.createdAt,
      csv: (r) => (r.lastFile ? `${r.lastFile.number} ${fmtDate(r.lastFile.createdAt)}` : ""),
      hideBelow: "xl",
      cell: (r) =>
        r.lastFile ? (
          <span className="block leading-tight">
            <span className="tnum block text-ink-2">{fmtDate(r.lastFile.createdAt)}</span>
            <span className="block font-mono whitespace-nowrap text-xs text-ink-3">{r.lastFile.number}</span>
          </span>
        ) : (
          <span className="text-ink-4">None yet</span>
        ),
    },
    {
      key: "balance",
      header: "Balance",
      align: "right",
      sort: tzs,
      csv: (r) => `${r.bal.balance.currency} ${(r.bal.balance.amountMinor / 100).toFixed(2)}`,
      cell: (r) => {
        const chip = balanceChip(r.bal);
        return (
          <span className="flex flex-col items-end gap-1">
            <Amount value={r.bal.balance} tone="balance" className={cn(r.state === "settled" && "text-ink-4")} />
            <StatusChip status={chip.status} label={chip.label} size="xs" />
          </span>
        );
      },
    },
  ];

  const clear = () => {
    setArchived("active");
    setSource("all");
  };

  return (
    <>
      <PageHeader
        title="Clients"
        meta={
          <>
            <span className="tnum">{rows.filter((r) => !r.client.archived).length} active clients</span>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1">
              Owed in view <Amount value={owed} className="font-medium text-ink" />
            </span>
            {mixed && <span className="text-ink-4">converted at 1 USD = TZS {rate.toLocaleString("en-US")}</span>}
          </>
        }
        actions={
          can(me, "client.create") && (
            <Button onClick={() => openClient()}>
              <Plus /> New client
            </Button>
          )
        }
      />

      <QuickTabs<View>
        controls="clients-list"
        value={view}
        onChange={(v) => setParam("view", v === "all" ? null : v)}
        options={[
          { value: "all", label: "All", count: counts.all },
          {
            value: "individual",
            label: "Individuals",
            count: counts.individual,
          },
          { value: "corporate", label: "Organisations", count: counts.corporate },
          { value: "owing", label: "Owing", count: counts.owing },
        ]}
        className="mb-4"
      />

      <DataTable
        id="clients-list"
        rows={visible}
        columns={columns}
        rowKey={(r) => r.id}
        rowHref={(r) => `/clients/${r.id}`}
        search={(r) =>
          [r.client.name, r.client.phone, r.client.phone.replace(/^\+255/, "0"), r.client.email, r.client.contactPerson, r.client.tin, r.client.sector, r.client.registrationNumber, ...(r.client.contacts ?? []).map((k) => k.name)]
            .filter(Boolean)
            .join(" ")
        }
        searchPlaceholder="Search name, phone, email, TIN, sector"
        exportName="clients"
        initialSort={{ key: "name", dir: "asc" }}
        toolbar={
          <>
            <FilterSelect
              label="Show"
              value={archived}
              unset="active"
              onChange={setArchived}
              options={[
                { value: "active", label: "Active clients" },
                { value: "archived", label: "Archived" },
                { value: "all", label: "Active and archived" },
              ]}
            />
            <FilterSelect label="Source" value={source} onChange={(v) => setSource(v as ClientSource | "all")} options={[{ value: "all", label: "Any source" }, ...CLIENT_SOURCES]} />
            {anyFilter && (
              <Button variant="ghost" size="sm" onClick={clear}>
                <X /> Clear filters
              </Button>
            )}
          </>
        }
        empty={
          rows.length === 0 ? (
            <EmptyState
              icon={Users}
              title="No clients yet"
              body="Add the first client with a name and phone number; travellers can follow."
              action={
                can(me, "client.create") && (
                  <Button onClick={() => openClient()}>
                    <Plus /> Add the first client
                  </Button>
                )
              }
            />
          ) : (
            <EmptyState
              title="No clients in this view"
              body="Try another tab or clear the filters."
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
    </>
  );
}
