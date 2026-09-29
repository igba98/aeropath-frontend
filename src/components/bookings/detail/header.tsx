"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, FileText, Hash, MessageCircle, MessagesSquare, MoreHorizontal, Pencil, Plus, Printer, ScrollText, UserRoundCog, Wallet } from "lucide-react";

import type { BookingFile, ID } from "@/domain/types";
import { can } from "@/domain/permissions";
import { cancelBookingFile, issueInvoice, issueQuote, reassignFile, updateBookingFile } from "@/domain/commands";
import { format } from "@/domain/money";
import { useApp, useDispatch, useMe } from "@/store";
import { useModals } from "@/store/modals";
import { fmtDay, fmtRange } from "@/lib/dates";
import { firstName, openWhatsApp } from "@/lib/whatsapp";
import { PAY_KEY, type BookingRow } from "@/lib/view-models";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { StatusChip } from "@/components/shared/status-chip";
import { Code, Route, UserMark } from "@/components/shared/bits";
import { ConfirmDialog, Consequences } from "@/components/shared/confirm-dialog";
import { Field } from "@/components/shared/field";
import { PageCrumbs } from "@/components/shared/page";
import { FilterSelect } from "@/components/shared/filter-select";

/** Issue an invoice or quote, then offer Print and WhatsApp in the toast. */
export function useIssueDocument() {
  const dispatch = useDispatch();
  return React.useCallback(
    (fileId: ID, kind: "invoice" | "quote") => {
      const r = dispatch(kind === "invoice" ? issueInvoice : issueQuote, { fileId }, { toast: false });
      if (!r.ok) return null;
      const res = r.result as { invoiceId: ID; number: string };
      toast.success(`${kind === "invoice" ? "Invoice" : "Quote"} ${res.number} issued`, {
        action: { label: "Print", onClick: () => window.open(`/print/${kind}/${res.invoiceId}?autoprint=1`, "_blank") },
      });
      return res;
    },
    [dispatch],
  );
}

export function BookingHeader({ row, onAddService }: { row: BookingRow; onAddService: () => void }) {
  const me = useMe();
  const router = useRouter();
  const db = useApp((s) => s.db)!;
  const dispatch = useDispatch();
  const openPayment = useModals((s) => s.openPayment);
  const openMessage = useModals((s) => s.openMessage);
  const issueDoc = useIssueDocument();
  const file = row.file;
  const client = row.client;
  const [editing, setEditing] = React.useState(false);
  const [title, setTitle] = React.useState(file.title);
  const [dialog, setDialog] = React.useState<null | "cancel" | "reassign" | "reference">(null);
  const canEdit = can(me, "booking.edit");
  const cancelled = row.status === "cancelled";
  const hasIssued = Object.values(db.lines).some((l) => l.fileId === file.id && (l.status === "issued" || l.status === "refund_pending"));
  const openLines = Object.values(db.lines).filter((l) => l.fileId === file.id && (l.status === "quoted" || l.status === "booked"));

  const saveTitle = () => {
    setEditing(false);
    if (title.trim() && title.trim() !== file.title) dispatch(updateBookingFile, { fileId: file.id, patch: { title: title.trim() } });
    else setTitle(file.title);
  };

  const share = () => {
    const bal = row.totals.balance;
    const when = row.start ? fmtDay(row.start) : "";
    const route = row.route.length ? row.route.join(" → ") : file.title;
    const text = `Hello ${firstName(client?.contactPerson || client?.name || "")}, your booking ${file.number} (${route}${when ? `, ${when}` : ""}) is ${row.status === "draft" ? "ready as a quote" : "confirmed"}.${bal.amountMinor > 0 ? ` Balance due: ${format(bal)}.` : " It is fully paid."} Thank you — Aeropath Travel`;
    openWhatsApp(client?.phone, text);
  };

  return (
    <header className="pb-5">
      <PageCrumbs items={[{ label: "Bookings", href: "/bookings" }, ...(client ? [{ label: client.name, href: `/clients/${client.id}` }] : []), { label: file.number }]} />
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Code copy strong className="text-base">
              {file.number}
            </Code>
            <StatusChip status={`file.${row.status}`} />
            {row.pay !== "none" && <StatusChip status={PAY_KEY[row.pay]} />}
            {row.overdue && <StatusChip status="pay.overdue" />}
          </div>
          {editing ? (
            <Input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveTitle();
                if (e.key === "Escape") {
                  setTitle(file.title);
                  setEditing(false);
                }
              }}
              aria-label="Booking title"
              className="mt-1.5 h-9 max-w-xl text-lg font-semibold"
            />
          ) : (
            <h1 className="group mt-1 flex items-center gap-2 text-xl leading-8 font-semibold text-ink">
              {file.title}
              {canEdit && !cancelled && (
                <button type="button" onClick={() => {
                    setTitle(file.title);
                    setEditing(true);
                  }} className="rounded p-1 text-ink-4 opacity-0 transition group-hover:opacity-100 hover:bg-canvas-2 hover:text-ink focus-visible:opacity-100" aria-label="Edit title">
                  <Pencil className="size-3.5" />
                </button>
              )}
            </h1>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-ink-3">
            {row.route.length > 0 && <Route codes={row.route} />}
            {client && (
              <Link href={`/clients/${client.id}`} className="font-medium text-ink hover:underline">
                {client.name}
              </Link>
            )}
            <span className="inline-flex items-center gap-1.5">
              <UserMark user={row.owner} size="xs" /> {row.owner?.name}
            </span>
            <span className="tnum">{row.start ? fmtRange(row.start, row.end) : "No travel dates yet"}</span>
            <span>
              Came in by <span className="font-medium text-ink-2">{{ walk_in: "walk-in", phone: "phone", whatsapp: "WhatsApp", email: "email", corporate: "corporate account" }[file.source]}</span>
            </span>
            {file.reference && (
              <span>
                PO <span className="font-mono font-semibold whitespace-nowrap text-ink-2">{file.reference}</span>
              </span>
            )}
            {file.costCentre && (
              <span>
                Charged to <span className="font-medium text-ink-2">{file.costCentre}</span>
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {can(me, "payment.record") && !cancelled && (
            <Button variant="outline" onClick={() => openPayment({ fileId: file.id, clientId: file.clientId })}>
              <Wallet /> Record payment
            </Button>
          )}
          {can(me, "line.edit") && !cancelled && (
            <Button variant="outline" onClick={onAddService}>
              <Plus /> Add service
            </Button>
          )}
          {can(me, "document.issue") && !cancelled && (
            <Button onClick={() => issueDoc(file.id, row.status === "draft" ? "quote" : "invoice")}>
              <FileText /> {row.status === "draft" ? "Issue quote" : "Issue invoice"}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" aria-label="More">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onSelect={() => window.open(`/print/itinerary/${file.id}`, "_blank")}>
                <Printer className="size-4" /> Print itinerary
              </DropdownMenuItem>
              {row.status !== "draft" && can(me, "document.issue") && !cancelled && (
                <DropdownMenuItem onSelect={() => issueDoc(file.id, "quote")}>
                  <ScrollText className="size-4" /> Issue and print quote
                </DropdownMenuItem>
              )}
              {can(me, "comms.send") && (
                <DropdownMenuItem onSelect={() => openMessage({ clientId: file.clientId, fileId: file.id })}>
                  <MessagesSquare className="size-4" /> Message client
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={share}>
                <MessageCircle className="size-4" /> Share on WhatsApp
              </DropdownMenuItem>
              {canEdit && !cancelled && (
                <DropdownMenuItem onSelect={() => setDialog("reference")}>
                  <Hash className="size-4" /> PO and department
                </DropdownMenuItem>
              )}
              {can(me, "booking.reassign") && (
                <DropdownMenuItem onSelect={() => setDialog("reassign")}>
                  <UserRoundCog className="size-4" /> Reassign agent
                </DropdownMenuItem>
              )}
              {can(me, "booking.cancel") && !cancelled && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setDialog("cancel")} className="text-[var(--st-red-fg)] focus:text-[var(--st-red-fg)]">
                    <Ban className="size-4" /> Cancel booking
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <ConfirmDialog
        open={dialog === "cancel"}
        onOpenChange={(o) => !o && setDialog(null)}
        title={hasIssued ? "This booking can't be cancelled yet" : `Cancel ${file.number}?`}
        confirmLabel="Cancel booking"
        reason={hasIssued ? undefined : { label: "Reason", placeholder: "e.g. Client chose another agency" }}
        onConfirm={(reason) => {
          if (hasIssued) return;
          const r = dispatch(cancelBookingFile, { fileId: file.id, reason: reason || undefined });
          if (r.ok) router.refresh();
          return r.ok;
        }}
      >
        {hasIssued ? (
          <p>It has issued tickets or a refund in progress. Void or refund those lines first, then cancel.</p>
        ) : (
          <Consequences
            items={[
              <>
                {openLines.length} quoted or booked line{openLines.length === 1 ? "" : "s"} will be cancelled. Nothing was posted to the books for them.
              </>,
              row.totals.received.amountMinor > 0 ? (
                <>
                  The client has paid <strong className="tnum text-ink">{format(row.totals.received)}</strong>; it stays as credit until you refund it.
                </>
              ) : (
                <>No money was received.</>
              ),
              <>Release any holds with the airline or suppliers.</>,
            ]}
          />
        )}
      </ConfirmDialog>

      <ReferenceDialog
        key={`${file.id}-${dialog === "reference"}`}
        file={file}
        departments={client?.departments ?? []}
        required={Boolean(client?.poRequired)}
        open={dialog === "reference"}
        onOpenChange={(o) => !o && setDialog(null)}
        onSave={(reference, costCentre) => dispatch(updateBookingFile, { fileId: file.id, patch: { reference, costCentre } }).ok}
      />
      <ReassignDialog file={file} open={dialog === "reassign"} onOpenChange={(o) => !o && setDialog(null)} onSave={(ownerId) => dispatch(reassignFile, { fileId: file.id, ownerId }).ok} />
    </header>
  );
}

/** The client's purchase order or reference, and the department it is charged to (organisation bookings). */
function ReferenceDialog({
  file,
  departments,
  required,
  open,
  onOpenChange,
  onSave,
}: {
  file: BookingFile;
  departments: string[];
  required: boolean;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSave: (reference: string, costCentre: string) => boolean;
}) {
  const [reference, setReference] = React.useState(file.reference ?? "");
  const [costCentre, setCostCentre] = React.useState(file.costCentre ?? "");
  const [error, setError] = React.useState<string | null>(null);
  const save = () => {
    if (required && !reference.trim()) return setError("This client needs a PO or reference number on every booking.");
    if (onSave(reference.trim(), costCentre.trim())) onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>PO and department</DialogTitle>
          <DialogDescription>Printed on the invoice so the client&rsquo;s finance team can match it.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <Field label="PO or reference number" htmlFor="bk-ref" required={required} optional={!required} error={error}>
            <Input id="bk-ref" value={reference} onChange={(e) => (setReference(e.target.value), setError(null))} className="font-mono" autoComplete="off" />
          </Field>
          <Field label="Department or cost centre" htmlFor="bk-cc" optional>
            <Input id="bk-cc" list="bk-cc-list" value={costCentre} onChange={(e) => setCostCentre(e.target.value)} autoComplete="off" />
            <datalist id="bk-cc-list">
              {departments.map((d) => (
                <option key={d} value={d} />
              ))}
            </datalist>
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReassignDialog({ file, open, onOpenChange, onSave }: { file: BookingFile; open: boolean; onOpenChange: (o: boolean) => void; onSave: (ownerId: ID) => boolean }) {
  const users = useApp((s) => s.db!.users);
  const [owner, setOwner] = React.useState(file.ownerId);
  const options = Object.values(users)
    .filter((u) => u.active && u.role !== "accountant")
    .map((u) => ({ value: u.id, label: `${u.name} · ${u.role === "agent" ? "Agent" : "Manager"}` }));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Reassign {file.number}</DialogTitle>
          <DialogDescription>The new agent sees it in their bookings and attention list.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Field label="Agent responsible">
            <FilterSelect label="Agent" value={owner} onChange={setOwner} options={options} full />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => onSave(owner) && onOpenChange(false)} disabled={owner === file.ownerId}>
            Reassign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
