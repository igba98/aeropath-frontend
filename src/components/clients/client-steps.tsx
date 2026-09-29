"use client";

import * as React from "react";
import { Building2, Lock, Plus, Trash2, UserRound } from "lucide-react";

import type { Money, OrgType, Title } from "@/domain/types";
import { format } from "@/domain/money";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Combobox } from "@/components/shared/combobox";
import { Banner, Field, FieldGrid, FormSection } from "@/components/shared/field";
import { MoneyInput } from "@/components/shared/money-input";
import { Segmented } from "@/components/shared/page";
import { CABINS, CLIENT_SOURCES, CLIENT_TITLES, DEPARTMENT_SUGGESTIONS, ID_TYPES, MEALS, ORG_TYPES, SEATS, SECTOR_FOR_ORG_TYPE, SECTORS, clientTypeLabel, orgTypeLabel } from "./client-options";
import { ChipGroup, ChoiceCard, CountryPicker, RegionPicker, SelectField, SwitchRow, TagInput } from "./client-inputs";
import { blankContact, writesSelfTraveller, type ClientKind, type ContactDraft, type Errors, type ProfileDraft, type StepId } from "./profile-draft";

/** The stepper's step bodies. Every control's id is `cs-<draft key>` so errors can focus it. */

export interface StepProps {
  d: ProfileDraft;
  /** Patch the draft; `clear` names error keys the change fixes (defaults to the patched keys). */
  set: (patch: Partial<ProfileDraft>, clear?: string[]) => void;
  errors: Errors;
  mode: "create" | "edit";
}

export const fid = (key: string) => `cs-${key.replace(/\./g, "-")}`;
const inv = (errors: Errors, key: string) => Boolean(errors[key]) || undefined;

const CURRENCIES = [
  { value: "TZS" as const, label: "TZS" },
  { value: "USD" as const, label: "USD" },
];

/** Plain text field bound to a string key of the draft. */
function TextField({
  k,
  label,
  p,
  required,
  hint,
  className,
  type = "text",
  inputMode,
  autoComplete,
  mono,
  upper,
}: {
  k: { [K in keyof ProfileDraft]-?: ProfileDraft[K] extends string ? K : never }[keyof ProfileDraft];
  label: string;
  p: StepProps;
  required?: boolean;
  hint?: React.ReactNode;
  className?: string;
  type?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  autoComplete?: string;
  mono?: boolean;
  upper?: boolean;
}) {
  const id = fid(k);
  return (
    <Field label={label} htmlFor={id} required={required} optional={!required} hint={hint} error={p.errors[k]} className={className}>
      <Input
        id={id}
        type={type}
        inputMode={inputMode}
        value={p.d[k] as string}
        onChange={(e) => p.set({ [k]: upper ? e.target.value.toUpperCase() : e.target.value } as Partial<ProfileDraft>)}
        autoComplete={autoComplete ?? "off"}
        aria-invalid={inv(p.errors, k)}
        aria-describedby={p.errors[k] || hint ? `${id}-hint` : undefined}
        className={cn(mono && "font-mono text-[13.5px]", type === "tel" && "tnum")}
      />
    </Field>
  );
}

// ───────────────────────────── Step 1 ─────────────────────────────

export function TypeStep(p: StepProps & { original?: ClientKind }) {
  const { d, set, errors, original } = p;
  const choose = (type: ClientKind) => set({ type }, ["type"]);
  const switching = original && d.type && d.type !== original;
  return (
    <div className="space-y-6">
      <div>
        <div id={fid("type")} role="radiogroup" aria-label="Kind of client" aria-invalid={inv(errors, "type")} tabIndex={-1} className="grid gap-3 outline-none sm:grid-cols-2">
          <ChoiceCard
            icon={UserRound}
            title="Individual"
            description="A person booking for themselves or their family. Their passport is saved as a traveller."
            selected={d.type === "individual"}
            onSelect={() => choose("individual")}
            invalid={Boolean(errors.type)}
          />
          <ChoiceCard
            icon={Building2}
            title="Organisation"
            description="A company, government office, NGO, embassy or school that books travel for its people."
            selected={d.type === "corporate"}
            onSelect={() => choose("corporate")}
            invalid={Boolean(errors.type)}
          />
        </div>
        {errors.type && (
          <p role="alert" className="mt-2 text-[13px] leading-4 text-[var(--st-red-fg)]">
            {errors.type}
          </p>
        )}
      </div>

      {switching && (
        <Banner tone="warn" title={`This client becomes ${d.type === "corporate" ? "an organisation" : "an individual"}.`}>
          When you save, the {original === "corporate" ? "contacts, departments and travel policy" : "personal details and preferences"} are removed. Their bookings and balance stay as they are.
        </Banner>
      )}

      {d.type === "corporate" && (
        <FormSection title="About the organisation" description="Used to group clients in reports and to suggest the right paperwork.">
          <div className="space-y-4">
            <Field label="Kind of organisation" required error={errors.orgType}>
              <ChipGroup<OrgType>
                id={fid("orgType")}
                label="Kind of organisation"
                value={d.orgType}
                onChange={(orgType) => set({ orgType, sector: d.sector || SECTOR_FOR_ORG_TYPE[orgType] || "" }, ["orgType", ...(SECTOR_FOR_ORG_TYPE[orgType] ? ["sector"] : [])])}
                options={ORG_TYPES}
                invalid={Boolean(errors.orgType)}
              />
            </Field>
            <FieldGrid cols={2}>
              <Field label="Sector" htmlFor={fid("sector")} required error={errors.sector}>
                <SelectField id={fid("sector")} value={d.sector} onChange={(sector) => set({ sector })} options={SECTORS} invalid={Boolean(errors.sector)} />
              </Field>
            </FieldGrid>
          </div>
        </FormSection>
      )}
    </div>
  );
}

// ───────────────────────────── Individuals ─────────────────────────────

export function PersonalStep(p: StepProps) {
  const { d, set, errors, mode } = p;
  const strict = writesSelfTraveller(d, mode);
  return (
    <div className="space-y-6">
      <FormSection title="Name">
        <FieldGrid cols={3}>
          <Field label="Title" htmlFor={fid("title")} required={strict} optional={!strict} error={errors.title}>
            <SelectField id={fid("title")} value={d.title} onChange={(v) => set({ title: v as Title })} options={CLIENT_TITLES} invalid={Boolean(errors.title)} />
          </Field>
          <TextField k="firstName" label="First name" p={p} required autoComplete="given-name" />
          <TextField k="lastName" label="Last name" p={p} required autoComplete="family-name" />
        </FieldGrid>
      </FormSection>

      <FormSection title="Identity">
        <FieldGrid cols={3}>
          <Field label="Gender" optional>
            <Segmented
              label="Gender"
              value={d.gender}
              onChange={(gender) => set({ gender })}
              options={[
                { value: "F", label: "Female" },
                { value: "M", label: "Male" },
              ]}
            />
          </Field>
          <TextField k="dateOfBirth" label="Date of birth" p={p} type="date" />
          <Field label="Nationality" htmlFor={fid("nationality")} optional error={errors.nationality}>
            <CountryPicker id={fid("nationality")} value={d.nationality} onChange={(nationality) => set({ nationality })} invalid={Boolean(errors.nationality)} />
          </Field>
          <Field label="ID type" htmlFor={fid("idType")} optional error={errors.idType}>
            <SelectField
              id={fid("idType")}
              value={d.idType}
              onChange={(v) => set({ idType: v as ProfileDraft["idType"] }, ["idType", "idNumber"])}
              options={ID_TYPES}
              noneLabel="None"
              invalid={Boolean(errors.idType)}
            />
          </Field>
          <TextField
            k="idNumber"
            label="ID number"
            p={p}
            required={Boolean(d.idType)}
            mono
            upper
            className="sm:col-span-2"
            hint={d.idType === "nida" ? "20 digits, as printed on the NIDA card" : undefined}
          />
        </FieldGrid>
      </FormSection>

      <FormSection title="Work">
        <FieldGrid cols={2}>
          <TextField k="occupation" label="Occupation" p={p} autoComplete="organization-title" />
          <TextField k="employer" label="Employer" p={p} autoComplete="organization" />
        </FieldGrid>
      </FormSection>
    </div>
  );
}

export function ContactStep(p: StepProps) {
  const { d, set, errors } = p;
  return (
    <div className="space-y-6">
      <FormSection title="Phone and email">
        <FieldGrid cols={2}>
          <TextField k="phone" label="Phone" p={p} required type="tel" inputMode="tel" autoComplete="tel" hint="Local or international; saved as +255…" />
          <TextField k="email" label="Email" p={p} type="email" autoComplete="email" />
        </FieldGrid>
      </FormSection>
      <FormSection title="Address" description="Printed on invoices and receipts.">
        <FieldGrid cols={3}>
          <TextField k="address" label="Street address" p={p} className="sm:col-span-3" autoComplete="street-address" hint="Street, house or building" />
          <TextField k="city" label="City or town" p={p} autoComplete="address-level2" />
          <Field label="Region" htmlFor={fid("region")} optional>
            <RegionPicker id={fid("region")} value={d.region} onChange={(region) => set({ region })} country={d.country} />
          </Field>
          <Field label="Country" htmlFor={fid("country")} optional error={errors.country}>
            <CountryPicker id={fid("country")} value={d.country} onChange={(country) => set({ country })} invalid={Boolean(errors.country)} />
          </Field>
        </FieldGrid>
      </FormSection>
    </div>
  );
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function TravelStep(p: StepProps & { today: string }) {
  const { d, set, errors, today } = p;
  const left = d.passportExpiry && /^\d{4}-\d{2}-\d{2}$/.test(d.passportExpiry) ? daysBetween(today, d.passportExpiry) : null;
  return (
    <div className="space-y-6">
      <FormSection title="Passport" description="Optional now, but the airline needs it before an international ticket is issued.">
        <div className="space-y-3">
          <FieldGrid cols={3}>
            <TextField k="passportNumber" label="Passport number" p={p} mono upper />
            <TextField k="passportExpiry" label="Expiry date" p={p} type="date" />
            <Field label="Issuing country" htmlFor={fid("passportCountry")} optional error={errors.passportCountry}>
              <CountryPicker id={fid("passportCountry")} value={d.passportCountry} onChange={(passportCountry) => set({ passportCountry })} invalid={Boolean(errors.passportCountry)} />
            </Field>
          </FieldGrid>
          {left !== null && left < 183 && (
            <Banner tone="warn">
              {left < 0 ? "This passport has expired. Ask for the new one before booking an international trip." : `This passport expires in ${left} days. Many countries need six months of validity.`}
            </Banner>
          )}
        </div>
      </FormSection>

      <FormSection title="Preferences" description="Passed to the airline when booking.">
        <FieldGrid cols={2}>
          <Field label="Seat" optional>
            <Segmented label="Seat preference" value={d.seat} onChange={(seat) => set({ seat })} options={SEATS} />
          </Field>
          <Field label="Special meal" htmlFor={fid("meal")} optional>
            <SelectField id={fid("meal")} value={d.meal} onChange={(meal) => set({ meal })} options={MEALS.includes(d.meal) || !d.meal ? MEALS : [d.meal, ...MEALS]} noneLabel="No special meal" />
          </Field>
          <Field label="Travel notes" htmlFor={fid("travelNotes")} optional className="sm:col-span-2" hint="Assistance, frequent routes, anything the agent should know">
            <Textarea id={fid("travelNotes")} rows={2} value={d.travelNotes} onChange={(e) => set({ travelNotes: e.target.value })} />
          </Field>
        </FieldGrid>
      </FormSection>

      <FormSection title="Emergency contact" description="Who to call if something goes wrong on the trip.">
        <FieldGrid cols={3}>
          <TextField k="emergencyName" label="Name" p={p} required={Boolean(d.emergencyPhone.trim() || d.emergencyRelation.trim())} />
          <TextField k="emergencyPhone" label="Phone" p={p} type="tel" inputMode="tel" required={Boolean(d.emergencyName.trim() || d.emergencyRelation.trim())} />
          <TextField k="emergencyRelation" label="Relationship" p={p} />
        </FieldGrid>
      </FormSection>
    </div>
  );
}

export function BillingStep(p: StepProps) {
  const { d, set } = p;
  return (
    <div className="space-y-6">
      <FormSection title="Invoicing">
        <FieldGrid cols={3}>
          <Field label="Invoice in" hint="Default for new bookings">
            <Segmented label="Default currency" value={d.defaultCurrency} onChange={(defaultCurrency) => set({ defaultCurrency })} options={CURRENCIES} />
          </Field>
          <TextField k="tin" label="TIN" p={p} mono hint="Only if they want it on invoices" />
          <Field label="How they reached us" htmlFor={fid("source")} optional>
            <SelectField id={fid("source")} value={d.source} onChange={(v) => set({ source: v as ProfileDraft["source"] })} options={CLIENT_SOURCES} noneLabel="Not recorded" />
          </Field>
        </FieldGrid>
      </FormSection>
      <NotesSection p={p} />
    </div>
  );
}

function NotesSection({ p }: { p: StepProps }) {
  return (
    <FormSection title="Notes" description="Seen by staff only, never printed.">
      <Textarea id={fid("notes")} aria-label="Notes" rows={3} value={p.d.notes} onChange={(e) => p.set({ notes: e.target.value })} />
    </FormSection>
  );
}

// ───────────────────────────── Organisations ─────────────────────────────

export function OrgStep(p: StepProps & { onJump: (s: StepId) => void }) {
  const { d, onJump } = p;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 rounded-lg bg-canvas px-3 py-2 text-[13.5px]">
        <Building2 className="size-4 text-ink-3" aria-hidden />
        <span className="font-semibold text-ink">{orgTypeLabel(d.orgType || undefined) ?? clientTypeLabel("corporate")}</span>
        {d.sector && (
          <>
            <span aria-hidden className="text-ink-4">
              ·
            </span>
            <span className="text-ink-2">{d.sector}</span>
          </>
        )}
        <Button type="button" variant="ghost" size="xs" className="ml-auto" onClick={() => onJump("type")}>
          Change
        </Button>
      </div>
      <FormSection title="Name">
        <FieldGrid cols={3}>
          <TextField k="legalName" label="Legal name" p={p} required className="sm:col-span-2" autoComplete="organization" hint="As registered. Printed on invoices and receipts." />
          <TextField k="website" label="Website" p={p} autoComplete="url" inputMode="url" />
        </FieldGrid>
      </FormSection>
      <FormSection title="Registration and tax">
        <FieldGrid cols={3}>
          <TextField k="registrationNumber" label="Registration number" p={p} mono upper hint="BRELA certificate number" />
          <TextField k="tin" label="TIN" p={p} mono hint="From the TRA certificate" />
          <TextField k="vrn" label="VRN" p={p} mono upper hint="Only if VAT-registered" />
        </FieldGrid>
      </FormSection>
    </div>
  );
}

export function AddressStep(p: StepProps) {
  const { d, set, errors } = p;
  const id = fid("postalAddress");
  return (
    <div className="space-y-6">
      <FormSection title="Where they are">
        <FieldGrid cols={3}>
          <TextField k="address" label="Physical address" p={p} className="sm:col-span-2" autoComplete="street-address" hint="Street, building and floor" />
          <Field label="P.O. Box" htmlFor={id} optional>
            <div className="relative">
              <span aria-hidden className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-ink-3">
                P.O. Box
              </span>
              <Input id={id} value={d.postalAddress} onChange={(e) => set({ postalAddress: e.target.value })} inputMode="numeric" className="tnum pl-[4.6rem]" autoComplete="off" />
            </div>
          </Field>
          <TextField k="city" label="City or town" p={p} autoComplete="address-level2" />
          <Field label="Region" htmlFor={fid("region")} optional>
            <RegionPicker id={fid("region")} value={d.region} onChange={(region) => set({ region })} country={d.country} />
          </Field>
          <Field label="Country" htmlFor={fid("country")} optional error={errors.country}>
            <CountryPicker id={fid("country")} value={d.country} onChange={(country) => set({ country })} invalid={Boolean(errors.country)} />
          </Field>
        </FieldGrid>
      </FormSection>
      <FormSection title="Reaching them">
        <FieldGrid cols={3}>
          <TextField k="phone" label="Main phone" p={p} required type="tel" inputMode="tel" autoComplete="tel" hint="Saved as +255…" />
          <TextField k="email" label="Email" p={p} type="email" autoComplete="email" />
          <TextField k="billingEmail" label="Billing email" p={p} type="email" hint="Invoices and statements go here" />
        </FieldGrid>
      </FormSection>
    </div>
  );
}

const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");

export function PeopleStep(p: StepProps) {
  const { d, set, errors } = p;
  const primaryKey = d.contacts.find((k) => k.primary)?.key ?? d.contacts[0]?.key ?? "";

  const update = (i: number, patch: Partial<ContactDraft>) =>
    set(
      { contacts: d.contacts.map((k, j) => (j === i ? { ...k, ...patch } : k)) },
      Object.keys(patch).flatMap((f) => (f === "email" || f === "phone" ? [`contacts.${i}.phone`, `contacts.${i}.email`] : [`contacts.${i}.${f}`])),
    );
  const remove = (i: number) => {
    const left = d.contacts.filter((_, j) => j !== i);
    if (d.contacts[i].primary && left.length) left[0] = { ...left[0], primary: true };
    // Errors are keyed by position, so clear them all rather than point at the wrong row.
    set(
      { contacts: left },
      Object.keys(errors).filter((k) => k.startsWith("contacts")),
    );
  };
  const add = () => {
    const n = d.contacts.length;
    set({ contacts: [...d.contacts, blankContact(n === 0)] }, ["contacts"]);
    requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById(fid(`contacts.${n}.name`))?.focus()));
  };

  return (
    <div className="space-y-4">
      {errors.contacts && <Banner tone="error">{errors.contacts}</Banner>}
      <RadioGroup value={primaryKey} onValueChange={(key) => set({ contacts: d.contacts.map((k) => ({ ...k, primary: k.key === key })) }, [])} className="gap-3" aria-label="Primary contact">
        {d.contacts.map((k, i) => {
          const e = (f: string) => errors[`contacts.${i}.${f}`];
          const idOf = (f: string) => fid(`contacts.${i}.${f}`);
          return (
            <fieldset key={k.key} className="min-w-0 rounded-xl border border-rule bg-paper">
              <legend className="sr-only">Contact {i + 1}</legend>
              <div className="flex items-center justify-between gap-3 border-b border-rule px-4 py-2.5">
                <span className="flex min-w-0 items-center gap-2.5">
                  <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-full bg-canvas-2 text-[11px] font-semibold text-ink-2">
                    {initialsOf(k.name) || i + 1}
                  </span>
                  <span className={cn("truncate text-sm font-semibold", k.name.trim() ? "text-ink" : "text-ink-3")}>{k.name.trim() || `Contact ${i + 1}`}</span>
                  {k.primary && <Badge variant="secondary">Primary</Badge>}
                </span>
                <Button type="button" variant="ghost" size="icon-sm" onClick={() => remove(i)} disabled={d.contacts.length === 1} aria-label={`Remove ${k.name.trim() || `contact ${i + 1}`}`}>
                  <Trash2 />
                </Button>
              </div>
              <div className="space-y-3.5 p-4">
                <FieldGrid cols={2}>
                  <Field label="Full name" htmlFor={idOf("name")} required error={e("name")}>
                    <Input id={idOf("name")} value={k.name} onChange={(ev) => update(i, { name: ev.target.value })} aria-invalid={Boolean(e("name")) || undefined} autoComplete="off" />
                  </Field>
                  <Field label="Role" htmlFor={idOf("role")} optional hint="Travel coordinator, finance manager…">
                    <Input id={idOf("role")} value={k.role} onChange={(ev) => update(i, { role: ev.target.value })} autoComplete="off" />
                  </Field>
                  <Field label="Phone" htmlFor={idOf("phone")} optional error={e("phone")} hint="A phone or an email is needed">
                    <Input
                      id={idOf("phone")}
                      type="tel"
                      inputMode="tel"
                      value={k.phone}
                      onChange={(ev) => update(i, { phone: ev.target.value })}
                      className="tnum"
                      aria-invalid={Boolean(e("phone")) || undefined}
                      autoComplete="off"
                    />
                  </Field>
                  <Field label="Email" htmlFor={idOf("email")} optional error={e("email")}>
                    <Input
                      id={idOf("email")}
                      type="email"
                      value={k.email}
                      onChange={(ev) => update(i, { email: ev.target.value })}
                      aria-invalid={Boolean(e("email")) || undefined}
                      autoComplete="off"
                    />
                  </Field>
                </FieldGrid>
                <div className="flex flex-wrap items-center gap-x-6 gap-y-2.5">
                  <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink-2">
                    <RadioGroupItem value={k.key} aria-label={`Primary contact: ${k.name.trim() || `contact ${i + 1}`}`} />
                    Primary contact
                  </label>
                  <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-ink-2">
                    <Checkbox checked={k.canBook} onCheckedChange={(v) => update(i, { canBook: v === true })} />
                    Can request bookings
                  </label>
                </div>
              </div>
            </fieldset>
          );
        })}
      </RadioGroup>
      <Button type="button" variant="outline" size="sm" onClick={add}>
        <Plus /> Add contact
      </Button>
    </div>
  );
}

export function PolicyStep(p: StepProps & { canSetCredit: boolean; termsDays: number; credit?: { limit?: Money; terms?: number } }) {
  const { d, set, errors, canSetCredit, termsDays, credit } = p;
  const names = d.contacts.filter((k) => k.name.trim()).map((k) => ({ value: k.name.trim(), label: k.name.trim(), hint: k.role.trim() || undefined }));
  const approverOptions = d.approver && !names.some((n) => n.value === d.approver) ? [{ value: d.approver, label: d.approver }, ...names] : names;
  return (
    <div className="space-y-6">
      <FormSection title="Departments and cost centres" description="Each booking can be charged to one of these.">
        <Field label="Departments" htmlFor={fid("departments")} optional hint="Press Enter after each one.">
          <TagInput id={fid("departments")} label="Add a department or cost centre" value={d.departments} onChange={(departments) => set({ departments })} suggestions={DEPARTMENT_SUGGESTIONS} />
        </Field>
      </FormSection>

      <FormSection title="Travel policy">
        <div className="space-y-3">
          <Field label="Default cabin" hint="Shown to the agent on every booking for them">
            <Segmented label="Default cabin" value={d.cabin} onChange={(cabin) => set({ cabin })} options={CABINS} />
          </Field>
          <SwitchRow
            id={fid("approvalRequired")}
            checked={d.approvalRequired}
            onChange={(approvalRequired) => set({ approvalRequired }, ["approver"])}
            title="Bookings need approval"
            description="Tickets are issued only after their approver says yes."
          >
            <FieldGrid cols={2}>
              <Field label="Approver" htmlFor={fid("approver")} required error={errors.approver} hint="Pick a contact, or type another name">
                <Combobox
                  id={fid("approver")}
                  value={d.approver || null}
                  onChange={(approver) => set({ approver })}
                  options={approverOptions}
                  placeholder="Choose approver"
                  searchPlaceholder="Name"
                  emptyText="Type the approver's name."
                  onCreate={(approver) => set({ approver })}
                  createLabel={(q) => `Use “${q}”`}
                  invalid={Boolean(errors.approver)}
                />
              </Field>
            </FieldGrid>
          </SwitchRow>
          <SwitchRow
            id={fid("poRequired")}
            checked={d.poRequired}
            onChange={(poRequired) => set({ poRequired })}
            title="PO or reference number required"
            description="Every booking must carry their purchase order or reference number."
          />
          <Field label="Policy notes" htmlFor={fid("policyNotes")} optional hint="Hotel limits, preferred airlines, who may fly business…">
            <Textarea id={fid("policyNotes")} rows={2} value={d.policyNotes} onChange={(e) => set({ policyNotes: e.target.value })} />
          </Field>
        </div>
      </FormSection>

      <FormSection title="Account">
        <FieldGrid cols={2}>
          <Field label="Invoice in" hint="Default for new bookings">
            <Segmented label="Default currency" value={d.defaultCurrency} onChange={(defaultCurrency) => set({ defaultCurrency })} options={CURRENCIES} />
          </Field>
          <Field label="How they reached us" htmlFor={fid("source")} optional>
            <SelectField id={fid("source")} value={d.source} onChange={(v) => set({ source: v as ProfileDraft["source"] })} options={CLIENT_SOURCES} noneLabel="Not recorded" />
          </Field>
          {canSetCredit ? (
            <>
              <Field label="Credit limit" htmlFor={fid("creditLimit")} optional hint="Leave empty for no credit" error={errors.creditLimit}>
                <MoneyInput
                  id={fid("creditLimit")}
                  placeholder=""
                  value={d.creditLimitMinor}
                  onChange={(creditLimitMinor) => set({ creditLimitMinor }, ["creditLimit"])}
                  currency={d.defaultCurrency}
                  invalid={Boolean(errors.creditLimit)}
                />
              </Field>
              <Field label="Payment terms" htmlFor={fid("paymentTermsDays")} optional hint={`Days to pay an invoice; ${termsDays} when empty`} error={errors.paymentTermsDays}>
                <div className="relative">
                  <Input
                    id={fid("paymentTermsDays")}
                    inputMode="numeric"
                    value={d.paymentTermsDays}
                    onChange={(e) => set({ paymentTermsDays: e.target.value.replace(/[^\d]/g, "").slice(0, 3) })}
                    className="tnum pr-12"
                    aria-invalid={inv(errors, "paymentTermsDays")}
                    autoComplete="off"
                  />
                  <span aria-hidden className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-ink-3">
                    days
                  </span>
                </div>
              </Field>
            </>
          ) : (
            <p className="flex items-start gap-2 rounded-lg bg-canvas px-3 py-2.5 text-[13px] leading-5 text-ink-3 sm:col-span-2">
              <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              <span>
                {credit?.limit || credit?.terms !== undefined
                  ? `${credit.limit ? `Credit limit ${format(credit.limit)}` : "No credit limit"} · ${credit.terms ?? termsDays}-day terms. Only a Manager can change these.`
                  : `A Manager sets the credit limit and payment terms. Until then, invoices follow the standard ${termsDays}-day terms.`}
              </span>
            </p>
          )}
        </FieldGrid>
      </FormSection>

      <NotesSection p={p} />
    </div>
  );
}
