"use client";

import { useSyncExternalStore } from "react";

/**
 * A shared 1Hz clock.
 *
 * Countdowns need the current time, but reading `Date.now()` during render is impure and makes
 * the server and client disagree at hydration. `useSyncExternalStore` is the sanctioned way to
 * read an external, changing source: the server snapshot is `null`, so the first paint matches
 * the server exactly, and the value arrives on the first client tick.
 */
const subscribers = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
let snapshot = 0;

function subscribe(onChange: () => void) {
  subscribers.add(onChange);
  if (!timer) {
    snapshot = Math.floor(Date.now() / 1000);
    timer = setInterval(() => {
      const next = Math.floor(Date.now() / 1000);
      if (next === snapshot) return;
      snapshot = next;
      for (const fn of subscribers) fn();
    }, 1000);
  }
  return () => {
    subscribers.delete(onChange);
    if (subscribers.size === 0 && timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

/** Seconds since the epoch, or null before the first client tick (and on the server). */
export function useNowSeconds(): number | null {
  return useSyncExternalStore(
    subscribe,
    () => (snapshot || (snapshot = Math.floor(Date.now() / 1000))),
    () => null,
  );
}

/** Milliseconds remaining until `iso`, or null before the clock is live. */
export function useMillisUntil(iso?: string): number | null {
  const now = useNowSeconds();
  if (!iso || now === null) return null;
  return new Date(iso).getTime() - now * 1000;
}

/**
 * A predicate for "has this moment passed?", safe to call during render.
 *
 * Returns false until the clock is live, so the first paint matches the server. Pages that
 * already gate on store hydration render their skeleton at that point anyway.
 */
export function useIsPast(): (iso?: string, offsetMs?: number) => boolean {
  const now = useNowSeconds();
  return (iso, offsetMs = 0) => {
    if (!iso || now === null) return false;
    return new Date(iso).getTime() < now * 1000 + offsetMs;
  };
}
