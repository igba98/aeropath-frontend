"use client";

import Link from "next/link";
import { Building2, CalendarClock, FileSignature, Landmark, Lock, Percent, Phone, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/chrome/console-shell";
import { Pill } from "@/components/shared/status-chip";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { AdminOnly, NotSupplier, useSupplierContext } from "@/features/supplier/shared";

/** S12 · Contract. Read only by design — commission and payout terms are back office controlled (§2.4). */
export default function SupplierContractPage() {
  const { org, hydrated, isAdmin } = useSupplierContext();

  if (!hydrated) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!org) {
    return (
      <>
        <PageHeader title="Contract" code="S12" description="Commission, payout terms, bank details and licences." />
        <NotSupplier what="Your contract" />
      </>
    );
  }
  if (!isAdmin) {
    return (
      <>
        <PageHeader title="Contract" code="S12" description="Commission, payout terms, bank details and licences." />
        <AdminOnly screen="Viewing the contract" />
      </>
    );
  }

  const perf = org.performance;

  return (
    <>
      <PageHeader
        title="Contract"
        code="S12"
        description={`Your agreement with Aeropath, as recorded on the platform. Signed ${formatDate(org.createdAt)}.`}
        actions={<Pill tone="neutral" icon={Lock}>Read only</Pill>}
      />

      <Alert className="mb-4">
        <ShieldCheck className="size-4" aria-hidden />
        <AlertTitle>Changes go through the platform</AlertTitle>
        <AlertDescription>
          Commission, payout terms and bank details can only be changed by Aeropath after verification — no supplier account, including a Supplier Admin, can edit them here. Email your account manager or raise it with support and finance will action it.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Commercial terms" icon={Percent}>
          <Row label="Commission" value={`${org.commissionPct ?? 15}% of the net rate`} note="Deducted from every booking before payout." />
          <Row label="Payout terms" value={`${org.payoutTermsDays ?? 14} days after travel`} note="Statements are generated per period and paid once finance approves." />
          <Row label="Settlement currency" value="TZS" note="Guests may pay in USD; you are always settled in shillings." />
          <Row label="Confirmation SLA" value="2 hours from payment" note="Missed SLAs are chased by operations and may be force confirmed or cancelled." />
        </Card>

        <Card title="Bank details" icon={Landmark}>
          <Row label="Bank" value={org.bankName ?? "Not yet provided"} />
          <Row label="Account" value={org.bankAccountMasked ?? "Not yet provided"} note="Only the last four digits are shown. Finance holds the full number." />
          <Row label="Account name" value={org.name} />
          <Row label="Verification" value={org.status === "active" ? "Verified" : "Pending verification"} />
        </Card>

        <Card title="Registration and licences" icon={FileSignature}>
          <Row label="TIN" value={org.tin ?? "—"} note="Tanzania Revenue Authority." />
          <Row label="Tourism licence" value={org.licenceNo ?? "—"} note="TALA, ZCT, TCAA or LATRA depending on what you sell." />
          <Row label="Registered city" value={`${org.city}, ${org.countryCode}`} />
          <Row label="Status" value={org.status === "active" ? "Active supplier" : org.status === "pending" ? "Application under review" : "Suspended"} />
        </Card>

        <Card title="Contacts on file" icon={Phone}>
          <Row label="Reservations contact" value={org.contactName ?? "—"} />
          <Row label="Phone" value={org.contactPhone ?? "—"} />
          <Row label="Email" value={org.contactEmail ?? "—"} />
          <Row label="On Aeropath since" value={formatDate(org.createdAt)} />
        </Card>

        {perf ? (
          <Card title="Performance against the contract" icon={CalendarClock} className="lg:col-span-2">
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <Metric label="Confirmation rate" value={`${perf.confirmationRatePct}%`} good={perf.confirmationRatePct >= 95} />
              <Metric label="Average confirm time" value={`${perf.avgConfirmMinutes} min`} good={perf.avgConfirmMinutes <= 120} />
              <Metric label="Rejection rate" value={`${perf.rejectionRatePct}%`} good={perf.rejectionRatePct < 3} />
              <Metric label="Cancellation rate" value={`${perf.cancellationRatePct}%`} good={perf.cancellationRatePct < 3} />
              <Metric label="Guest review score" value={`${perf.reviewScore} / 5`} good={perf.reviewScore >= 4.3} />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Suppliers below 90% confirmation or above 5% rejection are reviewed by the supply team and may be paused from search.
            </p>
          </Card>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="outline" asChild>
          <Link href="/partner/supplier/payouts"><Building2 className="size-4" aria-hidden />See how commission applied to your payouts</Link>
        </Button>
      </div>
    </>
  );
}

function Card({ title, icon: Icon, children, className }: { title: string; icon: typeof Percent; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border bg-card p-4 ${className ?? ""}`}>
      <h2 className="mb-3 flex items-center gap-2 font-display text-lg">
        <Icon className="size-4 text-brand-text" aria-hidden />
        {title}
      </h2>
      <dl className="space-y-3">{children}</dl>
    </section>
  );
}

function Row({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b pb-2 last:border-0 last:pb-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{value}</dd>
      {note ? <p className="w-full text-xs text-muted-foreground">{note}</p> : null}
    </div>
  );
}

function Metric({ label, value, good }: { label: string; value: string; good: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${good ? "border-success/40 bg-success/5" : "border-warning/40 bg-warning/5"}`}>
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-display text-xl tabular-nums">{value}</p>
    </div>
  );
}
