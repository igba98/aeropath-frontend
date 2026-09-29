"use client";

import * as React from "react";
import { ImageUp, Trash2 } from "lucide-react";

import { can } from "@/domain/permissions";
import { useMe } from "@/store";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldGrid, FormSection } from "@/components/shared/field";
import { SaveBar, TabHeading, useSettingsDraft } from "./settings-kit";

const MAX_LOGO_BYTES = 300 * 1024;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Settings → Company (spec §9.11): identity printed on every document. */
export function CompanyTab() {
  const me = useMe();
  const canEdit = can(me, "settings.edit");
  const { draft, setDraft, dirty, discard, save } = useSettingsDraft((s) => ({ company: s.company, paymentInstructions: s.paymentInstructions }));
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const fileRef = React.useRef<HTMLInputElement>(null);
  const c = draft.company;

  const set = (patch: Partial<typeof c>) => setDraft((d) => ({ ...d, company: { ...d.company, ...patch } }));

  const pickLogo = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setErrors((e) => ({ ...e, logo: "Choose an image file (PNG, JPG, SVG or WebP)." }));
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      setErrors((e) => ({ ...e, logo: `That image is ${Math.round(file.size / 1024)} KB. Choose one under 300 KB so it prints quickly.` }));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      set({ logoDataUrl: String(reader.result) });
      setErrors((e) => ({ ...e, logo: "" }));
    };
    reader.onerror = () => setErrors((e) => ({ ...e, logo: "Couldn't read that file. Try another image." }));
    reader.readAsDataURL(file);
  };

  const onSave = () => {
    const er: Record<string, string> = {};
    if (!c.name.trim()) er.name = "Enter the company name as registered.";
    if (c.email.trim() && !EMAIL_RE.test(c.email.trim())) er.email = "Enter a valid email address, e.g. info@aeropath.co.tz.";
    setErrors(er);
    if (Object.keys(er).length) return;
    const r = save({
      company: {
        name: c.name.trim(),
        tin: c.tin.trim(),
        vrn: c.vrn?.trim() ?? "",
        address: c.address.trim(),
        phone: c.phone.trim(),
        email: c.email.trim(),
        logoDataUrl: c.logoDataUrl ?? null,
      },
      paymentInstructions: draft.paymentInstructions.trim(),
    });
    if (!r.ok) setErrors({ form: r.error.message });
    else setErrors({});
  };

  const ro = !canEdit;

  return (
    <div>
      <TabHeading title="Company" description="Printed on invoices, quotes and receipts." viewOnly={ro} />
      <div className="max-w-[720px] space-y-7">
        <FormSection title="Identity">
          <FieldGrid cols={2}>
            <Field label="Company name" htmlFor="co-name" required error={errors.name} className="sm:col-span-2">
              <Input id="co-name" value={c.name} readOnly={ro} onChange={(e) => set({ name: e.target.value })} aria-invalid={Boolean(errors.name) || undefined} />
            </Field>
            <Field label="TIN" htmlFor="co-tin" hint="Taxpayer identification number">
              <Input id="co-tin" value={c.tin} readOnly={ro} onChange={(e) => set({ tin: e.target.value })} className="font-mono" />
            </Field>
            <Field label="VRN" htmlFor="co-vrn" optional hint="VAT registration number">
              <Input id="co-vrn" value={c.vrn ?? ""} readOnly={ro} onChange={(e) => set({ vrn: e.target.value })} className="font-mono" />
            </Field>
          </FieldGrid>
        </FormSection>

        <FormSection title="Contact">
          <FieldGrid cols={2}>
            <Field label="Phone" htmlFor="co-phone">
              <Input id="co-phone" type="tel" value={c.phone} readOnly={ro} onChange={(e) => set({ phone: e.target.value })} className="tnum" />
            </Field>
            <Field label="Email" htmlFor="co-email" error={errors.email}>
              <Input id="co-email" type="email" value={c.email} readOnly={ro} onChange={(e) => set({ email: e.target.value })} aria-invalid={Boolean(errors.email) || undefined} />
            </Field>
            <Field label="Address" htmlFor="co-addr" className="sm:col-span-2">
              <Textarea id="co-addr" rows={2} value={c.address} readOnly={ro} onChange={(e) => set({ address: e.target.value })} />
            </Field>
          </FieldGrid>
        </FormSection>

        <FormSection title="Logo" description="Shown at the top of printed documents. PNG or SVG on a white background prints best.">
          <div className="flex flex-wrap items-center gap-4">
            <div className="grid h-20 w-44 place-items-center overflow-hidden rounded-md border border-rule bg-paper">
              {c.logoDataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.logoDataUrl} alt={`${c.name} logo`} className="max-h-16 max-w-40 object-contain" />
              ) : (
                <span className="text-[13px] text-ink-4">No logo</span>
              )}
            </div>
            {canEdit && (
              <div className="flex flex-wrap items-center gap-2">
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" className="sr-only" aria-label="Upload logo" onChange={(e) => { pickLogo(e.target.files?.[0]); e.target.value = ""; }} />
                <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                  <ImageUp /> {c.logoDataUrl ? "Replace logo" : "Upload logo"}
                </Button>
                {c.logoDataUrl && (
                  <Button type="button" variant="danger-ghost" size="sm" onClick={() => set({ logoDataUrl: undefined })}>
                    <Trash2 /> Remove
                  </Button>
                )}
              </div>
            )}
          </div>
          {errors.logo && <p role="alert" className="mt-2 text-[13px] text-[var(--st-red-fg)]">{errors.logo}</p>}
          {!errors.logo && canEdit && <p className="mt-2 text-[13px] text-ink-3">Up to 300 KB. Stored in this browser with the rest of the demo data.</p>}
        </FormSection>

        <FormSection title="Payment instructions" description="Printed at the foot of every invoice, so clients know how to pay.">
          <Field label="Instructions" htmlFor="co-pay">
            <Textarea id="co-pay" rows={4} value={draft.paymentInstructions} readOnly={ro} onChange={(e) => setDraft((d) => ({ ...d, paymentInstructions: e.target.value }))} />
          </Field>
        </FormSection>
      </div>
      <SaveBar
        dirty={canEdit && dirty}
        error={errors.form || (errors.name || errors.email ? "Fix the fields marked above, then save." : null)}
        onDiscard={() => {
          discard();
          setErrors({});
        }}
        onSave={onSave}
      />
    </div>
  );
}
