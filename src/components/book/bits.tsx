"use client";

import Image from "next/image";
import { Star } from "lucide-react";

import { useApp } from "@/store";
import { airlineName, cityOf } from "@/store/seed/reference";
import { cn } from "@/lib/utils";

/** Airlines with a logo file in /public/airlines. The rest get a monogram. */
const LOGOS = new Set(["TC", "PW", "CQ", "EK", "QR", "TK", "ET", "KQ", "LH", "BA", "SA", "AI"]);

export function AirlineLogo({ code, size = "md", className }: { code: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const box = size === "sm" ? "h-8 w-12" : size === "lg" ? "h-14 w-24" : "h-10 w-16";
  return (
    <span className={cn("relative grid shrink-0 place-items-center overflow-hidden rounded-lg border border-rule bg-white", box, className)}>
      {LOGOS.has(code) ? (
        <Image src={`/airlines/${code.toLowerCase()}.png`} alt="" fill sizes="96px" className={cn("object-contain", size === "sm" ? "p-1" : "p-1.5")} />
      ) : (
        <span className="text-sm font-bold tracking-wide text-brand-700">{code}</span>
      )}
    </span>
  );
}

export function useAirlineName() {
  const airlines = useApp((s) => s.db?.settings.airlines);
  return (code: string) => airlineName(code, airlines ?? undefined);
}

/** 1 h 5 min · 35 min · 13 h */
export function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function stopsLabel(stops: number, via: string[]): string {
  if (!stops) return "Nonstop";
  return `${stops} stop${stops > 1 ? "s" : ""} in ${via.map(cityOf).join(", ")}`;
}

export function Stars({ n, className }: { n: number; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[var(--st-amber-fg)]", className)} aria-label={`${n} stars`}>
      {Array.from({ length: n }, (_, i) => (
        <Star key={i} className="size-3.5 fill-current" aria-hidden />
      ))}
    </span>
  );
}

/** Review score in a brand pill: "8.6 Excellent". */
export function RatingPill({ rating, reviews, className }: { rating: number; reviews?: number; className?: string }) {
  const word = rating >= 9 ? "Exceptional" : rating >= 8.5 ? "Excellent" : rating >= 8 ? "Very good" : rating >= 7 ? "Good" : "Pleasant";
  return (
    <span className={cn("inline-flex items-center gap-2 text-sm", className)}>
      <span className="tnum rounded-md bg-brand-600 px-1.5 py-0.5 text-[13px] font-bold text-white">{rating.toFixed(1)}</span>
      <span className="font-semibold text-ink">{word}</span>
      {reviews !== undefined && <span className="text-ink-3">· {reviews.toLocaleString("en-US")} reviews</span>}
    </span>
  );
}
