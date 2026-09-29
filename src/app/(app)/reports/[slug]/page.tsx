"use client";

import * as React from "react";
import { Suspense } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { FileQuestion } from "lucide-react";

import { can } from "@/domain/permissions";
import { reportBySlug, type ReportDef, type ReportSlug } from "@/domain/selectors/reports";
import { useMe } from "@/store";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/page";
import { useReportParams, type ReportState } from "@/components/reports/use-report-params";
import { MySalesView, ProfitView, SalesView } from "@/components/reports/sales-views";
import { AirlineSalesView, VoidsRefundsView } from "@/components/reports/air-views";
import { BspPeriodView } from "@/components/reports/bsp-view";
import { CashBookView, PayablesView, ReceivablesView } from "@/components/reports/money-views";
import { ExpensesView, PnlView, ReceiptsView } from "@/components/reports/ledger-views";

const VIEWS: Record<ReportSlug, React.ComponentType<{ def: ReportDef; state: ReportState }>> = {
  "my-sales": MySalesView,
  sales: SalesView,
  profit: ProfitView,
  "airline-sales": AirlineSalesView,
  receivables: ReceivablesView,
  payables: PayablesView,
  "cash-book": CashBookView,
  receipts: ReceiptsView,
  "voids-refunds": VoidsRefundsView,
  expenses: ExpensesView,
  pnl: PnlView,
  "bsp-period": BspPeriodView,
};

export default function ReportPage() {
  return (
    <Suspense>
      <Report />
    </Suspense>
  );
}

function Report() {
  const { slug } = useParams<{ slug: string }>();
  const me = useMe();
  const def = reportBySlug(slug);
  if (!def || !can(me, def.permission)) {
    return (
      <EmptyState
        icon={FileQuestion}
        title={def ? "This report is for finance staff" : "There is no such report"}
        body={def ? "Ask your manager if you need these figures. Your own sales are in My sales." : "Pick a report from the list."}
        action={
          <Button asChild variant="outline">
            <Link href={def ? "/reports/my-sales" : "/reports"}>{def ? "Open My sales" : "All reports"}</Link>
          </Button>
        }
        className="py-20"
      />
    );
  }
  return <ReportBody key={def.slug} def={def} />;
}

function ReportBody({ def }: { def: ReportDef }) {
  const state = useReportParams(def);
  const View = VIEWS[def.slug];
  return <View def={def} state={state} />;
}
