"use client";

import { useMemo, useState } from "react";
import { Megaphone, Pause, Pencil, Play, Plus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, StatTile } from "@/components/chrome/console-shell";
import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { MoneyText } from "@/components/shared/money-text";
import { Pill } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useSession } from "@/hooks/use-session";
import { useStore } from "@/lib/store";
import { admin } from "@/lib/api";
import { formatDate } from "@/lib/format";
import type { PromoCode, Vertical } from "@/lib/domain/types";
import { AccessDenied, Field, Note, ProgressBar, Section } from "@/features/backoffice/ui";

const VERTICALS: Vertical[] = ["stay", "flight", "tour", "transfer"];
const STATUSES: PromoCode["status"][] = ["active", "scheduled", "paused", "expired"];

const TONE: Record<PromoCode["status"], "success" | "info" | "warning" | "neutral"> = {
  active: "success",
  scheduled: "info",
  paused: "warning",
  expired: "neutral",
};

const blank = (): PromoCode => ({
  id: "",
  code: "",
  description: "",
  discountType: "pct",
  discountValue: 10,
  verticals: ["stay"],
  budgetMinor: 5_000_000,
  usedMinor: 0,
  usageLimit: 100,
  usedCount: 0,
  validFrom: new Date().toISOString(),
  validTo: new Date(Date.now() + 30 * 86_400_000).toISOString(),
  status: "scheduled",
});

/** M03 · Offers and promos. Code, discount rule, applicability, budget cap, usage limit, validity. */
export default function PromosScreen() {
  const session = useSession();
  const promos = useStore((s) => s.promos);
  const [editing, setEditing] = useState<PromoCode | null>(null);

  const rows = useMemo(() => Object.values(promos).sort((a, b) => (a.status === b.status ? a.code.localeCompare(b.code) : STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status))), [promos]);

  const totalBudget = rows.reduce((s, p) => s + p.budgetMinor, 0);
  const totalUsed = rows.reduce((s, p) => s + p.usedMinor, 0);
  const activeCount = rows.filter((p) => p.status === "active").length;
  const redemptions = rows.reduce((s, p) => s + p.usedCount, 0);

  // Same reason as the other console screens: derived values differ until the store hydrates.
  if (!session.hydrated) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;

  if (session.hydrated && !session.can("PROMO:create") && !session.can("CONTENT:edit") && !session.can("PROMO:create_limited")) {
    return <AccessDenied what="Offers and promos" needs={`${session.roleLabel} cannot create promotions. Content Editor, Finance Manager, Operations Manager or an admin role is required.`} />;
  }

  function save(p: PromoCode) {
    const { id, ...rest } = p;
    admin.upsertPromo(id ? { ...rest, id } : rest);
    setEditing(null);
    toast.success(id ? `${p.code} updated` : `${p.code} created`, {
      description: `${p.discountType === "pct" ? `${p.discountValue}% off` : `TZS ${p.discountValue.toLocaleString()} off`} · budget cap TZS ${p.budgetMinor.toLocaleString()} · ${p.status}`,
    });
  }

  function toggleStatus(p: PromoCode) {
    const next: PromoCode = { ...p, status: p.status === "active" ? "paused" : "active" };
    const { id, ...rest } = next;
    admin.upsertPromo({ ...rest, id });
    toast.success(`${p.code} ${next.status === "active" ? "activated" : "paused"}`, { description: next.status === "active" ? "Checkout will accept this code again." : "Checkout will now reject this code." });
  }

  const columns: Column<PromoCode>[] = [
    {
      key: "code",
      header: "Code",
      render: (p) => (
        <div>
          <p className="font-mono text-sm font-semibold">{p.code}</p>
          <p className="max-w-[260px] truncate text-[11px] text-muted-foreground">{p.description}</p>
        </div>
      ),
    },
    {
      key: "rule",
      header: "Discount",
      render: (p) => (p.discountType === "pct" ? <span className="tabular-nums">{p.discountValue}%</span> : <MoneyText minor={p.discountValue} size="sm" />),
    },
    {
      key: "applies",
      header: "Applies to",
      render: (p) => <span className="text-xs">{p.verticals.length === 4 ? "All verticals" : p.verticals.join(", ")}</span>,
    },
    {
      key: "budget",
      header: "Budget burn-down",
      render: (p) => (
        <div className="min-w-[160px]">
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <MoneyText minor={p.usedMinor} size="xs" compact />
            <span className="text-muted-foreground">of <MoneyText minor={p.budgetMinor} size="xs" compact /></span>
          </div>
          <ProgressBar used={p.usedMinor} total={p.budgetMinor} label={`${p.budgetMinor ? Math.round((p.usedMinor / p.budgetMinor) * 100) : 0}% of budget spent`} />
        </div>
      ),
    },
    {
      key: "usage",
      header: "Redemptions",
      numeric: true,
      render: (p) => <span className="tabular-nums">{p.usedCount} / {p.usageLimit}</span>,
    },
    {
      key: "validity",
      header: "Valid",
      render: (p) => <span className="text-xs text-muted-foreground">{formatDate(p.validFrom)} → {formatDate(p.validTo)}</span>,
    },
    { key: "status", header: "Status", render: (p) => <Pill tone={TONE[p.status]}>{p.status}</Pill> },
    {
      key: "actions",
      header: "",
      render: (p) => (
        <div className="flex justify-end gap-1">
          {p.status === "active" || p.status === "paused" ? (
            <Button variant="ghost" size="sm" onClick={() => toggleStatus(p)}>
              {p.status === "active" ? <><Pause className="size-4" aria-hidden /> Pause</> : <><Play className="size-4" aria-hidden /> Activate</>}
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={() => setEditing(p)}><Pencil className="size-4" aria-hidden /> Edit</Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Offers & promos"
        code="M03"
        description="A promo code is a rule plus two caps: money (budget) and volume (usage limit). Checkout refuses the code once either cap is hit."
        actions={<Button onClick={() => setEditing(blank())}><Plus className="size-4" aria-hidden /> New promo</Button>}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Active codes" value={activeCount} hint={`${rows.length} total`} icon={Megaphone} />
        <StatTile label="Budget committed" value={<MoneyText minor={totalBudget} compact />} hint="Across every promo" />
        <StatTile label="Discount given" value={<MoneyText minor={totalUsed} compact />} hint={`${totalBudget ? Math.round((totalUsed / totalBudget) * 100) : 0}% of committed budget`} tone={totalUsed / Math.max(1, totalBudget) > 0.7 ? "warning" : "default"} />
        <StatTile label="Redemptions" value={redemptions} hint="Bookings that used a code" />
      </div>

      <Section title="Promotions" description="Sorted with live codes first.">
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(p) => p.id}
          caption="Promotional codes"
          empty={<EmptyState icon={Megaphone} title="No promos" description="Create a code to start merchandising an offer." action={<Button onClick={() => setEditing(blank())}>New promo</Button>} />}
        />
      </Section>

      <div className="mt-4">
        <Note title="Why two caps">
          A percentage discount on an unbounded number of bookings has no ceiling, so every code carries a budget cap in money and a
          usage limit in count. The burn-down bar is computed from the promo’s own <code>usedMinor</code> against <code>budgetMinor</code>;
          when it reaches 100% the code stops applying even if the validity window is still open.
        </Note>
      </div>

      <PromoDialog promo={editing} onClose={() => setEditing(null)} onSave={save} />
    </div>
  );
}

function PromoDialog({ promo, onClose, onSave }: { promo: PromoCode | null; onClose: () => void; onSave: (p: PromoCode) => void }) {
  const [form, setForm] = useState<PromoCode>(promo ?? blank());
  const [syncKey, setSyncKey] = useState<string | null>(null);

  const key = promo ? `${promo.id}:${promo.code}` : null;
  if (promo && syncKey !== key) {
    setSyncKey(key);
    setForm(promo);
  }

  const set = (patch: Partial<PromoCode>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <Dialog open={Boolean(promo)} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{form.id ? `Edit ${form.code}` : "New promo code"}</DialogTitle>
          <DialogDescription>Saved through admin.upsertPromo, which writes a PROMO_UPSERT audit entry.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Code" htmlFor="pr-code">
            <Input id="pr-code" value={form.code} onChange={(e) => set({ code: e.target.value.toUpperCase().replace(/\s/g, "") })} placeholder="KARIBU10" className="font-mono" />
          </Field>
          <Field label="Status">
            <Select value={form.status} onValueChange={(v) => set({ status: v as PromoCode["status"] })}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Description" htmlFor="pr-desc" className="sm:col-span-2">
            <Input id="pr-desc" value={form.description} onChange={(e) => set({ description: e.target.value })} placeholder="10% off first stay booking" />
          </Field>
          <Field label="Discount type">
            <Select value={form.discountType} onValueChange={(v) => set({ discountType: v as PromoCode["discountType"] })}>
              <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="pct">Percentage off</SelectItem>
                <SelectItem value="fixed">Fixed amount off (TZS)</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={form.discountType === "pct" ? "Percent" : "Amount (TZS)"} htmlFor="pr-val">
            <Input id="pr-val" type="number" min={0} value={form.discountValue} onChange={(e) => set({ discountValue: Number(e.target.value) })} />
          </Field>
          <Field label="Budget cap (TZS)" htmlFor="pr-budget">
            <Input id="pr-budget" type="number" min={0} value={form.budgetMinor} onChange={(e) => set({ budgetMinor: Number(e.target.value) })} />
          </Field>
          <Field label="Usage limit" htmlFor="pr-limit">
            <Input id="pr-limit" type="number" min={0} value={form.usageLimit} onChange={(e) => set({ usageLimit: Number(e.target.value) })} />
          </Field>
          <Field label="Valid from" htmlFor="pr-from">
            <Input id="pr-from" type="date" value={form.validFrom.slice(0, 10)} onChange={(e) => set({ validFrom: new Date(e.target.value + "T00:00:00Z").toISOString() })} />
          </Field>
          <Field label="Valid to" htmlFor="pr-to">
            <Input id="pr-to" type="date" value={form.validTo.slice(0, 10)} onChange={(e) => set({ validTo: new Date(e.target.value + "T23:59:59Z").toISOString() })} />
          </Field>
          <div className="sm:col-span-2">
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">Applies to</p>
            <div className="flex flex-wrap gap-3">
              {VERTICALS.map((v) => (
                <label key={v} className="flex items-center gap-2 text-sm capitalize">
                  <Checkbox
                    checked={form.verticals.includes(v)}
                    onCheckedChange={(on) => set({ verticals: on ? [...form.verticals, v] : form.verticals.filter((x) => x !== v) })}
                    aria-label={`Applies to ${v}`}
                  />
                  {v}
                </label>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!form.code.trim() || !form.verticals.length} onClick={() => onSave(form)}>Save promo</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
