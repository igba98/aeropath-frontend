"use client";

import * as React from "react";

import type { Currency, Supplier, SupplierKind } from "@/domain/types";
import { upsertSupplier } from "@/domain/commands";
import { SUPPLIER_KINDS } from "@/store/seed/reference";
import { useApp, useDispatch } from "@/store";

import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldGrid, FormSection } from "@/components/shared/field";
import { FilterSelect } from "@/components/shared/filter-select";
import { Segmented } from "@/components/shared/page";

/** Add or edit a supplier (Accountant or Manager). Used by Settings → Suppliers and Money out. */
export function SupplierDialog({ open, onOpenChange, supplier }: { open: boolean; onOpenChange: (o: boolean) => void; supplier?: Supplier }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">{open && <SupplierForm supplier={supplier} onDone={() => onOpenChange(false)} />}</DialogContent>
    </Dialog>
  );
}

function SupplierForm({ supplier, onDone }: { supplier?: Supplier; onDone: () => void }) {
  const dispatch = useDispatch();
  const defaultTerms = useApp((s) => s.db!.settings.defaultPaymentTermsDays);
  const airId = useApp((s) => s.db!.settings.airSettlement.supplierId);
  const [name, setName] = React.useState(supplier?.name ?? "");
  const [kind, setKind] = React.useState<SupplierKind>(supplier?.kind ?? "hotel");
  const [currency, setCurrency] = React.useState<Currency>(supplier?.currency ?? "USD");
  const [contactName, setContactName] = React.useState(supplier?.contactName ?? "");
  const [phone, setPhone] = React.useState(supplier?.phone ?? "");
  const [email, setEmail] = React.useState(supplier?.email ?? "");
  const [terms, setTerms] = React.useState(String(supplier?.paymentTermsDays ?? defaultTerms));
  const [notes, setNotes] = React.useState(supplier?.notes ?? "");
  const [active, setActive] = React.useState(supplier?.active ?? true);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const isAir = supplier && supplier.id === airId;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    const days = Number(terms);
    if (!name.trim()) er.name = "Enter the supplier's name.";
    if (!Number.isInteger(days) || days < 0 || days > 365) er.paymentTermsDays = "Enter whole days between 0 and 365 (0 = pay on issue).";
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) er.email = "Enter a valid email address or leave it blank.";
    setErrors(er);
    if (Object.keys(er).length) return;
    const r = dispatch(
      upsertSupplier,
      {
        supplier: {
          id: supplier?.id,
          name: name.trim(),
          kind,
          currency,
          contactName: contactName.trim() || undefined,
          phone: phone.trim() || undefined,
          email: email.trim() || undefined,
          paymentTermsDays: days,
          notes: notes.trim() || undefined,
          active,
        },
      },
      { quietErrors: true },
    );
    if (r.ok) return onDone();
    const field = r.error.field?.split(".").pop();
    setErrors(field && ["name", "email", "phone", "paymentTermsDays", "active"].includes(field) ? { [field]: r.error.message } : { form: r.error.message });
  };

  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-col">
      <DialogHeader>
        <DialogTitle>{supplier ? `Edit ${supplier.name}` : "Add supplier"}</DialogTitle>
        <DialogDescription>Service lines name their supplier; what we owe them shows in Money out.</DialogDescription>
      </DialogHeader>
      <DialogBody className="space-y-5">
        <FormSection title="Supplier">
          <FieldGrid cols={2}>
            <Field label="Name" htmlFor="sup-name" required error={errors.name} className="sm:col-span-2">
              <Input id="sup-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus aria-invalid={Boolean(errors.name) || undefined} />
            </Field>
            <Field label="Kind" hint={kind === "air_settlement" ? "Where ticket money goes: BSP Tanzania or the consolidator." : undefined}>
              <FilterSelect label="Kind" value={kind} onChange={(v) => setKind(v as SupplierKind)} options={SUPPLIER_KINDS} full />
            </Field>
            <Field label="Currency" hint="The currency we pay them in.">
              <Segmented<Currency> label="Currency" value={currency} onChange={setCurrency} options={[{ value: "TZS", label: "TZS" }, { value: "USD", label: "USD" }]} />
            </Field>
            <Field label="Payment terms" htmlFor="sup-terms" error={errors.paymentTermsDays} hint="Days after issue before a line counts as overdue.">
              <div className="flex items-center gap-2">
                <Input id="sup-terms" inputMode="numeric" value={terms} onChange={(e) => setTerms(e.target.value.replace(/\D/g, ""))} className="tnum w-20 text-right" aria-invalid={Boolean(errors.paymentTermsDays) || undefined} />
                <span className="text-sm text-ink-3">days</span>
              </div>
            </Field>
          </FieldGrid>
        </FormSection>
        <FormSection title="Contact">
          <FieldGrid cols={2}>
            <Field label="Contact person" htmlFor="sup-contact" optional>
              <Input id="sup-contact" value={contactName} onChange={(e) => setContactName(e.target.value)} />
            </Field>
            <Field label="Phone" htmlFor="sup-phone" optional error={errors.phone}>
              <Input id="sup-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="tnum" />
            </Field>
            <Field label="Email" htmlFor="sup-email" optional error={errors.email} className="sm:col-span-2">
              <Input id="sup-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={Boolean(errors.email) || undefined} />
            </Field>
            <Field label="Notes" htmlFor="sup-notes" optional className="sm:col-span-2" hint="Bank details, account numbers, anything the Accountant needs to pay them.">
              <Textarea id="sup-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </FieldGrid>
        </FormSection>
        {supplier && (
          <label className="flex items-start gap-3 border-t border-rule pt-4">
            <Switch checked={active} onCheckedChange={setActive} className="mt-0.5" disabled={isAir && active} />
            <span className="text-sm leading-5">
              <span className="block font-medium text-ink">Active</span>
              <span className="block text-ink-3">
                {isAir ? "This is the air settlement supplier. Choose another one in Settings → Suppliers before deactivating it." : "Inactive suppliers keep their history and balances but can't be picked for new services."}
              </span>
              {errors.active && <span className="mt-1 block text-[13px] text-[var(--st-red-fg)]">{errors.active}</span>}
            </span>
          </label>
        )}
        {errors.form && <p role="alert" className="text-sm text-[var(--st-red-fg)]">{errors.form}</p>}
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">{supplier ? "Save changes" : "Add supplier"}</Button>
      </DialogFooter>
    </form>
  );
}
