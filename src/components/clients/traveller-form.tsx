"use client";

import * as React from "react";
import type { ID, PaxType, Title, Traveller } from "@/domain/types";
import { upsertTraveller } from "@/domain/commands";
import { useDispatch } from "@/store";
import { daysUntil } from "@/lib/dates";

import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field, FieldGrid, FormSection } from "@/components/shared/field";
import { FilterSelect } from "@/components/shared/filter-select";
import { Segmented } from "@/components/shared/page";

const TITLES: Title[] = ["MR", "MRS", "MS", "MSTR", "MISS"];

export interface TravellerDraftForm {
  title: Title;
  givenName: string;
  surname: string;
  paxType: PaxType;
  dateOfBirth: string;
  gender: "" | "M" | "F";
  nationality: string;
  passportNumber: string;
  passportExpiry: string;
  passportCountry: string;
  phone: string;
  email: string;
}

export function travellerDraftFrom(t?: Traveller): TravellerDraftForm {
  return {
    title: t?.title ?? "MR",
    givenName: t?.givenName ?? "",
    surname: t?.surname ?? "",
    paxType: t?.paxType ?? "ADT",
    dateOfBirth: t?.dateOfBirth ?? "",
    gender: t?.gender ?? "",
    nationality: t?.nationality ?? "TZ",
    passportNumber: t?.passportNumber ?? "",
    passportExpiry: t?.passportExpiry ?? "",
    passportCountry: t?.passportCountry ?? "",
    phone: t?.phone ?? "",
    email: t?.email ?? "",
  };
}

const NAME_RE = /^[A-Za-z][A-Za-z' -]*$/;

export function validateTraveller(v: TravellerDraftForm): Record<string, string> {
  const e: Record<string, string> = {};
  if (!v.givenName.trim()) e.givenName = "Enter the given name as in the passport.";
  else if (!NAME_RE.test(v.givenName.trim())) e.givenName = "Letters, spaces, hyphens and apostrophes only.";
  if (!v.surname.trim()) e.surname = "Enter the surname as in the passport.";
  else if (!NAME_RE.test(v.surname.trim())) e.surname = "Letters, spaces, hyphens and apostrophes only.";
  if ((v.paxType === "CHD" || v.paxType === "INF") && !v.dateOfBirth) e.dateOfBirth = "Children and infants need a date of birth.";
  if (v.nationality && !/^[A-Za-z]{2}$/.test(v.nationality)) e.nationality = "2-letter code, e.g. TZ.";
  if (v.passportCountry && !/^[A-Za-z]{2}$/.test(v.passportCountry)) e.passportCountry = "2-letter code, e.g. TZ.";
  return e;
}

/** Title auto-follows the passenger type so the common case takes no extra clicks. */
function titleFor(pax: PaxType, prev: Title): Title {
  if (pax === "ADT") return prev === "MSTR" ? "MR" : prev === "MISS" ? "MS" : prev;
  return prev === "MRS" || prev === "MS" || prev === "MISS" ? "MISS" : "MSTR";
}

export function TravellerFields({ value: v, onChange, errors }: { value: TravellerDraftForm; onChange: (v: TravellerDraftForm) => void; errors: Record<string, string> }) {
  const set = (p: Partial<TravellerDraftForm>) => onChange({ ...v, ...p });
  const expiryDays = v.passportExpiry ? daysUntil(v.passportExpiry) : null;
  return (
    <div className="space-y-4">
      <FieldGrid cols={2}>
        <Field label="Passenger type">
          <Segmented
            label="Passenger type"
            value={v.paxType}
            onChange={(p) => set({ paxType: p, title: titleFor(p, v.title) })}
            options={[
              { value: "ADT", label: "Adult" },
              { value: "CHD", label: "Child" },
              { value: "INF", label: "Infant" },
            ]}
          />
        </Field>
        <Field label="Title">
          <FilterSelect label="Title" value={v.title} onChange={(t) => set({ title: t as Title, gender: t === "MR" || t === "MSTR" ? "M" : "F" })} options={TITLES.map((t) => ({ value: t, label: t }))} full />
        </Field>
        <Field label="Given name(s)" htmlFor="tv-given" required error={errors.givenName} hint="As in the passport">
          <Input id="tv-given" value={v.givenName} onChange={(e) => set({ givenName: e.target.value.toUpperCase() })} autoFocus className="uppercase" aria-invalid={Boolean(errors.givenName) || undefined} />
        </Field>
        <Field label="Surname" htmlFor="tv-sur" required error={errors.surname}>
          <Input id="tv-sur" value={v.surname} onChange={(e) => set({ surname: e.target.value.toUpperCase() })} className="uppercase" aria-invalid={Boolean(errors.surname) || undefined} />
        </Field>
        <Field label="Date of birth" htmlFor="tv-dob" required={v.paxType !== "ADT"} optional={v.paxType === "ADT"} error={errors.dateOfBirth}>
          <Input id="tv-dob" type="date" value={v.dateOfBirth} onChange={(e) => set({ dateOfBirth: e.target.value })} className="tnum" />
        </Field>
        <Field label="Nationality" htmlFor="tv-nat" optional error={errors.nationality}>
          <Input id="tv-nat" value={v.nationality} maxLength={2} onChange={(e) => set({ nationality: e.target.value.toUpperCase() })} className="font-mono uppercase" placeholder="TZ" />
        </Field>
      </FieldGrid>
      <FormSection title="Passport" description="Optional now; needed before ticketing international trips.">
        <FieldGrid cols={3}>
          <Field label="Number" htmlFor="tv-pp">
            <Input id="tv-pp" value={v.passportNumber} onChange={(e) => set({ passportNumber: e.target.value.toUpperCase() })} className="font-mono uppercase" />
          </Field>
          <Field
            label="Expires"
            htmlFor="tv-ppx"
            hint={expiryDays !== null && expiryDays < 183 ? (expiryDays < 0 ? "Expired" : `Expires in ${expiryDays} days; many countries need 6 months`) : undefined}
          >
            <Input id="tv-ppx" type="date" value={v.passportExpiry} onChange={(e) => set({ passportExpiry: e.target.value })} className="tnum" />
          </Field>
          <Field label="Issued by" htmlFor="tv-ppc" error={errors.passportCountry}>
            <Input id="tv-ppc" value={v.passportCountry} maxLength={2} onChange={(e) => set({ passportCountry: e.target.value.toUpperCase() })} className="font-mono uppercase" placeholder="TZ" />
          </Field>
        </FieldGrid>
      </FormSection>
    </div>
  );
}

export function travellerInput(v: TravellerDraftForm, clientId: ID, id?: ID) {
  return {
    traveller: {
      id,
      clientId,
      title: v.title,
      givenName: v.givenName.trim(),
      surname: v.surname.trim(),
      paxType: v.paxType,
      dateOfBirth: v.dateOfBirth || undefined,
      gender: v.gender || undefined,
      nationality: v.nationality || undefined,
      passportNumber: v.passportNumber || undefined,
      passportExpiry: v.passportExpiry || undefined,
      passportCountry: v.passportCountry || undefined,
      phone: v.phone || undefined,
      email: v.email || undefined,
    },
  };
}

/** Add or edit a traveller in a dialog. `onSaved` gets the traveller id. */
export function TravellerDialog({
  open,
  onOpenChange,
  clientId,
  traveller,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  clientId: ID;
  traveller?: Traveller;
  onSaved?: (id: ID) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        {open && <TravellerDialogBody clientId={clientId} traveller={traveller} onClose={() => onOpenChange(false)} onSaved={onSaved} />}
      </DialogContent>
    </Dialog>
  );
}

function TravellerDialogBody({ clientId, traveller, onClose, onSaved }: { clientId: ID; traveller?: Traveller; onClose: () => void; onSaved?: (id: ID) => void }) {
  const dispatch = useDispatch();
  const [v, setV] = React.useState(() => travellerDraftFrom(traveller));
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const er = validateTraveller(v);
    setErrors(er);
    if (Object.keys(er).length) return;
    const r = dispatch(upsertTraveller, travellerInput(v, clientId, traveller?.id));
    if (r.ok) {
      onSaved?.((r.result as { travellerId: ID }).travellerId);
      onClose();
    }
  };
  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-col">
      <DialogHeader>
        <DialogTitle>{traveller ? `Edit ${traveller.givenName} ${traveller.surname}` : "Add traveller"}</DialogTitle>
        <DialogDescription>Names are stored in capitals, exactly as in the passport, so they match the PNR.</DialogDescription>
      </DialogHeader>
      <DialogBody>
        <TravellerFields value={v} onChange={setV} errors={errors} />
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit">{traveller ? "Save traveller" : "Add traveller"}</Button>
      </DialogFooter>
    </form>
  );
}
