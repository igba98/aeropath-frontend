"use client";

import { Suspense } from "react";
import { VatReturnView } from "@/components/accounting/statements";

/** VAT return for a period, laid out like the TRA return. */
export default function VatReturnPage() {
  return (
    <Suspense>
      <VatReturnView />
    </Suspense>
  );
}
