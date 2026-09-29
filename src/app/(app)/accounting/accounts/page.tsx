"use client";

import { Suspense } from "react";
import { ChartOfAccountsView } from "@/components/accounting/books-views";

/** Chart of accounts, grouped by class, with balances and links to the ledger. */
export default function ChartOfAccountsPage() {
  return (
    <Suspense>
      <ChartOfAccountsView />
    </Suspense>
  );
}
