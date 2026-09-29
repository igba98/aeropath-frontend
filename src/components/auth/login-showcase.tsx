"use client";

import * as React from "react";
import Image from "next/image";

import { cn } from "@/lib/utils";
import { BrandMark } from "@/components/layout/brand";

const SLIDES = [
  {
    src: "/images/hotels/beautiful-beach-chairs-sandy-beach-near-sea-summer-holiday-vacation-concept.jpg",
    title: "Flights and beach stays, booked in minutes.",
    body: "Search Air Tanzania, Precision Air and the Gulf carriers side by side, hold the seats and send the itinerary on WhatsApp.",
  },
  {
    src: "/images/hotels/pool-villa-are-located-heart-resort.jpg",
    title: "Hotels your clients will love.",
    body: "Direct contracts and partner hotels from Zanzibar to Dubai, confirmed on the spot with the cancellation terms in plain words.",
  },
  {
    src: "/images/hotels/sea-house-resort-exotic-sky.jpg",
    title: "Every shilling accounted for.",
    body: "Receipts, supplier payments, petty cash and the books in one place, ready for your accountant.",
  },
  {
    src: "/images/hotels/rest-sunshine-atoll-bungalow-holiday.jpg",
    title: "Reminders that go out on time.",
    body: "Flight, payment and ticketing reminders by SMS, WhatsApp and email, so no seat is lost and no invoice is forgotten.",
  },
];

const EVERY_MS = 7000;

function useReducedMotion() {
  const [reduced, setReduced] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/** The sign-in side panel: travel photographs crossfading under a Route Blue wash, one product promise per slide. */
export function LoginShowcase({ className }: { className?: string }) {
  const [i, setI] = React.useState(0);
  const [paused, setPaused] = React.useState(false);
  const reduced = useReducedMotion();

  React.useEffect(() => {
    if (paused || reduced) return;
    const t = setTimeout(() => setI((x) => (x + 1) % SLIDES.length), EVERY_MS);
    return () => clearTimeout(t);
  }, [i, paused, reduced]);

  const slide = SLIDES[i];
  return (
    <aside className={cn("relative overflow-hidden bg-[#0b2350] text-white", className)} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} aria-roledescription="carousel" aria-label="About Aeropath">
      {SLIDES.map((s, n) => (
        <div key={s.src} aria-hidden={n !== i} className={cn("absolute inset-0 transition-opacity duration-[1400ms] ease-out", n === i ? "opacity-100" : "opacity-0")}>
          <Image
            src={s.src}
            alt=""
            fill
            priority={n === 0}
            sizes="(min-width: 1024px) 50vw, 100vw"
            className={cn("object-cover", !reduced && "transition-transform duration-[8000ms] ease-out", n === i && !reduced ? "scale-[1.06]" : "scale-100")}
          />
        </div>
      ))}
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-[#07193d] via-[#0b2350]/55 to-[#0b2350]/15" />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-[#0b2350]/40 to-transparent" />

      <div className="relative flex h-full flex-col justify-between p-10 xl:p-14">
        <div className="flex items-center gap-3">
          <BrandMark priority className="size-12 shadow-[0_4px_16px_rgb(0_0_0/0.3)] ring-2 ring-white/90" />
          <span className="leading-tight">
            <span className="block text-lg font-bold">Aeropath</span>
            <span className="block text-sm text-white/80">Travel back office</span>
          </span>
        </div>

        <div className="max-w-lg">
          <div key={i} className={cn(!reduced && "animate-in fade-in-0 slide-in-from-bottom-2 duration-700")}>
            <h2 className="text-[36px] leading-[1.12] font-bold tracking-[-0.02em] text-balance [text-shadow:0_2px_24px_rgb(0_0_0/0.35)]">{slide.title}</h2>
            <p className="mt-4 text-[16px] leading-7 text-white/90">{slide.body}</p>
          </div>
          <div className="mt-8 flex items-center gap-2" role="tablist" aria-label="Choose a slide">
            {SLIDES.map((s, n) => (
              <button
                key={s.src}
                type="button"
                role="tab"
                aria-selected={n === i}
                aria-label={`Slide ${n + 1} of ${SLIDES.length}`}
                onClick={() => setI(n)}
                className={cn("h-1.5 rounded-full transition-all duration-300 outline-none focus-visible:ring-2 focus-visible:ring-white", n === i ? "w-8 bg-white" : "w-3 bg-white/45 hover:bg-white/70")}
              />
            ))}
          </div>
        </div>

        <p className="text-sm text-white/75">Aeropath Travel Ltd · Dar es Salaam</p>
      </div>
    </aside>
  );
}

/** Phones: a short photo banner above the form, same wash. */
export function LoginBanner({ className }: { className?: string }) {
  return (
    <div className={cn("relative h-40 overflow-hidden rounded-2xl bg-[#0b2350]", className)}>
      <Image src={SLIDES[0].src} alt="" fill priority sizes="100vw" className="object-cover" />
      <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-[#07193d]/90 via-[#0b2350]/40 to-transparent" />
      <div className="absolute inset-x-4 bottom-4 flex items-center gap-3 text-white">
        <BrandMark priority className="size-11 shadow-[0_2px_10px_rgb(0_0_0/0.3)] ring-2 ring-white/90" />
        <span className="leading-tight">
          <span className="block text-base font-bold">Aeropath</span>
          <span className="block text-[13px] text-white/85">Travel back office</span>
        </span>
      </div>
    </div>
  );
}
