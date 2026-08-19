"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Inbox, Mail, MessageCircle, PhoneCall, Send, Smartphone } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, StatTile } from "@/components/chrome/console-shell";
import { EmptyState } from "@/components/shared/empty-state";
import { SlaCountdown } from "@/components/shared/hold-countdown";
import { Pill } from "@/components/shared/status-chip";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/hooks/use-session";
import { useStore } from "@/lib/store";
import { useIsPast } from "@/hooks/use-now";
import { admin } from "@/lib/api";
import { formatDateTime, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ConsoleLoading, Detail, FilterChips, GatedAction, Panel } from "@/features/admin/ops-ui";
import type { Ticket } from "@/lib/domain/types";

type Filter = Ticket["status"] | "all";

const CHANNEL_ICONS: Record<Ticket["channel"], LucideIcon> = {
  whatsapp: MessageCircle,
  phone: PhoneCall,
  email: Mail,
  in_app: Smartphone,
};

/** U01 · Ticket inbox. Conversations, not rows — each one tied to a booking reference where there is one. */
export default function TicketInboxPage() {
  const isPast = useIsPast();
  const data = useStore((s) => s);
  const session = useSession();
  const [filter, setFilter] = useState<Filter>("open");
  const [openId, setOpenId] = useState<string | null>(null);
  const [reply, setReply] = useState("");

  const tickets = useMemo(
    () => Object.values(data.tickets).sort((a, b) => a.slaDueAt.localeCompare(b.slaDueAt)),
    [data.tickets],
  );

  const visible = filter === "all" ? tickets : tickets.filter((t) => t.status === filter);
  const selected = openId ? data.tickets[openId] : (visible[0] ?? undefined);

  if (!session.hydrated) return <ConsoleLoading />;

  const openCount = tickets.filter((t) => t.status === "open").length;
  const breached = tickets.filter((t) => t.status !== "resolved" && isPast(t.slaDueAt)).length;
  const bookingFor = (reference?: string) => (reference ? Object.values(data.bookings).find((b) => b.reference === reference) : undefined);

  return (
    <>
      <PageHeader
        title="Ticket inbox"
        code="U01"
        description="WhatsApp, phone, email and in-app conversations in one queue, ordered by how much SLA is left."
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Open" value={openCount} icon={Inbox} tone={openCount ? "warning" : "success"} />
        <StatTile label="Awaiting the customer" value={tickets.filter((t) => t.status === "pending").length} />
        <StatTile label="SLA breached" value={breached} tone={breached ? "danger" : "success"} />
        <StatTile label="Resolved" value={tickets.filter((t) => t.status === "resolved").length} tone="success" />
      </div>

      <Panel className="mb-4">
        <FilterChips
          ariaLabel="Filter tickets by status"
          value={filter}
          onChange={(f) => { setFilter(f); setOpenId(null); }}
          options={[
            { id: "open", label: "Open", count: tickets.filter((t) => t.status === "open").length },
            { id: "pending", label: "Pending", count: tickets.filter((t) => t.status === "pending").length },
            { id: "resolved", label: "Resolved", count: tickets.filter((t) => t.status === "resolved").length },
            { id: "all", label: "All", count: tickets.length },
          ]}
        />
      </Panel>

      {visible.length ? (
        <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
          {/* List */}
          <ul className="space-y-2" aria-label="Tickets">
            {visible.map((t) => {
              const Icon = CHANNEL_ICONS[t.channel];
              const active = selected?.id === t.id;
              return (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => { setOpenId(t.id); setReply(""); }}
                    aria-current={active}
                    className={cn(
                      "w-full rounded-xl border bg-card p-3 text-left transition-colors",
                      active ? "border-brand-300 bg-brand-50/60" : "hover:bg-muted",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                        <Icon className="size-3.5" aria-hidden /> {t.reference}
                      </span>
                      <Pill tone={t.priority === "high" ? "danger" : t.priority === "normal" ? "info" : "neutral"} className="text-[10px]">{t.priority}</Pill>
                    </div>
                    <p className="mt-1 truncate text-sm font-medium">{t.subject}</p>
                    <p className="truncate text-xs text-muted-foreground">{t.customerName} · {t.customerPhone}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <Pill tone={t.status === "open" ? "warning" : t.status === "pending" ? "info" : "success"} className="text-[10px]">{t.status}</Pill>
                      {t.status !== "resolved" ? <SlaCountdown deadlineAt={t.slaDueAt} /> : null}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>

          {/* Thread */}
          {selected ? (
            <div className="space-y-4">
              <Panel title={selected.subject} description={`${selected.reference} · opened ${relativeTime(selected.createdAt)} via ${selected.channel.replace(/_/g, " ")}`}>
                <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Detail label="Customer">{selected.customerName}</Detail>
                  <Detail label="Phone">{selected.customerPhone}</Detail>
                  <Detail label="Assignee">{selected.assigneeName ?? "Unassigned"}</Detail>
                  <Detail label="Booking">
                    {(() => {
                      const b = bookingFor(selected.bookingReference);
                      if (!b) return selected.bookingReference ?? "Not linked";
                      return <Link href={`/admin/ops/bookings/${b.id}`} className="font-mono text-xs text-brand-text hover:underline">{b.reference}</Link>;
                    })()}
                  </Detail>
                </dl>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {(["open", "pending", "resolved"] as const).map((s) => (
                    <GatedAction
                      key={s}
                      permission="TICKET:manage"
                      size="xs"
                      variant={selected.status === s ? "default" : "outline"}
                      blockedReason={selected.status === s ? "Already in this status." : undefined}
                      onClick={() => {
                        admin.setTicketStatus(selected.id, s);
                        toast.success(`Ticket marked ${s}`, { description: selected.reference });
                      }}
                    >
                      Mark {s}
                    </GatedAction>
                  ))}
                  <span className="ml-auto">
                    <Link href={`/admin/support/lookup?q=${encodeURIComponent(selected.customerPhone)}`} className="text-xs text-brand-text hover:underline">
                      Look this customer up
                    </Link>
                  </span>
                </div>
              </Panel>

              <Panel title="Conversation">
                <ul className="space-y-3">
                  {selected.messages.map((m) => (
                    <li key={m.id} className={cn("max-w-[85%] rounded-xl border p-3", m.from === "agent" ? "ml-auto border-brand-200 bg-brand-50" : "bg-muted/50")}>
                      <p className="text-sm">{m.text}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground">{m.from === "agent" ? "Aeropath support" : selected.customerName} · {formatDateTime(m.at)}</p>
                    </li>
                  ))}
                </ul>

                <div className="mt-4 space-y-2 border-t pt-4">
                  <Label htmlFor="ticket-reply">Reply to {selected.customerName}</Label>
                  <Textarea
                    id="ticket-reply"
                    rows={3}
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder={selected.channel === "whatsapp" ? "Sent on WhatsApp to " + selected.customerPhone : "Your reply…"}
                  />
                  <GatedAction
                    permission="TICKET:manage"
                    variant="default"
                    icon={Send}
                    blockedReason={reply.trim() ? undefined : "Write a reply first."}
                    onClick={() => {
                      admin.replyTicket(selected.id, reply.trim());
                      setReply("");
                      toast.success("Reply sent", { description: `${selected.reference} moved to pending and assigned to you.` });
                    }}
                  >
                    Send reply
                  </GatedAction>
                </div>
              </Panel>
            </div>
          ) : null}
        </div>
      ) : (
        <EmptyState icon={Inbox} title="No tickets in this view" description="Change the filter, or wait for the next customer message." />
      )}
    </>
  );
}
