"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, UserSearch } from "lucide-react";
import { PageHeader } from "@/components/chrome/console-shell";
import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { MoneyText } from "@/components/shared/money-text";
import { Pill, StatusChip } from "@/components/shared/status-chip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSession } from "@/hooks/use-session";
import { useStore } from "@/lib/store";
import { formatDateShort } from "@/lib/format";
import { BookingRef, ConsoleLoading, Panel } from "@/features/admin/ops-ui";
import { customerIndex, lifetimeValueMinor, type CustomerRecord } from "@/features/admin/ops-utils";
import type { Booking } from "@/lib/domain/types";

/** U02 · Customer lookup. Phone, email, booking reference or name — one box across bookings and accounts. */
export default function CustomerLookupPage() {
  return (
    <Suspense fallback={<ConsoleLoading />}>
      <CustomerLookup />
    </Suspense>
  );
}

function CustomerLookup() {
  const data = useStore((s) => s);
  const session = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");

  const needle = q.trim().toLowerCase();

  const customers = useMemo(() => {
    const all = customerIndex(data);
    if (!needle) return [];
    return all.filter((c) => {
      const refs = c.bookings.map((b) => b.reference).join(" ");
      return `${c.name} ${c.email} ${c.phone} ${refs}`.toLowerCase().includes(needle);
    });
  }, [data, needle]);

  const bookings = useMemo(() => {
    if (!needle) return [];
    return Object.values(data.bookings)
      .filter((b) => {
        const lead = b.leadTraveller;
        return `${b.reference} ${lead ? lead.firstName + " " + lead.lastName : ""} ${lead?.email ?? ""} ${lead?.phone ?? ""} ${b.clientOrgName ?? ""}`.toLowerCase().includes(needle);
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 25);
  }, [data.bookings, needle]);

  if (!session.hydrated) return <ConsoleLoading />;

  const customerColumns: Column<CustomerRecord>[] = [
    {
      key: "name",
      header: "Customer",
      render: (c) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{c.name}</p>
          <p className="truncate text-xs text-muted-foreground">{c.email || "no email"} · {c.phone || "no phone"}</p>
        </div>
      ),
    },
    { key: "kind", header: "Account", render: (c) => <Pill tone={c.userId ? "brand" : "neutral"}>{c.userId ? "Registered" : "Guest checkout"}</Pill> },
    { key: "bookings", header: "Bookings", numeric: true, render: (c) => <span>{c.bookings.length}</span> },
    { key: "ltv", header: "Lifetime value", numeric: true, render: (c) => <MoneyText minor={lifetimeValueMinor(data, c.bookings)} size="sm" showCurrency={false} /> },
    {
      key: "open",
      header: "",
      className: "w-px",
      render: (c) => <Link href={`/admin/support/customer/${encodeURIComponent(c.key)}`} className="text-xs font-medium text-brand-text hover:underline">Open 360</Link>,
    },
  ];

  const bookingColumns: Column<Booking>[] = [
    { key: "ref", header: "Reference", render: (b) => <BookingRef id={b.id} reference={b.reference} /> },
    { key: "lead", header: "Lead traveller", render: (b) => <span className="text-sm">{b.leadTraveller ? `${b.leadTraveller.firstName} ${b.leadTraveller.lastName}` : "—"}</span> },
    { key: "contact", header: "Contact", render: (b) => <span className="text-xs text-muted-foreground">{b.leadTraveller?.phone ?? b.leadTraveller?.email ?? "—"}</span> },
    { key: "status", header: "Status", render: (b) => <StatusChip status={b.status} size="sm" /> },
    { key: "created", header: "Created", render: (b) => <span className="text-xs">{formatDateShort(b.createdAt)}</span> },
    { key: "total", header: "Total", numeric: true, render: (b) => <MoneyText minor={b.totalMinor} size="sm" showCurrency={false} /> },
  ];

  return (
    <>
      <PageHeader
        title="Customer lookup"
        code="U02"
        description="Search everything the platform knows about a caller: registered accounts and guest checkouts alike."
      />

      <Panel className="mb-4">
        <Label htmlFor="lookup">Phone, email, booking reference or name</Label>
        <div className="relative mt-1.5">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            id="lookup"
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="+255754123456 · amina.hassan@example.com · AP-7K2M9 · Sarah Chen"
            className="pl-8"
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Guests who checked out without an account are matched on the lead traveller they gave at booking.
        </p>
      </Panel>

      {!needle ? (
        <EmptyState icon={UserSearch} title="Start typing" description="A caller usually gives a phone number first. Any part of a reference, name or email works too." />
      ) : (
        <div className="space-y-4">
          <Panel title={`Customers · ${customers.length}`}>
            <DataTable
              columns={customerColumns}
              rows={customers}
              rowKey={(c) => c.key}
              caption="Matching customers"
              onRowClick={(c) => router.push(`/admin/support/customer/${encodeURIComponent(c.key)}`)}
              empty={<EmptyState icon={UserSearch} title="No customer matches" description="Try the booking reference instead, or a partial phone number." />}
            />
          </Panel>

          <Panel title={`Bookings · ${bookings.length}`}>
            <DataTable
              columns={bookingColumns}
              rows={bookings}
              rowKey={(b) => b.id}
              caption="Matching bookings"
              onRowClick={(b) => router.push(`/admin/ops/bookings/${b.id}`)}
              empty={<EmptyState icon={Search} title="No booking matches" description="Nothing on the platform carries that reference." />}
            />
          </Panel>
        </div>
      )}
    </>
  );
}
