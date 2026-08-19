"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Menu, PanelLeftClose } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Logo } from "./logo";
import { HelpPanel } from "./help-panel";
import { PersonaBar } from "./persona-bar";
import { ConsoleUserMenu } from "./console-user-menu";
import { cn } from "@/lib/utils";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** screen id from the specification, shown as a subtle hint */
  code?: string;
  badge?: number;
  exact?: boolean;
}
export interface NavGroup {
  title: string;
  items: NavItem[];
}

/** One console chrome for the partner portal and the back office; the rail is role driven. */
export function ConsoleShell({ subtitle, groups, children, title, actions }: { subtitle: string; groups: NavGroup[]; children: React.ReactNode; title?: string; actions?: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex min-h-dvh flex-col bg-neutral-25">
      <PersonaBar />
      <div className="flex flex-1">
        <aside className={cn("sticky top-0 hidden h-dvh shrink-0 bg-brand-800 text-white/70 transition-[width] md:flex md:flex-col", collapsed ? "w-[76px]" : "w-[268px]")}>
          <div className="flex h-16 items-center border-b border-white/10 px-4">
            {collapsed ? <Logo href="/" inverted className="[&_span:last-child]:hidden" /> : <Logo href="/" inverted subtitle={subtitle} />}
          </div>
          <nav className="no-scrollbar flex-1 overflow-y-auto px-3 py-4">
            {groups.map((g) => (
              <NavSection key={g.title} group={g} collapsed={collapsed} />
            ))}
          </nav>
          <div className="border-t border-white/10 p-3">
            <Button variant="ghost" size="sm" onClick={() => setCollapsed((c) => !c)} className={cn("w-full justify-start gap-2 text-muted-foreground", collapsed && "justify-center px-0")}>
              <PanelLeftClose className={cn("size-4 transition-transform", collapsed && "rotate-180")} aria-hidden />
              {collapsed ? null : "Collapse"}
            </Button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/95 px-5 backdrop-blur">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation">
                  <Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 bg-brand-800 p-0 text-white/70">
                <SheetHeader className="border-b border-white/10 p-4">
                  <SheetTitle asChild><Logo href="/" inverted subtitle={subtitle} /></SheetTitle>
                </SheetHeader>
                <nav className="overflow-y-auto px-3 py-4">
                  {groups.map((g) => <NavSection key={g.title} group={g} collapsed={false} />)}
                </nav>
              </SheetContent>
            </Sheet>
            {title ? <h1 className="truncate font-display text-xl">{title}</h1> : null}
            <div className="ml-auto flex items-center gap-2">
              {actions}
              <HelpPanel />
              <ConsoleUserMenu />
            </div>
          </header>
          <main className="min-w-0 flex-1 px-5 py-6 lg:px-8 lg:py-8">{children}</main>
        </div>
      </div>
    </div>
  );
}

function NavSection({ group, collapsed }: { group: NavGroup; collapsed: boolean }) {
  const pathname = usePathname();
  return (
    <div className="mb-4">
      {collapsed ? <div className="mx-2 my-3 border-t border-white/10" /> : <p className="px-3 pb-1.5 pt-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">{group.title}</p>}
      <ul className="space-y-1">
        {group.items.map((item) => {
          const active = item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] transition-colors",
                  collapsed && "justify-center px-0",
                  active ? "bg-white font-medium text-brand-800" : "text-white/70 hover:bg-white/10 hover:text-white",
                )}
              >
                <item.icon className={cn("size-[18px] shrink-0", active ? "text-brand-600" : "text-white/60")} aria-hidden />
                {collapsed ? null : (
                  <>
                    <span className="truncate">{item.label}</span>
                    {item.badge ? (
                      <span className={cn("ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums", active ? "bg-brand-600 text-white" : "bg-white/15 text-white")}>{item.badge}</span>
                    ) : item.code ? (
                      <span className="ml-auto font-mono text-[10px] text-white/30 opacity-0 transition-opacity group-hover:opacity-100">{item.code}</span>
                    ) : null}
                  </>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Standard page heading inside a console. */
export function PageHeader({ title, description, actions, code }: { title: string; description?: string; actions?: React.ReactNode; code?: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="font-display text-3xl">{title}</h1>
          {code ? <span className="font-mono text-[10px] text-placeholder">{code}</span> : null}
        </div>
        {description ? <p className="mt-1.5 max-w-3xl text-[15px] leading-relaxed text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** KPI tile used across dashboards. */
export function StatTile({ label, value, hint, tone = "default", icon: Icon }: { label: string; value: React.ReactNode; hint?: string; tone?: "default" | "warning" | "danger" | "success"; icon?: LucideIcon }) {
  return (
    <div className="rounded-xl border bg-card p-5 transition-colors hover:border-brand-200">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {Icon ? (
          <span className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg",
            tone === "warning" ? "bg-warning/12 text-warning" : tone === "danger" ? "bg-destructive/10 text-destructive" : tone === "success" ? "bg-success/12 text-success" : "bg-brand-50 text-brand-500",
          )}>
            <Icon className="size-[18px]" aria-hidden />
          </span>
        ) : null}
      </div>
      <p className={cn("mt-2 font-display text-[28px] leading-none tabular-nums", tone === "warning" && "text-warning-foreground", tone === "danger" && "text-destructive", tone === "success" && "text-success-foreground")}>{value}</p>
      {hint ? <p className="mt-1.5 text-sm text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
