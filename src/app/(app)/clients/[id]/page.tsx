"use client";

import * as React from "react";
import { Suspense } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { CheckCircle2, Plus, UserPlus, X } from "lucide-react";

import { can } from "@/domain/permissions";
import { clientBalance, clientCreditUsage } from "@/domain/selectors/balances";
import { useApp, useMe } from "@/store";
import { useNow } from "@/lib/use-now";

import { Button } from "@/components/ui/button";
import { EmptyState, useSetParam } from "@/components/shared/page";
import { ClientHeader } from "@/components/clients/client-header";
import { ClientProfile, ClientSummary } from "@/components/clients/client-profile";
import { TravellersSection } from "@/components/clients/travellers-section";
import { TravellerDialog } from "@/components/clients/traveller-form";
import { ClientBookings } from "@/components/clients/client-bookings";
import { ClientStatement } from "@/components/clients/client-statement";

export default function ClientPage() {
  return (
    <Suspense>
      <ClientDetail />
    </Suspense>
  );
}

function ClientDetail() {
  const { id } = useParams<{ id: string }>();
  const me = useMe();
  const db = useApp((s) => s.db)!;
  const now = useNow();
  const sp = useSearchParams();
  const setParam = useSetParam();
  const [addingTraveller, setAddingTraveller] = React.useState(false);

  const client = db.clients[id];
  const bal = React.useMemo(() => (client ? clientBalance(db, client.id, now) : null), [db, client, now]);
  const credit = React.useMemo(() => (client ? clientCreditUsage(db, client.id, now) : null), [db, client, now]);
  const files = React.useMemo(() => Object.values(db.files).filter((f) => f.clientId === id), [db.files, id]);

  if (!client || !bal) {
    return (
      <EmptyState
        title="Client not found"
        body="It may have been removed, or the link is wrong."
        action={
          <Button variant="outline" asChild>
            <Link href="/clients">Back to clients</Link>
          </Button>
        }
      />
    );
  }

  const created = sp.get("created") === "1";
  const mixed = files.some((f) => f.currency !== bal.currency);

  return (
    <>
      <ClientHeader client={client} bal={bal} bookings={files.length} />

      {created && (
        <div role="status" className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-rule py-3 text-sm">
          <span className="flex items-center gap-2 font-medium text-ink">
            <CheckCircle2 className="size-4 text-[var(--st-green-fg)]" aria-hidden /> {client.name} is saved. What next?
          </span>
          <span className="flex flex-wrap gap-2">
            {can(me, "traveller.edit") && (
              <Button size="sm" variant="outline" onClick={() => setAddingTraveller(true)}>
                <UserPlus /> {client.type === "corporate" ? "Add employees" : "Add travellers"}
              </Button>
            )}
            {can(me, "booking.create") && (
              <Button size="sm" asChild>
                <Link href={`/book?client=${client.id}`}>
                  <Plus /> {client.type === "corporate" ? "Book travel for them" : "New booking for this client"}
                </Link>
              </Button>
            )}
          </span>
          <Button size="icon-sm" variant="ghost" className="ml-auto" aria-label="Dismiss" onClick={() => setParam("created", null)}>
            <X />
          </Button>
        </div>
      )}

      <TravellerDialog open={addingTraveller} onOpenChange={setAddingTraveller} clientId={client.id} />

      <div className="space-y-8">
        <ClientSummary bal={bal} bookings={files.length} mixed={mixed} rate={db.settings.fx.USD_TZS} />
        <ClientProfile client={client} credit={credit} />
        <TravellersSection client={client} />
        <ClientBookings client={client} />
        <ClientStatement client={client} />
      </div>
    </>
  );
}
