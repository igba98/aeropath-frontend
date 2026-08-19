"use client";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  AmendmentRequest, ApprovalRequest, AuditLog, Booking, BookingItem, ContentPage, Currency, FeatureFlag, Integration, InventoryUnit,
  LedgerEntry, Notification, NotificationTemplate, OpsTask, Organisation, Payment, Payout, Product, PromoCode, RatePlan, Refund,
  Review, RoleId, Ticket, TimelineEvent, User, WishlistItem,
} from "../domain/types";
import { buildSeed } from "./seed";

export type PaymentSimMode = "success" | "timeout" | "lost_callback" | "duplicate_callback" | "fail";

export interface Session {
  userId: string | null;
  roleId: RoleId;
  currency: Currency;
  agentClientName?: string;
  impersonatingUserId?: string;
  impersonationStartedAt?: string;
}

export interface StoreData {
  version: number;
  seededAt: string;
  session: Session;
  users: Record<string, User>;
  organisations: Record<string, Organisation>;
  products: Record<string, Product>;
  ratePlans: Record<string, RatePlan>;
  /** overrides only, key `${productId}:${yyyy-mm-dd}` */
  inventory: Record<string, InventoryUnit>;
  bookings: Record<string, Booking>;
  items: Record<string, BookingItem>;
  timeline: TimelineEvent[];
  payments: Record<string, Payment>;
  refunds: Record<string, Refund>;
  ledger: LedgerEntry[];
  audit: AuditLog[];
  approvals: Record<string, ApprovalRequest>;
  tickets: Record<string, Ticket>;
  payouts: Record<string, Payout>;
  reviews: Record<string, Review>;
  promos: Record<string, PromoCode>;
  content: Record<string, ContentPage>;
  notifications: Notification[];
  opsTasks: Record<string, OpsTask>;
  amendments: Record<string, AmendmentRequest>;
  flags: Record<string, FeatureFlag>;
  integrations: Record<string, Integration>;
  templates: Record<string, NotificationTemplate>;
  wishlists: Record<string, WishlistItem[]>;
  carts: Record<string, string | null>;
  simulator: { paymentMode: PaymentSimMode; supplierAutoConfirm: boolean };
  settings: { holdTtlMinutes: number; approvalHoldHours: number; supplierSlaHours: number; vatPct: number; serviceFeePct: number; fxUsdTzs: number };
  counters: { booking: number; quote: number; ticket: number; payout: number; misc: number };
}

export interface StoreActions {
  hydrated: boolean;
  setHydrated: (v: boolean) => void;
  patch: (fn: (draft: StoreData) => void) => void;
  reset: () => void;
}

export type Store = StoreData & StoreActions;

export const STORE_VERSION = 1;

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      ...buildSeed(),
      hydrated: false,
      setHydrated: (v) => set({ hydrated: v }),
      patch: (fn) => {
        // structural clone-free mutation: we mutate a shallow copy of the top level and rely on callers to replace nested objects
        const draft = { ...get() } as unknown as Record<string, unknown>;
        // shallow copy every collection so React re-renders on reference change
        for (const k of Object.keys(draft)) {
          const v = draft[k];
          if (Array.isArray(v)) draft[k] = [...v];
          else if (v && typeof v === "object") draft[k] = { ...(v as object) };
        }
        fn(draft as unknown as StoreData);
        set(draft as unknown as Store);
      },
      reset: () => set({ ...buildSeed(), hydrated: true }),
    }),
    {
      name: "aeropath:v1",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
      partialize: (s) => {
        const { hydrated: _h, setHydrated: _s, patch: _p, reset: _r, ...data } = s;
        void _h; void _s; void _p; void _r;
        return data;
      },
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
      version: STORE_VERSION,
      migrate: () => buildSeed() as unknown as Store,
    },
  ),
);

/** Read the current data synchronously (for API functions) */
export const getData = () => useStore.getState();
