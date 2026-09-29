"use client";

import * as React from "react";
import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, BedDouble, Clock3, MessageCircle, Plane, Wallet } from "lucide-react";

import type { Currency, ID } from "@/domain/types";
import { addServiceLine, createBookingFile } from "@/domain/commands";
import { can } from "@/domain/permissions";
import { computePricing } from "@/domain/pricing";
import { convert } from "@/domain/money";
import { BED_BANK_SUPPLIER, BOARD_LABEL, bookRoom, findDestination, findHotel, findRate } from "@/providers/inventory/hotels";
import { useApp, useMe } from "@/store";
import { useModals } from "@/store/modals";
import { fmtDateTime, fmtDay, fmtWeekday } from "@/lib/dates";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader, Segmented } from "@/components/shared/page";
import { Amount } from "@/components/shared/amount";
import { MoneyInput } from "@/components/shared/money-input";
import { Field } from "@/components/shared/field";
import { Stars } from "@/components/book/bits";
import { Steps } from "@/components/book/steps";
import { BookedHero, ClientCard, PeopleCard, PriceLine, emptyClient, peopleFor, saveParty, splitName, validateClient, validatePeople, type ClientChoice, type Person } from "@/components/book/checkout";
import { flightQs, guestsLabel, hotelQs, nightsBetween } from "@/components/book/query";
import { useBookCtx, useHotelQuery } from "@/components/book/use-book";

export default function HotelCheckoutPage() {
  return (
    <Suspense>
      <HotelCheckout />
    </Suspense>
  );
}

interface Booked {
  fileId: ID;
  number: string;
  clientId: ID;
  confirmation: string;
  freeCancelUntil?: string;
}

function HotelCheckout() {
  const sp = useSearchParams();
  const me = useMe();
  const db = useApp((s) => s.db)!;
  const dispatch = useApp((s) => s.dispatch);
  const openPayment = useModals((s) => s.openPayment);
  const openMessage = useModals((s) => s.openMessage);
  const { q } = useHotelQuery();
  const { today, fx } = useBookCtx();

  const hotel = findHotel(sp.get("hotel"));
  const search = { destination: hotel?.destination ?? q.dest, checkIn: q.checkIn, checkOut: q.checkOut, adults: q.adults, children: q.children, rooms: q.rooms };
  const [rate] = React.useState(() => (hotel ? findRate(hotel, search, today, sp.get("rate") ?? "") : undefined));
  const nights = nightsBetween(q.checkIn, q.checkOut);

  const [client, setClient] = React.useState<ClientChoice>(() => (q.client && db.clients[q.client] ? { ...emptyClient(), clientId: q.client } : emptyClient()));
  const [people, setPeople] = React.useState<Person[]>(() => peopleFor({ adults: 1, children: 0, infants: 0 }));
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const [booked, setBooked] = React.useState<Booked | null>(null);
  const [adjust, setAdjust] = React.useState(false);
  const existing = client.mode === "existing" && client.clientId ? db.clients[client.clientId] : undefined;
  const [invoiceCur, setInvoiceCur] = React.useState<Currency | null>(null);
  const fileCurrency: Currency = invoiceCur ?? existing?.defaultCurrency ?? "USD";
  const defFee = db.settings.defaultServiceFee.hotel;
  const [markupMinor, setMarkupMinor] = React.useState<number | null>(0);
  const [feeMinor, setFeeMinor] = React.useState<number | null>(defFee ? convert(defFee, "USD", fx).amountMinor : 0);

  if (!can(me, "booking.create")) {
    return (
      <Card className="block">
        <EmptyState icon={BedDouble} title="Only agents and managers can make bookings" body="Ask an agent to book this hotel for the client." />
      </Card>
    );
  }
  const backHref = hotel ? `/book/hotels/${hotel.id}?${hotelQs({ ...q, dest: hotel.destination })}` : "/book?tab=hotels";
  if (!hotel || !rate || rate.left < q.rooms) {
    return (
      <>
        <PageHeader crumbs={[{ label: "Search and book", href: "/book?tab=hotels" }, { label: hotel?.name ?? "Hotel", href: backHref }, { label: "Not available" }]} title="This room is no longer available" />
        <Card className="block">
          <EmptyState icon={BedDouble} title="The room or the price has changed" body="Choose another room or other dates." action={<Button asChild><Link href={backHref}>See rooms</Link></Button>} />
        </Card>
      </>
    );
  }

  const supplier = Object.values(db.suppliers).find((s) => s.active && s.kind === "hotel" && s.name === (hotel.supplierName ?? BED_BANK_SUPPLIER));
  const m = (n: number | null) => ({ amountMinor: n ?? 0, currency: "USD" as Currency });
  const cost = { amountMinor: rate.total, currency: "USD" as Currency };
  const pricing = computePricing({ currency: "USD", cost, markup: m(markupMinor), serviceFee: m(feeMinor) }, db.settings, "hotel");
  const sellInFile = convert(pricing.sell, fileCurrency, fx);
  const dest = findDestination(hotel.destination);

  const book = () => {
    const e = { ...validateClient(client), ...validatePeople(people, { passports: false }) };
    setErrors(e);
    if (Object.keys(e).length) {
      toast.error("A few details are missing. They're marked in red.");
      (document.querySelector("[aria-invalid=true]") as HTMLElement | null)?.focus();
      return;
    }
    if (!supplier) {
      toast.error(`${hotel.supplierName ?? BED_BANK_SUPPLIER} is not set up as an active hotel supplier. Ask a manager to add it in Settings → Suppliers.`);
      return;
    }
    setBusy(true);
    const getDb = () => useApp.getState().db;
    const party = saveParty(dispatch, getDb, client, people, fileCurrency);
    if (!party) {
      setBusy(false);
      return;
    }
    const lead = party.travellerIds[0] ? getDb()!.travellers[party.travellerIds[0]] : undefined;
    const f = dispatch(createBookingFile, { clientId: party.clientId, title: `${hotel.name} · ${lead?.surname ?? ""}`.trim(), currency: fileCurrency, source: client.source, travellerIds: party.travellerIds, reference: client.reference, costCentre: client.costCentre }, { toast: false });
    if (!f.ok) {
      setBusy(false);
      return;
    }
    const { fileId, number } = f.result as { fileId: ID; number: string };
    const { details } = bookRoom({ hotel, search, rate });
    const r = dispatch(
      addServiceLine,
      { fileId, type: "hotel", supplierId: supplier.id, travellerIds: party.travellerIds, details, pricing: { currency: "USD", cost, markup: m(markupMinor), serviceFee: m(feeMinor) }, status: "booked", source: "manual" },
      { toast: false },
    );
    setBusy(false);
    if (!r.ok) {
      toast.error(`${number} was created but the room could not be added. Open the booking to add it.`);
      return;
    }
    setBooked({ fileId, number, clientId: party.clientId, confirmation: details.confirmationNumber ?? "", freeCancelUntil: details.freeCancelUntil });
    window.scrollTo({ top: 0 });
  };

  const stay = (
    <div className="flex flex-wrap gap-4">
      <span className="relative block h-24 w-32 shrink-0 overflow-hidden rounded-xl bg-canvas-2">
        <Image src={hotel.images[0]} alt="" fill sizes="128px" className="object-cover" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[17px] font-semibold text-ink">{hotel.name}</p>
        <p className="mt-0.5 flex items-center gap-2 text-[13px] text-ink-3">
          <Stars n={hotel.stars} /> {hotel.area}, {dest?.name}
        </p>
        <p className="mt-2 text-sm text-ink-2">
          {q.rooms > 1 ? `${q.rooms} × ` : ""}
          {rate.room.name} · {BOARD_LABEL[rate.board]}
        </p>
        <p className="text-sm text-ink-2">
          {fmtWeekday(q.checkIn)} – {fmtWeekday(q.checkOut)} · {nights} night{nights === 1 ? "" : "s"} · {guestsLabel(q)}
        </p>
        <p className={rate.refundable ? "mt-1 text-[13px] font-semibold text-[var(--st-green-fg)]" : "mt-1 text-[13px] text-ink-3"}>{rate.refundable ? `Free cancellation until ${fmtDay(rate.freeCancelUntil)}` : "Non-refundable"}</p>
      </div>
    </div>
  );

  if (booked) {
    const cl = db.clients[booked.clientId];
    return (
      <div className="mx-auto max-w-3xl">
        <BookedHero title="Booked. The room is confirmed.">
          Booking <span className="font-semibold text-ink">{booked.number}</span> for {cl?.name}. Hotel confirmation <span className="font-mono font-semibold whitespace-nowrap text-ink">{booked.confirmation}</span>.
        </BookedHero>
        {booked.freeCancelUntil && (
          <p className="mx-auto mt-4 flex max-w-xl items-start gap-3 rounded-xl border border-[var(--st-green-bd)] bg-[var(--st-green-bg)] px-4 py-3 text-sm text-[var(--st-green-fg)]">
            <Clock3 className="mt-0.5 size-4 shrink-0" />
            <span>
              Free cancellation until <span className="font-semibold">{fmtDateTime(booked.freeCancelUntil)}</span>. After that the first night is charged.
            </span>
          </p>
        )}
        <Card className="mt-6 block p-5">
          {stay}
          <div className="mt-4 flex items-baseline justify-between border-t border-rule pt-4">
            <span className="text-sm text-ink-3">Total to collect</span>
            <Amount value={sellInFile} className="text-xl font-bold text-ink" codeClassName="text-[0.62em] font-semibold" />
          </div>
        </Card>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {can(me, "payment.record") && (
            <Button size="lg" className="h-12" onClick={() => openPayment({ fileId: booked.fileId, clientId: booked.clientId })}>
              <Wallet /> Record payment
            </Button>
          )}
          <Button size="lg" variant="outline" className="h-12" asChild>
            <Link href={`/bookings/${booked.fileId}`}>
              Open the booking <ArrowRight />
            </Link>
          </Button>
          <Button size="lg" variant="outline" className="h-12" onClick={() => openMessage({ clientId: booked.clientId, fileId: booked.fileId, channel: "whatsapp", template: "hotel_voucher" })}>
            <MessageCircle /> WhatsApp
          </Button>
        </div>
        {dest && dest.code !== "DAR" && (
          <Link
            href={`/book/flights?${flightQs({ from: "DAR", to: dest.code, depart: q.checkIn, ret: q.checkOut, adults: Math.max(1, q.adults), children: q.children, infants: 0, cabin: "economy" })}`}
            className="mt-6 flex items-center gap-4 rounded-xl border border-rule bg-card p-4 shadow-card transition-colors hover:border-brand-300"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-band text-brand-700 dark:text-brand-200">
              <Plane className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-ink">Need flights to {dest.name}?</span>
              <span className="block text-[13px] text-ink-3">Search flights from Dar es Salaam for the same dates.</span>
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
        <PriceLine label={`Room · ${nights} night${nights === 1 ? "" : "s"}${q.rooms > 1 ? ` × ${q.rooms}` : ""}`} value={<Amount value={pricing.cost} />} />
        <PriceLine label="Agency service fee" value={<Amount value={pricing.serviceFee} />} />
        {pricing.markup.amountMinor !== 0 && <PriceLine label="Markup" value={<Amount value={pricing.markup} />} />}
        <PriceLine label={`VAT ${Math.round(db.settings.vatRate * 100)}% on the fee`} value={<Amount value={pricing.vat} />} />
        <div className="mt-2 border-t border-rule pt-2">
          <PriceLine strong label="Total" value={<Amount value={pricing.sell} className="text-lg" />} />
          {fileCurrency !== "USD" && <PriceLine muted label={`Invoiced in ${fileCurrency} at 1 USD = TZS ${fx.toLocaleString("en-US")}`} value={<Amount value={sellInFile} />} />}
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
            <MoneyInput id="bk-fee" currency="USD" value={feeMinor} onChange={setFeeMinor} />
          </Field>
          <Field label="Markup" htmlFor="bk-markup" hint="Added to the room price; not shown separately on the invoice.">
            <MoneyInput id="bk-markup" currency="USD" value={markupMinor} onChange={setMarkupMinor} />
          </Field>
        </div>
      )}
      <Button size="lg" className="mt-5 h-12 w-full rounded-xl text-[15px]" onClick={book} loading={busy}>
        Book now · <Amount value={sellInFile} className="font-bold text-current" codeClassName="text-current opacity-80" />
      </Button>
      <p className="mt-3 text-center text-[13px] text-ink-3">
        Booked with {hotel.supplierName ? "the hotel directly" : BED_BANK_SUPPLIER}. The confirmation comes back at once.
      </p>
    </Card>
  );

  return (
    <>
      <PageHeader
        crumbs={[
          { label: "Search and book", href: "/book?tab=hotels" },
          { label: `Hotels in ${dest?.name ?? hotel.destination}`, href: `/book/hotels?${hotelQs({ ...q, dest: hotel.destination })}` },
          { label: hotel.name, href: backHref },
          { label: "Review and book" },
        ]}
        title="Review and book" meta={<span>{`${hotel.name} · ${fmtWeekday(q.checkIn)} – ${fmtWeekday(q.checkOut)}`}</span>} />
      <Steps className="mb-6" steps={["Choose a hotel", "Choose a room", "Guests and booking"]} current={3} />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px] xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>
                <h2>Your stay</h2>
              </CardTitle>
              <Link href={backHref} className="text-sm font-semibold text-brand-700 hover:underline dark:text-brand-300">
                Change room
              </Link>
            </CardHeader>
            <CardContent>{stay}</CardContent>
          </Card>
          <ClientCard value={client} onChange={setClient} errors={errors} />
          <PeopleCard
            people={people}
            onChange={setPeople}
            clientId={client.mode === "existing" ? client.clientId : undefined}
            passports={false}
            errors={errors}
            title="Lead guest"
            description="The name on the reservation. The hotel asks for this person at check-in."
            leadLabel="lead guest"
            onUseClient={client.mode === "new" && client.name.trim() ? () => setPeople((ps) => ps.map((p, i) => (i === 0 ? { ...p, ...splitName(client.name) } : p))) : undefined}
          />
          <div className="lg:hidden">{summary}</div>
        </div>
        <aside className="hidden lg:block">
          <div className="sticky top-20">{summary}</div>
        </aside>
      </div>
    </>
  );
}
