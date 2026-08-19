"use client";

import Link from "next/link";
import { Archive, CheckCircle2, CircleDashed, FileWarning, Hourglass, LogIn, PauseCircle, ShieldAlert, Store, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { Pill } from "@/components/shared/status-chip";
import { useSession } from "@/hooks/use-session";
import { useStore } from "@/lib/store";
import type { BookingItem, Organisation, ProductStatus } from "@/lib/domain/types";

export interface SupplierContext {
  hydrated: boolean;
  /** the supplier organisation of the signed in user, if any */
  org?: Organisation;
  isSupplier: boolean;
  isAdmin: boolean;
  roleLabel: string;
}

/** Everything the supplier console screens need about who is looking. */
export function useSupplierContext(): SupplierContext {
  const { hydrated, org, isSupplier, roleId, roleLabel } = useSession();
  const supplierOrg = org?.type === "supplier" ? org : undefined;
  return { hydrated, org: supplierOrg, isSupplier, isAdmin: roleId === "supplier_admin", roleLabel };
}

/** Awaiting-supplier items for one supplier, most urgent first. */
export function usePendingConfirmations(supplierId?: string): BookingItem[] {
  const items = useStore((s) => s.items);
  if (!supplierId) return [];
  return Object.values(items)
    .filter((i) => i.supplierId === supplierId && i.status === "awaiting_supplier")
    .sort((a, b) => (a.slaDeadlineAt ?? "").localeCompare(b.slaDeadlineAt ?? ""));
}

export const isBreached = (item: BookingItem) => Boolean(item.slaDeadlineAt && new Date(item.slaDeadlineAt).getTime() < Date.now());

/** Friendly stand-in when a non supplier persona opens a supplier screen. */
export function NotSupplier({ what = "the supplier console" }: { what?: string }) {
  return (
    <EmptyState
      icon={Store}
      title="Sign in as a supplier persona"
      description={`${what} shows the products, bookings and payouts of one supplier organisation. Pick Serengeti Serena (Supplier Admin) or Kubu Kubu (Supplier Staff) on the sign in screen to see it with real data.`}
      action={
        <Button asChild>
          <Link href="/login">
            <LogIn className="size-4" aria-hidden />
            Go to sign in
          </Link>
        </Button>
      }
    />
  );
}

/** Screens the access matrix reserves for Supplier Admin (flow spec §2.4). */
export function AdminOnly({ screen }: { screen: string }) {
  return (
    <EmptyState
      icon={ShieldAlert}
      title="Supplier Admin only"
      description={`${screen} is restricted to the Supplier Admin role. Supplier Staff can manage products, availability and booking confirmations. Ask your administrator for access.`}
      action={
        <Button variant="outline" asChild>
          <Link href="/partner/supplier">Back to dashboard</Link>
        </Button>
      }
    />
  );
}

const PRODUCT_STATUS: Record<ProductStatus, { label: string; tone: "neutral" | "info" | "warning" | "success" | "danger" | "brand"; icon: typeof CheckCircle2 }> = {
  draft: { label: "Draft", tone: "neutral", icon: CircleDashed },
  pending_review: { label: "Pending review", tone: "warning", icon: Hourglass },
  changes_requested: { label: "Changes requested", tone: "warning", icon: FileWarning },
  live: { label: "Live", tone: "success", icon: CheckCircle2 },
  paused: { label: "Paused", tone: "neutral", icon: PauseCircle },
  archived: { label: "Archived", tone: "neutral", icon: Archive },
  rejected: { label: "Rejected", tone: "danger", icon: XCircle },
};

export function ProductStatusPill({ status }: { status: ProductStatus }) {
  const s = PRODUCT_STATUS[status];
  return <Pill tone={s.tone} icon={s.icon}>{s.label}</Pill>;
}

export const VERTICAL_LABELS: Record<string, string> = { stay: "Stay", tour: "Tour & safari", transfer: "Transfer", flight: "Flight" };

/** The completeness gate the back office enforces before a product may go live. */
export const PUBLISH_THRESHOLD = 8;
