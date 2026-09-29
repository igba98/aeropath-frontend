"use client";

import * as React from "react";
import { CircleCheck, CircleX, PlugZap } from "lucide-react";

import type { Settings } from "@/domain/types";
import { can } from "@/domain/permissions";
import { AMADEUS_OPERATIONS, LIVE_NOT_AVAILABLE, getProvider, toProviderError } from "@/providers";
import { useApp, useMe } from "@/store";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Field, FieldGrid } from "@/components/shared/field";
import { FilterSelect } from "@/components/shared/filter-select";
import { Section } from "@/components/shared/page";
import { StatusChip } from "@/components/shared/status-chip";
import { SaveBar, TabHeading, useSettingsDraft } from "./settings-kit";

type Amadeus = Settings["integrations"]["amadeus"];
type Mode = Amadeus["mode"];

const MODES: { value: Mode; label: string; hint: string }[] = [
  { value: "off", label: "Off", hint: "Agents paste the PNR or type flights in. Nothing is fetched." },
  { value: "mock", label: "Mock", hint: "“Fetch from Amadeus” reads the sample PNRs Z8K4QM, T5MV8C, W3JN6P and L9BX2D, with the latency and failures set below." },
  { value: "live", label: "Live", hint: LIVE_NOT_AVAILABLE },
];

const FAILURES: { value: Amadeus["mock"]["failure"]; label: string }[] = [
  { value: "none", label: "None — always succeeds" },
  { value: "timeout", label: "Timeout" },
  { value: "not_found", label: "PNR not found" },
  { value: "auth_error", label: "Sign-in rejected" },
  { value: "random", label: "Random (about 3 in 10 fail)" },
];

/** Operation names (PNR_Retrieve…) in mono; prose stays in the sans face. */
function OperationText({ text }: { text: string }) {
  const parts = text.split(/([A-Z][A-Za-z]*_[A-Za-z_]+)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^[A-Z][A-Za-z]*_[A-Za-z_]+$/.test(p) ? (
          <span key={i} className="font-mono whitespace-nowrap text-[13px] text-ink">
            {p}
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

/** Settings → Integrations: the Amadeus panel (Manager only). */
export function IntegrationsTab() {
  const me = useMe();
  const airlines = useApp((s) => s.db!.settings.airlines);
  const canEdit = can(me, "integration.manage");
  const { draft, setDraft, dirty, discard, save } = useSettingsDraft((s) => s.integrations.amadeus);
  const [error, setError] = React.useState<string | null>(null);
  const [ping, setPing] = React.useState<{ state: "idle" | "running" | "done"; ok?: boolean; message?: string; ms?: number; mode?: Mode }>({ state: "idle" });

  const set = (patch: Partial<Amadeus>) => setDraft((d) => ({ ...d, ...patch }));
  const setMock = (patch: Partial<Amadeus["mock"]>) => setDraft((d) => ({ ...d, mock: { ...d.mock, ...patch } }));

  const test = async () => {
    setPing({ state: "running" });
    const started = performance.now();
    try {
      const r = await getProvider({ integrations: { amadeus: draft }, airlines }).ping();
      setPing({ state: "done", ok: r.ok, message: r.message, ms: Math.round(performance.now() - started), mode: draft.mode });
    } catch (e) {
      setPing({ state: "done", ok: false, message: toProviderError(e).message, ms: Math.round(performance.now() - started), mode: draft.mode });
    }
  };

  const onSave = () => {
    if (!/^[A-Z0-9]{6,10}$/.test(draft.officeId.trim().toUpperCase())) return setError("The office ID is 6 to 10 letters and digits, e.g. DARTZ2100.");
    const r = save({ integrations: { amadeus: { ...draft, officeId: draft.officeId.trim().toUpperCase() } } });
    setError(r.ok ? null : r.error.message);
  };

  const current = MODES.find((m) => m.value === draft.mode)!;

  return (
    <div className="space-y-10">
      <TabHeading title="Integrations" description="How the back office talks to Amadeus. Screens always go through the same provider layer, so switching modes changes nothing else." />

      <section aria-labelledby="amadeus-h" className="border-t-[1.5px] border-rule-strong">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule py-3">
          <div className="flex items-center gap-2.5">
            <PlugZap className="size-4 text-ink-3" aria-hidden />
            <h3 id="amadeus-h" className="text-base font-semibold text-ink">
              Amadeus
            </h3>
            <StatusChip label={draft.mode === "mock" ? "Mock" : draft.mode === "live" ? "Live" : "Off"} tone={draft.mode === "mock" ? "blue" : "grey"} />
          </div>
          <span className="text-[13px] text-ink-3">Enterprise APIs (SOAP) · office {draft.officeId || "—"}</span>
        </div>

        <dl className="divide-y divide-rule">
          <div className="grid gap-2 py-4 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-6">
            <dt className="text-sm font-medium text-ink">Mode</dt>
            <dd className="space-y-2">
              <div role="radiogroup" aria-label="Amadeus mode" className="inline-flex rounded-md border border-rule-2 bg-canvas p-0.5">
                {MODES.map((m) => {
                  const on = m.value === draft.mode;
                  const btn = (
                    <button
                      key={m.value}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      aria-disabled={m.value === "live" || !canEdit || undefined}
                      onClick={() => m.value !== "live" && canEdit && set({ mode: m.value })}
                      className={cn(
                        "h-7 rounded-[4px] px-3 text-[13.5px] font-semibold transition-colors",
                        on ? "bg-paper text-ink shadow-[0_1px_2px_rgb(15_23_42/0.12)]" : "text-ink-3 hover:text-ink",
                        m.value === "live" && "cursor-not-allowed text-ink-4 hover:text-ink-4",
                      )}
                    >
                      {m.label}
                    </button>
                  );
                  return m.value === "live" ? (
                    <Tooltip key={m.value}>
                      <TooltipTrigger asChild>{btn}</TooltipTrigger>
                      <TooltipContent>{LIVE_NOT_AVAILABLE}</TooltipContent>
                    </Tooltip>
                  ) : (
                    btn
                  );
                })}
              </div>
              <p className="max-w-prose text-[13.5px] text-ink-3">{current.hint}</p>
            </dd>
          </div>

          <div className="grid gap-2 py-4 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-6">
            <dt className="text-sm font-medium text-ink">Connection</dt>
            <dd>
              <FieldGrid cols={2} className="max-w-[520px]">
                <Field label="Environment">
                  <FilterSelect label="Environment" value={draft.environment} onChange={(v) => set({ environment: v as Amadeus["environment"] })} options={[{ value: "test", label: "Test" }, { value: "production", label: "Production" }]} full />
                </Field>
                <Field label="Office ID" htmlFor="amd-office" hint="The agency's Amadeus office, e.g. DARTZ2100.">
                  <Input id="amd-office" value={draft.officeId} onChange={(e) => set({ officeId: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10) })} className="font-mono uppercase" />
                </Field>
              </FieldGrid>
            </dd>
          </div>

          <div className={cn("grid gap-2 py-4 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-6", draft.mode !== "mock" && "opacity-60")}>
            <dt className="text-sm font-medium text-ink">
              Mock options
              {draft.mode !== "mock" && <span className="block text-[13px] font-normal text-ink-3">Used when the mode is Mock.</span>}
            </dt>
            <dd>
              <FieldGrid cols={2} className="max-w-[520px]">
                <Field label="Simulated latency" labelAside={<span className="tnum text-[13px] text-ink-2">{draft.mock.latencyMs.toLocaleString("en-US")} ms</span>}>
                  <Slider min={0} max={3000} step={100} value={[draft.mock.latencyMs]} onValueChange={(v) => setMock({ latencyMs: v[0] ?? 0 })} aria-label="Simulated latency in milliseconds" className="h-8" />
                </Field>
                <Field label="Failure mode">
                  <FilterSelect label="Failure mode" value={draft.mock.failure} onChange={(v) => setMock({ failure: v as Amadeus["mock"]["failure"] })} options={FAILURES} full />
                </Field>
              </FieldGrid>
            </dd>
          </div>

          <div className="grid gap-2 py-4 sm:grid-cols-[180px_minmax(0,1fr)] sm:gap-6">
            <dt className="text-sm font-medium text-ink">Test connection</dt>
            <dd className="space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <Button variant="outline" onClick={test} loading={ping.state === "running"}>
                  Test connection
                </Button>
                <span className="text-[13px] text-ink-3">{dirty ? "Tests the settings shown here, before you save them." : "Tests the saved settings."}</span>
              </div>
              {ping.state === "done" && (
                <p role="status" className={cn("flex items-start gap-2 text-sm", ping.ok ? "text-[var(--st-green-fg)]" : "text-[var(--st-red-fg)]")}>
                  {ping.ok ? <CircleCheck className="mt-0.5 size-4 shrink-0" /> : <CircleX className="mt-0.5 size-4 shrink-0" />}
                  <span>
                    {ping.message}
                    <span className="tnum ml-2 text-[13px] text-ink-3">
                      {MODES.find((m) => m.value === ping.mode)?.label} · {ping.ms} ms
                    </span>
                  </span>
                </p>
              )}
            </dd>
          </div>
        </dl>
      </section>

      <Section title="Planned Amadeus operations" description="What each back-office action will call once the API contract is signed. Names and versions are confirmed against the Enterprise documentation then.">
        <Table className="min-w-[520px]">
          <TableHeader>
            <TableRow className="rule-head border-0">
              <TableHead className="h-auto w-[38%] px-0 pb-2 whitespace-normal first:pl-0">Back-office action</TableHead>
              <TableHead className="h-auto px-0 pb-2 whitespace-normal last:pr-0">Planned operation</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {AMADEUS_OPERATIONS.map((op) => (
              <TableRow key={op.action}>
                <TableCell className="py-2.5 pr-4 pl-0 align-top text-ink first:pl-0">{op.action}</TableCell>
                <TableCell className="px-0 py-2.5 align-top text-ink-2 last:pr-0">
                  <OperationText text={op.operation} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <SaveBar
        dirty={canEdit && dirty}
        error={error}
        onDiscard={() => {
          discard();
          setError(null);
        }}
        onSave={onSave}
      />
    </div>
  );
}
