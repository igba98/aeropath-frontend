"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Copy, ImageIcon, Star } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, StatTile } from "@/components/chrome/console-shell";
import { EmptyState } from "@/components/shared/empty-state";
import { ProductImage } from "@/components/shared/product-image";
import { Pill } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSession } from "@/hooks/use-session";
import { useStore } from "@/lib/store";
import type { Media, Vertical } from "@/lib/domain/types";
import { AccessDenied, Note, Section } from "@/features/backoffice/ui";

interface Asset {
  key: string;
  media: Media;
  productId: string;
  productTitle: string;
  supplierId: string;
  supplierName: string;
  vertical: Vertical;
  index: number;
}

/** M05 · Media library. Every asset in the catalogue in one grid, with the alt text on show. */
export default function MediaLibraryScreen() {
  const session = useSession();
  const products = useStore((s) => s.products);
  const organisations = useStore((s) => s.organisations);

  const [supplier, setSupplier] = useState("all");
  const [vertical, setVertical] = useState<"all" | Vertical>("all");
  const [q, setQ] = useState("");

  const assets = useMemo<Asset[]>(
    () =>
      Object.values(products).flatMap((p) =>
        p.media.map((m, i) => ({
          key: `${p.id}:${i}`,
          media: m,
          productId: p.id,
          productTitle: p.title,
          supplierId: p.supplierId,
          supplierName: organisations[p.supplierId]?.name ?? p.supplierId,
          vertical: p.vertical,
          index: i,
        })),
      ),
    [products, organisations],
  );

  const suppliers = useMemo(
    () => Array.from(new Set(assets.map((a) => a.supplierId))).map((id) => ({ id, name: organisations[id]?.name ?? id })).sort((a, b) => a.name.localeCompare(b.name)),
    [assets, organisations],
  );

  if (session.hydrated && !session.can("MEDIA:manage") && !session.can("CONTENT:edit")) {
    return <AccessDenied what="Media library" needs={`${session.roleLabel} has no MEDIA:manage permission. Sign in as a Content Editor, Platform Admin or Super Admin.`} />;
  }

  const filtered = assets.filter((a) => {
    if (supplier !== "all" && a.supplierId !== supplier) return false;
    if (vertical !== "all" && a.vertical !== vertical) return false;
    if (q && !`${a.productTitle} ${a.media.alt} ${a.supplierName}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const missingAlt = assets.filter((a) => !a.media.alt.trim()).length;
  const covers = assets.filter((a) => a.media.isCover).length;

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Asset URL copied", { description: url });
    } catch {
      toast.error("Clipboard blocked by the browser", { description: url });
    }
  }

  return (
    <div>
      <PageHeader
        title="Media library"
        code="M05"
        description="One shared asset store across every supplier and vertical. Alt text is shown on every tile because it is the accessibility contract, not an afterthought."
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Assets" value={assets.length} hint={`${Object.keys(products).length} products`} icon={ImageIcon} />
        <StatTile label="Cover images" value={covers} hint="One per product, used on search cards" icon={Star} />
        <StatTile label="Missing alt text" value={missingAlt} tone={missingAlt ? "danger" : "success"} hint="WCAG 1.1.1 — every image needs a text alternative" icon={AlertTriangle} />
        <StatTile label="Showing" value={filtered.length} hint="After filters" />
      </div>

      <Section
        title="Filters"
        actions={
          <>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search product or alt text" aria-label="Search assets" className="h-9 w-[220px]" />
            <Select value={supplier} onValueChange={setSupplier}>
              <SelectTrigger className="h-9 w-[220px]" aria-label="Filter by supplier"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All suppliers</SelectItem>
                {suppliers.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={vertical} onValueChange={(v) => setVertical(v as "all" | Vertical)}>
              <SelectTrigger className="h-9 w-[150px]" aria-label="Filter by vertical"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All verticals</SelectItem>
                <SelectItem value="stay">Stays</SelectItem>
                <SelectItem value="flight">Flights</SelectItem>
                <SelectItem value="tour">Tours</SelectItem>
                <SelectItem value="transfer">Transfers</SelectItem>
              </SelectContent>
            </Select>
          </>
        }
      >
        {!filtered.length ? (
          <EmptyState icon={ImageIcon} title="No assets match" description="Loosen the filters or clear the search." />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((a) => (
              <li key={a.key} className="overflow-hidden rounded-xl border bg-background">
                <ProductImage slug={a.productId} index={a.index} alt={a.media.alt} className="h-28 w-full">
                  {a.media.isCover ? (
                    <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium text-white">
                      <Star className="size-3" aria-hidden /> Cover
                    </span>
                  ) : null}
                </ProductImage>
                <div className="space-y-1.5 p-3">
                  <p className="truncate text-sm font-medium">{a.productTitle}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{a.supplierName} · {a.vertical}</p>
                  <p className="text-[11px]">
                    <span className="font-medium text-muted-foreground">Alt: </span>
                    {a.media.alt ? <span className="text-foreground">{a.media.alt}</span> : <span className="text-destructive">missing</span>}
                  </p>
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <Pill tone="neutral">#{a.index + 1}</Pill>
                    <Button variant="outline" size="sm" onClick={() => copy(a.media.url)}>
                      <Copy className="size-4" aria-hidden /> Copy URL
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <div className="mt-4">
        <Note title="Prototype note">
          Assets are gradient plates keyed to each product’s tone with the real photo layered on top when it loads, so the library works
          offline and the layout never jumps. Uploading is a supplier-side action in the product editor; this screen is the shared read
          surface and the accessibility audit.
        </Note>
      </div>
    </div>
  );
}
