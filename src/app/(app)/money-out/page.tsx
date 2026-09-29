"use client";

import * as React from "react";
import { Suspense } from "react";
import { Plus } from "lucide-react";

import { can } from "@/domain/permissions";
import { supplierBalances } from "@/domain/selectors/balances";
import { useApp, useMe, useUi } from "@/store";
import { useModals } from "@/store/modals";
import { useNow } from "@/lib/use-now";
import { sumIn } from "@/lib/view-models";

import { Button } from "@/components/ui/button";
import { PageHeader, TabsNav, useTab } from "@/components/shared/page";
import { Amount } from "@/components/shared/amount";
import { SuppliersTab } from "@/components/money-out/suppliers-tab";
import { SupplierPaymentsTab } from "@/components/money-out/supplier-payments-tab";
import { ExpensesTab } from "@/components/money-out/expenses-tab";
import { FxNote } from "@/components/shared/fx-note";

type Tab = "suppliers" | "supplier-payments" | "expenses";

export default function MoneyOutPage() {
  return (
    <Suspense>
      <MoneyOut />
    </Suspense>
  );
}

function MoneyOut() {
  const me = useMe();
  const db = useApp((s) => s.db)!;
  const now = useNow();
  const displayCur = useUi((s) => s.displayCurrency);
  const openExpense = useModals((s) => s.openExpense);
  const raw = useTab("suppliers");
  const tab: Tab = raw === "supplier-payments" || raw === "expenses" ? raw : "suppliers";
  const rate = db.settings.fx.USD_TZS;

  const balances = React.useMemo(() => supplierBalances(db, now), [db, now]);
  const owed = sumIn(
    balances.map((b) => b.owed),
    displayCur,
    rate,
  );
  const overdue = sumIn(
    balances.map((b) => b.overdue),
    displayCur,
    rate,
  );
  const expenseCount = Object.values(db.expenses).filter((e) => !e.deletedAt).length;

  return (
    <>
      <PageHeader
        title="Money out"
        meta={
          <>
            <span className="inline-flex items-center gap-1">
              Owed to suppliers <Amount value={owed} tone="balance" className="font-medium text-ink" />
            </span>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1">
              overdue <Amount value={overdue} className="font-medium text-ink" />
            </span>
            {balances.some((b) => b.owed.currency !== displayCur && b.owed.amountMinor !== 0) && (
              <>
                <span aria-hidden>·</span>
                <FxNote rate={rate} />
              </>
            )}
          </>
        }
        actions={
          can(me, "expense.record") &&
          tab !== "expenses" && (
            <Button variant="outline" onClick={openExpense}>
              <Plus /> Record expense
            </Button>
          )
        }
      />
      <TabsNav
        defaultTab="suppliers"
        tabs={[
          {
            id: "suppliers",
            label: "Suppliers",
            count: balances.filter((b) => b.owed.amountMinor > 0).length,
          },
          {
            id: "supplier-payments",
            label: "Supplier payments",
            count: Object.keys(db.supplierPayments).length,
          },
          { id: "expenses", label: "Expenses", count: expenseCount },
        ]}
      >
        {tab === "suppliers" && <SuppliersTab />}
        {tab === "supplier-payments" && <SupplierPaymentsTab />}
        {tab === "expenses" && <ExpensesTab />}
      </TabsNav>
    </>
  );
}
