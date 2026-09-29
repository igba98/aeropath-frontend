"use client";

import * as React from "react";

import type { Role, User } from "@/domain/types";
import { upsertUser } from "@/domain/commands";
import { useDispatch } from "@/store";

import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field, FieldGrid } from "@/components/shared/field";
import { FilterSelect } from "@/components/shared/filter-select";

export const ROLE_OPTIONS: { value: Role; label: string; hint: string }[] = [
  { value: "agent", label: "Agent", hint: "Creates bookings, records payments received and issues tickets." },
  { value: "accountant", label: "Accountant", hint: "Verifies payments, pays suppliers, records expenses and approves refunds up to the limit." },
  { value: "manager", label: "Manager", hint: "Everything, plus approvals above the limit, users, settings and integrations." },
];

/** Add or edit a staff user (Manager only). */
export function UserDialog({ open, onOpenChange, user }: { open: boolean; onOpenChange: (o: boolean) => void; user?: User }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">{open && <UserForm user={user} onDone={() => onOpenChange(false)} />}</DialogContent>
    </Dialog>
  );
}

function UserForm({ user, onDone }: { user?: User; onDone: () => void }) {
  const dispatch = useDispatch();
  const [name, setName] = React.useState(user?.name ?? "");
  const [email, setEmail] = React.useState(user?.email ?? "");
  const [phone, setPhone] = React.useState(user?.phone ?? "");
  const [role, setRole] = React.useState<Role>(user?.role ?? "agent");
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const er: Record<string, string> = {};
    if (!name.trim()) er.name = "Enter the person's full name.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) er.email = "Enter a valid email address. It is what they sign in with.";
    setErrors(er);
    if (Object.keys(er).length) return;
    const r = dispatch(
      upsertUser,
      { user: { id: user?.id, name: name.trim(), email: email.trim(), phone: phone.trim() || undefined, role, active: user?.active } },
      { quietErrors: true },
    );
    if (r.ok) return onDone();
    const field = r.error.field?.split(".").pop();
    setErrors(field && ["name", "email", "phone", "role"].includes(field) ? { [field]: r.error.message } : { form: r.error.message });
  };

  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-col">
      <DialogHeader>
        <DialogTitle>{user ? `Edit ${user.name}` : "Add user"}</DialogTitle>
        <DialogDescription>{user ? "Changes apply the next time they open a page." : "They can sign in straight away with this email."}</DialogDescription>
      </DialogHeader>
      <DialogBody className="space-y-4">
        <FieldGrid cols={2}>
          <Field label="Full name" htmlFor="u-name" required error={errors.name} className="sm:col-span-2">
            <Input id="u-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus aria-invalid={Boolean(errors.name) || undefined} />
          </Field>
          <Field label="Email" htmlFor="u-email" required error={errors.email}>
            <Input id="u-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={Boolean(errors.email) || undefined} />
          </Field>
          <Field label="Phone" htmlFor="u-phone" optional error={errors.phone}>
            <Input id="u-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+255 7…" className="tnum" />
          </Field>
          <Field label="Role" error={errors.role} hint={ROLE_OPTIONS.find((r) => r.value === role)?.hint} className="sm:col-span-2">
            <FilterSelect label="Role" value={role} onChange={(v) => setRole(v as Role)} options={ROLE_OPTIONS} full />
          </Field>
        </FieldGrid>
        {errors.form && (
          <p role="alert" className="text-sm text-[var(--st-red-fg)]">
            {errors.form}
          </p>
        )}
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">{user ? "Save changes" : "Add user"}</Button>
      </DialogFooter>
    </form>
  );
}
