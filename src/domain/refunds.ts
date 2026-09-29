import type { Money, Pricing, RefundQuote, RefundRequest, Settings } from "./types";
import { add, convert, mul, sub, sum, zero } from "./money";

/**
 * Refund and exchange quotes (spec §8.5, §8.6). Quotes are computed in the LINE's pricing currency from the pricing
 * saved on the line (the policy snapshot), never from current prices.
 *
 *   vatOnAgencyFee = round(agencyFee × vatRate)
 *   supplierCredit = cost − supplierPenalty
 *   retained       = supplierPenalty + agencyFee + vatOnAgencyFee + (waive ? 0 : markup + serviceFee + vat)
 *   clientRefund   = sell − retained        (must be ≥ 0)
 */

export interface RefundQuoteInput {
  supplierPenalty: Money;
  /** Defaults to settings.defaultServiceFee.service_fee. Any currency; converted into the line currency. */
  agencyFee?: Money;
  waiveOriginalFees?: boolean;
}

export function computeRefundQuote(pricing: Pricing, input: RefundQuoteInput, settings: Pick<Settings, "fx" | "vatRate" | "defaultServiceFee">): RefundQuote {
  const currency = pricing.currency;
  const rate = settings.fx.USD_TZS;
  const inCur = (m: Money) => convert(m, currency, rate);
  const supplierPenalty = inCur(input.supplierPenalty);
  const defaultFee = settings.defaultServiceFee.service_fee;
  const agencyFee = input.agencyFee ? inCur(input.agencyFee) : defaultFee ? inCur(defaultFee) : zero(currency);
  const vatOnAgencyFee = mul(agencyFee, settings.vatRate);
  const waive = !!input.waiveOriginalFees;
  const retained = sum(
    waive ? [supplierPenalty, agencyFee, vatOnAgencyFee] : [supplierPenalty, agencyFee, vatOnAgencyFee, pricing.markup, pricing.serviceFee, pricing.vat],
    currency,
  );
  return {
    currency,
    supplierPenalty,
    agencyFee,
    vatOnAgencyFee,
    supplierCredit: sub(pricing.cost, supplierPenalty),
    clientRefund: sub(pricing.sell, retained),
    waiveOriginalFees: waive,
  };
}

/** Exchange requests carry no client refund: the airline penalty and agency change fee go onto the new line. */
export function computeExchangeQuote(pricing: Pricing, supplierPenalty: Money, changeFee: Money, settings: Pick<Settings, "fx" | "vatRate">): RefundQuote {
  const currency = pricing.currency;
  const penalty = convert(supplierPenalty, currency, settings.fx.USD_TZS);
  const fee = convert(changeFee, currency, settings.fx.USD_TZS);
  return {
    currency,
    supplierPenalty: penalty,
    agencyFee: fee,
    vatOnAgencyFee: mul(fee, settings.vatRate),
    supplierCredit: zero(currency),
    clientRefund: zero(currency),
    waiveOriginalFees: false,
  };
}

/** What the agency keeps from the sale when a refund is approved (= sell − clientRefund), split into parts. */
export interface RetainedParts {
  cost: Money; // supplier penalty
  markup: Money;
  serviceFee: Money; // agency refund fee + (not waived) original service fee
  vat: Money; // VAT on agency fee + (not waived) original VAT
  sell: Money; // total retained
}

export function retainedParts(quote: RefundQuote, pricing: Pricing): RetainedParts {
  const c = quote.currency;
  const waive = quote.waiveOriginalFees;
  const markup = waive ? zero(c) : pricing.markup;
  const serviceFee = waive ? quote.agencyFee : add(quote.agencyFee, pricing.serviceFee);
  const vat = waive ? quote.vatOnAgencyFee : add(quote.vatOnAgencyFee, pricing.vat);
  return { cost: quote.supplierPenalty, markup, serviceFee, vat, sell: sub(pricing.sell, quote.clientRefund) };
}

/** True when an approved refund request contributes retained charges to its file. */
export const refundRetainsCharges = (r: Pick<RefundRequest, "kind" | "status">): boolean =>
  r.kind === "refund" && (r.status === "approved" || r.status === "paid" || r.status === "closed");
