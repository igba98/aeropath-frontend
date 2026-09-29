"use client";

import * as React from "react";

import type { NumberSeries, Settings } from "@/domain/types";
import { can } from "@/domain/permissions";
import { previewNumber } from "@/domain/numbering";
import { NUMBER_SERIES } from "@/domain/defaults";
import { useApp, useMe } from "@/store";
import { useNow } from "@/lib/use-now";

import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SaveBar, TabHeading, useSettingsDraft } from "./settings-kit";

export const SERIES_LABEL: Record<NumberSeries, string> = {
  file: "Booking files",
  invoice: "Invoices",
  quote: "Quotes",
  receipt: "Receipts",
  refund_payout: "Refund payouts",
  refund_request: "Refund requests",
  supplier_payment: "Supplier payments",
  expense: "Expenses",
  journal: "Journal vouchers",
};

const PREFIX_RE = /^[A-Za-z0-9]{1,8}$/;

/** Settings → Numbering: prefix + padding per series with a live preview of the next number. */
export function NumberingTab() {
  const me = useMe();
  const counters = useApp((s) => s.db!.counters);
  const now = useNow();
  const canEdit = can(me, "settings.edit");
  const ro = !canEdit;
  const { draft, setDraft, dirty, discard, save } = useSettingsDraft((s) => s.numbering);
  const [error, setError] = React.useState<string | null>(null);

  const rowError = (series: NumberSeries): string | null => {
    const n = draft[series];
    if (!PREFIX_RE.test(n.prefix.trim())) return "Use 1 to 8 letters or digits.";
    if (!Number.isInteger(n.pad) || n.pad < 1 || n.pad > 10) return "Padding is 1 to 10 digits.";
    const clash = NUMBER_SERIES.find((o) => o !== series && draft[o].prefix.trim().toUpperCase() === n.prefix.trim().toUpperCase());
    if (clash) return `Same prefix as ${SERIES_LABEL[clash].toLowerCase()}. Numbers could be confused.`;
    return null;
  };
  const anyError = NUMBER_SERIES.some((s) => rowError(s));

  const set = (series: NumberSeries, patch: Partial<Settings["numbering"][NumberSeries]>) => setDraft((d) => ({ ...d, [series]: { ...d[series], ...patch } }));

  const onSave = () => {
    if (anyError) return setError("Fix the rows marked in red, then save.");
    const r = save({ numbering: Object.fromEntries(NUMBER_SERIES.map((s) => [s, { prefix: draft[s].prefix.trim().toUpperCase(), pad: draft[s].pad }])) as Settings["numbering"] });
    setError(r.ok ? null : r.error.message);
  };

  return (
    <div>
      <TabHeading title="Numbering" description="Format: prefix, year, then the running number padded with zeros. Counters carry on; only the look changes." viewOnly={ro} />
      <Table className="min-w-[520px]">
        <TableHeader>
          <TableRow className="rule-head border-0">
            <TableHead className="h-auto px-0 pb-2 first:pl-0">Series</TableHead>
            <TableHead className="h-auto w-32 px-0 pb-2">Prefix</TableHead>
            <TableHead className="h-auto w-24 px-0 pb-2 text-right">Digits</TableHead>
            <TableHead className="hidden h-auto px-0 pb-2 text-right sm:table-cell">Issued</TableHead>
            <TableHead className="h-auto pr-0 pb-2 pl-6 whitespace-normal last:pr-0">Next number</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {NUMBER_SERIES.map((series) => {
            const n = draft[series];
            const err = rowError(series);
            const preview = err ? "—" : previewNumber({ numbering: { ...draft, [series]: { prefix: n.prefix.trim().toUpperCase(), pad: n.pad } } }, counters, series, now);
            return (
              <TableRow key={series}>
                <TableCell className="px-0 py-2 pt-3.5 align-top text-ink first:pl-0">{SERIES_LABEL[series]}</TableCell>
                <TableCell className="px-0 py-2 align-top">
                  <Input
                    value={n.prefix}
                    readOnly={ro}
                    onChange={(e) => set(series, { prefix: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) })}
                    aria-label={`${SERIES_LABEL[series]} prefix`}
                    aria-invalid={Boolean(err) || undefined}
                    className="w-28 font-mono uppercase"
                  />
                </TableCell>
                <TableCell className="px-0 py-2 text-right align-top">
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={n.pad}
                    readOnly={ro}
                    onChange={(e) => set(series, { pad: Math.max(0, Math.min(10, Math.trunc(Number(e.target.value) || 0))) })}
                    aria-label={`${SERIES_LABEL[series]} digits`}
                    className="tnum ml-auto w-16 text-right"
                  />
                </TableCell>
                <TableCell className="tnum hidden px-0 py-2 pt-3.5 text-right align-top text-ink-3 sm:table-cell">{(counters[series] ?? 0).toLocaleString("en-US")}</TableCell>
                <TableCell className="py-2 pt-3.5 pr-0 pl-6 align-top last:pr-0">
                  <span className="font-mono whitespace-nowrap text-[13.5px] font-semibold text-ink">{preview}</span>
                  {err && <span className="mt-0.5 block text-[13px] text-[var(--st-red-fg)]">{err}</span>}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <p className="mt-3 text-[13px] text-ink-3">The year is the Dar es Salaam calendar year of the day the document is issued.</p>
      <SaveBar
        dirty={canEdit && dirty}
        error={error}
        onDiscard={() => {
          discard();
          setError(null);
        }}
        onSave={onSave}
      />
    </div>
  );
}
