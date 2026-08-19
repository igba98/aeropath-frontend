"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cart } from "@/lib/api";
import type { Pax } from "@/lib/domain/types";

interface Props {
  productId: string;
  ratePlanId: string;
  dateFrom: string;
  dateTo: string;
  quantity?: number;
  pax: Pax;
  disabled?: boolean;
  label?: string;
  size?: "sm" | "default" | "lg";
  className?: string;
  specialRequests?: string;
}

/** Holds inventory immediately, then moves to the trip cart (T10). */
export function AddToTrip({ productId, ratePlanId, dateFrom, dateTo, quantity = 1, pax, disabled, label = "Add to trip", size = "lg", className, specialRequests }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState(false);

  function add() {
    setBusy(true);
    try {
      cart.add({ productId, ratePlanId, dateFrom, dateTo, quantity, pax, specialRequests });
      toast.success("Held for you", { description: "Inventory is reserved while you finish. The timer is in your trip." });
      start(() => router.push("/cart"));
    } catch (e) {
      const err = e as Error & { code?: string; remediation?: string };
      toast.error(err.code === "INVENTORY_UNAVAILABLE" ? "Those dates just went" : "Could not add to trip", { description: err.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button onClick={add} size={size} disabled={disabled || busy || pending} className={className}>
      {busy || pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ShoppingBag className="size-4" aria-hidden />}
      {label}
    </Button>
  );
}
