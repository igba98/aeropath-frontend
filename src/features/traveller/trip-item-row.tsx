"use client";

import Link from "next/link";
import { CalendarRange, MapPin, ShieldCheck, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MoneyText } from "@/components/shared/money-text";
import { StatusChip } from "@/components/shared/status-chip";
import { HoldCountdown } from "@/components/shared/hold-countdown";
import { PolicyBadge } from "@/components/shared/policy-badge";
import { ProductImage } from "@/components/shared/product-image";
import { formatRange } from "@/lib/format";
import type { BookingItem } from "@/lib/domain/types";

const DETAIL_PATH = { stay: "/stays", flight: "/flights", tour: "/tours", transfer: "/transfers" } as const;

export function TripItemRow({ item, onRemove, showStatus = false, compact = false, slug }: { item: BookingItem; onRemove?: () => void; showStatus?: boolean; compact?: boolean; slug?: string }) {
  const pax = item.pax.adults + item.pax.children + item.pax.infants;

  return (
    <div className="flex gap-3 rounded-xl border bg-card p-3">
      <ProductImage slug={item.productId} alt="" className="size-20 shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-medium">
              {slug ? <Link href={`${DETAIL_PATH[item.vertical]}/${slug}`} className="hover:text-brand-text">{item.productSnapshot.title}</Link> : item.productSnapshot.title}
            </p>
            <p className="text-xs text-muted-foreground">{item.productSnapshot.ratePlanName}</p>
          </div>
          <div className="text-right">
            <MoneyText minor={item.sellPriceMinor} currency="TZS" convert size="md" />
          </div>
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><MapPin className="size-3" aria-hidden /> {item.productSnapshot.city}</span>
          <span className="flex items-center gap-1"><CalendarRange className="size-3" aria-hidden /> {formatRange(item.travelDateFrom, item.travelDateTo)}</span>
          <span className="flex items-center gap-1"><Users className="size-3" aria-hidden /> {pax} {pax === 1 ? "guest" : "guests"}{item.quantity > 1 ? ` · ${item.quantity} units` : ""}</span>
        </div>

        {!compact ? (
          <p className="mt-1.5 flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-3 shrink-0" aria-hidden />
            {item.cancellationPolicySnapshot.summary}
          </p>
        ) : null}

        {item.specialRequests ? <p className="mt-1 text-[11px] text-muted-foreground">Note: {item.specialRequests}</p> : null}

        <div className="mt-2 flex flex-wrap items-center gap-2">
          {showStatus ? <StatusChip status={item.status} size="sm" /> : null}
          {item.holdExpiresAt && (item.status === "held" || item.status === "pending_approval" || item.status === "pending_payment") ? (
            <HoldCountdown expiresAt={item.holdExpiresAt} label={item.status === "pending_approval" ? "Approval hold" : "Held"} />
          ) : null}
          {item.policyCheck ? <PolicyBadge inPolicy={item.policyCheck.inPolicy} reason={item.policyCheck.reason} capMinor={item.policyCheck.capMinor} size="sm" /> : null}
          {onRemove ? (
            <Button variant="ghost" size="sm" className="ml-auto gap-1.5 text-muted-foreground hover:text-destructive" onClick={onRemove}>
              <Trash2 className="size-3.5" aria-hidden /> Remove
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
