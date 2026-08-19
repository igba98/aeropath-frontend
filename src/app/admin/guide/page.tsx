"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, BookOpen, MousePointerClick, Table2 } from "lucide-react";
import { PageHeader } from "@/components/chrome/console-shell";
import { Pill } from "@/components/shared/status-chip";
import { GUIDE } from "@/lib/guide";

/** The whole back-office guide on one page, so it can be read start to finish or searched in-browser. */
export default function GuidePage() {
  return (
    <>
      <PageHeader
        title="Using the back office"
        description="What each screen is for, what every control does, and what the table columns mean. Written for the people who work here, not for the people who built it."
      />

      {/* Contents */}
      <nav className="mb-8 rounded-xl border bg-card p-5" aria-label="Guide contents">
        <p className="text-sm font-medium text-muted-foreground">On this page</p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {GUIDE.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="flex items-center gap-2 rounded-lg px-3 py-2 text-[15px] transition-colors hover:bg-brand-50 hover:text-brand-text">
                <BookOpen className="size-4 text-brand-500" aria-hidden />
                {s.title}
                <span className="ml-auto text-sm text-muted-foreground">{s.entries.length}</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="space-y-10">
        {GUIDE.map((section) => (
          <section key={section.id} id={section.id} data-scroll-target>
            <h2 className="font-display text-2xl">{section.title}</h2>
            <p className="mt-1 max-w-3xl text-[15px] leading-relaxed text-muted-foreground">{section.blurb}</p>

            <div className="mt-4 space-y-4">
              {section.entries.map((e) => (
                <article key={e.href} className="overflow-hidden rounded-xl border bg-card">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-brand-100 bg-brand-50/60 px-5 py-4">
                    <div className="min-w-0">
                      <h3 className="font-display text-lg text-brand-text-strong">{e.title}</h3>
                      <p className="mt-0.5 max-w-2xl text-[15px] text-muted-foreground">{e.purpose}</p>
                    </div>
                    <Link
                      href={e.href}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-card px-3 py-2 text-sm font-medium text-brand-text transition-colors hover:bg-brand-100"
                    >
                      Open screen <ArrowRight className="size-4" aria-hidden />
                    </Link>
                  </div>

                  <div className="space-y-5 p-5">
                    {e.reading?.length ? (
                      <div>
                        <h4 className="text-sm font-medium text-muted-foreground">How to read it</h4>
                        <ul className="mt-2 space-y-1.5">
                          {e.reading.map((r) => (
                            <li key={r} className="flex gap-2.5 text-[15px] leading-relaxed">
                              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand-300" aria-hidden />
                              {r}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {e.actions?.length ? (
                      <div>
                        <h4 className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                          <MousePointerClick className="size-4" aria-hidden /> What the controls do
                        </h4>
                        <ul className="mt-2 space-y-2">
                          {e.actions.map((a) => (
                            <li key={a.label} className="rounded-lg border p-3">
                              <p className="flex flex-wrap items-center gap-2 font-medium">
                                {a.label}
                                {a.who ? <Pill tone="neutral">{a.who}</Pill> : null}
                              </p>
                              <p className="mt-0.5 text-[15px] leading-relaxed text-muted-foreground">{a.does}</p>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    {e.columns?.length ? (
                      <div>
                        <h4 className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
                          <Table2 className="size-4" aria-hidden /> What the columns mean
                        </h4>
                        <dl className="mt-2 divide-y rounded-lg border">
                          {e.columns.map((c) => (
                            <div key={c.header} className="grid gap-1 p-3 sm:grid-cols-[180px_1fr] sm:gap-4">
                              <dt className="font-medium">{c.header}</dt>
                              <dd className="text-[15px] leading-relaxed text-muted-foreground">{c.means}</dd>
                            </div>
                          ))}
                        </dl>
                      </div>
                    ) : null}

                    {e.watchOut?.length ? (
                      <div className="rounded-lg border border-warning/40 bg-warning/5 p-4">
                        <h4 className="flex items-center gap-1.5 text-sm font-medium text-warning-foreground">
                          <AlertTriangle className="size-4" aria-hidden /> Worth knowing
                        </h4>
                        <ul className="mt-2 space-y-1.5">
                          {e.watchOut.map((w) => (
                            <li key={w} className="text-[15px] leading-relaxed">{w}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
