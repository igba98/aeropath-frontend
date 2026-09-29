"use client";

import * as React from "react";
import { Pencil, Trash2, UserPlus } from "lucide-react";

import type { Client, ID, Title, Traveller } from "@/domain/types";
import { can } from "@/domain/permissions";
import { removeTraveller, upsertTraveller } from "@/domain/commands";
import { normaliseName, TRAVELLER_NAME_RE } from "@/domain/validation";
import { travellerDisplayName } from "@/domain/describe";
import { WAS_ISSUED_STATUSES } from "@/domain/status/line-statuses";
import { useApp, useDispatch, useMe } from "@/store";
import { useNow } from "@/lib/use-now";
import { fmtDate } from "@/lib/dates";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/shared/field";
import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState, Section } from "@/components/shared/page";
import { ConfirmDialog, Consequences } from "@/components/shared/confirm-dialog";
import { TravellerDialog } from "./traveller-form";
import { PassportChip } from "./client-bits";
import { SelectField } from "./client-inputs";

const PAX: Record<Traveller["paxType"], string> = { ADT: "Adult", CHD: "Child", INF: "Infant" };

/**
 * Travellers of a client: names as in the passport, passport validity flags; add/edit/remove.
 * An organisation's travellers are its employees, with a quick-add row for names only.
 */
export function TravellersSection({ client }: { client: Client }) {
  const me = useMe();
  const db = useApp((s) => s.db)!;
  const dispatch = useDispatch();
  const now = useNow();
  const editable = can(me, "traveller.edit");
  const org = client.type === "corporate";
  const [dialog, setDialog] = React.useState<{ open: boolean; traveller?: Traveller }>({ open: false });
  const [removing, setRemoving] = React.useState<Traveller | null>(null);

  const travellers = Object.values(db.travellers)
    .filter((t) => t.clientId === client.id)
    .sort((a, b) => a.surname.localeCompare(b.surname) || a.givenName.localeCompare(b.givenName));

  const usage = (t: Traveller) => {
    const lines = Object.values(db.lines).filter((l) => l.travellerIds.includes(t.id));
    const issued = lines.find((l) => WAS_ISSUED_STATUSES.includes(l.status));
    const files = new Set(lines.map((l) => l.fileId));
    for (const f of Object.values(db.files)) if (f.travellerIds.includes(t.id)) files.add(f.id);
    return { issued, files: files.size, lines: lines.length };
  };

  const columns: Column<Traveller>[] = [
    {
      key: "name",
      header: "Name as in passport",
      sort: (t) => `${t.surname} ${t.givenName}`,
      cell: (t) => (
        <span className="block leading-tight">
          <span className="block font-medium tracking-[0.01em] text-ink uppercase">{travellerDisplayName(t)}</span>
          {t.nationality && <span className="block text-xs text-ink-3">Nationality {t.nationality}</span>}
        </span>
      ),
    },
    { key: "type", header: "Type", sort: (t) => t.paxType, hideBelow: "sm", cell: (t) => <span className="text-ink-2">{PAX[t.paxType]}</span> },
    { key: "dob", header: "Date of birth", sort: (t) => t.dateOfBirth, hideBelow: "md", cell: (t) => <span className="tnum text-ink-2">{fmtDate(t.dateOfBirth)}</span> },
    {
      key: "passport",
      header: "Passport",
      sort: (t) => t.passportExpiry,
      cell: (t) =>
        t.passportNumber ? (
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-mono whitespace-nowrap text-[13.5px] text-ink">{t.passportNumber}</span>
            <span className="tnum text-[13px] text-ink-3">exp. {fmtDate(t.passportExpiry)}</span>
            <PassportChip expiry={t.passportExpiry} now={now} />
          </span>
        ) : (
          <span className="text-[13px] text-ink-4">Not recorded</span>
        ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      cell: (t) =>
        editable ? (
          <span className="inline-flex gap-0.5">
            <Button variant="ghost" size="icon-sm" aria-label={`Edit ${travellerDisplayName(t)}`} onClick={() => setDialog({ open: true, traveller: t })}>
              <Pencil />
            </Button>
            {!usage(t).issued && (
              <Button variant="ghost" size="icon-sm" aria-label={`Remove ${travellerDisplayName(t)}`} onClick={() => setRemoving(t)}>
                <Trash2 />
              </Button>
            )}
          </span>
        ) : null,
    },
  ];

  const r = removing ? usage(removing) : null;

  return (
    <Section
      title={org ? "Employees and travellers" : "Travellers"}
      description={org ? "Staff who fly on the organisation's account. Pick them as travellers when booking." : undefined}
      count={travellers.length}
      actions={
        editable && (
          <Button variant="outline" size="sm" onClick={() => setDialog({ open: true })}>
            <UserPlus /> {org ? "Add with passport" : "Add traveller"}
          </Button>
        )
      }
    >
      {org && editable && <QuickAddTraveller clientId={client.id} />}
      <DataTable
        rows={travellers}
        columns={columns}
        rowKey={(t) => t.id}
        onRowClick={editable ? (t) => setDialog({ open: true, traveller: t }) : undefined}
        initialSort={{ key: "name", dir: "asc" }}
        dense
        empty={
          <EmptyState
            title={org ? "No employees yet" : "No travellers yet"}
            body={org ? "Add the staff who fly, with names exactly as in their passports." : "Add the people who fly, with names exactly as in their passports."}
            action={
              editable && (
                <Button size="sm" onClick={() => setDialog({ open: true })}>
                  <UserPlus /> {org ? "Add with passport" : "Add traveller"}
                </Button>
              )
            }
          />
        }
      />

      {editable && travellers.some((t) => usage(t).issued) && <p className="mt-2 text-xs text-ink-3">Travellers on issued tickets cannot be removed; tickets and history refer to them.</p>}

      <TravellerDialog open={dialog.open} onOpenChange={(o) => setDialog((d) => ({ ...d, open: o }))} clientId={client.id} traveller={dialog.traveller} />

      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={removing ? `Remove ${travellerDisplayName(removing)}?` : "Remove traveller?"}
        confirmLabel="Remove traveller"
        onConfirm={() => (removing ? dispatch(removeTraveller, { travellerId: removing.id }).ok : false)}
      >
        {r && (
          <Consequences
            items={[
              "Their name, passport and contact details are deleted from this client.",
              r.files ? `They are taken off ${r.files} booking${r.files === 1 ? "" : "s"} and ${r.lines} unissued service${r.lines === 1 ? "" : "s"}. Prices do not change.` : "They are not on any booking.",
            ]}
          />
        )}
      </ConfirmDialog>
    </Section>
  );
}

const QUICK_TITLES: { value: Title; label: string }[] = [
  { value: "MR", label: "Mr" },
  { value: "MRS", label: "Mrs" },
  { value: "MS", label: "Ms" },
];

/** One-line add for an organisation's employees: title and names now, passport details later from the row. */
function QuickAddTraveller({ clientId }: { clientId: ID }) {
  const dispatch = useDispatch();
  const [v, setV] = React.useState<{ title: Title | ""; givenName: string; surname: string }>({ title: "", givenName: "", surname: "" });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const firstRef = React.useRef<HTMLInputElement>(null);
  const set = (p: Partial<typeof v>) => {
    setV((x) => ({ ...x, ...p }));
    setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !(k in p))));
  };
  const name = (s: string, label: string) => (!s.trim() ? `Enter the ${label}.` : !TRAVELLER_NAME_RE.test(normaliseName(s)) ? "Letters, spaces, hyphens and apostrophes only." : undefined);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!v.title) er.title = "Choose a title.";
    const g = name(v.givenName, "first name");
    const s = name(v.surname, "last name");
    if (g) er.givenName = g;
    if (s) er.surname = s;
    setErrors(er);
    if (Object.keys(er).length) {
      document.querySelector<HTMLElement>("#qa-form [aria-invalid=true]")?.focus();
      return;
    }
    const r = dispatch(upsertTraveller, { traveller: { clientId, title: v.title as Title, givenName: v.givenName, surname: v.surname, paxType: "ADT" } });
    if (r.ok) {
      setV({ title: "", givenName: "", surname: "" });
      firstRef.current?.focus();
    }
  };
  return (
    <form id="qa-form" onSubmit={submit} noValidate className="mb-4 rounded-lg border border-rule bg-canvas px-3.5 pt-3 pb-3.5" aria-label="Quick add an employee">
      <p className="mb-2.5 text-[13px] font-semibold text-ink-2">Quick add</p>
      <div className="grid gap-3 sm:grid-cols-[132px_minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-start">
        <Field label="Title" htmlFor="qa-title" required error={errors.title}>
          <SelectField id="qa-title" value={v.title} onChange={(t) => set({ title: t as Title })} options={QUICK_TITLES} invalid={Boolean(errors.title)} />
        </Field>
        <Field label="First name" htmlFor="qa-given" required error={errors.givenName}>
          <Input ref={firstRef} id="qa-given" value={v.givenName} onChange={(e) => set({ givenName: e.target.value })} aria-invalid={Boolean(errors.givenName) || undefined} autoComplete="off" />
        </Field>
        <Field label="Last name" htmlFor="qa-sur" required error={errors.surname}>
          <Input id="qa-sur" value={v.surname} onChange={(e) => set({ surname: e.target.value })} aria-invalid={Boolean(errors.surname) || undefined} autoComplete="off" />
        </Field>
        <Button type="submit" className="sm:mt-[26px]">
          <UserPlus /> Add
        </Button>
      </div>
    </form>
  );
}
