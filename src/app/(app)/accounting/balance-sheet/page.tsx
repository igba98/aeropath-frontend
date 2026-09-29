"use client";

import { Suspense } from "react";
import { BalanceSheetView } from "@/components/accounting/statements";

/** Statement of financial position (IFRS for SMEs) with a comparative date. */
export default function BalanceSheetPage() {
  return (
    <Suspense>
      <BalanceSheetView />
    </Suspense>
  );
}
