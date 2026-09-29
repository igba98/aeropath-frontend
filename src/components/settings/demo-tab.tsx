"use client";

import * as React from "react";
import { RotateCcw } from "lucide-react";

import { can } from "@/domain/permissions";
import { useApp, useMe } from "@/store";

import { Button } from "@/components/ui/button";
import { KeyValues } from "@/components/shared/bits";
import { ConfirmDialog, Consequences } from "@/components/shared/confirm-dialog";
import { Section } from "@/components/shared/page";
import { TabHeading } from "./settings-kit";

/** Settings → Demo data: reset everything to the seed (Manager). */
export function DemoTab() {
  const me = useMe();
  const db = useApp((s) => s.db)!;
  const [open, setOpen] = React.useState(false);
  const allowed = can(me, "demo.reset");

  const n = {
    files: Object.keys(db.files).length,
    clients: Object.keys(db.clients).length,
    payments: Object.keys(db.payments).length,
    supplierPayments: Object.keys(db.supplierPayments).length,
    expenses: Object.values(db.expenses).filter((e) => !e.deletedAt).length,
    audit: db.audit.length,
  };
  const plural = (k: number, one: string, many = `${one}s`) => `${k.toLocaleString("en-US")} ${k === 1 ? one : many}`;

  return (
    <div className="space-y-10">
      <TabHeading title="Demo data" description="This prototype keeps everything in this browser. Reset it to replay the demo from a clean start." />

      <Section title="In this browser now">
        <KeyValues
          className="max-w-[480px]"
          items={[
            { label: "Booking files", value: <span className="tnum">{n.files.toLocaleString("en-US")}</span> },
            { label: "Clients", value: <span className="tnum">{n.clients.toLocaleString("en-US")}</span> },
            { label: "Payments received and refunded", value: <span className="tnum">{n.payments.toLocaleString("en-US")}</span> },
            { label: "Supplier payments", value: <span className="tnum">{n.supplierPayments.toLocaleString("en-US")}</span> },
            { label: "Expenses", value: <span className="tnum">{n.expenses.toLocaleString("en-US")}</span> },
            { label: "Audit events", value: <span className="tnum">{n.audit.toLocaleString("en-US")}</span> },
          ]}
        />
      </Section>

      <Section title="Reset demo data" description="Everything returns to the seed: the sample bookings, clients, payments, suppliers and settings.">
        <Button variant="destructive" onClick={() => setOpen(true)} disabled={!allowed}>
          <RotateCcw /> Reset demo data
        </Button>
      </Section>

      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Reset all demo data?"
        description="This cannot be undone."
        confirmLabel="Reset to the seed"
        onConfirm={() => useApp.getState().resetDemo()}
      >
        <Consequences
          items={[
            `${plural(n.files, "booking file")}, ${plural(n.clients, "client")}, ${plural(n.payments, "payment")}, ${plural(n.supplierPayments, "supplier payment")} and ${plural(n.expenses, "expense")} are replaced by the seed.`,
            "Every change made since the last reset is lost, including settings, users and exchange rate.",
            `The audit log (${plural(n.audit, "event")}) starts again from the seed.`,
            `You stay signed in as ${me.name}.`,
          ]}
        />
      </ConfirmDialog>
    </div>
  );
}
