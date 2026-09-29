import { describe, expect, it } from "vitest";
import { defaultSettings } from "../defaults";
import { major, money } from "../money";
import { computePricing, computeVat, flightCost, isBelowCost, lineSellInFileCurrency, margin, toFileMoney } from "../pricing";
import { NOW } from "./fixtures";

const settings = defaultSettings(NOW);
const usd = (n: number) => major(n, "USD");
const tzs = (n: number) => major(n, "TZS");

describe("flight cost", () => {
  it("is total fare minus commission", () => {
    expect(flightCost({ totalFare: usd(1000), commissionPct: 0 })).toEqual(usd(1000));
    expect(flightCost({ totalFare: usd(1000), commissionPct: 0.05 })).toEqual(usd(950));
  });
  it("rounds the commission half-up to the cent", () => {
    // 3.33 × 5% = 0.1665 → 0.17 → cost 3.16
    expect(flightCost({ totalFare: money(333, "USD"), commissionPct: 0.05 })).toEqual(money(316, "USD"));
  });
});

describe("VAT", () => {
  it("is charged on the service fee only by default", () => {
    expect(computeVat(usd(20), usd(50), settings)).toEqual(money(360, "USD"));
  });
  it("includes the markup when vatBase is service_fee_and_markup", () => {
    expect(computeVat(usd(20), usd(50), { ...settings, vatBase: "service_fee_and_markup" })).toEqual(money(1260, "USD"));
  });
  it("rounds half-up to the minor unit", () => {
    // 0.25 × 18% = 0.045 → 0.05
    expect(computeVat(money(25, "USD"), usd(0), settings)).toEqual(money(5, "USD"));
    // TZS 1,111.11 × 18% = 199.9998 → 200.00
    expect(computeVat(money(111111, "TZS"), tzs(0), settings)).toEqual(money(20000, "TZS"));
  });
  it("is never negative, even with a negative markup in the base", () => {
    expect(computeVat(usd(0), usd(-100), { ...settings, vatBase: "service_fee_and_markup" })).toEqual(usd(0));
  });
});

describe("computePricing", () => {
  it("prices a flight in its fare currency: sell = cost + markup + fee + VAT", () => {
    const p = computePricing({ currency: "TZS", markup: usd(50), serviceFee: usd(20), fare: { totalFare: usd(1450), commissionPct: 0 } }, settings, "flight");
    expect(p.currency).toBe("USD");
    expect(p.cost).toEqual(usd(1450));
    expect(p.vat).toEqual(money(360, "USD"));
    expect(p.sell).toEqual(money(152360, "USD"));
    expect(margin(p)).toEqual(usd(70));
  });

  it("uses the typed cost for non-flight lines", () => {
    const p = computePricing({ currency: "USD", cost: usd(300), markup: usd(30), serviceFee: usd(10) }, settings, "hotel");
    expect(p.cost).toEqual(usd(300));
    expect(p.sell).toEqual(money(34180, "USD"));
  });

  it("defaults the service fee from settings, converted to the line currency", () => {
    // TZS 30,000 hotel default ÷ 2600 = USD 11.538… → 11.54
    const p = computePricing({ currency: "USD", cost: usd(100), markup: usd(0) }, settings, "hotel");
    expect(p.serviceFee).toEqual(money(1154, "USD"));
    const t = computePricing({ currency: "TZS", cost: tzs(100_000), markup: tzs(0) }, settings, "transfer");
    expect(t.serviceFee).toEqual(tzs(10_000));
  });

  it("converts inputs typed in another currency at the settings rate", () => {
    const p = computePricing({ currency: "TZS", cost: usd(100), markup: tzs(26_000), serviceFee: tzs(0) }, settings, "tour");
    expect(p.cost).toEqual(tzs(260_000));
    expect(p.sell).toEqual(tzs(286_000));
  });

  it("detects selling below cost", () => {
    const p = computePricing({ currency: "USD", cost: usd(100), markup: usd(-30), serviceFee: usd(10) }, settings, "hotel");
    expect(isBelowCost(p)).toBe(true);
    const q = computePricing({ currency: "USD", cost: usd(100), markup: usd(-5), serviceFee: usd(10) }, settings, "hotel");
    expect(isBelowCost(q)).toBe(false);
  });
});

describe("file-currency conversion", () => {
  it("uses the rate saved on the line before the settings rate", () => {
    expect(toFileMoney(usd(10), "TZS", 2500, 2600)).toEqual(tzs(25_000));
    expect(toFileMoney(usd(10), "TZS", undefined, 2600)).toEqual(tzs(26_000));
    expect(toFileMoney(usd(10), "USD", 2500, 2600)).toEqual(usd(10));
  });
  it("converts a line's sell into the file currency", () => {
    const pricing = computePricing({ currency: "USD", cost: usd(100), markup: usd(0), serviceFee: usd(0), fxToFile: 2600 }, settings, "hotel");
    expect(lineSellInFileCurrency({ pricing }, "TZS")).toEqual(tzs(260_000));
  });
});
