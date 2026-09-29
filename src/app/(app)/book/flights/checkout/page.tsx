"use client";

import * as React from "react";
import { Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, BedDouble, Clock3, MessageCircle, PlaneTakeoff, Ticket, Wallet } from "lucide-react";

import type { Currency, FlightDetails, ID } from "@/domain/types";
import { addServiceLine, createBookingFile } from "@/domain/commands";
import { can } from "@/domain/permissions";
import { computePricing } from "@/domain/pricing";
import { convert } from "@/domain/money";
import { findOffer, holdSeats, quoteFare, type FareOption, type FlightOffer } from "@/providers/inventory/flights";
import { isDomestic } from "@/providers/inventory/network";
import { findDestination } from "@/providers/inventory/hotels";
import { cityOf } from "@/store/seed/reference";
import { useApp, useMe } from "@/store";
import { useModals } from "@/store/modals";
import { fmtDateTime, fmtWeekday, splitLocal } from "@/lib/dates";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader, Segmented } from "@/components/shared/page";
import { Amount } from "@/components/shared/amount";
import { MoneyInput } from "@/components/shared/money-input";
import { Field } from "@/components/shared/field";
import { AirlineLogo, fmtDuration, useAirlineName } from "@/components/book/bits";
import { Steps } from "@/components/book/steps";
import { BookedHero, ClientCard, PeopleCard, PriceLine, emptyClient, peopleFor, saveParty, splitName, validateClient, validatePeople, type ClientChoice, type Person } from "@/components/book/checkout";
import { flightQs, hotelQs, paxLabel, paxOf } from "@/components/book/query";
import { useBookCtx, useFlightQuery } from "@/components/book/use-book";

export default function FlightCheckoutPage() {
  return (
    <Suspense>
      <FlightCheckout />
    </Suspense>
  );
}

interface Part {
  offer: FlightOffer;
  fare: FareOption;
}

interface Booked {
  fileId: ID;
  number: string;
  clientId: ID;
  lines: { lineId: ID; locator: string; ttl?: string }[];
}

/** A chosen flight, compact: airline, date, times, duration and fare. */
function ChosenFlight({ part, label, changeHref }: { part: Part; label: string; changeHref?: string }) {
  const airline = useAirlineName();
  const { offer, fare } = part;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 py-4 first:pt-0 last:pb-0">
      <AirlineLogo code={offer.carrier} />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-ink-3">
          {label} · {fmtWeekday(offer.departureLocal.slice(0, 10))}
        </p>
        <p className="tnum mt-0.5 text-[17px] font-semibold text-ink">
          {splitLocal(offer.departureLocal).time} {offer.origin}
          <ArrowRight className="mx-1.5 inline size-4 text-ink-3" />
          {splitLocal(offer.arrivalLocal).time} {offer.destination}
          {offer.arrivalDayOffset ? <sup className="ml-0.5 text-xs font-bold text-[var(--st-amber-fg)]">+{offer.arrivalDayOffset}</sup> : null}
        </p>
        <p className="mt-0.5 text-[13px] text-ink-3">
          {airline(offer.carrier)} · {offer.legs.map((l) => `${l.carrier} ${l.flightNumber}`).join(", ")} · {fmtDuration(offer.durationMin)} · {offer.stops ? `${offer.stops} stop in ${offer.via.map(cityOf).join(", ")}` : "Nonstop"}
        </p>
        <p className="mt-0.5 text-[13px] text-ink-3">
          {fare.name} · {fare.baggageLabel}
        </p>
      </div>
      {changeHref && (
        <Link href={changeHref} className="text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300">
          Change
        </Link>
      )}
    </div>
  );
}

function FlightCheckout() {
  const router = useRouter();
  const sp = useSearchParams();
  const me = useMe();
  const db = useApp((s) => s.db)!;
  const dispatch = useApp((s) => s.dispatch);
  const openPayment = useModals((s) => s.openPayment);
  const openMessage = useModals((s) => s.openMessage);
  const { q } = useFlightQuery();
  const { today, fx } = useBookCtx();
  const ctx = React.useMemo(() => ({ today, fx }), [today, fx]);

  const outId = sp.get("out");
  const retId = sp.get("ret");
  const outFareId = sp.get("outFare");
  const retFareId = sp.get("retFare");
  const base = { adults: q.adults, children: q.children, infants: q.infants, cabin: q.cabin };
  // Resolve the chosen offers once; prices stay as quoted while the page is open.
  const [parts] = React.useState<Part[] | null>(() => {
    const out = outId ? findOffer({ ...base, from: q.from, to: q.to, date: q.depart }, outId, ctx) : undefined;
    const outFare = out?.fares.find((f) => f.id === outFareId && f.seatsLeft > 0);
    if (!out || !outFare) return null;
    const list: Part[] = [{ offer: out, fare: outFare }];
    if (retId && q.ret) {
      const ret = findOffer({ ...base, from: q.to, to: q.from, date: q.ret }, retId, ctx);
      const retFare = ret?.fares.find((f) => f.id === retFareId && f.seatsLeft > 0);
      if (!ret || !retFare) return null;
      list.push({ offer: ret, fare: retFare });
    }
    return list;
  });

  const [client, setClient] = React.useState<ClientChoice>(() => (q.client && db.clients[q.client] ? { ...emptyClient(), clientId: q.client } : emptyClient()));
  const [people, setPeople] = React.useState<Person[]>(() => peopleFor(q));
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const [booked, setBooked] = React.useState<Booked | null>(null);
  const [adjust, setAdjust] = React.useState(false);

  const international = !isDomestic(q.from, q.to);
  const lineCurrency: Currency = parts?.[0].offer.currency ?? "USD";
  const existing = client.mode === "existing" && client.clientId ? db.clients[client.clientId] : undefined;
  const [invoiceCur, setInvoiceCur] = React.useState<Currency | null>(null);
  const fileCurrency: Currency = invoiceCur ?? existing?.defaultCurrency ?? lineCurrency;
  const defFee = db.settings.defaultServiceFee.flight;
  const [markupMinor, setMarkupMinor] = React.useState<number | null>(0);
  const [feeMinor, setFeeMinor] = React.useState<number | null>(defFee ? convert(defFee, lineCurrency, fx).amountMinor : 0);

  if (!can(me, "booking.create")) {
    return (
      <Card className="block">
        <EmptyState icon={PlaneTakeoff} title="Only agents and managers can make bookings" body="Ask an agent to book this flight for the client." />
      </Card>
    );
  }

  if (!parts) {
    return (
      <>
        <PageHeader
          crumbs={[{ label: "Search and book", href: "/book" }, { label: `${cityOf(q.from)} to ${cityOf(q.to)}`, href: `/book/flights?${flightQs(q)}` }, { label: "Not available" }]}
          title="This flight is no longer available"
        />
        <Card className="block">
          <EmptyState
            icon={PlaneTakeoff}
            title="The seats or the fare have changed"
            body="Search again to see what's available now."
            action={
              <Button asChild>
                <Link href={`/book/flights?${flightQs(q)}`}>Search again</Link>
              </Button>
            }
          />
        </Card>
      </>
    );
  }

  const pax = paxOf(q);
  const quotes = parts.map((p) => quoteFare(p.offer, p.fare, pax));
  const sameCarrier = parts.length === 2 && parts[0].offer.carrier === parts[1].offer.carrier;
  const m = (n: number | null) => ({ amountMinor: n ?? 0, currency: lineCurrency });
  // One agency fee for the trip: on the first line only.
  const pricings = (sameCarrier ? [{ total: quotes[0].total.amountMinor + quotes[1].total.amountMinor }] : quotes.map((x) => ({ total: x.total.amountMinor }))).map((x, i) =>
    computePricing({ currency: lineCurrency, markup: m(i === 0 ? markupMinor : 0), serviceFee: m(i === 0 ? feeMinor : 0), fare: { totalFare: { amountMinor: x.total, currency: lineCurrency }, commissionPct: 0 } }, db.settings, "flight"),
  );
  const sum = (pick: (p: (typeof pricings)[number]) => number) => pricings.reduce((s, p) => s + pick(p), 0);
  const sell = { amountMinor: sum((p) => p.sell.amountMinor), currency: lineCurrency };
  const sellInFile = convert(sell, fileCurrency, fx);
  const party = pax.adults + pax.children + pax.infants;

  const back = parts.length === 2 ? `/book/flights?${flightQs(q, { leg: "return", out: outId, outFare: outFareId })}` : `/book/flights?${flightQs(q)}`;
  const route = `${cityOf(q.from)} to ${cityOf(q.to)}`;

  const book = () => {
    const e = { ...validateClient(client), ...validatePeople(people, { passports: international }) };
    setErrors(e);
    if (Object.keys(e).length) {
      toast.error("A few details are missing. They're marked in red.");
      const first = document.querySelector("[aria-invalid=true]") as HTMLElement | null;
      first?.focus();
      return;
    }
    setBusy(true);
    const getDb = () => useApp.getState().db;
    const party = saveParty(dispatch, getDb, client, people, fileCurrency);
    if (!party) {
      setBusy(false);
      return;
    }
    const lead = people[0];
    const title = `${cityOf(q.from)} → ${cityOf(q.to)}${q.ret ? " return" : ""} · ${(lead.travellerId ? getDb()!.travellers[lead.travellerId]?.surname : lead.surname.trim().toUpperCase()) ?? ""}`.trim();
    const f = dispatch(createBookingFile, { clientId: party.clientId, title, currency: fileCurrency, source: client.source, travellerIds: party.travellerIds, reference: client.reference, costCentre: client.costCentre }, { toast: false });
    if (!f.ok) {
      setBusy(false);
      return;
    }
    const { fileId, number } = f.result as { fileId: ID; number: string };
    const passengers = party.travellerIds.map((id) => {
      const t = getDb()!.travellers[id];
      return { travellerId: id, title: t.title, givenName: t.givenName, surname: t.surname, paxType: t.paxType };
    });
    const groups: Part[][] = sameCarrier || parts.length === 1 ? [parts] : parts.map((p) => [p]);
    const lines: Booked["lines"] = [];
    groups.forEach((g, i) => {
      const details: FlightDetails = holdSeats({ parts: g, passengers, now: new Date(), officeId: db.settings.integrations.amadeus.officeId });
      const r = dispatch(
        addServiceLine,
        {
          fileId,
          type: "flight",
          travellerIds: party.travellerIds,
          details,
          pricing: { currency: lineCurrency, markup: m(i === 0 ? markupMinor : 0), serviceFee: m(i === 0 ? feeMinor : 0) },
          status: "booked",
          source: "amadeus",
          external: { provider: "amadeus", officeId: details.officeId, recordLocator: details.recordLocator, externalIds: { offers: g.map((p) => p.offer.id).join(",") }, lastSyncedAt: new Date().toISOString(), syncStatus: "ok" },
        },
        { toast: false },
      );
      if (r.ok) lines.push({ lineId: (r.result as { lineId: ID }).lineId, locator: details.recordLocator, ttl: details.ticketingTimeLimit });
    });
    setBusy(false);
    if (!lines.length) {
      toast.error(`${number} was created but the flight could not be added. Open the booking to add it.`);
      router.push(`/bookings/${fileId}`);
      return;
    }
    setBooked({ fileId, number, clientId: party.clientId, lines });
    window.scrollTo({ top: 0 });
  };

  if (booked) {
    const cl = db.clients[booked.clientId];
    const ttl = booked.lines.map((l) => l.ttl).filter(Boolean).sort()[0];
    const dest = findDestination(q.to);
    return (
      <div className="mx-auto max-w-3xl">
        <BookedHero title="Booked. The seats are held.">
          Booking <span className="font-semibold text-ink">{booked.number}</span> for {cl?.name}. PNR{" "}
          {booked.lines.map((l, i) => (
            <React.Fragment key={l.lineId}>
              {i > 0 && " and "}
              <span className="font-mono font-semibold whitespace-nowrap text-ink">{l.locator}</span>
            </React.Fragment>
          ))}
          .
        </BookedHero>
        {ttl && (
          <p className="mx-auto mt-4 flex max-w-xl items-start gap-3 rounded-xl border border-[var(--st-amber-bd)] bg-[var(--st-amber-bg)] px-4 py-3 text-sm text-[var(--st-amber-fg)]">
            <Clock3 className="mt-0.5 size-4 shrink-0" />
            <span>
              Held until <span className="font-semibold">{fmtDateTime(ttl)}</span>. Take payment and issue the ticket before then, or the airline releases the seats.
            </span>
          </p>
        )}
        <Card className="mt-6 block p-5">
          {parts.map((p, i) => (
            <ChosenFlight key={p.offer.id} part={p} label={parts.length > 1 ? (i === 0 ? "Departure" : "Return") : "Flight"} />
          ))}
          <div className="mt-4 flex items-baseline justify-between border-t border-rule pt-4">
            <span className="text-sm text-ink-3">Total to collect</span>
            <Amount value={sellInFile} className="text-xl font-bold text-ink" codeClassName="text-[0.62em] font-semibold" />
          </div>
        </Card>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {can(me, "payment.record") && (
            <Button size="lg" className="h-12" onClick={() => openPayment({ fileId: booked.fileId, clientId: booked.clientId })}>
              <Wallet /> Record payment
            </Button>
          )}
          <Button size="lg" variant="outline" className="h-12" asChild>
            <Link href={`/bookings/${booked.fileId}?action=issue&line=${booked.lines[0].lineId}`}>
              <Ticket /> Issue the ticket
            </Link>
          </Button>
          <Button size="lg" variant="outline" className="h-12" asChild>
            <Link href={`/bookings/${booked.fileId}`}>
              Open the booking <ArrowRight />
            </Link>
          </Button>
          <Button size="lg" variant="outline" className="h-12" onClick={() => openMessage({ clientId: booked.clientId, fileId: booked.fileId, channel: "whatsapp", template: "booking_confirmation" })}>
            <MessageCircle /> Send on WhatsApp
          </Button>
        </div>
        {dest && (
          <Link
            href={`/book/hotels?${hotelQs({ dest: dest.code, checkIn: parts[0].offer.arrivalLocal.slice(0, 10), checkOut: q.ret ?? parts[0].offer.arrivalLocal.slice(0, 10), adults: Math.max(1, q.adults), children: q.children, rooms: 1 })}`}
            className="mt-6 flex items-center gap-4 rounded-xl border border-rule bg-card p-4 shadow-card transition-colors hover:border-brand-300"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-band text-brand-700 dark:text-brand-200">
              <BedDouble className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-ink">Need a hotel in {dest.name}?</span>
              <span className="block text-[13px] text-ink-3">Search partner hotels for these dates and add them to the same client.</span>
            </span>
            <ArrowRight className="size-4 text-ink-3" />
          </Link>
        )}
      </div>
    );
  }

  const summary = (
    <Card className="block p-5">
      <h2 className="text-[17px] font-semibold text-ink">Price</h2>
      <dl className="mt-3">
        {parts.map((p, i) => (
          <PriceLine key={p.offer.id} label={`${parts.length > 1 ? (i === 0 ? "Departure" : "Return") : "Airfare"} · ${paxLabel(q)}`} value={<Amount value={quotes[i].total} />} />
        ))}
        <PriceLine muted label="of which taxes" value={<Amount value={{ amountMinor: quotes.reduce((s, x) => s + x.taxes.reduce((a, t) => a + t.amount.amountMinor, 0), 0), currency: lineCurrency }} />} />
        <PriceLine label="Agency service fee" value={<Amount value={{ amountMinor: sum((p) => p.serviceFee.amountMinor), currency: lineCurrency }} />} />
        {sum((p) => p.markup.amountMinor) !== 0 && <PriceLine label="Markup" value={<Amount value={{ amountMinor: sum((p) => p.markup.amountMinor), currency: lineCurrency }} />} />}
        <PriceLine label={`VAT ${Math.round(db.settings.vatRate * 100)}% on the fee`} value={<Amount value={{ amountMinor: sum((p) => p.vat.amountMinor), currency: lineCurrency }} />} />
        <div className="mt-2 border-t border-rule pt-2">
          <PriceLine strong label="Total" value={<Amount value={sell} className="text-lg" />} />
          {fileCurrency !== lineCurrency && (
            <PriceLine muted label={`Invoiced in ${fileCurrency} at 1 USD = TZS ${fx.toLocaleString("en-US")}`} value={<Amount value={sellInFile} />} />
          )}
        </div>
      </dl>
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-[13px] font-medium text-ink-3">Invoice in</span>
        <Segmented
          label="Invoice currency"
          value={fileCurrency}
          onChange={setInvoiceCur}
          options={[
            { value: "TZS", label: "TZS" },
            { value: "USD", label: "USD" },
          ]}
        />
      </div>
      <button type="button" onClick={() => setAdjust((a) => !a)} className="mt-3 text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300" aria-expanded={adjust}>
        {adjust ? "Hide price adjustments" : "Adjust fee or markup"}
      </button>
      {adjust && (
        <div className="mt-3 grid gap-3">
          <Field label="Service fee" htmlFor="bk-fee">
            <MoneyInput id="bk-fee" currency={lineCurrency} value={feeMinor} onChange={setFeeMinor} />
          </Field>
          <Field label="Markup" htmlFor="bk-markup" hint="Added to the fare; not shown separately on the invoice.">
            <MoneyInput id="bk-markup" currency={lineCurrency} value={markupMinor} onChange={setMarkupMinor} />
          </Field>
        </div>
      )}
      <Button size="lg" className="mt-5 h-12 w-full rounded-xl text-[15px]" onClick={book} loading={busy}>
        Book now · <Amount value={sellInFile} className="font-bold text-current" codeClassName="text-current opacity-80" />
      </Button>
      <p className="mt-3 text-center text-[13px] text-ink-3">Seats are held now. You take payment and issue the ticket next.</p>
    </Card>
  );

  return (
    <>
      <PageHeader
        crumbs={[
          { label: "Search and book", href: "/book" },
          { label: route, href: `/book/flights?${flightQs(q)}` },
          ...(parts.length > 1 ? [{ label: `Return: ${cityOf(q.to)} to ${cityOf(q.from)}`, href: back }] : []),
          { label: "Review and book" },
        ]}
        title="Review and book" meta={<span>{`${route} · ${fmtWeekday(q.depart)}${q.ret ? ` – ${fmtWeekday(q.ret)}` : ""} · ${paxLabel(q)}`}</span>} />
      <Steps className="mb-6" steps={q.ret ? ["Departure flight", "Return flight", "Travellers and booking"] : ["Choose a flight", "Travellers and booking"]} current={q.ret ? 3 : 2} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>{parts.length > 1 ? "Your flights" : "Your flight"}</h2>
              </CardTitle>
            </CardHeader>
            <CardContent className="divide-y divide-rule">
              {parts.map((p, i) => (
                <ChosenFlight key={p.offer.id} part={p} label={parts.length > 1 ? (i === 0 ? "Departure" : "Return") : "Flight"} changeHref={i === 0 ? `/book/flights?${flightQs(q)}` : back} />
              ))}
            </CardContent>
          </Card>

          <ClientCard value={client} onChange={setClient} errors={errors} />

          <PeopleCard
            people={people}
            onChange={setPeople}
            clientId={client.mode === "existing" ? client.clientId : undefined}
            passports={international}
            errors={errors}
            onUseClient={client.mode === "new" && client.name.trim() ? () => setPeople((ps) => ps.map((p, i) => (i === 0 ? { ...p, ...splitName(client.name) } : p))) : undefined}
          />
          <div className={cn("lg:hidden")}>{summary}</div>
        </div>
        <aside className="hidden lg:block">
          <div className="sticky top-20">{summary}</div>
        </aside>
      </div>
      <p className="sr-only" aria-live="polite">
        {party} travellers
      </p>
    </>
  );
}
