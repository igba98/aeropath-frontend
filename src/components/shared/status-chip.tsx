import { AlertTriangle, Ban, Check, CheckCircle2, CircleDashed, Clock, CreditCard, FileText, Hourglass, RotateCcw, Timer, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { STATUS_LABELS, STATUS_TONES } from "@/lib/domain/state-machine";
import type { BookingStatus, ItemStatus } from "@/lib/domain/types";

const ICONS: Partial<Record<ItemStatus | BookingStatus, typeof Check>> = {
  draft: CircleDashed, held: Clock, expired: Timer, pending_payment: CreditCard, payment_failed: XCircle,
  paid: Check, awaiting_supplier: Hourglass, confirmed: CheckCircle2, supplier_rejected: XCircle,
  amended: FileText, used: CheckCircle2, cancelled: Ban, refunded: RotateCcw,
  pending_approval: Hourglass, approval_rejected: XCircle, processing: Hourglass, partial: AlertTriangle,
};

const TONE_CLASS = {
  neutral: "bg-muted text-muted-foreground",
  info: "bg-brand-50 text-brand-text",
  brand: "bg-brand-50 text-brand-text",
  warning: "bg-warning/10 text-warning-foreground",
  success: "bg-success/10 text-success-foreground",
  danger: "bg-destructive/10 text-destructive",
} as const;

/**
 * Single canonical status → label + colour + icon map (tech spec §29.4).
 * Colour never conveys meaning alone: every chip carries an icon and a text label (WCAG 1.4.1).
 */
export function StatusChip({ status, size = "md", className }: { status: ItemStatus | BookingStatus; size?: "sm" | "md"; className?: string }) {
  const Icon = ICONS[status] ?? CircleDashed;
  const tone = STATUS_TONES[status] ?? "neutral";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap",
        size === "sm" ? "px-2.5 py-1 text-[13px]" : "px-3.5 py-1.5 text-sm",
        TONE_CLASS[tone],
        className,
      )}
    >
      <Icon className={size === "sm" ? "size-3.5" : "size-4"} aria-hidden />
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function Pill({ tone = "neutral", children, className, icon: Icon }: { tone?: keyof typeof TONE_CLASS; children: React.ReactNode; className?: string; icon?: typeof Check }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-medium whitespace-nowrap", TONE_CLASS[tone], className)}>
      {Icon ? <Icon className="size-4" aria-hidden /> : null}
      {children}
    </span>
  );
}
