"use client";

import * as React from "react";
import Link from "next/link";
import { Download, FileText, MessageCircle, Printer, Send } from "lucide-react";

import type { BookingFile, Invoice, MessageAttachment } from "@/domain/types";
import { can } from "@/domain/permissions";
import { invoicesOfFile, isInvoiceOutdated, paymentsOfFile } from "@/domain/selectors/core";
import { fileTotals } from "@/domain/selectors/fileTotals";
import { format } from "@/domain/money";
import { useApp, useMe } from "@/store";
import { useModals } from "@/store/modals";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import { firstName, openWhatsApp } from "@/lib/whatsapp";

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Amount } from "@/components/shared/amount";
import { Code } from "@/components/shared/bits";
import { EmptyState, Section } from "@/components/shared/page";
import { StatusChip } from "@/components/shared/status-chip";
import { useIssueDocument } from "./header";

/** Invoices and quotes (current and superseded), receipts, and the itinerary. */
export function DocumentsTab({ file, isDraft }: { file: BookingFile; isDraft: boolean }) {
  const me = useMe();
  const db = useApp((s) => s.db)!;
  const issueDoc = useIssueDocument();
  const openMessage = useModals((s) => s.openMessage);
  const docs = invoicesOfFile(db, file.id).sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
  const receipts = paymentsOfFile(db, file.id).sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  const client = db.clients[file.clientId];
  const bal = fileTotals(db, file.id).balance;

  const shareDoc = (d: Invoice) =>
    openWhatsApp(
      client?.phone,
      `Hello ${firstName(client?.contactPerson || client?.name || "")}, here is your ${d.kind} ${d.number} for booking ${file.number}: total ${format(d.snapshot.total)}.${d.kind === "invoice" && bal.amountMinor > 0 ? ` Balance due: ${format(bal)}.` : ""} — Aeropath Travel`,
    );

  /** Opens the message composer with this document attached (and the template that goes with it). */
  const send = (attachment: MessageAttachment) => openMessage({ clientId: file.clientId, fileId: file.id, attachments: [attachment] });

  const docActions = (href: string, onShare: () => void, attachment: MessageAttachment) => (
    <span className="flex justify-end gap-0.5">
      <Button variant="ghost" size="sm" asChild>
        <Link href={href} target="_blank">
          <Printer /> Print
        </Link>
      </Button>
      <Button variant="ghost" size="sm" asChild>
        <Link href={`${href}${href.includes("?") ? "&" : "?"}autoprint=1`} target="_blank" title="Opens the print dialog; choose Save as PDF">
          <Download /> PDF
        </Link>
      </Button>
      {can(me, "comms.send") && (
        <Button variant="ghost" size="icon-sm" onClick={() => send(attachment)} aria-label={`Send ${attachment.label} to the client`} title="Send by SMS, WhatsApp or email">
          <Send />
        </Button>
      )}
      <Button variant="ghost" size="icon-sm" onClick={onShare} aria-label="Share on WhatsApp">
        <MessageCircle />
      </Button>
    </span>
  );

  return (
    <div className="space-y-8">
      <Section
        title="Invoices and quotes"
        count={docs.length}
        actions={
          can(me, "document.issue") && (
            <>
              <Button variant="outline" size="sm" onClick={() => issueDoc(file.id, "quote")}>
                Issue quote
              </Button>
              {!isDraft && (
                <Button variant="outline" size="sm" onClick={() => issueDoc(file.id, "invoice")}>
                  Issue invoice
                </Button>
              )}
            </>
          )
        }
      >
        {docs.length === 0 ? (
          <EmptyState icon={FileText} title="No documents issued yet" body={isDraft ? "Issue a quote to send the client the price." : "Issue an invoice when the client is ready to pay."} />
        ) : (
          <Table className="min-w-[600px]">
            <TableHeader>
              <TableRow className="rule-head border-0">
                <TableHead className="h-auto px-0 pb-2 first:pl-0">Document</TableHead>
                <TableHead className="h-auto px-0 pb-2">Issued</TableHead>
                <TableHead className="h-auto px-0 pb-2">Due</TableHead>
                <TableHead className="h-auto px-0 pb-2 text-right">Total</TableHead>
                <TableHead className="h-auto pr-0 pb-2 pl-4">Status</TableHead>
                <TableHead className="h-auto px-0 pb-2 last:pr-0" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {docs.map((d) => {
                const outdated = d.status === "issued" && isInvoiceOutdated(db, file.id, d.kind);
                return (
                  <TableRow key={d.id}>
                    <TableCell className="px-0 py-2.5 first:pl-0">
                      <Code>{d.number}</Code>
                      <span className="ml-2 text-[13px] text-ink-3 capitalize">{d.kind}</span>
                    </TableCell>
                    <TableCell className="tnum px-0 py-2.5">{fmtDateTime(d.issuedAt)}</TableCell>
                    <TableCell className="tnum px-0 py-2.5">{fmtDate(d.dueAt)}</TableCell>
                    <TableCell className="px-0 py-2.5 text-right">
                      <Amount value={d.snapshot.total} />
                    </TableCell>
                    <TableCell className="py-2.5 pr-0 pl-4">
                      <StatusChip status={outdated ? "doc.outdated" : `doc.${d.status}`} />
                    </TableCell>
                    <TableCell className="px-0 py-2.5 last:pr-0">{docActions(`/print/${d.kind}/${d.id}`, () => shareDoc(d), { kind: d.kind, refId: d.id, label: `${d.kind === "invoice" ? "Invoice" : "Quote"} ${d.number}`, url: `/print/${d.kind}/${d.id}` })}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Section>

      <Section title="Receipts" count={receipts.length}>
        {receipts.length === 0 ? (
          <p className="text-sm text-ink-3">Receipts appear here once a payment is recorded.</p>
        ) : (
          <ul className="divide-y divide-rule border-y border-rule">
            {receipts.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-sm">
                <Code>{p.number}</Code>
                <span className="tnum text-ink-3">{fmtDateTime(p.receivedAt)}</span>
                <Amount value={p.amount} className="ml-auto" />
                <StatusChip status={`payment.${p.status}`} size="xs" />
                {docActions(
                  `/print/receipt/${p.id}`,
                  () => openWhatsApp(client?.phone, `Hello ${firstName(client?.contactPerson || client?.name || "")}, receipt ${p.number}: ${format(p.amount)} for booking ${file.number}. — Aeropath Travel`),
                  { kind: "receipt", refId: p.id, label: `Receipt ${p.number}`, url: `/print/receipt/${p.id}` },
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Itinerary" description="The agency's e-ticket summary: travellers, tickets, flights, hotels and transfers with confirmation numbers.">
        <div className="flex flex-wrap items-center gap-2">
          {docActions(
            `/print/itinerary/${file.id}`,
            () => openWhatsApp(client?.phone, `Hello ${firstName(client?.contactPerson || client?.name || "")}, your itinerary for booking ${file.number} is ready. — Aeropath Travel`),
            { kind: "itinerary", refId: file.id, label: `Itinerary ${file.number}`, url: `/print/itinerary/${file.id}` },
          )}
        </div>
      </Section>
    </div>
  );
}
