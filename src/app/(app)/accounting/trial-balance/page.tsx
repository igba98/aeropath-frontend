"use client";

import { Suspense } from "react";
import { TrialBalanceView } from "@/components/accounting/statements";

/** Trial balance as at a date, or the movements of a period. */
export default function TrialBalancePage() {
  return (
    <Suspense>
      <TrialBalanceView />
    </Suspense>
  );
}
