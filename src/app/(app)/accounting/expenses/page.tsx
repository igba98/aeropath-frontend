"use client";

import { Suspense } from "react";

import { useApp } from "@/store";
import { PageHeader } from "@/components/shared/page";
import { ExpensesTab } from "@/components/money-out/expenses-tab";

/** Accounting → Expenses: the same list as Money out → Expenses (the component is shared, not copied). */
export default function AccountingExpensesPage() {
  const count = useApp((s) => Object.values(s.db!.expenses).filter((e) => !e.deletedAt).length);
  return (
    <Suspense>
      <PageHeader
        title="Expenses"
        meta={
          <>
            <span className="tnum">{count} recorded</span>
            <span aria-hidden>·</span>
            <span>Each posts Dr the expense account, Cr the money account it was paid from</span>
          </>
        }
      />
      <ExpensesTab />
    </Suspense>
  );
}
