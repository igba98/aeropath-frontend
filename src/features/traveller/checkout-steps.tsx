"use client";

import { usePathname } from "next/navigation";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { href: "/cart", label: "Trip", code: "T10" },
  { href: "/travellers", label: "Travellers", code: "T11" },
  { href: "/extras", label: "Extras", code: "T12" },
  { href: "/review", label: "Review", code: "T13" },
  { href: "/payment", label: "Payment", code: "T14" },
];

export function CheckoutSteps() {
  const pathname = usePathname();
  const current = STEPS.findIndex((s) => pathname.startsWith(s.href));
  const index = pathname.startsWith("/pending") || pathname.startsWith("/confirmation") ? STEPS.length : current;

  return (
    <ol className="no-scrollbar mb-6 flex items-center gap-1 overflow-x-auto text-sm" aria-label="Checkout progress">
      {STEPS.map((s, i) => {
        const done = i < index;
        const active = i === index;
        return (
          <li key={s.href} className="flex shrink-0 items-center gap-1">
            <span
              className={cn(
                "flex items-center gap-2 rounded-full px-3 py-1.5",
                active ? "bg-brand-50 font-medium text-brand-text-strong ring-1 ring-brand-300" : done ? "text-success-foreground" : "text-muted-foreground",
              )}
              aria-current={active ? "step" : undefined}
            >
              <span className={cn("flex size-5 items-center justify-center rounded-full text-[11px] font-semibold", done ? "bg-success text-white" : active ? "bg-brand-500 text-white" : "bg-muted")}>
                {done ? <Check className="size-3" aria-hidden /> : i + 1}
              </span>
              {s.label}
            </span>
            {i < STEPS.length - 1 ? <span className={cn("h-px w-4 shrink-0", done ? "bg-success" : "bg-border")} aria-hidden /> : null}
          </li>
        );
      })}
    </ol>
  );
}
