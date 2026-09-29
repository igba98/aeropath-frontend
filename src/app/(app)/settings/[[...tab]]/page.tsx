"use client";

import * as React from "react";
import { Suspense } from "react";
import { useParams, useRouter } from "next/navigation";

import { can } from "@/domain/permissions";
import { useApp, useMe } from "@/store";

import { PageHeader } from "@/components/shared/page";
import { SETTINGS_TABS, SettingsNav, visibleTabs, type SettingsTabId } from "@/components/settings/settings-kit";
import { CompanyTab } from "@/components/settings/company-tab";
import { UsersTab } from "@/components/settings/users-tab";
import { MoneyAccountsTab } from "@/components/settings/money-accounts-tab";
import { SuppliersTab } from "@/components/settings/suppliers-tab";
import { FeesTab } from "@/components/settings/fees-tab";
import { CurrencyTab } from "@/components/settings/currency-tab";
import { NumberingTab } from "@/components/settings/numbering-tab";
import { AirlinesTab } from "@/components/settings/airlines-tab";
import { IntegrationsTab } from "@/components/settings/integrations-tab";
import { AuditTab } from "@/components/settings/audit-tab";
import { DemoTab } from "@/components/settings/demo-tab";

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsScreen />
    </Suspense>
  );
}

const PANELS: Record<SettingsTabId, React.ComponentType> = {
  company: CompanyTab,
  users: UsersTab,
  "money-accounts": MoneyAccountsTab,
  suppliers: SuppliersTab,
  fees: FeesTab,
  currency: CurrencyTab,
  numbering: NumberingTab,
  airlines: AirlinesTab,
  integrations: IntegrationsTab,
  audit: AuditTab,
  demo: DemoTab,
};

function SettingsScreen() {
  const me = useMe();
  const db = useApp((s) => s.db)!;
  const router = useRouter();
  const params = useParams<{ tab?: string[] }>();
  const requested = params.tab?.[0];
  const tabs = visibleTabs(me);
  const current = tabs.find((t) => t.id === requested);

  const first = tabs[0]?.id;
  const missing = !current;
  React.useEffect(() => {
    if (missing && first) router.replace(`/settings/${first}`);
  }, [missing, first, router]);

  const counts: Partial<Record<SettingsTabId, number>> = {
    users: Object.values(db.users).filter((u) => u.active && u.id !== "usr_system").length,
    "money-accounts": Object.values(db.moneyAccounts).filter((a) => a.active).length,
    suppliers: Object.values(db.suppliers).filter((s) => s.active).length,
    airlines: db.settings.airlines.length,
  };

  const Panel = current ? PANELS[current.id] : null;
  const viewOnly = !can(me, "settings.edit");

  return (
    <>
      <PageHeader
        title="Settings"
        crumbs={[{ label: "Settings", href: "/settings" }, { label: current?.label ?? "Settings" }]}
        meta={
          viewOnly ? <span>You can look at these settings; a Manager makes changes.</span> : <span>Every change is recorded in the audit log.</span>
        }
      />
      <div className="lg:grid lg:grid-cols-[208px_minmax(0,1fr)] lg:gap-10">
        <SettingsNav tabs={tabs} active={current?.id ?? SETTINGS_TABS[0].id} counts={counts} />
        <div className="min-w-0">{Panel ? <Panel key={current!.id} /> : null}</div>
      </div>
    </>
  );
}
