"use client";

import type { DbState, FlightLine, ID, ServiceLine } from "@/domain/types";
import { travellerDisplayName } from "@/domain/describe";
import { activeLines } from "@/domain/selectors/core";
import { travelDates } from "@/domain/status/file-status";
import { useApp } from "@/store";
import { airlineName, cityOf, CABIN_LABELS } from "@/store/seed/reference";
import { fmtDate, fmtDateTime, fmtRange, splitLocal } from "@/lib/dates";

import { DocFooter, DocSection, Grid, Letterhead, Party, Td, Th, Tr, companyPhone } from "./doc-parts";
import { OtherServices, STATE_WORD } from "./itinerary-services";
import { Paper, PrintMessage, PrintShell } from "./print-shell";
import { bookingMessage } from "./share";

const PAX = { ADT: "Adult", CHD: "Child", INF: "Infant" } as const;

const isFlight = (l: ServiceLine): l is FlightLine => l.type === "flight";

function ticketsFor(db: DbState, travellerId: ID, flights: FlightLine[]) {
  return flights.flatMap((f) => f.details.passengers.filter((p) => p.travellerId === travellerId && p.ticketNumber).map((p) => p.ticketNumber!));
}

/** The agency's e-ticket summary for a booking (id = file id). */
export function ItineraryDoc({ id }: { id: ID }) {
  const db = useApp((s) => s.db)!;
  const file = db.files[id];
  if (!file) return <PrintMessage title="Booking not found" body="The link may be wrong, or the booking was created on another device." />;

  const client = db.clients[file.clientId];
  const company = db.settings.company;
  const lines = activeLines(db, file.id);
  const flights = lines.filter(isFlight);
  const travellerIds = [...new Set([...file.travellerIds, ...lines.flatMap((l) => l.travellerIds)])];
  const travellers = travellerIds.map((t) => db.travellers[t]).filter(Boolean);
  const dates = travelDates(db, file.id);
  const pnrs = [...new Set(flights.map((f) => f.details.recordLocator).filter(Boolean))];

  return (
    <PrintShell title={`${file.number} itinerary`} backHref={`/bookings/${file.id}`} share={client ? { phone: client.phone, text: bookingMessage(db, file.id) } : null}>
      <Paper>
        <Letterhead
          company={company}
          docTitle="Itinerary"
          number={file.number}
          meta={[
            ...(pnrs.length ? [{ label: pnrs.length > 1 ? "PNRs" : "PNR", value: <span className="font-mono">{pnrs.join(", ")}</span> }] : []),
            { label: "Travel", value: fmtRange(dates.start, dates.end) },
            { label: "Printed", value: fmtDate(new Date()) },
          ]}
        />

        <div className="mt-5">
          <Party label="Prepared for" name={client?.name ?? "—"} lines={[file.title]} />
        </div>

        <DocSection title="Travellers">
          <Grid>
            <thead>
              <tr>
                <Th>Name as in passport</Th>
                <Th>Type</Th>
                <Th>E-ticket number</Th>
                <Th>Passport</Th>
              </tr>
            </thead>
            <tbody>
              {travellers.map((t) => {
                const tickets = ticketsFor(db, t.id, flights);
                return (
                  <Tr key={t.id}>
                    <Td className="font-medium uppercase">{travellerDisplayName(t)}</Td>
                    <Td className="text-ink-2">{PAX[t.paxType]}</Td>
                    <Td className="font-mono">{tickets.length ? tickets.join(", ") : <span className="font-sans text-ink-3">Not ticketed yet</span>}</Td>
                    <Td className="text-ink-2">{t.passportNumber ? <span className="font-mono">{t.passportNumber}</span> : "—"}</Td>
                  </Tr>
                );
              })}
              {!travellers.length && (
                <Tr>
                  <Td colSpan={4} className="text-ink-3">
                    No travellers on this booking yet.
                  </Td>
                </Tr>
              )}
            </tbody>
          </Grid>
        </DocSection>

        {flights.map((f) => (
          <DocSection
            key={f.id}
            title={
              <span className="flex flex-wrap items-baseline gap-x-3">
                <span>Flights · {airlineName(f.details.validatingCarrier, db.settings.airlines)}</span>
                <span className="text-[12px] font-normal text-ink-2">
                  PNR <span className="font-mono font-semibold text-ink">{f.details.recordLocator}</span>
                  {f.details.airlineLocator && (
                    <>
                      {" "}
                      · Airline ref <span className="font-mono font-semibold text-ink">{f.details.airlineLocator}</span>
                    </>
                  )}
                  {" · "}
                  {STATE_WORD[f.status] ?? f.status}
                </span>
              </span>
            }
          >
            <Grid className="text-[12px]">
              <thead>
                <tr>
                  <Th>Flight</Th>
                  <Th>From</Th>
                  <Th right>Departs</Th>
                  <Th>To</Th>
                  <Th right>Arrives</Th>
                  <Th>Class</Th>
                  <Th>Terminal</Th>
                  <Th>Baggage</Th>
                </tr>
              </thead>
              <tbody>
                {[...f.details.segments]
                  .sort((a, b) => a.departureLocal.localeCompare(b.departureLocal))
                  .map((s) => {
                    const dep = splitLocal(s.departureLocal);
                    const arr = splitLocal(s.arrivalLocal);
                    return (
                      <Tr key={`${f.id}-${s.segmentNo}`}>
                        <Td>
                          <span className="block font-mono font-semibold whitespace-nowrap">
                            {s.carrier} {s.flightNumber}
                          </span>
                          <span className="block text-[10.5px] text-ink-3">{s.operatingCarrier && s.operatingCarrier !== s.carrier ? `Operated by ${airlineName(s.operatingCarrier, db.settings.airlines)}` : airlineName(s.carrier, db.settings.airlines)}</span>
                        </Td>
                        <Td>
                          <span className="block font-mono font-semibold">{s.origin}</span>
                          <span className="block text-[10.5px] text-ink-3">{cityOf(s.origin)}</span>
                        </Td>
                        <Td right>
                          <span className="block text-[13px] font-semibold whitespace-nowrap">{dep.time}</span>
                          <span className="block text-[10.5px] whitespace-nowrap text-ink-3">
                            {dep.weekday} {dep.date}
                          </span>
                        </Td>
                        <Td>
                          <span className="block font-mono font-semibold">{s.destination}</span>
                          <span className="block text-[10.5px] text-ink-3">{cityOf(s.destination)}</span>
                        </Td>
                        <Td right>
                          <span className="block text-[13px] font-semibold whitespace-nowrap">
                            {arr.time}
                            {s.arrivalDayOffset > 0 && <sup className="ml-0.5 text-[9.5px] font-semibold">+{s.arrivalDayOffset}</sup>}
                          </span>
                          <span className="block text-[10.5px] whitespace-nowrap text-ink-3">
                            {arr.weekday} {arr.date}
                          </span>
                        </Td>
                        <Td className="whitespace-nowrap text-ink-2">
                          {CABIN_LABELS[s.cabin]} <span className="font-mono">({s.bookingClass})</span>
                        </Td>
                        <Td className="text-ink-3">—</Td>
                        <Td className="whitespace-nowrap text-ink-2">{f.details.baggage ?? "—"}</Td>
                      </Tr>
                    );
                  })}
              </tbody>
            </Grid>
            <p className="mt-1.5 text-[10.5px] text-ink-3">Times are local at each airport. +1 means the next day. Terminals are confirmed by the airline at check-in.</p>
          </DocSection>
        ))}

        <OtherServices lines={lines.filter((l) => !isFlight(l))} />

        <DocFooter company={company}>
          <p className="mb-1 font-medium text-ink-2">
            24/7 travel assistance: <span className="tnum">{companyPhone(company.phone)}</span> (calls and WhatsApp) · {company.email}
          </p>
          <p className="mb-1">Check in at least 3 hours before international flights and carry the passport named above. Generated {fmtDateTime(new Date())}.</p>
        </DocFooter>
      </Paper>
    </PrintShell>
  );
}
