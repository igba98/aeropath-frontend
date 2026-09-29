"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page";
import { ClientStepper } from "@/components/clients/client-stepper";
import type { ClientSeed } from "@/components/clients/profile-draft";

export default function NewClientPage() {
  return (
    <Suspense>
      <NewClient />
    </Suspense>
  );
}

/** Full-page client stepper (spec §9.6). After saving, the client page offers "Add travellers" and "New booking". */
function NewClient() {
  const router = useRouter();
  const sp = useSearchParams();
  const [seed] = React.useState<ClientSeed>(() => ({
    name: sp.get("name") ?? undefined,
    phone: sp.get("phone") ?? undefined,
    type: sp.get("type") === "corporate" ? "corporate" : sp.get("type") === "individual" ? "individual" : undefined,
  }));

  return (
    <>
      <PageHeader title="New client" meta="An individual or an organisation. Travellers and bookings come next." />
      <Card className="block max-w-4xl gap-0 overflow-hidden p-0">
        <ClientStepper surface="page" seed={seed} afterCreate="handoff" onCreated={(id) => router.push(`/clients/${id}?created=1`)} onClose={() => {}} onCancel={() => router.push("/clients")} />
      </Card>
    </>
  );
}
