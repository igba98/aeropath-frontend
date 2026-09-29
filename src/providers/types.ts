/**
 * Provider layer contract (spec §11.1). Screens talk to `TravelProvider` only; they never import
 * Amadeus code directly. The same shapes will be returned by the real server-side adapter later.
 */
import type { Currency, FlightSegment, ISODate, ISODateTime, Money, PaxType, Title } from "@/domain/types";

export interface PnrSnapshotPassenger {
  /** P1, P2… as in the PNR. Infants (who share their adult's P number in Amadeus) get the next free number. */
  pnrPaxNo: number;
  surname: string;
  givenName: string;
  title?: Title;
  paxType: PaxType;
  dateOfBirth?: ISODate;
}

export type PnrSnapshotSegment = Omit<FlightSegment, "cabin"> & { cabin?: FlightSegment["cabin"] };

export interface PnrSnapshotTicket {
  pnrPaxNo: number;
  ticketNumber: string; // "176-2401234567"
  carrier: string; // validating carrier from the FA line, e.g. "EK"
  currency?: Currency;
  /** Per-passenger total fare in MAJOR units, as displayed in the FA line (USD1450.00 → 1450). */
  amount?: number;
  issuedAt?: ISODate;
}

export interface PnrSnapshot {
  recordLocator: string;
  officeId?: string;
  createdAt?: ISODateTime;
  passengers: PnrSnapshotPassenger[];
  segments: PnrSnapshotSegment[];
  ticketingTimeLimit?: ISODateTime;
  tickets: PnrSnapshotTicket[];
  contacts: { type: "phone" | "email"; value: string }[];
  raw: string; // original text or payload
  warnings: string[]; // parse warnings shown to the user
}

export type ProviderId = "manual" | "amadeus-mock" | "amadeus";

export interface TravelProvider {
  readonly id: ProviderId;
  ping(): Promise<{ ok: boolean; message: string }>;
  retrievePnr(recordLocator: string): Promise<PnrSnapshot>;
  // Stubs in the prototype: throw NOT_SUPPORTED with a clear message, except in the mock
  issueTicket(recordLocator: string): Promise<{ tickets: PnrSnapshot["tickets"] }>;
  voidDocument(documentNumber: string): Promise<{ ok: true }>;
  refundQuote(ticketNumber: string): Promise<{ supplierPenalty: Money; refundable: Money }>;
  readQueue(queue: string): Promise<{ recordLocator: string; reason: string }[]>;
}

export type ProviderErrorCode = "NOT_FOUND" | "TIMEOUT" | "AUTH" | "NOT_SUPPORTED" | "UNKNOWN";

export class ProviderError extends Error {
  readonly code: ProviderErrorCode;

  constructor(code: ProviderErrorCode, message: string) {
    super(message);
    this.name = "ProviderError";
    this.code = code;
  }
}

export function isProviderError(e: unknown): e is ProviderError {
  return e instanceof ProviderError || (typeof e === "object" && e !== null && (e as { name?: unknown }).name === "ProviderError");
}

/** Normalise anything thrown by a provider into a ProviderError with a message fit for agents. */
export function toProviderError(e: unknown): ProviderError {
  if (isProviderError(e)) return e;
  const message = e instanceof Error && e.message ? e.message : "Something went wrong talking to Amadeus. Try again, or enter the flight manually.";
  return new ProviderError("UNKNOWN", message);
}
