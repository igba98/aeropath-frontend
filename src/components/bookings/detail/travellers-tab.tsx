"use client";

import * as React from "react";
import { Pencil, UserMinus, UserPlus, UserRoundPlus } from "lucide-react";

import type { BookingFile, ID, Traveller } from "@/domain/types";
import { can } from "@/domain/permissions";
import { updateBookingFile } from "@/domain/commands";
import { useApp, useDispatch, useMe } from "@/store";
import { daysUntil, fmtDate } from "@/lib/dates";

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Combobox } from "@/components/shared/combobox";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shared/page";
import { StatusChip } from "@/components/shared/status-chip";
import { TravellerDialog } from "@/components/clients/traveller-form";

/** Travellers on the file with passport warnings (under 6 months from the return date) and quick edit. */
export function TravellersTab({ file, endDate }: { file: BookingFile; endDate?: string }) {
  const me = useMe();
  const db = useApp((s) => s.db)!;
  const dispatch = useDispatch();
  const [edit, setEdit] = React.useState<Traveller | "new" | null>(null);
  const [remove, setRemove] = React.useState<Traveller | null>(null);
  const canEdit = can(me, "traveller.edit");
  const canFile = can(me, "booking.edit");
  const travellers = file.travellerIds.map((id) => db.travellers[id]).filter(Boolean);
  const others = Object.values(db.travellers).filter((t) => t.clientId === file.clientId && !file.travellerIds.includes(t.id));
  const onIssued = (id: ID) => Object.values(db.lines).some((l) => l.fileId === file.id && l.travellerIds.includes(id) && ["issued", "completed", "refund_pending"].includes(l.status));

  const attach = (id: ID) => dispatch(updateBookingFile, { fileId: file.id, patch: { travellerIds: [...file.travellerIds, id] } }, { toast: "Traveller added to the booking" });

  const passport = (t: Traveller) => {
    if (!t.passportExpiry) return <span className="text-[13px] text-ink-4">No passport on file</span>;
    const ref = endDate ?? new Date().toISOString().slice(0, 10);
    const left = daysUntil(t.passportExpiry, new Date(ref + "T12:00:00Z"));
    return (
      <span className="flex flex-wrap items-center gap-1.5">
        <span className="font-mono whitespace-nowrap text-[13.5px]">{t.passportNumber ?? "—"}</span>
        <span className="tnum text-[13px] text-ink-3">exp {fmtDate(t.passportExpiry)}</span>
        {left < 0 ? (
          <StatusChip label="Expired before return" tone="red" size="xs" />
        ) : left < 183 ? (
          <StatusChip label="Under 6 months at return" tone="amber" size="xs" />
        ) : null}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {canFile && others.length > 0 && (
          <div className="w-full sm:w-72">
            <Combobox
              value={null}
              onChange={(id) => attach(id)}
              options={others.map((t) => ({ value: t.id, label: `${t.surname}/${t.givenName} ${t.title}`, hint: t.paxType }))}
              placeholder="Add a traveller from this client"
            />
          </div>
        )}
        {canEdit && canFile && (
          <Button variant="outline" onClick={() => setEdit("new")}>
            <UserRoundPlus /> New traveller
          </Button>
        )}
      </div>

      {travellers.length === 0 ? (
        <EmptyState icon={UserPlus} title="No travellers on this booking" body="Add the people travelling; names must match their passports." />
      ) : (
        <Table className="min-w-[640px]">
          <TableHeader>
            <TableRow className="rule-head border-0">
              <TableHead className="h-auto px-0 pb-2 whitespace-normal first:pl-0">Name as in passport</TableHead>
              <TableHead className="h-auto px-0 pb-2">Type</TableHead>
              <TableHead className="h-auto px-0 pb-2">Born</TableHead>
              <TableHead className="h-auto px-0 pb-2">Passport</TableHead>
              <TableHead className="h-auto px-0 pb-2 last:pr-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {travellers.map((t) => (
              <TableRow key={t.id}>
                <TableCell className="px-0 py-2.5 first:pl-0">
                  <span className="font-mono whitespace-nowrap text-[13.5px] font-semibold text-ink">
                    {t.surname}/{t.givenName} {t.title}
                  </span>
                  {t.nationality && <span className="ml-2 text-[13px] text-ink-3">{t.nationality}</span>}
                </TableCell>
                <TableCell className="px-0 py-2.5 text-ink-2">{{ ADT: "Adult", CHD: "Child", INF: "Infant" }[t.paxType]}</TableCell>
                <TableCell className="tnum px-0 py-2.5 text-ink-2">{t.dateOfBirth ? fmtDate(t.dateOfBirth) : "—"}</TableCell>
                <TableCell className="px-0 py-2.5">{passport(t)}</TableCell>
                <TableCell className="px-0 py-2.5 text-right whitespace-nowrap last:pr-0">
                  {canEdit && (
                    <Button variant="ghost" size="sm" onClick={() => setEdit(t)}>
                      <Pencil /> Edit
                    </Button>
                  )}
                  {canFile && (
                    <Button variant="ghost" size="sm" onClick={() => setRemove(t)} disabled={onIssued(t.id)} title={onIssued(t.id) ? "On an issued ticket" : undefined}>
                      <UserMinus /> Remove
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <TravellerDialog
        open={edit !== null}
        onOpenChange={(o) => !o && setEdit(null)}
        clientId={file.clientId}
        traveller={edit && edit !== "new" ? edit : undefined}
        onSaved={(id) => {
          if (edit === "new") attach(id);
        }}
      />
      <ConfirmDialog
        open={remove !== null}
        onOpenChange={(o) => !o && setRemove(null)}
        title="Remove from this booking?"
        description={remove ? `${remove.givenName} ${remove.surname} stays on the client's list; only this booking changes.` : undefined}
        confirmLabel="Remove traveller"
        onConfirm={() => (remove ? dispatch(updateBookingFile, { fileId: file.id, patch: { travellerIds: file.travellerIds.filter((x) => x !== remove.id) } }).ok : false)}
      />
    </div>
  );
}
