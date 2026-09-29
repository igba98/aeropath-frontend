import Image from "next/image";
import { cn } from "@/lib/utils";

/** Aeropath logo: the round sky-blue badge with the "A", the plane and the wave (public/aeropathlogo.png). */
export function BrandMark({ className, priority }: { className?: string; priority?: boolean }) {
  return <Image src="/aeropathlogo.png" alt="" aria-hidden width={158} height={158} priority={priority} className={cn("size-6 shrink-0 rounded-full select-none", className)} draggable={false} />;
}

export function BrandWordmark({ className, sub = true }: { className?: string; sub?: boolean }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <BrandMark className="size-10" />
      <span className="flex flex-col leading-none">
        <span className="text-[15px] font-semibold tracking-[-0.01em] text-ink">Aeropath</span>
        {sub && <span className="mt-0.5 text-[11px] font-medium tracking-wide text-ink-3">Back office</span>}
      </span>
    </span>
  );
}
