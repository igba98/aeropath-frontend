"use client";

import { Suspense } from "react";
import { ReconciliationView } from "@/components/accounting/reconciliation";

/** Bank reconciliation: tick statement items, complete at a nil difference. */
export default function ReconciliationPage() {
  return (
    <Suspense>
      <ReconciliationView />
    </Suspense>
  );
}
