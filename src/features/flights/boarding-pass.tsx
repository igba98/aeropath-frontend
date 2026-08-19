"use client";

import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { AirlineLogo } from "@/components/shared/airline-logo";
import { Ticket, TicketPerforation, FlightPath } from "./ticket-card";
import { initials } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface BoardingPassData {
  flightNo: string;
  carrier: string;
  carrierCode: string;
  cabin: string;
  boarding: string;
  terminal?: string;
  gate?: string;
  departTime: string;
  arriveTime: string;
  from: string;
  to: string;
  fromCity: string;
  toCity: string;
  duration: string;
  reference: string;
  passengers: Array<{ name: string; type: string; dateOfBirth?: string; seat?: string }>;
}

/**
 * The boarding pass.
 *
 * The barcode is drawn from the booking reference rather than being a picture, so it is stable,
 * weightless and prints cleanly. It is decorative here — a real pass would carry a scannable
 * BCBP symbology — so it is hidden from assistive technology and the reference is given as text.
 */
export function BoardingPass({ data, className }: { data: BoardingPassData; className?: string }) {
  return (
    <Ticket className={cn("overflow-hidden", className)}>
      <div className="flex items-center justify-between gap-3 px-6 pt-6">
        <AirlineLogo carrier={data.carrier} code={data.carrierCode} size="md" />
        <span className="rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-text">{data.cabin}</span>
      </div>

      <div className="px-6 pt-5">
        <FlightPath
          departTime={data.departTime}
          arriveTime={data.arriveTime}
          from={data.from}
          to={data.to}
          fromCity={data.fromCity}
          toCity={data.toCity}
          duration={data.duration}
        />
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-y-4 px-6 sm:grid-cols-4">
        <Field label="Flight" value={data.flightNo} />
        <Field label="Boarding" value={data.boarding} />
        <Field label="Terminal" value={data.terminal ?? "—"} />
        <Field label="Gate" value={data.gate ?? "At airport"} />
      </dl>

      <ul className="mt-6 divide-y border-t">
        {data.passengers.map((p, i) => (
          <li key={i} className="flex items-center gap-3 px-6 py-4">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-medium text-brand-text">
              {initials(p.name)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{p.name}</span>
              <span className="block text-sm text-muted-foreground">
                {p.type}{p.dateOfBirth ? ` · ${p.dateOfBirth}` : ""}
              </span>
            </span>
            {p.seat ? (
              <span className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-2 font-medium tabular-nums">
                <SeatMark /> {p.seat}
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">Seat at check-in</span>
            )}
          </li>
        ))}
      </ul>

      <TicketPerforation className="mt-2" />

      <div className="px-6 pb-6 pt-5">
        <Barcode value={data.reference} />
        <p className="mt-2 text-center font-mono text-sm tracking-[0.3em] text-muted-foreground">{data.reference}</p>
        <Button
          variant="ghost"
          className="mx-auto mt-3 flex gap-2 text-brand-text"
          onClick={() => toast.success("Boarding pass downloaded", { description: `${data.reference}.pdf — also sent by SMS and WhatsApp.` })}
        >
          <Download className="size-4" aria-hidden /> Download ticket
        </Button>
      </div>
    </Ticket>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-display text-lg">{value}</dd>
    </div>
  );
}

function SeatMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4 text-muted-foreground" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M7 4v8a2 2 0 0 0 2 2h6" /><path d="M17 14v6" /><path d="M7 20h10" />
    </svg>
  );
}

/** Deterministic bar widths from the reference — the same code always draws the same barcode. */
function Barcode({ value }: { value: string }) {
  const bars: number[] = [];
  let h = 2166136261;
  for (let i = 0; i < 64; i++) {
    h ^= value.charCodeAt(i % value.length) + i;
    h = Math.imul(h, 16777619) >>> 0;
    bars.push(1 + (h % 3));
  }
  return (
    <div className="flex h-20 items-stretch justify-center gap-[3px]" aria-hidden>
      {bars.map((w, i) => (
        <span key={i} className="bg-brand-900" style={{ width: `${w}px` }} />
      ))}
    </div>
  );
}
