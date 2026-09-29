"use client";

import { RecordPaymentModal } from "@/components/payments/record-payment";
import { NewClientModal } from "@/components/clients/client-form";
import { RecordExpenseModal } from "@/components/money-out/expense-form";
import { MessageComposerModal } from "@/components/comms/composer";

/** Hosts app-wide modals: record payment (P), new client, record expense, message a client. */
export function GlobalModals() {
  return (
    <>
      <RecordPaymentModal />
      <NewClientModal />
      <RecordExpenseModal />
      <MessageComposerModal />
    </>
  );
}
