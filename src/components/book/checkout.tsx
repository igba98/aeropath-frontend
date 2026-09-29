"use client";

import * as React from "react";
import { Building2, CircleCheckBig, ClipboardList, UserRound, UserRoundCheck, X } from "lucide-react";

import type { Client, Currency, DbState, FileSource, ID, PaxType, Title } from "@/domain/types";
import { createClient, upsertTraveller } from "@/domain/commands";
import { TRAVELLER_NAME_RE, normaliseName, normalisePhone } from "@/domain/validation";
import { useApp } from "@/store";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox } from "@/components/shared/combobox";
import { Field } from "@/components/shared/field";
import { Segmented } from "@/components/shared/page";
import { FILE_SOURCES } from "@/components/bookings/wizard/step-client";
import { ClientStepperDialog } from "@/components/clients/client-stepper";
import { cabinLabel } from "@/components/clients/client-options";

type Dispatch = ReturnType<typeof useApp.getState>["dispatch"];

// ─────────────────────────────── Who the booking is for ───────────────────────────────

export interface ClientChoice {
  mode: "existing" | "new";
  clientId?: ID;
  name: string;
  phone: string;
  email: string;
  source: FileSource;
  /** Organisation bookings: their purchase order or reference number. */
  reference: string;
  /** Organisation bookings: the department or cost centre charged. */
  costCentre: string;
}

export const emptyClient = (): ClientChoice => ({ mode: "existing", name: "", phone: "", email: "", source: "walk_in", reference: "", costCentre: "" });

/** Checks the client choice; an organisation whose policy asks for a PO needs one on every booking. */
export function validateClient(c: ClientChoice, db: DbState | null = useApp.getState().db): Record<string, string> {
  const e: Record<string, string> = {};
  if (c.mode === "existing") {
    if (!c.clientId) {
      e.client = "Pick the client, or switch to New client.";
      return e;
    }
    const client = db?.clients[c.clientId];
    const ref = (c.reference ?? "").trim();
    if (client?.type === "corporate" && client.poRequired && !ref) e.reference = `${client.name} needs a PO or reference number on every booking.`;
    else if (ref.length > 80) e.reference = "Keep the reference under 80 characters.";
    if ((c.costCentre ?? "").trim().length > 80) e.costCentre = "Keep the department under 80 characters.";
    return e;
  }
  if (!c.name.trim()) e.name = "Enter the client's name.";
  if (!c.phone.trim()) e.phone = "Enter a phone number so we can reach them.";
  else if (!normalisePhone(c.phone)) e.phone = "Use a Tanzanian or international number, e.g. 0754 123 456 or +44 7700 900123.";
  if (c.email.trim() && !/^\S+@\S+\.\S+$/.test(c.email.trim())) e.email = "This email doesn't look right.";
  return e;
}

/** "Policy: economy, approval by Asha Mrema · PO required" for an organisation. */
export function policyNote(client: Client): string {
  const p = client.travelPolicy;
  const parts = [p ? `${cabinLabel(p.cabin).toLowerCase()}, ${p.approvalRequired ? `approval by ${p.approver ?? "their approver"}` : "no approval needed"}` : "no travel policy on file"];
  if (client.poRequired) parts.push("PO required");
  return `Policy: ${parts.join(" · ")}`;
}

export function ClientCard({ value, onChange, errors }: { value: ClientChoice; onChange: (v: ClientChoice) => void; errors: Record<string, string> }) {
  const db = useApp((s) => s.db)!;
  const [fullForm, setFullForm] = React.useState(false);
  const options = React.useMemo(
    () =>
      Object.values(db.clients)
        .filter((c) => !c.archived)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((c) => ({
          value: c.id,
          label: c.name,
          hint: c.type === "corporate" ? `Organisation · ${c.phone}` : c.phone,
          keywords: [c.phone, c.email ?? "", c.type === "corporate" ? "organisation" : "", c.sector ?? "", ...(c.contacts ?? []).map((k) => k.name)],
        })),
    [db.clients],
  );
  const set = (patch: Partial<ClientChoice>) => onChange({ ...value, ...patch });
  const chosen = value.mode === "existing" && value.clientId ? db.clients[value.clientId] : undefined;
  const org = chosen?.type === "corporate" ? chosen : undefined;
  /** A different client: their PO and department don't carry over; organisations book as corporate. */
  const pick = (clientId: ID) => {
    const c = db.clients[clientId];
    const source: FileSource = c?.type === "corporate" ? "corporate" : value.source === "corporate" ? "walk_in" : value.source;
    onChange({ ...value, mode: "existing", clientId, reference: "", costCentre: "", source });
  };

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>
            <h2>Who is this booking for?</h2>
          </CardTitle>
          <CardDescription className="mt-1">The client pays and gets the invoice. They don&rsquo;t have to be travelling.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Segmented
          label="Client"
          value={value.mode}
          onChange={(mode) => set({ mode, reference: "", costCentre: "" })}
          options={[
            { value: "existing", label: "Existing client" },
            { value: "new", label: "New client" },
          ]}
        />
        {value.mode === "existing" ? (
          <>
            <Field label="Client" htmlFor="bk-client" required error={errors.client}>
              <Combobox
                id="bk-client"
                value={value.clientId}
                onChange={pick}
                options={options}
                placeholder="Search by name or phone"
                searchPlaceholder="Name, phone or organisation"
                emptyText="No client found. Switch to New client."
                invalid={Boolean(errors.client)}
                onCreate={(q) => onChange({ ...value, mode: "new", name: q, clientId: undefined, reference: "", costCentre: "" })}
                createLabel={(q) => `Add “${q}” as a new client`}
              />
            </Field>
            {org && <OrgBookingFields client={org} value={value} set={set} errors={errors} />}
          </>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name" htmlFor="bk-name" required error={errors.name} className="sm:col-span-2">
                <Input id="bk-name" value={value.name} onChange={(e) => set({ name: e.target.value })} aria-invalid={Boolean(errors.name)} autoComplete="off" />
              </Field>
              <Field label="Phone" htmlFor="bk-phone" required error={errors.phone} hint="Local or international">
                <Input id="bk-phone" type="tel" inputMode="tel" value={value.phone} onChange={(e) => set({ phone: e.target.value })} aria-invalid={Boolean(errors.phone)} autoComplete="off" className="tnum" />
              </Field>
              <Field label="Email" htmlFor="bk-email" optional error={errors.email}>
                <Input id="bk-email" type="email" value={value.email} onChange={(e) => set({ email: e.target.value })} aria-invalid={Boolean(errors.email)} autoComplete="off" />
              </Field>
            </div>
            <div className="flex flex-col gap-3 rounded-lg border border-dashed border-rule-2 px-3.5 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[13px] leading-5 text-ink-3">
                <span className="font-semibold text-ink-2">An organisation, or a full profile?</span> Add ID, passport, contacts and travel policy in the full form.
              </p>
              <Button type="button" variant="outline" size="sm" className="shrink-0 self-start sm:self-auto" onClick={() => setFullForm(true)}>
                <ClipboardList /> Full client details
              </Button>
            </div>
          </>
        )}
        <ClientStepperDialog
          open={fullForm}
          onOpenChange={setFullForm}
          seed={{ name: value.name, phone: value.phone, email: value.email }}
          afterCreate="handoff"
          onCreated={(clientId) => {
            const c = useApp.getState().db?.clients[clientId];
            onChange({ ...value, mode: "existing", clientId, name: "", phone: "", email: "", reference: "", costCentre: "", source: c?.type === "corporate" ? "corporate" : value.source });
          }}
        />
        <Field label="How did they reach us?">
          <Segmented label="Came in by" value={value.source} onChange={(source) => set({ source })} options={FILE_SOURCES.map((s) => ({ value: s.value, label: s.label }))} />
        </Field>
      </CardContent>
    </Card>
  );
}

/** Department and PO for an organisation's booking, with its travel policy in one line. */
function OrgBookingFields({ client, value, set, errors }: { client: Client; value: ClientChoice; set: (p: Partial<ClientChoice>) => void; errors: Record<string, string> }) {
  const departments = client.departments ?? [];
  const cc = value.costCentre ?? "";
  const ccOptions = [...(cc && !departments.includes(cc) ? [cc] : []), ...departments].map((d) => ({ value: d, label: d }));
  const po = Boolean(client.poRequired);
  const primary = client.contacts?.find((k) => k.primary);
  return (
    <div className="space-y-4 rounded-xl border border-rule bg-canvas px-4 pt-3.5 pb-4">
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-paper text-ink-2 ring-1 ring-rule">
          <Building2 className="size-4" aria-hidden />
        </span>
        <div className="min-w-0 text-[13px] leading-5">
          <p className="text-sm font-semibold text-ink">Organisation booking</p>
          <p className="text-ink-3">{policyNote(client)}</p>
          {primary && (
            <p className="text-ink-3">
              Contact: {primary.name}
              {primary.phone && <span className="tnum"> · {primary.phone}</span>}
            </p>
          )}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Department or cost centre" htmlFor="bk-cc" optional error={errors.costCentre} hint={departments.length ? "Pick one, or type another" : undefined}>
          {departments.length ? (
            <Combobox
              id="bk-cc"
              value={cc || null}
              onChange={(costCentre) => set({ costCentre })}
              options={ccOptions}
              placeholder="Choose department"
              searchPlaceholder="Department or cost centre"
              onCreate={(costCentre) => set({ costCentre })}
              createLabel={(q) => `Use “${q}”`}
              invalid={Boolean(errors.costCentre)}
            />
          ) : (
            <Input id="bk-cc" value={cc} onChange={(e) => set({ costCentre: e.target.value })} aria-invalid={Boolean(errors.costCentre)} autoComplete="off" />
          )}
        </Field>
        <Field label="PO or reference" htmlFor="bk-ref" required={po} optional={!po} error={errors.reference} hint={po ? "Required by their travel policy" : "Their purchase order or reference number"}>
          <Input id="bk-ref" value={value.reference ?? ""} onChange={(e) => set({ reference: e.target.value })} aria-invalid={Boolean(errors.reference)} autoComplete="off" className="font-mono text-[13.5px]" />
        </Field>
      </div>
    </div>
  );
}

// ─────────────────────────────── Travellers ───────────────────────────────

export interface Person {
  paxType: PaxType;
  travellerId?: ID;
  /** Empty until the agent picks one: a wrong title on a ticket costs a name change. */
  title: Title | "";
  givenName: string;
  surname: string;
  dateOfBirth: string;
  passportNumber: string;
  passportExpiry: string;
}

export const blankPerson = (paxType: PaxType): Person => ({ paxType, title: "", givenName: "", surname: "", dateOfBirth: "", passportNumber: "", passportExpiry: "" });

export function peopleFor(p: { adults: number; children: number; infants: number }): Person[] {
  return [...Array.from({ length: p.adults }, () => blankPerson("ADT")), ...Array.from({ length: p.children }, () => blankPerson("CHD")), ...Array.from({ length: p.infants }, () => blankPerson("INF"))];
}

const PAX_LABEL: Record<PaxType, string> = { ADT: "Adult", CHD: "Child", INF: "Infant" };
const TITLES: Record<PaxType, Title[]> = { ADT: ["MR", "MRS", "MS"], CHD: ["MSTR", "MISS"], INF: ["MSTR", "MISS"] };
const TITLE_LABEL: Record<Title, string> = { MR: "Mr", MRS: "Mrs", MS: "Ms", MSTR: "Master (boy)", MISS: "Miss (girl)" };

export function validatePeople(people: Person[], opts: { passports: boolean }): Record<string, string> {
  const e: Record<string, string> = {};
  people.forEach((p, i) => {
    if (p.travellerId) return;
    if (!p.title) e[`${i}.title`] = p.paxType === "ADT" ? "Choose Mr, Mrs or Ms." : "Choose boy or girl.";
    if (!p.givenName.trim()) e[`${i}.givenName`] = "Enter the first name as in the passport.";
    else if (!TRAVELLER_NAME_RE.test(normaliseName(p.givenName))) e[`${i}.givenName`] = "Letters, spaces, hyphens and apostrophes only.";
    if (!p.surname.trim()) e[`${i}.surname`] = "Enter the last name as in the passport.";
    else if (!TRAVELLER_NAME_RE.test(normaliseName(p.surname))) e[`${i}.surname`] = "Letters, spaces, hyphens and apostrophes only.";
    if (p.paxType !== "ADT" && !p.dateOfBirth) e[`${i}.dateOfBirth`] = `Needed for ${p.paxType === "CHD" ? "children" : "infants"}.`;
    if (opts.passports && p.passportNumber && !/^[A-Z0-9]{5,12}$/i.test(p.passportNumber.trim())) e[`${i}.passportNumber`] = "5 to 12 letters and numbers.";
  });
  return e;
}

export function PeopleCard({
  people,
  onChange,
  clientId,
  passports,
  errors,
  onUseClient,
  title = "Travellers",
  description,
  leadLabel = "lead traveller",
}: {
  title?: string;
  description?: string;
  leadLabel?: string;
  people: Person[];
  onChange: (p: Person[]) => void;
  clientId?: ID;
  passports: boolean;
  errors: Record<string, string>;
  onUseClient?: () => void;
}) {
  const db = useApp((s) => s.db)!;
  const saved = clientId ? Object.values(db.travellers).filter((t) => t.clientId === clientId) : [];
  const taken = new Set(people.map((p) => p.travellerId).filter(Boolean));
  const set = (i: number, patch: Partial<Person>) => onChange(people.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  const count: Record<PaxType, number> = { ADT: 0, CHD: 0, INF: 0 };

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>
            <h2>{title}</h2>
          </CardTitle>
          <CardDescription className="mt-1">{description ?? `Names exactly as they appear in the passport${passports ? "" : " or national ID"}.`}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {people.map((p, i) => {
          count[p.paxType] += 1;
          const label = people.length === 1 ? leadLabel.charAt(0).toUpperCase() + leadLabel.slice(1) : `${PAX_LABEL[p.paxType]} ${count[p.paxType]}${i === 0 ? ` · ${leadLabel}` : ""}`;
          const t = p.travellerId ? db.travellers[p.travellerId] : undefined;
          const choices = saved.filter((s) => s.paxType === p.paxType && (!taken.has(s.id) || s.id === p.travellerId));
          return (
            <fieldset key={i} className="rounded-xl border border-rule p-4">
              <legend className="-ml-1 px-1 text-sm font-semibold text-ink">{label}</legend>
              {t ? (
                <div className="flex flex-wrap items-center gap-3">
                  <span className="grid size-9 place-items-center rounded-full bg-[var(--st-green-bg)] text-[var(--st-green-fg)]">
                    <UserRoundCheck className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-ink">
                      {TITLE_LABEL[t.title].split(" ")[0]} {t.givenName} {t.surname}
                    </span>
                    <span className="block text-[13px] text-ink-3">{[t.dateOfBirth && `Born ${t.dateOfBirth}`, t.passportNumber && `Passport ${t.passportNumber}`].filter(Boolean).join(" · ") || "Saved traveller"}</span>
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => set(i, { ...blankPerson(p.paxType) })}>
                    <X /> Change
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  {(choices.length > 0 || (i === 0 && onUseClient)) && (
                    <div className="flex flex-wrap items-center gap-2">
                      {choices.length > 0 && <span className="text-[13px] font-medium text-ink-3">Saved:</span>}
                      {choices.slice(0, 6).map((s) => (
                        <Button
                          key={s.id}
                          type="button"
                          variant="outline"
                          size="sm"
                          className="rounded-full"
                          onClick={() => set(i, { travellerId: s.id, title: s.title, givenName: s.givenName, surname: s.surname })}
                        >
                          <UserRound /> {s.givenName} {s.surname}
                        </Button>
                      ))}
                      {i === 0 && onUseClient && !choices.length && (
                        <Button type="button" variant="outline" size="sm" className="rounded-full" onClick={onUseClient}>
                          <UserRound /> Same as the client
                        </Button>
                      )}
                    </div>
                  )}
                  <div className="grid gap-4 sm:grid-cols-[140px_minmax(0,1fr)_minmax(0,1fr)]">
                    <Field label="Title" htmlFor={`p${i}-title`} required error={errors[`${i}.title`]}>
                      <Select value={p.title || undefined} onValueChange={(v) => set(i, { title: v as Title })}>
                        <SelectTrigger id={`p${i}-title`} className="w-full" aria-invalid={Boolean(errors[`${i}.title`])}>
                          <SelectValue placeholder="Choose" />
                        </SelectTrigger>
                        <SelectContent>
                          {TITLES[p.paxType].map((x) => (
                            <SelectItem key={x} value={x}>
                              {TITLE_LABEL[x]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="First name" htmlFor={`p${i}-given`} required error={errors[`${i}.givenName`]}>
                      <Input id={`p${i}-given`} value={p.givenName} onChange={(e) => set(i, { givenName: e.target.value })} aria-invalid={Boolean(errors[`${i}.givenName`])} autoComplete="off" />
                    </Field>
                    <Field label="Last name" htmlFor={`p${i}-sur`} required error={errors[`${i}.surname`]}>
                      <Input id={`p${i}-sur`} value={p.surname} onChange={(e) => set(i, { surname: e.target.value })} aria-invalid={Boolean(errors[`${i}.surname`])} autoComplete="off" />
                    </Field>
                  </div>
                  <div className={cn("grid gap-4", passports ? "sm:grid-cols-3" : "sm:grid-cols-3")}>
                    <Field label="Date of birth" htmlFor={`p${i}-dob`} required={p.paxType !== "ADT"} optional={p.paxType === "ADT"} error={errors[`${i}.dateOfBirth`]}>
                      <Input id={`p${i}-dob`} type="date" value={p.dateOfBirth} onChange={(e) => set(i, { dateOfBirth: e.target.value })} aria-invalid={Boolean(errors[`${i}.dateOfBirth`])} />
                    </Field>
                    {passports && (
                      <>
                        <Field label="Passport number" htmlFor={`p${i}-pp`} optional error={errors[`${i}.passportNumber`]}>
                          <Input id={`p${i}-pp`} value={p.passportNumber} onChange={(e) => set(i, { passportNumber: e.target.value.toUpperCase() })} className="font-mono" aria-invalid={Boolean(errors[`${i}.passportNumber`])} autoComplete="off" />
                        </Field>
                        <Field label="Passport expiry" htmlFor={`p${i}-ppx`} optional>
                          <Input id={`p${i}-ppx`} type="date" value={p.passportExpiry} onChange={(e) => set(i, { passportExpiry: e.target.value })} />
                        </Field>
                      </>
                    )}
                  </div>
                </div>
              )}
            </fieldset>
          );
        })}
        {passports && <p className="text-[13px] text-ink-3">Passport details can be added later, but the airline needs them before the ticket is issued.</p>}
      </CardContent>
    </Card>
  );
}

/** Split "Peter John Mwakalinga" into first names and the last word as surname. */
export function splitName(full: string): { givenName: string; surname: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length < 2) return { givenName: parts[0] ?? "", surname: "" };
  return { givenName: parts.slice(0, -1).join(" "), surname: parts[parts.length - 1] };
}

/** Create the client (when new) and every traveller not yet on file. Stops at the first error (already toasted). */
export function saveParty(dispatch: Dispatch, getDb: () => DbState | null, client: ClientChoice, people: Person[], currency: Currency): { clientId: ID; travellerIds: ID[] } | null {
  let clientId = client.clientId;
  if (client.mode === "new") {
    const r = dispatch(createClient, { type: "individual", name: client.name.trim(), phone: client.phone.trim(), email: client.email.trim() || undefined, defaultCurrency: currency, source: client.source === "corporate" ? undefined : client.source }, { toast: false });
    if (!r.ok) return null;
    clientId = (r.result as { clientId: ID }).clientId;
  }
  if (!clientId || !getDb()?.clients[clientId]) return null;
  const travellerIds: ID[] = [];
  for (const p of people) {
    if (p.travellerId) {
      travellerIds.push(p.travellerId);
      continue;
    }
    const r = dispatch(
      upsertTraveller,
      {
        traveller: {
          clientId,
          title: p.title as Title,
          givenName: p.givenName,
          surname: p.surname,
          paxType: p.paxType,
          dateOfBirth: p.dateOfBirth || undefined,
          passportNumber: p.passportNumber.trim() || undefined,
          passportExpiry: p.passportExpiry || undefined,
        },
      },
      { toast: false },
    );
    if (!r.ok) return null;
    travellerIds.push((r.result as { travellerId: ID }).travellerId);
  }
  return { clientId, travellerIds };
}

// ─────────────────────────────── Price summary ───────────────────────────────

export function PriceLine({ label, value, strong, muted }: { label: React.ReactNode; value: React.ReactNode; strong?: boolean; muted?: boolean }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4 py-1.5", strong ? "text-base font-bold text-ink" : muted ? "text-[13px] text-ink-3" : "text-sm text-ink-2")}>
      <dt className="min-w-0">{label}</dt>
      <dd className="tnum shrink-0 text-right">{value}</dd>
    </div>
  );
}

// ─────────────────────────────── Done ───────────────────────────────

export function BookedHero({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-4 pt-6 pb-2 text-center">
      <span className="grid size-16 place-items-center rounded-full bg-[var(--st-green-bg)] text-[var(--st-green-fg)]">
        <CircleCheckBig className="size-8" />
      </span>
      <h1 className="mt-5 text-[26px] leading-9 font-bold tracking-[-0.02em] text-ink">{title}</h1>
      <div className="mt-2 max-w-xl text-[15px] text-ink-3">{children}</div>
    </div>
  );
}
