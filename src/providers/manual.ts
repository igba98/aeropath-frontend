/**
 * Manual provider (spec §11.2): the default today. Flights come from forms or Paste PNR, so every
 * Amadeus operation is "not supported" with a message that tells the agent what to do instead.
 */
import { ProviderError, type TravelProvider } from "./types";

export interface ManualProviderOptions {
  /** Returned by ping(). Default "Manual mode". */
  pingMessage?: string;
  /** First sentence of every NOT_SUPPORTED message. Default "Amadeus is not connected." */
  reason?: string;
}

export function createManualProvider(opts: ManualProviderOptions = {}): TravelProvider {
  const reason = opts.reason ?? "Amadeus is not connected.";
  const notSupported = (hint: string) => new ProviderError("NOT_SUPPORTED", `${reason} ${hint}`);

  return {
    id: "manual",
    async ping() {
      return { ok: false, message: opts.pingMessage ?? "Manual mode" };
    },
    async retrievePnr() {
      throw notSupported("Use Paste PNR or enter the flight manually.");
    },
    async issueTicket() {
      throw notSupported("Issue the ticket in the Amadeus terminal, then enter the ticket numbers here.");
    },
    async voidDocument() {
      throw notSupported("Void the ticket in the Amadeus terminal, then void the line here.");
    },
    async refundQuote() {
      throw notSupported("Enter the airline penalty from the fare rules.");
    },
    async readQueue() {
      throw notSupported("Work the queue in the Amadeus terminal.");
    },
  };
}

export const manualProvider: TravelProvider = createManualProvider();
