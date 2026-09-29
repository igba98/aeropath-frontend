"use client";

import * as React from "react";
import { ClipboardPaste, UserRoundPlus, X } from "lucide-react";

import type { Client, Currency, FileSource, ID } from "@/domain/types";
import { useApp } from "@/store";
import { cn } from "@/lib/utils";
import { normalisePhone } from "@/domain/validation";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Combobox } from "@/components/shared/combobox";
import { Field } from "@/components/shared/field";
import { Segmented } from "@/components/shared/page";
import { ClientFields, type ClientDraft } from "@/components/clients/client-form";
import { TravellerDialog } from "@/components/clients/traveller-form";
import { PnrPaste, pnrReady, type PnrPasteValue } from "../pnr-paste";
import { autoMatchTravellers } from "@/providers/mappers/pnr-to-flight-line";

export const FILE_SOURCES: { value: FileSource; label: string }[] = [
  { value: "walk_in", label: "Walk-in" },
  { value: "phone", label: "Phone" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "Email" },
  { value: "corporate", label: "Corporate" },
];

export interface ClientStepValue {
  clientId?: ID;
  /** Inline new client (created when the step is confirmed). */
  newClient?: ClientDraft;
  travellerIds: ID[];
  currency: Currency;
  source: FileSource;
  /** PNR pasted up front: becomes the first flight draft on the next step. */
  pnr?: PnrPasteValue;
}

/** Find an existing client that matches a PNR's contacts or lead passenger. */
export function matchClientFromPnr(clients: Client[], pnr: PnrPasteValue): Client | undefined {
  const s = pnr.snapshot;
  if (!s) return undefined;
  const phones = s.contacts.filter((c) => c.type === "phone").map((c) => normalisePhone(c.value.replace(/[^\d+]/g, "")) ?? "");
  const emails = s.contacts.filter((c) => c.type === "email").map((c) => c.value.toLowerCase());
  const byContact = clients.find((c) => phones.includes(c.phone) || (c.email && emails.includes(c.email.toLowerCase())));
  if (byContact) return byContact;
  const lead = s.passengers.find((p) => p.paxType === "ADT") ?? s.passengers[0];
  if (!lead) return undefined;
  const full = `${lead.givenName} ${lead.surname}`.toLowerCase();
  return clients.find((c) => c.type === "individual" && c.name.toLowerCase() === full);
}

export function StepClient({ value, onChange, autoPaste, errors = {} }: { value: ClientStepValue; onChange: (v: ClientStepValue) => void; autoPaste?: boolean; errors?: Record<string, string> }) {
  const db = useApp((s) => s.db)!;
  const [showPaste, setShowPaste] = React.useState(Boolean(autoPaste || value.pnr));
  const [travellerDialog, setTravellerDialog] = React.useState(false);
  const clients = React.useMemo(() => Object.values(db.clients).filter((c) => !c.archived), [db.clients]);
  const client = value.clientId ? db.clients[value.clientId] : undefined;
  const travellers = client ? Object.values(db.travellers).filter((t) => t.clientId === client.id) : [];
  const set = (p: Partial<ClientStepValue>) => onChange({ ...value, ...p });

  const pickClient = (id: ID) => {
    const c = db.clients[id];
    const own = Object.values(db.travellers).filter((t) => t.clientId === id);
    set({
      clientId: id,
      newClient: undefined,
      currency: c?.defaultCurrency ?? value.currency,
      source: c?.type === "corporate" ? "corporate" : c?.source && c.source !== "referral" ? (c.source as FileSource) : value.source,
      travellerIds: own.length === 1 ? [own[0].id] : own.length <= 4 ? own.map((t) => t.id) : [],
    });
  };

  const startNew = (query: string) => {
    const digits = query.replace(/[^\d+]/g, "");
    const looksPhone = digits.length >= 6 && digits.length >= query.replace(/\s/g, "").length - 1;
    set({
      clientId: undefined,
      newClient: {
        type: "individual",
        name: looksPhone ? "" : query,
        phone: looksPhone ? query : "",
        email: "",
        address: "",
        tin: "",
        vrn: "",
        contactPerson: "",
        creditLimitMinor: null,
        paymentTermsDays: "",
        defaultCurrency: value.currency,
        source: value.source === "corporate" ? "" : value.source,
        notes: "",
      },
      travellerIds: [],
    });
  };

  const onPnr = (pnr: PnrPasteValue) => {
    const next: ClientStepValue = { ...value, pnr };
    if (pnrReady(pnr) && !value.clientId && !value.newClient) {
      const match = matchClientFromPnr(clients, pnr);
      if (match) {
        next.clientId = match.id;
        next.currency = match.defaultCurrency;
        const own = Object.values(db.travellers).filter((t) => t.clientId === match.id);
        const auto = autoMatchTravellers(pnr.snapshot!.passengers, own);
        next.travellerIds = Object.values(auto).filter((x): x is ID => Boolean(x));
        next.pnr = { ...pnr, map: Object.fromEntries(pnr.snapshot!.passengers.map((p) => [p.pnrPaxNo, auto[p.pnrPaxNo] ?? "new"])) };
      } else {
        const s = pnr.snapshot!;
        const lead = s.passengers.find((p) => p.paxType === "ADT") ?? s.passengers[0];
        const title = (w: string) => w.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
        next.newClient = {
          type: "individual",
          name: lead ? `${title(lead.givenName)} ${title(lead.surname)}` : "",
          phone: s.contacts.find((c) => c.type === "phone")?.value.replace(/[^\d+]/g, "") ?? "",
          email: s.contacts.find((c) => c.type === "email")?.value.replace("//", "@").toLowerCase() ?? "",
          address: "",
          tin: "",
          vrn: "",
          contactPerson: "",
          creditLimitMinor: null,
          paymentTermsDays: "",
          defaultCurrency: "USD",
          source: value.source === "corporate" ? "" : value.source,
          notes: "",
        };
        next.currency = "USD";
      }
    }
    onChange(next);
  };

  return (
    <div className="space-y-5">
      {!showPaste ? (
        <button
          type="button"
          onClick={() => setShowPaste(true)}
          className="flex w-full items-center gap-3 rounded-lg border border-dashed border-rule-2 px-4 py-3 text-left transition-colors hover:border-brand hover:bg-band-hover"
        >
          <ClipboardPaste className="size-5 text-brand" />
          <span>
            <span className="block text-sm font-semibold text-ink">Start from a PNR</span>
            <span className="block text-[13px] text-ink-3">Paste the Amadeus display; we find or create the client and travellers from it.</span>
          </span>
        </button>
      ) : (
        <div className="rounded-lg border border-rule p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold text-ink">Start from a PNR</span>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              onClick={() => {
                setShowPaste(false);
                set({ pnr: undefined });
              }}
              aria-label="Close PNR paste"
            >
              <X />
            </Button>
          </div>
          <PnrPaste value={value.pnr ?? { text: "", snapshot: null, map: {} }} onChange={onPnr} travellers={travellers} autoFocus />
        </div>
      )}

      <Field label="Client" required error={errors.client} hint={!client && !value.newClient ? "Search by name or phone. Not on file? Type the name and pick “Create”." : undefined}>
        <Combobox
          value={value.clientId}
          onChange={pickClient}
          options={clients
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((c) => ({ value: c.id, label: c.name, hint: c.phone, keywords: [c.email ?? "", c.contactPerson ?? "", c.phone.replace("+255", "0")] }))}
          placeholder={value.newClient ? "New client (below)" : "Search clients"}
          onCreate={startNew}
          createLabel={(q) => `Create new client “${q}”`}
          autoFocus={!autoPaste}
        />
      </Field>

      {value.newClient && (
        <div className="rounded-lg border border-[var(--st-blue-bd)] bg-[var(--st-blue-bg)]/40 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-semibold text-ink">
              <UserRoundPlus className="size-4 text-brand" /> New client
            </span>
            <Button type="button" variant="ghost" size="xs" onClick={() => set({ newClient: undefined })}>
              Search instead
            </Button>
          </div>
          <ClientFields compact value={value.newClient} onChange={(nc) => set({ newClient: nc, currency: nc.defaultCurrency })} errors={errors} />
        </div>
      )}

      {client && (
        <Field label="Travellers" labelAside={<Button type="button" variant="ghost" size="xs" onClick={() => setTravellerDialog(true)}><UserRoundPlus /> Add traveller</Button>}>
          {travellers.length === 0 ? (
            <p className="text-sm text-ink-3">No travellers on file for {client.name}. Add one, or paste a PNR and we&apos;ll create them.</p>
          ) : (
            <ul className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
              {travellers.map((t) => {
                const on = value.travellerIds.includes(t.id);
                return (
                  <li key={t.id}>
                    <label className={cn("flex cursor-pointer items-center gap-2.5 rounded-md border px-2.5 py-2 text-sm transition-colors", on ? "border-primary bg-band" : "border-rule hover:border-rule-2")}>
                      <Checkbox checked={on} onCheckedChange={(v) => set({ travellerIds: v === true ? [...value.travellerIds, t.id] : value.travellerIds.filter((x) => x !== t.id) })} />
                      <span className="min-w-0 flex-1 truncate font-mono text-[13.5px]">
                        {t.surname}/{t.givenName} {t.title}
                      </span>
                      <span className="text-xs text-ink-3">{t.paxType}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </Field>
      )}

      <div className="flex flex-wrap gap-x-8 gap-y-4">
        <Field label="Invoice in">
          <Segmented label="File currency" value={value.currency} onChange={(c) => set({ currency: c })} options={[{ value: "TZS", label: "TZS" }, { value: "USD", label: "USD" }]} />
        </Field>
        <Field label="Came in by">
          <Segmented label="Source" value={value.source} onChange={(s) => set({ source: s })} options={FILE_SOURCES.map((s) => ({ value: s.value, label: s.label }))} className="flex-wrap" />
        </Field>
      </div>

      {client && <TravellerDialog open={travellerDialog} onOpenChange={setTravellerDialog} clientId={client.id} onSaved={(id) => set({ travellerIds: [...value.travellerIds, id] })} />}
    </div>
  );
}
