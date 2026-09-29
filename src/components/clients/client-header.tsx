"use client";

import * as React from "react";
import Link from "next/link";
import { Archive, ArchiveRestore, Mail, MessageCircle, MessageSquareText, MoreHorizontal, Pencil, Phone, Plane, Plus, Wallet } from "lucide-react";

import type { Client } from "@/domain/types";
import type { ClientBalance } from "@/domain/selectors/balances";
import { can } from "@/domain/permissions";
import { archiveClient } from "@/domain/commands";
import { format } from "@/domain/money";
import { useDispatch, useMe } from "@/store";
import { useModals } from "@/store/modals";
import { waLink, firstName } from "@/lib/whatsapp";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/shared/page";
import { StatusChip } from "@/components/shared/status-chip";
import { ConfirmDialog, Consequences } from "@/components/shared/confirm-dialog";
import { ClientStepperDialog } from "./client-stepper";
import { CorporateTag } from "./client-bits";
import { orgTypeLabel } from "./client-options";
import type { StepId } from "./profile-draft";

/** Client page header: name, contact line (tel, WhatsApp, email) and actions. */
export function ClientHeader({ client, bal, bookings }: { client: Client; bal: ClientBalance; bookings: number }) {
  const me = useMe();
  const dispatch = useDispatch();
  const openPayment = useModals((s) => s.openPayment);
  const openMessage = useModals((s) => s.openMessage);
  const [editing, setEditing] = React.useState(false);
  const [archiving, setArchiving] = React.useState(false);
  const canEdit = can(me, "client.edit");
  const org = client.type === "corporate";
  const kind = org ? [orgTypeLabel(client.orgType), client.sector].filter(Boolean).join(" · ") : "";

  return (
    <>
      <PageHeader
        crumbLabel={client.name}
        title={
          <span className="flex flex-wrap items-center gap-2">
            {client.name}
            {client.type === "corporate" && <CorporateTag className="text-xs" />}
            {client.archived && <StatusChip label="Archived" tone="grey" />}
          </span>
        }
        meta={
          <>
            {kind && (
              <>
                <span className="text-ink-2">{kind}</span>
                <span aria-hidden>·</span>
              </>
            )}
            <a href={`tel:${client.phone}`} className="tnum inline-flex items-center gap-1 text-ink-2 hover:text-ink hover:underline">
              <Phone className="size-3.5" aria-hidden /> {client.phone}
            </a>
            <a
              href={waLink(client.phone, `Hello ${firstName(client.type === "corporate" ? client.contactPerson || client.name : client.name)}, `)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-ink-2 hover:text-ink hover:underline"
            >
              <MessageCircle className="size-3.5" aria-hidden /> WhatsApp
            </a>
            {client.email && (
              <a href={`mailto:${client.email}`} className="inline-flex items-center gap-1 text-ink-2 hover:text-ink hover:underline">
                <Mail className="size-3.5" aria-hidden /> {client.email}
              </a>
            )}
            {client.contactPerson && <span>Contact: {client.contactPerson}</span>}
          </>
        }
        actions={
          <>
            {can(me, "booking.create") && !client.archived && (
              <Button asChild>
                <Link href={`/book?client=${client.id}`}>{org ? <><Plane /> Book travel</> : <><Plus /> New booking</>}</Link>
              </Button>
            )}
            {can(me, "payment.record") && !client.archived && (
              <Button variant="outline" onClick={() => openPayment({ clientId: client.id })}>
                <Wallet /> Record payment
              </Button>
            )}
            {can(me, "comms.send") && (
              <Button variant="outline" onClick={() => openMessage({ clientId: client.id })}>
                <MessageSquareText /> Message
              </Button>
            )}
            {canEdit && (
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Pencil /> Edit
              </Button>
            )}
            {canEdit && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="More client actions">
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  {client.archived ? (
                    <DropdownMenuItem onSelect={() => setArchiving(true)}>
                      <ArchiveRestore className="size-4" /> Restore client
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onSelect={() => setArchiving(true)} className="text-[var(--st-red-fg)] focus:text-[var(--st-red-fg)]">
                      <Archive className="size-4" /> Archive client
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </>
        }
      />

      <ClientEditDialog client={client} open={editing} onOpenChange={setEditing} />

      <ConfirmDialog
        open={archiving}
        onOpenChange={setArchiving}
        title={client.archived ? `Restore ${client.name}?` : `Archive ${client.name}?`}
        confirmLabel={client.archived ? "Restore client" : "Archive client"}
        tone={client.archived ? "default" : "destructive"}
        onConfirm={() => dispatch(archiveClient, { clientId: client.id, archived: !client.archived }).ok}
      >
        <Consequences
          items={
            client.archived
              ? ["They come back to the client list and the pickers for new bookings and payments.", `Their ${bookings} booking${bookings === 1 ? "" : "s"} and balance are unchanged.`]
              : [
                  "They leave the client list and the pickers for new bookings and payments. Search still finds them, and you can restore them at any time.",
                  `Their ${bookings} booking${bookings === 1 ? "" : "s"}, documents and payments stay exactly as they are.`,
                  bal.balance.amountMinor > 0
                    ? `They still owe ${format(bal.balance)}. Archiving does not write it off.`
                    : bal.balance.amountMinor < 0
                      ? `We still owe them ${format({ ...bal.balance, amountMinor: -bal.balance.amountMinor })} in credit.`
                      : "Their balance is settled.",
                ]
          }
        />
      </ConfirmDialog>
    </>
  );
}

/** Edit the client profile in the client stepper (credit limit and terms show for Managers only). */
export function ClientEditDialog({ client, open, onOpenChange, step }: { client: Client; open: boolean; onOpenChange: (o: boolean) => void; step?: StepId }) {
  return <ClientStepperDialog open={open} onOpenChange={onOpenChange} existing={client} initialStep={step} />;
}
