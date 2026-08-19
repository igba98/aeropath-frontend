"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Info, Loader2, ShieldCheck, Tag } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckoutSteps } from "@/features/traveller/checkout-steps";
import { TripItemRow } from "@/features/traveller/trip-item-row";
import { useCart } from "@/features/traveller/use-cart";
import { PriceBreakdown } from "@/components/shared/price-breakdown";
import { EmptyState } from "@/components/shared/empty-state";
import { MoneyText } from "@/components/shared/money-text";
import { useStore } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";
import { cart } from "@/lib/api";
import { cn } from "@/lib/utils";

/** T13 · Review and pay. All-in price, policy recap, explicit consent; overlay actions layered on. */
export default function ReviewPage() {
  const router = useRouter();
  const { hydrated, booking, items, breakdown } = useCart();
  const promos = useStore(useShallow((st) => Object.values(st.promos).filter((p) => p.status === "active")));
  const [consent, setConsent] = useState(false);
  const [consentError, setConsentError] = useState(false);
  const [promo, setPromo] = useState("");
  const [busy, setBusy] = useState(false);



  if (!hydrated) return <Shell><div className="h-40 animate-pulse rounded-xl bg-muted" /></Shell>;
  if (!booking || !items.length) return <Shell><EmptyState title="Your trip is empty" action={<Button asChild><Link href="/stays">Find something to book</Link></Button>} /></Shell>;


  function applyPromo() {
    const found = promos.find((p) => p.code.toUpperCase() === promo.trim().toUpperCase());
    if (!found) return toast.error("That code is not valid", { description: "Check the spelling or ask your agent for a current code." });
    if (!items.some((i) => found.verticals.includes(i.vertical))) return toast.error("Code does not apply", { description: `${found.code} is valid for ${found.verticals.join(", ")} only.` });
    cart.update({ promoCode: found.code });
    toast.success(`${found.code} applied`, { description: found.description });
  }

  function proceed() {
    if (!consent) {
      setConsentError(true);
      toast.error("Please confirm you accept the booking and cancellation terms");
      document.getElementById("consent")?.focus();
      return;
    }
    setBusy(true);
    router.push("/payment");
  }



  return (
    <Shell>
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <div>
            <h1 className="font-display text-2xl">Review your trip</h1>
            <p className="text-sm text-muted-foreground">Everything below is final. The total includes taxes, levies and fees.</p>
          </div>


          <section className="space-y-3">
            <h2 className="font-medium">Your itinerary</h2>
            {items.map((item) => <TripItemRow key={item.id} item={item} compact />)}
          </section>

          <section className="rounded-xl border bg-card p-4">
            <h2 className="font-medium">Travellers</h2>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {booking.travellers.map((t, i) => (
                <li key={t.id || i}>
                  {t.title} {t.firstName} {t.lastName}
                  {i === 0 ? <span className="ml-2 text-xs">· lead · {t.phone} · {t.email}</span> : null}
                  {t.passportNumber ? <span className="ml-2 font-mono text-xs">{t.passportNumber}</span> : null}
                </li>
              ))}
            </ul>
            {booking.costCentre ? (
              <p className="mt-2 text-xs text-muted-foreground">Cost centre {booking.costCentre}{booking.projectCode ? ` · project ${booking.projectCode}` : ""}</p>
            ) : null}
            <Link href="/travellers" className="mt-2 inline-block text-xs font-medium text-brand-text underline underline-offset-2">Edit travellers</Link>
          </section>

          <section className="rounded-xl border bg-card p-4">
            <h2 className="flex items-center gap-1.5 font-medium"><ShieldCheck className="size-4" aria-hidden /> Cancellation terms</h2>
            <ul className="mt-2 space-y-2">
              {items.map((i) => (
                <li key={i.id} className="text-sm">
                  <span className="font-medium">{i.productSnapshot.title}</span>
                  <span className="block text-muted-foreground">{i.cancellationPolicySnapshot.summary}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">
              These exact terms are snapshotted onto your booking when you pay, so a later policy change cannot be applied to you.
            </p>
          </section>

          {/* Agent overlay: markup control */}

          {/* Corporate overlay: justification */}

          <section className="rounded-xl border bg-card p-4">
            <Label htmlFor="promo" className="flex items-center gap-1.5 font-medium"><Tag className="size-4" aria-hidden /> Promo code</Label>
            <div className="mt-2 flex gap-2">
              <Input id="promo" value={promo} onChange={(e) => setPromo(e.target.value.toUpperCase())} placeholder="KARIBU10" className="max-w-56 font-mono" />
              <Button variant="outline" onClick={applyPromo}>Apply</Button>
            </div>
            {booking.promoCode ? <p className="mt-2 text-xs text-success-foreground">{booking.promoCode} applied · −<MoneyText minor={booking.discountMinor} currency="TZS" size="xs" showCurrency={false} /></p> : null}
          </section>

          <section className={cn("rounded-xl border p-4", consentError && !consent ? "border-destructive bg-destructive/5" : "bg-card")}>
            <div className="flex items-start gap-3">
              <Checkbox id="consent" checked={consent} onCheckedChange={(c) => { setConsent(Boolean(c)); setConsentError(false); }} className="mt-0.5" aria-describedby="consent-desc" />
              <Label htmlFor="consent" id="consent-desc" className="text-sm font-normal leading-relaxed">
                I have read and accept the cancellation terms above, the booking conditions and the privacy notice. I confirm the traveller
                names match the identity documents that will be presented at check in.
              </Label>
            </div>
            {consentError && !consent ? <p role="alert" className="mt-2 text-xs text-destructive">You must accept the terms before continuing.</p> : null}
          </section>
        </div>

        <aside>
          <div className="sticky top-20 space-y-3">
            <PriceBreakdown data={breakdown} title="What you pay" />

            <Button className="w-full gap-2" size="lg" onClick={proceed} disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
                Continue to payment <ArrowRight className="size-4" aria-hidden />
              </Button>


            <p className="flex items-start gap-1.5 rounded-lg bg-muted p-3 text-[11px] text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Your inventory hold is live. If it expires before you pay, we release the rooms and you will need to search again.
            </p>
          </div>
        </aside>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-[1200px] px-4 py-6"><CheckoutSteps />{children}</div>;
}
