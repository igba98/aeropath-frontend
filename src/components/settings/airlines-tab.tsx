"use client";

import * as React from "react";
import { Plus, RotateCcw, Trash2 } from "lucide-react";

import type { AirlineRef } from "@/domain/types";
import { can } from "@/domain/permissions";
import { AIRLINES } from "@/store/seed/reference";
import { useMe } from "@/store";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SaveBar, TabHeading, useSettingsDraft } from "./settings-kit";

type Row = AirlineRef & { key: string };

let seq = 0;
const stripKey = (r: Row): AirlineRef => (r.ticketPrefix ? { code: r.code, name: r.name, ticketPrefix: r.ticketPrefix } : { code: r.code, name: r.name });
const withKeys = (list: AirlineRef[]): Row[] => list.map((a) => ({ ...a, key: `r${seq++}` }));

function rowErrors(rows: Row[], i: number): { code?: string; name?: string; prefix?: string } {
  const r = rows[i];
  const e: { code?: string; name?: string; prefix?: string } = {};
  if (!/^[A-Z0-9]{2}$/.test(r.code)) e.code = "2 letters or digits, e.g. EK.";
  else if (rows.some((o, j) => j !== i && o.code === r.code)) e.code = `${r.code} is listed twice.`;
  if (!r.name.trim()) e.name = "Enter the airline name.";
  if (r.ticketPrefix && !/^\d{3}$/.test(r.ticketPrefix)) e.prefix = "3 digits, or blank.";
  return e;
}

/** Settings → Airlines: code, name and 3-digit ticket prefix (blank where unconfirmed). */
export function AirlinesTab() {
  const me = useMe();
  const canEdit = can(me, "settings.edit");
  const ro = !canEdit;
  const { draft, setDraft, dirty, discard, save } = useSettingsDraft((s) => s.airlines);
  const [rows, setRows] = React.useState<Row[]>(() => withKeys(draft));
  const [error, setError] = React.useState<string | null>(null);
  const [touched, setTouched] = React.useState(false);

  // Rows carry React keys; the draft is the plain list.
  const [synced, setSynced] = React.useState(draft);
  if (synced !== draft) {
    setSynced(draft);
    const plain = rows.map(stripKey);
    if (JSON.stringify(plain) !== JSON.stringify(draft)) setRows(withKeys(draft));
  }

  const update = (next: Row[]) => {
    setRows(next);
    setDraft(next.map(stripKey));
  };
  const setAt = (i: number, patch: Partial<AirlineRef>) => update(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const errs = rows.map((_, i) => rowErrors(rows, i));
  const invalid = errs.some((e) => e.code || e.name || e.prefix);
  const missingPrefix = rows.filter((r) => !r.ticketPrefix).length;

  const onSave = () => {
    setTouched(true);
    if (invalid) return setError("Fix the rows marked in red, then save.");
    const airlines = rows.map((r) => {
      const a: AirlineRef = { code: r.code, name: r.name.trim() };
      if (r.ticketPrefix) a.ticketPrefix = r.ticketPrefix;
      return a;
    });
    const res = save({ airlines });
    setError(res.ok ? null : res.error.message);
    if (res.ok) setTouched(false);
  };

  return (
    <div>
      <TabHeading
        title="Airlines"
        description="Used to name carriers and to recognise ticket numbers in pasted PNRs. Leave the prefix blank until it is confirmed."
        viewOnly={ro}
        actions={
          canEdit && (
            <>
              <Button variant="outline" size="sm" onClick={() => update([...rows, ...withKeys([{ code: "", name: "" }])])}>
                <Plus /> Add airline
              </Button>
            </>
          )
        }
      />
      <Table className="min-w-[480px]">
        <TableHeader>
          <TableRow className="rule-head border-0">
            <TableHead className="h-auto w-24 px-0 pb-2 first:pl-0">Code</TableHead>
            <TableHead className="h-auto px-0 pb-2">Name</TableHead>
            <TableHead className="h-auto w-32 px-0 pb-2 whitespace-normal last:pr-0">Ticket prefix</TableHead>
            {canEdit && <TableHead className="h-auto w-10 px-0 pb-2 last:pr-0" aria-label="Remove" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => {
            const e = touched || r.code || r.name ? errs[i] : {};
            return (
              <TableRow key={r.key}>
                <TableCell className="py-1.5 pr-3 pl-0 align-top first:pl-0">
                  <Input value={r.code} readOnly={ro} maxLength={2} onChange={(ev) => setAt(i, { code: ev.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} aria-label="Airline code" aria-invalid={Boolean(e.code) || undefined} className="w-16 font-mono uppercase" />
                  {e.code && <span className="mt-1 block text-[13px] text-[var(--st-red-fg)]">{e.code}</span>}
                </TableCell>
                <TableCell className="py-1.5 pr-3 pl-0 align-top">
                  <Input value={r.name} readOnly={ro} onChange={(ev) => setAt(i, { name: ev.target.value })} aria-label="Airline name" aria-invalid={Boolean(e.name) || undefined} />
                  {e.name && <span className="mt-1 block text-[13px] text-[var(--st-red-fg)]">{e.name}</span>}
                </TableCell>
                <TableCell className="py-1.5 pr-3 pl-0 align-top last:pr-3">
                  <Input value={r.ticketPrefix ?? ""} readOnly={ro} maxLength={3} inputMode="numeric" placeholder="—" onChange={(ev) => setAt(i, { ticketPrefix: ev.target.value.replace(/\D/g, "") || undefined })} aria-label="Ticket prefix" aria-invalid={Boolean(e.prefix) || undefined} className="w-20 font-mono" />
                  {e.prefix && <span className="mt-1 block text-[13px] text-[var(--st-red-fg)]">{e.prefix}</span>}
                </TableCell>
                {canEdit && (
                  <TableCell className="px-0 py-1.5 text-right align-top last:pr-0">
                    <Button variant="ghost" size="icon-sm" onClick={() => update(rows.filter((_, j) => j !== i))} aria-label={`Remove ${r.name || r.code || "row"}`}>
                      <Trash2 />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            );
          })}
          {!rows.length && (
            <TableRow>
              <TableCell colSpan={4} className="px-0 py-10 text-center text-sm text-ink-3 first:pl-0 last:pr-0">
                No airlines listed. {canEdit && "Add them one by one or restore the standard list."}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[13px] text-ink-3">
        <span className="tnum">
          {rows.length} airlines · {missingPrefix} without a ticket prefix
        </span>
        {canEdit && (
          <Button variant="ghost" size="sm" onClick={() => update(withKeys(AIRLINES))}>
            <RotateCcw /> Restore the standard list
          </Button>
        )}
      </div>
      <SaveBar
        dirty={canEdit && dirty}
        error={error}
        onDiscard={() => {
          discard();
          setError(null);
          setTouched(false);
        }}
        onSave={onSave}
      />
    </div>
  );
}
