import { z } from "zod";
import { AIRLINE_RE } from "../validation";
import { zMoneyNonNeg, zText } from "./_schemas";

/** Validation of a full Settings object after a patch is merged in. */
export const settingsSchema = z.object({
  company: z.object({
    name: zText("Company name"),
    tin: z.string(),
    vrn: z.string().optional(),
    address: z.string(),
    phone: z.string(),
    email: z.string(),
    logoDataUrl: z.string().optional(),
  }),
  baseCurrency: z.literal("TZS"),
  fx: z.object({ USD_TZS: z.number().positive("The exchange rate must be more than zero."), updatedAt: z.string(), updatedBy: z.string() }),
  vatRate: z.number().min(0, "VAT cannot be negative.").max(1, "Enter VAT as a fraction, e.g. 0.18 for 18%."),
  vatBase: z.enum(["service_fee", "service_fee_and_markup"]),
  defaultServiceFee: z.record(zMoneyNonNeg),
  refundApprovalLimit: zMoneyNonNeg,
  voidWindow: z.union([
    z.literal("same_day"),
    z.object({ hours: z.number().positive("The void window must be more than zero hours.").max(168, "The void window can be at most 168 hours.") }),
  ]),
  airSettlement: z.object({ mode: z.enum(["bsp", "consolidator"]), supplierId: z.string() }),
  defaultPaymentTermsDays: z.number().int().min(0).max(365),
  numbering: z.record(
    z.object({
      prefix: z
        .string()
        .trim()
        .regex(/^[A-Za-z0-9]{1,8}$/, "Use 1 to 8 letters or digits for the prefix."),
      pad: z.number().int().min(1, "Padding must be at least 1 digit.").max(10, "Padding can be at most 10 digits."),
    }),
  ),
  paymentInstructions: z.string(),
  airlines: z.array(
    z.object({
      code: z.string().regex(AIRLINE_RE, "Airline codes have 2 letters or digits, e.g. EK."),
      name: zText("Airline name"),
      ticketPrefix: z
        .string()
        .regex(/^(\d{3})?$/, "The ticket prefix has 3 digits, e.g. 176.")
        .optional(),
    }),
  ),
  integrations: z.object({
    amadeus: z.object({
      mode: z.enum(["off", "mock", "live"]),
      environment: z.enum(["test", "production"]),
      officeId: z.string(),
      mock: z.object({
        latencyMs: z.number().int().min(0).max(3000, "Latency can be at most 3000 ms."),
        failure: z.enum(["none", "timeout", "not_found", "auth_error", "random"]),
      }),
    }),
  }),
});
