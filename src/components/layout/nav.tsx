import {
  ArrowUpFromLine,
  BookOpenCheck,
  ChartColumn,
  House,
  Landmark,
  MessagesSquare,
  PlaneTakeoff,
  Settings2,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export interface NavChild {
  href: string;
  label: string;
}

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Sub-pages shown as a dropdown under the item in the sidebar. */
  children?: NavChild[];
}

/** Accounting sub-pages (Accountant and Manager). */
export const ACCOUNTING_NAV: NavChild[] = [
  { href: "/accounting", label: "Overview" },
  { href: "/accounting/accounts", label: "Chart of accounts" },
  { href: "/accounting/journals", label: "Journal entries" },
  { href: "/accounting/ledger", label: "General ledger" },
  { href: "/accounting/trial-balance", label: "Trial balance" },
  { href: "/accounting/profit-and-loss", label: "Profit or loss" },
  { href: "/accounting/balance-sheet", label: "Balance sheet" },
  { href: "/accounting/reconciliation", label: "Bank reconciliation" },
  { href: "/accounting/petty-cash", label: "Petty cash" },
  { href: "/accounting/expenses", label: "Expenses" },
  { href: "/accounting/vat", label: "VAT return" },
];

/** Sidebar groups, in order. Visibility per role comes from canAccessRoute. */
export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Workspace",
    items: [
      { href: "/", label: "Home", icon: House },
      { href: "/book", label: "Search and book", icon: PlaneTakeoff },
      { href: "/bookings", label: "Bookings", icon: BookOpenCheck },
      { href: "/clients", label: "Clients", icon: Users },
      { href: "/payments", label: "Payments", icon: Wallet },
      { href: "/communications", label: "Communications", icon: MessagesSquare },
    ],
  },
  {
    label: "Finance",
    items: [
      { href: "/money-out", label: "Money out", icon: ArrowUpFromLine },
      { href: "/accounting", label: "Accounting", icon: Landmark, children: ACCOUNTING_NAV },
      { href: "/reports", label: "Reports", icon: ChartColumn },
    ],
  },
  { label: "Admin", items: [{ href: "/settings", label: "Settings", icon: Settings2 }] },
];

/** Every top-level section, flat. */
export const NAV: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);

export const ROLE_LABEL = { agent: "Agent", accountant: "Accountant", manager: "Manager" } as const;

export function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}

/** A sub-page is active on its own path only; the overview must not light up for every child. */
export function isChildActive(pathname: string, href: string, siblings: NavChild[]) {
  if (pathname === href) return true;
  const deeper = siblings.some((s) => s.href !== href && s.href.startsWith(href + "/") && isActive(pathname, s.href));
  return !deeper && pathname.startsWith(href + "/");
}
