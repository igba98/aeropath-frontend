"use client";

import { cn } from "@/lib/utils";
import { convertMinor, formatMoney } from "@/lib/domain/money";
import type { Currency } from "@/lib/domain/types";
import { useStore } from "@/lib/store";

interface MoneyTextProps {
  minor: number;
  currency?: Currency;
  /** convert into the session display currency (settlement currency stays fixed on the booking) */
  convert?: boolean;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  showCurrency?: boolean;
  compact?: boolean;
  className?: string;
}

/** The only place currency is formatted (tech spec §31.2). */
export function MoneyText({ minor, currency = "TZS", convert = false, size = "md", showCurrency = true, compact = false, className }: MoneyTextProps) {
  const display = useStore((s) => s.session.currency);
  const target = convert ? display : currency;
  const amount = convert ? convertMinor(minor, currency, display) : minor;
  return (
    <span
      data-numeric
      className={cn(
        "price tabular whitespace-nowrap",
        size === "xs" && "text-xs leading-4 font-medium",
        size === "sm" && "text-sm leading-5 font-medium",
        size === "md" && "text-[17px] leading-6 font-semibold",
        size === "lg" && "text-[26px] leading-8 font-semibold tracking-tight",
        size === "xl" && "text-[34px] leading-10 font-semibold tracking-tight",
        className,
      )}
    >
      {formatMoney(amount, target, { showCurrency, compact })}
    </span>
  );
}
