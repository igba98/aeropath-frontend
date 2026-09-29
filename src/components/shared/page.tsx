"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { House as HomeIcon } from "lucide-react";
import type { Money } from "@/domain/types";
import { cn } from "@/lib/utils";
import { Amount } from "./amount";
import { TrendBadge } from "./trend";
import { Badge } from "@/components/ui/badge";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { NAV, isActive } from "@/components/layout/nav";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/** True inside a Section card: tables render flush to the card edges instead of making their own card. */
export const InCardContext = React.createContext(false);

export interface Crumb {
  label: React.ReactNode;
  /** Omit on the current page. */
  href?: string;
}

/**
 * Breadcrumbs (shadcn Breadcrumb): Home › Section › … › this page. Every crumb but the last is a link,
 * so the trail doubles as the way back, point to point.
 */
export function PageCrumbs({ items, className }: { items: Crumb[]; className?: string }) {
  if (!items.length) return null;
  const trail: Crumb[] = [{ label: "Home", href: "/" }, ...items];
  return (
    <Breadcrumb className={cn("mb-3", className)}>
      <BreadcrumbList>
        {trail.map((c, i) => {
          const last = i === trail.length - 1;
          return (
            <React.Fragment key={i}>
              <BreadcrumbItem className={cn(!last && i > 0 && i < trail.length - 2 && "max-sm:hidden")}>
                {last || !c.href ? (
                  <BreadcrumbPage className="max-w-[240px] truncate">{c.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href={c.href} className={cn(i === 0 && "inline-flex items-center gap-1.5")}>
                      {i === 0 && <HomeIcon className="size-3.5" aria-hidden />}
                      {c.label}
                    </Link>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!last && <BreadcrumbSeparator className={cn(i > 0 && i < trail.length - 2 && "max-sm:hidden")} />}
            </React.Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}

/** Trail for a page from the URL: its sidebar section, the accounting sub-page, then the page it came from. */
function useAutoCrumbs(title: React.ReactNode, back?: { href: string; label: string }, crumbLabel?: string): Crumb[] {
  const pathname = usePathname();
  if (pathname === "/") return [];
  const section = NAV.find((n) => n.href !== "/" && isActive(pathname, n.href));
  const items: Crumb[] = [];
  if (section && pathname !== section.href) items.push({ label: section.label, href: section.href });
  const child = section?.children?.find((c) => c.href !== section.href && isActive(pathname, c.href) && pathname !== c.href);
  if (child) items.push({ label: child.label, href: child.href });
  if (back && !items.some((c) => c.href === back.href) && back.href !== "/") items.push({ label: back.label, href: back.href });
  items.push({ label: crumbLabel ?? (typeof title === "string" ? title : section?.label ?? "") });
  return items;
}

/** Page header: breadcrumbs, a 26px title, one line of meta, actions at the right. */
export function PageHeader({
  title,
  meta,
  actions,
  back,
  crumbs,
  crumbLabel,
  children,
  className,
}: {
  title: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  /** Parent page; becomes a breadcrumb. Prefer `crumbs` for deeper trails. */
  back?: { href: string; label: string };
  /** Full trail after Home, the current page last (without href). Worked out from the URL when omitted. */
  crumbs?: Crumb[];
  /** Label of the current page in the trail when the title is not plain text. */
  crumbLabel?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const auto = useAutoCrumbs(title, back, crumbLabel);
  const trail = crumbs ?? auto;
  return (
    <header className={cn("pb-6", className)}>
      <PageCrumbs items={trail} />
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <h1 className="text-[26px] leading-9 font-bold tracking-[-0.02em] text-ink">{title}</h1>
          {meta && <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[15px] text-ink-3 max-sm:flex-col max-sm:items-start max-sm:gap-y-0.5 max-sm:[&>[aria-hidden]]:hidden">{meta}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </header>
  );
}

/** Card surface used everywhere a block of content sits on the page (shadcn Card). */
export function Panel({ className, children, ...props }: React.ComponentProps<"div">) {
  return (
    <Card className={cn("block gap-0 py-0", className)} {...props}>
      {children}
    </Card>
  );
}

/** Section: a shadcn Card with a title, optional count, description and actions. */
export function Section({
  title,
  count,
  actions,
  description,
  children,
  className,
  contentClassName,
  id,
  bare,
}: {
  title: React.ReactNode;
  count?: number;
  actions?: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  id?: string;
  /** Render without the card surface (heading only). */
  bare?: boolean;
}) {
  const heading = (
    <div className="min-w-0">
      <CardTitle>
        <h2 className="flex items-center gap-2">
          {title}
          {count !== undefined && <Badge variant="count">{count}</Badge>}
        </h2>
      </CardTitle>
      {description && <CardDescription className="mt-1">{description}</CardDescription>}
    </div>
  );
  if (bare)
    return (
      <section id={id} className={cn("min-w-0", className)}>
        <CardHeader className="mb-4 px-0">
          {heading}
          {actions && <CardAction>{actions}</CardAction>}
        </CardHeader>
        {children}
      </section>
    );
  return (
    <Card asChild className={cn("overflow-hidden", className)}>
      <section id={id}>
        <CardHeader>
          {heading}
          {actions && <CardAction>{actions}</CardAction>}
        </CardHeader>
        <InCardContext.Provider value={true}>
          <CardContent className={contentClassName}>{children}</CardContent>
        </InCardContext.Provider>
      </section>
    </Card>
  );
}

/** Empty state: an icon in a soft circle, one friendly line and the action that fixes it. */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  className,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  body?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center px-4 py-12 text-center", className)}>
      {Icon && (
        <span className="mb-4 grid size-12 place-items-center rounded-full bg-canvas-2 text-ink-3">
          <Icon className="size-5" />
        </span>
      )}
      <p className="text-[15px] font-semibold text-ink">{title}</p>
      {body && <p className="mt-1.5 max-w-sm text-sm text-ink-3">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** A KPI card (shadcn Card): label, big tabular value, trend badge, footnote. */
export function StatCard({
  label,
  value,
  trend,
  trendLabel,
  trendInvert,
  trendNeutral,
  footer,
  href,
  icon: Icon,
  tone,
}: {
  label: string;
  value: Money | number | string;
  /** Fractional change (0.12 = +12%); null/undefined hides the badge. */
  trend?: number | null;
  trendLabel?: string;
  /** Up is bad (what we owe). */
  trendInvert?: boolean;
  /** Neither good nor bad (what clients owe us). */
  trendNeutral?: boolean;
  footer?: React.ReactNode;
  href?: string;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: "default" | "warn" | "bad";
}) {
  const hasTrend = trend !== null && trend !== undefined && Number.isFinite(trend);
  const badge = (cls: string) => (hasTrend ? <TrendBadge value={trend!} invert={trendInvert} neutral={trendNeutral} label={trendLabel ?? "vs the same days last month"} className={cls} /> : null);
  const valueCls = "text-[17px] leading-6 font-bold tracking-[-0.02em] sm:text-[26px] sm:leading-8";
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 text-[13px] font-medium text-ink-3 sm:text-sm">
          {Icon && <Icon className="size-4 shrink-0" />}
          <span className="truncate">{label}</span>
        </span>
        {badge("max-sm:hidden")}
      </div>
      <div className={cn("mt-2.5 min-w-0 sm:mt-3", tone === "bad" && "text-[var(--st-red-fg)]", tone === "warn" && "text-[var(--st-amber-fg)]")}>
        {typeof value === "object" ? (
          <Amount value={value} className={cn(valueCls, "text-current")} codeClassName="text-[0.55em] font-semibold" />
        ) : (
          <span className={cn("tnum text-ink", valueCls)}>{typeof value === "number" ? value.toLocaleString("en-US") : value}</span>
        )}
      </div>
      {hasTrend && <div className="mt-2 sm:hidden">{badge("")}</div>}
      {(footer || trendLabel) && <div className="mt-2 hidden text-[13px] text-ink-3 sm:block">{footer ?? trendLabel}</div>}
    </>
  );
  const cls = "block p-3.5 sm:p-5";
  return href ? (
    <Card asChild className={cn(cls, "transition-colors hover:border-rule-2 hover:bg-band-hover")}>
      <Link href={href}>{body}</Link>
    </Card>
  ) : (
    <Card className={cls}>{body}</Card>
  );
}

/**
 * Page section tabs synced to ?tab= (shadcn Tabs, line variant). The active section renders as the tab panel.
 * Pass `count` to show a figure beside a label.
 */
export function TabsNav({
  tabs,
  param = "tab",
  defaultTab,
  className,
  children,
}: {
  tabs: { id: string; label: string; count?: number; hidden?: boolean }[];
  param?: string;
  defaultTab?: string;
  className?: string;
  /** The active section's content. */
  children?: React.ReactNode;
}) {
  const sp = useSearchParams();
  const setParam = useSetParam();
  const visible = tabs.filter((t) => !t.hidden);
  const active = sp.get(param) ?? defaultTab ?? visible[0]?.id;
  return (
    <Tabs value={active} onValueChange={(v) => setParam(param, v)} className={cn("gap-6", className)}>
      <div className="no-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <TabsList variant="line" aria-label="Sections">
          {visible.map((t) => (
            <TabsTrigger key={t.id} value={t.id} className="group/tab">
              {t.label}
              {t.count !== undefined && (
                <Badge variant="count" className="group-data-[state=active]/tab:bg-band group-data-[state=active]/tab:text-brand-700 dark:group-data-[state=active]/tab:text-brand-300">
                  {t.count}
                </Badge>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {children !== undefined && <TabsContent value={active}>{children}</TabsContent>}
    </Tabs>
  );
}

export function useTab(defaultTab: string, param = "tab") {
  const sp = useSearchParams();
  return sp.get(param) ?? defaultTab;
}

/** Replace one query param without scrolling. */
export function useSetParam() {
  const sp = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  return React.useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(sp.toString());
      if (value === null || value === "") next.delete(key);
      else next.set(key, value);
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [sp, pathname, router],
  );
}

/**
 * Quick view filters (All · Drafts · Confirmed …) as shadcn Tabs (pill variant).
 * They filter content that lives elsewhere on the page, so pass `controls` with that element's id.
 */
export function QuickTabs<T extends string>({
  value,
  onChange,
  options,
  className,
  controls,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; count?: number }[];
  className?: string;
  /** id of the list or table these tabs filter. */
  controls?: string;
}) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as T)} className={cn("no-scrollbar -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0", className)}>
      <TabsList>
        {options.map((o) => (
          <TabsTrigger key={o.value} value={o.value} aria-controls={controls} className="group/tab">
            {o.label}
            {o.count !== undefined && <span className="tnum text-[13px] font-medium text-ink-4 group-data-[state=active]/tab:text-ink-3">{o.count}</span>}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

/** Two-to-four option segmented control (e.g. TZS | USD). */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  size = "sm",
  label,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: React.ReactNode; title?: string }[];
  size?: "xs" | "sm";
  label: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex w-fit max-w-full flex-wrap items-center gap-0.5 self-start rounded-lg bg-canvas-2 p-1", className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            title={o.title}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-md font-semibold transition-colors",
              size === "xs" ? "h-6 px-2 text-xs" : "h-7 px-2.5 text-[13px]",
              on ? "bg-paper text-ink shadow-[0_1px_2px_rgb(15_23_42/0.12)]" : "text-ink-3 hover:text-ink",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
