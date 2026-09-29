"use client";

import { Suspense } from "react";
import { JournalsView } from "@/components/accounting/books-views";

/** Journal entries (JV): list, new journal, transfers, opening balances, reverse. */
export default function JournalsPage() {
  return (
    <Suspense>
      <JournalsView />
    </Suspense>
  );
}
