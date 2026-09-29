"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeftRight, Ban, CheckCheck, ChevronDown, CircleCheck, History, MoreHorizontal, Pencil, Receipt, Undo2, XCircle } from "lucide-react";

import type { ServiceLine, User } from "@/domain/types";
import { can } from "@/domain/permissions";
import { transitionLine, voidLine } from "@/domain/commands";
import { isVoidWindowOpen } from "@/domain/status/line-machine";
import { lineTravelDates } from "@/domain/selectors/core";
import { margin } from "@/domain/pricing";
import { format } from "@/domain/money";
import { useApp, useDispatch } from "@/store";
import { useNow } from "@/lib/use-now";
import { darToday, fmtDate, fmtDateTime, fmtRange, splitLocal } from "@/lib/dates";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Amount } from "@/components/shared/amount";
import { Code, KeyValues, LINE_ICON, LINE_LABEL, UserMark } from "@/components/shared/bits";
import { ConfirmDialog, Consequences } from "@/components/shared/confirm-dialog";
import { StatusChip } from "@/components/shared/status-chip";
import { FlightTimetable } from "./flight-timetable";
import { IssueDialog } from "./issue-dialog";
import { RefundDialog } from "./refund-dialog";

function Countdown({ until, now }: { until: string; now: Date }) {
  const ms = Date.parse(until) - now.getTime();
  if (ms <= 0) return <>closed</>;
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return (
    <span className="tnum">
      {h > 0 ? `${h} h ` : ""}
      {m} min
    </span>
  );
}

/** One service line. Actions follow the line machine (spec §9.4). */
export function LineCard({ line, me, onEdit, autoIssue }: { line: ServiceLine; me: User; onEdit: () => void; autoIssue?: boolean }) {
  const db = useApp((s) => s.db)!;
  const dispatch = useDispatch();
  const now = useNow(30_000);
  const [open, setOpen] = React.useState(false);
  const [dialog, setDialog] = React.useState<null | "issue" | "refund" | "exchange" | "void" | "cancel" | "complete">(() =>
    autoIssue && line.status === "booked" && can(me, "line.transition") ? "issue" : null,
  );

  const Icon = LINE_ICON[line.type];
  const supplier = db.suppliers[line.supplierId];
  const travellers = line.travellerIds.map((id) => db.travellers[id]).filter(Boolean);
  const edit = can(me, "line.transition");
  const refund = Object.values(db.refunds).find((r) => r.lineId === line.id && (r.status === "requested" || r.status === "approved"));
  const voidOpen = isVoidWindowOpen(line, now);
  const dates = lineTravelDates(line);
  const travelled = line.status === "issued" && dates.length > 0 && dates[dates.length - 1] < darToday(now);
  const statusKey = travelled ? "line.travelled" : `line.${line.status}`;
  const terminal = ["cancelled", "voided", "refunded", "exchanged"].includes(line.status);
  const p = line.pricing;

  const act = (to: "booked" | "completed" | "cancelled", note?: string) => dispatch(transitionLine, { lineId: line.id, to, note });

  const primary = (() => {
    if (!edit) return null;
    switch (line.status) {
      case "quoted":
        return (
          <Button size="sm" variant="outline" onClick={() => act("booked")}>
            <CircleCheck /> Mark booked
          </Button>
        );
      case "booked":
        return (
          <Button size="sm" onClick={() => setDialog("issue")}>
            <Receipt /> {line.type === "flight" ? "Issue tickets" : "Issue"}
          </Button>
        );
      case "issued":
        return voidOpen ? (
          <Button size="sm" variant="outline" onClick={() => setDialog("void")} className="border-[var(--st-red-bd)] text-[var(--st-red-fg)] hover:bg-[var(--st-red-bg)]">
            <Ban /> Void · <Countdown until={(line as Extract<ServiceLine, { type: "flight" }>).details.voidDeadline!} now={now} />
          </Button>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setDialog("refund")}>
            <Undo2 /> Request refund
          </Button>
        );
      default:
        return null;
    }
  })();

  return (
    <article className={cn("rounded-lg border border-rule bg-paper", terminal && "bg-canvas/60")}>
      <header className="flex flex-wrap items-start gap-x-3 gap-y-2 px-4 pt-3.5 pb-3">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-canvas-2 text-ink-2">
          <Icon className="size-4" />
        </span>
        <div className="min-w-[220px] flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className={cn("text-[15px] font-semibold text-ink", terminal && "text-ink-3")}>{LINE_LABEL[line.type]}</h3>
            <StatusChip status={statusKey} />
            {line.type === "flight" && (
              <span className="rounded-[3px] border border-rule-2 px-1 text-[11px] leading-4 font-medium text-ink-3">
                {line.source === "amadeus" ? "Amadeus" : line.external?.rawPayload ? "Pasted PNR" : "Manual"}
                {line.external?.lastSyncedAt ? ` · synced ${fmtDateTime(line.external.lastSyncedAt)}` : ""}
              </span>
            )}
            {refund && (
              <Link href={`/payments?tab=refunds&open=${refund.id}`} className="text-[13px] font-medium text-link hover:underline">
                View {refund.kind} request {refund.number}
              </Link>
            )}
          </div>
          <p className={cn("mt-0.5 text-sm text-ink-2", terminal && "line-through decoration-ink-4")}>{line.description}</p>
          <p className="mt-0.5 text-[13px] text-ink-3">
            {supplier?.name ?? "No supplier"}
            {travellers.length > 0 && ` · ${travellers.map((t) => `${t.givenName.split(" ")[0]} ${t.surname}`).join(", ")}`}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {primary}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon-sm" variant="ghost" aria-label="More actions">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {edit && (line.status === "quoted" || line.status === "booked") && (
                <DropdownMenuItem onSelect={onEdit}>
                  <Pencil className="size-4" /> Edit
                </DropdownMenuItem>
              )}
              {edit && line.status === "issued" && line.type === "flight" && (
                <DropdownMenuItem onSelect={() => setDialog("exchange")}>
                  <ArrowLeftRight className="size-4" /> Request exchange
                </DropdownMenuItem>
              )}
              {edit && line.status === "issued" && voidOpen && (
                <DropdownMenuItem onSelect={() => setDialog("refund")}>
                  <Undo2 className="size-4" /> Request refund
                </DropdownMenuItem>
              )}
              {edit && line.status === "completed" && (
                <DropdownMenuItem onSelect={() => setDialog("refund")}>
                  <Undo2 className="size-4" /> Request refund
                </DropdownMenuItem>
              )}
              {edit && line.status === "issued" && (
                <DropdownMenuItem onSelect={() => setDialog("complete")}>
                  <CheckCheck className="size-4" /> Mark completed
                </DropdownMenuItem>
              )}
              {(line.status === "issued" || line.status === "completed" || terminal || line.status === "refund_pending") && (
                <DropdownMenuItem onSelect={onEdit}>
                  <Pencil className="size-4" /> Edit note
                </DropdownMenuItem>
              )}
              {edit && (line.status === "quoted" || line.status === "booked") && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setDialog("cancel")} className="text-[var(--st-red-fg)] focus:text-[var(--st-red-fg)]">
                    <XCircle className="size-4" /> Cancel line
                  </DropdownMenuItem>
                </>
              )}
              {!edit && <DropdownMenuItem disabled>View only for your role</DropdownMenuItem>}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <div className="px-4 pb-3">
        <LineBody line={line} now={now} />
      </div>

      <footer className="border-t border-rule">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex w-full flex-wrap items-center gap-x-5 gap-y-1 px-4 py-2.5 text-left text-[13.5px] transition-colors hover:bg-band-hover"
        >
          <span className="text-ink-3">
            Sell <Amount value={p.sell} className="ml-1 font-semibold text-ink" />
          </span>
          <span className="hidden text-ink-3 sm:inline">
            Cost <Amount value={p.cost} className="ml-1 text-ink-2" />
          </span>
          <span className="text-ink-3">
            Margin <Amount value={margin(p)} tone="auto" className="ml-1 text-ink-2" />
          </span>
          {p.fxToFile !== undefined && <span className="text-xs text-ink-4">rate saved on the line</span>}
          <span className="ml-auto flex items-center gap-3">
            <StatusHistory line={line} />
            <ChevronDown className={cn("size-4 text-ink-3 transition-transform", open && "rotate-180")} />
          </span>
        </button>
        {open && (
          <div className="grid gap-x-8 border-t border-rule px-4 py-3 sm:grid-cols-2">
            <KeyValues
              items={[
                { label: "Net cost", value: <Amount value={p.cost} /> },
                { label: "Markup", value: <Amount value={p.markup} tone="auto" /> },
                { label: "Service fee", value: <Amount value={p.serviceFee} /> },
                { label: "VAT", value: <Amount value={p.vat} /> },
                { label: "Sell", value: <Amount value={p.sell} className="font-semibold" /> },
              ]}
            />
            <KeyValues
              items={[
                { label: "Paid to supplier", value: <Amount value={{ amountMinor: line.supplierPaidMinor, currency: p.currency }} /> },
                { label: "Below-cost override", value: p.overrideBelowCost ? `${db.users[p.overrideBelowCost.by]?.name}: ${p.overrideBelowCost.reason}` : "—", hidden: !p.overrideBelowCost },
                { label: "Note", value: line.notes ?? "—", hidden: !line.notes },
                { label: "Added", value: `${fmtDateTime(line.createdAt)} by ${db.users[line.createdBy]?.name ?? "—"}` },
              ]}
            />
          </div>
        )}
      </footer>

      {dialog === "issue" && <IssueDialog line={line} open onOpenChange={(o) => !o && setDialog(null)} />}
      {(dialog === "refund" || dialog === "exchange") && <RefundDialog line={line} kind={dialog} open onOpenChange={(o) => !o && setDialog(null)} />}
      <ConfirmDialog
        open={dialog === "void"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Void this ticket?"
        description={line.description}
        confirmLabel="Void ticket"
        reason={{ label: "Reason", placeholder: "e.g. Client changed plans the same day" }}
        onConfirm={(reason) => dispatch(voidLine, { lineId: line.id, reason: reason || undefined }).ok}
      >
        <Consequences
          items={[
            <>The sale of <strong className="tnum text-ink">{format(p.sell)}</strong> is reversed; the booking&apos;s charges drop by that amount.</>,
            <>We no longer owe {supplier?.name ?? "the supplier"} <strong className="tnum text-ink">{format(p.cost)}</strong>.</>,
            <>Also void the ticket in the Amadeus terminal before the window closes. Anything the client paid stays as credit until refunded.</>,
          ]}
        />
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog === "cancel"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Cancel this line?"
        description={line.description}
        confirmLabel="Cancel line"
        reason={{ label: "Reason" }}
        onConfirm={(reason) => act("cancelled", reason || undefined).ok}
      >
        <Consequences
          items={[
            line.status === "booked" ? <>It drops <strong className="tnum text-ink">{format(p.sell)}</strong> from the booking&apos;s charges.</> : <>It was only quoted, so nothing changes in the books.</>,
            <>Release the booking with {supplier?.name ?? "the supplier"}{line.type === "flight" ? " and cancel the PNR segments in Amadeus" : ""}.</>,
          ]}
        />
      </ConfirmDialog>
      <ConfirmDialog
        open={dialog === "complete"}
        onOpenChange={(o) => !o && setDialog(null)}
        title="Mark as completed?"
        description="Use this once the client has travelled or the service was delivered."
        confirmLabel="Mark completed"
        tone="default"
        onConfirm={() => act("completed").ok}
      />
    </article>
  );
}

function StatusHistory({ line }: { line: ServiceLine }) {
  const users = useApp((s) => s.db!.users);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 rounded px-1 text-xs text-ink-3 hover:bg-canvas-2 hover:text-ink"
        >
          <History className="size-3.5" /> History
        </span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0" onClick={(e) => e.stopPropagation()}>
        <div className="col-head border-b border-rule px-3 py-2">Status history</div>
        <ol className="max-h-72 overflow-y-auto p-2">
          {[...line.statusHistory].reverse().map((h, i) => (
            <li key={i} className="flex gap-2.5 rounded px-1.5 py-1.5 text-[13.5px]">
              <UserMark user={users[h.by]} size="xs" />
              <span className="min-w-0 flex-1">
                <span className="text-ink">
                  {h.from ? `${h.from.replace("_", " ")} → ` : "Created as "}
                  <strong>{h.to.replace("_", " ")}</strong>
                </span>
                <span className="block text-xs text-ink-3">
                  {fmtDateTime(h.at)} · {users[h.by]?.name ?? "System"}
                </span>
                {h.note && <span className="block text-xs text-ink-2">{h.note}</span>}
              </span>
            </li>
          ))}
        </ol>
      </PopoverContent>
    </Popover>
  );
}

/** Type-specific body: the timetable for flights, key facts for the rest. */
function LineBody({ line, now }: { line: ServiceLine; now: Date }) {
  const db = useApp((s) => s.db)!;
  switch (line.type) {
    case "flight": {
      const d = line.details;
      return (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13.5px]">
            <span className="flex items-center gap-1.5 text-ink-3">
              PNR <Code copy strong>{d.recordLocator || "—"}</Code>
            </span>
            {d.airlineLocator && (
              <span className="flex items-center gap-1.5 text-ink-3">
                Airline ref <Code>{d.airlineLocator}</Code>
              </span>
            )}
            {d.officeId && (
              <span className="text-ink-3">
                Office <span className="font-mono whitespace-nowrap text-ink-2">{d.officeId}</span>
              </span>
            )}
            <span className="text-ink-3">
              Plating <span className="font-mono whitespace-nowrap text-ink-2">{d.validatingCarrier || "—"}</span>
            </span>
            {d.baggage && (
              <span className="text-ink-3">
                Baggage <span className="font-mono whitespace-nowrap text-ink-2">{d.baggage}</span>
              </span>
            )}
            {d.ticketingTimeLimit && line.status === "booked" && (
              <StatusChip label={`Ticket by ${fmtDateTime(d.ticketingTimeLimit)}`} tone={Date.parse(d.ticketingTimeLimit) - now.getTime() < 48 * 3_600_000 ? "red" : "amber"} />
            )}
            {d.exchangedFromLineId && <span className="text-[13px] text-ink-3">Replaces an exchanged ticket</span>}
          </div>
          <FlightTimetable segments={d.segments} />
          <ul className="divide-y divide-rule border-y border-rule sm:hidden">
            {d.passengers.map((p) => (
              <li key={p.travellerId || p.nameInPnr} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 py-2 text-[13.5px]">
                <span className="font-mono whitespace-nowrap text-ink">
                  {p.nameInPnr} <span className="font-sans text-xs text-ink-3">{p.paxType}</span>
                </span>
                {p.ticketNumber ? <Code copy className={cn(line.status === "voided" && "line-through")}>{p.ticketNumber}</Code> : <span className="text-xs text-ink-4">Not issued</span>}
              </li>
            ))}
          </ul>
          <Table className="min-w-[480px] text-[13.5px]" containerClassName="hidden sm:block">
            <TableHeader>
              <TableRow className="rule-head border-0">
                <TableHead className="h-auto px-0 pb-1.5 first:pl-0">Passenger</TableHead>
                <TableHead className="h-auto px-0 pb-1.5">Type</TableHead>
                <TableHead className="h-auto px-0 pb-1.5">Ticket</TableHead>
                <TableHead className="h-auto px-0 pb-1.5 text-right last:pr-0">Fare</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {d.passengers.map((p) => (
                <TableRow key={p.travellerId || p.nameInPnr}>
                  <TableCell className="px-0 py-1.5 font-mono text-ink first:pl-0">{p.nameInPnr}</TableCell>
                  <TableCell className="px-0 py-1.5 text-ink-3">{p.paxType}</TableCell>
                  <TableCell className="px-0 py-1.5">{p.ticketNumber ? <Code copy className={cn(line.status === "voided" && "line-through")}>{p.ticketNumber}</Code> : <span className="text-ink-4">Not issued</span>}</TableCell>
                  <TableCell className="px-0 py-1.5 text-right last:pr-0">{p.fareAmount ? <Amount value={p.fareAmount} /> : <span className="text-ink-4">—</span>}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-[13px] text-ink-3">
            Fare total <Amount value={d.fare.totalFare} className="text-ink-2" />
            {d.fare.commissionPct ? ` · commission ${(d.fare.commissionPct * 100).toFixed(1)}%` : ""}
            {d.fare.fareBasis ? ` · basis ${d.fare.fareBasis}` : ""}
            {d.voidDeadline && line.status === "issued" ? ` · void until ${fmtDateTime(d.voidDeadline)}` : ""}
          </p>
        </div>
      );
    }
    case "hotel": {
      const h = line.details;
      return (
        <Facts
          items={[
            ["Hotel", `${h.hotelName}, ${h.city}`],
            ["Stay", fmtRange(h.checkIn, h.checkOut)],
            ["Rooms", h.rooms.map((r) => `${r.roomType} · ${r.board} · ${r.adults}A${r.children ? ` ${r.children}C` : ""}`).join("; ")],
            ["Confirmation", h.confirmationNumber ? <Code copy key="c">{h.confirmationNumber}</Code> : "Pending"],
            ["Free cancel until", h.freeCancelUntil ? fmtDateTime(h.freeCancelUntil) : null],
            ["Policy", h.cancellationPolicy ?? null],
          ]}
        />
      );
    }
    case "car": {
      const c = line.details;
      return (
        <Facts
          items={[
            ["Car", `${c.company} · ${c.carClass}${c.withDriver ? " · with driver" : ""}`],
            ["Pick-up", `${c.pickupLocation}, ${fmtDateTime(c.pickupAt)}`],
            ["Drop-off", `${c.dropoffLocation}, ${fmtDateTime(c.dropoffAt)}`],
            ["Confirmation", c.confirmationNumber ? <Code copy key="c">{c.confirmationNumber}</Code> : "Pending"],
          ]}
        />
      );
    }
    case "transfer": {
      const t = line.details;
      return (
        <Facts
          items={[
            ["Route", `${t.from} → ${t.to}`],
            ["When", fmtDateTime(t.at)],
            ["Vehicle", `${t.vehicle} · ${t.pax} pax`],
            ["Meets flight", t.flightRef ?? null],
            ["Confirmation", t.confirmationNumber ? <Code copy key="c">{t.confirmationNumber}</Code> : "Pending"],
          ]}
        />
      );
    }
    case "tour": {
      const t = line.details;
      return (
        <Facts
          items={[
            ["Tour", t.name],
            ["Dates", fmtRange(t.startDate, t.endDate)],
            ["Passengers", String(t.pax)],
            ["Includes", t.inclusions ?? null],
            ["Confirmation", t.confirmationNumber ? <Code copy key="c">{t.confirmationNumber}</Code> : "Pending"],
          ]}
        />
      );
    }
    case "visa": {
      const v = line.details;
      return (
        <Facts
          items={[
            ["Visa", `${v.country} · ${v.visaType}`],
            ["Submitted", v.submittedAt ? fmtDate(v.submittedAt) : "Not yet"],
            ["Decision", <StatusChip key="d" status={`visa.${v.decision}`} />],
            ["Reference", v.reference ? <Code key="r">{v.reference}</Code> : null],
          ]}
        />
      );
    }
    case "insurance": {
      const i = line.details;
      return (
        <Facts
          items={[
            ["Cover", `${i.provider} · ${i.plan}`],
            ["Dates", fmtRange(i.coverStart, i.coverEnd)],
            ["Policy", i.policyNumber ? <Code key="p">{i.policyNumber}</Code> : "Pending"],
          ]}
        />
      );
    }
    case "service_fee":
      return <Facts items={[["For", line.details.reason]]} />;
    case "other":
      return <Facts items={[["Service", line.details.label]]} />;
  }
  void db;
  void splitLocal;
}

function Facts({ items }: { items: [string, React.ReactNode | null][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
      {items
        .filter(([, v]) => v !== null && v !== undefined && v !== "")
        .map(([k, v]) => (
          <div key={k} className="flex gap-3">
            <dt className="w-28 shrink-0 text-ink-3">{k}</dt>
            <dd className="min-w-0 text-ink">{v}</dd>
          </div>
        ))}
    </dl>
  );
}
