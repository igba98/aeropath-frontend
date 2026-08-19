/**
 * Aeropath mock API. Backend-shaped: every screen calls these functions and never touches the store directly for writes.
 * Swap the implementations for HTTP calls to apps/api later without changing screens.
 */
export { auth } from "./auth";
export { catalog, availabilityFor, unitFor, datesBetween, type SearchParams, type SearchHit } from "./catalog";
export { ancillaries, cart, checkout, bookingOps, wishlist, itemsOf, buyerTypeFor, cartKey, RAIL_LABELS } from "./booking";
export { admin } from "./admin";
export { currentUser, actor } from "./core";
