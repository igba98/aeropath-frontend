"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, MessageCircle, Printer } from "lucide-react";

import { useApp } from "@/store";
import { openWhatsApp } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * Print documents render on white paper whatever the app theme: the page drops the `dark` class while mounted
 * and restores it on leave, so what staff see is what the client receives.
 */
function useForceLight() {
  React.useLayoutEffect(() => {
    const html = document.documentElement;
    if (!html.classList.contains("dark")) return;
    const prev = html.style.colorScheme;
    html.classList.remove("dark");
    html.style.colorScheme = "light";
    return () => {
      html.classList.add("dark");
      html.style.colorScheme = prev;
    };
  }, []);
}

/**
 * A4 sheet with a slim non-printing toolbar: Back, Print / Save as PDF, Share on WhatsApp.
 * `?autoprint=1` opens the print dialog once the document has rendered.
 * TODO(backend): signed PDF links — share a hosted PDF instead of text once documents are stored server-side.
 */
export function PrintShell({
  title,
  backHref,
  share,
  children,
}: {
  /** Browser tab title; also the default file name for "Save as PDF". */
  title: string;
  backHref: string;
  share?: { phone?: string; text: string } | null;
  children: React.ReactNode;
}) {
  useForceLight();
  const router = useRouter();
  const sp = useSearchParams();
  const company = useApp((s) => s.db?.settings.company.name);
  const auto = sp.get("autoprint") === "1";
  const printed = React.useRef(false);

  React.useEffect(() => {
    document.title = company ? `${title} · ${company}` : title;
  }, [title, company]);

  React.useEffect(() => {
    if (!auto) return;
    const t = setTimeout(() => {
      if (printed.current) return;
      printed.current = true;
      const fonts = (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts;
      void (fonts?.ready ?? Promise.resolve()).then(() => {
        window.print();
        // Drop ?autoprint so a refresh does not print again.
        const url = new URL(window.location.href);
        url.searchParams.delete("autoprint");
        window.history.replaceState(window.history.state, "", url.toString());
      });
    }, 300);
    return () => clearTimeout(t);
  }, [auto]);

  const back = () => {
    if (window.history.length > 1) router.back();
    else router.push(backHref);
  };

  return (
    <div className="min-h-dvh bg-canvas print:bg-paper">
      <div className="no-print sticky top-0 z-10 border-b border-rule bg-paper">
        <div className="mx-auto flex max-w-[210mm] flex-wrap items-center gap-2 px-4 py-2 sm:px-0">
          <Button variant="ghost" size="sm" onClick={back}>
            <ArrowLeft /> Back
          </Button>
          <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-ink-3">{title}</span>
          {share && (
            <Button variant="outline" size="sm" onClick={() => openWhatsApp(share.phone, share.text)}>
              <MessageCircle /> Share on WhatsApp
            </Button>
          )}
          <Button size="sm" onClick={() => window.print()}>
            <Printer /> Print / Save as PDF
          </Button>
        </div>
      </div>
      <div className="px-0 py-0 sm:px-4 sm:py-8 print:p-0">{children}</div>
    </div>
  );
}

/** The A4 sheet itself: white paper, 14 mm margins on screen (the @page margin takes over in print). */
export function Paper({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <article
      className={cn(
        "relative mx-auto w-full max-w-[210mm] overflow-hidden bg-paper px-5 py-6 text-[12.5px] leading-[1.45] text-ink sm:min-h-[297mm] sm:border sm:border-rule sm:px-[14mm] sm:py-[14mm]",
        "print:min-h-0 print:max-w-none print:overflow-visible print:border-0 print:p-0",
        className,
      )}
    >
      {children}
    </article>
  );
}

/** Message shown instead of a document (not signed in, not found). */
export function PrintMessage({ title, body, action }: { title: string; body?: React.ReactNode; action?: React.ReactNode }) {
  useForceLight();
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas px-4">
      <div className="max-w-sm text-center">
        <p className="text-[15px] font-semibold text-ink">{title}</p>
        {body && <p className="mt-1 text-[13px] text-ink-3">{body}</p>}
        {action && <div className="mt-4">{action}</div>}
      </div>
    </div>
  );
}
