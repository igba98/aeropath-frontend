/**
 * Planned Amadeus Enterprise operation per back-office action (spec §11.5). Shown read-only in
 * Settings → Integrations and documented in ./README.md. Names and versions must be confirmed
 * against the Enterprise documentation provided under the contract.
 */
export interface AmadeusOperation {
  action: string;
  operation: string;
}

export const AMADEUS_OPERATIONS: readonly AmadeusOperation[] = [
  { action: "Fetch PNR / refresh line", operation: "PNR_Retrieve" },
  { action: "Create or modify booking elements", operation: "PNR_AddMultiElements" },
  { action: "Price and store fare", operation: "Fare_PricePNRWithBookingClass → Ticket_CreateTSTFromPricing" },
  { action: "Issue ticket", operation: "DocIssuance_IssueTicket" },
  { action: "Display ticket / history", operation: "Ticket_ProcessEDoc / Ticket_DisplayTST" },
  { action: "Void", operation: "Ticket_CancelDocument" },
  { action: "Refund quote and process", operation: "Automated refund (ATC Refund) family: initiate, update and process refund" },
  { action: "Exchange eligibility and reissue", operation: "ATC eligibility check and ATC reissue family" },
  { action: "Queue polling (no webhooks)", operation: "Queue_List and queue processing, on a scheduled job" },
  { action: "Flight search (Phase 3)", operation: "Fare_MasterPricerTravelBoardSearch → Air_SellFromRecommendation" },
  { action: "Alternative data feed", operation: "AIR files (Amadeus Interface Records) pushed on issuance → importer → importFromProvider" },
];
