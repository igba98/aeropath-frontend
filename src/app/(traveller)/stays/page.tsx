"use client";

import { Suspense } from "react";
import { ResultsShell } from "@/features/traveller/results-shell";

/** T02 · Search results, lodges. Map plus list, filter rail. */
export default function StaysPage() {
  return (
    <Suspense>
      <ResultsShell vertical="stay" title="Hotels & lodges" subtitle="All-in nightly prices including VAT, levy and fees" mapPanel />
    </Suspense>
  );
}
