import Link from "next/link";
import { cn } from "@/lib/utils";

/** `inverted` places the mark on a dark surface, such as the console rail. */
export function Logo({ className, href = "/", subtitle, inverted }: { className?: string; href?: string; subtitle?: string; inverted?: boolean }) {
  return (
    <Link href={href} className={cn("group inline-flex items-center gap-2.5", className)}>
      <span className={cn("relative flex size-8 items-center justify-center rounded-lg shadow-sm", inverted ? "bg-white" : "bg-brand-500")}>
        <svg viewBox="0 0 24 24" className={cn("size-4.5", inverted ? "text-brand-600" : "text-white")} fill="none" aria-hidden>
          <path d="M2.5 14.5 21 5l-4.2 9.2a3 3 0 0 1-1.6 1.5L4.8 20l1.9-4.4-4.2-1.1Z" fill="currentColor" opacity="0.95" />
          <path d="M6.7 15.6 21 5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" opacity="0.4" />
        </svg>
      </span>
      <span className="flex flex-col leading-none">
        <span className={cn("font-display text-[19px] tracking-tight", inverted && "text-white")}>Aeropath</span>
        {subtitle ? <span className={cn("mt-0.5 text-[10px] font-medium uppercase tracking-[0.14em]", inverted ? "text-white/50" : "text-muted-foreground")}>{subtitle}</span> : null}
      </span>
    </Link>
  );
}
