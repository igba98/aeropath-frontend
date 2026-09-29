import type { Money, RefundRequest, Role, Settings, User } from "./types";
import { convert, format } from "./money";

/**
 * Roles and permissions (spec §4.2). Enforced here, in the domain — the UI hides buttons as a courtesy only.
 */

export const ACTIONS = [
  // Home dashboard
  "home.view",
  // View bookings and clients (Accountant: view only)
  "booking.view",
  "client.view",
  // Create and edit clients and travellers
  "client.create",
  "client.edit",
  "traveller.edit",
  // Corporate credit limit and payment terms
  "client.set_credit",
  // Create bookings and add or edit service lines
  "booking.create",
  "booking.edit",
  "booking.cancel",
  "line.edit",
  "provider.import",
  // Selling price at or above cost / below cost
  "line.price",
  "line.price_below_cost",
  // Transition a line: book, issue, complete, cancel
  "line.transition",
  // Void a flight
  "line.void",
  // Refunds and exchanges
  "refund.request",
  "refund.waive",
  "refund.approve", // resource-aware: limit check
  "refund.pay",
  // Payments
  "payment.list",
  "payment.record",
  "payment.verify",
  "payment.reverse",
  "fx.override",
  // Documents
  "document.issue",
  "document.print",
  // Money out
  "moneyout.view",
  "supplier_payment.record",
  "supplier.manage",
  "expense.record",
  // Reports
  "report.my_sales",
  "report.view",
  // Audit log
  "audit.view",
  // Settings
  "settings.view",
  "settings.edit",
  "money_account.manage",
  "settings.admin",
  "user.manage",
  "integration.manage",
  "demo.reset",
  // Reassign a booking
  "booking.reassign",
  // Client communications
  "comms.view",
  "comms.send",
  "comms.settings",
  // Accounting (books, statements, reconciliation, petty cash)
  "accounting.view",
  "journal.post",
  "bank.reconcile",
  "pettycash.record",
] as const;

export type Action = (typeof ACTIONS)[number];

const ALL: readonly Role[] = ["agent", "accountant", "manager"];
const AGENT_MANAGER: readonly Role[] = ["agent", "manager"];
const FINANCE: readonly Role[] = ["accountant", "manager"];
const MANAGER: readonly Role[] = ["manager"];

/** Who may perform each action (before resource-aware rules). */
export const PERMISSIONS: Record<Action, readonly Role[]> = {
  "home.view": ALL,
  "booking.view": ALL,
  "client.view": ALL,
  "client.create": ALL,
  "client.edit": ALL,
  "traveller.edit": ALL,
  "client.set_credit": MANAGER,
  "booking.create": AGENT_MANAGER,
  "booking.edit": AGENT_MANAGER,
  "booking.cancel": AGENT_MANAGER,
  "line.edit": AGENT_MANAGER,
  "provider.import": AGENT_MANAGER,
  "line.price": AGENT_MANAGER,
  "line.price_below_cost": MANAGER,
  "line.transition": AGENT_MANAGER,
  "line.void": AGENT_MANAGER,
  "refund.request": AGENT_MANAGER,
  "refund.waive": MANAGER,
  "refund.approve": FINANCE,
  "refund.pay": FINANCE,
  "payment.list": ALL,
  "payment.record": ALL,
  "payment.verify": FINANCE,
  "payment.reverse": FINANCE,
  "fx.override": FINANCE,
  "document.issue": ALL,
  "document.print": ALL,
  "moneyout.view": FINANCE,
  "supplier_payment.record": FINANCE,
  "supplier.manage": FINANCE,
  "expense.record": FINANCE,
  "report.my_sales": ALL,
  "report.view": FINANCE,
  "audit.view": FINANCE,
  "settings.view": FINANCE,
  "settings.edit": MANAGER,
  "money_account.manage": MANAGER,
  "settings.admin": MANAGER,
  "user.manage": MANAGER,
  "integration.manage": MANAGER,
  "demo.reset": MANAGER,
  "booking.reassign": MANAGER,
  "comms.view": ALL,
  "comms.send": ALL,
  "comms.settings": MANAGER,
  "accounting.view": FINANCE,
  "journal.post": FINANCE,
  "bank.reconcile": FINANCE,
  "pettycash.record": FINANCE,
};

/** Optional context for resource-aware rules. */
export interface PermissionResource {
  settings?: Pick<Settings, "fx" | "refundApprovalLimit">;
  /** refund.approve: the client refund to check against the approval limit (any currency). */
  clientRefund?: Money;
  /** refund.approve: alternatively pass the refund request itself. */
  refund?: Pick<RefundRequest, "quote">;
}

/** True when a client refund is above the approval limit (both converted to TZS at the settings rate). */
export function refundNeedsManager(clientRefund: Money, settings: Pick<Settings, "fx" | "refundApprovalLimit">): boolean {
  const rate = settings.fx.USD_TZS;
  const amountTzs = convert(clientRefund, "TZS", rate).amountMinor;
  const limitTzs = convert(settings.refundApprovalLimit, "TZS", rate).amountMinor;
  return amountTzs > limitTzs;
}

export function can(user: Pick<User, "role" | "active"> | null | undefined, action: Action, resource?: PermissionResource): boolean {
  if (!user || !user.active) return false;
  const roles = PERMISSIONS[action];
  if (!roles || !roles.includes(user.role)) return false;

  if (action === "refund.approve" && resource?.settings) {
    const clientRefund = resource.clientRefund ?? resource.refund?.quote.clientRefund;
    if (clientRefund && refundNeedsManager(clientRefund, resource.settings)) return user.role === "manager";
  }
  return true;
}

// ───────────────────────────── Plain-words messages ─────────────────────────────

const ROLE_LABEL: Record<Role, string> = { agent: "Agent", accountant: "Accountant", manager: "Manager" };

export const roleLabel = (r: Role): string => ROLE_LABEL[r];

/** "Only a Manager", "Only an Accountant or a Manager", "Only an Agent or a Manager", "Everyone". */
export function whoCan(roles: readonly Role[]): string {
  if (roles.length >= 3) return "Everyone";
  const withArticle = roles.map((r) => (r === "manager" ? "a Manager" : r === "agent" ? "an Agent" : "an Accountant"));
  return `Only ${withArticle.join(" or ")}`;
}

const ACTION_PHRASE: Record<Action, string> = {
  "home.view": "open the home page",
  "booking.view": "view bookings",
  "client.view": "view clients",
  "client.create": "create clients",
  "client.edit": "edit clients",
  "traveller.edit": "add or edit travellers",
  "client.set_credit": "set a credit limit or payment terms",
  "booking.create": "create bookings",
  "booking.edit": "edit bookings",
  "booking.cancel": "cancel bookings",
  "line.edit": "add or edit services on a booking",
  "provider.import": "import bookings from Amadeus",
  "line.price": "set selling prices",
  "line.price_below_cost": "sell below cost, with a reason",
  "line.transition": "book, issue, complete or cancel services",
  "line.void": "void tickets",
  "refund.request": "request refunds or exchanges",
  "refund.waive": "waive the original markup and service fee on a refund",
  "refund.approve": "approve or reject refunds",
  "refund.pay": "pay out client refunds",
  "payment.list": "view payments",
  "payment.record": "record payments",
  "payment.verify": "verify payments",
  "payment.reverse": "reverse payments",
  "fx.override": "change the exchange rate on a payment",
  "document.issue": "issue invoices and quotes",
  "document.print": "print or share documents",
  "moneyout.view": "open Money out",
  "supplier_payment.record": "pay suppliers",
  "supplier.manage": "add or edit suppliers",
  "expense.record": "record expenses",
  "report.my_sales": "open the My sales report",
  "report.view": "open this report",
  "audit.view": "view the audit log",
  "settings.view": "open Settings",
  "settings.edit": "change settings",
  "money_account.manage": "add or edit money accounts",
  "settings.admin": "manage users, integrations and demo data",
  "user.manage": "add or edit users",
  "integration.manage": "change integrations",
  "demo.reset": "reset the demo data",
  "booking.reassign": "reassign a booking to another agent",
  "comms.view": "open Communications",
  "comms.send": "message clients",
  "comms.settings": "change automatic messages and templates",
  "accounting.view": "open Accounting",
  "journal.post": "post journal entries",
  "bank.reconcile": "reconcile bank accounts",
  "pettycash.record": "record petty cash",
};

/** The message shown when `can()` says no, e.g. "Only a Manager can approve refunds above TZS 500,000." */
export function forbiddenMessage(action: Action, resource?: PermissionResource, user?: Pick<User, "active"> | null): string {
  if (user && !user.active) return "Your account is deactivated. Ask your manager to reactivate it.";
  if (action === "refund.approve" && resource?.settings) {
    const clientRefund = resource.clientRefund ?? resource.refund?.quote.clientRefund;
    if (clientRefund && refundNeedsManager(clientRefund, resource.settings)) {
      return `Only a Manager can approve refunds above ${format(convert(resource.settings.refundApprovalLimit, "TZS", resource.settings.fx.USD_TZS))}.`;
    }
  }
  return `${whoCan(PERMISSIONS[action])} can ${ACTION_PHRASE[action]}.`;
}

// ───────────────────────────── Route guard ─────────────────────────────

/** Route prefix → action required to open it. Longest prefix wins; '/reports/<slug>' needs report.view except my-sales. */
export const ROUTE_ACTIONS: Record<string, Action> = {
  "/": "home.view",
  "/bookings": "booking.view",
  "/bookings/new": "booking.create",
  "/book": "booking.create",
  "/clients": "client.view",
  "/clients/new": "client.create",
  "/payments": "payment.list",
  "/money-out": "moneyout.view",
  "/reports": "report.my_sales",
  "/reports/my-sales": "report.my_sales",
  "/settings": "settings.view",
  "/settings/users": "settings.admin",
  "/settings/integrations": "settings.admin",
  "/settings/demo": "settings.admin",
  "/settings/audit": "audit.view",
  "/print": "document.print",
  "/communications": "comms.view",
  "/accounting": "accounting.view",
};

/** Routes open to any signed-in user regardless of role. */
const OPEN_ROUTES = ["/forbidden", "/login"];

const matches = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`);

/** The action required to open a pathname, or null when the route needs no specific permission. */
export function routeAction(pathname: string): Action | null {
  const path = (pathname.split(/[?#]/)[0] || "/").replace(/\/+$/, "") || "/";
  if (OPEN_ROUTES.some((p) => matches(path, p))) return null;
  if (path === "/") return ROUTE_ACTIONS["/"];

  let best: string | null = null;
  for (const prefix of Object.keys(ROUTE_ACTIONS)) {
    if (prefix === "/") continue;
    if (matches(path, prefix) && (!best || prefix.length > best.length)) best = prefix;
  }
  if (best === "/reports" && path !== "/reports") return "report.view"; // any report other than my-sales
  return best ? ROUTE_ACTIONS[best] : null;
}

export function canAccessRoute(user: Pick<User, "role" | "active"> | null | undefined, pathname: string): boolean {
  if (!user || !user.active) return false;
  const action = routeAction(pathname);
  return action === null ? true : can(user, action);
}
