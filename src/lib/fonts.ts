import { JetBrains_Mono, Montserrat } from "next/font/google";

/** Montserrat carries the whole interface (user-pinned); tabular figures on every amount. */
export const fontSans = Montserrat({ subsets: ["latin"], variable: "--font-montserrat", display: "swap", weight: ["400", "500", "600", "700"] });

/** JetBrains Mono only for machine codes: PNR, ticket numbers, IATA codes. */
export const fontMono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains", display: "swap", weight: ["400", "500", "600"] });
