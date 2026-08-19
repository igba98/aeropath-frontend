"use client";

import { CalendarRange, FileSignature, Inbox, LayoutDashboard, Package, Rocket, Star, Users, Wallet } from "lucide-react";
import { ConsoleShell, type NavGroup } from "@/components/chrome/console-shell";
import { useSupplierContext, usePendingConfirmations } from "@/features/supplier/shared";

/**
 * Supplier console chrome. The rail is built from the signed in user's supplier organisation and
 * filtered by role: Supplier Staff never sees rate plans, payouts, users or the contract (§2.4).
 */
export default function SupplierConsoleLayout({ children }: { children: React.ReactNode }) {
  const { org, isAdmin } = useSupplierContext();
  const pending = usePendingConfirmations(org?.id);

  const groups: NavGroup[] = [
    {
      title: org ? org.name : "Supplier console",
      items: [
        { href: "/partner/supplier", label: "Dashboard", icon: LayoutDashboard, code: "S02", exact: true },
        { href: "/partner/supplier/bookings", label: "Bookings", icon: Inbox, code: "S07", badge: pending.length || undefined },
        { href: "/partner/supplier/availability", label: "Availability", icon: CalendarRange, code: "S06" },
      ],
    },
    {
      title: "Catalogue",
      items: [{ href: "/partner/supplier/products", label: "Products", icon: Package, code: "S03" }],
    },
    {
      title: "Account",
      items: [
        { href: "/partner/supplier/onboarding", label: "Onboarding", icon: Rocket, code: "S01" },
        ...(isAdmin
          ? [
              { href: "/partner/supplier/payouts", label: "Payouts", icon: Wallet, code: "S09" },
              { href: "/partner/supplier/reviews", label: "Reviews", icon: Star, code: "S10" },
              { href: "/partner/supplier/users", label: "Users", icon: Users, code: "S11" },
              { href: "/partner/supplier/contract", label: "Contract", icon: FileSignature, code: "S12" },
            ]
          : []),
      ],
    },
  ];

  return (
    <ConsoleShell subtitle="Supplier" groups={groups}>
      {children}
    </ConsoleShell>
  );
}
