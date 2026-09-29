"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { nanoid } from "nanoid";
import { toast } from "sonner";

import type { Command, CommandResult, Ctx, Currency, DbState, ID, User } from "@/domain/types";
import { runCommand } from "@/domain/commands/run";
import { resetDemoData } from "@/domain/commands";
import { generateSeed } from "./seed/generate";
import { BED_BANK_SUPPLIER } from "@/providers/inventory/hotels";
import { DEFAULT_NUMBERING, defaultComms } from "@/domain/defaults";
import { clearLegacyKeys, onStorageFull, safeStorage } from "./storage";

/**
 * The one store. Normalised tables (DbState) live under `db`; screens read through selectors
 * and change state only through `dispatch(command, input)` (spec §3.4).
 */

export const PERSIST_KEY = "aeropath-bo-v1";

type DispatchOpts = {
  /** false: no toast at all · string: override the success toast */
  toast?: boolean | string;
  /** Don't toast errors (the caller shows them inline). */
  quietErrors?: boolean;
};

interface AppState {
  db: DbState | null;
  hydrated: boolean;
  dispatch: <I, R>(cmd: Command<I, R>, input: I, opts?: DispatchOpts) => CommandResult<R>;
  signIn: (userId: ID) => { ok: true } | { ok: false; message: string };
  signOut: () => void;
  resetDemo: () => boolean;
  _setHydrated: () => void;
}

export const newId = (prefix: string) => `${prefix}_${nanoid(12)}`;

/**
 * Persisted store version.
 * 2 adds the hotel bed bank used by Search and book.
 * 3 adds messages, journals, bank reconciliations, messaging settings and the journal numbering series.
 */
const STORE_VERSION = 3;

function migrate(persisted: unknown, version: number): { db: DbState | null } {
  const p = persisted as { db?: DbState | null } | undefined;
  if (!p?.db || p.db.schemaVersion !== 1) return { db: null };
  let db = p.db;
  if (version < 2 && !Object.values(db.suppliers).some((s) => s.name === BED_BANK_SUPPLIER)) {
    const id = "sup_bedbank";
    db = {
      ...db,
      suppliers: {
        ...db.suppliers,
        [id]: {
          id,
          name: BED_BANK_SUPPLIER,
          kind: "hotel",
          currency: "USD",
          contactName: "Reservations desk",
          phone: "+255222110450",
          email: "res@eahotelbank.example",
          paymentTermsDays: 14,
          notes: "Hotel bed bank: partner hotels booked from Search and book.",
          active: true,
        },
      },
    };
  }
  if (version < 3) {
    db = {
      ...db,
      messages: db.messages ?? {},
      journals: db.journals ?? {},
      reconciliations: db.reconciliations ?? {},
      counters: { ...db.counters, journal: db.counters.journal ?? 0 },
      settings: {
        ...db.settings,
        comms: db.settings.comms ?? defaultComms(),
        numbering: { ...db.settings.numbering, journal: db.settings.numbering.journal ?? DEFAULT_NUMBERING.journal },
      },
    };
  }
  return { db };
}

export const useApp = create<AppState>()(
  persist(
    (set, get) => ({
      db: null,
      hydrated: false,
      _setHydrated: () => {
        if (!get().db) set({ db: generateSeed(new Date()) });
        set({ hydrated: true });
      },

      dispatch: <I, R>(cmd: Command<I, R>, input: I, opts?: DispatchOpts): CommandResult<R> => {
        const db = get().db;
        const user = db?.session.userId ? db.users[db.session.userId] : undefined;
        if (!db || !user) {
          const error = { code: "FORBIDDEN" as const, message: "Sign in first." };
          if (!opts?.quietErrors) toast.error(error.message);
          return { ok: false, error };
        }
        const ctx: Ctx = { user, now: new Date(), settings: db.settings, newId };
        let res: CommandResult<R>;
        try {
          res = runCommand(db, cmd, input, ctx);
        } catch (e) {
          const message = e instanceof Error ? e.message : "Something went wrong.";
          if (!opts?.quietErrors) toast.error(message);
          return { ok: false, error: { code: "VALIDATION", message } };
        }
        if (!res.ok) {
          if (!opts?.quietErrors) toast.error(res.error.message);
          return res;
        }
        set({ db: res.state });
        if (opts?.toast !== false) {
          const msg = typeof opts?.toast === "string" ? opts.toast : res.toast;
          if (msg) toast.success(msg);
        }
        return res;
      },

      signIn: (userId) => {
        const db = get().db;
        const u = db?.users[userId];
        if (!db || !u) return { ok: false, message: "No account found for that email." };
        if (!u.active) return { ok: false, message: `${u.name}'s account is deactivated. Ask your manager to reactivate it.` };
        set({ db: { ...db, session: { userId } } });
        return { ok: true };
      },

      signOut: () => {
        const db = get().db;
        if (db) set({ db: { ...db, session: { userId: null } } });
      },

      resetDemo: () => {
        const db = get().db;
        if (!db) return false;
        const check = get().dispatch(resetDemoData, {}, { toast: false });
        if (!check.ok) return false;
        const fresh = generateSeed(new Date());
        // Keep the Manager signed in, unless their account was created after seeding.
        const keep = db.session.userId && fresh.users[db.session.userId] ? db.session.userId : null;
        set({ db: { ...fresh, session: { userId: keep } } });
        toast.success("Demo data reset to the seed.");
        return true;
      },
    }),
    {
      name: PERSIST_KEY,
      version: STORE_VERSION,
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({ db: s.db }),
      migrate: (persisted, version) => migrate(persisted, version) as unknown as AppState,
      skipHydration: true,
    },
  ),
);

/** Hydrate from localStorage, seeding on first run. Call once on the client. */
export async function hydrateStore() {
  // The retired marketplace prototype kept megabytes under its own key on the same address.
  clearLegacyKeys();
  onStorageFull(() =>
    toast.warning("This browser's storage is full", {
      description: "Changes will work until you reload, but won't be saved. Clear this site's data in the browser settings, then reload.",
      duration: 15000,
    }),
  );
  try {
    await useApp.persist.rehydrate();
  } catch {
    // Unreadable saved data: start from the seed rather than a blank screen.
  }
  useApp.getState()._setHydrated();
}

// ───────────────────────────── Hooks ─────────────────────────────

/** Read from the database. Only use under the hydrated app shell. */
export function useDb<T>(selector: (db: DbState) => T): T {
  return useApp((s) => selector(s.db as DbState));
}

export function useDispatch() {
  return useApp((s) => s.dispatch);
}

export function useCurrentUser(): User | null {
  return useApp((s) => (s.db?.session.userId ? (s.db.users[s.db.session.userId] ?? null) : null));
}

/** Non-null current user for screens under the auth guard. */
export function useMe(): User {
  const u = useCurrentUser();
  if (!u) throw new Error("useMe() outside the signed-in shell");
  return u;
}

export function getDb(): DbState {
  const db = useApp.getState().db;
  if (!db) throw new Error("Store not hydrated");
  return db;
}

// ───────────────────────── UI preferences ─────────────────────────

interface UiPrefs {
  displayCurrency: Currency;
  railCollapsed: boolean;
  setDisplayCurrency: (c: Currency) => void;
  toggleRail: () => void;
}

export const useUi = create<UiPrefs>()(
  persist(
    (set) => ({
      displayCurrency: "TZS",
      railCollapsed: false,
      setDisplayCurrency: (displayCurrency) => set({ displayCurrency }),
      toggleRail: () => set((s) => ({ railCollapsed: !s.railCollapsed })),
    }),
    { name: "aeropath-bo-ui", storage: createJSONStorage(() => safeStorage) },
  ),
);
