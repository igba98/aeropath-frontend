import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

/**
 * StatusChip — the one status flag used everywhere (spec §12), built on the shadcn Badge.
 * A tinted pill with a dot; colour lives only inside the flag.
 */

type Tone = "green" | "amber" | "red" | "violet" | "grey" | "blue";

type Spec = { label: string; tone: Tone; strike?: boolean; hatch?: boolean };

/** status key → label + tone. Keys are namespaced so one map drives every chip. */
const MAP: Record<string, Spec> = {
  // Service lines
  "line.quoted": { label: "Quoted", tone: "grey" },
  "line.booked": { label: "Booked", tone: "blue" },
  "line.issued": { label: "Issued", tone: "green" },
  "line.completed": { label: "Completed", tone: "green" },
  "line.travelled": { label: "Travelled", tone: "green" },
  "line.cancelled": { label: "Cancelled", tone: "grey", strike: true },
  "line.voided": { label: "Voided", tone: "grey", strike: true },
  "line.refund_pending": { label: "Refund pending", tone: "amber" },
  "line.refunded": { label: "Refunded", tone: "violet" },
  "line.exchanged": { label: "Exchanged", tone: "grey" },
  // Booking files
  "file.draft": { label: "Draft", tone: "grey" },
  "file.confirmed": { label: "Confirmed", tone: "blue" },
  "file.travelled": { label: "Travelled", tone: "green" },
  "file.closed": { label: "Closed", tone: "grey" },
  "file.cancelled": { label: "Cancelled", tone: "grey", strike: true },
  // Payment status of a file / client / supplier
  "pay.none": { label: "No charges", tone: "grey" },
  "pay.unpaid": { label: "Unpaid", tone: "red" },
  "pay.partial": { label: "Partial", tone: "amber" },
  "pay.paid": { label: "Paid", tone: "green" },
  "pay.credit": { label: "Credit", tone: "violet" },
  "pay.overdue": { label: "Overdue", tone: "red", hatch: true },
  "pay.owed": { label: "Owed", tone: "amber" },
  "pay.settled": { label: "Settled", tone: "green" },
  // Payment records
  "payment.recorded": { label: "Unverified", tone: "amber" },
  "payment.verified": { label: "Verified", tone: "green" },
  "payment.reversed": { label: "Reversed", tone: "grey", strike: true },
  // Refund requests
  "refund.requested": { label: "Awaiting decision", tone: "amber" },
  "refund.approved": { label: "Approved · not paid", tone: "blue" },
  "refund.rejected": { label: "Rejected", tone: "grey" },
  "refund.paid": { label: "Paid out", tone: "green" },
  "refund.closed": { label: "Closed", tone: "grey" },
  // Documents
  "doc.issued": { label: "Current", tone: "blue" },
  "doc.superseded": { label: "Superseded", tone: "grey" },
  "doc.void": { label: "Void", tone: "grey", strike: true },
  "doc.outdated": { label: "Outdated", tone: "amber" },
  // Misc
  "user.active": { label: "Active", tone: "green" },
  "user.inactive": { label: "Deactivated", tone: "grey" },
  "limit.manager": { label: "Needs Manager", tone: "violet" },
  "visa.pending": { label: "Visa pending", tone: "amber" },
  "visa.approved": { label: "Visa approved", tone: "green" },
  "visa.rejected": { label: "Visa rejected", tone: "red" },
};

export function statusSpec(key: string): Spec {
  return MAP[key] ?? { label: key.split(".").pop()?.replace(/_/g, " ") ?? key, tone: "grey" };
}

export function StatusChip({
  status,
  label,
  tone,
  className,
  size = "sm",
  title,
}: {
  /** Namespaced key, e.g. "line.issued", "pay.partial". */
  status?: string;
  label?: string;
  tone?: Tone;
  className?: string;
  size?: "xs" | "sm";
  title?: string;
}) {
  const spec = status ? statusSpec(status) : { label: label ?? "", tone: tone ?? "grey" };
  const t = tone ?? spec.tone;
  const text = label ?? spec.label;
  return (
    <Badge
      variant={t}
      title={title}
      className={cn("gap-1.5 font-semibold", size === "sm" ? "h-6 px-2.5 text-xs leading-none" : "h-5 px-2 text-[11px] leading-none", spec.hatch && "hatch", className)}
    >
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current" />
      <span className={cn(spec.strike && "line-through decoration-1")}>{text}</span>
    </Badge>
  );
}

export type { Tone };
