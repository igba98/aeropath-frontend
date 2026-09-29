import type { DbState, ID } from "../types";
import type { BookEntry, BookKind } from "./books";

/** What produced a ledger entry, in words and with the document number, so a report can link back to it. */

export type SourceEntity = "line" | "payment" | "refund" | "supplier_payment" | "expense" | "journal" | "opening" | "close";

export interface EntrySource {
  entity: SourceEntity;
  id?: ID;
  /** Document number (RCT-…, EXP-…, JV-…, the booking number for services). */
  number?: string;
  /** "Receipt", "Expense", "Journal", … */
  label: string;
  fileId?: ID;
  supplierId?: ID;
}

export const BOOK_KIND_LABELS: Record<BookKind, string> = {
  line_issue: "Service issued",
  line_void: "Void",
  refund_reversal: "Refund reversal",
  refund_retained: "Refund retained",
  payment_in: "Receipt",
  payment_out: "Refund payout",
  payment_reversal: "Payment reversed",
  supplier_payment: "Supplier payment",
  expense: "Expense",
  expense_reversal: "Expense deleted",
  journal: "Journal",
  journal_reversal: "Journal reversed",
  transfer: "Transfer",
  opening_balance: "Opening balance",
  year_end_close: "Year-end close",
};

export function entrySource(db: DbState, e: Pick<BookEntry, "kind" | "ref" | "fileId">): EntrySource {
  if (e.kind === "opening_balance") return { entity: "opening", label: "Opening balance" };
  if (e.kind === "year_end_close") return { entity: "close", label: "Year-end close" };
  const label = e.kind ? BOOK_KIND_LABELS[e.kind] : "Entry";
  const ref = e.ref;
  if (!ref) return { entity: "journal", label };
  switch (ref.entity) {
    case "line": {
      const line = db.lines[ref.id];
      const fileId = e.fileId ?? line?.fileId;
      return { entity: "line", id: ref.id, number: fileId ? db.files[fileId]?.number : undefined, label, fileId };
    }
    case "payment": {
      const p = db.payments[ref.id];
      return { entity: "payment", id: ref.id, number: p?.number, label, fileId: e.fileId };
    }
    case "refund": {
      const r = db.refunds[ref.id];
      return { entity: "refund", id: ref.id, number: r?.number, label, fileId: e.fileId ?? r?.fileId };
    }
    case "supplier_payment": {
      const sp = db.supplierPayments[ref.id];
      return { entity: "supplier_payment", id: ref.id, number: sp?.number, label, supplierId: sp?.supplierId };
    }
    case "expense":
      return { entity: "expense", id: ref.id, number: db.expenses[ref.id]?.number, label };
    case "journal":
      return { entity: "journal", id: ref.id, number: db.journals[ref.id]?.number, label };
  }
}
