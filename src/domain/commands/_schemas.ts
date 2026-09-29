import { z } from "zod";
import type {
  CarDetails,
  ExternalRef,
  FlightDetails,
  FlightSegment,
  HotelDetails,
  InsuranceDetails,
  LineType,
  Money,
  TourDetails,
  TransferDetails,
  VisaDetails,
} from "../types";
import { isISODate, parseDateTimeInput } from "../dates";
import { AIRLINE_RE, AIRPORT_RE, normalisePhone, normaliseTicket, RECORD_LOCATOR_RE } from "../validation";

/** Shared zod schemas (spec §15). Messages are written for travel-agency staff. */

const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v === null ? undefined : v);

export const zId = z.string().trim().min(1);
export const zCurrency = z.enum(["TZS", "USD"]);

export const zMoney: z.ZodType<Money, z.ZodTypeDef, unknown> = z.object({
  amountMinor: z.number({ invalid_type_error: "Enter an amount." }).int("Amounts must be whole minor units (cents)."),
  currency: zCurrency,
});
export const zMoneyNonNeg = zMoney.refine((m) => m.amountMinor >= 0, "Amounts cannot be negative.");
export const zMoneyPos = zMoney.refine((m) => m.amountMinor > 0, "Enter an amount greater than zero.");

export const zText = (label: string) => z.string({ required_error: `${label} is required.` }).trim().min(1, `${label} is required.`);
export const zOptText = z.preprocess(blankToUndefined, z.string().trim().optional());
export const zOptEmail = z.preprocess(blankToUndefined, z.string().trim().toLowerCase().email("Enter a valid email address.").optional());

export const zISODate = z.string().refine(isISODate, "Enter a valid date.");
export const zOptISODate = z.preprocess(blankToUndefined, zISODate.optional());

/** Accepts an ISO instant, a Dar-local "YYYY-MM-DDTHH:mm" or a date; outputs a UTC ISO string. */
export const zDateTime = z.string().transform((s, ctx) => {
  const out = parseDateTimeInput(s);
  if (!out) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter a valid date and time." });
    return z.NEVER;
  }
  return out;
});
export const zOptDateTime = z.preprocess(blankToUndefined, zDateTime.optional());

export const zPhone = z.string({ required_error: "Phone is required." }).transform((s, ctx) => {
  const out = normalisePhone(s);
  if (!out) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Enter a phone number like 0754 123 456 or +255 754 123 456." });
    return z.NEVER;
  }
  return out;
});
export const zOptPhone = z.preprocess(blankToUndefined, zPhone.optional());

export const zTags = z
  .array(z.string().trim().min(1))
  .default([])
  .transform((t) => [...new Set(t)]);

export const zOptTicket = z.preprocess(
  blankToUndefined,
  z
    .string()
    .transform((s, ctx) => {
      const t = normaliseTicket(s);
      if (!t) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A ticket number has 13 digits: the 3-digit airline code and 10 digits, e.g. 176-2401234567." });
        return z.NEVER;
      }
      return t;
    })
    .optional(),
);

const upper = (s: string) => s.trim().toUpperCase();

// ───────────────────────────── Flight ─────────────────────────────

const localDateTime = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Enter the local date and time as YYYY-MM-DDTHH:mm.");

export const zSegment = z
  .object({
    segmentNo: z.number().int().min(1),
    carrier: z.string().transform(upper).pipe(z.string().regex(AIRLINE_RE, "Airline codes have 2 letters or digits, e.g. EK.")),
    operatingCarrier: z.preprocess(blankToUndefined, z.string().transform(upper).pipe(z.string().regex(AIRLINE_RE, "Airline codes have 2 letters or digits.")).optional()),
    flightNumber: z.string().trim().toUpperCase().regex(/^\d{1,4}[A-Z]?$/, "Enter the flight number without the airline code, e.g. 726."),
    bookingClass: z.string().transform(upper).pipe(z.string().regex(/^[A-Z]$/, "The booking class is one letter, e.g. Y.")),
    cabin: z.enum(["economy", "premium_economy", "business", "first"]).default("economy"),
    origin: z.string().transform(upper).pipe(z.string().regex(AIRPORT_RE, "Airport codes have 3 letters, e.g. DAR.")),
    destination: z.string().transform(upper).pipe(z.string().regex(AIRPORT_RE, "Airport codes have 3 letters, e.g. DXB.")),
    departureLocal: localDateTime,
    arrivalLocal: localDateTime,
    arrivalDayOffset: z.union([z.literal(0), z.literal(1), z.literal(2)]).default(0),
    statusCode: z.enum(["HK", "KK", "TK", "HL", "UN", "UC", "NO", "HX", "XX"]),
    seats: z.number().int().min(1).default(1),
    equipment: zOptText,
  })
  .refine((s) => s.arrivalLocal.slice(0, 10) >= s.departureLocal.slice(0, 10), { message: "Arrival must be on or after the departure date.", path: ["arrivalLocal"] })
  .refine((s) => s.origin !== s.destination, { message: "Origin and destination must be different airports.", path: ["destination"] });

export const zPassenger = z.object({
  travellerId: zId,
  nameInPnr: z.string().transform(upper).pipe(z.string().min(1, "Name in PNR is required.")),
  paxType: z.enum(["ADT", "CHD", "INF"]).default("ADT"),
  pnrPaxNo: z.number().int().min(1).optional(),
  ticketNumber: zOptTicket,
  emdNumbers: z.array(z.string().trim().min(1)).default([]),
  fareAmount: zMoneyNonNeg.optional(),
});

const zFare = z
  .object({
    currency: zCurrency,
    baseFare: zMoneyNonNeg,
    taxes: z.array(z.object({ code: z.string().transform(upper).pipe(z.string().min(1).max(3)), amount: zMoney })).default([]),
    totalFare: zMoneyNonNeg,
    commissionPct: z.number().min(0, "Commission cannot be negative.").max(1, "Commission is a fraction, e.g. 0.05 for 5%.").default(0),
    fareBasis: zOptText,
  })
  .refine((f) => f.baseFare.currency === f.currency && f.totalFare.currency === f.currency && f.taxes.every((t) => t.amount.currency === f.currency), {
    message: "All fare amounts must be in the fare currency.",
    path: ["totalFare"],
  });

export function inferTripType(segments: Pick<FlightSegment, "origin" | "destination">[]): FlightDetails["tripType"] {
  if (segments.length < 2) return "one_way";
  const first = segments[0];
  const last = segments[segments.length - 1];
  if (first.origin === last.destination) return "return";
  // Spec §11.4: multi-city when there is more than one gap between segments; otherwise one-way.
  let gaps = 0;
  for (let i = 1; i < segments.length; i++) if (segments[i].origin !== segments[i - 1].destination) gaps++;
  return gaps > 1 ? "multi_city" : "one_way";
}

export const zFlightDetails = z
  .object({
    recordLocator: z
      .string()
      .default("")
      .transform(upper)
      .refine((s) => s === "" || RECORD_LOCATOR_RE.test(s), "The record locator (PNR) has 6 letters or digits, e.g. Z8K4QM."),
    airlineLocator: z.preprocess(blankToUndefined, z.string().transform(upper).optional()),
    officeId: z.preprocess(blankToUndefined, z.string().transform(upper).optional()),
    validatingCarrier: z
      .string()
      .default("")
      .transform(upper)
      .refine((s) => s === "" || AIRLINE_RE.test(s), "The validating carrier is a 2-character airline code, e.g. EK."),
    tripType: z.enum(["one_way", "return", "multi_city"]).optional(),
    segments: z.array(zSegment).default([]),
    passengers: z.array(zPassenger).default([]),
    fare: zFare,
    baggage: zOptText,
    ticketingTimeLimit: zOptDateTime,
  })
  .superRefine((d, ctx) => {
    const seen = new Set<string>();
    d.passengers.forEach((p, i) => {
      if (seen.has(p.travellerId)) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A traveller appears twice in the passenger list.", path: ["passengers", i, "travellerId"] });
      seen.add(p.travellerId);
    });
  })
  .transform((d) => {
    const segments = [...d.segments].sort((a, b) => a.segmentNo - b.segmentNo);
    return {
      ...d,
      segments,
      tripType: d.tripType ?? inferTripType(segments),
      validatingCarrier: d.validatingCarrier || segments[0]?.carrier || "",
    };
  });

export const zHotelDetails = z
  .object({
    hotelName: zText("Hotel name"),
    city: zText("City"),
    checkIn: zISODate,
    checkOut: zISODate,
    rooms: z
      .array(
        z.object({
          roomType: zText("Room type"),
          board: z.enum(["RO", "BB", "HB", "FB", "AI"]).default("BB"),
          adults: z.number().int().min(1, "At least one adult per room."),
          children: z.number().int().min(0).default(0),
        }),
      )
      .min(1, "Add at least one room."),
    confirmationNumber: zOptText,
    cancellationPolicy: zOptText,
    freeCancelUntil: zOptDateTime,
  })
  .refine((d) => d.checkOut > d.checkIn, { message: "Check-out must be after check-in.", path: ["checkOut"] });

export const zCarDetails = z
  .object({
    company: zText("Company"),
    carClass: zText("Car class"),
    withDriver: z.boolean().default(false),
    pickupLocation: zText("Pick-up location"),
    pickupAt: zDateTime,
    dropoffLocation: zText("Drop-off location"),
    dropoffAt: zDateTime,
    confirmationNumber: zOptText,
  })
  .refine((d) => d.dropoffAt > d.pickupAt, { message: "Drop-off must be after pick-up.", path: ["dropoffAt"] });

export const zTransferDetails = z.object({
  from: zText("From"),
  to: zText("To"),
  at: zDateTime,
  vehicle: zText("Vehicle"),
  pax: z.number().int().min(1, "At least one passenger."),
  flightRef: zOptText,
  confirmationNumber: zOptText,
});

export const zTourDetails = z
  .object({
    name: zText("Tour name"),
    startDate: zISODate,
    endDate: zISODate,
    pax: z.number().int().min(1, "At least one passenger."),
    inclusions: zOptText,
    confirmationNumber: zOptText,
  })
  .refine((d) => d.endDate >= d.startDate, { message: "The tour must end on or after its start date.", path: ["endDate"] });

export const zVisaDetails = z.object({
  country: zText("Country"),
  visaType: zText("Visa type"),
  submittedAt: zOptISODate,
  decision: z.enum(["pending", "approved", "rejected"]).default("pending"),
  reference: zOptText,
});

export const zInsuranceDetails = z
  .object({
    provider: zText("Provider"),
    plan: zText("Plan"),
    coverStart: zISODate,
    coverEnd: zISODate,
    policyNumber: zOptText,
  })
  .refine((d) => d.coverEnd >= d.coverStart, { message: "Cover must end on or after it starts.", path: ["coverEnd"] });

export const zServiceFeeDetails = z.object({ reason: zText("Reason") });
export const zOtherDetails = z.object({ label: zText("Description") });

export const DETAILS_SCHEMAS: Record<LineType, z.ZodTypeAny> = {
  flight: zFlightDetails,
  hotel: zHotelDetails,
  car: zCarDetails,
  transfer: zTransferDetails,
  tour: zTourDetails,
  visa: zVisaDetails,
  insurance: zInsuranceDetails,
  service_fee: zServiceFeeDetails,
  other: zOtherDetails,
};

export const zExternalRef = z.object({
  provider: z.literal("amadeus").default("amadeus"),
  officeId: zOptText,
  recordLocator: z.preprocess(blankToUndefined, z.string().transform(upper).optional()),
  externalIds: z.record(z.string()).default({}),
  rawPayload: z.string().optional(),
  lastSyncedAt: zOptDateTime,
  syncStatus: z.enum(["ok", "drift", "error"]).optional(),
});

export const zPricingInput = z.object({
  currency: zCurrency.optional(),
  cost: zMoneyNonNeg.optional(),
  markup: zMoney,
  serviceFee: zMoneyNonNeg.optional(),
  fxToFile: z.number().positive("The exchange rate must be more than zero.").optional(),
});

export const zPaymentMethod = z.enum(["cash", "bank_transfer", "mpesa", "airtel_money", "mixx", "halopesa", "card", "cheque"]);

// Compile-time checks: parsed outputs fit the domain types.
type Out<S extends z.ZodTypeAny> = z.output<S>;
const _typeChecks = (): void => {
  const f: Omit<FlightDetails, "issuedAt" | "voidDeadline" | "exchangedFromLineId" | "exchangedToLineId"> = {} as Out<typeof zFlightDetails>;
  const h: HotelDetails = {} as Out<typeof zHotelDetails>;
  const c: CarDetails = {} as Out<typeof zCarDetails>;
  const t: TransferDetails = {} as Out<typeof zTransferDetails>;
  const to: TourDetails = {} as Out<typeof zTourDetails>;
  const v: VisaDetails = {} as Out<typeof zVisaDetails>;
  const i: InsuranceDetails = {} as Out<typeof zInsuranceDetails>;
  const e: ExternalRef = {} as Out<typeof zExternalRef>;
  void [f, h, c, t, to, v, i, e];
};
void _typeChecks;
