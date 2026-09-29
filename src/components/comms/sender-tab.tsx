"use client";

import * as React from "react";

import { can } from "@/domain/permissions";
import { normalisePhone } from "@/domain/validation";
import { useMe } from "@/store";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Banner, Field, FieldGrid, FormSection } from "@/components/shared/field";
import { Section } from "@/components/shared/page";
import { SaveBar, ViewOnlyNote, useSettingsDraft } from "@/components/settings/settings-kit";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const SENDER_ID_RE = /^[A-Za-z0-9 ]{3,11}$/;

type Errors = Partial<Record<"senderName" | "smsSenderId" | "whatsappNumber" | "emailFrom" | "form", string>>;

/** Who messages come from: the sender name, SMS sender ID, WhatsApp business number, email address and signature. */
export function SenderTab() {
  const me = useMe();
  const canEdit = can(me, "comms.settings");
  const { draft, setDraft, dirty, discard, save } = useSettingsDraft((s) => ({
    senderName: s.comms.senderName,
    smsSenderId: s.comms.smsSenderId,
    whatsappNumber: s.comms.whatsappNumber,
    emailFrom: s.comms.emailFrom,
    emailSignature: s.comms.emailSignature,
  }));
  const [errors, setErrors] = React.useState<Errors>({});
  const ro = !canEdit;
  const set = (patch: Partial<typeof draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    setErrors({});
  };

  const onSave = () => {
    const er: Errors = {};
    if (!draft.senderName.trim()) er.senderName = "Enter the name clients see, e.g. Aeropath Travel.";
    if (!SENDER_ID_RE.test(draft.smsSenderId.trim())) er.smsSenderId = "Use 3 to 11 letters or digits, as registered with your SMS provider.";
    const wa = normalisePhone(draft.whatsappNumber);
    if (!wa) er.whatsappNumber = "Enter the WhatsApp Business number, e.g. +255 754 000 000.";
    if (!EMAIL_RE.test(draft.emailFrom.trim())) er.emailFrom = "Enter a valid address, e.g. bookings@aeropath.co.tz.";
    setErrors(er);
    if (Object.keys(er).length) return;
    const r = save({
      comms: {
        senderName: draft.senderName.trim(),
        smsSenderId: draft.smsSenderId.trim().toUpperCase(),
        whatsappNumber: wa!,
        emailFrom: draft.emailFrom.trim().toLowerCase(),
        emailSignature: draft.emailSignature.trim(),
      },
    });
    if (!r.ok) setErrors({ form: r.error.message });
  };

  return (
    <div>
      <Section
        title="Sender settings"
        description={
          <>
            How messages are signed and where they come from.
            {ro && <ViewOnlyNote className="mt-1.5" />}
          </>
        }
      >
        <div className="max-w-[720px] space-y-7">
          <Banner tone="info">This prototype records messages but does not deliver them. “Open in WhatsApp”, “Open in email app” and “Open SMS” send from your own device.</Banner>
          <FormSection title="Name">
            <Field label="Sender name" htmlFor="snd-name" error={errors.senderName} hint="Fills {company} in templates and heads WhatsApp and email.">
              <Input id="snd-name" value={draft.senderName} readOnly={ro} onChange={(e) => set({ senderName: e.target.value })} aria-invalid={Boolean(errors.senderName) || undefined} />
            </Field>
          </FormSection>
          <FormSection title="SMS and WhatsApp">
            <FieldGrid cols={2}>
              <Field label="SMS sender ID" htmlFor="snd-sms" error={errors.smsSenderId} hint="Shown instead of a number; registered with TCRA through your SMS provider.">
                <Input
                  id="snd-sms"
                  value={draft.smsSenderId}
                  readOnly={ro}
                  maxLength={11}
                  onChange={(e) => set({ smsSenderId: e.target.value.toUpperCase() })}
                  className="font-mono"
                  aria-invalid={Boolean(errors.smsSenderId) || undefined}
                />
              </Field>
              <Field label="WhatsApp Business number" htmlFor="snd-wa" error={errors.whatsappNumber}>
                <Input
                  id="snd-wa"
                  type="tel"
                  value={draft.whatsappNumber}
                  readOnly={ro}
                  onChange={(e) => set({ whatsappNumber: e.target.value })}
                  className="tnum"
                  aria-invalid={Boolean(errors.whatsappNumber) || undefined}
                />
              </Field>
            </FieldGrid>
          </FormSection>
          <FormSection title="Email">
            <FieldGrid cols={2}>
              <Field label="From address" htmlFor="snd-email" error={errors.emailFrom} className="sm:col-span-2">
                <Input id="snd-email" type="email" value={draft.emailFrom} readOnly={ro} onChange={(e) => set({ emailFrom: e.target.value })} aria-invalid={Boolean(errors.emailFrom) || undefined} />
              </Field>
              <Field label="Signature" htmlFor="snd-sig" hint="Added under every email." className="sm:col-span-2">
                <Textarea id="snd-sig" rows={4} value={draft.emailSignature} readOnly={ro} onChange={(e) => set({ emailSignature: e.target.value })} />
              </Field>
            </FieldGrid>
          </FormSection>
        </div>
      </Section>
      {canEdit && <SaveBar dirty={dirty} onDiscard={() => (discard(), setErrors({}))} onSave={onSave} error={errors.form} />}
    </div>
  );
}
