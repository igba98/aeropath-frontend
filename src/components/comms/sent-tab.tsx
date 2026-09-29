"use client";

import * as React from "react";
import Link from "next/link";
import { Bot, MessagesSquare, Paperclip, Plus, X } from "lucide-react";

import type { ID, Message } from "@/domain/types";
import { can } from "@/domain/permissions";
import { CHANNEL_LABELS, TEMPLATE_LABELS } from "@/domain/comms";
import { toDarDate } from "@/domain/dates";
import { useApp, useMe } from "@/store";
import { fmtDateTime } from "@/lib/dates";

import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/page";
import { UserMark } from "@/components/shared/bits";
import { FilterSelect } from "@/components/shared/filter-select";
import { ResponsiveFilters } from "@/components/shared/responsive-filters";
import { DateRangeFilter } from "@/components/payments/date-range";
import { ChannelMark } from "./channel";
import { openComposer } from "./composer";

export interface MessageRow {
  id: ID;
  m: Message;
  at: string;
  clientName?: string;
  fileNumber?: string;
  byName?: string;
}

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

/** Every message sent to clients, newest first: by hand and automatic. A row opens its detail sheet. */
export function SentTab({ onOpen, openId }: { onOpen: (id: ID) => void; openId?: string | null }) {
  const me = useMe();
  const db = useApp((s) => s.db)!;
  const [channel, setChannel] = React.useState("all");
  const [client, setClient] = React.useState("all");
  const [kind, setKind] = React.useState("all");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");

  const rows: MessageRow[] = React.useMemo(
    () =>
      Object.values(db.messages ?? {})
        .map((m) => ({
          id: m.id,
          m,
          at: m.sentAt ?? m.createdAt,
          clientName: m.clientId ? db.clients[m.clientId]?.name : undefined,
          fileNumber: m.fileId ? db.files[m.fileId]?.number : undefined,
          byName: m.auto ? undefined : db.users[m.createdBy]?.name,
        }))
        .sort((a, b) => b.at.localeCompare(a.at)),
    [db.messages, db.clients, db.files, db.users],
  );

  const filtered = React.useMemo(
    () =>
      rows.filter((r) => {
        if (channel !== "all" && r.m.channel !== channel) return false;
        if (client !== "all" && r.m.clientId !== client) return false;
        if (kind !== "all" && (kind === "auto") !== r.m.auto) return false;
        const d = toDarDate(r.at);
        if (from && d < from) return false;
        if (to && d > to) return false;
        return true;
      }),
    [rows, channel, client, kind, from, to],
  );

  const clientOptions = React.useMemo(() => {
    const ids = [...new Set(rows.map((r) => r.m.clientId).filter(Boolean) as ID[])];
    return ids.map((id) => ({ value: id, label: db.clients[id]?.name ?? "Unknown client" })).sort((a, b) => a.label.localeCompare(b.label));
  }, [rows, db.clients]);

  const active = [channel !== "all", client !== "all", kind !== "all", Boolean(from || to)].filter(Boolean).length;
  const clear = () => {
    setChannel("all");
    setClient("all");
    setKind("all");
    setFrom("");
    setTo("");
  };

  const columns: Column<MessageRow>[] = [
    {
      key: "to",
      header: "To",
      mobile: "title",
      sort: (r) => r.m.toName ?? r.m.to,
      csv: (r) => r.m.toName ?? r.m.to,
      cell: (r) => (
        <span className="flex min-w-0 items-start gap-3 lg:items-center">
          <ChannelMark channel={r.m.channel} />
          <span className="min-w-0 leading-tight">
            <span className="block max-w-[150px] truncate font-medium text-ink xl:max-w-[170px]">{r.m.toName ?? r.m.to}</span>
            <span className="tnum block max-w-[150px] truncate text-[13px] text-ink-3 xl:max-w-[170px]">{r.m.toName ? r.m.to : CHANNEL_LABELS[r.m.channel]}</span>
            {/* Phones: the message itself, under the name. */}
            <span className="mt-2 line-clamp-2 text-sm leading-5 text-ink-2 lg:hidden">
              {r.m.subject && <span className="font-medium text-ink">{r.m.subject} · </span>}
              {oneLine(r.m.body)}
            </span>
          </span>
        </span>
      ),
    },
    { key: "channel", header: "Channel", hidden: true, csv: (r) => CHANNEL_LABELS[r.m.channel], cell: () => null },
    { key: "address", header: "Address", hidden: true, csv: (r) => r.m.to, cell: () => null },
    {
      key: "message",
      header: "Message",
      mobile: false,
      csv: (r) => r.m.subject ?? oneLine(r.m.body),
      cell: (r) => (
        <span className="flex min-w-0 items-center gap-2">
          <span className="block max-w-[200px] min-w-0 truncate text-ink-2 xl:max-w-[280px] 2xl:max-w-[340px]">
            {r.m.subject && <span className="font-medium text-ink">{r.m.subject} · </span>}
            {oneLine(r.m.body)}
          </span>
          {r.m.attachments.length > 0 && (
            <span className="tnum inline-flex shrink-0 items-center gap-0.5 text-[13px] text-ink-3" title={r.m.attachments.map((a) => a.label).join(", ")}>
              <Paperclip className="size-3.5" aria-hidden />
              {r.m.attachments.length}
              <span className="sr-only">{r.m.attachments.length === 1 ? "attachment" : "attachments"}</span>
            </span>
          )}
        </span>
      ),
    },
    {
      key: "client",
      header: "Client and booking",
      hideBelow: "xl",
      sort: (r) => r.clientName,
      csv: (r) => r.clientName,
      csvHeader: "Client",
      cell: (r) =>
        r.m.clientId && r.clientName ? (
          <span className="block leading-tight">
            <Link href={`/clients/${r.m.clientId}`} className="block max-w-[170px] truncate text-ink hover:underline">
              {r.clientName}
            </Link>
            {r.m.fileId && r.fileNumber && (
              <Link href={`/bookings/${r.m.fileId}`} className="font-mono text-[13px] whitespace-nowrap text-ink-3 hover:text-ink hover:underline">
                {r.fileNumber}
              </Link>
            )}
          </span>
        ) : (
          <span className="text-ink-4">—</span>
        ),
    },
    { key: "booking", header: "Booking", hidden: true, csv: (r) => r.fileNumber, cell: () => null },
    { key: "files", header: "Attachments", hidden: true, csv: (r) => r.m.attachments.length, cell: () => null },
    {
      key: "by",
      header: "Sent by",
      hideBelow: "2xl",
      sort: (r) => (r.m.auto ? "~" : r.byName),
      csv: (r) => (r.m.auto ? "Automatic" : r.byName),
      cell: (r) =>
        r.m.auto ? (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-ink-3">
            <Bot className="size-4" aria-hidden /> Automatic
          </span>
        ) : (
          <span className="inline-flex items-center gap-2 whitespace-nowrap text-ink-2">
            <UserMark user={db.users[r.m.createdBy]} size="xs" /> {r.byName?.split(" ")[0] ?? "—"}
          </span>
        ),
    },
    { key: "type", header: "Type", hidden: true, csv: (r) => (r.m.auto ? "Automatic" : "Manual"), cell: () => null },
    { key: "template", header: "Template", hidden: true, csv: (r) => (r.m.template ? TEMPLATE_LABELS[r.m.template] : ""), cell: () => null },
    {
      key: "when",
      header: "Sent",
      align: "right",
      mobile: "aside",
      sort: (r) => r.at,
      csv: (r) => fmtDateTime(r.at),
      cell: (r) => (
        <span className="inline-flex items-center justify-end gap-1.5 text-[13px] font-normal whitespace-nowrap text-ink-3">
          {r.m.auto && (
            <span title="Sent automatically" className="2xl:hidden">
              <Bot className="size-3.5" aria-hidden />
              <span className="sr-only">Sent automatically,</span>
            </span>
          )}
          <span className="tnum">{fmtDateTime(r.at)}</span>
        </span>
      ),
    },
  ];

  return (
    <DataTable
      rows={filtered}
      columns={columns}
      rowKey={(r) => r.id}
      onRowClick={(r) => onOpen(r.id)}
      selectedKey={openId ?? undefined}
      search={(r) => [r.m.toName, r.m.to, r.m.subject, r.m.body, r.clientName, r.fileNumber, CHANNEL_LABELS[r.m.channel]].filter(Boolean).join(" ")}
      searchPlaceholder="Search name, number, booking or text"
      exportName="messages"
      initialSort={{ key: "when", dir: "desc" }}
      toolbar={
        <ResponsiveFilters active={active} onClear={clear}>
          <FilterSelect
            label="Channel"
            value={channel}
            onChange={setChannel}
            options={[
              { value: "all", label: "All channels" },
              { value: "sms", label: "SMS" },
              { value: "whatsapp", label: "WhatsApp" },
              { value: "email", label: "Email" },
            ]}
          />
          <FilterSelect label="Client" value={client} onChange={setClient} options={[{ value: "all", label: "All clients" }, ...clientOptions]} />
          <FilterSelect
            label="Sent by"
            value={kind}
            onChange={setKind}
            options={[
              { value: "all", label: "By hand and automatic" },
              { value: "manual", label: "By hand" },
              { value: "auto", label: "Automatic" },
            ]}
          />
          <DateRangeFilter from={from} to={to} onChange={(f, t) => (setFrom(f), setTo(t))} idPrefix="msg" />
          {active > 0 && (
            <Button variant="ghost" size="sm" onClick={clear} className="hidden lg:inline-flex">
              <X /> Clear filters
            </Button>
          )}
        </ResponsiveFilters>
      }
      empty={
        rows.length === 0 ? (
          <EmptyState
            icon={MessagesSquare}
            title="No messages yet"
            body="Messages to clients by SMS, WhatsApp and email appear here, with the automatic confirmations and reminders."
            action={
              can(me, "comms.send") && (
                <Button onClick={() => openComposer()}>
                  <Plus /> New message
                </Button>
              )
            }
          />
        ) : (
          <EmptyState
            icon={MessagesSquare}
            title="No messages match these filters"
            action={
              <Button variant="outline" onClick={clear}>
                Clear filters
              </Button>
            }
          />
        )
      }
    />
  );
}
