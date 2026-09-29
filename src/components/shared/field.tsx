import * as React from "react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

/**
 * Field: label above, control, then one line of hint or error.
 * Errors name the problem and the recovery; the control gets aria-invalid.
 */
export function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  optional,
  children,
  className,
  labelAside,
}: {
  label: React.ReactNode;
  htmlFor?: string;
  hint?: React.ReactNode;
  error?: string | null;
  required?: boolean;
  optional?: boolean;
  children: React.ReactNode;
  className?: string;
  labelAside?: React.ReactNode;
}) {
  const hintId = htmlFor ? `${htmlFor}-hint` : undefined;
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={htmlFor}>
          {label}
          {required && (
            <span aria-hidden className="text-[var(--st-red-fg)]">
              *
            </span>
          )}
          {optional && <span className="font-normal text-ink-4">optional</span>}
        </Label>
        {labelAside}
      </div>
      {children}
      {error ? (
        <p id={hintId} role="alert" className="text-[13px] leading-4 text-[var(--st-red-fg)]">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-[13px] leading-4 text-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Responsive field grid: 1 column on phones, `cols` from sm up. */
export function FieldGrid({ cols = 2, className, children }: { cols?: 1 | 2 | 3 | 4 | 6; className?: string; children: React.ReactNode }) {
  const c = { 1: "sm:grid-cols-1", 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-4", 6: "sm:grid-cols-6" }[cols];
  return <div className={cn("grid grid-cols-1 gap-x-3 gap-y-3.5", c, className)}>{children}</div>;
}

/** A titled group inside a form or drawer: a rule, a small heading, then fields. */
export function FormSection({
  title,
  description,
  aside,
  children,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  aside?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("border-t border-rule pt-4 first:border-t-0 first:pt-0", className)}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          {description && <p className="mt-0.5 text-[13px] text-ink-3">{description}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** Inline banner for blocking errors and important notes, in plain words. */
export function Banner({
  tone = "info",
  title,
  children,
  action,
  className,
}: {
  tone?: "info" | "warn" | "error" | "success";
  title?: React.ReactNode;
  children?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const t = {
    info: "border-[var(--st-blue-bd)] bg-[var(--st-blue-bg)] text-[var(--st-blue-fg)]",
    warn: "border-[var(--st-amber-bd)] bg-[var(--st-amber-bg)] text-[var(--st-amber-fg)]",
    error: "border-[var(--st-red-bd)] bg-[var(--st-red-bg)] text-[var(--st-red-fg)]",
    success: "border-[var(--st-green-bd)] bg-[var(--st-green-bg)] text-[var(--st-green-fg)]",
  }[tone];
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("flex flex-wrap items-start gap-x-3 gap-y-2 rounded-md border px-3 py-2.5 text-sm leading-5", t, className)}>
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && "mt-0.5", "opacity-95")}>{children}</div>}
      </div>
      {action}
    </div>
  );
}
