"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowRight, BookUser, Info, Plus, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CheckoutSteps } from "@/features/traveller/checkout-steps";
import { useCart } from "@/features/traveller/use-cart";
import { PriceBreakdown } from "@/components/shared/price-breakdown";
import { EmptyState } from "@/components/shared/empty-state";
import { useSession } from "@/hooks/use-session";
import { cart } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { SavedTraveller } from "@/lib/domain/types";

const BLANK: SavedTraveller = { id: "", title: "Mr", firstName: "", lastName: "", dateOfBirth: "", nationality: "TZ", phone: "", email: "" };

/** T11 · Traveller details. Lead traveller plus per pax fields, saved travellers, cost centre for corporates. */
export default function TravellersPage() {
  const router = useRouter();
  const s = useSession();
  const { hydrated, booking, items, breakdown } = useCart();
  const [errors, setErrors] = useState<Record<string, string>>({});

  const requiredPax = Math.max(1, items.reduce((m, i) => Math.max(m, i.pax.adults + i.pax.children), 1));
  const needsPassport = items.some((i) => i.vertical === "tour" || i.vertical === "flight" || i.productSnapshot.region === "Serengeti");

  // The form seeds from the booking, then from the traveller's saved people, then from blanks.
  // Holding edits as an override rather than copying into an effect means the fields are filled
  // on the first paint — no flash of empty inputs on a slow connection.
  const [peopleEdit, setPeopleEdit] = useState<SavedTraveller[] | null>(null);

  const seededPeople = useMemo(() => {
    if (booking?.travellers.length) return booking.travellers;
    const seed = (s.user?.savedTravellers ?? []).slice(0, requiredPax);
    return Array.from({ length: requiredPax }, (_, i) => seed[i] ?? { ...BLANK, id: `new_${i}` });
  }, [booking?.travellers, s.user?.savedTravellers, requiredPax]);

  const people = peopleEdit ?? seededPeople;

  const setPeople = (next: SavedTraveller[] | ((prev: SavedTraveller[]) => SavedTraveller[])) =>
    setPeopleEdit((prev) => (typeof next === "function" ? next(prev ?? seededPeople) : next));

  if (!hydrated) return <Shell><div className="h-40 animate-pulse rounded-xl bg-muted" /></Shell>;
  if (!booking || !items.length) return <Shell><EmptyState title="Your trip is empty" action={<Button asChild><Link href="/stays">Find something to book</Link></Button>} /></Shell>;

  function update(i: number, patch: Partial<SavedTraveller>) {
    setPeople((p) => p.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }

  function applySavedTraveller(i: number, id: string) {
    const t = s.user?.savedTravellers.find((x) => x.id === id);
    if (t) setPeople((p) => p.map((x, idx) => (idx === i ? { ...t } : x)));
  }

  function submit() {
    const errs: Record<string, string> = {};
    people.forEach((p, i) => {
      if (!p.firstName.trim()) errs[`${i}.firstName`] = "Required";
      if (!p.lastName.trim()) errs[`${i}.lastName`] = "Required";
      if (i === 0) {
        if (!/^\+[1-9]\d{7,14}$/.test(p.phone.replace(/\s/g, ""))) errs["0.phone"] = "Use the international format, e.g. +255754123456";
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.email)) errs["0.email"] = "A valid email is needed for the voucher";
      }
      if (needsPassport && !p.passportNumber?.trim()) errs[`${i}.passport`] = "Needed for park permits and flights";
    });
    setErrors(errs);
    if (Object.keys(errs).length) {
      toast.error("Check the highlighted fields");
      const first = document.querySelector<HTMLElement>("[data-invalid='true']");
      first?.focus();
      return;
    }
    const withIds = people.map((p, i) => ({ ...p, id: p.id || `trv_${Date.now()}_${i}` }));
    cart.update({ travellers: withIds, leadTraveller: withIds[0] });
    router.push("/extras");
  }

  const saved = s.user?.savedTravellers ?? [];

  return (
    <Shell>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <div>
            <h1 className="font-display text-2xl">Who is travelling?</h1>
            <p className="text-sm text-muted-foreground">Names must match the passport or national ID used at check in.</p>
          </div>

          {s.isGuest ? (
            <Alert>
              <Info className="size-4" />
              <AlertTitle>Booking as a guest</AlertTitle>
              <AlertDescription>
                You can continue without an account — we only need a phone number so we can send the voucher.{" "}
                <Link href="/login" className="font-medium text-brand-text underline underline-offset-2">Sign in</Link> to reuse saved travellers.
              </AlertDescription>
            </Alert>
          ) : null}

          {needsPassport ? (
            <Alert>
              <Info className="size-4" />
              <AlertTitle>Passport details needed</AlertTitle>
              <AlertDescription>Your trip includes a park permit or a flight, so we need passport numbers for every traveller.</AlertDescription>
            </Alert>
          ) : null}

          {people.map((p, i) => (
            <section key={i} className="rounded-xl border bg-card p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 font-medium">
                  <UserRound className="size-4 text-brand-text" aria-hidden />
                  {i === 0 ? "Lead traveller" : `Traveller ${i + 1}`}
                </h2>
                {saved.length ? (
                  <Select onValueChange={(v) => applySavedTraveller(i, v)}>
                    <SelectTrigger className="h-8 w-auto gap-1.5 text-xs">
                      <BookUser className="size-3.5" aria-hidden />
                      <SelectValue placeholder="Use a saved traveller" />
                    </SelectTrigger>
                    <SelectContent>
                      {saved.map((t) => <SelectItem key={t.id} value={t.id}>{t.firstName} {t.lastName}</SelectItem>)}
                    </SelectContent>
                  </Select>
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2 sm:grid sm:grid-cols-[100px_1fr_1fr] sm:gap-3">
                  <div>
                    <Label htmlFor={`title-${i}`}>Title</Label>
                    <Select value={p.title} onValueChange={(v) => update(i, { title: v as SavedTraveller["title"] })}>
                      <SelectTrigger id={`title-${i}`} className="mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>{["Mr", "Mrs", "Ms", "Dr"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <Field id={`fn-${i}`} label="First name" value={p.firstName} onChange={(v) => update(i, { firstName: v })} error={errors[`${i}.firstName`]} autoComplete="given-name" />
                  <Field id={`ln-${i}`} label="Last name" value={p.lastName} onChange={(v) => update(i, { lastName: v })} error={errors[`${i}.lastName`]} autoComplete="family-name" />
                </div>

                <Field id={`dob-${i}`} label="Date of birth" type="date" value={p.dateOfBirth} onChange={(v) => update(i, { dateOfBirth: v })} hint="Drives the passenger type and price" />
                <Field id={`nat-${i}`} label="Nationality" value={p.nationality} onChange={(v) => update(i, { nationality: v.toUpperCase().slice(0, 2) })} hint="Two letter code, e.g. TZ" />

                {i === 0 ? (
                  <>
                    <Field id={`ph-${i}`} label="Mobile number" value={p.phone} onChange={(v) => update(i, { phone: v })} error={errors["0.phone"]} hint="We send the voucher by SMS and WhatsApp" autoComplete="tel" inputMode="tel" />
                    <Field id={`em-${i}`} label="Email" type="email" value={p.email} onChange={(v) => update(i, { email: v })} error={errors["0.email"]} autoComplete="email" />
                  </>
                ) : null}

                {needsPassport ? (
                  <>
                    <Field id={`pp-${i}`} label="Passport number" value={p.passportNumber ?? ""} onChange={(v) => update(i, { passportNumber: v.toUpperCase() })} error={errors[`${i}.passport`]} />
                    <Field id={`pe-${i}`} label="Passport expiry" type="date" value={p.passportExpiry ?? ""} onChange={(v) => update(i, { passportExpiry: v })} hint="Must be valid 6 months beyond travel" />
                  </>
                ) : null}
              </div>
            </section>
          ))}

          {people.length < 9 ? (
            <Button variant="outline" className="gap-1.5" onClick={() => setPeople((p) => [...p, { ...BLANK, id: `new_${p.length}` }])}>
              <Plus className="size-4" aria-hidden /> Add another traveller
            </Button>
          ) : null}

          {/* Corporate overlay */}
        </div>

        <aside>
          <div className="sticky top-20 space-y-3">
            <PriceBreakdown data={breakdown} title="Trip total" />
            <Button className="w-full gap-2" size="lg" onClick={submit}>
              Continue to extras <ArrowRight className="size-4" aria-hidden />
            </Button>
          </div>
        </aside>
      </div>
    </Shell>
  );
}

function Field({ id, label, value, onChange, error, hint, type = "text", autoComplete, inputMode }: { id: string; label: string; value: string; onChange: (v: string) => void; error?: string; hint?: string; type?: string; autoComplete?: string; inputMode?: "tel" | "text" | "email" }) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        data-invalid={error ? "true" : undefined}
        aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
        autoComplete={autoComplete}
        inputMode={inputMode}
        className={cn("mt-1", error && "border-destructive")}
      />
      {error ? <p id={`${id}-err`} role="alert" className="mt-1 text-xs text-destructive">{error}</p> : hint ? <p id={`${id}-hint`} className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-[1200px] px-4 py-6"><CheckoutSteps />{children}</div>;
}
