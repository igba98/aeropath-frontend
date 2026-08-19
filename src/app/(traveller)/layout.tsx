import { PersonaBar } from "@/components/chrome/persona-bar";
import { TravellerHeader } from "@/components/chrome/traveller-header";
import { TravellerFooter } from "@/components/chrome/traveller-footer";

export default function TravellerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <PersonaBar />
      <TravellerHeader />
      <main className="flex-1">{children}</main>
      <TravellerFooter />
    </div>
  );
}
