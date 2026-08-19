"use client";

import { useState } from "react";
import { Download, Lock, ScrollText, Search } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, StatTile } from "@/components/chrome/console-shell";
import { EmptyState } from "@/components/shared/empty-state";
import { MoneyText } from "@/components/shared/money-text";
import { Pill } from "@/components/shared/status-chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSession } from "@/hooks/use-session";
import { useStore } from "@/lib/store";
import { toCsv } from "@/features/partner/csv";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/** F05 · Ledger. Append only, double entry; corrections are new entries, never edits. */
export default function LedgerPage() {
  const s = useSession();
  const ledger = useStore((st) => st.ledger);
  const bookings = useStore((st) => st.bookings);
  const [q, setQ] = useState("");
  const [account, setAccount] = useState("all");

  if (!s.hydrated) return <div className="h-40 animate-pulse rounded-xl bg-muted" />;
  if (!s.can("LEDGER:view")) {
    return (
      <>
        <PageHeader title="Ledger" code="F05" />
        <div className="rounded-xl border border-warning/40 bg-warning/5 p-6 text-sm">
          <p className="font-medium">Not available to your role</p>
          <p className="mt-0.5 text-muted-foreground">Signed in as {s.roleLabel}. The ledger is visible to finance, operations managers, auditors and super admins.</p>
        </div>
      </>
    );
  }

  const accounts = Array.from(new Set(ledger.map((e) => e.account))).sort();
  const filtered = ledger.filter((e) => {
    if (account !== "all" && e.account !== account) return false;
    if (!q) return true;
    const ref = e.bookingId ? bookings[e.bookingId]?.reference ?? "" : "";
    return `${e.account} ${e.description} ${ref}`.toLowerCase().includes(q.toLowerCase());
  });

  // group by entry group so each group visibly balances
  const groups = Object.values(
    filtered.reduce<Record<string, typeof filtered>>((acc, e) => {
      (acc[e.entryGroupId] ??= []).push(e);
      return acc;
    }, {}),
  ).sort((a, b) => b[0].entryDate.localeCompare(a[0].entryDate));

  const balances = accounts.map((a) => {
    const rows = ledger.filter((e) => e.account === a);
    return { account: a, debit: rows.reduce((s2, e) => s2 + e.debitMinor, 0), credit: rows.reduce((s2, e) => s2 + e.creditMinor, 0) };
  }).sort((a, b) => (b.debit + b.credit) - (a.debit + a.credit));

  const totalDebit = ledger.reduce((s2, e) => s2 + e.debitMinor, 0);
  const totalCredit = ledger.reduce((s2, e) => s2 + e.creditMinor, 0);

  function exportCsv() {
    const csv = toCsv(
      ["date", "group", "account", "debit", "credit", "currency", "description"],
      filtered.map((e) => [e.entryDate, e.entryGroupId, e.account, e.debitMinor, e.creditMinor, e.currency, e.description]),
    );
    toast.success("Journal exported", { description: `${filtered.length} rows, ${(csv.length / 1024).toFixed(1)} KB. Exports are rate limited and audited.` });
  }

  return (
    <>
      <PageHeader
        title="Ledger"
        code="F05"
        description="Every financial movement as a balanced double entry. Nothing here is ever updated or deleted."
        actions={<Button variant="outline" className="gap-1.5" onClick={exportCsv}><Download className="size-4" aria-hidden /> Export CSV</Button>}
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <StatTile label="Entries" value={ledger.length} icon={ScrollText} />
        <StatTile label="Entry groups" value={new Set(ledger.map((e) => e.entryGroupId)).size} />
        <StatTile label="Total debits" value={<MoneyText minor={totalDebit} currency="TZS" size="lg" compact />} />
        <StatTile
          label="Balance check"
          value={totalDebit === totalCredit ? "Balanced" : "Out by " + Math.abs(totalDebit - totalCredit)}
          tone={totalDebit === totalCredit ? "success" : "danger"}
          hint={totalDebit === totalCredit ? "Debits equal credits" : "Investigate immediately"}
          icon={Lock}
        />
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <div className="relative min-w-56 flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search account, description or booking reference" className="pl-8" aria-label="Search ledger" />
        </div>
        <Select value={account} onValueChange={setAccount}>
          <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All accounts</SelectItem>
            {accounts.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="space-y-2">
          {groups.length === 0 ? <EmptyState title="No entries match" /> : groups.slice(0, 60).map((grp) => {
            const debit = grp.reduce((s2, e) => s2 + e.debitMinor, 0);
            const credit = grp.reduce((s2, e) => s2 + e.creditMinor, 0);
            const balanced = debit === credit;
            const ref = grp[0].bookingId ? bookings[grp[0].bookingId]?.reference : undefined;
            return (
              <div key={grp[0].entryGroupId} className={cn("rounded-xl border bg-card p-3", !balanced && "border-destructive")}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-muted-foreground">{grp[0].entryGroupId}</span>
                    {ref ? <span className="font-mono text-xs">{ref}</span> : null}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="text-[11px] text-muted-foreground">{formatDateTime(grp[0].entryDate)}</span>
                    {balanced ? <Pill tone="success">Balanced</Pill> : <Pill tone="danger">Unbalanced</Pill>}
                  </span>
                </div>
                <table className="w-full text-sm">
                  <tbody>
                    {grp.map((e) => (
                      <tr key={e.id} className="border-t first:border-0">
                        <td className="py-1.5 pr-2 font-mono text-xs">{e.account}</td>
                        <td className="py-1.5 pr-2 text-xs text-muted-foreground">{e.description}</td>
                        <td className="py-1.5 text-right tabular-nums">{e.debitMinor ? <MoneyText minor={e.debitMinor} currency={e.currency} size="xs" showCurrency={false} /> : ""}</td>
                        <td className="py-1.5 pl-3 text-right tabular-nums">{e.creditMinor ? <MoneyText minor={e.creditMinor} currency={e.currency} size="xs" showCurrency={false} className="text-muted-foreground" /> : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })}
          {groups.length > 60 ? <p className="text-center text-xs text-muted-foreground">Showing the 60 most recent of {groups.length} entry groups. Narrow the filters to see more.</p> : null}
        </div>

        <aside>
          <div className="sticky top-20 rounded-xl border bg-card p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Account balances</p>
            <ul className="mt-2 space-y-1.5">
              {balances.map((b) => (
                <li key={b.account} className="flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate font-mono text-[11px]">{b.account}</span>
                  <MoneyText minor={Math.abs(b.debit - b.credit)} currency="TZS" size="xs" showCurrency={false} className={b.debit >= b.credit ? "" : "text-muted-foreground"} />
                </li>
              ))}
            </ul>
            <p className="mt-3 border-t pt-2 text-[11px] text-muted-foreground">
              A database trigger rejects any entry group that does not sum to zero, and the app role has no UPDATE or DELETE grant on this table.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
