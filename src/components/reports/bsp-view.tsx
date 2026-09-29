"use client";

import * as React from "react";
import { FileUp, X } from "lucide-react";

import type { Money } from "@/domain/types";
import { bspPeriodReport, matchBspBilling, type BspMatchRow, type BspRow, type ReportDef } from "@/domain/selectors/reports";
import { useApp } from "@/store";
import { fmtDate } from "@/lib/dates";

import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState, QuickTabs, Section } from "@/components/shared/page";
import { StatusChip, type Tone } from "@/components/shared/status-chip";
import { Amount } from "@/components/shared/amount";
import { FileNo, Mono, moneyCol, Totals } from "./cells";
import { ReportFrame, usePageSize } from "./report-frame";
import type { ReportState } from "./use-report-params";

const EVENT: Record<BspRow["event"], { label: string; tone: Tone }> = {
  issued: { label: "Issued", tone: "green" },
  voided: { label: "Voided", tone: "grey" },
  refunded: { label: "Refunded", tone: "violet" },
};

const MATCH: Record<BspMatchRow["status"], { label: string; tone: Tone }> = {
  match: { label: "Matches", tone: "green" },
  amount_mismatch: { label: "Amount differs", tone: "red" },
  missing_in_ours: { label: "Not in our records", tone: "amber" },
  missing_in_billing: { label: "Not billed", tone: "amber" },
};

type EventFilter = "all" | BspRow["event"];

export function BspPeriodView({ def, state }: { def: ReportDef; state: ReportState }) {
  const db = useApp((s) => s.db)!;
  const pageSize = usePageSize();
  const [event, setEvent] = React.useState<EventFilter>("all");
  const r = React.useMemo(() => bspPeriodReport(db, state.params), [db, state.params]);
  const c = r.currency;
  const rows = event === "all" ? r.rows : r.rows.filter((x) => x.event === event);
  const count = (e: BspRow["event"]) => r.rows.filter((x) => x.event === e).length;

  const columns: Column<BspRow>[] = [
    {
      key: "at",
      header: "Date",
      sort: (x) => x.at,
      csv: (x) => x.at.slice(0, 10),
      cell: (x) => <span className="tnum whitespace-nowrap">{fmtDate(x.at)}</span>,
    },
    {
      key: "ticket",
      header: "Ticket",
      sort: (x) => x.ticketNumber,
      csv: (x) => x.ticketNumber,
      cell: (x) => <Mono className="font-semibold">{x.ticketNumber}</Mono>,
    },
    {
      key: "event",
      header: "Event",
      sort: (x) => x.event,
      csv: (x) => x.event,
      cell: (x) => <StatusChip label={EVENT[x.event].label} tone={EVENT[x.event].tone} size="xs" />,
    },
    {
      key: "pax",
      header: "Passenger",
      sort: (x) => x.passenger,
      csv: (x) => x.passenger,
      hideBelow: "md",
      cell: (x) => (
        <span className="block leading-tight">
          <span className="block truncate text-ink">{x.passenger}</span>
          <span className="block text-xs text-ink-3">
            <Mono className="text-xs text-ink-3">{x.carrier}</Mono> · <Mono className="text-xs text-ink-3">{x.recordLocator}</Mono>
          </span>
        </span>
      ),
    },
    {
      key: "file",
      header: "File no.",
      sort: (x) => x.file.number,
      csv: (x) => x.file.number,
      hideBelow: "xl",
      cell: (x) => <FileNo id={x.file.id} number={x.file.number} />,
    },
    moneyCol<BspRow>("fare", "Fare", (x) => x.fare, {
      hideBelow: "sm",
      tone: "auto",
      mixed: true,
      rate: db.settings.fx.USD_TZS,
    }),
    moneyCol<BspRow>("commission", "Commission", (x) => x.commission, {
      hideBelow: "xl",
      tone: "auto",
      mixed: true,
      rate: db.settings.fx.USD_TZS,
    }),
    moneyCol<BspRow>("net", "Net", (x) => x.net, {
      tone: "auto",
      mixed: true,
      rate: db.settings.fx.USD_TZS,
    }),
  ];

  return (
    <ReportFrame def={def} state={state} result={r}>
      <Section
        id="bsp-rows"
        title="Ticket documents"
        count={rows.length}
        description={r.supplierName ? `Tickets settled through ${r.supplierName}. Voids and refunds are negative.` : "All flight tickets. Voids and refunds are negative."}
        actions={
          <QuickTabs<EventFilter>
            controls="bsp-rows"
            value={event}
            onChange={setEvent}
            className="no-print"
            options={[
              { value: "all", label: "All", count: r.rows.length },
              { value: "issued", label: "Issued", count: count("issued") },
              { value: "voided", label: "Voided", count: count("voided") },
              {
                value: "refunded",
                label: "Refunded",
                count: count("refunded"),
              },
            ]}
          />
        }
      >
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(x) => x.id}
          search={(x) => [x.ticketNumber, x.passenger, x.recordLocator, x.file.number, x.carrier].join(" ")}
          searchPlaceholder="Search ticket, passenger, PNR"
          exportName="air-settlement-period"
          initialSort={{ key: "at", dir: "asc" }}
          pageSize={pageSize}
          dense
          empty={<EmptyState title="No tickets issued, voided or refunded in this period" />}
          footer={rows.length && r.totals ? <Totals columns={columns} label={`Net to settle (${c})`} values={{ net: <Amount value={r.totals.net} /> }} /> : undefined}
        />
      </Section>
      <BillingMatch rows={r.rows} />
    </ReportFrame>
  );
}

/** Stretch: upload the BSP billing CSV (ticket number, amount) and match it against the period by ticket number. */
function BillingMatch({ rows }: { rows: BspRow[] }) {
  const pageSize = usePageSize();
  const [file, setFile] = React.useState<{ name: string; text: string } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const matches = React.useMemo(() => (file ? matchBspBilling(rows, file.text) : []), [rows, file]);
  const n = (s: BspMatchRow["status"]) => matches.filter((m) => m.status === s).length;

  const onFile = async (f?: File) => {
    if (!f) return;
    const text = await f.text();
    const found = matchBspBilling([], text).length;
    if (!found) {
      setError(`${f.name} has no rows we can read. Each line needs a 13-digit ticket number and an amount, e.g. 176-2401234567,1450.00.`);
      setFile(null);
      return;
    }
    setError(null);
    setFile({ name: f.name, text });
  };

  const columns: Column<BspMatchRow>[] = [
    {
      key: "ticket",
      header: "Ticket",
      sort: (m) => m.ticketNumber,
      csv: (m) => m.ticketNumber,
      cell: (m) => <Mono className="font-semibold">{m.ticketNumber}</Mono>,
    },
    {
      key: "status",
      header: "Result",
      sort: (m) => m.status,
      csv: (m) => MATCH[m.status].label,
      cell: (m) => <StatusChip label={MATCH[m.status].label} tone={MATCH[m.status].tone} size="xs" />,
    },
    moneyCol<BspMatchRow>("ours", "Our net", (m) => m.ours, { mixed: true }),
    {
      key: "theirs",
      header: "Billed",
      align: "right",
      sort: (m) => m.theirs,
      csv: (m) => m.theirs ?? "",
      cell: (m) =>
        m.theirs === undefined ? (
          <span className="text-ink-4">—</span>
        ) : (
          <Amount
            value={{
              amountMinor: Math.round(m.theirs * 100),
              currency: (m.ours?.currency ?? "USD") as Money["currency"],
            }}
          />
        ),
    },
  ];

  return (
    <Section
      title="Match a billing file"
      description="Upload the BSP or consolidator billing CSV (ticket number, amount per line). Tickets are matched by number; mismatches are listed first."
      actions={
        <div className="no-print flex items-center gap-2">
          <input ref={inputRef} type="file" accept=".csv,text/csv,text/plain" className="sr-only" aria-label="Billing CSV file" onChange={(e) => onFile(e.target.files?.[0])} />
          {file && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setFile(null);
                if (inputRef.current) inputRef.current.value = "";
              }}
            >
              <X /> Clear
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
            <FileUp /> {file ? "Upload another" : "Upload billing CSV"}
          </Button>
        </div>
      }
    >
      {error && (
        <p className="mb-3 text-sm text-[var(--st-red-fg)]" role="alert">
          {error}
        </p>
      )}
      {file ? (
        <>
          <p className="mb-3 text-sm text-ink-2">
            <span className="font-medium text-ink">{file.name}</span>: <span className="tnum">{n("match")}</span> match, <span className="tnum">{n("amount_mismatch")}</span> with a different amount,{" "}
            <span className="tnum">{n("missing_in_ours")}</span> not in our records, <span className="tnum">{n("missing_in_billing")}</span> not billed.
          </p>
          <DataTable
            rows={matches}
            columns={columns}
            rowKey={(m) => m.ticketNumber}
            exportName="billing-match"
            pageSize={pageSize}
            dense
            search={(m) => m.ticketNumber}
            searchPlaceholder="Search ticket"
          />
        </>
      ) : (
        !error && <p className="border-y border-rule py-4 text-sm text-ink-3">No billing file loaded. Nothing is uploaded to a server; the file is read in this browser only.</p>
      )}
    </Section>
  );
}
