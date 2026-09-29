"use client";

import * as React from "react";
import { CalendarRange, MoreHorizontal, Paperclip, Pencil, Plus, Receipt, Trash2, X } from "lucide-react";

import type { Expense, ExpenseCategory } from "@/domain/types";
import { can } from "@/domain/permissions";
import { deleteExpense } from "@/domain/commands";
import { format } from "@/domain/money";
import { EXPENSE_CATEGORIES } from "@/store/seed/reference";
import { useApp, useDispatch, useMe, useUi } from "@/store";
import { useModals } from "@/store/modals";
import { useNow } from "@/lib/use-now";
import { sumIn } from "@/lib/view-models";
import { fmtDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DataTable, TotalsRow, type Column } from "@/components/shared/data-table";
import { EmptyState, Section } from "@/components/shared/page";
import { Amount } from "@/components/shared/amount";
import { Code, UserMark } from "@/components/shared/bits";
import { ConfirmDialog, Consequences } from "@/components/shared/confirm-dialog";
import { Field } from "@/components/shared/field";
import { FilterSelect, FILTER_ON } from "@/components/shared/filter-select";
import { StatusChip } from "@/components/shared/status-chip";
import { ExpenseDialogBody } from "./expense-form";
import { ExpenseMonths } from "./expense-months";

const catLabel = (c: ExpenseCategory) => EXPENSE_CATEGORIES.find((x) => x.value === c)?.label ?? c;

/** Money out → Expenses: monthly totals per category, then the filterable list. */
export function ExpensesTab() {
  const me = useMe();
  const db = useApp((s) => s.db)!;
  const dispatch = useDispatch();
  const now = useNow();
  const openExpense = useModals((s) => s.openExpense);
  const displayCur = useUi((s) => s.displayCurrency);
  const rate = db.settings.fx.USD_TZS;
  const canRecord = can(me, "expense.record");

  const [category, setCategory] = React.useState<"all" | ExpenseCategory>("all");
  const [account, setAccount] = React.useState("all");
  const [payee, setPayee] = React.useState("all");
  const [status, setStatus] = React.useState<"recorded" | "deleted" | "all">("recorded");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [editing, setEditing] = React.useState<Expense | null>(null);
  const [deleting, setDeleting] = React.useState<Expense | null>(null);

  const all = React.useMemo(() => Object.values(db.expenses), [db.expenses]);
  const rows = all.filter((e) => {
    if (status === "recorded" && e.deletedAt) return false;
    if (status === "deleted" && !e.deletedAt) return false;
    if (category !== "all" && e.category !== category) return false;
    if (account !== "all" && e.accountId !== account) return false;
    if (payee !== "all" && e.payee !== payee) return false;
    if (from && e.paidAt < from) return false;
    if (to && e.paidAt > to) return false;
    return true;
  });
  const total = sumIn(rows.filter((e) => !e.deletedAt).map((e) => e.amount), displayCur, rate);
  const payees = Array.from(new Set(all.map((e) => e.payee))).sort((a, b) => a.localeCompare(b));
  const anyFilter = category !== "all" || account !== "all" || payee !== "all" || status !== "recorded" || from || to;
  const clear = () => {
    setCategory("all");
    setAccount("all");
    setPayee("all");
    setStatus("recorded");
    setFrom("");
    setTo("");
  };

  const columns: Column<Expense>[] = [
    {
      key: "date",
      header: "Paid",
      sort: (e) => e.paidAt + e.number,
      csv: (e) => e.paidAt,
      cell: (e) => (
        <span className="block leading-tight whitespace-nowrap">
          <span className="tnum block text-ink">{fmtDate(e.paidAt)}</span>
          <Code className="text-xs text-ink-4">{e.number}</Code>
        </span>
      ),
    },
    {
      key: "payee",
      header: "Payee",
      sort: (e) => e.payee,
      csv: (e) => e.payee,
      cell: (e) => (
        <span className="block max-w-[260px] leading-tight">
          <span className={cn("block truncate text-ink", e.deletedAt && "text-ink-3 line-through")}>{e.payee}</span>
          <span className="block truncate text-[13px] text-ink-3">
            <span className="md:hidden">{catLabel(e.category)}</span>
            {e.note && <span className="hidden md:inline">{e.note}</span>}
          </span>
        </span>
      ),
    },
    { key: "category", header: "Category", sort: (e) => catLabel(e.category), csv: (e) => catLabel(e.category), hideBelow: "md", cell: (e) => <span className="text-ink-2">{catLabel(e.category)}</span> },
    { key: "account", header: "Paid from", sort: (e) => db.moneyAccounts[e.accountId]?.name, csv: (e) => db.moneyAccounts[e.accountId]?.name, hideBelow: "xl", cell: (e) => <span className="text-ink-2">{db.moneyAccounts[e.accountId]?.name ?? "—"}</span> },
    {
      key: "attachment",
      header: <span className="sr-only">Attachment</span>,
      csv: (e) => e.attachmentName,
      csvHeader: "Attachment",
      hideBelow: "2xl",
      width: "28px",
      cell: (e) => (e.attachmentName ? <Paperclip className="size-3.5 text-ink-3" aria-label={`Attachment ${e.attachmentName}`} /> : null),
    },
    { key: "by", header: "By", align: "center", sort: (e) => db.users[e.recordedBy]?.name, csv: (e) => db.users[e.recordedBy]?.name, hideBelow: "2xl", cell: (e) => <UserMark user={db.users[e.recordedBy]} /> },
    {
      key: "amount",
      header: "Amount",
      align: "right",
      sort: (e) => (e.amount.currency === "USD" ? e.amount.amountMinor * rate : e.amount.amountMinor),
      csv: (e) => `${e.amount.currency} ${(e.amount.amountMinor / 100).toFixed(2)}`,
      cell: (e) => (
        <span className="flex flex-col items-end gap-1">
          <Amount value={e.amount} className={e.deletedAt ? "text-ink-4 line-through" : "font-medium text-ink"} />
          {e.deletedAt && <StatusChip status="doc.void" label="Deleted" size="xs" />}
        </span>
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      width: "44px",
      cell: (e) =>
        canRecord && !e.deletedAt ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${e.number}`}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setEditing(e)}>
                <Pencil className="size-4" /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem variant="destructive" onSelect={() => setDeleting(e)}>
                <Trash2 className="size-4" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null,
    },
  ];

  const d = deleting;

  return (
    <div className="space-y-8">
      <Section title="By category, last 3 months" description="Click a category to list its expenses.">
        <ExpenseMonths db={db} now={now} currency={displayCur} activeCategory={category === "all" ? undefined : category} onPick={({ category: c }) => setCategory((cur) => (cur === c ? "all" : c))} />
      </Section>

      <Section
        title="Expenses"
        count={rows.length}
        actions={
          canRecord && (
            <Button onClick={openExpense}>
              <Plus /> Record expense
            </Button>
          )
        }
      >
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(e) => e.id}
          onRowClick={canRecord ? (e) => !e.deletedAt && setEditing(e) : undefined}
          search={(e) => [e.number, e.payee, e.note, catLabel(e.category), db.moneyAccounts[e.accountId]?.name, e.attachmentName].filter(Boolean).join(" ")}
          searchPlaceholder="Search payee, note, expense no."
          exportName="expenses"
          initialSort={{ key: "date", dir: "desc" }}
          toolbar={
            <>
              <FilterSelect label="Category" value={category} onChange={(v) => setCategory(v as typeof category)} options={[{ value: "all", label: "All categories" }, ...EXPENSE_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))]} />
              <FilterSelect label="Account" value={account} onChange={setAccount} options={[{ value: "all", label: "All accounts" }, ...Object.values(db.moneyAccounts).map((a) => ({ value: a.id, label: a.name }))]} />
              <FilterSelect label="Payee" value={payee} onChange={setPayee} options={[{ value: "all", label: "All payees" }, ...payees.map((p) => ({ value: p, label: p }))]} />
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn((from || to) && FILTER_ON)}>
                    <CalendarRange />
                    {from || to ? `${from ? fmtDate(from) : "…"} – ${to ? fmtDate(to) : "…"}` : "Dates"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-72 p-3">
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="From" htmlFor="ex-from">
                      <Input id="ex-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                    </Field>
                    <Field label="To" htmlFor="ex-to">
                      <Input id="ex-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                    </Field>
                  </div>
                </PopoverContent>
              </Popover>
              <FilterSelect label="Status" value={status} onChange={(v) => setStatus(v as typeof status)} options={[{ value: "recorded", label: "Recorded" }, { value: "deleted", label: "Deleted" }, { value: "all", label: "Recorded and deleted" }]} />
              {anyFilter && (
                <Button variant="ghost" size="sm" onClick={clear}>
                  <X /> Clear filters
                </Button>
              )}
            </>
          }
          footer={
            rows.length > 0 && (
              <TotalsRow
                cells={[
                  { content: status === "deleted" ? "Deleted (not counted)" : "Total" },
                  {},
                  { className: "hidden md:table-cell" },
                  { className: "hidden lg:table-cell" },
                  { className: "hidden xl:table-cell" },
                  { className: "hidden xl:table-cell" },
                  { content: <Amount value={total} />, align: "right" },
                  {},
                ]}
              />
            )
          }
          empty={
            all.length === 0 ? (
              <EmptyState icon={Receipt} title="No expenses recorded yet" body="Record rent, internet, GDS fees and other costs so the P&L is complete." action={canRecord && <Button onClick={openExpense}><Plus /> Record the first expense</Button>} />
            ) : (
              <EmptyState title="No expenses match" body="Widen the dates or clear the filters." action={anyFilter ? <Button variant="outline" size="sm" onClick={clear}>Clear filters</Button> : undefined} />
            )
          }
        />
        {rows.some((e) => e.amount.currency !== displayCur) && <p className="mt-2 text-[13px] text-ink-3">Total converted at 1 USD = TZS {rate.toLocaleString("en-US")}.</p>}
      </Section>

      <Dialog open={Boolean(editing)} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-[560px]">{editing && <ExpenseDialogBody key={editing.id} existing={editing} onDone={() => setEditing(null)} />}</DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(d)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={d ? `Delete expense ${d.number}?` : "Delete expense?"}
        confirmLabel="Delete expense"
        reason={{ label: "Reason", required: true, placeholder: "e.g. Recorded twice, wrong supplier" }}
        onConfirm={(reason) => (d ? dispatch(deleteExpense, { expenseId: d.id, reason }).ok : false)}
      >
        {d && (
          <Consequences
            items={[
              <>
                {format(d.amount)} to {d.payee} ({catLabel(d.category)}, paid {fmtDate(d.paidAt)}) is taken out of expenses and the P&amp;L.
              </>,
              `${format(d.amount)} goes back into ${db.moneyAccounts[d.accountId]?.name ?? "the account"} in the cash book, through a reversing entry.`,
              "The expense stays in the list as deleted, with your reason in the audit log.",
            ]}
          />
        )}
      </ConfirmDialog>
    </div>
  );
}
