"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Building2, BadgeCheck, Check, CircleCheck, FileSignature, Landmark, Send, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/chrome/console-shell";
import { Pill } from "@/components/shared/status-chip";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useStore } from "@/lib/store";
import { admin } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { NotSupplier, useSupplierContext } from "@/features/supplier/shared";
import type { Organisation } from "@/lib/domain/types";

const STEPS = [
  { id: 1, title: "Business details", icon: Building2, hint: "Legal name, city and the person we call about bookings." },
  { id: 2, title: "TIN & licences", icon: BadgeCheck, hint: "Tanzania Revenue Authority TIN and your tourism licence." },
  { id: 3, title: "Bank details", icon: Landmark, hint: "Where we send your payouts. Verified before the first payment." },
  { id: 4, title: "Contract", icon: FileSignature, hint: "Commission and payout terms set by the platform." },
];

interface Draft {
  name: string;
  city: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  tin: string;
  licenceNo: string;
  bankName: string;
  bankAccountMasked: string;
  accepted: boolean;
  notes: string;
}

/** S01 · Supplier onboarding wizard. Ends in "submitted for review" — a supplier never activates itself. */
export default function SupplierOnboardingPage() {
  const { org, hydrated, isSupplier } = useSupplierContext();
  const organisations = useStore((s) => s.organisations);
  const pendingSuppliers = Object.values(organisations).filter((o) => o.type === "supplier" && o.status === "pending");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const target: Organisation | undefined = selectedId ? organisations[selectedId] : org?.status === "pending" ? org : org;

  if (!hydrated) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!isSupplier && !org) {
    return (
      <>
        <PageHeader title="Supplier onboarding" code="S01" description="Business details, TIN and licences, bank details, contract acceptance." />
        <NotSupplier what="The onboarding wizard" />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Supplier onboarding"
        code="S01"
        description="Four steps to join the marketplace. Your application is reviewed by the Aeropath supply team before your products can go live."
        actions={
          pendingSuppliers.length ? (
            <div className="flex items-center gap-2">
              <Label htmlFor="app-select" className="text-xs text-muted-foreground">Application</Label>
              <Select value={selectedId ?? org?.id ?? ""} onValueChange={(v) => setSelectedId(v)}>
                <SelectTrigger id="app-select" className="w-[260px]">
                  <SelectValue placeholder="Select an application" />
                </SelectTrigger>
                <SelectContent>
                  {org ? <SelectItem value={org.id}>{org.name} · yours</SelectItem> : null}
                  {pendingSuppliers.filter((o) => o.id !== org?.id).map((o) => (
                    <SelectItem key={o.id} value={o.id}>{o.name} · step {o.onboardingStep ?? 1} of 4</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null
        }
      />
      {target ? <Wizard key={target.id} organisation={target} /> : <p className="text-sm text-muted-foreground">Select an application to continue.</p>}
    </>
  );
}

function Wizard({ organisation }: { organisation: Organisation }) {
  const submitted = (organisation.onboardingStep ?? 0) >= 5;
  const [step, setStep] = useState(() => Math.min(4, Math.max(1, organisation.onboardingStep ?? 1)));
  const [done, setDone] = useState(submitted);
  const [draft, setDraft] = useState<Draft>({
    name: organisation.name,
    city: organisation.city,
    contactName: organisation.contactName ?? "",
    contactPhone: organisation.contactPhone ?? "",
    contactEmail: organisation.contactEmail ?? "",
    tin: organisation.tin ?? "",
    licenceNo: organisation.licenceNo ?? "",
    bankName: organisation.bankName ?? "",
    bankAccountMasked: organisation.bankAccountMasked ?? "",
    accepted: organisation.status === "active",
    notes: "",
  });

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const stepValid =
    step === 1 ? draft.name.trim().length > 2 && draft.city.trim().length > 1 && draft.contactName.trim().length > 2 && draft.contactPhone.trim().length > 8
      : step === 2 ? draft.tin.trim().length > 5 && draft.licenceNo.trim().length > 3
      : step === 3 ? draft.bankName.trim().length > 2 && draft.bankAccountMasked.trim().length > 3
      : draft.accepted;

  function saveProgress(next: number) {
    admin.updateOrganisation(organisation.id, {
      name: draft.name,
      city: draft.city,
      contactName: draft.contactName,
      contactPhone: draft.contactPhone,
      contactEmail: draft.contactEmail,
      tin: draft.tin,
      licenceNo: draft.licenceNo,
      bankName: draft.bankName,
      bankAccountMasked: draft.bankAccountMasked,
      onboardingStep: next,
    });
  }

  function next() {
    if (!stepValid) {
      toast.error("Complete this step first", { description: "Every field on this step is required before you continue." });
      return;
    }
    saveProgress(step + 1);
    setStep((s) => Math.min(4, s + 1));
  }

  function submit() {
    if (!draft.accepted) {
      toast.error("Accept the supplier agreement to submit");
      return;
    }
    admin.updateOrganisation(organisation.id, {
      name: draft.name,
      city: draft.city,
      contactName: draft.contactName,
      contactPhone: draft.contactPhone,
      contactEmail: draft.contactEmail,
      tin: draft.tin,
      licenceNo: draft.licenceNo,
      bankName: draft.bankName,
      bankAccountMasked: draft.bankAccountMasked,
      status: "pending",
      onboardingStep: 5,
    });
    setDone(true);
    toast.success("Application submitted for review", { description: "The Aeropath supply team reviews new suppliers within one working day." });
  }

  if (done) {
    return (
      <div className="max-w-2xl">
        <div className="rounded-xl border border-success/40 bg-success/5 p-6">
          <span className="mb-3 flex size-11 items-center justify-center rounded-full bg-success/15 text-success-foreground">
            <CircleCheck className="size-6" aria-hidden />
          </span>
          <h2 className="font-display text-xl">Submitted for review</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {organisation.name} was sent to the Aeropath supply team on {formatDate(new Date())}. We verify your TIN, licence and bank account, then confirm your commission terms. You will get an email and can start loading products as soon as you are approved.
          </p>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <Field label="Legal name" value={draft.name} />
            <Field label="TIN" value={draft.tin} />
            <Field label="Tourism licence" value={draft.licenceNo} />
            <Field label="Payout account" value={`${draft.bankName} ${draft.bankAccountMasked}`} />
          </dl>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => { setDone(false); setStep(1); }}>
              <ArrowLeft className="size-4" aria-hidden />
              Amend the application
            </Button>
            <Button asChild>
              <Link href="/partner/supplier/products">
                Start drafting products
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Button>
          </div>
        </div>
        <Alert className="mt-4">
          <ShieldCheck className="size-4" aria-hidden />
          <AlertTitle>Approval happens in the back office</AlertTitle>
          <AlertDescription>
            A supply manager approves the organisation and every product listing. No supplier account can publish itself or change commission terms.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
      <ol className="flex gap-2 overflow-x-auto lg:flex-col lg:gap-1" aria-label="Onboarding steps">
        {STEPS.map((s) => {
          const state = s.id < step ? "done" : s.id === step ? "current" : "todo";
          return (
            <li key={s.id} className="min-w-[180px] flex-1 lg:min-w-0">
              <button
                type="button"
                onClick={() => setStep(s.id)}
                aria-current={state === "current" ? "step" : undefined}
                className={cn(
                  "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                  state === "current" ? "border-brand-300 bg-brand-50" : state === "done" ? "border-success/30 bg-success/5" : "bg-card hover:bg-muted",
                )}
              >
                <span className={cn("mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold", state === "done" ? "bg-success/20 text-success-foreground" : state === "current" ? "bg-brand-500 text-white" : "bg-muted text-muted-foreground")}>
                  {state === "done" ? <Check className="size-3.5" aria-hidden /> : s.id}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium">{s.title}</span>
                  <span className="block text-xs text-muted-foreground">{s.hint}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>

      <div className="rounded-xl border bg-card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Step {step} of 4</p>
            <h2 className="font-display text-xl">{STEPS[step - 1].title}</h2>
          </div>
          <Pill tone={organisation.status === "pending" ? "warning" : "success"}>{organisation.status === "pending" ? "Application in progress" : "Approved supplier"}</Pill>
        </div>

        {step === 1 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField id="name" label="Registered business name" value={draft.name} onChange={(v) => set("name", v)} />
            <TextField id="city" label="City / park" value={draft.city} onChange={(v) => set("city", v)} />
            <TextField id="contactName" label="Reservations contact" value={draft.contactName} onChange={(v) => set("contactName", v)} />
            <TextField id="contactPhone" label="Contact phone" value={draft.contactPhone} onChange={(v) => set("contactPhone", v)} placeholder="+255 754 000 000" />
            <TextField id="contactEmail" label="Contact email" value={draft.contactEmail} onChange={(v) => set("contactEmail", v)} className="sm:col-span-2" />
            <div className="sm:col-span-2">
              <Label htmlFor="notes">Anything we should know (optional)</Label>
              <Textarea id="notes" className="mt-1.5" rows={3} value={draft.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Seasonal closures, park permits, preferred confirmation channel…" />
            </div>
          </div>
        ) : null}

        {step === 2 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField id="tin" label="TIN (Tanzania Revenue Authority)" value={draft.tin} onChange={(v) => set("tin", v)} placeholder="123-456-789" />
            <TextField id="licence" label="Tourism licence number" value={draft.licenceNo} onChange={(v) => set("licenceNo", v)} placeholder="TALA/2026/0000" />
            <Alert className="sm:col-span-2">
              <BadgeCheck className="size-4" aria-hidden />
              <AlertTitle>We verify these before approval</AlertTitle>
              <AlertDescription>
                TALA, ZCT, TCAA or LATRA licences are all accepted depending on what you sell. Payouts are held until both numbers check out.
              </AlertDescription>
            </Alert>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="bank">Bank</Label>
              <Select value={draft.bankName} onValueChange={(v) => set("bankName", v)}>
                <SelectTrigger id="bank" className="mt-1.5 w-full">
                  <SelectValue placeholder="Select your bank" />
                </SelectTrigger>
                <SelectContent>
                  {["CRDB Bank", "NMB Bank", "Stanbic", "PBZ", "NBC", "Equity Bank"].map((b) => (
                    <SelectItem key={b} value={b}>{b}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <TextField id="account" label="Account number" value={draft.bankAccountMasked} onChange={(v) => set("bankAccountMasked", v)} placeholder="0152 •••• 4471" />
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Only the last four digits are stored in the console. Finance holds the full account in the payments vault.
            </p>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="space-y-4">
            <dl className="grid gap-3 sm:grid-cols-2">
              <Field label="Commission" value={`${organisation.commissionPct ?? 15}% of the net rate`} />
              <Field label="Payout terms" value={`${organisation.payoutTermsDays ?? 14} days after travel`} />
              <Field label="Confirmation SLA" value="2 hours from payment" />
              <Field label="Currency" value="TZS · settled to your bank account" />
            </dl>
            <div className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Aeropath supplier agreement</p>
              <p className="mt-1">
                You confirm or reject each booking within 2 hours of payment. Rejections trigger an automatic full refund to the guest and count against your confirmation rate. Rates loaded here are net of commission; Aeropath collects from the guest and pays you on the terms above. Commission and payout terms may only be changed by agreement with the platform.
              </p>
            </div>
            <label className="flex items-start gap-3 rounded-lg border p-3">
              <Checkbox checked={draft.accepted} onCheckedChange={(v) => set("accepted", v === true)} aria-label="Accept the supplier agreement" />
              <span className="text-sm">
                I have read and accept the supplier agreement on behalf of {draft.name}.
                <span className="mt-0.5 block text-xs text-muted-foreground">Signed as {draft.contactName || "the reservations contact"} · {formatDate(new Date())}</span>
              </span>
            </label>
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t pt-4">
          <Button variant="outline" onClick={() => setStep((s) => Math.max(1, s - 1))} disabled={step === 1}>
            <ArrowLeft className="size-4" aria-hidden />
            Back
          </Button>
          {step < 4 ? (
            <Button onClick={next}>
              Save and continue
              <ArrowRight className="size-4" aria-hidden />
            </Button>
          ) : (
            <Button onClick={submit} disabled={!draft.accepted}>
              <Send className="size-4" aria-hidden />
              Submit for review
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function TextField({ id, label, value, onChange, placeholder, className }: { id: string; label: string; value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={className}>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} className="mt-1.5" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-background p-3">
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium">{value || "—"}</dd>
    </div>
  );
}
