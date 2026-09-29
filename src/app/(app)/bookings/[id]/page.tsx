"use client";

import * as React from "react";
import { Suspense } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { Plus, PackageOpen } from "lucide-react";

import type { ServiceLine } from "@/domain/types";
import { can } from "@/domain/permissions";
import { linesOfFile } from "@/domain/selectors/core";
import { useApp, useMe } from "@/store";
import { useModals } from "@/store/modals";
import { useNow } from "@/lib/use-now";
import { bookingRow } from "@/lib/view-models";

import { Button } from "@/components/ui/button";
import { EmptyState, TabsNav, useSetParam, useTab } from "@/components/shared/page";
import { LineCard } from "@/components/bookings/line-card";
import { LineDrawer } from "@/components/bookings/line-drawer";
import { BookingHeader, useIssueDocument } from "@/components/bookings/detail/header";
import { MoneyRail } from "@/components/bookings/detail/money-rail";
import { TravellersTab } from "@/components/bookings/detail/travellers-tab";
import { PaymentsTab } from "@/components/bookings/detail/payments-tab";
import { DocumentsTab } from "@/components/bookings/detail/documents-tab";
import { ActivityTab } from "@/components/bookings/detail/activity-tab";

export default function BookingPage() {
  return (
    <Suspense>
      <Booking />
    </Suspense>
  );
}

function Booking() {
  const { id } = useParams<{ id: string }>();
  const sp = useSearchParams();
  const setParam = useSetParam();
  const me = useMe();
  const db = useApp((s) => s.db)!;
  const now = useNow();
  const tab = useTab("services");
  const openPayment = useModals((s) => s.openPayment);
  const issueDoc = useIssueDocument();
  const [drawer, setDrawer] = React.useState<{
    open: boolean;
    line?: ServiceLine;
  }>({ open: false });

  const file = db.files[id];
  const row = React.useMemo(() => (file ? bookingRow(db, file, now) : null), [db, file, now]);
  const lines = React.useMemo(() => (file ? linesOfFile(db, file.id) : []), [db, file]);

  // One-click actions from the attention list: ?action=payment|invoice|issue&line=…
  const action = sp.get("action");
  const actionLine = sp.get("line");
  const handled = React.useRef(false);
  React.useEffect(() => {
    if (!file || handled.current || !action) return;
    handled.current = true;
    if (action === "payment") openPayment({ fileId: file.id, clientId: file.clientId });
    if (action === "invoice") issueDoc(file.id, "invoice");
    if (action !== "issue") setParam("action", null);
  }, [action, file, openPayment, issueDoc, setParam]);

  if (!file || !row) {
    return (
      <EmptyState
        icon={PackageOpen}
        title="Booking not found"
        body="It may have been removed by a demo data reset. Search for it by file number or PNR."
        action={
          <Button asChild variant="outline">
            <Link href="/bookings">Back to bookings</Link>
          </Button>
        }
      />
    );
  }

  const clientTravellers = Object.values(db.travellers).filter((t) => t.clientId === file.clientId);
  const canAdd = can(me, "line.edit") && row.status !== "cancelled";
  const active = lines.filter((l) => !["cancelled", "voided", "refunded", "exchanged"].includes(l.status));
  const inactive = lines.filter((l) => !active.includes(l));

  return (
    <>
      <BookingHeader row={row} onAddService={() => setDrawer({ open: true })} />

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          <TabsNav
            defaultTab="services"
            tabs={[
              { id: "services", label: "Services", count: active.length },
              {
                id: "travellers",
                label: "Travellers",
                count: file.travellerIds.length,
              },
              {
                id: "payments",
                label: "Payments",
                count: Object.values(db.payments).filter((p) => p.allocations.some((a) => a.fileId === file.id)).length,
              },
              {
                id: "documents",
                label: "Documents",
                count: Object.values(db.invoices).filter((i) => i.fileId === file.id).length,
              },
              { id: "activity", label: "Activity" },
            ]}
            className="gap-5"
          >
            {tab === "services" && (
              <div className="space-y-3">
                {lines.length === 0 ? (
                  <EmptyState
                    icon={PackageOpen}
                    title="No services yet"
                    body="Add the flight first. Paste the PNR from the Amadeus terminal and the rest fills in."
                    action={
                      canAdd && (
                        <Button onClick={() => setDrawer({ open: true })}>
                          <Plus /> Add service
                        </Button>
                      )
                    }
                  />
                ) : (
                  <>
                    {active.map((l) => (
                      <LineCard key={l.id} line={l} me={me} onEdit={() => setDrawer({ open: true, line: l })} autoIssue={action === "issue" && actionLine === l.id} />
                    ))}
                    {canAdd && (
                      <button
                        type="button"
                        onClick={() => setDrawer({ open: true })}
                        className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-rule-2 text-sm font-medium text-ink-3 transition-colors hover:border-ink-4/50 hover:bg-band-hover hover:text-ink"
                      >
                        <Plus className="size-4" /> Add a flight, hotel, transfer or other service
                      </button>
                    )}
                    {inactive.length > 0 && (
                      <details className="group pt-2">
                        <summary className="cursor-pointer text-sm font-medium text-ink-3 select-none hover:text-ink">
                          {inactive.length} cancelled, voided, refunded or exchanged line{inactive.length === 1 ? "" : "s"}
                        </summary>
                        <div className="mt-3 space-y-3">
                          {inactive.map((l) => (
                            <LineCard key={l.id} line={l} me={me} onEdit={() => setDrawer({ open: true, line: l })} />
                          ))}
                        </div>
                      </details>
                    )}
                  </>
                )}
              </div>
            )}
            {tab === "travellers" && <TravellersTab file={file} endDate={row.end} />}
            {tab === "payments" && <PaymentsTab file={file} />}
            {tab === "documents" && <DocumentsTab file={file} isDraft={row.status === "draft"} />}
            {tab === "activity" && <ActivityTab fileId={file.id} />}
          </TabsNav>
        </div>

        <MoneyRail row={row} now={now} />
      </div>

      <LineDrawer
        open={drawer.open}
        onOpenChange={(o) => setDrawer((d) => ({ ...d, open: o }))}
        fileId={file.id}
        clientId={file.clientId}
        fileCurrency={file.currency}
        travellers={clientTravellers}
        defaultTravellerIds={file.travellerIds}
        dates={{ start: row.start, end: row.end }}
        line={drawer.line}
      />
    </>
  );
}
