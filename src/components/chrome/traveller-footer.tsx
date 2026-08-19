import Link from "next/link";
import { Logo } from "./logo";

const COLUMNS = [
  { title: "Destinations", links: [["Serengeti", "/destinations/serengeti"], ["Zanzibar", "/destinations/zanzibar"], ["Ngorongoro", "/destinations/ngorongoro"], ["Arusha & Kilimanjaro", "/destinations/arusha"]] },
  { title: "Collections", links: [["Bush & Beach", "/collections/bush-and-beach"], ["Tours & Safari", "/tours"], ["Flights", "/flights"], ["Transfers", "/transfers"]] },
  { title: "Partners", links: [["List your property", "/partner/supplier/onboarding"], ["Supplier console", "/partner/supplier"], ["Partner sign in", "/login"], ["Prototype notes", "/about"]] },
  { title: "Company", links: [["Back office", "/admin"], ["Prototype notes", "/about"], ["Support", "/trips"], ["Personas", "/login"]] },
] as const;

export function TravellerFooter() {
  return (
    <footer className="mt-16 border-t bg-muted/40">
      <div className="mx-auto max-w-[1400px] px-4 py-12">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div>
            <Logo />
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">
              Lodges, safaris, flights and transfers across Tanzania and East Africa. All-in prices, mobile money, instant vouchers.
            </p>
            <p className="mt-4 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
              {["M-Pesa", "Tigo Pesa", "Airtel Money", "Visa", "Mastercard"].map((x) => (
                <span key={x} className="rounded border bg-background px-2 py-1">{x}</span>
              ))}
            </p>
          </div>
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{col.title}</p>
              <ul className="mt-3 space-y-2">
                {col.links.map(([label, href]) => (
                  <li key={label}>
                    <Link href={href} className="text-sm text-muted-foreground transition-colors hover:text-brand-text">{label}</Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-col gap-2 border-t pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} Aeropath. Prototype build — no real payments are taken.</p>
          <p>Prices include VAT 18%, tourism levy and service fee. TIN 000-000-000 · TALA licence pending.</p>
        </div>
      </div>
    </footer>
  );
}
