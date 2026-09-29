"use client";

import * as React from "react";

import { can } from "@/domain/permissions";
import { useApp, useMe } from "@/store";
import { fmtDateTime } from "@/lib/dates";

import { Input } from "@/components/ui/input";
import { Banner, Field, FormSection } from "@/components/shared/field";
import { Amount } from "@/components/shared/amount";
import { KeyValues } from "@/components/shared/bits";
import { SaveBar, TabHeading, useSettingsDraft } from "./settings-kit";

/** Settings → Currency: the USD→TZS rate. */
export function CurrencyTab() {
  const me = useMe();
  const db = useApp((s) => s.db)!;
  const canEdit = can(me, "settings.edit");
  const { draft, setDraft, dirty, discard, save, settings } = useSettingsDraft((s) => ({ rate: s.fx.USD_TZS }));
  const [text, setText] = React.useState(String(draft.rate));
  const [error, setError] = React.useState<string | null>(null);

  const fx = settings.fx;
  const updatedBy = db.users[fx.updatedBy]?.name ?? "System (seed)";
  const preview = Number(text) > 0 ? Number(text) : fx.USD_TZS;

  const onSave = () => {
    const n = Number(text);
    if (!Number.isFinite(n) || n <= 0) return setError("Enter how many shillings buy one US dollar, e.g. 2600.");
    if (n < 500 || n > 10_000) return setError(`TZS ${n.toLocaleString("en-US")} per USD looks wrong. Check the figure; it is usually between 2,000 and 3,500.`);
    const r = save({ fx: { USD_TZS: n } });
    setError(r.ok ? null : r.error.message);
  };

  return (
    <div>
      <TabHeading title="Currency" description="Used to convert between TZS and USD across the back office." viewOnly={!canEdit} />
      <div className="max-w-[720px] space-y-7">
        <FormSection title="Exchange rate">
          <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <Field label="TZS per 1 USD" htmlFor="fx-rate" error={error} hint="Base currency is TZS.">
              <div className="flex items-center gap-2">
                <span className="text-sm text-ink-3">1 USD =</span>
                <Input
                  id="fx-rate"
                  inputMode="decimal"
                  value={text}
                  readOnly={!canEdit}
                  onChange={(e) => {
                    const t = e.target.value.replace(/[^\d.]/g, "");
                    setText(t);
                    setError(null);
                    const n = Number(t);
                    if (t !== "" && Number.isFinite(n) && n > 0) setDraft({ rate: n });
                  }}
                  className="tnum w-32 text-right"
                  aria-invalid={Boolean(error) || undefined}
                />
                <span className="text-sm text-ink-3">TZS</span>
              </div>
            </Field>
            <KeyValues
              items={[
                { label: "Last updated", value: <span className="tnum">{fmtDateTime(fx.updatedAt)}</span> },
                { label: "By", value: updatedBy },
                { label: "USD 100.00 is", value: <Amount value={{ amountMinor: Math.round(10_000 * preview), currency: "TZS" }} /> },
                { label: "TZS 1,000,000 is", value: <Amount value={{ amountMinor: Math.round(100_000_000 / preview), currency: "USD" }} /> },
              ]}
            />
          </div>
        </FormSection>
        <Banner tone="info" title="A demo value, not a live market rate">
          A new rate applies to conversions made from now on. Payments, invoices and lines already converted keep the rate captured at the time, so past totals do not move.
        </Banner>
      </div>
      <SaveBar
        dirty={canEdit && dirty}
        error={error}
        onDiscard={() => {
          discard();
          setText(String(fx.USD_TZS));
          setError(null);
        }}
        onSave={onSave}
      />
    </div>
  );
}
