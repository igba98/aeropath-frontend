"use client";

import { Suspense } from "react";
import { PettyCashView } from "@/components/accounting/petty-cash";

/** Petty cash book: float, top-ups, vouchers, cash count. */
export default function PettyCashPage() {
  return (
    <Suspense>
      <PettyCashView />
    </Suspense>
  );
}
