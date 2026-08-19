"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { productPhoto } from "@/lib/assets";
import type { Media } from "@/lib/domain/types";

/**
 * Product photography.
 *
 * A flat tint paints first so the layout never jumps and the card stays readable before the
 * photo arrives — the normal case on a slow connection. `slug` picks the mapped photo;
 * `index` walks a gallery. The scrim is only painted when something sits on top of the image,
 * because a permanent dark wash over every card is exactly the visual noise we are removing.
 */
export function ProductImage({
  media,
  slug,
  index = 0,
  alt,
  className,
  children,
  priority,
  rounded,
}: {
  media?: Media;
  /** Product slug or id — drives which photograph is shown. */
  slug?: string;
  index?: number;
  alt?: string;
  className?: string;
  children?: React.ReactNode;
  priority?: boolean;
  rounded?: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const photo = productPhoto(slug ?? media?.url, index);

  return (
    <div
      className={cn("relative isolate overflow-hidden bg-brand-50", rounded && "rounded-xl", className)}
      role={alt ? "img" : undefined}
      aria-label={alt || undefined}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- these assets are pre-optimised at
          build time by scripts/optimize-images.mjs into WebP at three widths and served with an
          explicit srcset/sizes. next/image would re-optimise them at runtime, which costs server
          work and a Node host for no gain on an already-static asset. */}
      <img
        src={photo.src}
        srcSet={photo.srcSet}
        sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
        alt=""
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        onLoad={() => setLoaded(true)}
        className={cn(
          "absolute inset-0 size-full object-cover transition-opacity duration-500",
          loaded ? "opacity-100" : "opacity-0",
        )}
      />
      {children ? (
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" aria-hidden />
      ) : null}
      {children}
    </div>
  );
}
