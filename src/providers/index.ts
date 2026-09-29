/**
 * Provider layer entry point (spec §3.5, §11). Screens import from "@/providers" only.
 *
 *   getProvider(settings)      → the TravelProvider for settings.integrations.amadeus.mode
 *   parsePnr(text, now)        → PnrSnapshot from pasted terminal text
 *   snapshotToFlightDetails()  → draft FlightDetails for the line editor / importFromProvider
 */
import type { AirlineRef, Settings } from "@/domain/types";
import { createAmadeusMockProvider } from "./amadeus-mock";
import { createManualProvider, manualProvider } from "./manual";
import type { TravelProvider } from "./types";

export const LIVE_NOT_AVAILABLE = "Live is available after the API contract";

export type ProviderSettings = Pick<Settings, "integrations"> & { airlines?: AirlineRef[] };

/**
 * 'off' → manual · 'mock' → amadeus-mock (latency, failure mode, airlines from settings) ·
 * 'live' → manual, whose ping explains that live mode comes with the API contract.
 * Cheap to call; create one per action rather than caching across settings changes.
 */
export function getProvider(settings: ProviderSettings): TravelProvider {
  const amadeus = settings.integrations.amadeus;
  switch (amadeus.mode) {
    case "mock":
      return createAmadeusMockProvider({
        latencyMs: amadeus.mock.latencyMs,
        failure: amadeus.mock.failure,
        environment: amadeus.environment,
        officeId: amadeus.officeId,
        airlines: settings.airlines,
      });
    case "live":
      return createManualProvider({
        pingMessage: LIVE_NOT_AVAILABLE,
        reason: `${LIVE_NOT_AVAILABLE}.`,
      });
    case "off":
    default:
      return manualProvider;
  }
}

export * from "./types";
export { createManualProvider, manualProvider } from "./manual";
export {
  createAmadeusMockProvider,
  MOCK_RECORD_LOCATORS,
  MOCK_MESSAGES,
  type AmadeusMockOptions,
  type MockFailure,
} from "./amadeus-mock";
export { AMADEUS_OPERATIONS, type AmadeusOperation } from "./amadeus/operations";
export { parsePnr } from "./pnr-parser/parse";
export {
  snapshotToFlightDetails,
  autoMatchTravellers,
  draftTravellerFromPnr,
  snapshotSummary,
  inferTripType,
  inferValidatingCarrier,
  formatNameInPnr,
  normaliseTicketNumber,
  type SnapshotToFlightOptions,
  type SnapshotSummary,
  type TravellerDraft,
} from "./mappers/pnr-to-flight-line";
