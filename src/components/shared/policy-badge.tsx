import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/domain/money";

/** Corporate overlay: policy state on every result card and every item (flow spec §5.5). */
export function PolicyBadge({ inPolicy, reason, capMinor, className, size = "md" }: { inPolicy: boolean; reason?: string; capMinor?: number; className?: string; size?: "sm" | "md" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-medium",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        inPolicy ? "border-success/30 bg-success/12 text-success-foreground" : "border-warning/40 bg-warning/12 text-warning-foreground",
        className,
      )}
      title={reason}
    >
      {inPolicy ? <CheckCircle2 className="size-3.5" aria-hidden /> : <AlertTriangle className="size-3.5" aria-hidden />}
      {inPolicy ? "In policy" : reason ?? "Out of policy"}
      {!inPolicy && capMinor ? <span className="tabular-nums opacity-80">· cap {formatMoney(capMinor, "TZS", { showCurrency: false })}</span> : null}
    </span>
  );
}
