import type { RoleId } from "./types";

export type Domain =
  | "BOOKING" | "INVENTORY" | "PRICING" | "PAYMENT" | "REFUND" | "PAYOUT"
  | "USER" | "ORGANISATION" | "CONTENT" | "REPORT" | "SETTINGS" | "AUDIT";
export type Verb = "view" | "create" | "edit" | "delete" | "approve" | "export" | "impersonate";
export type Permission = `${Domain}:${Verb}` | (string & {});

/**
 * Role → permission bundles.
 *
 * Aeropath is itself the travel agent: flights and car rental come from Amadeus and earn
 * commission, stays and tours come from direct supplier contracts. There is therefore no
 * reseller-agent or corporate-buyer role — the people who see net rates and set commission are
 * our own supply and finance staff.
 */
const P = {
  guest: ["SEARCH:view", "BOOKING:create", "BOOKING:view_own"],
  traveller: ["SEARCH:view", "BOOKING:create", "BOOKING:view_own", "BOOKING:amend_own", "BOOKING:cancel_own", "INVOICE:download_own"],
  supplier_staff: ["PRODUCT:view_own", "PRODUCT:edit_own", "PRODUCT:submit", "AVAILABILITY:manage", "STOPSELL:set", "SUPPLIER_BOOKING:view", "SUPPLIER_BOOKING:confirm"],
  supplier_admin: ["PRODUCT:view_own", "PRODUCT:edit", "PRODUCT:submit", "AVAILABILITY:manage", "RATEPLAN:manage", "STOPSELL:set", "SUPPLIER_BOOKING:view", "SUPPLIER_BOOKING:confirm", "REVIEW:respond", "PAYOUT:view", "SUPPLIER:manage_users", "CONTRACT:view"],
  support: ["BOOKING:view_any", "BOOKING:amend_limited", "USER:impersonate", "TICKET:manage", "CUSTOMER:view"],
  ops_officer: ["BOOKING:view_any", "BOOKING:create_manual", "BOOKING:amend", "BOOKING:cancel", "REFUND:issue_low", "OPS:queue", "OPS:exceptions", "PAYMENT:reconcile"],
  ops_manager: ["BOOKING:view_any", "BOOKING:create_manual", "BOOKING:amend", "BOOKING:cancel", "BOOKING:force_confirm", "PRICING:override", "REFUND:issue_low", "REFUND:issue_mid", "REFUND:goodwill", "LEDGER:view", "PRODUCT:approve_read", "PROMO:create_limited", "AUDIT:view", "USER:impersonate", "OPS:queue", "OPS:exceptions", "PAYMENT:reconcile"],
  supply_manager: ["BOOKING:view_any_read", "SUPPLIER:approve_onboarding", "COMMISSION:edit", "PRODUCT:approve", "PRODUCT:load", "SUPPLIER:manage", "AUDIT:view"],
  content_editor: ["CONTENT:edit", "PROMO:create", "PRODUCT:approve_own_content", "MEDIA:manage"],
  finance_officer: ["BOOKING:view_any_read", "REFUND:issue_low", "PAYOUT:approve_own", "LEDGER:view", "PAYMENT:reconcile", "AUDIT:view", "FINANCE:view"],
  finance_manager: ["BOOKING:view_any", "PRICING:override", "REFUND:issue_low", "REFUND:issue_mid", "REFUND:issue_high", "PAYOUT:approve", "LEDGER:view", "COMMISSION:edit", "PROMO:create", "AUDIT:view", "PAYMENT:reconcile", "FINANCE:view", "CREDIT:manage_all", "INVOICE:manage"],
  auditor: ["BOOKING:view_any_read", "LEDGER:view", "AUDIT:view", "FINANCE:view_read"],
  platform_admin: ["BOOKING:view_any", "BOOKING:create_manual", "BOOKING:amend", "BOOKING:cancel", "BOOKING:force_confirm", "SUPPLIER:approve_onboarding", "PRODUCT:approve", "CONTENT:edit", "USER:manage", "ROLE:grant", "AUDIT:view", "USER:impersonate", "SETTINGS:edit", "INTEGRATIONS:manage", "OPS:queue", "OPS:exceptions", "PRODUCT:load", "SUPPLIER:manage", "FLAGS:manage"],
  super_admin: ["*"],
} as const satisfies Record<RoleId, readonly string[]>;

export const ROLE_PERMISSIONS: Record<RoleId, readonly string[]> = P;

export const ROLE_LABELS: Record<RoleId, string> = {
  guest: "Guest",
  traveller: "Traveller",
  supplier_staff: "Supplier Staff",
  supplier_admin: "Supplier Admin",
  support: "Support Agent",
  ops_officer: "Operations Officer",
  ops_manager: "Operations Manager",
  supply_manager: "Supply Manager",
  content_editor: "Content Editor",
  finance_officer: "Finance Officer",
  finance_manager: "Finance Manager",
  auditor: "Auditor",
  platform_admin: "Platform Admin",
  super_admin: "Super Admin",
};

export const INTERNAL_ROLES: RoleId[] = ["support", "ops_officer", "ops_manager", "supply_manager", "content_editor", "finance_officer", "finance_manager", "auditor", "platform_admin", "super_admin"];
export const SUPPLIER_ROLES: RoleId[] = ["supplier_staff", "supplier_admin"];

export function hasPermission(roles: RoleId[], permission: string): boolean {
  for (const r of roles) {
    const perms = ROLE_PERMISSIONS[r] ?? [];
    if (perms.includes("*")) return true;
    if (perms.includes(permission)) return true;
    // "BOOKING:view_any" implies "BOOKING:view_any_read"
    if (permission.endsWith("_read") && perms.includes(permission.replace(/_read$/, ""))) return true;
  }
  return false;
}

/** Which admin console sections a role can see. Drives the left rail. */
export const ADMIN_SECTIONS = {
  ops: ["ops_officer", "ops_manager", "platform_admin", "super_admin", "support"],
  support: ["support", "ops_manager", "platform_admin", "super_admin"],
  supply: ["supply_manager", "platform_admin", "super_admin", "content_editor", "ops_manager"],
  content: ["content_editor", "platform_admin", "super_admin"],
  finance: ["finance_officer", "finance_manager", "auditor", "super_admin", "ops_manager"],
  settings: ["platform_admin", "super_admin", "auditor"],
} as const satisfies Record<string, readonly RoleId[]>;

export type AdminSection = keyof typeof ADMIN_SECTIONS;

export function visibleAdminSections(roles: RoleId[]): AdminSection[] {
  return (Object.keys(ADMIN_SECTIONS) as AdminSection[]).filter((s) => (ADMIN_SECTIONS[s] as readonly RoleId[]).some((r) => roles.includes(r)));
}
