"use client";

import * as React from "react";
import Link from "next/link";
import { BellRing, Send, SkipForward } from "lucide-react";
import { toast } from "sonner";

import { can } from "@/domain/permissions";
import { AUTO_RULES, AUTO_RULE_INFO, CHANNEL_LABELS, upcomingAutoMessages, type UpcomingAutoMessage } from "@/domain/comms";
import { useApp, useMe } from "@/store";
import { useNow } from "@/lib/use-now";
import { fmtDateTime, fmtRelative } from "@/lib/dates";

import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/page";
import { CHANNEL_ICON } from "./channel";
import { openComposer } from "./composer";
import { useSkipped } from "./skipped";

const DAYS = 7;

/** Automatic messages due in the next week. Staff can send one now by hand (the composer, prefilled) or skip it. */
export function UpcomingTab() {
  const me = useMe();
  const db = useApp((s) => s.db)!;
  const now = useNow();
  const skipped = useSkipped((s) => s.ids);
  const skip = useSkipped((s) => s.skip);
  const restore = useSkipped((s) => s.restore);
  const restoreAll = useSkipped((s) => s.restoreAll);
  const canSend = can(me, "comms.send");

  const all = React.useMemo(() => upcomingAutoMessages(db, now, { days: DAYS }), [db, now]);
  const rows = all.filter((m) => !skipped.includes(m.id));
  const hiddenCount = all.length - rows.length;
  const off = AUTO_RULES.filter((r) => !db.settings.comms.auto[r]?.enabled);

  const sendNow = (m: UpcomingAutoMessage) => openComposer({ clientId: m.clientId, fileId: m.fileId, channel: m.channels[0], template: m.template, attachments: m.attachments });
  const skipOne = (m: UpcomingAutoMessage) => {
    skip(m.id);
    toast(`Skipped: ${AUTO_RULE_INFO[m.rule].label.toLowerCase()} to ${db.clients[m.clientId]?.name ?? "the client"}`, {
      description: "It won’t be listed here again on this device.",
      action: { label: "Undo", onClick: () => restore(m.id) },
    });
  };

  const actions = (m: UpcomingAutoMessage) => (
    <>
      {canSend && (
        <Button variant="outline" size="sm" onClick={() => sendNow(m)}>
          <Send /> Send now
        </Button>
      )}
      <Button variant="ghost" size="sm" onClick={() => skipOne(m)} aria-label={`Skip the ${AUTO_RULE_INFO[m.rule].label.toLowerCase()} to ${db.clients[m.clientId]?.name ?? "the client"}`}>
        <SkipForward /> Skip
      </Button>
    </>
  );

  const columns: Column<UpcomingAutoMessage>[] = [
    {
      key: "when",
      header: "Goes out",
      mobile: "aside",
      sort: (m) => m.sendAt,
      csv: (m) => (m.dueNow ? "Due now" : fmtDateTime(m.sendAt)),
      cell: (m) =>
        m.dueNow ? (
          <span className="font-semibold whitespace-nowrap text-[var(--st-amber-fg)]">Due now</span>
        ) : (
          <span className="block leading-tight whitespace-nowrap">
            <span className="block font-medium text-ink">{fmtRelative(m.sendAt, now)}</span>
            <span className="tnum block text-[13px] font-normal text-ink-3">{fmtDateTime(m.sendAt)}</span>
          </span>
        ),
    },
    {
      key: "what",
      header: "Message",
      mobile: "title",
      sort: (m) => AUTO_RULE_INFO[m.rule].label,
      csv: (m) => `${AUTO_RULE_INFO[m.rule].label}: ${m.summary}`,
      cell: (m) => (
        <span className="block min-w-0 leading-tight">
          <span className="block font-medium text-ink">{AUTO_RULE_INFO[m.rule].label}</span>
          <span className="block max-w-[240px] truncate text-[13px] text-ink-3 xl:max-w-[260px] 2xl:max-w-[360px]">{m.summary}</span>
          {/* Phones: the actions ride on the card's lead line. */}
          <span className="mt-3 flex gap-2 lg:hidden">{actions(m)}</span>
        </span>
      ),
    },
    {
      key: "client",
      header: "Client and booking",
      hideBelow: "xl",
      sort: (m) => db.clients[m.clientId]?.name,
      csv: (m) => db.clients[m.clientId]?.name,
      csvHeader: "Client",
      cell: (m) => (
        <span className="block leading-tight">
          <Link href={`/clients/${m.clientId}`} className="block max-w-[170px] truncate text-ink hover:underline">
            {db.clients[m.clientId]?.name ?? "—"}
          </Link>
          <Link href={`/bookings/${m.fileId}`} className="font-mono text-[13px] whitespace-nowrap text-ink-3 hover:text-ink hover:underline">
            {db.files[m.fileId]?.number}
          </Link>
        </span>
      ),
    },
    { key: "booking", header: "Booking", hidden: true, csv: (m) => db.files[m.fileId]?.number, cell: () => null },
    {
      key: "channels",
      header: "By",
      hideBelow: "xl",
      csv: (m) => m.channels.map((c) => CHANNEL_LABELS[c]).join(" + "),
      cell: (m) => (
        <span className="inline-flex items-center gap-1.5 text-ink-3">
          {m.channels.map((c) => {
            const Icon = CHANNEL_ICON[c];
            return (
              <span key={c} title={CHANNEL_LABELS[c]} className="grid size-6 place-items-center rounded-md bg-canvas-2 text-ink-2">
                <Icon className="size-3.5" aria-hidden />
                <span className="sr-only">{CHANNEL_LABELS[c]}</span>
              </span>
            );
          })}
        </span>
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      mobile: false,
      align: "right",
      cell: (m) => <span className="flex justify-end gap-1">{actions(m)}</span>,
    },
  ];

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-3">
        What goes out on its own in the next {DAYS} days, from the rules under{" "}
        <Link href="/communications?tab=automatic" scroll={false} className="font-medium text-link hover:underline">
          Automatic messages
        </Link>
        . Send one now to add a personal word, or skip it.
        {off.length > 0 && <span className="mt-1 block">Off: {off.map((r) => AUTO_RULE_INFO[r].label.toLowerCase()).join(", ")}.</span>}
      </p>
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(m) => m.id}
        search={(m) => [AUTO_RULE_INFO[m.rule].label, m.summary, db.clients[m.clientId]?.name, db.files[m.fileId]?.number].filter(Boolean).join(" ")}
        searchPlaceholder="Search client, booking or flight"
        exportName="upcoming-automatic-messages"
        initialSort={{ key: "when", dir: "asc" }}
        toolbar={
          hiddenCount > 0 && (
            <Button variant="ghost" size="sm" onClick={restoreAll} className="text-ink-3">
              {hiddenCount} skipped · Show again
            </Button>
          )
        }
        empty={<EmptyState icon={BellRing} title={`Nothing due in the next ${DAYS} days`} body="Flight, payment and time-limit reminders show here as their dates come near." />}
      />
    </div>
  );
}
