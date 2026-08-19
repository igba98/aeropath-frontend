"use client";

import { Fragment } from "react";
import { cn } from "@/lib/utils";
import { MoneyText } from "./money-text";
import type { PriceBreakdownData } from "@/lib/domain/types";

/**
 * One price breakdown component, used on review, ops booking detail, supplier booking detail,
 * reconciliation and every invoice (tech spec §31.1). A price that renders differently in two
 * places is an unresolvable dispute.
 */
export function PriceBreakdown({
  data, showNet = false, dense = false, className, title = "Price breakdown",
}: { data: PriceBreakdownData; showNet?: boolean; dense?: boolean; className?: string; title?: string }) {
  return (
    <div className={cn("rounded-xl border bg-card", dense ? "p-3" : "p-4", className)}>
      <p className={cn("font-medium text-muted-foreground", dense ? "text-[11px] uppercase tracking-wide" : "text-xs uppercase tracking-wide")}>{title}</p>
      <dl className="mt-3 space-y-2">
        {data.lines.map((l, i) => (
          <Fragment key={`${l.label}-${i}`}>
            <div className="flex items-baseline justify-between gap-4">
              <dt className={cn("text-muted-foreground", dense ? "text-[13px]" : "text-sm", l.kind === "discount" && "text-success-foreground", l.kind === "markup" && "text-brand-text")}>{l.label}</dt>
              <dd className={cn(l.kind === "discount" && "text-success-foreground")}>
                <MoneyText minor={l.amountMinor} currency={data.currency} size="sm" showCurrency={false} />
              </dd>
            </div>
          </Fragment>
        ))}
      </dl>
      <div className="mt-3 flex items-baseline justify-between gap-4 border-t pt-3">
        <span className="text-sm font-medium">Total, all in</span>
        <MoneyText minor={data.totalMinor} currency={data.currency} size={dense ? "md" : "lg"} />
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">Includes all taxes, levies and fees. Nothing further is added at checkout.</p>
      {showNet && data.netMinor != null ? (
        <div className="mt-3 space-y-1.5 rounded-lg border border-dashed border-brand-300 bg-brand-50/60 p-3">
          <p className="text-[11px] font-medium uppercase tracking-wide text-brand-text-strong">Agency view</p>
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-muted-foreground">Net cost to you</span>
            <MoneyText minor={data.netMinor} currency={data.currency} size="sm" />
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-xs text-muted-foreground">Commission earned</span>
            <MoneyText minor={(data.commissionMinor ?? 0) + data.markupMinor} currency={data.currency} size="sm" className="text-success-foreground" />
          </div>
        </div>
      ) : null}
    </div>
  );
}
