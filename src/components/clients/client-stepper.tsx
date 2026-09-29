"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, CircleCheckBig, Plane, UserRoundPlus } from "lucide-react";

import type { Client, DomainError, ID } from "@/domain/types";
import { can } from "@/domain/permissions";
import { createClient, updateClient, upsertTraveller } from "@/domain/commands";
import { useApp, useDispatch, useMe } from "@/store";
import { useNow } from "@/lib/use-now";
import { darToday } from "@/lib/dates";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ReviewStep } from "./client-review";
import { AddressStep, BillingStep, ContactStep, OrgStep, PeopleStep, PersonalStep, PolicyStep, TravelStep, TypeStep, type StepProps } from "./client-steps";
import {
  STEP_META,
  draftToInput,
  draftToPatch,
  findSelfTraveller,
  firstInvalidStep,
  locateField,
  profileDraftFrom,
  selfTravellerInput,
  stepsFor,
  validateStep,
  type CheckOpts,
  type ClientSeed,
  type Errors,
  type ProfileDraft,
  type StepId,
} from "./profile-draft";

/**
 * Client stepper: one numbered rail, one step at a time, Back / Continue in the footer and a check per step.
 * Creates a client (and an individual's own traveller record), or edits one with the same steps.
 */

export interface ClientStepperProps {
  /** Edit this client; omit to create one. */
  existing?: Client;
  /** Quick details carried over (name, phone, email, type). */
  seed?: ClientSeed;
  /** When editing, open on this step. */
  initialStep?: StepId;
  surface?: "dialog" | "page";
  /** After creating: "offer" shows next steps (book, open), "handoff" leaves it to onCreated and finishes. */
  afterCreate?: "offer" | "handoff";
  onCreated?: (clientId: ID) => void;
  /** Close, or done (after saving an edit, or a hand-off create). */
  onClose: () => void;
  /** The Cancel button; defaults to onClose. */
  onCancel?: () => void;
}

export function ClientStepper({ existing, seed, initialStep, surface = "dialog", afterCreate = "offer", onCreated, onClose, onCancel = onClose }: ClientStepperProps) {
  const me = useMe();
  const dispatch = useDispatch();
  const now = useNow();
  const termsDays = useApp((s) => s.db?.settings.defaultPaymentTermsDays ?? 30);
  const mode: CheckOpts["mode"] = existing ? "edit" : "create";
  const canSetCredit = can(me, "client.set_credit");
  const opts: CheckOpts = { today: darToday(now), mode, canSetCredit };

  const start = React.useCallback(() => {
    const db = useApp.getState().db;
    const self = existing && db ? findSelfTraveller(existing, Object.values(db.travellers)) : undefined;
    return profileDraftFrom(existing, self, seed);
  }, [existing, seed]);
  const [d, setD] = React.useState<ProfileDraft>(start);
  const steps = stepsFor(d.type);
  const [index, setIndex] = React.useState(() => {
    if (!existing) return 0;
    const i = steps.indexOf(initialStep ?? steps[1]);
    return i >= 0 ? i : 1;
  });
  const [reached, setReached] = React.useState(() => (existing ? steps.length - 1 : 0));
  const [errors, setErrors] = React.useState<Errors>({});
  const [fromReview, setFromReview] = React.useState(false);
  const [created, setCreated] = React.useState<{ id: ID; name: string; org: boolean } | null>(null);
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const headingRef = React.useRef<HTMLHeadingElement>(null);

  const step = steps[index];
  const last = steps.length - 1;

  const set: StepProps["set"] = (patch, clear) => {
    if (patch.type && patch.type !== d.type && mode === "create") setReached(0);
    setD((prev) => ({ ...prev, ...patch }));
    const keys = clear ?? Object.keys(patch);
    if (keys.some((k) => errors[k])) setErrors((e) => Object.fromEntries(Object.entries(e).filter(([k]) => !keys.includes(k))));
  };

  const afterPaint = (fn: () => void) => requestAnimationFrame(() => requestAnimationFrame(fn));
  const focusFirstError = () =>
    afterPaint(() => {
      const body = bodyRef.current;
      const el = body?.querySelector<HTMLElement>("[aria-invalid=true]");
      if (!body || !el) return;
      // Scroll only the step body: scrollIntoView would also shift the dialog's own (clipped) box.
      if (surface === "dialog") body.scrollTop += el.getBoundingClientRect().top - body.getBoundingClientRect().top - body.clientHeight / 3;
      else el.scrollIntoView({ block: "center" });
      el.focus({ preventScroll: true });
    });
  const go = (i: number, withErrors: Errors = {}) => {
    setIndex(i);
    setErrors(withErrors);
    setReached((r) => Math.max(r, i));
    if (Object.keys(withErrors).length) focusFirstError();
    else
      afterPaint(() => {
        bodyRef.current?.scrollTo({ top: 0 });
        headingRef.current?.focus({ preventScroll: true });
      });
  };
  const check = (): boolean => {
    const e = validateStep(step, d, opts);
    if (!Object.keys(e).length) return true;
    setErrors(e);
    focusFirstError();
    return false;
  };

  const next = () => {
    if (!check()) return;
    if (fromReview) {
      setFromReview(false);
      go(last);
    } else go(Math.min(last, index + 1));
  };
  const back = () => {
    setFromReview(false);
    go(Math.max(0, index - 1));
  };
  const jump = (i: number) => {
    if (i === index || i > reached) return;
    if (i > index && !check()) return;
    setFromReview(false);
    go(i);
  };
  const editFromReview = (s: StepId) => {
    const i = steps.indexOf(s);
    if (i < 0) return;
    setFromReview(true);
    go(i);
  };

  const showDomainError = (err: DomainError) => {
    const at = locateField(err.field, d.type);
    const i = at ? steps.indexOf(at.step) : -1;
    if (at && i >= 0) go(i, { [at.key]: err.message });
  };

  const save = () => {
    const bad = firstInvalidStep(d, opts);
    if (bad) {
      go(steps.indexOf(bad.step), bad.errors);
      return;
    }
    const includeCredit = canSetCredit;
    if (existing) {
      const r = dispatch(updateClient, { clientId: existing.id, patch: draftToPatch(d, { includeCredit }) });
      if (!r.ok) return showDomainError(r.error);
      const cur = d.selfTravellerId ? useApp.getState().db?.travellers[d.selfTravellerId] : undefined;
      const traveller = selfTravellerInput(d, existing.id, opts, cur);
      if (traveller) dispatch(upsertTraveller, { traveller }, { toast: false });
      onClose();
      return;
    }
    const r = dispatch(createClient, draftToInput(d, { includeCredit }));
    if (!r.ok) return showDomainError(r.error);
    const clientId = r.result!.clientId;
    const traveller = selfTravellerInput(d, clientId, opts);
    if (traveller) dispatch(upsertTraveller, { traveller }, { toast: false });
    onCreated?.(clientId);
    if (afterCreate === "handoff") onClose();
    else setCreated({ id: clientId, name: useApp.getState().db?.clients[clientId]?.name ?? "The client", org: d.type === "corporate" });
  };

  const restart = () => {
    setD(profileDraftFrom());
    setIndex(0);
    setReached(0);
    setErrors({});
    setFromReview(false);
    setCreated(null);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (created) return;
    if (mode === "edit" || step === "review") save();
    else next();
  };

  const p: StepProps = { d, set, errors, mode };
  const body = (() => {
    switch (step) {
      case "type":
        return <TypeStep {...p} original={existing?.type} />;
      case "personal":
        return <PersonalStep {...p} />;
      case "contact":
        return <ContactStep {...p} />;
      case "travel":
        return <TravelStep {...p} today={opts.today} />;
      case "billing":
        return <BillingStep {...p} />;
      case "org":
        return <OrgStep {...p} onJump={(s) => jump(steps.indexOf(s))} />;
      case "address":
        return <AddressStep {...p} />;
      case "people":
        return <PeopleStep {...p} />;
      case "policy":
        return <PolicyStep {...p} canSetCredit={canSetCredit} termsDays={termsDays} credit={existing ? { limit: existing.creditLimit, terms: existing.paymentTermsDays } : undefined} />;
      case "review":
        return <ReviewStep d={d} onEdit={editFromReview} canSetCredit={canSetCredit} termsDays={termsDays} />;
    }
  })();

  const title = existing ? `Edit ${existing.name}` : "New client";
  const description = existing ? "Changes apply to new bookings and documents. Past invoices keep what they printed." : "An individual or an organisation. Only the fields marked * are needed.";
  const meta = STEP_META[step];
  const primaryLabel = mode === "edit" ? "Save changes" : d.type === "corporate" ? "Create organisation" : "Create client";

  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
      {surface === "dialog" && (
        <DialogHeader>
          <DialogTitle>{created ? "Client saved" : title}</DialogTitle>
          <DialogDescription>{created ? "Take the next step, or close." : description}</DialogDescription>
        </DialogHeader>
      )}

      {created ? (
        <>
          <div className={cn("flex min-h-0 flex-1 flex-col justify-center overflow-y-auto px-5", surface === "page" ? "py-10" : "py-8")}>
            <Done created={created} onClose={onClose} />
          </div>
          <Footer>
            <Button type="button" variant="ghost" onClick={restart}>
              <UserRoundPlus /> Add another client
            </Button>
            <span className="flex-1" />
            <Button type="button" variant="outline" onClick={onClose}>
              Close
            </Button>
          </Footer>
        </>
      ) : (
        <>
          <StepRail steps={steps} index={index} reached={reached} onJump={jump} />
          <div ref={bodyRef} className={cn("min-h-0 flex-1 px-5 py-5 sm:px-6", surface === "dialog" && "overflow-y-auto")}>
            <div className="mb-5">
              <h3 ref={headingRef} tabIndex={-1} className="text-[17px] leading-6 font-semibold tracking-[-0.015em] text-ink outline-none">
                {meta.title}
              </h3>
              <p className="mt-1 text-sm text-ink-3">{meta.description}</p>
            </div>
            {body}
          </div>
          <Footer>
            {index === 0 ? (
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel
              </Button>
            ) : (
              <Button type="button" variant="outline" onClick={back}>
                <ArrowLeft /> Back
              </Button>
            )}
            <span className="flex-1" />
            {mode === "edit" ? (
              <>
                {step !== "review" && (
                  <Button type="button" variant="ghost" onClick={next}>
                    {fromReview ? "Review" : "Next"} <ArrowRight />
                  </Button>
                )}
                <Button type="submit">{primaryLabel}</Button>
              </>
            ) : step === "review" ? (
              <Button type="submit">
                <Check /> {primaryLabel}
              </Button>
            ) : (
              <Button type="submit">
                {fromReview ? "Back to review" : "Continue"} <ArrowRight />
              </Button>
            )}
          </Footer>
        </>
      )}
    </form>
  );
}

function Footer({ children }: { children: React.ReactNode }) {
  return <div className="flex shrink-0 items-center gap-2 border-t border-rule bg-canvas px-5 py-3 sm:px-6">{children}</div>;
}

/** Numbered rail from sm; "Step n of N" with a progress line on phones. Reached steps are links back. */
function StepRail({ steps, index, reached, onJump }: { steps: StepId[]; index: number; reached: number; onJump: (i: number) => void }) {
  const pct = ((index + 1) / steps.length) * 100;
  return (
    <nav aria-label="Steps" className="shrink-0 border-b border-rule px-5 py-3 sm:px-6">
      <div className="sm:hidden">
        <p className="text-sm">
          <span className="font-semibold text-brand-700 dark:text-brand-300">
            Step {index + 1} of {steps.length}
          </span>{" "}
          <span className="text-ink-3">·</span> <span className="font-semibold text-ink">{STEP_META[steps[index]].rail}</span>
        </p>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-canvas-2" aria-hidden>
          <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <ol className="hidden items-center sm:flex">
        {steps.map((s, i) => {
          const done = i < index;
          const on = i === index;
          const open = i <= reached;
          return (
            <li key={s} className={cn("flex min-w-0 items-center", i < steps.length - 1 && "flex-1")}>
              <button
                type="button"
                onClick={() => onJump(i)}
                disabled={!open}
                aria-current={on ? "step" : undefined}
                className="group flex shrink-0 items-center gap-2 rounded-md py-1 pr-1.5 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-default"
              >
                <span
                  className={cn(
                    "tnum grid size-6 place-items-center rounded-full text-xs font-bold transition-colors",
                    done
                      ? "bg-[var(--st-green-bg)] text-[var(--st-green-fg)] ring-1 ring-[var(--st-green-bd)]"
                      : on
                        ? "bg-primary text-primary-foreground"
                        : open
                          ? "bg-paper text-ink-2 ring-1 ring-rule-2"
                          : "bg-canvas-2 text-ink-4",
                  )}
                >
                  {done ? <Check className="size-3.5" strokeWidth={3} aria-hidden /> : i + 1}
                </span>
                <span className={cn("text-[13px] font-semibold whitespace-nowrap", on ? "text-ink" : open ? "text-ink-2 group-hover:text-ink" : "text-ink-4")}>{STEP_META[s].rail}</span>
                {done && <span className="sr-only">(done)</span>}
              </button>
              {i < steps.length - 1 && <span aria-hidden className={cn("mx-2 h-px min-w-3 flex-1", done ? "bg-[var(--st-green-bd)]" : "bg-rule-2")} />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function Done({ created, onClose }: { created: { id: ID; name: string; org: boolean }; onClose: () => void }) {
  return (
    <div role="status" className="mx-auto flex max-w-md flex-col items-center text-center">
      <span className="grid size-14 place-items-center rounded-full bg-[var(--st-green-bg)] text-[var(--st-green-fg)]">
        <CircleCheckBig className="size-7" aria-hidden />
      </span>
      <p className="mt-4 text-[20px] leading-7 font-bold tracking-[-0.015em] text-ink">{created.name} is saved</p>
      <p className="mt-1.5 text-sm text-ink-3">
        {created.org
          ? "Book travel for their people now, or open the organisation to add employees and travellers."
          : "Book their trip now, or open the client to add family members who travel with them."}
      </p>
      <div className="mt-6 grid w-full gap-2.5">
        <Button size="lg" asChild>
          <Link href={`/book?client=${created.id}`} onClick={onClose}>
            <Plane /> Book for this client
          </Link>
        </Button>
        <Button size="lg" variant="outline" asChild>
          <Link href={`/clients/${created.id}`} onClick={onClose}>
            Open client <ArrowRight />
          </Link>
        </Button>
      </div>
    </div>
  );
}

/** The stepper in a dialog: fixed height so steps don't jump; clicks outside don't throw the work away. */
export function ClientStepperDialog({ open, onOpenChange, ...props }: Omit<ClientStepperProps, "onClose" | "surface"> & { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [key, setKey] = React.useState(0);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setKey((k) => k + 1);
      }}
    >
      <DialogContent className="h-[calc(100dvh-2rem)] sm:h-[min(800px,calc(100dvh-4rem))] sm:max-w-[780px]" onInteractOutside={(e) => e.preventDefault()}>
        {open && <ClientStepper key={key} {...props} surface="dialog" onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}
