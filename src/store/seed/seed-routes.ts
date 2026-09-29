/**
 * Flight templates for the seed (local times at each airport; `plus` = arrival day offset). Schedules are
 * illustrative, not a timetable. `seg("EK726", 12)` = EK 726 DAR→DXB departing 12 days from today.
 */
import type { SegSpec } from "./seed-file";

type Tpl = Omit<SegSpec, "d" | "rbd">;

const TEMPLATES = {
  // Emirates (176)
  EK726: { c: "EK", n: "726", from: "DAR", to: "DXB", dep: "16:50", arr: "23:05", eq: "77W" },
  EK725: { c: "EK", n: "725", from: "DXB", to: "DAR", dep: "10:20", arr: "15:00", eq: "77W" },
  // Qatar Airways (157)
  QR1350: { c: "QR", n: "1350", from: "DAR", to: "DOH", dep: "16:10", arr: "22:15", eq: "788" },
  QR1349: { c: "QR", n: "1349", from: "DOH", to: "DAR", dep: "08:20", arr: "14:25", eq: "788" },
  QR1351: { c: "QR", n: "1351", from: "DOH", to: "DAR", dep: "23:55", arr: "05:50", plus: 1, eq: "788" },
  QR5: { c: "QR", n: "5", from: "DOH", to: "LHR", dep: "01:40", arr: "06:35", eq: "351" },
  QR4: { c: "QR", n: "4", from: "LHR", to: "DOH", dep: "21:00", arr: "06:40", plus: 1, eq: "351" },
  QR1343: { c: "QR", n: "1343", from: "DOH", to: "JRO", dep: "08:40", arr: "13:45", eq: "788" },
  QR39: { c: "QR", n: "39", from: "DOH", to: "CDG", dep: "01:30", arr: "07:10", eq: "351" },
  QR40: { c: "QR", n: "40", from: "CDG", to: "DOH", dep: "10:30", arr: "18:30", eq: "351" },
  // Kenya Airways (706)
  KQ485: { c: "KQ", n: "485", from: "DAR", to: "NBO", dep: "13:05", arr: "14:25", eq: "E90" },
  KQ484: { c: "KQ", n: "484", from: "NBO", to: "DAR", dep: "09:40", arr: "11:00", eq: "E90" },
  KQ116: { c: "KQ", n: "116", from: "NBO", to: "AMS", dep: "23:55", arr: "06:40", plus: 1, eq: "788" },
  KQ117: { c: "KQ", n: "117", from: "AMS", to: "NBO", dep: "11:40", arr: "21:30", eq: "788" },
  // Ethiopian Airlines (071)
  ET806: { c: "ET", n: "806", from: "DAR", to: "ADD", dep: "15:40", arr: "18:15", eq: "7M8" },
  ET815: { c: "ET", n: "815", from: "ADD", to: "DAR", dep: "08:45", arr: "12:55", eq: "7M8" },
  ET606: { c: "ET", n: "606", from: "ADD", to: "CAN", dep: "23:10", arr: "15:30", plus: 1, eq: "359" },
  ET607: { c: "ET", n: "607", from: "CAN", to: "ADD", dep: "00:45", arr: "06:30", eq: "359" },
  // Turkish Airlines (235)
  TK604: { c: "TK", n: "604", from: "DAR", to: "IST", dep: "03:55", arr: "10:55", eq: "333" },
  TK603: { c: "TK", n: "603", from: "IST", to: "DAR", dep: "19:25", arr: "03:25", plus: 1, eq: "333" },
  TK675: { c: "TK", n: "675", from: "IST", to: "ZNZ", dep: "20:10", arr: "04:10", plus: 1, eq: "333" },
  TK676: { c: "TK", n: "676", from: "ZNZ", to: "IST", dep: "05:40", arr: "12:55", eq: "333" },
  // EgyptAir (077)
  MS850: { c: "MS", n: "850", from: "DAR", to: "CAI", dep: "14:50", arr: "20:05", eq: "32N" },
  MS849: { c: "MS", n: "849", from: "CAI", to: "DAR", dep: "23:10", arr: "06:25", plus: 1, eq: "32N" },
  // KLM (074)
  KL570: { c: "KL", n: "570", from: "DAR", to: "AMS", dep: "21:45", arr: "06:10", plus: 1, eq: "789" },
  KL569: { c: "KL", n: "569", from: "AMS", to: "DAR", dep: "10:15", arr: "20:45", eq: "789" },
  // No confirmed ticket prefix: used only on quoted or booked lines
  FZ687: { c: "FZ", n: "687", from: "DAR", to: "DXB", dep: "13:35", arr: "19:55", eq: "7M8" },
  FZ686: { c: "FZ", n: "686", from: "DXB", to: "DAR", dep: "07:05", arr: "11:30", eq: "7M8" },
  TC104: { c: "TC", n: "104", from: "DAR", to: "DOD", dep: "07:00", arr: "08:10", eq: "DH4" },
  TC105: { c: "TC", n: "105", from: "DOD", to: "DAR", dep: "17:30", arr: "18:40", eq: "DH4" },
  TC110: { c: "TC", n: "110", from: "DAR", to: "MWZ", dep: "06:30", arr: "08:15", eq: "221" },
  TC111: { c: "TC", n: "111", from: "MWZ", to: "DAR", dep: "17:00", arr: "18:45", eq: "221" },
  PW710: { c: "PW", n: "710", from: "DAR", to: "ZNZ", dep: "07:40", arr: "08:05", eq: "AT7" },
  PW711: { c: "PW", n: "711", from: "ZNZ", to: "DAR", dep: "17:30", arr: "17:55", eq: "AT7" },
  WB401: { c: "WB", n: "401", from: "DAR", to: "KGL", dep: "16:05", arr: "17:05", eq: "CR9" },
  WB400: { c: "WB", n: "400", from: "KGL", to: "DAR", dep: "11:25", arr: "14:25", eq: "CR9" },
} satisfies Record<string, Tpl>;

export type FlightCode = keyof typeof TEMPLATES;

export function seg(code: FlightCode, d: number, rbd = "Y"): SegSpec {
  const t: Tpl = TEMPLATES[code];
  return { ...t, d, rbd };
}
