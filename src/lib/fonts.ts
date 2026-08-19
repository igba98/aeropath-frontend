import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";

/**
 * Plus Jakarta Sans carries the whole interface — one family, three weights:
 *   600 large headings · 500 buttons and sub-headings · 400 body, inputs and statements.
 * JetBrains Mono is kept only for machine references (booking codes, ledger accounts, IDs),
 * where character disambiguation is the point rather than styling.
 */
export const fontSans = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
  adjustFontFallback: true,
});

/** Display and body are the same family now; the alias keeps existing `font-display` usage working. */
export const fontDisplay = fontSans;

export const fontMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });
