"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useParams, usePathname, useSearchParams } from "next/navigation";

import { can } from "@/domain/permissions";
import { useCurrentUser } from "@/store";
import { WhenHydrated } from "@/components/layout/providers";
import { BrandMark } from "@/components/layout/brand";
import { Button } from "@/components/ui/button";
import { PrintMessage } from "@/components/print/print-shell";
import { InvoiceDoc } from "@/components/print/invoice-doc";
import { ReceiptDoc } from "@/components/print/receipt-doc";
import { ItineraryDoc } from "@/components/print/itinerary-doc";
import { StatementDoc } from "@/components/print/statement-doc";

/**
 * Print documents (spec §9.12): /print/{invoice|quote|receipt|itinerary|statement}/<id>, outside the app shell.
 * Reads the browser-held store; `?autoprint=1` opens the print dialog once rendered.
 * TODO(backend): signed PDF links — render server-side and share a signed URL instead of printing in the browser.
 */
export default function PrintPage() {
  return (
    <Suspense>
      <WhenHydrated fallback={<Loading />}>
        <PrintRouter />
      </WhenHydrated>
    </Suspense>
  );
}

function Loading() {
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas" aria-busy="true" aria-live="polite">
      <div className="flex flex-col items-center gap-3 text-[13px] text-ink-3">
        <BrandMark className="size-8 animate-pulse" />
        Preparing the document…
      </div>
    </div>
  );
}

function PrintRouter() {
  const { doc, id } = useParams<{ doc: string; id: string }>();
  const user = useCurrentUser();
  const pathname = usePathname();
  const sp = useSearchParams();

  if (!user) {
    const next = `${pathname}${sp.toString() ? `?${sp}` : ""}`;
    return (
      <PrintMessage
        title="Sign in to view documents"
        body="Documents are read from this browser’s back office data, so you need to be signed in here."
        action={
          <Button asChild>
            <Link href={`/login?next=${encodeURIComponent(next)}`}>Sign in</Link>
          </Button>
        }
      />
    );
  }
  if (!can(user, "document.print")) return <PrintMessage title="You can’t open documents" body="Ask your manager for access." />;

  switch (doc) {
    case "invoice":
    case "quote":
      return <InvoiceDoc id={id} kind={doc} />;
    case "receipt":
      return <ReceiptDoc id={id} />;
    case "itinerary":
      return <ItineraryDoc id={id} />;
    case "statement":
      return <StatementDoc id={id} />;
    default:
      return (
        <PrintMessage
          title="Unknown document"
          body="Documents are invoices, quotes, receipts, itineraries and statements."
          action={
            <Button variant="outline" asChild>
              <Link href="/">Back to the back office</Link>
            </Button>
          }
        />
      );
  }
}
