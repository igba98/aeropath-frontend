"use client";

import { Suspense } from "react";
import { ProfitAndLossView } from "@/components/accounting/statements";

/** Statement of profit or loss with the comparative period. */
export default function ProfitAndLossPage() {
  return (
    <Suspense>
      <ProfitAndLossView />
    </Suspense>
  );
}
