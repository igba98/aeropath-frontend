# Amadeus adapter (placeholder)

Nothing in this folder talks to Amadeus yet. The real adapter will be built once the Amadeus
Enterprise API contract is signed. This note explains how it will plug in without changing any screen.

## Where it sits

```
screens ──► getProvider(settings) ──► TravelProvider
                                        ├─ manual        (today's default: forms and Paste PNR)
                                        ├─ amadeus-mock  (fixtures, latency and simulated errors)
                                        └─ amadeus       (this folder, later: server only)
```

- Screens only ever call the `TravelProvider` methods in `../types.ts`
  (`ping`, `retrievePnr`, `issueTicket`, `voidDocument`, `refundQuote`, `readQueue`).
- Every method returns the same shapes as the mock: a `PnrSnapshot` for a PNR, tickets keyed by
  `pnrPaxNo`, `Money` for refund quotes, and failures as `ProviderError`
  (`NOT_FOUND | TIMEOUT | AUTH | NOT_SUPPORTED | UNKNOWN`) with a message written for agents.
- A `PnrSnapshot` from Amadeus goes through the same `mappers/pnr-to-flight-line.ts` as a pasted PNR,
  then into the `importFromProvider` command. A pasted PNR today and an API response tomorrow produce
  the same `FlightDetails`.

## How it will plug in

1. Add `amadeus/server.ts` implementing `TravelProvider` with the Enterprise SOAP operations below
   (session handling, `Security_Authenticate` / stateful sessions, retries, logging).
2. Expose it through server actions (or API routes), e.g. `retrievePnrAction(recordLocator)`.
3. Add `amadeus/client.ts`: a `TravelProvider` whose methods call those server actions and rebuild
   `ProviderError` from the response.
4. In `../index.ts`, return that client provider for `mode: 'live'` instead of the manual fallback.
5. Map Amadeus replies into `PnrSnapshot` in one place (`amadeus/map-pnr-reply.ts`), with fixture
   tests built from real, anonymised replies, just like the PNR parser tests.

## Planned operations (spec §11.5)

Confirm the exact operation names and versions against the Enterprise documentation provided under
the contract. The same table is exported as `AMADEUS_OPERATIONS` (`./operations.ts`) for
Settings → Integrations.

| Back-office action | Planned Amadeus operation (Enterprise, SOAP) |
|---|---|
| Fetch PNR / refresh line | `PNR_Retrieve` |
| Create or modify booking elements | `PNR_AddMultiElements` |
| Price and store fare | `Fare_PricePNRWithBookingClass` → `Ticket_CreateTSTFromPricing` |
| Issue ticket | `DocIssuance_IssueTicket` |
| Display ticket / history | `Ticket_ProcessEDoc` / `Ticket_DisplayTST` |
| Void | `Ticket_CancelDocument` |
| Refund quote and process | Automated refund (ATC Refund) family: initiate, update and process refund |
| Exchange eligibility and reissue | ATC eligibility check and ATC reissue family |
| Queue polling (no webhooks) | `Queue_List` and queue processing, on a scheduled job |
| Flight search (Phase 3) | `Fare_MasterPricerTravelBoardSearch` → `Air_SellFromRecommendation` |
| Alternative data feed | **AIR files** (Amadeus Interface Records) pushed on issuance → importer → `importFromProvider` |

## Rules the real adapter must follow later

- **Run only on the server** (credentials and session handling). Screens keep calling the same
  `TravelProvider` methods through server actions.
- **Every sync writes `external.lastSyncedAt` and `syncStatus`, and never silently overwrites
  agent-edited pricing.** If the airline data differs, set `syncStatus: 'drift'` and show a
  "Review changes" diff.
- **Imports are idempotent:** ticket numbers are unique across all lines, and a duplicate import
  updates the existing line rather than creating a new one.
