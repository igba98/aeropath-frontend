"use client";

import * as React from "react";
import { Building2, Pencil, UserRound } from "lucide-react";

import type { Currency } from "@/domain/types";
import { format } from "@/domain/money";
import { normalisePhone } from "@/domain/validation";
import { formatNida } from "@/domain/commands/createClient";
import { fmtDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CABINS, CLIENT_SOURCES, CLIENT_TITLES, SEATS, clientTypeLabel, countryName, idTypeShort, orgTypeLabel } from "./client-options";
import { fullName, withPoBox, type ProfileDraft, type StepId } from "./profile-draft";

/** Last step: everything entered, grouped like the steps, each group with an Edit link back to its step. */

type Row = { label: string; value: React.ReactNode; wide?: boolean };

const dash = <span className="text-ink-4">—</span>;
const txt = (v: string) => (v.trim() ? v.trim() : dash);
const mono = (v: string) => (v.trim() ? <span className="font-mono text-[13.5px] whitespace-nowrap">{v.trim().toUpperCase()}</span> : dash);
const phone = (v: string) => (v.trim() ? <span className="tnum whitespace-nowrap">{normalisePhone(v) ?? v.trim()}</span> : dash);
const country = (v: string) => (v.trim() ? countryName(v) : dash);
const place = (...parts: string[]) => {
  const s = [...new Set(parts.map((x) => x.trim()).filter(Boolean))];
  return s.length ? s.join(", ") : dash;
};
const money = (minor: number | null, currency: Currency) => (minor === null ? "No credit limit" : format({ amountMinor: minor, currency }));

/** Two columns of label/value rows; wide rows take a full line, and an odd last row stretches so no cell sits empty. */
function Group({ title, step, onEdit, rows, children }: { title: string; step: StepId; onEdit: (s: StepId) => void; rows?: Row[]; children?: React.ReactNode }) {
  const narrow = (rows ?? []).filter((r) => !r.wide);
  const stretch = narrow.length % 2 === 1 ? narrow[narrow.length - 1] : undefined;
  return (
    <section className="rounded-xl border border-rule bg-paper" aria-label={title}>
      <header className="flex items-center justify-between gap-3 px-4 pt-3 pb-2">
        <h4 className="text-sm font-semibold text-ink">{title}</h4>
        <Button type="button" variant="ghost" size="xs" onClick={() => onEdit(step)} aria-label={`Edit ${title.toLowerCase()}`}>
          <Pencil /> Edit
        </Button>
      </header>
      {rows && (
        <dl className="grid grid-cols-1 gap-x-6 px-4 pb-2 sm:grid-cols-2">
          {rows.map((r) => (
            <div
              key={r.label}
              className={
                r.wide ? "border-t border-rule py-2 text-sm sm:col-span-2" : cn("flex items-baseline justify-between gap-4 border-t border-rule py-2 text-sm", r === stretch && "sm:col-span-2")
              }
            >
              <dt className="shrink-0 text-ink-3">{r.label}</dt>
              <dd className={r.wide ? "mt-0.5 whitespace-pre-line text-ink" : "min-w-0 text-right break-words text-ink"}>{r.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {children}
    </section>
  );
}

export function ReviewStep({ d, onEdit, canSetCredit, termsDays }: { d: ProfileDraft; onEdit: (s: StepId) => void; canSetCredit: boolean; termsDays: number }) {
  const org = d.type === "corporate";
  const name = org ? d.legalName.trim() : fullName(d.firstName, d.lastName);
  const title = CLIENT_TITLES.find((t) => t.value === d.title)?.label.split(" ")[0];
  const Icon = org ? Building2 : UserRound;
  const source = CLIENT_SOURCES.find((x) => x.value === d.source)?.label ?? "Not recorded";

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3.5 rounded-xl bg-canvas px-4 py-3.5">
        <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-paper text-ink-2 ring-1 ring-rule">
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[17px] leading-6 font-semibold tracking-[-0.015em] break-words text-ink">{name || "Unnamed client"}</p>
          <p className="text-[13.5px] text-ink-3">
            {org ? [orgTypeLabel(d.orgType || undefined) ?? clientTypeLabel("corporate"), d.sector].filter(Boolean).join(" · ") : clientTypeLabel("individual")}
          </p>
        </div>
        <Button type="button" variant="ghost" size="xs" onClick={() => onEdit("type")}>
          Change
        </Button>
      </div>

      {org ? (
        <>
          <Group
            title="Organisation details"
            step="org"
            onEdit={onEdit}
            rows={[
              { label: "Legal name", value: txt(d.legalName) },
              { label: "Registration no.", value: mono(d.registrationNumber) },
              { label: "Website", value: d.website.trim() ? d.website.trim().replace(/^https?:\/\//i, "") : dash },
              { label: "TIN", value: mono(d.tin) },
              { label: "VRN", value: mono(d.vrn) },
            ]}
          />
          <Group
            title="Address and billing"
            step="address"
            onEdit={onEdit}
            rows={[
              { label: "Main phone", value: phone(d.phone) },
              { label: "Email", value: txt(d.email) },
              { label: "Billing email", value: d.billingEmail.trim() || (d.email.trim() ? <span className="text-ink-3">Main email</span> : dash) },
              { label: "P.O. Box", value: withPoBox(d.postalAddress) ?? dash },
              { label: "City and region", value: place(d.city, d.region) },
              { label: "Country", value: country(d.country) },
              { label: "Physical address", value: txt(d.address) },
            ]}
          />
          <Group title="People" step="people" onEdit={onEdit}>
            <ul className="px-4 pb-2">
              {d.contacts.map((k) => (
                <li key={k.key} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-rule py-2.5 text-sm">
                  <span className="min-w-0">
                    <span className="font-semibold text-ink">{k.name.trim() || "Unnamed contact"}</span>
                    {k.role.trim() && <span className="text-ink-3"> · {k.role.trim()}</span>}
                    <span className="block text-[13px] text-ink-3">
                      {[k.phone.trim() && (normalisePhone(k.phone) ?? k.phone.trim()), k.email.trim()].filter(Boolean).join(" · ") || "No phone or email"}
                    </span>
                  </span>
                  <span className="flex shrink-0 gap-1.5">
                    {k.primary && <Badge variant="secondary">Primary</Badge>}
                    {k.canBook && <Badge variant="secondary">Can book</Badge>}
                  </span>
                </li>
              ))}
            </ul>
          </Group>
          <Group
            title="Travel policy and account"
            step="policy"
            onEdit={onEdit}
            rows={[
              {
                label: "Departments",
                wide: true,
                value: d.departments.length ? (
                  <span className="flex flex-wrap gap-1.5">
                    {d.departments.map((x) => (
                      <Badge key={x} variant="secondary">
                        {x}
                      </Badge>
                    ))}
                  </span>
                ) : (
                  <span className="text-ink-4">None yet</span>
                ),
              },
              { label: "Default cabin", value: CABINS.find((c) => c.value === d.cabin)?.label },
              { label: "Approval", value: d.approvalRequired ? `By ${d.approver.trim() || "…"}` : "Not needed" },
              { label: "PO or reference", value: d.poRequired ? "Required" : "Optional" },
              { label: "Invoice in", value: d.defaultCurrency },
              ...(canSetCredit
                ? [
                    { label: "Credit limit", value: money(d.creditLimitMinor, d.defaultCurrency) },
                    { label: "Payment terms", value: d.paymentTermsDays.trim() ? `${Number(d.paymentTermsDays)} days` : `${termsDays} days (standard)` },
                  ]
                : []),
              { label: "Source", value: source },
              ...(d.policyNotes.trim() ? [{ label: "Policy notes", value: d.policyNotes.trim(), wide: true }] : []),
              ...(d.notes.trim() ? [{ label: "Notes", value: d.notes.trim(), wide: true }] : []),
            ]}
          />
        </>
      ) : (
        <>
          <Group
            title="Personal"
            step="personal"
            onEdit={onEdit}
            rows={[
              { label: "Name", value: txt([title, d.firstName, d.lastName].filter(Boolean).join(" ")) },
              { label: "Gender", value: d.gender === "F" ? "Female" : d.gender === "M" ? "Male" : dash },
              { label: "Date of birth", value: d.dateOfBirth ? <span className="tnum">{fmtDate(d.dateOfBirth)}</span> : dash },
              { label: "Nationality", value: country(d.nationality) },
              {
                label: "ID",
                value: d.idType ? (
                  <span>
                    {idTypeShort(d.idType)} {mono(d.idType === "nida" ? formatNida(d.idNumber) : d.idNumber)}
                  </span>
                ) : (
                  dash
                ),
              },
              { label: "Work", value: txt([d.occupation.trim(), d.employer.trim()].filter(Boolean).join(" at ")) },
            ]}
          />
          <Group
            title="Contact and address"
            step="contact"
            onEdit={onEdit}
            rows={[
              { label: "Phone", value: phone(d.phone) },
              { label: "Email", value: txt(d.email) },
              { label: "City and region", value: place(d.city, d.region) },
              { label: "Country", value: country(d.country) },
              { label: "Street address", value: txt(d.address) },
            ]}
          />
          <Group
            title="Travel documents and preferences"
            step="travel"
            onEdit={onEdit}
            rows={[
              { label: "Passport", value: mono(d.passportNumber) },
              { label: "Expires", value: d.passportExpiry ? <span className="tnum">{fmtDate(d.passportExpiry)}</span> : dash },
              { label: "Issued by", value: d.passportNumber.trim() ? country(d.passportCountry) : dash },
              { label: "Seat", value: SEATS.find((x) => x.value === d.seat)?.label ?? dash },
              { label: "Meal", value: txt(d.meal) },
              {
                label: "Emergency contact",
                value: d.emergencyName.trim()
                  ? [d.emergencyName.trim(), d.emergencyRelation.trim() && `(${d.emergencyRelation.trim()})`, d.emergencyPhone.trim() && (normalisePhone(d.emergencyPhone) ?? d.emergencyPhone)]
                      .filter(Boolean)
                      .join(" ")
                  : dash,
              },
              ...(d.travelNotes.trim() ? [{ label: "Travel notes", value: d.travelNotes.trim(), wide: true }] : []),
            ]}
          />
          <Group
            title="Billing"
            step="billing"
            onEdit={onEdit}
            rows={[
              { label: "Invoice in", value: d.defaultCurrency },
              { label: "TIN", value: mono(d.tin) },
              { label: "Source", value: source },
              ...(d.notes.trim() ? [{ label: "Notes", value: d.notes.trim(), wide: true }] : []),
            ]}
          />
        </>
      )}
    </div>
  );
}
