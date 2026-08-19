"use client";

import Link from "next/link";
import {
  Activity, AlertTriangle, BadgeDollarSign, Banknote, BarChart3, BookOpen, Boxes, Building2, CalendarClock, ClipboardList, Coins,
  FileText, Flag, Gauge, GitBranch, Image, Inbox, KeyRound, LayoutDashboard, LifeBuoy, ListChecks, Mail, Megaphone,
  Percent, Plug, Receipt, ScrollText, Search, Settings, Shield, Store, TrendingUp, UserCog, Users,
} from "lucide-react";
import { ConsoleShell, type NavGroup } from "@/components/chrome/console-shell";
import { useSession } from "@/hooks/use-session";
import { useStore } from "@/lib/store";
import { visibleAdminSections } from "@/lib/domain/permissions";
import { Button } from "@/components/ui/button";

/**
 * Back office is one application with a role driven left rail (flow spec §7).
 * A Support Agent and a Finance Manager see completely different navigation.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const s = useSession();
  const openTasks = useStore((st) => Object.values(st.opsTasks).filter((t) => t.status !== "resolved").length);
  const openTickets = useStore((st) => Object.values(st.tickets).filter((t) => t.status !== "resolved").length);
  const pendingProducts = useStore((st) => Object.values(st.products).filter((p) => p.status === "pending_review").length);
  const pendingRefunds = useStore((st) => Object.values(st.refunds).filter((r) => r.status === "pending_approval").length);
  const pendingSuppliers = useStore((st) => Object.values(st.organisations).filter((o) => o.type === "supplier" && o.status === "pending").length);

  const sections = s.hydrated ? visibleAdminSections([s.roleId]) : [];

  const ALL: Record<string, NavGroup> = {
    ops: {
      title: "Operations",
      items: [
        { href: "/admin", label: "Ops dashboard", icon: LayoutDashboard, code: "O01", exact: true },
        { href: "/admin/ops/queue", label: "Booking queue", icon: ListChecks, code: "O02", badge: openTasks || undefined },
        { href: "/admin/ops/bookings", label: "All bookings", icon: BookOpen, code: "O03" },
        { href: "/admin/ops/manual", label: "Manual booking", icon: ClipboardList, code: "O04" },
        { href: "/admin/ops/suppliers", label: "Confirmation tracker", icon: CalendarClock, code: "O05" },
        { href: "/admin/ops/amendments", label: "Amendment queue", icon: GitBranch, code: "O06" },
        { href: "/admin/ops/exceptions", label: "Exception board", icon: AlertTriangle, code: "O07" },
        { href: "/admin/ops/departures", label: "Departures today", icon: Activity, code: "O08" },
      ],
    },
    support: {
      title: "Support",
      items: [
        { href: "/admin/support", label: "Ticket inbox", icon: Inbox, code: "U01", badge: openTickets || undefined },
        { href: "/admin/support/lookup", label: "Customer lookup", icon: Search, code: "U02" },
        { href: "/admin/support/impersonate", label: "Impersonation", icon: Shield, code: "U04" },
      ],
    },
    supply: {
      title: "Supply",
      items: [
        { href: "/admin/supply", label: "Supplier directory", icon: Store, code: "P01" },
        { href: "/admin/supply/onboarding", label: "Onboarding queue", icon: Building2, code: "P02", badge: pendingSuppliers || undefined },
        { href: "/admin/supply/products", label: "Product approvals", icon: Boxes, code: "P04", badge: pendingProducts || undefined },
        { href: "/admin/supply/loading", label: "Content loading", icon: FileText, code: "P05" },
        { href: "/admin/supply/rates", label: "Rate competitiveness", icon: Percent, code: "P06" },
        { href: "/admin/supply/performance", label: "Supplier performance", icon: Gauge, code: "P07" },
      ],
    },
    content: {
      title: "Content",
      items: [
        { href: "/admin/content", label: "Landing pages", icon: FileText, code: "M01" },
        { href: "/admin/content/rails", label: "Home rails", icon: LayoutDashboard, code: "M02" },
        { href: "/admin/content/promos", label: "Offers & promos", icon: Megaphone, code: "M03" },
        { href: "/admin/content/seo", label: "SEO", icon: TrendingUp, code: "M04" },
        { href: "/admin/content/media", label: "Media library", icon: Image, code: "M05" },
        { href: "/admin/content/banners", label: "Banners", icon: Flag, code: "M06" },
      ],
    },
    finance: {
      title: "Finance",
      items: [
        { href: "/admin/finance", label: "Finance dashboard", icon: BarChart3, code: "F01" },
        { href: "/admin/finance/reconciliation", label: "Reconciliation", icon: Receipt, code: "F02" },
        { href: "/admin/finance/refunds", label: "Refund queue", icon: Coins, code: "F03", badge: pendingRefunds || undefined },
        { href: "/admin/finance/payouts", label: "Supplier payouts", icon: Banknote, code: "F04" },
        { href: "/admin/finance/ledger", label: "Ledger", icon: ScrollText, code: "F05" },
        { href: "/admin/finance/revenue", label: "Revenue reports", icon: BadgeDollarSign, code: "F08" },
        { href: "/admin/finance/tax", label: "Tax", icon: Percent, code: "F09" },
      ],
    },
    settings: {
      title: "Administration",
      items: [
        { href: "/admin/settings/users", label: "Users", icon: Users, code: "X01" },
        { href: "/admin/settings/roles", label: "Role grants", icon: UserCog, code: "X02" },
        { href: "/admin/settings/role-builder", label: "Role builder", icon: KeyRound, code: "X03" },
        { href: "/admin/settings/audit", label: "Audit log", icon: ScrollText, code: "X04" },
        { href: "/admin/settings/integrations", label: "Integrations", icon: Plug, code: "X05" },
        { href: "/admin/settings/flags", label: "Feature flags", icon: Flag, code: "X06" },
        { href: "/admin/settings/system", label: "System settings", icon: Settings, code: "X07" },
        { href: "/admin/settings/templates", label: "Notification templates", icon: Mail, code: "X08" },
      ],
    },
  };

  const groups = sections.map((sec) => ALL[sec]).filter(Boolean);
  // The guide is available to every staff role — nobody should have to guess what a screen does.
  groups.push({ title: "Help", items: [{ href: "/admin/guide", label: "User guide", icon: BookOpen }] });

  if (s.hydrated && !s.isInternal) {
    return (
      <ConsoleShell subtitle="Back office" groups={[]} title="Back office">
        <div className="mx-auto max-w-md rounded-xl border bg-card p-6 text-center">
          <LifeBuoy className="mx-auto size-8 text-brand-text" aria-hidden />
          <h2 className="mt-3 font-display text-xl">Staff access only</h2>
          <p className="mt-1.5 text-sm text-muted-foreground">
            You are signed in as {s.user?.name ?? "a guest"} ({s.roleLabel}). The back office needs an internal role —
            operations, support, supply, content, finance or administration.
          </p>
          <Button asChild className="mt-4"><Link href="/login">Switch to a staff persona</Link></Button>
        </div>
      </ConsoleShell>
    );
  }

  return <ConsoleShell subtitle="Back office" groups={groups}>{children}</ConsoleShell>;
}
