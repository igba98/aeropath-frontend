"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, ArrowRight, BookOpen, HelpCircle, MousePointerClick, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Pill } from "@/components/shared/status-chip";
import { guideFor } from "@/lib/guide";

/**
 * Help for the screen you are actually on.
 *
 * Reading the route means the panel never has to be wired up per page, and can never drift out
 * of sync with the navigation. Screens with no entry yet say so plainly rather than opening
 * empty.
 */
export function HelpPanel() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const entry = guideFor(pathname);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="What does this screen do?" title="What does this screen do?">
          <HelpCircle className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader className="border-b border-brand-100 bg-brand-50/60 px-5 py-4">
          <SheetTitle className="font-display text-xl text-brand-text-strong">
            {entry ? entry.title : "About this screen"}
          </SheetTitle>
          {entry ? <p className="mt-0.5 text-[15px] leading-relaxed text-muted-foreground">{entry.purpose}</p> : null}
        </SheetHeader>

        <div className="space-y-5 px-5 py-5">
          {!entry ? (
            <p className="text-[15px] leading-relaxed text-muted-foreground">
              There is no written guide for this screen yet. The full back-office guide covers the main ones.
            </p>
          ) : null}

          {entry?.reading?.length ? (
            <section>
              <h3 className="text-sm font-medium text-muted-foreground">How to read it</h3>
              <ul className="mt-2 space-y-1.5">
                {entry.reading.map((r) => (
                  <li key={r} className="flex gap-2.5 text-[15px] leading-relaxed">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand-300" aria-hidden />
                    {r}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {entry?.actions?.length ? (
            <section>
              <h3 className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                <MousePointerClick className="size-4" aria-hidden /> What the controls do
              </h3>
              <ul className="mt-2 space-y-2">
                {entry.actions.map((a) => (
                  <li key={a.label} className="rounded-lg border p-3">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {a.label}
                      {a.who ? <Pill tone="neutral">{a.who}</Pill> : null}
                    </p>
                    <p className="mt-0.5 text-[15px] leading-relaxed text-muted-foreground">{a.does}</p>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {entry?.columns?.length ? (
            <section>
              <h3 className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                <Table2 className="size-4" aria-hidden /> What the columns mean
              </h3>
              <dl className="mt-2 divide-y rounded-lg border">
                {entry.columns.map((c) => (
                  <div key={c.header} className="p-3">
                    <dt className="font-medium">{c.header}</dt>
                    <dd className="mt-0.5 text-[15px] leading-relaxed text-muted-foreground">{c.means}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          {entry?.watchOut?.length ? (
            <section className="rounded-lg border border-warning/40 bg-warning/5 p-4">
              <h3 className="flex items-center gap-1.5 text-sm font-medium text-warning-foreground">
                <AlertTriangle className="size-4" aria-hidden /> Worth knowing
              </h3>
              <ul className="mt-2 space-y-1.5">
                {entry.watchOut.map((w) => <li key={w} className="text-[15px] leading-relaxed">{w}</li>)}
              </ul>
            </section>
          ) : null}

          <Button asChild variant="outline" className="w-full gap-2" onClick={() => setOpen(false)}>
            <Link href="/admin/guide">
              <BookOpen className="size-4" aria-hidden /> Read the full guide <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
