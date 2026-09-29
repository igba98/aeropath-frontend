/**
 * SMS length (3GPP TS 23.038). Text that fits the GSM-7 alphabet is sent at 160 characters a part (153 when split,
 * the rest carries the joining header); the extension characters ^ { } \ [ ] ~ | € take two. Any other character
 * (an em dash, curly quotes, an emoji) switches the whole message to UCS-2: 70 a part, 67 when split.
 */

const GSM_BASIC = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM_EXTENDED = "^{}\\[]~|€\f";

const BASIC = new Set(GSM_BASIC);
const EXTENDED = new Set(GSM_EXTENDED);

export interface SmsInfo {
  encoding: "GSM-7" | "UCS-2";
  /** Length in the units the network counts: GSM-7 septets or UTF-16 code units. */
  units: number;
  segments: number;
  /** Units per part at this length: 160/153 (GSM-7) or 70/67 (UCS-2). */
  perSegment: number;
  /** Units left before the next part starts. */
  remaining: number;
  /** Characters that forced UCS-2, in order of first appearance. */
  nonGsm: string[];
}

export function smsSegments(text: string): SmsInfo {
  const nonGsm: string[] = [];
  let septets = 0;
  for (const ch of text) {
    if (BASIC.has(ch)) septets += 1;
    else if (EXTENDED.has(ch)) septets += 2;
    else if (!nonGsm.includes(ch)) nonGsm.push(ch);
  }
  const gsm = nonGsm.length === 0;
  const units = gsm ? septets : text.length; // UTF-16 code units: an emoji counts two
  const single = gsm ? 160 : 70;
  const multi = gsm ? 153 : 67;
  const segments = units === 0 ? 0 : units <= single ? 1 : Math.ceil(units / multi);
  const perSegment = segments > 1 ? multi : single;
  const remaining = segments === 0 ? single : segments * perSegment - units;
  return { encoding: gsm ? "GSM-7" : "UCS-2", units, segments, perSegment, remaining, nonGsm };
}

/** The most parts an SMS may run to before we ask for WhatsApp or email instead. */
export const MAX_SMS_SEGMENTS = 10;

/** Look-alikes outside GSM-7 that have a plain equivalent: dashes, curly quotes, ellipsis, arrows, odd spaces. */
const PLAIN: Record<string, string> = {
  "\u2014": "-", // em dash
  "\u2013": "-", // en dash
  "\u2212": "-", // minus sign
  "\u2018": "'",
  "\u2019": "'",
  "\u201C": '"',
  "\u201D": '"',
  "\u2026": "...",
  "\u2192": "->",
  "\u00A0": " ",
  "\u2009": " ",
  "\u202F": " ",
  "\u00B7": "-", // middle dot
  "\u2022": "-", // bullet
};

/** Swaps typographic characters for plain ones so an SMS can stay in GSM-7 (160 a part). Others are left alone. */
export function toPlainSms(text: string): string {
  let out = "";
  for (const ch of text) out += PLAIN[ch] ?? ch;
  return out;
}

/** True when toPlainSms would change something. */
export const hasPlainSwap = (text: string): boolean => [...text].some((ch) => ch in PLAIN);
