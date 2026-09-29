import type { CarLine, HotelLine, InsuranceLine, LineStatus, ServiceLine, TourLine, TransferLine, VisaLine } from "@/domain/types";
import { diffDaysISO } from "@/domain/dates";
import { fmtDate, fmtDateTime, fmtRange } from "@/lib/dates";
import { DocSection, Grid, Td, Th, Tr } from "./doc-parts";

/** Plain words for where a service stands, as printed for the client. */
export const STATE_WORD: Partial<Record<LineStatus, string>> = {
  quoted: "Quote only, not booked",
  booked: "Booked, not yet ticketed",
  issued: "Ticketed",
  completed: "Completed",
  refund_pending: "Refund in progress",
};

const SERVICE_STATE: Partial<Record<LineStatus, string>> = { quoted: "Quote only", booked: "Booked", issued: "Confirmed", completed: "Completed", refund_pending: "Refund in progress" };

const BOARD: Record<string, string> = { RO: "Room only", BB: "Bed and breakfast", HB: "Half board", FB: "Full board", AI: "All inclusive" };

function Conf({ no, status }: { no?: string; status: LineStatus }) {
  return (
    <span className="block leading-tight">
      {no ? <span className="block font-mono font-semibold">{no}</span> : <span className="block text-ink-3">To follow</span>}
      <span className="block text-[10.5px] text-ink-3">{SERVICE_STATE[status] ?? status}</span>
    </span>
  );
}

/** Hotels, transfers, cars and other services with their confirmation numbers. */
export function OtherServices({ lines }: { lines: ServiceLine[] }) {
  const hotels = lines.filter((l): l is HotelLine => l.type === "hotel");
  const transfers = lines.filter((l): l is TransferLine => l.type === "transfer");
  const cars = lines.filter((l): l is CarLine => l.type === "car");
  const tours = lines.filter((l): l is TourLine => l.type === "tour");
  const visas = lines.filter((l): l is VisaLine => l.type === "visa");
  const insurance = lines.filter((l): l is InsuranceLine => l.type === "insurance");

  return (
    <>
      {hotels.length > 0 && (
        <DocSection title="Hotels">
          <Grid className="text-[12px]">
            <thead>
              <tr>
                <Th>Hotel</Th>
                <Th>Stay</Th>
                <Th>Rooms</Th>
                <Th>Confirmation</Th>
              </tr>
            </thead>
            <tbody>
              {hotels.map((h) => {
                const d = h.details;
                const nights = Math.max(0, diffDaysISO(d.checkIn, d.checkOut));
                return (
                  <Tr key={h.id}>
                    <Td>
                      <span className="block font-semibold">{d.hotelName}</span>
                      <span className="block text-[10.5px] text-ink-3">{d.city}</span>
                    </Td>
                    <Td className="whitespace-nowrap">
                      <span className="block">{fmtRange(d.checkIn, d.checkOut)}</span>
                      <span className="block text-[10.5px] text-ink-3">
                        {nights} night{nights === 1 ? "" : "s"} · check-in {fmtDate(d.checkIn)}
                      </span>
                    </Td>
                    <Td className="text-ink-2">
                      {d.rooms.map((r, i) => (
                        <span key={i} className="block">
                          {r.roomType} · {BOARD[r.board] ?? r.board} · {r.adults + r.children} guest{r.adults + r.children === 1 ? "" : "s"}
                        </span>
                      ))}
                    </Td>
                    <Td>
                      <Conf no={d.confirmationNumber} status={h.status} />
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Grid>
        </DocSection>
      )}

      {transfers.length > 0 && (
        <DocSection title="Transfers">
          <Grid className="text-[12px]">
            <thead>
              <tr>
                <Th>When</Th>
                <Th>From → to</Th>
                <Th>Vehicle</Th>
                <Th>Confirmation</Th>
              </tr>
            </thead>
            <tbody>
              {transfers.map((t) => (
                <Tr key={t.id}>
                  <Td className="whitespace-nowrap">{fmtDateTime(t.details.at)}</Td>
                  <Td>
                    {t.details.from} → {t.details.to}
                    {t.details.flightRef && <span className="block text-[10.5px] text-ink-3">Meets flight <span className="font-mono">{t.details.flightRef}</span></span>}
                  </Td>
                  <Td className="text-ink-2">
                    {t.details.vehicle} · {t.details.pax} pax
                  </Td>
                  <Td>
                    <Conf no={t.details.confirmationNumber} status={t.status} />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Grid>
        </DocSection>
      )}

      {cars.length > 0 && (
        <DocSection title="Car hire">
          <Grid className="text-[12px]">
            <thead>
              <tr>
                <Th>Car</Th>
                <Th>Pick-up</Th>
                <Th>Drop-off</Th>
                <Th>Confirmation</Th>
              </tr>
            </thead>
            <tbody>
              {cars.map((c) => (
                <Tr key={c.id}>
                  <Td>
                    <span className="block font-semibold">{c.details.company}</span>
                    <span className="block text-[10.5px] text-ink-3">
                      {c.details.carClass}
                      {c.details.withDriver ? " · with driver" : ""}
                    </span>
                  </Td>
                  <Td>
                    <span className="block">{c.details.pickupLocation}</span>
                    <span className="block text-[10.5px] text-ink-3">{fmtDateTime(c.details.pickupAt)}</span>
                  </Td>
                  <Td>
                    <span className="block">{c.details.dropoffLocation}</span>
                    <span className="block text-[10.5px] text-ink-3">{fmtDateTime(c.details.dropoffAt)}</span>
                  </Td>
                  <Td>
                    <Conf no={c.details.confirmationNumber} status={c.status} />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Grid>
        </DocSection>
      )}

      {tours.length + visas.length + insurance.length > 0 && (
        <DocSection title="Other services">
          <Grid className="text-[12px]">
            <thead>
              <tr>
                <Th>Service</Th>
                <Th>Dates</Th>
                <Th>Reference</Th>
              </tr>
            </thead>
            <tbody>
              {tours.map((t) => (
                <Tr key={t.id}>
                  <Td>
                    {t.details.name} · {t.details.pax} pax
                    {t.details.inclusions && <span className="block text-[10.5px] text-ink-3">{t.details.inclusions}</span>}
                  </Td>
                  <Td className="whitespace-nowrap">{fmtRange(t.details.startDate, t.details.endDate)}</Td>
                  <Td>
                    <Conf no={t.details.confirmationNumber} status={t.status} />
                  </Td>
                </Tr>
              ))}
              {visas.map((v) => (
                <Tr key={v.id}>
                  <Td>
                    {v.details.country} visa · {v.details.visaType}
                  </Td>
                  <Td className="whitespace-nowrap">{v.details.submittedAt ? `Submitted ${fmtDate(v.details.submittedAt)}` : "—"}</Td>
                  <Td>
                    <span className="block font-mono">{v.details.reference ?? "—"}</span>
                    <span className="block text-[10.5px] text-ink-3">{v.details.decision === "approved" ? "Approved" : v.details.decision === "rejected" ? "Rejected" : "Decision pending"}</span>
                  </Td>
                </Tr>
              ))}
              {insurance.map((i) => (
                <Tr key={i.id}>
                  <Td>
                    {i.details.provider} · {i.details.plan}
                  </Td>
                  <Td className="whitespace-nowrap">{fmtRange(i.details.coverStart, i.details.coverEnd)}</Td>
                  <Td>
                    <Conf no={i.details.policyNumber} status={i.status} />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Grid>
        </DocSection>
      )}
    </>
  );
}
