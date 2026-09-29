/**
 * Sample Amadeus PNR displays for the "Try a sample" menu (synthetic demo data).
 * Dates are re-based to today on insert so the demo always looks current.
 */

const FAMILY_TICKETED = `RP/DARTZ2100/DARTZ2100            GK/SU  28SEP26/0812Z   Z8K4QM
  1.MWAKALINGA/PETER MR   2.MWAKALINGA/ANNA MRS
  3.MWAKALINGA/DAVID MSTR(CHD/12MAR17)
  4  EK 726 Y 12OCT 1 DARDXB HK3  1650 2305   12OCT  E  EK/Z8K4QM
  5  EK 725 Y 26OCT 1 DXBDAR HK3  1020 1500   26OCT  E  EK/Z8K4QM
  6 AP DAR 255754000111 - H
  7 APE PETER@EXAMPLE.COM
  8 TK OK28SEP/DARTZ2100
  9 FA PAX 176-2401234567/ETEK/USD1450.00/28SEP26/DARTZ2100/00000000/S4-5/P1
 10 FA PAX 176-2401234568/ETEK/USD1450.00/28SEP26/DARTZ2100/00000000/S4-5/P2
 11 FA PAX 176-2401234569/ETEK/USD1120.00/28SEP26/DARTZ2100/00000000/S4-5/P3`;

const FAMILY_BOOKED = `RP/DARTZ2100/DARTZ2100            GK/SU  28SEP26/0812Z   Z8K4QM
  1.MWAKALINGA/PETER MR   2.MWAKALINGA/ANNA MRS
  3.MWAKALINGA/DAVID MSTR(CHD/12MAR17)
  4  EK 726 Y 12OCT 1 DARDXB HK3  1650 2305   12OCT  E  EK/Z8K4QM
  5  EK 725 Y 26OCT 1 DXBDAR HK3  1020 1500   26OCT  E  EK/Z8K4QM
  6 AP DAR 255754000111 - H
  7 APE PETER@EXAMPLE.COM
  8 TK TL30SEP/DARTZ2100`;

const BOOKED_RETURN = `RP/DARTZ2100/DARTZ2100            NM/SU  28SEP26/1435Z   W3JN6P
  1.SWAI/JOHN MR   2.SWAI/MARY MRS
  3  KQ 483 M 16OCT 5 DARNBO HK2  1015 1150   16OCT  E  KQ/9ZKLMP
  4  KQ 482 M 20OCT 2 NBODAR HK2  0715 0850   20OCT  E  KQ/9ZKLMP
  5 AP DAR 0713456789 - M
  6 APE JOHN.SWAI@EXAMPLE.COM
  7 TK TL05OCT/DARTZ2100`;

const MULTI_CITY = `RP/DARTZ2100/DARTZ2100            BL/SU  28SEP26/0930Z   T5MV8C
  1.MOSHA/DANIEL MR
  2  TK 604 J 02NOV 1 DARIST HK1  0200 0955   02NOV  E  TK/SXQ4LM
  3  TK1951 J 02NOV 1 ISTAMS HK1  1215 1400   02NOV  E  TK/SXQ4LM
  4  KL1001 Y 06NOV 5 AMSLHR HK1  0900 0915   06NOV  E  KL/HB72KA
  5  QR   4 C 09NOV 1 LHRDOH HK1  2155 0735+1 10NOV  E  QR/7RT2NF
  6  QR1349 C 10NOV 2 DOHDAR HK1  0905 1405   10NOV  E  QR/7RT2NF
  7 APM +255754222333
  8 TK TL20OCT/DARTZ2100`;

const INFANT = `RP/DARTZ2100/DARTZ2100            NM/SU  28SEP26/1102Z   L9BX2D
  1.KAHAMA/ASHA MRS(INFKAHAMA/ZAWADI/10JAN26)   2.KAHAMA/JUMA MR
  3  ET 806 T 14NOV 6 DARADD HK2  1540 1815  E  ET/L9BX2D
  4  ET 706 T 14NOV 6 ADDFRA HK2  2330 0440+1  E  ET/L9BX2D
  5 AP DAR 255787654321 - H
  6 TK TL02OCT/DARTZ2100`;

export const PNR_SAMPLES: { id: string; label: string; hint: string; text: string }[] = [
  { id: "family-booked", label: "Family to Dubai, not yet ticketed", hint: "Z8K4QM · 3 pax incl. child · TK TL", text: FAMILY_BOOKED },
  { id: "family-ticketed", label: "Family to Dubai, ticketed", hint: "Z8K4QM · FA lines with ticket numbers", text: FAMILY_TICKETED },
  { id: "booked-return", label: "Nairobi return", hint: "W3JN6P · 2 pax · KQ", text: BOOKED_RETURN },
  { id: "multi-city", label: "Multi-city via Istanbul", hint: "T5MV8C · business · +1 arrival", text: MULTI_CITY },
  { id: "infant", label: "Frankfurt with an infant", hint: "L9BX2D · lap infant", text: INFANT },
];

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/**
 * Shift every DDMMM / DDMMMYY date in a PNR so the header date lands on `today`.
 * Dates of birth inside name elements (e.g. "(CHD/12MAR17)", "/10JAN26)") are left untouched.
 */
export function rebaseSample(text: string, today: Date): string {
  const header = text.match(/\s(\d{2})([A-Z]{3})(\d{2})\/\d{4}Z/);
  if (!header) return text;
  const base = Date.UTC(2000 + Number(header[3]), MONTHS.indexOf(header[2]), Number(header[1]));
  const t = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const delta = Math.round((t - base) / 86_400_000);
  if (!delta) return text;
  return text
    .split("\n")
    .map((line) => {
      // Name lines carry dates of birth; keep them.
      if (/^\s*\d+\.[A-Z]/.test(line)) return line;
      return line.replace(/\b(\d{2})(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)(\d{2})?\b/g, (_m, dd: string, mmm: string, yy?: string) => {
        const year = yy ? 2000 + Number(yy) : new Date(base).getUTCFullYear();
        let d = new Date(Date.UTC(year, MONTHS.indexOf(mmm), Number(dd)));
        // Year-less dates earlier than the header roll into next year, as the parser would.
        if (!yy && d.getTime() < base) d = new Date(Date.UTC(year + 1, MONTHS.indexOf(mmm), Number(dd)));
        d = new Date(d.getTime() + delta * 86_400_000);
        const out = `${String(d.getUTCDate()).padStart(2, "0")}${MONTHS[d.getUTCMonth()]}`;
        return yy ? out + String(d.getUTCFullYear() % 100).padStart(2, "0") : out;
      });
    })
    .join("\n");
}
