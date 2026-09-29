"use client";

import * as React from "react";

import type { Currency, LineType, Money, Settings } from "@/domain/types";
import { can } from "@/domain/permissions";
import { LINE_TYPES } from "@/store/seed/reference";
import { useMe } from "@/store";

import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Field, FieldGrid, FormSection } from "@/components/shared/field";
import { Segmented } from "@/components/shared/page";
import { MoneyInput } from "@/components/shared/money-input";
import { LINE_ICON } from "@/components/shared/bits";
import { SaveBar, TabHeading, useSettingsDraft } from "./settings-kit";

type Draft = Pick<Settings, "vatRate" | "vatBase" | "defaultServiceFee" | "refundApprovalLimit" | "voidWindow">;

const VAT_BASE_HINT: Record<Settings["vatBase"], string> = {
  service_fee: "VAT is charged on the agency's service fee only. Fares and supplier costs pass through without VAT.",
  service_fee_and_markup: "VAT is charged on the service fee and on the markup hidden in the selling price.",
};

/** Settings → Fees and tax. */
export function FeesTab() {
  const me = useMe();
  const canEdit = can(me, "settings.edit");
  const ro = !canEdit;
  const { draft, setDraft, dirty, discard, save } = useSettingsDraft<Draft>((s) => ({
    vatRate: s.vatRate,
    vatBase: s.vatBase,
    defaultServiceFee: s.defaultServiceFee,
    refundApprovalLimit: s.refundApprovalLimit,
    voidWindow: s.voidWindow,
  }));
  const [vatText, setVatText] = React.useState(() => String(+(draft.vatRate * 100).toFixed(2)));
  const [hoursText, setHoursText] = React.useState(() => (typeof draft.voidWindow === "object" ? String(draft.voidWindow.hours) : "24"));
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  // Keep the text boxes in step after Save or Discard.
  const vatKey = draft.vatRate;
  const [vatBaseline, setVatBaseline] = React.useState(vatKey);
  if (vatBaseline !== vatKey) {
    setVatBaseline(vatKey);
    if (Number(vatText) / 100 !== vatKey) setVatText(String(+(vatKey * 100).toFixed(2)));
  }

  const setFee = (t: LineType, minor: number | null, currency: Currency) =>
    setDraft((d) => {
      const next = { ...d.defaultServiceFee };
      if (minor === null) delete next[t];
      else next[t] = { amountMinor: minor, currency };
      return { ...d, defaultServiceFee: next };
    });

  const onSave = () => {
    const er: Record<string, string> = {};
    const vat = Number(vatText);
    if (vatText.trim() === "" || !Number.isFinite(vat) || vat < 0 || vat > 100) er.vat = "Enter VAT as a percentage between 0 and 100, e.g. 18.";
    let voidWindow: Settings["voidWindow"] = "same_day";
    if (draft.voidWindow !== "same_day") {
      const h = Number(hoursText);
      if (!Number.isFinite(h) || h <= 0 || h > 168) er.hours = "Enter between 1 and 168 hours.";
      else voidWindow = { hours: h };
    }
    setErrors(er);
    if (Object.keys(er).length) return;
    // Removed fee types are sent as null so the deep merge deletes them.
    const fees: Partial<Record<LineType, Money | null>> = { ...draft.defaultServiceFee };
    for (const { value } of LINE_TYPES) if (!draft.defaultServiceFee[value]) fees[value] = null;
    const r = save({ vatRate: +(vat / 100).toFixed(4), vatBase: draft.vatBase, defaultServiceFee: fees, refundApprovalLimit: draft.refundApprovalLimit, voidWindow });
    setErrors(r.ok ? {} : { form: r.error.message });
  };

  const hasErrors = Object.keys(errors).some((k) => k !== "form" && errors[k]);

  return (
    <div>
      <TabHeading title="Fees and tax" description="Used when pricing new service lines and deciding who approves a refund." viewOnly={ro} />
      <div className="max-w-[720px] space-y-7">
        <FormSection title="VAT">
          <FieldGrid cols={2}>
            <Field label="VAT rate" htmlFor="fee-vat" error={errors.vat}>
              <div className="flex items-center gap-2">
                <Input
                  id="fee-vat"
                  inputMode="decimal"
                  value={vatText}
                  readOnly={ro}
                  onChange={(e) => {
                    const t = e.target.value.replace(/[^\d.]/g, "");
                    setVatText(t);
                    const n = Number(t);
                    if (t !== "" && Number.isFinite(n)) setDraft((d) => ({ ...d, vatRate: n / 100 }));
                  }}
                  className="tnum w-24 text-right"
                  aria-invalid={Boolean(errors.vat) || undefined}
                />
                <span className="text-sm text-ink-3">%</span>
              </div>
            </Field>
            <Field label="VAT is charged on" hint={VAT_BASE_HINT[draft.vatBase]}>
              {ro ? (
                <p className="flex h-8 items-center text-sm text-ink">{draft.vatBase === "service_fee" ? "Service fee" : "Service fee + markup"}</p>
              ) : (
                <Segmented
                  label="VAT base"
                  value={draft.vatBase}
                  onChange={(v) => setDraft((d) => ({ ...d, vatBase: v }))}
                  options={[
                    { value: "service_fee", label: "Service fee" },
                    { value: "service_fee_and_markup", label: "Service fee + markup" },
                  ]}
                />
              )}
            </Field>
          </FieldGrid>
        </FormSection>

        <FormSection title="Default service fee" description="Filled in when an agent adds a service. They can change it per line. Leave blank for no default.">
          <Table containerClassName="overflow-visible">
            <TableHeader>
              <TableRow className="rule-head border-0">
                <TableHead className="h-auto px-0 pb-1.5 first:pl-0">Service</TableHead>
                <TableHead className="h-auto w-56 px-0 pb-1.5 text-right last:pr-0">Fee</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {LINE_TYPES.map((t) => {
                const fee = draft.defaultServiceFee[t.value];
                const Icon = LINE_ICON[t.value];
                const cur = fee?.currency ?? "TZS";
                return (
                  <TableRow key={t.value}>
                    <TableCell className="px-0 py-1.5 first:pl-0">
                      <span className="flex items-center gap-2 text-ink-2">
                        <Icon className="size-3.5 text-ink-3" aria-hidden />
                        {t.label}
                      </span>
                    </TableCell>
                    <TableCell className="px-0 py-1.5 last:pr-0">
                      <MoneyInput
                        value={fee?.amountMinor ?? null}
                        onChange={(v) => setFee(t.value, v, cur)}
                        currency={cur}
                        onCurrencyChange={ro ? undefined : (c) => fee && setFee(t.value, fee.amountMinor, c)}
                        readOnly={ro}
                        placeholder="No default"
                        aria-label={`Default service fee for ${t.label}`}
                        className="ml-auto w-56"
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </FormSection>

        <FormSection title="Refunds and voids">
          <FieldGrid cols={2}>
            <Field label="Refund approval limit" htmlFor="fee-limit" hint="Accountants approve client refunds up to this amount. Above it, a Manager must approve.">
              <MoneyInput id="fee-limit" value={draft.refundApprovalLimit.amountMinor} onChange={(v) => setDraft((d) => ({ ...d, refundApprovalLimit: { amountMinor: v ?? 0, currency: "TZS" } }))} currency="TZS" readOnly={ro} />
            </Field>
            <Field
              label="Void window"
              error={errors.hours}
              hint={draft.voidWindow === "same_day" ? "A ticket can be voided until 23:59 Dar es Salaam time on the day it was issued." : `A ticket can be voided for ${hoursText || "N"} hours after it was issued.`}
            >
              <div className="flex flex-wrap items-center gap-2">
                {ro ? (
                  <p className="flex h-8 items-center text-sm text-ink">{draft.voidWindow === "same_day" ? "Same day" : `${draft.voidWindow.hours} hours`}</p>
                ) : (
                  <>
                    <Segmented
                      label="Void window"
                      value={draft.voidWindow === "same_day" ? "same_day" : "hours"}
                      onChange={(v) => setDraft((d) => ({ ...d, voidWindow: v === "same_day" ? "same_day" : { hours: Number(hoursText) || 24 } }))}
                      options={[
                        { value: "same_day", label: "Same day" },
                        { value: "hours", label: "Hours" },
                      ]}
                    />
                    {draft.voidWindow !== "same_day" && (
                      <Input
                        inputMode="numeric"
                        aria-label="Void window in hours"
                        value={hoursText}
                        onChange={(e) => {
                          const t = e.target.value.replace(/\D/g, "");
                          setHoursText(t);
                          if (Number(t) > 0) setDraft((d) => ({ ...d, voidWindow: { hours: Number(t) } }));
                        }}
                        className="tnum w-20 text-right"
                        aria-invalid={Boolean(errors.hours) || undefined}
                      />
                    )}
                  </>
                )}
              </div>
            </Field>
          </FieldGrid>
        </FormSection>
      </div>
      <SaveBar
        dirty={canEdit && dirty}
        error={errors.form || (hasErrors ? "Fix the fields marked above, then save." : null)}
        onDiscard={() => {
          discard();
          setErrors({});
        }}
        onSave={onSave}
      />
    </div>
  );
}
