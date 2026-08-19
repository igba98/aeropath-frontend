"use client";

import { useState } from "react";
import { Beaker, Clock, Coins, Percent, Save, Timer, Zap } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/chrome/console-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useSession } from "@/hooks/use-session";
import { useStore } from "@/lib/store";
import { admin } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { PaymentSimMode } from "@/lib/store";

const SIM_MODES: Array<{ id: PaymentSimMode; label: string; body: string; tone: "success" | "warning" | "danger" }> = [
  { id: "success", label: "Success", body: "The provider confirms about four seconds after the push. The booking moves to paid and a supplier confirmation is requested.", tone: "success" },
  { id: "timeout", label: "Timeout", body: "The provider never answers. The pending screen counts down 120 seconds, then offers manual reference entry.", tone: "warning" },
  { id: "lost_callback", label: "Lost callback", body: "The customer pays but the callback never arrives — identical to a timeout from the customer's side. This is the path that creates reconciliation work.", tone: "warning" },
  { id: "duplicate_callback", label: "Duplicate callback", body: "The provider delivers the same callback twice. The idempotency key must absorb the second one: exactly one ledger entry, one state transition.", tone: "warning" },
  { id: "fail", label: "Failure", body: "The customer declines or has insufficient funds. The hold is released and the items move to payment failed.", tone: "danger" },
];

/** X07 · System settings, plus the prototype simulators that make every failure path reachable. */
export default function SystemSettingsPage() {
  const s = useSession();
  const settings = useStore((st) => st.settings);
  const simulator = useStore((st) => st.simulator);
  const [draft, setDraft] = useState(settings);

  if (!s.hydrated) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;

  const canEdit = s.can("SETTINGS:edit");
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);

  function save() {
    admin.updateSettings(draft);
    toast.success("Settings saved", { description: "Changes apply immediately and are written to the audit log." });
  }

  return (
    <>
      <PageHeader
        title="System settings"
        code="X07"
        description="Platform-wide values held as data, not code — so a tax change or a longer hold does not need a deploy."
        actions={canEdit ? <Button className="gap-1.5" onClick={save} disabled={!dirty}><Save className="size-4" aria-hidden /> Save changes</Button> : null}
      />

      {!canEdit ? (
        <div className="mb-4 rounded-xl border border-warning/40 bg-warning/5 p-4 text-sm">
          <p className="font-medium">Read-only</p>
          <p className="mt-0.5 text-muted-foreground">Signed in as {s.roleLabel}. Editing platform settings requires Platform Admin or Super Admin.</p>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border bg-card p-4">
          <h2 className="flex items-center gap-1.5 font-medium"><Coins className="size-4" aria-hidden /> Currency and tax</h2>
          <p className="text-xs text-muted-foreground">Tax rules are data rows, never code branches, so a new market is a configuration change.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Num id="fx" label="USD → TZS rate" value={draft.fxUsdTzs} onChange={(v) => setDraft({ ...draft, fxUsdTzs: v })} disabled={!canEdit} hint="Fixed table in the prototype, refreshed manually" />
            <Num id="vat" label="VAT %" value={draft.vatPct} onChange={(v) => setDraft({ ...draft, vatPct: v })} disabled={!canEdit} hint="Tanzania standard rate" />
            <Num id="fee" label="Service fee %" value={draft.serviceFeePct} onChange={(v) => setDraft({ ...draft, serviceFeePct: v })} disabled={!canEdit} hint="Included in every displayed price" />
          </div>
          <p className="mt-3 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
            Settlement currency is fixed per booking at hold time; the display currency is a viewer preference.
            An all-in price of TZS 480,000 shows as about USD {(480_000 / draft.fxUsdTzs).toFixed(2)} at the current rate.
          </p>
        </section>

        <section className="rounded-xl border bg-card p-4">
          <h2 className="flex items-center gap-1.5 font-medium"><Timer className="size-4" aria-hidden /> Holds and SLAs</h2>
          <p className="text-xs text-muted-foreground">Oversell is worse than a slow checkout, so holds are pessimistic and swept every 60 seconds.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Num id="ttl" label="Hold TTL (minutes)" value={draft.holdTtlMinutes} onChange={(v) => setDraft({ ...draft, holdTtlMinutes: v })} disabled={!canEdit} hint="Stays and tours; flights use 20" />
            <Num id="appr" label="Approval hold (hours)" value={draft.approvalHoldHours} onChange={(v) => setDraft({ ...draft, approvalHoldHours: v })} disabled={!canEdit} hint="A 15 minute hold cannot survive a human approval loop" />
            <Num id="sla" label="Supplier SLA (hours)" value={draft.supplierSlaHours} onChange={(v) => setDraft({ ...draft, supplierSlaHours: v })} disabled={!canEdit} hint="After this, the item escalates to the ops queue" />
          </div>
        </section>
      </div>

      {/* Simulators */}
      <section className="mt-4 rounded-xl border border-brand-300 bg-brand-50/40 p-4">
        <h2 className="flex items-center gap-1.5 font-medium text-brand-text-strong"><Beaker className="size-4" aria-hidden /> Prototype simulators</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Payment providers and supplier desks are faked here so every state in the booking machine — including the failure
          states — is reachable on demand, without waiting on an integration.
        </p>

        <div className="mt-4">
          <p className="flex items-center gap-1.5 text-sm font-medium"><Zap className="size-4" aria-hidden /> Payment gateway outcome</p>
          <p className="text-xs text-muted-foreground">Applies to the next mobile money or card payment taken on the traveller site.</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {SIM_MODES.map((m) => {
              const active = simulator.paymentMode === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => { admin.setSimulator({ paymentMode: m.id }); toast.success(`Payment simulator: ${m.label}`, { description: "The next payment you take will behave this way." }); }}
                  aria-pressed={active}
                  className={cn(
                    "rounded-xl border p-3 text-left transition-all",
                    active ? "border-brand-500 bg-card ring-1 ring-brand-300" : "bg-card/60 hover:border-brand-300",
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-medium">{m.label}</span>
                    <span className={cn("size-2 rounded-full", m.tone === "success" ? "bg-success" : m.tone === "danger" ? "bg-destructive" : "bg-warning")} aria-hidden />
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">{m.body}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
          <div>
            <p className="flex items-center gap-1.5 text-sm font-medium"><Clock className="size-4" aria-hidden /> Supplier auto-confirm</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              When on, suppliers confirm instantly instead of sitting in the SLA queue. Leave it off to demonstrate the
              awaiting-supplier state, the two-hour SLA and the escalation to operations.
            </p>
          </div>
          <Switch
            checked={simulator.supplierAutoConfirm}
            onCheckedChange={(v) => { admin.setSimulator({ supplierAutoConfirm: v }); toast.success(v ? "Suppliers will auto-confirm" : "Suppliers must confirm manually"); }}
            aria-label="Supplier auto-confirm"
          />
        </div>

        <p className="mt-3 text-xs text-muted-foreground">
          Supplier confirmations and rejections can also be fired by hand from any booking in the operations console —
          that is the button that stands in for a real supplier integration.
        </p>
      </section>

      <section className="mt-4 rounded-xl border bg-card p-4">
        <h2 className="flex items-center gap-1.5 font-medium"><Percent className="size-4" aria-hidden /> What is deliberately faked</h2>
        <ul className="mt-2 grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
          {[
            ["Payment gateway", "Local simulator with every callback failure mode"],
            ["Supplier confirmation", "A back office button that fires the transition"],
            ["Flight inventory", "Static fixtures with realistic fare families"],
            ["Search relevance", "Rating and price sort, no ranking model"],
            ["FX rates", "Fixed table, refreshed manually above"],
            ["Voucher and invoice PDFs", "Generated as a toast, not a real document"],
          ].map(([k, v]) => (
            <li key={k} className="flex gap-2 rounded-lg border p-2.5">
              <span className="font-medium text-foreground">{k}</span>
              <span className="text-xs">{v}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

function Num({ id, label, value, onChange, disabled, hint }: { id: string; label: string; value: number; onChange: (v: number) => void; disabled?: boolean; hint?: string }) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} disabled={disabled} className="mt-1 tabular-nums" />
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
