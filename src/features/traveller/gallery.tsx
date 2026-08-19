"use client";

import { useState } from "react";
import { Heart, Images, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ProductImage } from "@/components/shared/product-image";
import { useStore } from "@/lib/store";
import { wishlist } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Media } from "@/lib/domain/types";

export function Gallery({ media, title, productId }: { media: Media[]; title: string; productId: string }) {
  const [active, setActive] = useState(0);
  const saved = useStore((st) => (st.wishlists[st.session.userId ?? "guest"] ?? []).some((w) => w.productId === productId));

  return (
    <section aria-label="Photos">
      <div className="grid gap-2 overflow-hidden rounded-2xl sm:grid-cols-4 sm:grid-rows-2">
        <ProductImage slug={productId} index={active} priority alt={`${title} main photo`} className="h-64 sm:col-span-2 sm:row-span-2 sm:h-full" />
        {media.slice(1, 5).map((m, i) => (
          <button key={m.url} onClick={() => setActive(i + 1)} className="hidden sm:block" aria-label={`Show photo ${i + 2}`}>
            <ProductImage slug={productId} index={i + 1} alt="" className="h-full min-h-[7rem] w-full transition-opacity hover:opacity-90" />
          </button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5"><Images className="size-4" aria-hidden /> All {media.length} photos</Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl">
            <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
            <div className="grid max-h-[70vh] gap-2 overflow-y-auto sm:grid-cols-2">
              {media.map((m, i) => <ProductImage key={m.url} slug={productId} index={i} alt={m.alt} className="h-48 rounded-lg" />)}
            </div>
          </DialogContent>
        </Dialog>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => wishlist.toggle(productId)}
          aria-pressed={saved}
        >
          <Heart className={cn("size-4", saved && "fill-destructive text-destructive")} aria-hidden /> {saved ? "Saved" : "Save"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => { void navigator.clipboard?.writeText(window.location.href); toast.success("Link copied"); }}
        >
          <Share2 className="size-4" aria-hidden /> Share
        </Button>
      </div>
    </section>
  );
}
