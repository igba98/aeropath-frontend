import type { Money } from "@/domain/types";
import { formatAmount } from "@/domain/money";
import { cn } from "@/lib/utils";

/**
 * Amounts: tabular figures, always with the currency code (spec §12).
 * The code is set smaller and quieter so columns of numbers line up and scan.
 */
export function Amount({
  value,
  className,
  codeClassName,
  signed = false,
  tone = "plain",
  hideCode = false,
  size = "md",
}: {
  value: Money | null | undefined;
  className?: string;
  codeClassName?: string;
  /** Show "+" for positive values */
  signed?: boolean;
  /** auto: negative = red; balance: ink either way (the Credit flag carries the meaning) */
  tone?: "plain" | "auto" | "balance" | "muted";
  hideCode?: boolean;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  if (!value) return <span className={cn("text-ink-4", className)}>—</span>;
  const neg = value.amountMinor < 0;
  const n = formatAmount(value);
  const toneCls =
    tone === "auto" && neg
      ? "text-[var(--st-red-fg)]"
      : tone === "muted"
          ? "text-ink-3"
          : undefined;
  const sizeCls = { sm: "text-[13px]", md: "", lg: "text-base font-semibold", xl: "text-2xl font-semibold tracking-tight" }[size];
  return (
    <span className={cn("tnum inline-flex items-baseline gap-1 whitespace-nowrap", sizeCls, toneCls, className)}>
      {!hideCode && (
        <span data-slot="amount-code" className={cn("text-[0.78em] font-medium tracking-wide text-ink-3", toneCls && "text-current opacity-75", codeClassName)}>{value.currency}</span>
      )}
      <span>{signed && value.amountMinor > 0 ? "+" + n : n}</span>
    </span>
  );
}
