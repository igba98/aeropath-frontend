"use client";

import * as React from "react";
import { Building2, UserRound } from "lucide-react";

import type { Client, ClientSource, Currency, ID } from "@/domain/types";
import { can } from "@/domain/permissions";
import { createClient, updateClient } from "@/domain/commands";
import { useDispatch, useMe } from "@/store";
import { useModals } from "@/store/modals";
import { cn } from "@/lib/utils";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldGrid } from "@/components/shared/field";
import { MoneyInput } from "@/components/shared/money-input";
import { Segmented } from "@/components/shared/page";
import { FilterSelect } from "@/components/shared/filter-select";
import { CLIENT_SOURCES } from "./client-options";
import { ClientStepperDialog } from "./client-stepper";

export { CLIENT_SOURCES };

export interface ClientDraft {
  type: Client["type"];
  name: string;
  phone: string;
  email: string;
  address: string;
  tin: string;
  vrn: string;
  contactPerson: string;
  creditLimitMinor: number | null;
  paymentTermsDays: string;
  defaultCurrency: Currency;
  source: ClientSource | "";
  notes: string;
}

export function clientDraftFrom(c?: Client, seed?: Partial<ClientDraft>): ClientDraft {
  return {
    type: c?.type ?? "individual",
    name: c?.name ?? "",
    phone: c?.phone ?? "",
    email: c?.email ?? "",
    address: c?.address ?? "",
    tin: c?.tin ?? "",
    vrn: c?.vrn ?? "",
    contactPerson: c?.contactPerson ?? "",
    creditLimitMinor: c?.creditLimit?.amountMinor ?? null,
    paymentTermsDays: c?.paymentTermsDays !== undefined ? String(c.paymentTermsDays) : "",
    defaultCurrency: c?.defaultCurrency ?? "TZS",
    source: c?.source ?? "",
    notes: c?.notes ?? "",
    ...seed,
  };
}

/**
 * Quick client fields (the booking wizard's inline new client). Only type, name and phone are needed to start;
 * organisation and credit fields appear when relevant (credit and terms are Manager only). The full profile is the
 * stepper (NewClientModal).
 */
export function ClientFields({ value: v, onChange, errors, compact }: { value: ClientDraft; onChange: (v: ClientDraft) => void; errors: Record<string, string>; compact?: boolean }) {
  const me = useMe();
  const set = (p: Partial<ClientDraft>) => onChange({ ...v, ...p });
  const corp = v.type === "corporate";
  const manager = can(me, "client.set_credit");
  return (
    <div className="space-y-4">
      <Segmented
        label="Client type"
        value={v.type}
        onChange={(t) => set({ type: t })}
        options={[
          { value: "individual", label: <span className="inline-flex items-center gap-1.5"><UserRound className="size-3.5" /> Individual</span> },
          { value: "corporate", label: <span className="inline-flex items-center gap-1.5"><Building2 className="size-3.5" /> Organisation</span> },
        ]}
      />
      <FieldGrid cols={2}>
        <Field label={corp ? "Organisation name" : "Full name"} htmlFor="cl-name" required error={errors.name} className={cn(!compact && "sm:col-span-2")}>
          <Input id="cl-name" value={v.name} onChange={(e) => set({ name: e.target.value })} autoFocus aria-invalid={Boolean(errors.name) || undefined} />
        </Field>
        <Field label="Phone" htmlFor="cl-phone" required error={errors.phone} hint="Local or international; saved as +255…">
          <Input id="cl-phone" type="tel" inputMode="tel" value={v.phone} onChange={(e) => set({ phone: e.target.value })} aria-invalid={Boolean(errors.phone) || undefined} className="tnum" />
        </Field>
        <Field label="Email" htmlFor="cl-email" optional error={errors.email}>
          <Input id="cl-email" type="email" value={v.email} onChange={(e) => set({ email: e.target.value })} aria-invalid={Boolean(errors.email) || undefined} />
        </Field>
        {corp && (
          <>
            <Field label="Contact person" htmlFor="cl-contact" optional>
              <Input id="cl-contact" value={v.contactPerson} onChange={(e) => set({ contactPerson: e.target.value })} />
            </Field>
            <Field label="TIN" htmlFor="cl-tin" optional error={errors.tin}>
              <Input id="cl-tin" value={v.tin} onChange={(e) => set({ tin: e.target.value })} className="font-mono" />
            </Field>
            <Field label="VRN" htmlFor="cl-vrn" optional>
              <Input id="cl-vrn" value={v.vrn} onChange={(e) => set({ vrn: e.target.value })} className="font-mono" />
            </Field>
          </>
        )}
        <Field label="Invoice in">
          <Segmented label="Default currency" value={v.defaultCurrency} onChange={(c) => set({ defaultCurrency: c })} options={[{ value: "TZS", label: "TZS" }, { value: "USD", label: "USD" }]} />
        </Field>
        <Field label="How they reached us" optional>
          <FilterSelect label="Source" value={v.source || "all"} onChange={(s) => set({ source: s === "all" ? "" : (s as ClientSource) })} options={[{ value: "all", label: "Not recorded" }, ...CLIENT_SOURCES]} full />
        </Field>
      </FieldGrid>
      {corp && manager && (
        <FieldGrid cols={2} className="rounded-md border border-rule bg-canvas p-3">
          <Field label="Credit limit" htmlFor="cl-credit" optional hint="Manager only" error={errors.creditLimit}>
            <MoneyInput id="cl-credit" placeholder="" value={v.creditLimitMinor} onChange={(m) => set({ creditLimitMinor: m })} currency={v.defaultCurrency} />
          </Field>
          <Field label="Payment terms (days)" htmlFor="cl-terms" optional hint="Days to pay an invoice" error={errors.paymentTermsDays}>
            <Input id="cl-terms" type="number" inputMode="numeric" min={0} max={365} value={v.paymentTermsDays} onChange={(e) => set({ paymentTermsDays: e.target.value })} className="tnum" />
          </Field>
        </FieldGrid>
      )}
      {!compact && (
        <>
          <Field label="Address" htmlFor="cl-address" optional>
            <Input id="cl-address" value={v.address} onChange={(e) => set({ address: e.target.value })} />
          </Field>
          <Field label="Notes" htmlFor="cl-notes" optional>
            <Textarea id="cl-notes" rows={2} value={v.notes} onChange={(e) => set({ notes: e.target.value })} />
          </Field>
        </>
      )}
    </div>
  );
}

/** Client-side checks with the same plain-words messages the domain uses. */
export function validateClientDraft(v: ClientDraft): Record<string, string> {
  const e: Record<string, string> = {};
  if (!v.name.trim()) e.name = v.type === "corporate" ? "Enter the organisation's name." : "Enter the client's name.";
  const digits = v.phone.replace(/[^\d+]/g, "");
  if (!digits) e.phone = "Enter a phone number so we can reach them.";
  else if (!/^(\+?\d{9,15}|0\d{9})$/.test(digits)) e.phone = "That doesn't look like a phone number. Use 0754 000 111 or +255 754 000 111.";
  if (v.email && !/^\S+@\S+\.\S+$/.test(v.email)) e.email = "Check the email address.";
  if (v.paymentTermsDays && !/^\d{1,3}$/.test(v.paymentTermsDays)) e.paymentTermsDays = "Whole days, 0 to 365.";
  return e;
}

export function draftToInput(v: ClientDraft, includeCredit: boolean) {
  const corp = v.type === "corporate";
  return {
    type: v.type,
    name: v.name.trim(),
    phone: v.phone.trim(),
    email: v.email.trim() || undefined,
    address: v.address.trim() || undefined,
    tin: corp ? v.tin.trim() || undefined : undefined,
    vrn: corp ? v.vrn.trim() || undefined : undefined,
    contactPerson: corp ? v.contactPerson.trim() || undefined : undefined,
    creditLimit: corp && includeCredit && v.creditLimitMinor !== null ? { amountMinor: v.creditLimitMinor, currency: v.defaultCurrency } : undefined,
    paymentTermsDays: corp && includeCredit && v.paymentTermsDays ? Number(v.paymentTermsDays) : undefined,
    defaultCurrency: v.defaultCurrency,
    source: v.source || undefined,
    notes: v.notes.trim() || undefined,
  };
}

/** Create or edit a client. Returns the client id on success. */
export function useSaveClient() {
  const me = useMe();
  const dispatch = useDispatch();
  return React.useCallback(
    (v: ClientDraft, existing?: Client): ID | null => {
      const input = draftToInput(v, can(me, "client.set_credit"));
      if (existing) {
        const patch: Record<string, unknown> = { ...input };
        if (!can(me, "client.set_credit")) {
          delete patch.creditLimit;
          delete patch.paymentTermsDays;
        } else if (v.type === "corporate") {
          if (input.creditLimit === undefined) patch.creditLimit = null;
          if (input.paymentTermsDays === undefined) patch.paymentTermsDays = null;
        }
        for (const k of ["email", "address", "tin", "vrn", "contactPerson", "source", "notes"]) if (patch[k] === undefined) patch[k] = null;
        const r = dispatch(updateClient, { clientId: existing.id, patch });
        return r.ok ? existing.id : null;
      }
      const r = dispatch(createClient, input);
      return r.ok ? (r.result as { clientId: ID }).clientId : null;
    },
    [dispatch, me],
  );
}

/** Global "New client" modal: the client stepper, opened with useModals().openClient({ onCreated }). */
export function NewClientModal() {
  const st = useModals((s) => s.client);
  const close = useModals((s) => s.close);
  return <ClientStepperDialog open={st.open} onOpenChange={(o) => !o && close("client")} onCreated={st.onCreated} />;
}
