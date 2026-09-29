"use client";

import { Suspense } from "react";
import { GeneralLedgerView } from "@/components/accounting/books-views";

/** General ledger of one account (and sub-ledger) with a running balance. */
export default function GeneralLedgerPage() {
  return (
    <Suspense>
      <GeneralLedgerView />
    </Suspense>
  );
}
