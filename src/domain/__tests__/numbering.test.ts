import { describe, expect, it } from "vitest";
import { createEmptyDb } from "../defaults";
import { formatNumber, nextNumber, previewNumber, zeroPad } from "../numbering";
import { NOW } from "./fixtures";

describe("numbering", () => {
  it("formats prefix-year-padded number", () => {
    expect(zeroPad(123, 6)).toBe("000123");
    expect(formatNumber("AP", 2026, 123, 6)).toBe("AP-2026-000123");
    expect(formatNumber("INV", 2026, 88, 5)).toBe("INV-2026-00088");
  });

  it("takes the next number and returns updated counters without mutating the state", () => {
    const db = createEmptyDb(NOW);
    const a = nextNumber(db, "file", NOW);
    expect(a.number).toBe("AP-2026-000001");
    expect(a.counters.file).toBe(1);
    expect(db.counters.file).toBe(0);
    const b = nextNumber({ ...db, counters: a.counters }, "file", NOW);
    expect(b.number).toBe("AP-2026-000002");
    expect(nextNumber(db, "invoice", NOW).number).toBe("INV-2026-00001");
    expect(nextNumber(db, "receipt", NOW).number).toBe("RCT-2026-00001");
    expect(nextNumber(db, "refund_payout", NOW).number).toBe("RFD-2026-00001");
    expect(nextNumber(db, "refund_request", NOW).number).toBe("RFQ-2026-00001");
    expect(nextNumber(db, "supplier_payment", NOW).number).toBe("SPY-2026-00001");
    expect(nextNumber(db, "expense", NOW).number).toBe("EXP-2026-00001");
    expect(nextNumber(db, "quote", NOW).number).toBe("QUO-2026-00001");
  });

  it("uses the Dar es Salaam calendar year", () => {
    const db = createEmptyDb(NOW);
    // 22:00 UTC on 31 Dec is already 1 Jan in Dar es Salaam
    expect(nextNumber(db, "file", new Date("2026-12-31T22:00:00Z")).number).toBe("AP-2027-000001");
  });

  it("previews the next number with current settings", () => {
    const db = createEmptyDb(NOW);
    db.settings.numbering.invoice = { prefix: "TI", pad: 3 };
    expect(previewNumber(db.settings, { ...db.counters, invoice: 41 }, "invoice", NOW)).toBe("TI-2026-042");
  });
});
