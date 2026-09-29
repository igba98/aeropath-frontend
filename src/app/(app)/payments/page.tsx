"use client";

import * as React from "react";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";

import type { ID } from "@/domain/types";
import { can } from "@/domain/permissions";
import { useApp, useMe } from "@/store";
import { useModals } from "@/store/modals";

import { Button } from "@/components/ui/button";
import { PageHeader, TabsNav, useSetParam } from "@/components/shared/page";
import { PaymentsTable } from "@/components/payments/payments-table";
import { RefundsTable } from "@/components/payments/refunds-table";
import { PaymentDrawer } from "@/components/payments/payment-drawer";
import { RefundDrawer } from "@/components/payments/refund-drawer";

type Tab = "received" | "refunds" | "unverified";

export default function PaymentsPage() {
  return (
    <Suspense>
      <Payments />
    </Suspense>
  );
}

function Payments() {
  const me = useMe();
  const db = useApp((s) => s.db)!;
  const openPayment = useModals((s) => s.openPayment);
  const sp = useSearchParams();
  const setParam = useSetParam();

  const finance = can(me, "payment.verify");
  const defaultTab: Tab = finance ? "unverified" : "received";
  const raw = sp.get("tab") as Tab | null;
  const tab: Tab = raw === "received" || raw === "refunds" || (raw === "unverified" && finance) ? raw : defaultTab;
  const openId = sp.get("open");

  const counts = React.useMemo(() => {
    const payments = Object.values(db.payments);
    const refunds = Object.values(db.refunds);
    return {
      received: payments.length,
      unverified: payments.filter((p) => p.status === "recorded").length,
      decide: refunds.filter((r) => r.status === "requested").length,
      payout: refunds.filter((r) => r.kind === "refund" && r.status === "approved" && r.quote.clientRefund.amountMinor > 0).length,
    };
  }, [db.payments, db.refunds]);

  // ?open= can hold a payment or a refund request id; the matching drawer opens whatever the tab.
  const openPaymentId = openId && db.payments[openId] ? openId : null;
  const openRefundId = openId && db.refunds[openId] ? openId : null;
  const open = (id: ID | null) => setParam("open", id);

  return (
    <>
      <PageHeader
        title="Payments"
        meta={
          <>
            {finance && <span className="tnum">{counts.unverified} unverified</span>}
            {finance && <span aria-hidden>·</span>}
            <span className="tnum">
              {counts.decide} refund{counts.decide === 1 ? "" : "s"} awaiting a decision
            </span>
            <span aria-hidden>·</span>
            <span className="tnum">{counts.payout} to pay out</span>
          </>
        }
        actions={
          can(me, "payment.record") && (
            <Button onClick={() => openPayment()}>
              <Plus /> Record payment
            </Button>
          )
        }
      />

      <TabsNav
        defaultTab={defaultTab}
        className="gap-5"
        tabs={[
          { id: "received", label: "Received" },
          {
            id: "refunds",
            label: "Refunds",
            count: counts.decide + counts.payout || undefined,
          },
          {
            id: "unverified",
            label: "Unverified",
            count: counts.unverified,
            hidden: !finance,
          },
        ]}
      >
        {tab === "refunds" ? <RefundsTable onOpen={open} openId={openRefundId} /> : <PaymentsTable key={tab} mode={tab} onOpen={open} openId={openPaymentId} />}
      </TabsNav>

      <PaymentDrawer paymentId={openPaymentId} onClose={() => open(null)} />
      <RefundDrawer refundId={openRefundId} onClose={() => open(null)} onOpenPayment={(id) => open(id)} />
    </>
  );
}
