/**
 * Field-level validation and normalisation rules (spec §15). Pure helpers shared by commands and forms.
 */

export const RECORD_LOCATOR_RE = /^[A-Z0-9]{6}$/;
export const TICKET_RE = /^\d{3}-?\d{10}$/;
export const AIRPORT_RE = /^[A-Z]{3}$/;
export const AIRLINE_RE = /^[A-Z0-9]{2}$/;
/** Uppercase letters, spaces, hyphens and apostrophes (passport style). */
export const TRAVELLER_NAME_RE = /^[A-Z][A-Z' -]*$/;
export const CONFIRMED_SEGMENT_STATUSES = ["HK", "KK", "TK"] as const;

/**
 * Normalises a phone number to E.164. Accepts local Tanzanian "0XXXXXXXXX", "255XXXXXXXXX", "00…" and "+…" forms,
 * with spaces, dashes, dots or brackets. Returns null when it is not a phone number.
 */
export function normalisePhone(input: string): string | null {
  const cleaned = input.trim().replace(/[\s\-().]/g, "");
  if (/^0\d{9}$/.test(cleaned)) return `+255${cleaned.slice(1)}`;
  if (/^255\d{9}$/.test(cleaned)) return `+${cleaned}`;
  if (/^00[1-9]\d{7,14}$/.test(cleaned)) return `+${cleaned.slice(2)}`;
  if (/^\+[1-9]\d{7,14}$/.test(cleaned)) return cleaned;
  return null;
}

/** "1762401234567" or "176-2401234567" (spaces allowed) → "176-2401234567"; null when invalid. */
export function normaliseTicket(input: string): string | null {
  const cleaned = input.trim().replace(/\s/g, "");
  if (!TICKET_RE.test(cleaned)) return null;
  const digits = cleaned.replace("-", "");
  return `${digits.slice(0, 3)}-${digits.slice(3)}`;
}

export const isValidTicket = (input: string | undefined | null): boolean => !!input && normaliseTicket(input) !== null;

export const normaliseLocator = (input: string): string => input.trim().toUpperCase();
export const isValidLocator = (input: string | undefined | null): boolean => !!input && RECORD_LOCATOR_RE.test(normaliseLocator(input));

/** Uppercases and collapses spaces: " mwakalinga  peter " → "MWAKALINGA PETER". */
export const normaliseName = (input: string): string => input.trim().replace(/\s+/g, " ").toUpperCase();
