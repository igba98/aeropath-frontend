"use client";

import { useState } from "react";
import { Plane } from "lucide-react";
import { cn } from "@/lib/utils";
import { airlineLogo } from "@/lib/assets";

/**
 * An airline's mark, falling back to the carrier name when we have no artwork for them —
 * a missing logo should never leave a blank space where the operator's identity belongs.
 */
export function AirlineLogo({
  carrier,
  code,
  className,
  size = "md",
  showName = false,
}: {
  carrier?: string;
  code?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
  showName?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const src = airlineLogo(carrier) ?? airlineLogo(code);
  const box = size === "sm" ? "h-5" : size === "lg" ? "h-9" : "h-7";

  if (!src || failed) {
    return (
      <span className={cn("inline-flex items-center gap-2", className)}>
        <span className={cn("flex aspect-square items-center justify-center rounded-lg bg-brand-50 text-brand-text", box)}>
          <Plane className="size-3.5" aria-hidden />
        </span>
        {carrier ? <span className="text-sm font-medium">{carrier}</span> : null}
      </span>
    );
  }

  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      {/* eslint-disable-next-line @next/next/no-img-element -- these assets are pre-optimised at
          build time by scripts/optimize-images.mjs into WebP at three widths and served with an
          explicit srcset/sizes. next/image would re-optimise them at runtime, which costs server
          work and a Node host for no gain on an already-static asset. */}
      <img
        src={src}
        alt={carrier ? `${carrier} logo` : "Airline logo"}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className={cn("w-auto max-w-28 object-contain", box)}
      />
      {showName && carrier ? <span className="text-sm font-medium">{carrier}</span> : null}
    </span>
  );
}
