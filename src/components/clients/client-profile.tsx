"use client";

import * as React from "react";
import { Mail, Pencil, Phone, Users } from "lucide-react";

import type { Client } from "@/domain/types";
import type { ClientBalance, CreditUsage } from "@/domain/selectors/balances";
import { can } from "@/domain/permissions";
import { useApp, useMe } from "@/store";
import { useNow } from "@/lib/use-now";
import { darToday, fmtDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState, Section } from "@/components/shared/page";
import { KeyValues } from "@/components/shared/bits";
import { Amount } from "@/components/shared/amount";
import { StatusChip } from "@/components/shared/status-chip";
import { CLIENT_SOURCES, SEATS, cabinLabel, clientTypeLabel, countryName, idTypeLabel, orgTypeLabel } from "./client-options";
import { ClientEditDialog } from "./client-header";
import { CreditUsageBar } from "./client-bits";
import { balanceChip } from "./client-rows";
import { paxTypeFor, type StepId } from "./profile-draft";

/** Summary strip: one row of label/value pairs split by hairlines (not tiles). */
export function ClientSummary({ bal, bookings, mixed, rate }: { bal: ClientBalance; bookings: number; mixed: boolean; rate: number }) {
  const chip = balanceChip(bal);
  const items: { label: string; value: React.ReactNode }[] = [
    {
      label: bal.balance.amountMinor < 0 ? "Credit" : "Balance",
      value: (
        <span className="flex items-center gap-2">
          <Amount value={bal.balance} tone="balance" size="lg" />
          <StatusChip status={chip.status} label={chip.label} size="xs" />
        </span>
      ),
    },
    { label: "Overdue", value: <Amount value={bal.overdue} size="lg" className={cn(bal.overdue.amountMinor === 0 && "text-ink-4")} /> },
    { label: "Billed to date", value: <Amount value={bal.charges} size="lg" className="font-normal" /> },
    { label: "Received", value: <Amount value={bal.received} size="lg" className="font-normal" /> },
    {
      label: "Open bookings",
      value: (
        <span className="tnum text-base font-semibold">
          {bal.openFiles}
          <span className="ml-1 text-[13px] font-normal text-ink-3">of {bookings}</span>
        </span>
      ),
    },
  ];
  return (
    <div>
      <dl className="flex flex-wrap border-y border-rule">
        {items.map((it) => (
          <div key={it.label} className="min-w-[150px] flex-1 border-rule px-4 py-3 first:pl-0 sm:border-l sm:first:border-l-0">
            <dt className="col-head">{it.label}</dt>
            <dd className="mt-1">{it.value}</dd>
          </div>
        ))}
      </dl>
      {mixed && (
        <p className="mt-1.5 text-xs text-ink-3">
          In {bal.currency}, converted at 1 USD = TZS {rate.toLocaleString("en-US")}.
        </p>
      )}
    </div>
  );
}

const dash = <span className="text-ink-4">—</span>;
const or = (v?: string) => (v?.trim() ? v : dash);
const code = (v?: string) => (v ? <span className="font-mono text-[13.5px] whitespace-nowrap">{v}</span> : dash);
const place = (...parts: (string | undefined)[]) => {
  const s = [...new Set(parts.map((x) => x?.trim()).filter(Boolean))];
  return s.length ? s.join(", ") : dash;
};
const phoneLink = (v?: string) =>
  v ? (
    <a href={`tel:${v}`} className="tnum whitespace-nowrap hover:underline">
      {v}
    </a>
  ) : (
    dash
  );

function EditButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button variant="ghost" size="sm" onClick={onClick} aria-label={label}>
      <Pencil /> Edit
    </Button>
  );
}

/**
 * Profile blocks. Organisations: details (with credit usage), contacts and travel policy. Individuals: personal
 * details and travel preferences. Each block's Edit opens the client stepper on its step.
 */
export function ClientProfile({ client, credit }: { client: Client; credit: CreditUsage | null }) {
  const me = useMe();
  const db = useApp((s) => s.db)!;
  const now = useNow();
  const [editing, setEditing] = React.useState<{ open: boolean; step?: StepId }>({ open: false });
  const edit = can(me, "client.edit") ? (step: StepId) => setEditing({ open: true, step }) : null;
  const org = client.type === "corporate";
  const creator = db.users[client.createdBy];
  const since = `${fmtDate(client.createdAt)}${creator ? ` · added by ${creator.name}` : ""}`;
  const source = CLIENT_SOURCES.find((s) => s.value === client.source)?.label ?? "Not recorded";
  const terms = client.paymentTermsDays ?? db.settings.defaultPaymentTermsDays;

  const notes = client.notes && (
    <div className="mt-3 border-t border-rule pt-3 text-sm">
      <div className="col-head mb-1">Notes</div>
      <p className="whitespace-pre-line text-ink-2">{client.notes}</p>
    </div>
  );

  return (
    <div className="grid items-start gap-6 xl:grid-cols-3">
      {org ? (
        <Section
          title="Organisation"
          className="xl:col-span-2"
          actions={
            edit && (
              <Button variant="outline" size="sm" onClick={() => edit("org")}>
                <Pencil /> Edit profile
              </Button>
            )
          }
        >
          {credit && (
            <div className="mb-4 max-w-2xl">
              <CreditUsageBar usage={credit} termsDays={terms} />
              {!client.creditLimit && can(me, "client.set_credit") && <p className="mt-1 text-xs text-ink-3">Set a credit limit with Edit profile.</p>}
            </div>
          )}
          <KeyValues
            cols={2}
            items={[
              { label: "Kind", value: orgTypeLabel(client.orgType) ?? clientTypeLabel("corporate") },
              { label: "Sector", value: or(client.sector) },
              { label: "Registration no.", value: code(client.registrationNumber) },
              { label: "TIN", value: code(client.tin) },
              { label: "VRN", value: code(client.vrn) },
              {
                label: "Website",
                value: client.website ? (
                  <a href={client.website} target="_blank" rel="noopener noreferrer" className="text-link hover:underline">
                    {client.website.replace(/^https?:\/\//i, "").replace(/\/$/, "")}
                  </a>
                ) : (
                  dash
                ),
              },
              { label: "Main phone", value: phoneLink(client.phone) },
              { label: "Email", value: or(client.email) },
              { label: "Billing email", value: client.billingEmail ?? (client.email ? <span className="text-ink-3">Main email</span> : dash) },
              { label: "P.O. Box", value: or(client.postalAddress) },
              { label: "Address", value: place(client.address, client.city, client.region) },
              { label: "Country", value: or(countryName(client.country)) },
              { label: "Invoice in", value: client.defaultCurrency },
              { label: "Credit limit", value: client.creditLimit ? <Amount value={client.creditLimit} /> : "None" },
              { label: "Payment terms", value: client.paymentTermsDays !== undefined ? `${client.paymentTermsDays} days` : `${terms} days (standard)` },
              { label: "How they reached us", value: source },
              { label: "Client since", value: since },
              { label: "Tags", value: client.tags.join(", "), hidden: !client.tags.length },
            ]}
          />
          {notes}
        </Section>
      ) : (
        <Section
          title="Profile"
          className="xl:col-span-2"
          actions={
            edit && (
              <Button variant="outline" size="sm" onClick={() => edit("personal")}>
                <Pencil /> Edit profile
              </Button>
            )
          }
        >
          <KeyValues
            cols={2}
            items={[
              { label: "Type", value: clientTypeLabel("individual") },
              { label: "Phone", value: phoneLink(client.phone) },
              { label: "Email", value: or(client.email) },
              {
                label: "Date of birth",
                value: client.dateOfBirth ? (
                  <span className="tnum">
                    {fmtDate(client.dateOfBirth)}
                    {paxTypeFor(client.dateOfBirth, darToday(now)) !== "ADT" && <span className="text-ink-3"> · {paxTypeFor(client.dateOfBirth, darToday(now)) === "CHD" ? "child" : "infant"}</span>}
                  </span>
                ) : (
                  dash
                ),
              },
              { label: "Gender", value: client.gender === "F" ? "Female" : client.gender === "M" ? "Male" : dash },
              { label: "Nationality", value: or(countryName(client.nationality)) },
              {
                label: "ID",
                value: client.idType ? (
                  <span>
                    {idTypeLabel(client.idType)} {code(client.idNumber)}
                  </span>
                ) : (
                  dash
                ),
              },
              { label: "Occupation", value: or(client.occupation) },
              { label: "Employer", value: or(client.employer) },
              { label: "Address", value: place(client.address, client.city, client.region) },
              { label: "Country", value: or(countryName(client.country)) },
              { label: "TIN", value: code(client.tin) },
              { label: "Invoice in", value: client.defaultCurrency },
              { label: "How they reached us", value: source },
              { label: "Client since", value: since },
              { label: "Tags", value: client.tags.join(", "), hidden: !client.tags.length },
            ]}
          />
          {notes}
        </Section>
      )}

      <div className="space-y-6">{org ? <OrgAside client={client} edit={edit} /> : <PersonAside client={client} edit={edit} />}</div>

      <ClientEditDialog client={client} open={editing.open} onOpenChange={(open) => setEditing((e) => ({ ...e, open }))} step={editing.step} />
    </div>
  );
}

function OrgAside({ client, edit }: { client: Client; edit: ((s: StepId) => void) | null }) {
  const contacts = client.contacts ?? [];
  const policy = client.travelPolicy;
  return (
    <>
      <Section title="Contacts" count={contacts.length} actions={edit && <EditButton label="Edit contacts" onClick={() => edit("people")} />}>
        {contacts.length ? (
          <ul className="-my-1 divide-y divide-rule">
            {contacts.map((k) => (
              <li key={k.id} className="py-3 first:pt-1 last:pb-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-ink">{k.name}</span>
                    {k.role && <span className="block truncate text-[13px] text-ink-3">{k.role}</span>}
                  </span>
                  <span className="flex shrink-0 gap-1.5">
                    {k.primary && <Badge variant="secondary">Primary</Badge>}
                    {k.canBook && <Badge variant="secondary">Can book</Badge>}
                  </span>
                </div>
                {(k.phone || k.email) && (
                  <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-2">
                    {k.phone && (
                      <a href={`tel:${k.phone}`} className="tnum inline-flex items-center gap-1 hover:text-ink hover:underline">
                        <Phone className="size-3.5 text-ink-3" aria-hidden /> {k.phone}
                      </a>
                    )}
                    {k.email && (
                      <a href={`mailto:${k.email}`} className="inline-flex min-w-0 items-center gap-1 break-all hover:text-ink hover:underline">
                        <Mail className="size-3.5 shrink-0 text-ink-3" aria-hidden /> {k.email}
                      </a>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={Users}
            title="No contacts yet"
            body={client.contactPerson ? `${client.contactPerson} is on file as the contact person. Add their phone and who else books.` : "Add who books, approves and pays."}
            className="py-6"
            action={
              edit && (
                <Button size="sm" variant="outline" onClick={() => edit("people")}>
                  Add contacts
                </Button>
              )
            }
          />
        )}
      </Section>

      <Section title="Travel policy" actions={edit && <EditButton label="Edit travel policy" onClick={() => edit("policy")} />}>
        <KeyValues
          items={[
            { label: "Default cabin", value: cabinLabel(policy?.cabin) },
            { label: "Approval", value: policy?.approvalRequired ? `Needed, by ${policy.approver ?? "their approver"}` : "Not needed" },
            { label: "PO or reference", value: client.poRequired ? "Required on every booking" : "Optional" },
          ]}
        />
        <div className="mt-3 border-t border-rule pt-3">
          <div className="col-head mb-2">Departments and cost centres</div>
          {client.departments?.length ? (
            <div className="flex flex-wrap gap-1.5">
              {client.departments.map((d) => (
                <Badge key={d} variant="secondary">
                  {d}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-ink-4">None yet</p>
          )}
        </div>
        {policy?.notes && (
          <div className="mt-3 border-t border-rule pt-3 text-sm">
            <div className="col-head mb-1">Policy notes</div>
            <p className="whitespace-pre-line text-ink-2">{policy.notes}</p>
          </div>
        )}
      </Section>
    </>
  );
}

function PersonAside({ client, edit }: { client: Client; edit: ((s: StepId) => void) | null }) {
  const pref = client.preferences;
  const ec = client.emergencyContact;
  return (
    <Section title="Travel preferences" actions={edit && <EditButton label="Edit travel preferences" onClick={() => edit("travel")} />}>
      <KeyValues
        items={[
          { label: "Seat", value: SEATS.find((s) => s.value === pref?.seat)?.label ?? dash },
          { label: "Special meal", value: or(pref?.meal) },
          {
            label: "Emergency contact",
            value: ec ? (
              <span className="block">
                {ec.name}
                {ec.relation && <span className="text-ink-3"> · {ec.relation}</span>}
                <span className="block">{phoneLink(ec.phone)}</span>
              </span>
            ) : (
              dash
            ),
          },
        ]}
      />
      {pref?.notes && (
        <div className="mt-3 border-t border-rule pt-3 text-sm">
          <div className="col-head mb-1">Travel notes</div>
          <p className="whitespace-pre-line text-ink-2">{pref.notes}</p>
        </div>
      )}
    </Section>
  );
}
