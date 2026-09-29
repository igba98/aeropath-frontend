import { describe, expect, it } from "vitest";

import { isValidLocator, TICKET_RE } from "@/domain/validation";
import { findOffer, holdSeats, leadFare, quoteFare, searchFlights, ticketNumbers, type FlightSearch } from "../flights";
import { bookRoom, findHotel, hotelRates, searchHotels } from "../hotels";

const ctx = { today: "2026-09-29", fx: 2600 };
const base: Omit<FlightSearch, "from" | "to" | "date"> = { adults: 1, children: 0, infants: 0, cabin: "economy" };
const search = (from: string, to: string, date = "2026-10-09", extra: Partial<FlightSearch> = {}) => searchFlights({ ...base, from, to, date, ...extra }, ctx);

describe("flight search", () => {
  it("is deterministic, so an offer id in the URL can be found again", () => {
    const a = search("DAR", "ZNZ");
    const b = search("DAR", "ZNZ");
    expect(a.map((o) => [o.id, o.fares.map((f) => f.adultBase)])).toEqual(b.map((o) => [o.id, o.fares.map((f) => f.adultBase)]));
    expect(findOffer({ ...base, from: "DAR", to: "ZNZ", date: "2026-10-09" }, a[0].id, ctx)?.id).toBe(a[0].id);
  });

  it("returns nothing for the past or for the same airport", () => {
    expect(search("DAR", "ZNZ", "2026-09-20")).toEqual([]);
    expect(search("DAR", "DAR")).toEqual([]);
  });

  it("prices domestic flights in shillings and international ones in dollars", () => {
    const home = search("DAR", "ZNZ");
    expect(home.length).toBeGreaterThan(2);
    expect(home.every((o) => o.currency === "TZS" && o.stops === 0)).toBe(true);
    const abroad = search("DAR", "DXB");
    expect(abroad.every((o) => o.currency === "USD")).toBe(true);
    expect(abroad.some((o) => o.stops === 0)).toBe(true);
    expect(abroad.some((o) => o.stops === 1)).toBe(true);
  });

  it("only offers sensible connections", () => {
    for (const [from, to] of [["DAR", "LHR"], ["ZNZ", "AMS"], ["MWZ", "ZNZ"], ["DAR", "SEU"]]) {
      const offers = search(from, to);
      expect(offers.length, `${from}-${to}`).toBeGreaterThan(0);
      for (const o of offers.filter((x) => x.stops)) {
        const domestic = o.domestic;
        for (const wait of o.layoversMin) {
          expect(wait).toBeGreaterThanOrEqual(domestic ? 50 : 75);
          expect(wait).toBeLessThanOrEqual(domestic ? 360 : 600);
        }
        expect(o.legs[0].origin).toBe(from);
        expect(o.legs[o.legs.length - 1].destination).toBe(to);
      }
    }
  });

  it("filters to business class when asked", () => {
    const offers = search("DAR", "DXB", "2026-10-09", { cabin: "business" });
    expect(offers.length).toBeGreaterThan(0);
    expect(offers.every((o) => o.fares.some((f) => f.cabin === "business"))).toBe(true);
    expect(search("DAR", "ZNZ", "2026-10-09", { cabin: "business" }).every((o) => o.carrier !== "CQ")).toBe(true);
  });

  it("charges children 75% and lap infants 10% of the base fare, without taxes for infants", () => {
    const o = search("DAR", "DXB").find((x) => leadFare(x, "economy"))!;
    const f = leadFare(o, "economy")!;
    const one = quoteFare(o, f, { adults: 1, children: 0, infants: 0 });
    const family = quoteFare(o, f, { adults: 2, children: 1, infants: 1 });
    const taxPer = f.adultTaxes.reduce((s, t) => s + t.amount, 0);
    expect(family.perPax.map((p) => p.paxType)).toEqual(["ADT", "ADT", "CHD", "INF"]);
    expect(family.perPax[3].total.amountMinor).toBe(Math.round((f.adultBase * 0.1) / 100) * 100);
    expect(family.perPax[2].total.amountMinor).toBe(Math.round((f.adultBase * 0.75) / 100) * 100 + taxPer);
    expect(family.total.amountMinor).toBe(family.perPax.reduce((s, p) => s + p.total.amountMinor, 0));
    expect(one.total.amountMinor).toBe(f.adultBase + taxPer);
  });
});

describe("holding seats", () => {
  it("makes a confirmed reservation the booked guard accepts", () => {
    const out = search("DAR", "DXB").find((o) => o.carrier === "FZ")!;
    const ret = searchFlights({ ...base, from: "DXB", to: "DAR", date: "2026-10-16" }, ctx).find((o) => o.carrier === "FZ")!;
    const fare = (o: typeof out) => o.fares.find((f) => f.seatsLeft > 0)!;
    const now = new Date("2026-09-29T09:00:00Z");
    const d = holdSeats({
      parts: [
        { offer: out, fare: fare(out) },
        { offer: ret, fare: fare(ret) },
      ],
      passengers: [
        { travellerId: "trv_a", title: "MRS", givenName: "Asha", surname: "Kombo", paxType: "ADT" },
        { travellerId: "trv_b", title: "MSTR", givenName: "Zuri", surname: "Kombo", paxType: "CHD" },
      ],
      now,
      officeId: "DARTZ2100",
    });
    expect(isValidLocator(d.recordLocator)).toBe(true);
    expect(d.tripType).toBe("return");
    expect(d.segments.every((s) => s.statusCode === "HK" && s.seats === 2)).toBe(true);
    expect(d.passengers.map((p) => p.nameInPnr)).toEqual(["KOMBO/ASHA MRS", "KOMBO/ZURI MSTR"]);
    expect(d.fare.totalFare.amountMinor).toBe(d.passengers.reduce((s, p) => s + (p.fareAmount?.amountMinor ?? 0), 0));
    expect(new Date(d.ticketingTimeLimit!).getTime()).toBeGreaterThan(now.getTime());
  });

  it("issues valid 13-digit ticket numbers", () => {
    for (const t of ticketNumbers("197", 3)) expect(TICKET_RE.test(t)).toBe(true);
  });
});

describe("hotel search", () => {
  const s = { destination: "ZNZ", checkIn: "2026-10-23", checkOut: "2026-10-26", adults: 2, children: 0, rooms: 1 };

  it("lists hotels in the destination with a price for the whole stay", () => {
    const res = searchHotels(s, ctx.today);
    expect(res.length).toBeGreaterThan(2);
    expect(res.every((r) => r.hotel.destination === "ZNZ" && r.nights === 3 && r.cheapest.nights.length === 3)).toBe(true);
  });

  it("makes non-refundable rates cheaper and hides rooms that cannot sleep the party", () => {
    const h = findHotel("kendwa-sands")!;
    const rates = hotelRates(h, s, ctx.today);
    const free = rates.find((r) => r.refundable && r.room.id === "garden" && r.board === "BB")!;
    const nr = rates.find((r) => !r.refundable && r.room.id === "garden" && r.board === "BB")!;
    expect(nr.total).toBeLessThan(free.total);
    expect(hotelRates(h, { ...s, adults: 4 }, ctx.today).every((r) => r.room.maxAdults >= 4)).toBe(true);
  });

  it("splits the party over the rooms and returns a confirmation", () => {
    const h = findHotel("palm-marina")!;
    const stay = { ...s, destination: "DXB", adults: 5, children: 1, rooms: 2 };
    const rate = hotelRates(h, stay, ctx.today)[0];
    const { details, cost } = bookRoom({ hotel: h, search: stay, rate, random: () => 0.5 });
    expect(details.rooms.map((r) => [r.adults, r.children])).toEqual([
      [3, 1],
      [2, 0],
    ]);
    expect(details.confirmationNumber).toMatch(/^EAB-\d{7}$/);
    expect(cost.amountMinor).toBe(rate.total);
  });
});
