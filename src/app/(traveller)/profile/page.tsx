"use client";

import Link from "next/link";
import { useState } from "react";
import { BookUser, CreditCard, FileText, Plus, Save, Shield, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { Pill } from "@/components/shared/status-chip";
import { useSession } from "@/hooks/use-session";
import { useStore } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";
import { useIsPast } from "@/hooks/use-now";
import { admin } from "@/lib/api";
import { ROLE_LABELS } from "@/lib/domain/permissions";
import { formatDate, initials } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SavedTraveller } from "@/lib/domain/types";

const BLANK: SavedTraveller = { id: "", title: "Mr", firstName: "", lastName: "", dateOfBirth: "", nationality: "TZ", phone: "", email: "" };

/** T22 · Profile. Personal details, saved travellers, documents, payment methods. */
export default function ProfilePage() {
  const s = useSession();
  const hydrated = useStore((st) => st.hydrated);
  const bookings = useStore(useShallow((st) => Object.values(st.bookings).filter((b) => b.buyerUserId === s.user?.id)));
  const [draft, setDraft] = useState<SavedTraveller>(BLANK);
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const isPast = useIsPast();

  if (!hydrated) return <Wrap><div className="h-40 animate-pulse rounded-xl bg-muted" /></Wrap>;

  if (!s.user) {
    return (
      <Wrap>
        <EmptyState
          icon={UserRound}
          title="Sign in to see your profile"
          description="Saved travellers, documents and payment methods live behind sign in so they follow you across devices."
          action={<Button asChild><Link href="/login">Sign in</Link></Button>}
        />
      </Wrap>
    );
  }

  const user = s.user;
  const travellers = user.savedTravellers;

  function saveTraveller() {
    if (!draft.firstName.trim() || !draft.lastName.trim()) return toast.error("First and last name are required");
    admin.saveTraveller(user.id, { ...draft, id: draft.id || `trv_${Date.now()}` });
    toast.success(draft.id ? "Traveller updated" : "Traveller saved", { description: "You can reuse them at checkout without retyping (WCAG 3.3.7)." });
    setDraft(BLANK);
    setEditing(null);
  }

  function saveProfile() {
    admin.updateUser(user.id, { name: name || user.name, phone: phone || user.phone, email: email || user.email });
    toast.success("Profile updated");
  }

  return (
    <Wrap>
      <div className="mb-6 flex flex-wrap items-center gap-4">
        <span className={cn("flex size-16 items-center justify-center rounded-full bg-gradient-to-br text-xl font-semibold text-white", user.avatarTone)}>
          {initials(user.name)}
        </span>
        <div>
          <h1 className="font-display text-3xl">{user.name}</h1>
          <p className="text-sm text-muted-foreground">
            {ROLE_LABELS[s.roleId]}{s.org ? ` · ${s.org.name}` : ""} · member since {formatDate(user.createdAt)}
          </p>
        </div>
        <div className="ml-auto flex gap-2">
          <Pill tone="success">{bookings.length} booking{bookings.length === 1 ? "" : "s"}</Pill>
        </div>
      </div>

      <Tabs defaultValue="personal">
        <TabsList>
          <TabsTrigger value="personal">Personal</TabsTrigger>
          <TabsTrigger value="travellers">Saved travellers</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="payment">Payment</TabsTrigger>
          <TabsTrigger value="privacy">Privacy</TabsTrigger>
        </TabsList>

        <TabsContent value="personal" className="mt-4">
          <section className="max-w-xl rounded-xl border bg-card p-4">
            <h2 className="font-medium">Your details</h2>
            <div className="mt-3 grid gap-3">
              <div><Label htmlFor="nm">Full name</Label><Input id="nm" defaultValue={user.name} onChange={(e) => setName(e.target.value)} className="mt-1" /></div>
              <div><Label htmlFor="ph">Mobile number</Label><Input id="ph" defaultValue={user.phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" className="mt-1" />
                <p className="mt-1 text-xs text-muted-foreground">Used for OTP sign in, mobile money and voucher delivery. Stored in E.164 format.</p>
              </div>
              <div><Label htmlFor="em">Email</Label><Input id="em" type="email" defaultValue={user.email} onChange={(e) => setEmail(e.target.value)} className="mt-1" /></div>
              <div>
                <Label htmlFor="loc">Language</Label>
                <Select defaultValue={user.locale} onValueChange={(v) => { admin.updateUser(user.id, { locale: v }); toast.success("Language updated", { description: "Notification templates follow your locale." }); }}>
                  <SelectTrigger id="loc" className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="en">English</SelectItem><SelectItem value="sw">Kiswahili</SelectItem></SelectContent>
                </Select>
              </div>
              <Button className="w-fit gap-1.5" onClick={saveProfile}><Save className="size-4" aria-hidden /> Save changes</Button>
            </div>
          </section>
        </TabsContent>

        <TabsContent value="travellers" className="mt-4 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Saved travellers are prefilled at checkout so nobody retypes a passport number.</p>
            <Dialog onOpenChange={(o) => { if (!o) { setDraft(BLANK); setEditing(null); } }}>
              <DialogTrigger asChild><Button className="gap-1.5"><Plus className="size-4" aria-hidden /> Add traveller</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{editing ? "Edit traveller" : "Add a traveller"}</DialogTitle></DialogHeader>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="sm:col-span-2 grid grid-cols-[90px_1fr_1fr] gap-2">
                    <div>
                      <Label htmlFor="t-title">Title</Label>
                      <Select value={draft.title} onValueChange={(v) => setDraft({ ...draft, title: v as SavedTraveller["title"] })}>
                        <SelectTrigger id="t-title" className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>{["Mr", "Mrs", "Ms", "Dr"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div><Label htmlFor="t-fn">First name</Label><Input id="t-fn" value={draft.firstName} onChange={(e) => setDraft({ ...draft, firstName: e.target.value })} className="mt-1" /></div>
                    <div><Label htmlFor="t-ln">Last name</Label><Input id="t-ln" value={draft.lastName} onChange={(e) => setDraft({ ...draft, lastName: e.target.value })} className="mt-1" /></div>
                  </div>
                  <div><Label htmlFor="t-dob">Date of birth</Label><Input id="t-dob" type="date" value={draft.dateOfBirth} onChange={(e) => setDraft({ ...draft, dateOfBirth: e.target.value })} className="mt-1" /></div>
                  <div><Label htmlFor="t-nat">Nationality</Label><Input id="t-nat" value={draft.nationality} onChange={(e) => setDraft({ ...draft, nationality: e.target.value.toUpperCase().slice(0, 2) })} className="mt-1" /></div>
                  <div><Label htmlFor="t-ph">Phone</Label><Input id="t-ph" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} className="mt-1" /></div>
                  <div><Label htmlFor="t-em">Email</Label><Input id="t-em" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} className="mt-1" /></div>
                  <div><Label htmlFor="t-pp">Passport number</Label><Input id="t-pp" value={draft.passportNumber ?? ""} onChange={(e) => setDraft({ ...draft, passportNumber: e.target.value.toUpperCase() })} className="mt-1" /></div>
                  <div><Label htmlFor="t-pe">Passport expiry</Label><Input id="t-pe" type="date" value={draft.passportExpiry ?? ""} onChange={(e) => setDraft({ ...draft, passportExpiry: e.target.value })} className="mt-1" /></div>
                </div>
                <DialogFooter><Button onClick={saveTraveller}>Save traveller</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {travellers.length === 0 ? (
            <EmptyState icon={BookUser} title="No saved travellers yet" description="Add the people you travel with and checkout gets much shorter." />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {travellers.map((t) => (
                <div key={t.id} className="rounded-xl border bg-card p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{t.title} {t.firstName} {t.lastName}</p>
                      <p className="text-xs text-muted-foreground">{t.nationality} · born {t.dateOfBirth || "—"}</p>
                      {t.passportNumber ? <p className="mt-1 font-mono text-xs">{t.passportNumber}{t.passportExpiry ? ` · expires ${formatDate(t.passportExpiry)}` : ""}</p> : null}
                      <p className="mt-1 text-xs text-muted-foreground">{t.phone} · {t.email}</p>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon-sm" aria-label={`Edit ${t.firstName}`} onClick={() => { setDraft(t); setEditing(t.id); toast.info("Open “Add traveller” to edit", { description: "Fields are prefilled." }); }}>
                        <BookUser className="size-4" />
                      </Button>
                      <Button variant="ghost" size="icon-sm" aria-label={`Remove ${t.firstName}`} className="text-muted-foreground hover:text-destructive" onClick={() => { admin.removeTraveller(user.id, t.id); toast.info("Traveller removed"); }}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="documents" className="mt-4">
          <section className="rounded-xl border bg-card p-4">
            <h2 className="flex items-center gap-1.5 font-medium"><FileText className="size-4" aria-hidden /> Travel documents</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Passports on file for your saved travellers. Document numbers are encrypted at rest with a separate key.
            </p>
            <ul className="mt-3 divide-y">
              {travellers.filter((t) => t.passportNumber).map((t) => (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span className="text-sm">{t.firstName} {t.lastName}</span>
                  <span className="flex items-center gap-3">
                    <span className="font-mono text-xs">{t.passportNumber}</span>
                    {t.passportExpiry ? (
                      isPast(t.passportExpiry, -180 * 86_400_000)
                        ? <Pill tone="warning">Expires {formatDate(t.passportExpiry)}</Pill>
                        : <Pill tone="success">Valid to {formatDate(t.passportExpiry)}</Pill>
                    ) : null}
                  </span>
                </li>
              ))}
              {travellers.filter((t) => t.passportNumber).length === 0 ? <li className="py-4 text-sm text-muted-foreground">No documents on file.</li> : null}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              Most destinations require a passport valid for six months beyond your travel date. We warn you at checkout if one is close.
            </p>
          </section>
        </TabsContent>

        <TabsContent value="payment" className="mt-4">
          <section className="rounded-xl border bg-card p-4">
            <h2 className="flex items-center gap-1.5 font-medium"><CreditCard className="size-4" aria-hidden /> Payment methods</h2>
            <ul className="mt-3 space-y-2">
              <li className="flex items-center justify-between rounded-lg border p-3">
                <span><span className="block text-sm font-medium">M-Pesa</span><span className="text-xs text-muted-foreground">{user.phone}</span></span>
                <Pill tone="success">Default</Pill>
              </li>
              <li className="flex items-center justify-between rounded-lg border p-3">
                <span><span className="block text-sm font-medium">Visa •••• 4242</span><span className="text-xs text-muted-foreground">Expires 09/29</span></span>
                <Button variant="ghost" size="sm" onClick={() => toast.info("Card removed")}>Remove</Button>
              </li>
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              We never store full card numbers — they are tokenised by the gateway. Mobile money needs only your number.
            </p>
          </section>
        </TabsContent>

        <TabsContent value="privacy" className="mt-4">
          <section className="max-w-2xl rounded-xl border bg-card p-4">
            <h2 className="flex items-center gap-1.5 font-medium"><Shield className="size-4" aria-hidden /> Your data</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Aeropath processes your data under Tanzania&rsquo;s Personal Data Protection Act 2022.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => toast.success("Export requested", { description: "We email a machine-readable copy within 30 days." })}>Export my data</Button>
              <Button variant="outline" size="sm" onClick={() => toast.info("Erasure request logged", { description: "Personal fields are pseudonymised; financial records are retained for the statutory period." })}>Request erasure</Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Erasure pseudonymises your personal fields while preserving the ledger, because financial records carry a statutory
              retention period and are exempt from deletion.
            </p>
          </section>
        </TabsContent>
      </Tabs>
    </Wrap>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-[1100px] px-4 py-6">{children}</div>;
}
