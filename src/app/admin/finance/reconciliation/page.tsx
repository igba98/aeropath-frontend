"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, RadioTower, Receipt, Search, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, StatTile } from "@/components/chrome/console-shell";
import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { MoneyText } from "@/components/shared/money-text";
import { Pill, StatusChip } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSession } from "@/hooks/use-session";
import { getData, useStore } from "@/lib/store";
import { checkout, RAIL_LABELS } from "@/lib/api";
import { formatDateTime, relativeTime } from "@/lib/format";
import type { Payment, PaymentRail } from "@/lib/domain/types";
import { AccessDenied, Field, KeyValue, Note, Section } from "@/features/backoffice/ui";

const accountFor = (rail: PaymentRail) => `cash.${rail}`;

interface ProviderResult {
  found: boolean;
  providerReference?: string;
  amountMinor?: number;
  phone?: string;
  settledAt?: string;
}

/** F02 · Payment reconciliation. The reconciler, not the callback, is the source of truth. */
export default function ReconciliationScreen() {
  const session = useSession();
  const payments = useStore((s) => s.payments);
  const bookings = useStore((s) => s.bookings);
  const ledger = useStore((s) => s.ledger);

  const [openId, setOpenId] = useState<string | null>(null);
  const [querying, setQuerying] = useState(false);
  const [result, setResult] = useState<ProviderResult | null>(null);
  const [manualRef, setManualRef] = useState("");

  const list = useMemo(() => Object.values(payments), [payments]);
  const mismatches = list.filter((p) => p.status === "reconciliation_pending" || p.status === "pending");
  const matched = list.filter((p) => p.reconciledBy).sort((a, b) => (b.reconciledAt ?? b.updatedAt).localeCompare(a.reconciledAt ?? a.updatedAt));

  const settlements = useMemo(() => {
    const rails = Array.from(new Set(list.map((p) => p.rail)));
    return rails.map((rail) => {
      const succeeded = list.filter((p) => p.rail === rail && p.status === "succeeded");
      const gatewayMinor = succeeded.reduce((s, p) => s + p.amountMinor, 0);
      const account = accountFor(rail);
      const ledgerIn = ledger.filter((e) => e.account === account).reduce((s, e) => s + e.debitMinor, 0);
      const ledgerOut = ledger.filter((e) => e.account === account).reduce((s, e) => s + e.creditMinor, 0);
      return { rail, account, count: succeeded.length, gatewayMinor, ledgerIn, ledgerOut, diff: gatewayMinor - ledgerIn };
    }).sort((a, b) => b.gatewayMinor - a.gatewayMinor);
  }, [list, ledger]);

  const open = openId ? payments[openId] : undefined;
  const openBooking = open ? bookings[open.bookingId] : undefined;

  // Until the persisted store has hydrated the server and client disagree on relative times,
  // so render the skeleton in both passes — the convention every other console screen follows.
  if (!session.hydrated) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;

  if (session.hydrated && !session.can("PAYMENT:reconcile") && !session.can("FINANCE:view") && !session.can("LEDGER:view")) {
    return <AccessDenied what="Payment reconciliation" needs={`${session.roleLabel} has no PAYMENT:reconcile permission. Sign in as an Operations Officer, Finance Officer or Finance Manager.`} />;
  }

  const canReconcile = !session.hydrated || session.can("PAYMENT:reconcile");

  function openPayment(p: Payment) {
    setOpenId(p.id);
    setResult(null);
    setQuerying(false);
    setManualRef(p.customerReference ?? "");
  }

  function queryProvider() {
    if (!open) return;
    setQuerying(true);
    setResult(null);
    const ref = manualRef.trim() || open.customerReference || "";
    window.setTimeout(() => {
      setQuerying(false);
      if (!ref) {
        setResult({ found: false });
        return;
      }
      // The provider is queried by the reference the customer gave us. In the prototype a
      // reference that matches the one on the payment resolves; anything else does not.
      const hit = ref.toUpperCase() === (open.customerReference ?? "").toUpperCase();
      setResult(
        hit
          ? { found: true, providerReference: ref.toUpperCase(), amountMinor: open.amountMinor, phone: open.phone, settledAt: open.createdAt }
          : { found: false },
      );
    }, 700);
  }

  function match() {
    if (!open) return;
    const ref = result?.providerReference ?? manualRef.trim().toUpperCase();
    checkout.reconcile(open.id, true, ref);
    const after = getData();
    const b = after.bookings[open.bookingId];
    setOpenId(null);
    toast.success(`Matched ${ref}`, { description: `${b.reference} is now ${b.paymentStatus} · booking ${b.status}. Supplier confirmation requested.` });
  }

  function notFound() {
    if (!open) return;
    const ref = openBooking?.reference ?? open.id;
    checkout.reconcile(open.id, false);
    setOpenId(null);
    toast.warning(`Marked not found · ${ref}`, { description: "Hold released, customer notified that any debit will be reversed by the provider." });
  }

  const columns: Column<Payment>[] = [
    {
      key: "booking",
      header: "Booking",
      render: (p) => (
        <div>
          <p className="font-mono text-sm font-medium">{bookings[p.bookingId]?.reference ?? p.bookingId}</p>
          <p className="text-[11px] text-muted-foreground">{bookings[p.bookingId]?.leadTraveller ? `${bookings[p.bookingId]?.leadTraveller?.firstName} ${bookings[p.bookingId]?.leadTraveller?.lastName}` : "—"}</p>
        </div>
      ),
    },
    { key: "rail", header: "Rail", render: (p) => <span className="text-sm">{RAIL_LABELS[p.rail]}</span> },
    { key: "amount", header: "Amount", numeric: true, render: (p) => <MoneyText minor={p.amountMinor} currency={p.currency} size="sm" /> },
    {
      key: "ref",
      header: "Customer reference",
      render: (p) => (p.customerReference ? <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{p.customerReference}</code> : <span className="text-xs text-muted-foreground">none given</span>),
    },
    { key: "age", header: "Waiting", render: (p) => <span className="text-xs text-muted-foreground">{relativeTime(p.createdAt)}</span> },
    { key: "status", header: "Status", render: (p) => <Pill tone={p.status === "reconciliation_pending" ? "warning" : "neutral"} icon={AlertTriangle}>{p.status.replace("_", " ")}</Pill> },
    {
      key: "action",
      header: "",
      render: (p) => (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => openPayment(p)} disabled={!canReconcile}><Search className="size-4" aria-hidden /> Investigate</Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Payment reconciliation"
        code="F02"
        description="Gateway settlements against the ledger, plus every payment where money may have moved without a callback."
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Mismatch queue" value={mismatches.length} tone={mismatches.length ? "warning" : "success"} hint="Payments with no confirmed settlement" icon={AlertTriangle} />
        <StatTile label="Value in flight" value={<MoneyText minor={mismatches.reduce((s, p) => s + p.amountMinor, 0)} compact />} hint="Customer money we cannot yet see" />
        <StatTile label="Settled payments" value={list.filter((p) => p.status === "succeeded").length} hint="Matched to a ledger entry" icon={CheckCircle2} />
        <StatTile label="Manually matched" value={matched.length} hint="Resolved by a human, with an audit entry" icon={ShieldCheck} />
      </div>

      <Note title="Callbacks are an optimisation. The reconciler is the source of truth." icon={RadioTower}>
        A mobile money provider can take a customer’s money and never deliver the callback. So the booking flow never depends on the
        callback alone: every payment intent carries an idempotency key, a reconciliation job sweeps anything stuck for more than ten
        minutes, and the customer can enter their own reference which lands in this queue. A duplicate callback arriving late is ignored,
        because confirmation is idempotent — one transition, one ledger entry.
      </Note>

      <div className="mt-4">
        <Section title="Mismatch queue" description="Money may have left the customer’s account. Query the provider by reference, then match or reject.">
          <DataTable
            columns={columns}
            rows={mismatches}
            rowKey={(p) => p.id}
            caption="Payments awaiting reconciliation"
            empty={<EmptyState icon={CheckCircle2} title="Nothing unreconciled" description="Every payment has a confirmed settlement. New items appear here when a callback is lost or a customer submits a reference." />}
          />
        </Section>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Section title="Gateway settlements vs ledger" description="Per rail: what the gateway says it settled against what the journal recorded.">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="py-2 text-left font-semibold">Rail</th>
                <th scope="col" className="py-2 text-right font-semibold">Gateway in</th>
                <th scope="col" className="py-2 text-right font-semibold">Ledger debits</th>
                <th scope="col" className="py-2 text-right font-semibold">Refunds out</th>
                <th scope="col" className="py-2 text-right font-semibold">Difference</th>
              </tr>
            </thead>
            <tbody>
              {settlements.map((s) => (
                <tr key={s.rail} className="border-b last:border-0">
                  <td className="py-2">
                    <p>{RAIL_LABELS[s.rail]}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">{s.account}</p>
                  </td>
                  <td className="py-2 text-right tabular-nums"><MoneyText minor={s.gatewayMinor} size="xs" showCurrency={false} /></td>
                  <td className="py-2 text-right tabular-nums"><MoneyText minor={s.ledgerIn} size="xs" showCurrency={false} /></td>
                  <td className="py-2 text-right tabular-nums text-muted-foreground"><MoneyText minor={s.ledgerOut} size="xs" showCurrency={false} /></td>
                  <td className="py-2 text-right">
                    {s.diff === 0 ? <Pill tone="success" icon={CheckCircle2}>balanced</Pill> : <Pill tone="danger" icon={AlertTriangle}><MoneyText minor={s.diff} size="xs" showCurrency={false} /></Pill>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-muted-foreground">
            Payments still in the mismatch queue are deliberately absent from both columns — nothing is posted to the ledger until a
            settlement is proven.
          </p>
        </Section>

        <Section title="Recently reconciled by hand" description="Each row wrote a PAYMENT_MANUAL_MATCH or PAYMENT_RECONCILE_NOT_FOUND audit entry.">
          {matched.length ? (
            <ul className="space-y-2">
              {matched.slice(0, 8).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 rounded-lg border p-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-medium">{bookings[p.bookingId]?.reference ?? p.bookingId}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {p.status === "succeeded" ? `Matched ${p.providerReference}` : "Not found at provider"} · {p.reconciledBy} · {formatDateTime(p.reconciledAt ?? p.updatedAt)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <MoneyText minor={p.amountMinor} size="xs" />
                    {p.status === "succeeded" ? <Pill tone="success" icon={CheckCircle2}>matched</Pill> : <Pill tone="danger" icon={XCircle}>not found</Pill>}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon={ShieldCheck} title="No manual matches yet" description="Resolve an item in the mismatch queue and it appears here with the operator’s name." />
          )}
        </Section>
      </div>

      <Dialog open={Boolean(open)} onOpenChange={(v) => { if (!v) setOpenId(null); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          {open && openBooking ? (
            <>
              <DialogHeader>
                <DialogTitle>Reconcile {openBooking.reference}</DialogTitle>
                <DialogDescription>
                  {RAIL_LABELS[open.rail]} · {open.provider}. The customer reports the money left their account {relativeTime(open.createdAt)}.
                </DialogDescription>
              </DialogHeader>

              <div className="rounded-xl border bg-muted/40 p-3">
                <KeyValue label="Amount"><MoneyText minor={open.amountMinor} currency={open.currency} size="sm" /></KeyValue>
                <KeyValue label="Customer reference">{open.customerReference ? <code className="rounded bg-background px-1.5 py-0.5 text-xs">{open.customerReference}</code> : "none"}</KeyValue>
                <KeyValue label="Payer phone">{open.phone ?? "—"}</KeyValue>
                <KeyValue label="Idempotency key"><code className="text-[11px]">{open.idempotencyKey}</code></KeyValue>
                <KeyValue label="Booking status"><StatusChip status={openBooking.status} size="sm" /></KeyValue>
              </div>

              <Field label="Reference to query" htmlFor="rec-ref" hint="Usually the reference the customer typed into the payment fallback screen.">
                <Input id="rec-ref" value={manualRef} onChange={(e) => setManualRef(e.target.value.toUpperCase())} className="font-mono" placeholder="RJ7X21LMQ" />
              </Field>

              <Button variant="outline" onClick={queryProvider} disabled={querying}>
                <RadioTower className="size-4" aria-hidden /> {querying ? "Querying provider…" : "Query provider by reference"}
              </Button>

              {result ? (
                result.found ? (
                  <div className="rounded-xl border border-success/40 bg-success/5 p-3 text-sm">
                    <p className="flex items-center gap-2 font-medium text-success-foreground"><CheckCircle2 className="size-4" aria-hidden /> Transaction found at provider</p>
                    <div className="mt-2">
                      <KeyValue label="Provider reference"><code className="text-xs">{result.providerReference}</code></KeyValue>
                      <KeyValue label="Amount settled"><MoneyText minor={result.amountMinor ?? 0} size="sm" /></KeyValue>
                      <KeyValue label="Payer">{result.phone ?? "—"}</KeyValue>
                      <KeyValue label="Amount matches booking">{result.amountMinor === open.amountMinor ? "Yes, exact" : "No — investigate"}</KeyValue>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                    <p className="flex items-center gap-2 font-medium"><XCircle className="size-4" aria-hidden /> No transaction with that reference</p>
                    <p className="mt-1 text-xs">Marking not found releases the hold and tells the customer any debit will be reversed by their provider.</p>
                  </div>
                )
              ) : null}

              <DialogFooter className="flex-col gap-2 sm:flex-row">
                <Button variant="outline" onClick={notFound} disabled={!canReconcile}>
                  <XCircle className="size-4" aria-hidden /> Mark not found
                </Button>
                <Button onClick={match} disabled={!canReconcile || !result?.found}>
                  <CheckCircle2 className="size-4" aria-hidden /> Match and confirm payment
                </Button>
              </DialogFooter>
              <p className="text-[11px] text-muted-foreground">
                Matching posts the cash and deposit ledger lines, moves the held inventory to sold and requests supplier confirmation —
                exactly the path a successful callback would have taken.
              </p>
            </>
          ) : (
            <DialogHeader><DialogTitle>Payment</DialogTitle><DialogDescription>Select a payment from the queue.</DialogDescription></DialogHeader>
          )}
        </DialogContent>
      </Dialog>

      {!list.length ? <div className="mt-4"><EmptyState icon={Receipt} title="No payments yet" description="Payments appear as travellers check out." /></div> : null}
    </div>
  );
}
