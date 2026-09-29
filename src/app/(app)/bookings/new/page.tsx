"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { BedDouble, ClipboardPaste, Pencil, Plus, Trash2, Van } from "lucide-react";

import type { Currency, ID, Money } from "@/domain/types";
import { createBookingFile, issueQuote } from "@/domain/commands";
import { convert, format } from "@/domain/money";
import { getDb, useApp, useDispatch } from "@/store";
import { useModals } from "@/store/modals";
import { commitLineDraft, type LineDraft } from "@/lib/commit-line";
import { firstName, openWhatsApp } from "@/lib/whatsapp";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Amount } from "@/components/shared/amount";
import { LINE_ICON, LINE_LABEL, Route } from "@/components/shared/bits";
import { Banner, Field } from "@/components/shared/field";
import { PageHeader } from "@/components/shared/page";
import { StatusChip } from "@/components/shared/status-chip";
import { useSaveClient, validateClientDraft } from "@/components/clients/client-form";
import { LineDrawer } from "@/components/bookings/line-drawer";
import { StepClient, FILE_SOURCES, type ClientStepValue } from "@/components/bookings/wizard/step-client";
import type { PnrPasteValue } from "@/components/bookings/pnr-paste";

type Step = 1 | 2 | 3;

export default function NewBookingPage() {
  return (
    <Suspense>
      <Wizard />
    </Suspense>
  );
}

function Wizard() {
  const router = useRouter();
  const sp = useSearchParams();
  const db = useApp((s) => s.db)!;
  const dispatch = useDispatch();
  const saveClient = useSaveClient();
  const openPayment = useModals((s) => s.openPayment);
  const settings = db.settings;

  const presetClient = sp.get("client") ?? undefined;
  const pasteFirst = sp.get("paste") === "1";
  const [step, setStep] = React.useState<Step>(1);
  const [c, setC] = React.useState<ClientStepValue>(() => {
    const cl = presetClient ? db.clients[presetClient] : undefined;
    return {
      clientId: cl?.id,
      travellerIds: cl ? Object.values(db.travellers).filter((t) => t.clientId === cl.id).slice(0, 4).map((t) => t.id) : [],
      currency: cl?.defaultCurrency ?? "USD",
      source: cl?.type === "corporate" ? "corporate" : "walk_in",
    };
  });
  const [clientErrors, setClientErrors] = React.useState<Record<string, string>>({});
  const [drafts, setDrafts] = React.useState<LineDraft[]>([]);
  const [drawer, setDrawer] = React.useState<{ open: boolean; type?: LineDraft["type"]; draft?: LineDraft; pnr?: PnrPasteValue }>({ open: false });
  const [title, setTitle] = React.useState("");
  const [deposit, setDeposit] = React.useState(true);
  const [busy, setBusy] = React.useState(false);

  const client = c.clientId ? db.clients[c.clientId] : undefined;
  const travellers = client ? Object.values(db.travellers).filter((t) => t.clientId === client.id) : [];
  const toFile = (m: Money): Money => convert(m, c.currency, settings.fx.USD_TZS);
  const totals = React.useMemo(() => {
    const z = (): Money => ({ amountMinor: 0, currency: c.currency });
    const acc = { cost: z(), markup: z(), serviceFee: z(), vat: z(), sell: z(), margin: z() };
    for (const d of drafts) {
      for (const k of ["cost", "markup", "serviceFee", "vat", "sell", "margin"] as const) {
        acc[k] = { amountMinor: acc[k].amountMinor + toFile(d.summary[k]).amountMinor, currency: c.currency };
      }
    }
    return acc;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drafts, c.currency, settings.fx.USD_TZS]);

  const flightDraft = drafts.find((d) => d.type === "flight");
  const route = React.useMemo(
    () =>
      flightDraft
        ? flightDraft.pnr
          ? routeFromSegments(flightDraft.pnr.snapshot.segments)
          : routeFromSegments((flightDraft.details as { segments: { origin: string; destination: string; departureLocal: string }[] }).segments)
        : [],
    [flightDraft],
  );
  const suggestedTitle = React.useMemo(() => {
    const who = client?.type === "corporate" ? client.name : client ? `${client.name.split(" ").slice(-1)[0]} ${travellers.length > 1 || c.travellerIds.length > 1 ? "family" : ""}`.trim() : "";
    const where = route.length ? `${route[0]} → ${route[route.length - 1] === route[0] && route.length > 2 ? route[Math.floor(route.length / 2)] : route[route.length - 1]}` : drafts[0]?.summary.description.split(" · ")[0] ?? "";
    return [where, who].filter(Boolean).join(" · ") || client?.name || "";
  }, [client, route, drafts, travellers.length, c.travellerIds.length]);

  /** Confirm step 1: create the inline client if needed. Returns the client id. */
  const ensureClient = (): ID | null => {
    if (c.clientId) return c.clientId;
    if (!c.newClient) {
      setClientErrors({ client: "Pick a client or create a new one." });
      return null;
    }
    const er = validateClientDraft(c.newClient);
    setClientErrors(er);
    if (Object.keys(er).length) return null;
    const id = saveClient(c.newClient);
    if (!id) return null;
    setC((v) => ({ ...v, clientId: id, newClient: undefined }));
    return id;
  };

  const continueFromClient = () => {
    const id = ensureClient();
    if (!id) return;
    setStep(2);
    if (c.pnr?.snapshot && !drafts.some((d) => d.pnr)) setDrawer({ open: true, type: "flight", pnr: c.pnr });
    else if (pasteFirst && !drafts.length) setDrawer({ open: true, type: "flight" });
  };

  const create = (mode: "draft" | "booking" | "quote") => {
    const clientId = ensureClient();
    if (!clientId) {
      setStep(1);
      return;
    }
    setBusy(true);
    const r = dispatch(
      createBookingFile,
      { clientId, title: (title || suggestedTitle || undefined)?.trim(), currency: c.currency, source: c.source, travellerIds: c.travellerIds },
      { toast: false },
    );
    if (!r.ok) {
      setBusy(false);
      return;
    }
    const { fileId, number } = r.result as { fileId: ID; number: string };
    let failed = 0;
    for (const d of drafts) if (!commitLineDraft(dispatch, getDb, fileId, d, { quiet: true })) failed++;
    let quote: { invoiceId: ID; number: string } | null = null;
    if (mode === "quote" && drafts.length) {
      const q = dispatch(issueQuote, { fileId }, { toast: false });
      if (q.ok) quote = q.result as { invoiceId: ID; number: string };
    }
    const cl = getDb().clients[clientId];
    if (quote) {
      toast.success(`${number} created · quote ${quote.number} issued`, {
        duration: 10000,
        action: { label: "Print quote", onClick: () => window.open(`/print/quote/${quote!.invoiceId}?autoprint=1`, "_blank") },
        cancel: {
          label: "WhatsApp",
          onClick: () => openWhatsApp(cl?.phone, `Hello ${firstName(cl?.contactPerson || cl?.name || "")}, here is your quote ${quote!.number} for ${title || suggestedTitle}: ${format(totals.sell)}. Prices are subject to availability until ticketed. — Aeropath Travel`),
        },
      });
    } else {
      toast.success(`${number} created${drafts.length ? ` with ${drafts.length} service${drafts.length === 1 ? "" : "s"}` : ""}`);
    }
    if (failed) toast.error(`${failed} service${failed === 1 ? "" : "s"} couldn't be added; the reason is shown above. Add ${failed === 1 ? "it" : "them"} from the booking.`);
    router.push(`/bookings/${fileId}`);
    if (mode === "booking" && deposit && drafts.length) setTimeout(() => openPayment({ fileId, clientId }), 250);
  };

  const canSaveDraft = Boolean(c.clientId || c.newClient);

  return (
    <div className="mx-auto max-w-[1100px]">
      <PageHeader
        title="New booking"
        back={{ href: "/bookings", label: "Bookings" }}
        meta={<span>Three quick steps. Nothing is final until you create it; save as draft any time.</span>}
        actions={
          <Button variant="outline" onClick={() => create("draft")} disabled={!canSaveDraft || busy}>
            Save as draft
          </Button>
        }
      />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <ol className="min-w-0 space-y-3">
          <StepShell
            n={1}
            title="Client and travellers"
            current={step}
            onEdit={() => setStep(1)}
            summary={
              <>
                <span className="font-medium text-ink">{client?.name ?? c.newClient?.name ?? "—"}</span>
                <span>· {c.travellerIds.length} traveller{c.travellerIds.length === 1 ? "" : "s"}</span>
                <span>· {c.currency}</span>
                <span>· {FILE_SOURCES.find((s) => s.value === c.source)?.label}</span>
              </>
            }
          >
            <StepClient value={c} onChange={setC} autoPaste={pasteFirst} errors={clientErrors} />
            <div className="mt-5 flex justify-end">
              <Button onClick={continueFromClient}>Continue to services</Button>
            </div>
          </StepShell>

          <StepShell
            n={2}
            title="Services"
            current={step}
            onEdit={() => setStep(2)}
            summary={
              <>
                <span className="font-medium text-ink">
                  {drafts.length} service{drafts.length === 1 ? "" : "s"}
                </span>
                {route.length > 0 && <Route codes={route} size="sm" />}
                <span>· sells for</span>
                <Amount value={totals.sell} className="text-ink" />
              </>
            }
          >
            <div className="space-y-4">
              <div className="grid gap-2 sm:grid-cols-[1.4fr_1fr_1fr_1fr]">
                <button
                  type="button"
                  onClick={() => setDrawer({ open: true, type: "flight" })}
                  className="flex items-center gap-3 rounded-lg border border-primary bg-primary px-3.5 py-3 text-left text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
                >
                  <ClipboardPaste className="size-5 shrink-0" />
                  <span>
                    <span className="block text-sm font-semibold">Add flight</span>
                    <span className="block text-xs opacity-75">Paste PNR, fetch or type</span>
                  </span>
                </button>
                {(
                  [
                    ["hotel", BedDouble],
                    ["transfer", Van],
                  ] as const
                ).map(([t, I]) => (
                  <button key={t} type="button" onClick={() => setDrawer({ open: true, type: t })} className="flex items-center gap-2.5 rounded-lg border border-rule-2 px-3.5 py-3 text-sm font-medium text-ink-2 transition-colors hover:border-ink-4/50 hover:text-ink">
                    <I className="size-4" /> Add {LINE_LABEL[t].toLowerCase()}
                  </button>
                ))}
                <button type="button" onClick={() => setDrawer({ open: true, type: "other" })} className="flex items-center gap-2.5 rounded-lg border border-rule-2 px-3.5 py-3 text-sm font-medium text-ink-2 transition-colors hover:border-ink-4/50 hover:text-ink">
                  <Plus className="size-4" /> Other service
                </button>
              </div>

              {drafts.length > 0 ? (
                <Table className="min-w-[520px]">
                  <TableHeader>
                    <TableRow className="rule-head border-0">
                      <TableHead className="h-auto px-0 pb-2 first:pl-0">Service</TableHead>
                      <TableHead className="h-auto px-0 pb-2 whitespace-normal">Status on save</TableHead>
                      <TableHead className="h-auto px-0 pb-2 text-right">Sell</TableHead>
                      <TableHead className="h-auto px-0 pb-2 last:pr-0" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {drafts.map((d) => {
                      const I = LINE_ICON[d.type];
                      const willBook = d.pnr ? d.pnr.snapshot.segments.some((s) => ["HK", "KK", "TK"].includes(s.statusCode)) : d.status === "booked";
                      return (
                        <TableRow key={d.key}>
                          <TableCell className="px-0 py-2.5 first:pl-0">
                            <span className="flex items-center gap-2.5">
                              <I className="size-4 shrink-0 text-ink-3" />
                              <span className="min-w-0">
                                <span className="block truncate text-ink">{d.summary.description}</span>
                                <span className="block text-xs text-ink-3">
                                  {LINE_LABEL[d.type]}
                                  {d.pnr ? ` · ${d.pnr.fetched ? "fetched" : "pasted"} PNR ${d.pnr.snapshot.recordLocator}` : ""}
                                </span>
                              </span>
                            </span>
                          </TableCell>
                          <TableCell className="px-0 py-2.5">
                            <StatusChip status={willBook ? "line.booked" : "line.quoted"} size="xs" />
                          </TableCell>
                          <TableCell className="px-0 py-2.5 text-right">
                            <Amount value={d.summary.sell} />
                            {d.summary.sell.currency !== c.currency && <span className="block text-xs text-ink-3">≈ {format(toFile(d.summary.sell))}</span>}
                          </TableCell>
                          <TableCell className="px-0 py-2.5 text-right whitespace-nowrap last:pr-0">
                            <Button variant="ghost" size="icon-sm" onClick={() => setDrawer({ open: true, draft: d })} aria-label="Edit service">
                              <Pencil />
                            </Button>
                            <Button variant="ghost" size="icon-sm" onClick={() => setDrafts((x) => x.filter((y) => y.key !== d.key))} aria-label="Remove service">
                              <Trash2 />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              ) : (
                <p className="rounded-lg border border-dashed border-rule-2 px-4 py-6 text-center text-sm text-ink-3">No services yet. Start with the flight: paste the PNR from the Amadeus terminal.</p>
              )}

              <div className="flex flex-wrap justify-between gap-2">
                <Button variant="ghost" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button onClick={() => setStep(3)} disabled={!drafts.length}>
                  Continue to review
                </Button>
              </div>
            </div>
          </StepShell>

          <StepShell n={3} title="Review and create" current={step} onEdit={() => setStep(3)}>
            <div className="space-y-5">
              <Field label="Booking title" htmlFor="bk-title" hint="Shown on the bookings list and documents.">
                <Input id="bk-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={suggestedTitle} />
              </Field>
              <dl className="grid gap-x-6 text-sm sm:grid-cols-2">
                {[
                  ["Client", client?.name ?? c.newClient?.name],
                  ["Travellers", c.travellerIds.map((id) => db.travellers[id]).filter(Boolean).map((t) => `${t.givenName} ${t.surname}`).join(", ") || (drafts.some((d) => d.pnr) ? "From the PNR" : "None yet")],
                  ["Invoice currency", c.currency],
                  ["Source", FILE_SOURCES.find((s) => s.value === c.source)?.label],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 border-b border-rule py-2">
                    <dt className="text-ink-3">{k}</dt>
                    <dd className="text-right text-ink">{v}</dd>
                  </div>
                ))}
              </dl>
              {drafts.some((d) => d.summary.sell.currency !== c.currency) && (
                <Banner tone="info">
                  Some services are priced in another currency. They convert into {c.currency} at 1 USD = TZS {settings.fx.USD_TZS.toLocaleString("en-US")}; the rate is saved on each line.
                </Banner>
              )}
              <label className="flex items-start gap-2.5 text-sm">
                <Checkbox checked={deposit} onCheckedChange={(v) => setDeposit(v === true)} className="mt-0.5" />
                <span>
                  <span className="font-medium text-ink">Record a deposit right after creating</span>
                  <span className="block text-[13px] text-ink-3">Opens the payment form for this booking.</span>
                </span>
              </label>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-rule pt-4">
                <Button variant="ghost" onClick={() => setStep(2)}>
                  Back
                </Button>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => create("quote")} loading={busy}>
                    Create quote
                  </Button>
                  <Button onClick={() => create("booking")} loading={busy}>
                    Create booking
                  </Button>
                </div>
              </div>
            </div>
          </StepShell>
        </ol>

        <RunningTotal totals={totals} currency={c.currency} count={drafts.length} rate={settings.fx.USD_TZS} />
      </div>

      {client && (
        <LineDrawer
          key={drawer.draft?.key ?? drawer.type ?? "new"}
          open={drawer.open}
          onOpenChange={(o) => setDrawer((d) => ({ ...d, open: o }))}
          clientId={client.id}
          fileCurrency={c.currency}
          travellers={travellers}
          defaultTravellerIds={c.travellerIds}
          initialType={drawer.type}
          initialDraft={drawer.draft}
          initialPnr={drawer.pnr}
          dates={datesFromDrafts(drafts)}
          onDraft={(d) => {
            setDrafts((x) => (x.some((y) => y.key === d.key) ? x.map((y) => (y.key === d.key ? d : y)) : [...x, d]));
            if (d.pnr) setC((v) => ({ ...v, pnr: undefined }));
          }}
        />
      )}
    </div>
  );
}

function StepShell({ n, title, current, onEdit, summary, children }: { n: Step; title: string; current: Step; onEdit: () => void; summary?: React.ReactNode; children: React.ReactNode }) {
  const done = current > n;
  const active = current === n;
  return (
    <li className={cn("rounded-xl border bg-card", active ? "border-rule-2 shadow-card" : "border-rule")}>
      <div className={cn("flex items-center gap-3 px-4", active ? "border-b border-rule py-3" : "py-2.5")}>
        <span
          className={cn(
            "grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold",
            done ? "bg-[var(--st-green-bg)] text-[var(--st-green-fg)]" : active ? "bg-primary text-primary-foreground" : "bg-canvas-2 text-ink-3",
          )}
        >
          {n}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className={cn("text-[15px] font-semibold", active || done ? "text-ink" : "text-ink-3")}>{title}</h2>
          {done && summary && <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[13px] text-ink-3">{summary}</div>}
        </div>
        {done && (
          <Button variant="ghost" size="sm" onClick={onEdit}>
            Change
          </Button>
        )}
      </div>
      {active && <div className="p-4 sm:p-5">{children}</div>}
    </li>
  );
}

function RunningTotal({ totals, currency, count, rate }: { totals: Record<"cost" | "markup" | "serviceFee" | "vat" | "sell" | "margin", Money>; currency: Currency; count: number; rate: number }) {
  return (
    <aside className="lg:sticky lg:top-[68px] lg:self-start">
      <section className="rounded-lg border border-rule bg-paper">
        <div className="border-b border-rule px-4 pt-3.5 pb-3">
          <div className="col-head">Running total · {count} service{count === 1 ? "" : "s"}</div>
          <Amount value={totals.sell} size="xl" className="mt-1" />
        </div>
        <dl className="px-4 py-2 text-sm">
          {(
            [
              ["Cost", totals.cost],
              ["Markup", totals.markup],
              ["Service fees", totals.serviceFee],
              ["VAT", totals.vat],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="flex justify-between py-1.5">
              <dt className="text-ink-3">{k}</dt>
              <dd>
                <Amount value={v} className="text-ink-2" />
              </dd>
            </div>
          ))}
          <div className="flex justify-between border-t-[3px] border-double border-rule-strong py-1.5 font-semibold">
            <dt>Sell</dt>
            <dd>
              <Amount value={totals.sell} />
            </dd>
          </div>
          <div className="flex justify-between border-t border-rule py-2">
            <dt className="text-ink-3">Margin</dt>
            <dd>
              <Amount value={totals.margin} tone="auto" className="font-medium" />
            </dd>
          </div>
        </dl>
        <p className="border-t border-rule px-4 py-2 text-xs text-ink-3">
          In {currency}; other currencies at 1 USD = TZS {rate.toLocaleString("en-US")}.
        </p>
      </section>
    </aside>
  );
}

function routeFromSegments(segs: { origin: string; destination: string; departureLocal: string }[]): string[] {
  const s = [...segs].filter((x) => x.origin && x.destination).sort((a, b) => a.departureLocal.localeCompare(b.departureLocal));
  if (!s.length) return [];
  const out = [s[0].origin];
  for (const x of s) {
    if (out[out.length - 1] !== x.origin) out.push(x.origin);
    out.push(x.destination);
  }
  return out;
}

function datesFromDrafts(drafts: LineDraft[]): { start?: string; end?: string } {
  const ds: string[] = [];
  for (const d of drafts) {
    if (d.type === "flight") {
      const segs = d.pnr ? d.pnr.snapshot.segments : (d.details as { segments: { departureLocal: string; arrivalLocal: string }[] }).segments;
      for (const s of segs) {
        if (s.departureLocal) ds.push(s.departureLocal.slice(0, 10));
        if (s.arrivalLocal) ds.push(s.arrivalLocal.slice(0, 10));
      }
    }
  }
  ds.sort();
  return { start: ds[0], end: ds[ds.length - 1] };
}
