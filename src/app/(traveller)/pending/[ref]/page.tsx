"use client";

import { use, Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2, Phone, RefreshCw, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/shared/empty-state";
import { MoneyText } from "@/components/shared/money-text";
import { useStore } from "@/lib/store";
import { checkout, RAIL_LABELS } from "@/lib/api";
import { countdown } from "@/lib/format";

const TIMEOUT_MS = 120_000;
const POLL_MS = 3_000;

/**
 * T15 · Mobile money pending.
 * Polls for 120 seconds, then offers manual reference entry — because mobile money callbacks
 * genuinely fail, and the customer must have a path that does not require calling support
 * (flow spec §5.3 decision 4, and the recovery flow in §7.7).
 */
export default function PendingPage({ params }: { params: Promise<{ ref: string }> }) {
  return (
    <Suspense fallback={<Wrap><div className="h-40 animate-pulse rounded-xl bg-muted" /></Wrap>}>
      <Body reference={use(params).ref} />
    </Suspense>
  );
}

function Body({ reference }: { reference: string }) {
  const router = useRouter();
  const sp = useSearchParams();
  const paymentId = sp.get("payment") ?? "";
  const hydrated = useStore((s) => s.hydrated);
  const booking = useStore((s) => Object.values(s.bookings).find((b) => b.reference === reference));
  const payment = useStore((s) => (paymentId ? s.payments[paymentId] : undefined));
  const [elapsed, setElapsed] = useState(0);
  const [manualRef, setManualRef] = useState("");
  const started = useRef<number | null>(null);
  const settled = useRef(false);

  useEffect(() => {
    if (!paymentId || settled.current) return;
    started.current ??= Date.now();
    const poll = setInterval(() => {
      const status = checkout.poll(paymentId);
      if (status === "succeeded") {
        settled.current = true;
        clearInterval(poll);
        toast.success("Payment received");
        router.push(`/confirmation/${reference}`);
      } else if (status === "failed") {
        settled.current = true;
        clearInterval(poll);
      }
    }, POLL_MS);
    const tick = setInterval(() => setElapsed(Date.now() - (started.current ?? Date.now())), 250);
    return () => { clearInterval(poll); clearInterval(tick); };
  }, [paymentId, reference, router]);

  if (!hydrated) return <Wrap><div className="h-40 animate-pulse rounded-xl bg-muted" /></Wrap>;

  if (!booking || !payment) {
    return (
      <Wrap>
        <EmptyState
          title="We could not find that payment"
          description="It may already have completed, or the link is out of date."
          action={<Button asChild><Link href="/trips">Go to My Trips</Link></Button>}
        />
      </Wrap>
    );
  }

  const isMobile = ["mpesa", "tigopesa", "airtel", "halopesa"].includes(payment.rail);
  const timedOut = elapsed > TIMEOUT_MS;
  const progress = Math.min(100, (elapsed / TIMEOUT_MS) * 100);

  if (payment.status === "succeeded") {
    return (
      <Wrap>
        <div className="flex items-center justify-center gap-2 rounded-2xl border bg-card p-10 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden /> Taking you to your confirmation…
          <Link href={`/confirmation/${reference}`} className="font-medium text-brand-text underline underline-offset-2">Open it now</Link>
        </div>
      </Wrap>
    );
  }

  if (payment.status === "failed") {
    return (
      <Wrap>
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center">
          <AlertTriangle className="mx-auto size-8 text-destructive" aria-hidden />
          <h1 className="mt-3 font-display text-2xl">Payment did not go through</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            No money has left your account. We released the hold, so the rooms are back on sale — search again or try another payment method.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button asChild><Link href="/stays">Search again</Link></Button>
            <Button variant="outline" asChild><Link href="/trips">My Trips</Link></Button>
          </div>
        </div>
      </Wrap>
    );
  }

  if (payment.status === "reconciliation_pending") {
    return (
      <Wrap>
        <div className="rounded-2xl border bg-card p-6 text-center">
          <CheckCircle2 className="mx-auto size-8 text-warning" aria-hidden />
          <h1 className="mt-3 font-display text-2xl">We are verifying your payment</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Reference <span className="font-mono">{payment.customerReference}</span> is with our team.
            Your booking stays held for 24 hours while we check with {payment.provider}.
          </p>
          <p className="mt-4 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
            You do not need to do anything else. We will send an SMS the moment it is matched — usually within the hour.
            If the payment cannot be found, your provider reverses it automatically.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button asChild><Link href="/trips">Track it in My Trips</Link></Button>
          </div>
        </div>
      </Wrap>
    );
  }

  return (
    <Wrap>
      <div className="rounded-2xl border bg-card p-6">
        <div className="flex flex-col items-center text-center">
          <span className="relative flex size-14 items-center justify-center rounded-full bg-brand-50">
            <Smartphone className="size-6 text-brand-text-strong" aria-hidden />
            {!timedOut ? <span className="absolute inset-0 animate-ping rounded-full bg-brand-300/40" aria-hidden /> : null}
          </span>
          <h1 className="mt-4 font-display text-2xl">{isMobile ? "Check your phone" : "Authorising your payment"}</h1>
          <p className="mt-1.5 max-w-md text-sm text-muted-foreground" aria-live="polite">
            {isMobile ? (
              <>
                We sent a {RAIL_LABELS[payment.rail]} prompt to <span className="font-mono">{payment.phone}</span>. Enter your PIN to approve{" "}
                <MoneyText minor={payment.amountMinor} currency={payment.currency} size="sm" />.
              </>
            ) : (
              <>Waiting for {payment.provider} to confirm <MoneyText minor={payment.amountMinor} currency={payment.currency} size="sm" />.</>
            )}
          </p>

          {!timedOut ? (
            <div className="mt-5 w-full max-w-sm">
              <Progress value={progress} aria-label="Time remaining" />
              <p className="mt-1.5 text-xs tabular-nums text-muted-foreground">
                Waiting {countdown(TIMEOUT_MS - elapsed)} · checking every 3 seconds
              </p>
            </div>
          ) : null}
        </div>

        {timedOut ? (
          <div className="mt-6 space-y-4">
            <Alert>
              <AlertTriangle className="size-4" />
              <AlertTitle>We have not received confirmation yet</AlertTitle>
              <AlertDescription>
                This usually means the provider&rsquo;s callback was lost, not that your payment failed.
                <strong className="mt-1 block">If money left your account, enter the reference below and we will verify it.</strong>
              </AlertDescription>
            </Alert>

            <div className="rounded-xl border bg-muted/40 p-4">
              <Label htmlFor="txref">{RAIL_LABELS[payment.rail]} transaction reference</Label>
              <div className="mt-1.5 flex flex-wrap gap-2">
                <Input
                  id="txref"
                  value={manualRef}
                  onChange={(e) => setManualRef(e.target.value.toUpperCase())}
                  placeholder="RJ7X21LMQ"
                  className="max-w-56 font-mono"
                  aria-describedby="txref-hint"
                />
                <Button
                  onClick={() => {
                    if (manualRef.trim().length < 5) {
                      toast.error("That reference looks too short", { description: "It is usually 9 or 10 characters." });
                      return;
                    }
                    checkout.enterManualReference(payment.id, manualRef.trim());
                    toast.success("Sent to our team", { description: "We will verify it with the provider and confirm by SMS." });
                  }}
                >
                  Verify my payment
                </Button>
              </div>
              <p id="txref-hint" className="mt-1.5 text-xs text-muted-foreground">
                It is in the SMS from {payment.provider}, for example &ldquo;RJ7X21LMQ Confirmed. TZS {payment.amountMinor.toLocaleString()} sent to Aeropath.&rdquo;
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="gap-1.5"
                onClick={() => { started.current = Date.now(); setElapsed(0); toast.info("Prompt resent", { description: "Check your phone again." }); }}
              >
                <RefreshCw className="size-4" aria-hidden /> Resend the prompt
              </Button>
              <Button variant="outline" className="gap-1.5" asChild>
                <a href="tel:+255700000000"><Phone className="size-4" aria-hidden /> Call support</a>
              </Button>
            </div>
          </div>
        ) : null}

        <p className="mt-6 border-t pt-4 text-center text-xs text-muted-foreground">
          Reference <span className="font-mono">{booking.reference}</span> · your rooms stay held while we wait.
          You can close this page — the booking resumes from My Trips.
        </p>
      </div>
    </Wrap>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-2xl px-4 py-10">{children}</div>;
}
