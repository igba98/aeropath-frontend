"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ArrowRight, LogIn, ShieldCheck, Store } from "lucide-react";
import { Logo } from "@/components/chrome/logo";
import { PersonaBar } from "@/components/chrome/persona-bar";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";

const CONSOLES = [
  { href: "/partner/supplier", label: "Supplier console", icon: Store, description: "Lodges, camps, tour operators, airlines and transfer companies. Products, availability, booking confirmations and payouts.", persona: "Sign in as Neema Mushi (Serengeti Serena) or Baraka Lema (Kubu Kubu)." },
];

/** Partner portal entry point — routes each persona to the console their organisation owns. */
export default function PartnerIndexPage() {
  const router = useRouter();
  const { hydrated, org, isInternal, user } = useSession();

  const destination = org?.type === "supplier" ? "/partner/supplier" : undefined;

  useEffect(() => {
    if (hydrated && destination) router.replace(destination);
  }, [hydrated, destination, router]);

  if (!hydrated) {
    return <div className="p-8 text-sm text-muted-foreground">Loading the partner portal…</div>;
  }

  if (destination) {
    return (
      <div className="p-8 text-sm text-muted-foreground">
        Taking you to your console… <Link href={destination} className="text-brand-text underline">continue</Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-muted/30">
      <PersonaBar />
      <div className="mx-auto w-full max-w-4xl flex-1 px-4 py-10">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo />
          <h1 className="mt-6 font-display text-3xl">Partner portal</h1>
          <p className="mt-2 max-w-lg text-sm text-muted-foreground">
            {user ? `${user.name} is not attached to a partner organisation.` : "You are not signed in."} Pick the console you want to see, or sign in with a persona that belongs to one.
          </p>
        </div>

        <ul className="grid gap-3 sm:grid-cols-3">
          {CONSOLES.map((c) => (
            <li key={c.href}>
              <Link href={c.href} className="flex h-full flex-col rounded-xl border bg-card p-4 transition-colors hover:border-brand-400">
                <span className="mb-3 flex size-10 items-center justify-center rounded-full bg-brand-50 text-brand-text-strong">
                  <c.icon className="size-5" aria-hidden />
                </span>
                <span className="font-display text-lg">{c.label}</span>
                <span className="mt-1 text-sm text-muted-foreground">{c.description}</span>
                <span className="mt-3 text-xs text-muted-foreground">{c.persona}</span>
                <span className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand-text">
                  Open <ArrowRight className="size-3.5" aria-hidden />
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link href="/login"><LogIn className="size-4" aria-hidden />Switch persona</Link>
          </Button>
          {isInternal ? (
            <Button variant="outline" asChild>
              <Link href="/admin"><ShieldCheck className="size-4" aria-hidden />You are internal · go to the back office</Link>
            </Button>
          ) : (
            <Button variant="outline" asChild>
              <Link href="/">Back to the traveller site</Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
