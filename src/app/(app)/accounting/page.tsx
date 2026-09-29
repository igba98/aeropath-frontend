"use client";

import { Suspense } from "react";
import { AccountingOverview } from "@/components/accounting/overview";

/** Accounting overview: key balances, quick actions, recent journals, reconciliation status. */
export default function AccountingOverviewPage() {
  return (
    <Suspense>
      <AccountingOverview />
    </Suspense>
  );
}
