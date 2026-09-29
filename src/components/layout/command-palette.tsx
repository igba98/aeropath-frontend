"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Command as Cmdk } from "cmdk";
import { Dialog as DialogPrimitive } from "radix-ui";
import { BedDouble, BookOpenCheck, ClipboardPaste, CornerDownLeft, FilePlus2, FileText, MessagesSquare, Plus, Receipt, Search, UserRoundPlus, Users, Wallet } from "lucide-react";

import { can } from "@/domain/permissions";
import { searchDb, type SearchHit } from "@/lib/search";
import { cn } from "@/lib/utils";
import { useApp, useMe } from "@/store";
import { useModals } from "@/store/modals";
import { Kbd } from "@/components/shared/bits";
import { NAV } from "./nav";
import { canAccessRoute } from "@/domain/permissions";

/** ⌘K: global search across bookings, clients, documents, plus role-filtered actions. */
export function CommandPalette() {
  const open = useModals((s) => s.palette.open);
  const setOpen = useModals((s) => s.setPalette);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[rgb(15_23_42/0.32)] data-[state=open]:animate-in data-[state=open]:fade-in-0 dark:bg-black/60" />
        <DialogPrimitive.Content
          className="fixed top-[12vh] left-1/2 z-50 w-[calc(100%-1.5rem)] max-w-[640px] -translate-x-1/2 overflow-hidden rounded-xl border border-rule-2 bg-paper shadow-pop outline-none data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98]"
          aria-describedby={undefined}
        >
          <DialogPrimitive.Title className="sr-only">Search and actions</DialogPrimitive.Title>
          <PaletteBody />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function PaletteBody() {
  const setOpen = useModals((s) => s.setPalette);
  const openPayment = useModals((s) => s.openPayment);
  const openClient = useModals((s) => s.openClient);
  const openExpense = useModals((s) => s.openExpense);
  const openMessage = useModals((s) => s.openMessage);
  const router = useRouter();
  const me = useMe();
  const db = useApp((s) => s.db);
  const [q, setQ] = React.useState("");

  const hits = React.useMemo(() => (db && q.trim().length >= 2 ? searchDb(db, q) : null), [db, q]);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const actions = [
    { id: "new-booking", label: "Book a flight", icon: Plus, key: "N", show: can(me, "booking.create"), run: () => go("/book") },
    { id: "book-hotel", label: "Book a hotel", icon: BedDouble, show: can(me, "booking.create"), run: () => go("/book?tab=hotels") },
    { id: "paste-pnr", label: "Paste PNR", icon: ClipboardPaste, show: can(me, "booking.create"), run: () => go("/bookings/new?paste=1") },
    { id: "manual-booking", label: "Manual booking (any service)", icon: FilePlus2, show: can(me, "booking.create"), run: () => go("/bookings/new") },
    { id: "record-payment", label: "Record payment", icon: Wallet, key: "P", show: can(me, "payment.record"), run: () => (setOpen(false), openPayment()) },
    { id: "message-client", label: "Message a client", icon: MessagesSquare, show: can(me, "comms.send"), run: () => (setOpen(false), openMessage()) },
    { id: "new-client", label: "New client", icon: UserRoundPlus, show: can(me, "client.create"), run: () => (setOpen(false), openClient({ onCreated: (id) => router.push(`/clients/${id}`) })) },
    { id: "record-expense", label: "Record expense", icon: Receipt, show: can(me, "expense.record"), run: () => (setOpen(false), openExpense()) },
  ].filter((a) => a.show);

  const lower = q.trim().toLowerCase();
  const shownActions = lower ? actions.filter((a) => a.label.toLowerCase().includes(lower)) : actions;
  const pages = NAV.filter((n) => canAccessRoute(me, n.href) && (!lower || n.label.toLowerCase().includes(lower)));

  const group = (heading: string, items: SearchHit[], Icon: typeof FileText) =>
    items.length ? (
      <Cmdk.Group heading={heading}>
        {items.map((h) => (
          <Item key={h.kind + h.id} value={`${h.kind}-${h.id}`} onSelect={() => go(h.href)}>
            <Icon className="size-4 shrink-0 text-ink-3" />
            <span className={cn("shrink-0", h.kind !== "client" && "font-mono whitespace-nowrap text-[13.5px] font-semibold")}>{h.title}</span>
            <span className="min-w-0 flex-1 truncate text-ink-3">{h.subtitle}</span>
            {h.match && <span className="shrink-0 rounded-[3px] bg-canvas-2 px-1.5 py-0.5 font-mono whitespace-nowrap text-xs text-ink-2">{h.match}</span>}
          </Item>
        ))}
      </Cmdk.Group>
    ) : null;

  const nothing = hits && !hits.bookings.length && !hits.clients.length && !hits.documents.length && !shownActions.length && !pages.length;

  return (
          <Cmdk shouldFilter={false} loop>
            <div className="flex items-center gap-2.5 border-b border-rule px-4">
              <Search className="size-4 shrink-0 text-ink-3" />
              <Cmdk.Input
                value={q}
                onValueChange={setQ}
                autoFocus
                placeholder="File no., client, phone, surname, PNR, ticket or receipt no."
                className="h-12 min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-4"
              />
              <Kbd>Esc</Kbd>
            </div>
            <Cmdk.List className="max-h-[min(60vh,480px)] overflow-y-auto p-1.5 [&_[cmdk-group-heading]]:col-head [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-2.5 [&_[cmdk-group-heading]]:pb-1">
              {nothing && (
                <div className="px-3 py-8 text-center text-sm text-ink-3">
                  Nothing found for “{q}”. Try a file number like <span className="font-mono whitespace-nowrap">AP-2026-000123</span>, a phone number or a 6-letter PNR.
                </div>
              )}
              {hits && group("Bookings", hits.bookings, BookOpenCheck)}
              {hits && group("Clients", hits.clients, Users)}
              {hits && group("Documents", hits.documents, FileText)}
              {shownActions.length > 0 && (
                <Cmdk.Group heading="Actions">
                  {shownActions.map((a) => (
                    <Item key={a.id} value={`action-${a.id}`} onSelect={a.run}>
                      <a.icon className="size-4 shrink-0 text-ink-3" />
                      <span className="flex-1">{a.label}</span>
                      {a.key && <Kbd>{a.key}</Kbd>}
                    </Item>
                  ))}
                </Cmdk.Group>
              )}
              {pages.length > 0 && (
                <Cmdk.Group heading="Go to">
                  {pages.map((p) => (
                    <Item key={p.href} value={`page-${p.href}`} onSelect={() => go(p.href)}>
                      <p.icon className="size-4 shrink-0 text-ink-3" />
                      <span className="flex-1">{p.label}</span>
                    </Item>
                  ))}
                </Cmdk.Group>
              )}
            </Cmdk.List>
            <div className="flex items-center gap-3 border-t border-rule bg-canvas px-4 py-2 text-xs text-ink-3">
              <span className="inline-flex items-center gap-1">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd> move
              </span>
              <span className="inline-flex items-center gap-1">
                <Kbd>
                  <CornerDownLeft className="size-3" />
                </Kbd>{" "}
                open
              </span>
              <span className="ml-auto hidden sm:inline">Shortcuts: N new booking · P record payment · / search</span>
            </div>
          </Cmdk>
  );
}

function Item({ children, value, onSelect }: { children: React.ReactNode; value: string; onSelect: () => void }) {
  return (
    <Cmdk.Item
      value={value}
      onSelect={onSelect}
      className="flex h-9 cursor-default items-center gap-2.5 rounded-md px-2.5 text-sm text-ink data-[selected=true]:bg-band"
    >
      {children}
    </Cmdk.Item>
  );
}
