"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";

import { useApp } from "@/store";
import { useNow } from "@/lib/use-now";
import { darToday } from "@/lib/dates";
import { readFlightQuery, readHotelQuery } from "./query";

/** Today in Dar, the live FX rate and the clock, for searches and prices. */
export function useBookCtx() {
  const now = useNow();
  const fx = useApp((s) => s.db?.settings.fx.USD_TZS ?? 2600);
  const today = darToday(now);
  return React.useMemo(() => ({ now, today, fx }), [now, today, fx]);
}

/** The flight search in the URL, stable while the URL does not change. */
export function useFlightQuery() {
  const sp = useSearchParams();
  const { today } = useBookCtx();
  const qs = sp.toString();
  return React.useMemo(() => ({ q: readFlightQuery(new URLSearchParams(qs), today), qs }), [qs, today]);
}

export function useHotelQuery() {
  const sp = useSearchParams();
  const { today } = useBookCtx();
  const qs = sp.toString();
  return React.useMemo(() => ({ q: readHotelQuery(new URLSearchParams(qs), today), qs }), [qs, today]);
}
