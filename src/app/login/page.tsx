"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, KeyRound, Phone, ShieldCheck, Store, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Logo } from "@/components/chrome/logo";
import { PersonaBar } from "@/components/chrome/persona-bar";
import { useStore } from "@/lib/store";
import { auth } from "@/lib/api";
import { PERSONA_IDS } from "@/lib/fixtures/users";
import { ROLE_LABELS, INTERNAL_ROLES, SUPPLIER_ROLES } from "@/lib/domain/permissions";
import { cn } from "@/lib/utils";
import type { User } from "@/lib/domain/types";

/** T21 · Auth. In the prototype this is a persona picker so every role in the matrix is reachable. */
export default function LoginPage() {
  const router = useRouter();
  const users = useStore((s) => s.users);
  const organisations = useStore((s) => s.organisations);
  const hydrated = useStore((s) => s.hydrated);
  const [otpSent, setOtpSent] = useState(false);
  const [phone, setPhone] = useState("+255 754 123 456");

  const personas = PERSONA_IDS.map((id) => users[id]).filter(Boolean) as User[];
  const groups = [
    { id: "travellers", label: "Travellers", icon: UserRound, roles: ["traveller"], hint: "The default consumer experience — no overlay." },
    { id: "suppliers", label: "Suppliers", icon: Store, roles: SUPPLIER_ROLES, hint: "Partner portal: products, availability, booking confirmations, payouts." },
    { id: "internal", label: "Back office", icon: ShieldCheck, roles: INTERNAL_ROLES, hint: "Operations, support, supply, content, finance and administration." },
  ];

  function signIn(userId: string, redirect: string) {
    auth.login(userId);
    toast.success(`Signed in as ${users[userId]?.name}`, { description: ROLE_LABELS[users[userId]?.grants[0]?.roleId ?? "traveller"] });
    router.push(redirect);
  }

  function redirectFor(u: User) {
    const role = u.grants[0]?.roleId ?? "traveller";
    if (SUPPLIER_ROLES.includes(role)) return "/partner/supplier";
    if (INTERNAL_ROLES.includes(role)) return "/admin";
    return "/";
  }

  return (
    <div className="flex min-h-dvh flex-col bg-muted/30">
      <PersonaBar />
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">
        <div className="mb-8 flex flex-col items-center text-center">
          <Logo />
          <h1 className="mt-6 font-display text-3xl">Sign in to Aeropath</h1>
          <p className="mt-2 max-w-lg text-sm text-muted-foreground">
            Phone OTP is the primary factor for travellers; email and password with TOTP for partners and staff.
            This prototype skips the real factors — pick a persona and the whole surface adapts to that role.
          </p>
        </div>

        <Tabs defaultValue="personas" className="mx-auto w-full max-w-5xl">
          <TabsList className="mx-auto">
            <TabsTrigger value="personas">Demo personas</TabsTrigger>
            <TabsTrigger value="otp">Phone OTP</TabsTrigger>
            <TabsTrigger value="password">Email & password</TabsTrigger>
          </TabsList>

          <TabsContent value="personas" className="mt-6 space-y-8">
            {groups.map((g) => {
              const list = personas.filter((p) => g.roles.includes(p.grants[0]?.roleId ?? "traveller"));
              if (!list.length) return null;
              return (
                <section key={g.id}>
                  <div className="mb-3 flex items-baseline gap-3">
                    <h2 className="font-display text-lg">{g.label}</h2>
                    <p className="text-xs text-muted-foreground">{g.hint}</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {list.map((u) => {
                      const org = u.organisationId ? organisations[u.organisationId] : undefined;
                      return (
                        <button
                          key={u.id}
                          onClick={() => signIn(u.id, redirectFor(u))}
                          disabled={!hydrated}
                          className="group flex items-start gap-3 rounded-xl border bg-card p-4 text-left transition-all hover:border-brand-300 hover:shadow-md disabled:opacity-60"
                        >
                          <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br text-sm font-semibold text-white", u.avatarTone)}>
                            {u.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center justify-between gap-2">
                              <span className="truncate font-medium">{u.name}</span>
                              <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-brand-text" aria-hidden />
                            </span>
                            <span className="mt-0.5 block text-xs font-medium text-brand-text">{ROLE_LABELS[u.grants[0]?.roleId ?? "traveller"]}</span>
                            {org ? <span className="mt-0.5 block truncate text-xs text-muted-foreground">{org.name}</span> : null}
                            {u.personaHint ? <span className="mt-1.5 block text-[11px] leading-relaxed text-muted-foreground">{u.personaHint}</span> : null}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
            <p className="rounded-xl border border-dashed bg-card p-4 text-center text-sm text-muted-foreground">
              Prefer to browse first? <Link href="/" className="font-medium text-brand-text underline underline-offset-2">Continue as a guest</Link> — you can still search, hold inventory and pay.
            </p>
          </TabsContent>

          <TabsContent value="otp" className="mt-6">
            <div className="mx-auto max-w-md rounded-2xl border bg-card p-6">
              {!otpSent ? (
                <>
                  <Label htmlFor="phone">Mobile number</Label>
                  <div className="mt-1.5 flex gap-2">
                    <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="+255 7xx xxx xxx" />
                    <Button onClick={() => { setOtpSent(true); toast.info("OTP sent", { description: "Prototype: any 6 digits will do." }); }} className="gap-1.5">
                      <Phone className="size-4" aria-hidden /> Send code
                    </Button>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">We send a 6 digit code by SMS. Numbers are stored in E.164 format.</p>
                </>
              ) : (
                <>
                  <Label htmlFor="otp">Enter the 6 digit code</Label>
                  <Input id="otp" inputMode="numeric" maxLength={6} placeholder="••••••" className="mt-1.5 text-center font-mono text-xl tracking-[0.4em]" />
                  <p className="mt-2 text-xs text-muted-foreground">Paste is never blocked (WCAG 3.3.8).</p>
                  <Button className="mt-4 w-full" onClick={() => signIn("usr_traveller", "/")}>Verify and continue</Button>
                </>
              )}
            </div>
          </TabsContent>

          <TabsContent value="password" className="mt-6">
            <div className="mx-auto max-w-md rounded-2xl border bg-card p-6">
              <Label htmlFor="email">Work email</Label>
              <Input id="email" type="email" defaultValue="reservations@serena.example" className="mt-1.5" />
              <Label htmlFor="pw" className="mt-4 block">Password</Label>
              <Input id="pw" type="password" defaultValue="••••••••••" className="mt-1.5" />
              <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <KeyRound className="size-3.5" aria-hidden /> TOTP is mandatory for internal roles above Support.
              </p>
              <Button className="mt-4 w-full" onClick={() => signIn("usr_supplier_admin", "/partner/supplier")}>Sign in</Button>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
