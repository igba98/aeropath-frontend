"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { Product } from "@/lib/domain/types";

/** Shared product multi-select used by the landing page builder (M01) and the home rails (M02). */
export function ProductPicker({ open, onOpenChange, products, selected, onSave, title = "Pick products for this rail" }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  products: Product[];
  selected: string[];
  onSave: (ids: string[]) => void;
  title?: string;
}) {
  const [q, setQ] = useState("");
  const [ids, setIds] = useState<string[]>(selected);
  const [synced, setSynced] = useState<string | null>(null);

  const key = `${open}:${selected.join(",")}`;
  if (open && synced !== key) {
    setSynced(key);
    setIds(selected);
  }

  const list = products
    .filter((p) => p.status === "live" || ids.includes(p.id))
    .filter((p) => !q || `${p.title} ${p.location.city} ${p.vertical}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => a.title.localeCompare(b.title));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Only live products can be merchandised, so a paused or archived product silently drops out of the rail.</DialogDescription>
        </DialogHeader>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, city or vertical" aria-label="Search products" />
        <ul className="max-h-[45vh] space-y-1 overflow-y-auto pr-1">
          {list.map((p) => (
            <li key={p.id}>
              <label className="flex cursor-pointer items-center gap-3 rounded-lg border p-2 text-sm hover:bg-muted/50">
                <Checkbox
                  checked={ids.includes(p.id)}
                  onCheckedChange={(v) => setIds((prev) => (v ? [...prev, p.id] : prev.filter((x) => x !== p.id)))}
                  aria-label={`Include ${p.title}`}
                />
                <span className={cn("size-8 shrink-0 rounded bg-gradient-to-br", p.media[0]?.tone)} aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{p.title}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{p.location.city} · {p.vertical} · {p.status}</span>
                </span>
              </label>
            </li>
          ))}
          {!list.length ? <li className="py-6 text-center text-sm text-muted-foreground">No products match that search.</li> : null}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onSave(ids)}><Check className="size-4" aria-hidden /> Use {ids.length} products</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
