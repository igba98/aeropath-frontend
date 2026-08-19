"use client";

import { Activity, AlertTriangle, CheckCircle2, Plug, RefreshCw, XCircle } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, StatTile } from "@/components/chrome/console-shell";
import { Pill } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { useSession } from "@/hooks/use-session";
import { useStore } from "@/lib/store";
import { admin } from "@/lib/api";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const KIND_LABEL = { payment: "Payment rails", supplier: "Supplier connectors", messaging: "Messaging", search: "Search", storage: "Storage" } as const;

/** X05 · Integrations. Health, keys and retry for everything we depend on. */
export default function IntegrationsPage() {
  const s = useSession();
  const integrations = useStore((st) => st.integrations);

  if (!s.hydrated) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;
  const canManage = s.can("INTEGRATIONS:manage");

  const all = Object.values(integrations);
  const down = all.filter((i) => i.status === "down");
  const degraded = all.filter((i) => i.status === "degraded");
  const kinds = Array.from(new Set(all.map((i) => i.kind)));

  return (
    <>
      <PageHeader title="Integrations" code="X05" description="Every external dependency, its health and its recovery action. Alert on the symptom the user feels, not on the cause." />

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <StatTile label="Integrations" value={all.length} icon={Plug} />
        <StatTile label="Healthy" value={all.filter((i) => i.status === "healthy").length} tone="success" icon={CheckCircle2} />
        <StatTile label="Degraded" value={degraded.length} tone={degraded.length ? "warning" : "default"} icon={AlertTriangle} />
        <StatTile label="Down" value={down.length} tone={down.length ? "danger" : "default"} icon={XCircle} />
      </div>

      {down.length ? (
        <div className="mb-4 rounded-xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="flex items-center gap-1.5 font-medium text-destructive"><XCircle className="size-4" aria-hidden /> {down.map((i) => i.name).join(", ")} unavailable</p>
          <p className="mt-0.5 text-muted-foreground">
            Search degrades to static fixtures while a supplier connector is down, with a banner shown to travellers.
            Retry below, or kill the affected rail from feature flags.
          </p>
        </div>
      ) : null}

      <div className="space-y-5">
        {kinds.map((kind) => (
          <section key={kind}>
            <h2 className="mb-2 font-medium">{KIND_LABEL[kind]}</h2>
            <div className="grid gap-2">
              {all.filter((i) => i.kind === kind).map((i) => (
                <div key={i.id} className={cn("flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4", i.status === "down" && "border-destructive/40", i.status === "degraded" && "border-warning/40")}>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{i.name}</span>
                      {i.status === "healthy" ? <Pill tone="success" icon={CheckCircle2}>Healthy</Pill>
                        : i.status === "degraded" ? <Pill tone="warning" icon={AlertTriangle}>Degraded</Pill>
                        : <Pill tone="danger" icon={XCircle}>Down</Pill>}
                    </div>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Activity className="size-3" aria-hidden /> {i.successRatePct.toFixed(1)}% success</span>
                      <span className="font-mono">{i.keyMasked}</span>
                      <span>checked {relativeTime(i.lastCheckAt)}</span>
                    </p>
                    <div className="mt-1.5 h-1.5 w-40 overflow-hidden rounded-full bg-muted">
                      <div className={cn("h-full rounded-full", i.successRatePct > 95 ? "bg-success" : i.successRatePct > 85 ? "bg-warning" : "bg-destructive")} style={{ width: `${i.successRatePct}%` }} />
                    </div>
                  </div>
                  <Button
                    variant="outline" size="sm" className="gap-1.5" disabled={!canManage || i.status === "healthy"}
                    onClick={() => { admin.retryIntegration(i.id); toast.success(`${i.name} reconnected`, { description: "Health check passed and the connector is back in rotation." }); }}
                  >
                    <RefreshCw className="size-3.5" aria-hidden /> Retry
                  </Button>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
