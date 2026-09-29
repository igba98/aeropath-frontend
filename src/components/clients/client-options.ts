import type { Client, ClientSource, OrgType, Title, TravelPolicy } from "@/domain/types";

/** Reference lists and labels for client profiles. */

export const CLIENT_SOURCES: { value: ClientSource; label: string }[] = [
  { value: "walk_in", label: "Walk-in" },
  { value: "phone", label: "Phone" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "Email" },
  { value: "referral", label: "Referral" },
];

/** "corporate" is stored; staff see "Organisation". */
export const clientTypeLabel = (type: Client["type"]): string => (type === "corporate" ? "Organisation" : "Individual");

export const ORG_TYPES: { value: OrgType; label: string }[] = [
  { value: "company", label: "Company" },
  { value: "government", label: "Government" },
  { value: "ngo", label: "NGO" },
  { value: "embassy", label: "Embassy" },
  { value: "education", label: "School or university" },
  { value: "other", label: "Other" },
];
export const orgTypeLabel = (t?: OrgType): string | undefined => ORG_TYPES.find((o) => o.value === t)?.label;

export const SECTORS = [
  "Government and parastatals",
  "Mining",
  "Oil and gas",
  "Health",
  "Education",
  "NGO and development",
  "Tourism and hospitality",
  "Banking and finance",
  "Telecoms",
  "Construction",
  "Agriculture",
  "Manufacturing",
  "Logistics",
  "Other",
] as const;

/** The sector most organisations of a kind are in, suggested when none is chosen yet. */
export const SECTOR_FOR_ORG_TYPE: Partial<Record<OrgType, (typeof SECTORS)[number]>> = {
  government: "Government and parastatals",
  ngo: "NGO and development",
  education: "Education",
};

export const ID_TYPES: { value: NonNullable<Client["idType"]>; label: string }[] = [
  { value: "nida", label: "NIDA national ID" },
  { value: "passport", label: "Passport" },
  { value: "driving_licence", label: "Driving licence" },
  { value: "voter_id", label: "Voter ID" },
];
export const idTypeLabel = (t?: Client["idType"]): string | undefined => ID_TYPES.find((o) => o.value === t)?.label;
/** Short form beside the number: "NIDA 19900101-12345-00001-12". */
export const idTypeShort = (t?: Client["idType"]): string | undefined => (t === "nida" ? "NIDA" : idTypeLabel(t));

export const CLIENT_TITLES: { value: Title; label: string }[] = [
  { value: "MR", label: "Mr" },
  { value: "MRS", label: "Mrs" },
  { value: "MS", label: "Ms" },
  { value: "MSTR", label: "Master (boy)" },
  { value: "MISS", label: "Miss (girl)" },
];

export const CABINS: { value: TravelPolicy["cabin"]; label: string }[] = [
  { value: "economy", label: "Economy" },
  { value: "premium_economy", label: "Premium economy" },
  { value: "business", label: "Business" },
];
export const cabinLabel = (c?: TravelPolicy["cabin"]): string => CABINS.find((o) => o.value === c)?.label ?? "Economy";

export const SEATS: { value: "window" | "aisle" | "any"; label: string }[] = [
  { value: "window", label: "Window" },
  { value: "aisle", label: "Aisle" },
  { value: "any", label: "No preference" },
];

/** Special meals as airlines code them (IATA SSR). */
export const MEALS = [
  "Vegetarian (VGML)",
  "Asian vegetarian (AVML)",
  "Muslim, halal (MOML)",
  "Hindu (HNML)",
  "Kosher (KSML)",
  "Diabetic (DBML)",
  "Gluten-free (GFML)",
  "Low salt (LSML)",
  "Bland (BLML)",
  "Child meal (CHML)",
];

export const DEPARTMENT_SUGGESTIONS = ["Management", "Finance", "Operations", "Human resources", "Procurement", "Sales and marketing", "ICT", "Projects"];

/** Countries staff pick most often, Tanzania and the region first. Any other 2-letter code can be typed. */
export const COUNTRIES: { code: string; name: string }[] = [
  { code: "TZ", name: "Tanzania" },
  { code: "KE", name: "Kenya" },
  { code: "UG", name: "Uganda" },
  { code: "RW", name: "Rwanda" },
  { code: "BI", name: "Burundi" },
  { code: "CD", name: "DR Congo" },
  { code: "ZM", name: "Zambia" },
  { code: "MW", name: "Malawi" },
  { code: "MZ", name: "Mozambique" },
  { code: "SS", name: "South Sudan" },
  { code: "ET", name: "Ethiopia" },
  { code: "SO", name: "Somalia" },
  { code: "KM", name: "Comoros" },
  { code: "ZA", name: "South Africa" },
  { code: "ZW", name: "Zimbabwe" },
  { code: "BW", name: "Botswana" },
  { code: "NA", name: "Namibia" },
  { code: "MG", name: "Madagascar" },
  { code: "MU", name: "Mauritius" },
  { code: "SC", name: "Seychelles" },
  { code: "NG", name: "Nigeria" },
  { code: "GH", name: "Ghana" },
  { code: "EG", name: "Egypt" },
  { code: "SD", name: "Sudan" },
  { code: "AE", name: "United Arab Emirates" },
  { code: "SA", name: "Saudi Arabia" },
  { code: "QA", name: "Qatar" },
  { code: "OM", name: "Oman" },
  { code: "TR", name: "Türkiye" },
  { code: "IN", name: "India" },
  { code: "PK", name: "Pakistan" },
  { code: "CN", name: "China" },
  { code: "JP", name: "Japan" },
  { code: "TH", name: "Thailand" },
  { code: "MY", name: "Malaysia" },
  { code: "SG", name: "Singapore" },
  { code: "GB", name: "United Kingdom" },
  { code: "IE", name: "Ireland" },
  { code: "FR", name: "France" },
  { code: "DE", name: "Germany" },
  { code: "NL", name: "Netherlands" },
  { code: "BE", name: "Belgium" },
  { code: "CH", name: "Switzerland" },
  { code: "IT", name: "Italy" },
  { code: "ES", name: "Spain" },
  { code: "SE", name: "Sweden" },
  { code: "NO", name: "Norway" },
  { code: "DK", name: "Denmark" },
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
];
export const countryName = (code?: string): string | undefined => (code ? (COUNTRIES.find((c) => c.code === code.toUpperCase())?.name ?? code.toUpperCase()) : undefined);

/** Tanzania's 31 regions (mainland and Zanzibar). */
export const TZ_REGIONS = [
  "Arusha",
  "Dar es Salaam",
  "Dodoma",
  "Geita",
  "Iringa",
  "Kagera",
  "Katavi",
  "Kigoma",
  "Kilimanjaro",
  "Lindi",
  "Manyara",
  "Mara",
  "Mbeya",
  "Morogoro",
  "Mtwara",
  "Mwanza",
  "Njombe",
  "Pwani",
  "Rukwa",
  "Ruvuma",
  "Shinyanga",
  "Simiyu",
  "Singida",
  "Songwe",
  "Tabora",
  "Tanga",
  "Kaskazini Pemba",
  "Kusini Pemba",
  "Kaskazini Unguja",
  "Kusini Unguja",
  "Mjini Magharibi",
];
