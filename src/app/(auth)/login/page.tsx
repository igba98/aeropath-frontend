"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight } from "lucide-react";

import type { User } from "@/domain/types";
import { useApp, useCurrentUser } from "@/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Banner } from "@/components/shared/field";
import { UserMark } from "@/components/shared/bits";
import { LoginBanner, LoginShowcase } from "@/components/auth/login-showcase";
import { ROLE_LABEL } from "@/components/layout/nav";

const ROLE_LINE: Record<User["role"], string> = {
  agent: "Bookings, tickets, payments received",
  accountant: "Verify payments, suppliers, expenses, refunds up to the limit",
  manager: "Everything, approvals above the limit, settings",
};

export default function LoginPage() {
  return (
    <Suspense>
      <Login />
    </Suspense>
  );
}

function Login() {
  const router = useRouter();
  const sp = useSearchParams();
  const hydrated = useApp((s) => s.hydrated);
  const db = useApp((s) => s.db);
  const signIn = useApp((s) => s.signIn);
  const me = useCurrentUser();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const next = sp.get("next") || "/";
  const switching = sp.get("switch") === "1";

  React.useEffect(() => {
    if (hydrated && me && !switching) router.replace(next);
  }, [hydrated, me, switching, next, router]);

  const users = React.useMemo(
    () =>
      Object.values(db?.users ?? {}).sort((a, b) => ["agent", "accountant", "manager"].indexOf(a.role) - ["agent", "accountant", "manager"].indexOf(b.role) || a.name.localeCompare(b.name)),
    [db],
  );

  const enter = (u: User) => {
    const r = signIn(u.id);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    router.replace(switching ? "/" : next);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const u = users.find((x) => x.email.toLowerCase() === email.trim().toLowerCase());
    if (!email.trim()) return setError("Enter your work email.");
    if (!u) return setError("No account uses that email. Pick a demo user below, or check the spelling.");
    if (!password) return setError("Enter your password. In this prototype any password works.");
    enter(u);
  };

  return (
    <div className="grid min-h-dvh grid-cols-[minmax(0,1fr)] bg-canvas lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <LoginShowcase className="hidden lg:block lg:sticky lg:top-0 lg:h-dvh" />

      <main className="flex min-w-0 flex-col justify-center px-4 py-10 sm:px-10">
        <div className="mx-auto w-full max-w-[440px]">
          <LoginBanner className="mb-8 lg:hidden" />
          <h1 className="text-[28px] leading-9 font-bold tracking-[-0.02em] text-ink">{switching && me ? "Switch user" : "Sign in"}</h1>
          <p className="mt-2 text-[15px] text-ink-3">Staff only. Use your work email, or pick a demo account below.</p>

          <form onSubmit={submit} className="mt-8 space-y-4" noValidate>
            <Field label="Work email" htmlFor="email">
              <Input id="email" type="email" autoComplete="username" placeholder="name@aeropath.co.tz" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus className="h-11" />
            </Field>
            <Field label="Password" htmlFor="password" hint="Prototype: any password works for the demo emails.">
              <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="h-11" />
            </Field>
            {error && <Banner tone="error">{error}</Banner>}
            <Button type="submit" size="lg" className="w-full" disabled={!hydrated}>
              Sign in <ArrowRight />
            </Button>
          </form>

          <div className="my-8 flex items-center gap-3 text-[13px] font-medium text-ink-4">
            <span className="h-px flex-1 bg-rule" />
            or sign in as a demo user
            <span className="h-px flex-1 bg-rule" />
          </div>

          <ul className="space-y-2.5" aria-label="Demo users">
            {!hydrated &&
              [0, 1, 2, 3].map((i) => (
                <li key={i} className="h-[68px] animate-pulse rounded-xl border border-rule bg-card" />
              ))}
            {users.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => enter(u)}
                  disabled={!u.active}
                  aria-label={`Sign in as ${u.name}`}
                  className="group flex w-full items-center gap-3.5 rounded-xl border border-rule bg-card p-3.5 text-left shadow-card transition-colors hover:border-brand-300 hover:bg-band-hover disabled:opacity-50"
                >
                  <UserMark user={u} size="md" className="size-10 text-sm" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[15px] font-semibold text-ink">{u.name}</span>
                      <span className="rounded-full bg-canvas-2 px-2 py-0.5 text-xs font-semibold text-ink-2">{ROLE_LABEL[u.role]}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-[13px] text-ink-3">{u.active ? ROLE_LINE[u.role] : "Deactivated"}</span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-ink-4 transition-transform group-hover:translate-x-0.5 group-hover:text-brand-600" />
                </button>
              </li>
            ))}
          </ul>

          <p className="mt-8 text-[13px] leading-5 text-ink-3">Prototype: all data lives in this browser and resets from Settings → Demo data. Nothing is sent anywhere.</p>
        </div>
      </main>
    </div>
  );
}
