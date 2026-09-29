"use client";

import * as React from "react";
import type { Currency, FlightDetails, LineType, Money, Settings, User } from "@/domain/types";
import { computePricing, isBelowCost, margin } from "@/domain/pricing";
import { can } from "@/domain/permissions";
import { format } from "@/domain/money";
import { cn } from "@/lib/utils";
import { Field, Banner } from "@/components/shared/field";
import { MoneyInput } from "@/components/shared/money-input";
import { Textarea } from "@/components/ui/textarea";
import { Amount } from "@/components/shared/amount";

export interface PricingDraft {
  currency: Currency;
  costMinor: number | null; // non-flight only
  markupMinor: number | null;
  serviceFeeMinor: number | null;
  overrideReason: string;
}

export function pricingDraftFrom(
  p: { currency: Currency; cost?: Money; markup?: Money; serviceFee?: Money } | undefined,
  fallbackCurrency: Currency,
  type: LineType,
  settings: Settings,
): PricingDraft {
  const currency = p?.currency ?? fallbackCurrency;
  const def = settings.defaultServiceFee[type];
  const defMinor = def ? (def.currency === currency ? def.amountMinor : Math.round(def.currency === "USD" ? def.amountMinor * settings.fx.USD_TZS : def.amountMinor / settings.fx.USD_TZS)) : 0;
  return {
    currency,
    costMinor: p?.cost?.amountMinor ?? null,
    markupMinor: p?.markup?.amountMinor ?? 0,
    serviceFeeMinor: p?.serviceFee?.amountMinor ?? defMinor,
    overrideReason: "",
  };
}

/** Pricing as the domain will compute it, for the live summary. */
export function previewPricing(d: PricingDraft, type: LineType, settings: Settings, fare?: Pick<FlightDetails["fare"], "totalFare" | "commissionPct">) {
  return computePricing(
    {
      currency: d.currency,
      cost: { amountMinor: d.costMinor ?? 0, currency: d.currency },
      markup: { amountMinor: d.markupMinor ?? 0, currency: fare ? fare.totalFare.currency : d.currency },
      serviceFee: { amountMinor: d.serviceFeeMinor ?? 0, currency: fare ? fare.totalFare.currency : d.currency },
      fare,
    },
    settings,
    type,
  );
}

/**
 * Cost (typed, non-flight), markup and service fee in; VAT, sell and margin computed live.
 * Below-cost pricing is blocked unless a Manager gives a reason (spec §8.2).
 */
export function PricingBlock({
  type,
  value,
  onChange,
  settings,
  user,
  fare,
  lockCurrency,
  errors,
}: {
  type: LineType;
  value: PricingDraft;
  onChange: (v: PricingDraft) => void;
  settings: Settings;
  user: User;
  fare?: Pick<FlightDetails["fare"], "totalFare" | "commissionPct">;
  lockCurrency?: boolean;
  errors?: Partial<Record<"cost" | "markup" | "serviceFee" | "overrideReason", string>>;
}) {
  const cur = fare ? fare.totalFare.currency : value.currency;
  const p = previewPricing({ ...value, currency: cur }, type, settings, fare);
  const below = isBelowCost(p);
  const manager = can(user, "line.price_below_cost");
  const set = (patch: Partial<PricingDraft>) => onChange({ ...value, ...patch });
  const isFee = type === "service_fee";

  return (
    <div className="space-y-3">
      <div className={cn("grid grid-cols-1 gap-3", isFee ? "sm:grid-cols-2" : fare ? "sm:grid-cols-3" : "sm:grid-cols-3")}>
        {fare ? (
          <Field label="Net cost" hint={fare.commissionPct ? `Fare less ${(fare.commissionPct * 100).toFixed(1)}% commission` : "From the fare"}>
            <MoneyInputReadonly value={p.cost} />
          </Field>
        ) : !isFee ? (
          <Field label="Net cost" htmlFor="pr-cost" required hint="What the supplier charges us" error={errors?.cost}>
            <MoneyInput
              id="pr-cost"
              value={value.costMinor}
              onChange={(v) => set({ costMinor: v })}
              currency={cur}
              onCurrencyChange={lockCurrency ? undefined : (c) => set({ currency: c })}
              invalid={Boolean(errors?.cost)}
            />
          </Field>
        ) : null}
        {!isFee && (
          <Field label="Markup" htmlFor="pr-markup" hint="Built into the price" error={errors?.markup}>
            <MoneyInput id="pr-markup" value={value.markupMinor} onChange={(v) => set({ markupMinor: v })} currency={cur} allowNegative={manager} invalid={Boolean(errors?.markup)} />
          </Field>
        )}
        <Field label={isFee ? "Fee amount" : "Service fee"} htmlFor="pr-fee" hint={isFee ? "All of it is margin" : "Shown on the invoice"} error={errors?.serviceFee}>
          <MoneyInput
            id="pr-fee"
            value={value.serviceFeeMinor}
            onChange={(v) => set({ serviceFeeMinor: v })}
            currency={cur}
            onCurrencyChange={isFee && !lockCurrency ? (c) => set({ currency: c }) : undefined}
            invalid={Boolean(errors?.serviceFee)}
          />
        </Field>
      </div>

      <div className="rounded-md border border-rule bg-canvas px-3 py-2.5">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[13.5px] sm:grid-cols-5">
          <Stat label="Cost" value={p.cost} />
          <Stat label="+ Markup" value={p.markup} />
          <Stat label="+ Fee" value={p.serviceFee} />
          <Stat label={`+ VAT ${Math.round(settings.vatRate * 100)}%`} value={p.vat} />
          <Stat label="= Sell" value={p.sell} strong />
        </dl>
        <div className="mt-2 flex items-center justify-between border-t border-rule pt-2 text-[13.5px]">
          <span className="text-ink-3">Margin (markup + fee, VAT excluded)</span>
          <Amount value={margin(p)} tone="auto" className="font-semibold" />
        </div>
      </div>

      {below &&
        (manager ? (
          <Field label="Reason for selling below cost" htmlFor="pr-override" required error={errors?.overrideReason} hint="Saved on the line with your name.">
            <Textarea id="pr-override" rows={2} value={value.overrideReason} onChange={(e) => set({ overrideReason: e.target.value })} placeholder="e.g. Matching a competitor quote for a corporate client" />
          </Field>
        ) : (
          <Banner tone="error" title="This sells below cost">
            The selling price ({format(p.sell)}) is lower than the net cost ({format(p.cost)}). Only a Manager can sell below cost, with a reason. Raise the markup to at least zero.
          </Banner>
        ))}
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: Money; strong?: boolean }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-ink-3">{label}</dt>
      <dd>
        <Amount value={value} className={cn(strong ? "font-semibold text-ink" : "text-ink-2")} />
      </dd>
    </div>
  );
}

function MoneyInputReadonly({ value }: { value: Money }) {
  return <MoneyInput value={value.amountMinor} onChange={() => {}} currency={value.currency} readOnly />;
}
