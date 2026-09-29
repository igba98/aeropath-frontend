"use client";

import type { StateStorage } from "zustand/middleware";

/**
 * Browser storage that never throws.
 *
 * localStorage is shared by everything served from the same address (e.g. every dev app on
 * localhost:3000) and is capped at about 5 MB. When a write doesn't fit we free data this app
 * owns but no longer uses, retry, and if it still doesn't fit keep the value in memory for
 * this tab and tell the user once, instead of crashing the screen that tried to save.
 */

/** Keys written by earlier versions of this app (the retired marketplace prototype). */
export const LEGACY_KEYS = ["aeropath:v1"];

const memory = new Map<string, string>();
let warned = false;
let onFull: ((key: string) => void) | undefined;

/** Register who to tell (once) when storage is full and we fall back to memory. */
export function onStorageFull(fn: (key: string) => void) {
  onFull = fn;
}

function ls(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null; // blocked storage (privacy mode, disabled cookies)
  }
}

function isQuotaError(e: unknown): boolean {
  return (
    e instanceof DOMException &&
    (e.name === "QuotaExceededError" || e.name === "NS_ERROR_DOM_QUOTA_REACHED" || e.code === 22 || e.code === 1014)
  );
}

/** Remove data left behind by retired versions of the app. Returns how many keys were removed. */
export function clearLegacyKeys(): number {
  const s = ls();
  if (!s) return 0;
  let n = 0;
  for (const k of LEGACY_KEYS) {
    try {
      if (s.getItem(k) !== null) {
        s.removeItem(k);
        n++;
      }
    } catch {
      /* ignore */
    }
  }
  return n;
}

export const safeStorage: StateStorage = {
  getItem(name) {
    if (memory.has(name)) return memory.get(name)!;
    try {
      return ls()?.getItem(name) ?? null;
    } catch {
      return null;
    }
  },

  setItem(name, value) {
    const s = ls();
    if (!s) {
      memory.set(name, value);
      return;
    }
    const attempt = () => {
      s.setItem(name, value);
      memory.delete(name);
    };
    try {
      attempt();
      return;
    } catch (e) {
      if (!isQuotaError(e)) {
        memory.set(name, value);
        return;
      }
    }
    // Full: free our own leftovers, including the stale copy of this key, then retry once.
    clearLegacyKeys();
    try {
      s.removeItem(name);
      attempt();
      return;
    } catch {
      memory.set(name, value);
      if (!warned) {
        warned = true;
        onFull?.(name);
      }
    }
  },

  removeItem(name) {
    memory.delete(name);
    try {
      ls()?.removeItem(name);
    } catch {
      /* ignore */
    }
  },
};
