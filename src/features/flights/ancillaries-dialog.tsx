"use client";

import { useState } from "react";
import { ChevronDown, PlaneLanding, PlaneTakeoff } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MoneyText } from "@/components/shared/money-text";
import { SeatMap } from "./seat-map";
import { BaggagePicker, bagsTotalMinor } from "./baggage-picker";
import { seatAt } from "@/lib/domain/ancillaries";
import { formatDate } from "@/lib/format";
import type { BagSelection, SeatAssignment } from "@/lib/domain/types";

export interface FlightLeg {
  id: string;
  leg: "out" | "in";
  from: string;
  to: string;
  fromCity: string;
  toCity: string;
  date: string;
}

/** Seat and baggage selection for a booked flight, one tab per concern. */
export function AncillariesDialog({
  open,
  onOpenChange,
  legs,
  travellers,
  cabin = "economy",
  seats,
  bags,
  onSave,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  legs: FlightLeg[];
  travellers: Array<{ label: string }>;
  cabin?: "economy" | "business";
  seats: SeatAssignment[];
  bags: BagSelection[];
  onSave: (next: { seats: SeatAssignment[]; bags: BagSelection[] }) => void;
}) {
  const [tab, setTab] = useState<"seats" | "bags">("seats");
  const [draftSeats, setDraftSeats] = useState<SeatAssignment[]>(seats);
  const [draftBags, setDraftBags] = useState<BagSelection[]>(bags);
  const [openLeg, setOpenLeg] = useState<string>(legs[0]?.id ?? "");
  const [active, setActive] = useState(0);
  const [applyToAll, setApplyToAll] = useState(false);

  const seatTotal = draftSeats.reduce((s, a) => s + a.priceMinor, 0);
  const bagTotal = bagsTotalMinor(draftBags, cabin);
  const total = seatTotal + bagTotal;

  function pickSeat(legId: string, leg: "out" | "in", seat: string, priceMinor: number) {
    setDraftSeats((prev) => {
      const mine = prev.find((a) => a.leg === leg && a.travellerIndex === active);
      // Tapping your own seat again releases it.
      if (mine?.seat === seat) return prev.filter((a) => a !== mine);
      // A seat someone else in the party holds is not free to take.
      if (prev.some((a) => a.leg === leg && a.seat === seat)) {
        toast.error("That seat is taken by someone in your party");
        return prev;
      }
      const without = prev.filter((a) => !(a.leg === leg && a.travellerIndex === active));
      const klass = seatAt(legId, seat);
      return [...without, { travellerIndex: active, leg, seat, priceMinor: klass?.priceMinor ?? priceMinor }];
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto p-0 sm:max-w-5xl">
        <DialogHeader className="sticky top-0 z-10 border-b bg-card px-6 py-4">
          <DialogTitle className="font-display text-2xl">Seats and baggage</DialogTitle>
          <div className="mt-3 inline-flex rounded-full bg-muted p-1">
            {(["seats", "bags"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                aria-pressed={tab === t}
                className={cn(
                  "rounded-full px-5 py-2 text-sm transition-colors",
                  tab === t ? "bg-brand-500 font-medium text-white" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t === "seats" ? "Select seat" : "Baggage"}
              </button>
            ))}
          </div>
        </DialogHeader>

        <div className="px-6 py-5">
          {tab === "seats" ? (
            <div className="space-y-3">
              {legs.map((l) => {
                const isOpen = openLeg === l.id;
                const chosen = draftSeats.filter((a) => a.leg === l.leg).sort((a, b) => a.travellerIndex - b.travellerIndex);
                return (
                  <section key={l.id} className="overflow-hidden rounded-2xl border">
                    <button
                      onClick={() => setOpenLeg(isOpen ? "" : l.id)}
                      aria-expanded={isOpen}
                      className="flex w-full flex-wrap items-center gap-3 bg-muted/60 px-5 py-4 text-left"
                    >
                      <span className="flex items-center gap-2 text-sm text-muted-foreground">
                        {l.leg === "out" ? <PlaneTakeoff className="size-4" aria-hidden /> : <PlaneLanding className="size-4" aria-hidden />}
                        {l.leg === "out" ? "Outbound" : "Return"}
                      </span>
                      <span className="font-display text-xl text-brand-text">
                        {l.fromCity} <span className="text-muted-foreground">→</span> {l.toCity}
                      </span>
                      <span className="text-sm text-muted-foreground">{formatDate(l.date)}</span>
                      <span className="ml-auto flex items-center gap-3">
                        {chosen.length ? (
                          <span className="rounded-lg bg-card px-3 py-1.5 font-medium tabular-nums">
                            {chosen.map((c) => c.seat).join(" · ")}
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">No seats chosen</span>
                        )}
                        <ChevronDown className={cn("size-5 transition-transform", isOpen && "rotate-180")} aria-hidden />
                      </span>
                    </button>

                    {isOpen ? (
                      <div className="p-5">
                        <SeatMap
                          flightId={l.id}
                          leg={l.leg}
                          travellers={travellers}
                          activeTraveller={active}
                          assignments={draftSeats}
                          onActiveTravellerChange={setActive}
                          onSelect={(seat, price) => pickSeat(l.id, l.leg, seat, price)}
                        />
                      </div>
                    ) : null}
                  </section>
                );
              })}
            </div>
          ) : (
            <BaggagePicker
              cabin={cabin}
              travellers={travellers}
              activeTraveller={active}
              onActiveTravellerChange={setActive}
              selections={draftBags}
              onChange={setDraftBags}
              applyToAll={applyToAll}
              onApplyToAllChange={setApplyToAll}
            />
          )}
        </div>

        <div className="sticky bottom-0 flex flex-wrap items-center gap-4 border-t bg-card px-6 py-4">
          <div>
            <p className="text-sm text-muted-foreground">Extras total</p>
            <MoneyText minor={total} currency="TZS" size="lg" />
          </div>
          <p className="text-xs text-muted-foreground">
            {seatTotal > 0 ? "Seats " : ""}{seatTotal > 0 ? <MoneyText minor={seatTotal} currency="TZS" size="xs" showCurrency={false} /> : null}
            {seatTotal > 0 && bagTotal > 0 ? " · " : ""}
            {bagTotal > 0 ? "Bags " : ""}{bagTotal > 0 ? <MoneyText minor={bagTotal} currency="TZS" size="xs" showCurrency={false} /> : null}
          </p>
          <Button
            size="lg"
            className="ml-auto"
            onClick={() => {
              onSave({ seats: draftSeats, bags: draftBags });
              onOpenChange(false);
              toast.success("Seats and baggage saved", { description: total > 0 ? "Added to your fare summary." : undefined });
            }}
          >
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
