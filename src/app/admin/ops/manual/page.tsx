"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, ClipboardList, PhoneCall, Search, Users } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/chrome/console-shell";
import { MoneyText } from "@/components/shared/money-text";
import { PriceBreakdown } from "@/components/shared/price-breakdown";
import { Pill } from "@/components/shared/status-chip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/hooks/use-session";
import { useStore } from "@/lib/store";
import { bookingOps, RAIL_LABELS } from "@/lib/api";
import { computePrice, nightsBetween } from "@/lib/domain/pricing";
import { addDays, today } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ConsoleLoading, Detail, GatedAction, Panel } from "@/features/admin/ops-ui";
import { VERTICAL_LABELS } from "@/features/admin/ops-utils";
import type { PaymentRail, SavedTraveller, Vertical } from "@/lib/domain/types";

/** Rails a walk-in or telephone sale can actually be settled on. Credit and invoice need an organisation. */
const RAILS: PaymentRail[] = ["mpesa", "tigopesa", "airtel", "halopesa", "card", "bank"];
const VERTICALS: Vertical[] = ["stay", "tour", "transfer", "flight"];
const TITLES: Array<SavedTraveller["title"]> = ["Mr", "Mrs", "Ms", "Dr"];

/** O04 · Manual booking. For the phone desk and the walk-in counter. */
export default function ManualBookingPage() {
  const data = useStore((s) => s);
  const session = useSession();
  const router = useRouter();

  const [vertical, setVertical] = useState<Vertical>("stay");
  const [q, setQ] = useState("");
  const [productId, setProductId] = useState("");
  const [ratePlanId, setRatePlanId] = useState("");
  const [dateFrom, setDateFrom] = useState(() => addDays(today(), 7));
  const [dateTo, setDateTo] = useState(() => addDays(today(), 9));
  const [quantity, setQuantity] = useState(1);
  const [adults, setAdults] = useState(2);
  const [children, setChildren] = useState(0);
  const [infants, setInfants] = useState(0);
  const [title, setTitle] = useState<SavedTraveller["title"]>("Mr");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [nationality, setNationality] = useState("TZ");
  const [dateOfBirth, setDateOfBirth] = useState("1990-01-01");
  const [rail, setRail] = useState<PaymentRail>("mpesa");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return Object.values(data.products)
      .filter((p) => p.status === "live" && p.vertical === vertical)
      .filter((p) => !needle || `${p.title} ${p.location.city} ${p.location.region} ${p.tags.join(" ")}`.toLowerCase().includes(needle))
      .sort((a, b) => a.title.localeCompare(b.title))
      .slice(0, 8);
  }, [data.products, vertical, q]);

  const product = productId ? data.products[productId] : undefined;
  const plans = useMemo(
    () => (product ? Object.values(data.ratePlans).filter((r) => r.productId === product.id).sort((a, b) => a.baseMinor - b.baseMinor) : []),
    [data.ratePlans, product],
  );
  const ratePlan = ratePlanId ? data.ratePlans[ratePlanId] : undefined;

  const preview = useMemo(() => {
    if (!product || !ratePlan) return undefined;
    const nights = product.vertical === "stay" ? nightsBetween(dateFrom, dateTo) : 1;
    return computePrice({ vertical: product.vertical, ratePlan, nights, quantity, pax: { adults, children, infants } });
  }, [product, ratePlan, dateFrom, dateTo, quantity, adults, children, infants]);

  if (!session.hydrated) return <ConsoleLoading />;

  const ready = Boolean(product && ratePlan && firstName.trim() && lastName.trim() && phone.trim() && email.trim() && dateFrom && dateTo);
  const missing = !product
    ? "Pick a product first."
    : !ratePlan
      ? "Pick a rate plan."
      : !firstName.trim() || !lastName.trim()
        ? "The lead traveller needs a first and last name."
        : !phone.trim()
          ? "A phone number is required — this is how the desk reaches the guest."
          : !email.trim()
            ? "An email is required for the voucher."
            : undefined;

  const create = () => {
    if (!product || !ratePlan) return;
    setBusy(true);
    try {
      const lead: SavedTraveller = {
        id: `st_manual_${Date.now().toString(36)}`,
        title, firstName: firstName.trim(), lastName: lastName.trim(),
        dateOfBirth, nationality, phone: phone.trim(), email: email.trim(),
      };
      const bookingId = bookingOps.createManual({
        lead,
        productId: product.id,
        ratePlanId: ratePlan.id,
        dateFrom,
        dateTo: product.vertical === "stay" ? dateTo : dateFrom,
        quantity,
        pax: { adults, children, infants },
        rail,
        note: note.trim() || `Manual booking taken by ${session.user?.name ?? "operations"}.`,
      });
      const reference = useStore.getState().bookings[bookingId]?.reference ?? bookingId;
      toast.success(`Booking ${reference} created`, { description: `Paid by ${RAIL_LABELS[rail]} · awaiting supplier confirmation.` });
      router.push(`/admin/ops/bookings/${bookingId}`);
    } catch (err) {
      setBusy(false);
      toast.error("Could not create the booking", { description: err instanceof Error ? err.message : "Unknown error" });
    }
  };

  return (
    <>
      <PageHeader
        title="Manual booking"
        code="O04"
        description="Take a booking on behalf of a customer who called or walked in. It creates a real booking, takes the payment offline and enters the same supplier confirmation flow as the website."
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Panel title="1 · Find the product" icon={Search}>
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-40">
                <Label htmlFor="mb-vertical">Vertical</Label>
                <Select value={vertical} onValueChange={(v) => { setVertical(v as Vertical); setProductId(""); setRatePlanId(""); }}>
                  <SelectTrigger id="mb-vertical" className="mt-1 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {VERTICALS.map((v) => <SelectItem key={v} value={v}>{VERTICAL_LABELS[v]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="min-w-[220px] flex-1">
                <Label htmlFor="mb-search">Search live products</Label>
                <Input id="mb-search" className="mt-1" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Serena, Zanzibar, balloon…" />
              </div>
            </div>

            <ul className="mt-3 space-y-1.5">
              {matches.map((p) => {
                const active = p.id === productId;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => { setProductId(p.id); setRatePlanId(""); }}
                      aria-pressed={active}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
                        active ? "border-brand-300 bg-brand-50" : "hover:bg-muted",
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{p.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">{p.location.city}, {p.location.region} · {data.organisations[p.supplierId]?.name}</span>
                      </span>
                      <MoneyText minor={p.priceFromMinor} size="sm" showCurrency={false} />
                    </button>
                  </li>
                );
              })}
              {!matches.length ? <li className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">No live {VERTICAL_LABELS[vertical].toLowerCase()} products match that search.</li> : null}
            </ul>
          </Panel>

          <Panel title="2 · Rate plan, dates and party" icon={CalendarDays}>
            {!product ? (
              <p className="text-sm text-muted-foreground">Choose a product above to see its rate plans.</p>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="mb-plan">Rate plan</Label>
                  <Select value={ratePlanId} onValueChange={setRatePlanId}>
                    <SelectTrigger id="mb-plan" className="w-full"><SelectValue placeholder="Pick a rate plan" /></SelectTrigger>
                    <SelectContent>
                      {plans.map((rp) => (
                        <SelectItem key={rp.id} value={rp.id}>
                          {rp.name} · {rp.baseMinor.toLocaleString("en-TZ")} TZS {rp.refundable ? "· refundable" : "· non refundable"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <Label htmlFor="mb-from">{product.vertical === "stay" ? "Check in" : "Travel date"}</Label>
                    <Input id="mb-from" type="date" className="mt-1" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                  </div>
                  {product.vertical === "stay" ? (
                    <div>
                      <Label htmlFor="mb-to">Check out</Label>
                      <Input id="mb-to" type="date" className="mt-1" value={dateTo} min={dateFrom} onChange={(e) => setDateTo(e.target.value)} />
                    </div>
                  ) : null}
                  <div>
                    <Label htmlFor="mb-qty">{product.vertical === "transfer" ? "Vehicles" : product.vertical === "stay" ? "Rooms" : "Units"}</Label>
                    <Input id="mb-qty" type="number" min={1} max={9} className="mt-1" value={quantity} onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))} />
                  </div>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div>
                    <Label htmlFor="mb-adults">Adults</Label>
                    <Input id="mb-adults" type="number" min={1} max={12} className="mt-1" value={adults} onChange={(e) => setAdults(Math.max(1, Number(e.target.value) || 1))} />
                  </div>
                  <div>
                    <Label htmlFor="mb-children">Children</Label>
                    <Input id="mb-children" type="number" min={0} max={8} className="mt-1" value={children} onChange={(e) => setChildren(Math.max(0, Number(e.target.value) || 0))} />
                  </div>
                  <div>
                    <Label htmlFor="mb-infants">Infants</Label>
                    <Input id="mb-infants" type="number" min={0} max={4} className="mt-1" value={infants} onChange={(e) => setInfants(Math.max(0, Number(e.target.value) || 0))} />
                  </div>
                </div>
              </>
            )}
          </Panel>

          <Panel title="3 · Lead traveller" icon={Users} description="The name on the voucher and the number the desk will ring.">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <Label htmlFor="mb-title">Title</Label>
                <Select value={title} onValueChange={(v) => setTitle(v as SavedTraveller["title"])}>
                  <SelectTrigger id="mb-title" className="mt-1 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{TITLES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="mb-first">First name</Label>
                <Input id="mb-first" className="mt-1" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" />
              </div>
              <div>
                <Label htmlFor="mb-last">Last name</Label>
                <Input id="mb-last" className="mt-1" value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" />
              </div>
              <div>
                <Label htmlFor="mb-phone">Phone</Label>
                <Input id="mb-phone" className="mt-1" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+255…" inputMode="tel" />
              </div>
              <div>
                <Label htmlFor="mb-email">Email</Label>
                <Input id="mb-email" className="mt-1" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="guest@example.com" />
              </div>
              <div>
                <Label htmlFor="mb-nat">Nationality</Label>
                <Input id="mb-nat" className="mt-1" value={nationality} onChange={(e) => setNationality(e.target.value.toUpperCase().slice(0, 2))} maxLength={2} />
              </div>
              <div>
                <Label htmlFor="mb-dob">Date of birth</Label>
                <Input id="mb-dob" className="mt-1" type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
              </div>
            </div>
          </Panel>

          <Panel title="4 · Settlement" icon={PhoneCall} description="How the money was taken at the counter. Credit and invoice rails are only available to partner organisations.">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="mb-rail">Payment rail</Label>
                <Select value={rail} onValueChange={(v) => setRail(v as PaymentRail)}>
                  <SelectTrigger id="mb-rail" className="mt-1 w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{RAILS.map((r) => <SelectItem key={r} value={r}>{RAIL_LABELS[r]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="mb-note">Internal note</Label>
                <Textarea id="mb-note" className="mt-1" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Walk-in at the Arusha desk, paid cash, receipt 00214." />
              </div>
            </div>
          </Panel>
        </div>

        {/* Summary rail */}
        <div className="space-y-4">
          <Panel title="Summary" icon={ClipboardList}>
            {product && ratePlan ? (
              <dl className="space-y-3">
                <Detail label="Product">{product.title}</Detail>
                <Detail label="Supplier">{data.organisations[product.supplierId]?.name}</Detail>
                <Detail label="Rate plan">{ratePlan.name}</Detail>
                <Detail label="Dates">{product.vertical === "stay" ? `${dateFrom} → ${dateTo}` : dateFrom}</Detail>
                <Detail label="Party">{adults + children + infants} traveller{adults + children + infants === 1 ? "" : "s"} · qty {quantity}</Detail>
                <Detail label="Settlement"><Pill tone="info">{RAIL_LABELS[rail]}</Pill></Detail>
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">Pick a product and a rate plan to price the booking.</p>
            )}
          </Panel>

          {preview ? <PriceBreakdown data={preview} dense title="Indicative price" /> : null}

          <div className="rounded-xl border bg-card p-4">
            <GatedAction
              permission="BOOKING:create_manual"
              variant="default"
              size="default"
              className="w-full"
              blockedReason={busy ? "Creating…" : ready ? undefined : missing}
              onClick={create}
            >
              Create booking and take payment
            </GatedAction>
            <p className="mt-2 text-xs text-muted-foreground">
              The booking is created, the payment is recorded as settled offline and the item goes to the supplier for confirmation. You land on the booking detail screen.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
