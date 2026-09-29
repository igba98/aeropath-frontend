"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { safeStorage } from "@/store/storage";

/**
 * Upcoming automatic messages staff chose to skip. Kept in this browser only.
 * TODO(backend): store skips on the server so the sender (and colleagues) honour them.
 */
interface Skipped {
  ids: string[];
  skip: (id: string) => void;
  restore: (id: string) => void;
  restoreAll: () => void;
}

export const useSkipped = create<Skipped>()(
  persist(
    (set) => ({
      ids: [],
      skip: (id) => set((s) => ({ ids: s.ids.includes(id) ? s.ids : [...s.ids, id].slice(-500) })),
      restore: (id) => set((s) => ({ ids: s.ids.filter((x) => x !== id) })),
      restoreAll: () => set({ ids: [] }),
    }),
    { name: "aeropath-bo-comms-skipped", storage: createJSONStorage(() => safeStorage) },
  ),
);
