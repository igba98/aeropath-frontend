"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CreditCard, Landmark, Loader2, Lock, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckoutSteps } from "@/features/traveller/checkout-steps";
import { useCart } from "@/features/traveller/use-cart";
import { PriceBreakdown } from "@/components/shared/price-breakdown";
import { EmptyState } from "@/components/shared/empty-state";
import { MoneyText } from "@/components/shared/money-text";
import { useSession } from "@/hooks/use-session";
import { useStore } from "@/lib/store";
import { checkout } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { PaymentRail } from "@/lib/domain/types";

const MOBILE_RAILS: Array<{ id: PaymentRail; label: string; hint: string; flag: string }> = [
  { id: "mpesa", label: "M-Pesa", hint: "Vodacom · most used", flag: "payment.rail.mpesa" },
  { id: "tigopesa", label: "Tigo Pesa", hint: "Yas / Tigo", flag: "payment.rail.tigopesa" },
  { id: "airtel", label: "Airtel Money", hint: "Airtel", flag: "payment.rail.airtel" },
  { id: "halopesa", label: "Halopesa", hint: "Halotel", flag: "payment.rail.halopesa" },
];

/** T14 · Payment method. Rails are gated by kill-switch feature flags set in the back office. */
export default function PaymentPage() {
  const router = useRouter();
  const s = useSession();
  const { hydrated, booking, items, breakdown } = useCart();
  const flags = useStore((st) => st.flags);
  const [rail, setRail] = useState<PaymentRail>("mpesa");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);

  if (!hydrated) return <Shell><div className="h-40 animate-pulse rounded-xl bg-muted" /></Shell>;
  if (!booking || !items.length) return <Shell><EmptyState title="Nothing to pay for" description="Your trip is empty or the hold expired." action={<Button asChild><Link href="/stays">Start again</Link></Button>} /></Shell>;

  const leadPhone = booking.leadTraveller?.phone ?? s.user?.phone ?? "";
  const availableMobile = MOBILE_RAILS.filter((r) => flags[r.flag]?.enabled !== false);
  const cardEnabled = flags["payment.rail.card"]?.enabled !== false;

  function pay() {
    setBusy(true);
    try {
      const isMobile = ["mpesa", "tigopesa", "airtel", "halopesa"].includes(rail);
      const usePhone = (phone || leadPhone).replace(/\s/g, "");
      if (isMobile && !/^\+?[1-9]\d{7,14}$/.test(usePhone)) {
        toast.error("Enter the mobile money number", { description: "Use the international format, e.g. +255754123456." });
        setBusy(false);
        return;
      }
      const paymentId = checkout.initiate(booking!.id, rail, { phone: isMobile ? usePhone : undefined });
      if (rail === "card" || rail === "bank") {
        router.push(`/pending/${booking!.reference}?payment=${paymentId}`);
      } else {
        router.push(`/pending/${booking!.reference}?payment=${paymentId}`);
      }
    } catch (e) {
      const err = e as Error & { code?: string };
      toast.error(err.code === "CREDIT_INSUFFICIENT" ? "Not enough credit" : "Payment could not start", { description: err.message });
      setBusy(false);
    }
  }

  return (
    <Shell>
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <div>
            <h1 className="font-display text-2xl">How would you like to pay?</h1>
            <p className="text-sm text-muted-foreground">
              Paying <MoneyText minor={booking.totalMinor} currency={booking.currency} size="sm" /> for reference <span className="font-mono">{booking.reference}</span>
            </p>
          </div>

          {availableMobile.length ? (
            <section>
              <h2 className="mb-2 flex items-center gap-1.5 text-sm font-medium"><Smartphone className="size-4" aria-hidden /> Mobile money</h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {availableMobile.map((r) => (
                  <RailOption key={r.id} active={rail === r.id} onSelect={() => setRail(r.id)} title={r.label} hint={r.hint} icon={Smartphone} />
                ))}
              </div>
              {["mpesa", "tigopesa", "airtel", "halopesa"].includes(rail) ? (
                <div className="mt-3 rounded-xl border bg-card p-4">
                  <Label htmlFor="msisdn">Mobile money number</Label>
                  <Input
                    id="msisdn"
                    value={phone || leadPhone}
                    onChange={(e) => setPhone(e.target.value)}
                    inputMode="tel"
                    placeholder="+255 754 123 456"
                    className="mt-1 max-w-64"
                  />
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    We send a payment prompt to this number. Approve it with your PIN — you have two minutes.
                  </p>
                </div>
              ) : null}
            </section>
          ) : null}

          <section>
            <h2 className="mb-2 text-sm font-medium">Other methods</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {cardEnabled ? <RailOption active={rail === "card"} onSelect={() => setRail("card")} title="Card" hint="Visa, Mastercard · 3-D Secure" icon={CreditCard} /> : null}
              <RailOption active={rail === "bank"} onSelect={() => setRail("bank")} title="Bank transfer" hint="CRDB, NMB · confirms in 1 business day" icon={Landmark} />
            </div>
          </section>

          {rail === "card" ? (
            <section className="rounded-xl border bg-card p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <Label htmlFor="pan">Card number</Label>
                  <Input id="pan" inputMode="numeric" placeholder="4242 4242 4242 4242" className="mt-1 font-mono" autoComplete="cc-number" />
                </div>
                <div><Label htmlFor="exp">Expiry</Label><Input id="exp" placeholder="09/29" className="mt-1 font-mono" autoComplete="cc-exp" /></div>
                <div><Label htmlFor="cvc">CVC</Label><Input id="cvc" placeholder="123" className="mt-1 font-mono" autoComplete="cc-csc" /></div>
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground"><Lock className="size-3.5" aria-hidden /> Prototype — no card data leaves this browser and no charge is made.</p>
            </section>
          ) : null}

          {rail === "bank" ? (
            <section className="rounded-xl border bg-card p-4 text-sm">
              <p className="font-medium">Transfer to</p>
              <dl className="mt-2 grid gap-1 text-muted-foreground sm:grid-cols-2">
                <div><dt className="text-xs">Bank</dt><dd>CRDB Bank PLC</dd></div>
                <div><dt className="text-xs">Account</dt><dd className="font-mono">0150 3947 8200</dd></div>
                <div><dt className="text-xs">Name</dt><dd>Aeropath Tanzania Ltd</dd></div>
                <div><dt className="text-xs">Reference</dt><dd className="font-mono">{booking.reference}</dd></div>
              </dl>
              <p className="mt-2 text-xs">Use the reference exactly — it is how we match your payment automatically.</p>
            </section>
          ) : null}

        </div>

        <aside>
          <div className="sticky top-20 space-y-3">
            <PriceBreakdown data={breakdown} title="What you pay" />
            <Button className="w-full gap-2" size="lg" onClick={pay} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Lock className="size-4" aria-hidden />}
              Pay <MoneyText minor={booking.totalMinor} currency={booking.currency} size="sm" className="text-primary-foreground" />
            </Button>
            <p className="text-center text-[11px] text-muted-foreground">
              You are charged once. Duplicate provider callbacks are ignored by an idempotency key.
            </p>
          </div>
        </aside>
      </div>
    </Shell>
  );
}

function RailOption({ active, onSelect, title, hint, icon: Icon, disabled, warning }: { active: boolean; onSelect: () => void; title: string; hint: string; icon: typeof Smartphone; disabled?: boolean; warning?: string }) {
  return (
    <button
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-3 rounded-xl border p-3 text-left transition-all disabled:opacity-50",
        active ? "border-brand-400 bg-brand-50 ring-1 ring-brand-300" : "bg-card hover:border-brand-300",
      )}
    >
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", active ? "bg-brand-500 text-white" : "bg-muted text-muted-foreground")}>
        <Icon className="size-4.5" aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block font-medium">{title}</span>
        <span className={cn("block truncate text-xs", warning ? "text-destructive" : "text-muted-foreground")}>{warning ?? hint}</span>
      </span>
    </button>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-[1200px] px-4 py-6"><CheckoutSteps />{children}</div>;
}
