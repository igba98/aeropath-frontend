import { z } from "zod";
import type { Command, Currency, ID, Supplier, SupplierKind } from "../types";
import { makeAudit } from "../audit";
import { denied, fail, ok, parse, produce } from "./_helpers";
import { zCurrency, zOptEmail, zOptPhone, zOptText, zText } from "./_schemas";

export interface UpsertSupplierInput {
  supplier: Partial<Supplier> & { name: string; kind: SupplierKind; currency: Currency };
}

export interface UpsertSupplierResult {
  supplierId: ID;
}

const schema = z.object({
  id: z.preprocess((v) => (v === "" || v === null ? undefined : v), z.string().optional()),
  name: zText("Supplier name"),
  kind: z.enum(["air_settlement", "hotel", "car_rental", "transfer", "tour", "visa", "insurance", "other"]),
  currency: zCurrency,
  contactName: zOptText,
  phone: zOptPhone,
  email: zOptEmail,
  paymentTermsDays: z.number().int().min(0, "Payment terms cannot be negative.").max(365).optional(),
  notes: zOptText,
  active: z.boolean().optional(),
});

/** Accountant or Manager. Payment terms default to settings.defaultPaymentTermsDays. */
export const upsertSupplier: Command<UpsertSupplierInput, UpsertSupplierResult> = (state, input, ctx) => {
  const no = denied(ctx, "supplier.manage");
  if (no) return no;
  const parsed = parse(schema, input?.supplier, "supplier");
  if (!parsed.ok) return parsed;
  const f = parsed.data;

  const existing = f.id ? state.suppliers[f.id] : undefined;
  if (f.id && !existing) return fail("NOT_FOUND", "This supplier could not be found.", "supplier.id");
  const active = f.active ?? existing?.active ?? true;
  if (existing && !active && state.settings.airSettlement.supplierId === existing.id) {
    return fail("CONFLICT", `${existing.name} is the air settlement supplier in Settings. Choose another one there before deactivating it.`, "supplier.active");
  }

  const id = existing?.id ?? ctx.newId("sup");
  const supplier: Supplier = {
    id,
    name: f.name,
    kind: f.kind,
    currency: f.currency,
    paymentTermsDays: f.paymentTermsDays ?? existing?.paymentTermsDays ?? state.settings.defaultPaymentTermsDays,
    active,
  };
  if (f.contactName) supplier.contactName = f.contactName;
  if (f.phone) supplier.phone = f.phone;
  if (f.email) supplier.email = f.email;
  if (f.notes) supplier.notes = f.notes;

  const next = produce(state, (d) => {
    d.suppliers[id] = supplier;
  });
  const what = existing ? `Supplier ${supplier.name} updated${active ? "" : " (inactive)"}` : `Supplier ${supplier.name} added`;
  const action = existing ? "supplier.updated" : "supplier.created";
  return ok(next, [makeAudit(ctx, action, "supplier", id, what)], { supplierId: id }, existing ? "Supplier saved" : `${supplier.name} added`);
};
