"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Check, ChevronRight, ChevronsUpDown, LogOut, Monitor, Moon, Sun, Users } from "lucide-react";

import type { User } from "@/domain/types";
import { canAccessRoute } from "@/domain/permissions";
import { useApp } from "@/store";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { BrandMark } from "./brand";
import { NAV_GROUPS, ROLE_LABEL, isActive, isChildActive, type NavItem } from "./nav";

/** Menu button on the blue shell: quiet white text, a white pill when active. */
const ITEM =
  "h-10 rounded-lg text-[15px] font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-white data-[active=true]:bg-sidebar-primary data-[active=true]:font-semibold data-[active=true]:text-sidebar-primary-foreground data-[active=true]:shadow-[0_1px_3px_rgb(0_0_0/0.18)] [&>svg]:size-[18px]";
const BADGE =
  "tnum rounded-full bg-white/15 px-2 text-xs font-semibold text-white peer-data-[active=true]/menu-button:bg-brand-50 peer-data-[active=true]/menu-button:text-brand-700 dark:peer-data-[active=true]/menu-button:bg-brand-100";

/** The app's navigation: shadcn Sidebar on the Route Blue shell, inset variant, collapsible to icons, a sheet on phones. */
export function AppSidebar({ user, badges, ...props }: { user: User; badges?: Partial<Record<string, number>> } & React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  const { isMobile, setOpenMobile, state } = useSidebar();
  const close = () => isMobile && setOpenMobile(false);

  return (
    <Sidebar collapsible="icon" variant="inset" {...props}>
      <SidebarHeader className="pb-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild tooltip="Aeropath home" className="hover:bg-sidebar-accent">
              <Link href="/" onClick={close}>
                <BrandMark priority className="size-9 shadow-[0_2px_10px_rgb(0_0_0/0.25)] ring-2 ring-white/85 group-data-[collapsible=icon]:size-8" />
                <span className="grid flex-1 text-left leading-tight">
                  <span className="truncate text-base font-bold tracking-[-0.01em] text-white">Aeropath</span>
                  <span className="truncate text-xs font-medium text-sidebar-muted">Travel back office</span>
                </span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent className="gap-1">
        {NAV_GROUPS.map((g) => {
          const items = g.items.filter((n) => canAccessRoute(user, n.href));
          if (!items.length) return null;
          return (
            <SidebarGroup key={g.label} className="py-1.5">
              <SidebarGroupLabel className="text-[11px] font-semibold tracking-[0.06em] text-sidebar-muted uppercase">{g.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu className="gap-0.5">
                  {items.map((n) => {
                    const Icon = n.icon;
                    const on = isActive(pathname, n.href);
                    const badge = badges?.[n.href];
                    if (n.children?.length && state !== "collapsed") {
                      return <DropdownItem key={n.href} item={n} pathname={pathname} onNavigate={close} />;
                    }
                    return (
                      <SidebarMenuItem key={n.href}>
                        <SidebarMenuButton asChild isActive={on} tooltip={n.label} className={ITEM}>
                          <Link href={n.href} onClick={close}>
                            <Icon className={on ? "text-brand-600 dark:text-brand-700" : "text-sidebar-muted"} />
                            <span>{n.label}</span>
                          </Link>
                        </SidebarMenuButton>
                        {badge ? <SidebarMenuBadge className={BADGE}>{badge}</SidebarMenuBadge> : null}
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>

      <SidebarFooter className="gap-3">
        <p className="mx-2 flex items-center gap-2 rounded-lg bg-white/8 px-3 py-2 text-xs text-sidebar-foreground group-data-[collapsible=icon]:hidden">
          <span aria-hidden className="size-2 shrink-0 rounded-full bg-[#fbbf24]" />
          Demo data · stored in this browser
        </p>
        <NavUser user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

/** A section with sub-pages (Accounting): opens in place; open by default while you are inside it. */
function DropdownItem({ item, pathname, onNavigate }: { item: NavItem; pathname: string; onNavigate: () => void }) {
  const inside = isActive(pathname, item.href);
  const [open, setOpen] = React.useState(inside);
  const [wasInside, setWasInside] = React.useState(inside);
  if (inside !== wasInside) {
    setWasInside(inside);
    if (inside) setOpen(true);
  }
  const Icon = item.icon;
  const children = item.children!;
  return (
    <Collapsible asChild open={open} onOpenChange={setOpen} className="group/collapsible">
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton tooltip={item.label} className={cn(ITEM, inside && "bg-sidebar-accent font-semibold text-white")} aria-current={inside ? "true" : undefined}>
            <Icon className={inside ? "text-white" : "text-sidebar-muted"} />
            <span>{item.label}</span>
            <ChevronRight className="ml-auto size-4 text-sidebar-muted transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
          <SidebarMenuSub className="mr-0 ml-[18px] gap-0.5 border-l border-sidebar-border py-1 pr-0 pl-3">
            {children.map((c) => {
              const on = isChildActive(pathname, c.href, children);
              return (
                <SidebarMenuSubItem key={c.href}>
                  <SidebarMenuSubButton
                    asChild
                    isActive={on}
                    className="h-8 rounded-md text-sm text-sidebar-foreground/90 hover:bg-sidebar-accent hover:text-white data-[active=true]:bg-sidebar-primary data-[active=true]:font-semibold data-[active=true]:text-sidebar-primary-foreground"
                  >
                    <Link href={c.href} onClick={onNavigate}>
                      <span>{c.label}</span>
                    </Link>
                  </SidebarMenuSubButton>
                </SidebarMenuSubItem>
              );
            })}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  );
}

function NavUser({ user }: { user: User }) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const signOut = useApp((s) => s.signOut);
  const { isMobile } = useSidebar();
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton size="lg" className="rounded-xl bg-white/8 hover:bg-sidebar-accent data-[state=open]:bg-sidebar-accent" tooltip={user.name}>
              <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white text-xs font-bold text-brand-700">{user.initials}</span>
              <span className="grid flex-1 text-left leading-tight">
                <span className="truncate text-sm font-semibold text-white">{user.name}</span>
                <span className="truncate text-xs text-sidebar-muted">{ROLE_LABEL[user.role]}</span>
              </span>
              <ChevronsUpDown className="ml-auto size-4 text-sidebar-muted" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side={isMobile ? "bottom" : "right"} align="end" sideOffset={8} className="w-64 rounded-xl">
            <DropdownMenuLabel className="font-normal">
              <span className="block text-sm font-semibold text-ink">{user.name}</span>
              <span className="block text-[13px] text-ink-3">
                {ROLE_LABEL[user.role]} · {user.email}
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Sun className="size-4" /> Theme
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {[
                    { v: "light", l: "Light", I: Sun },
                    { v: "dark", l: "Dark", I: Moon },
                    { v: "system", l: "Match system", I: Monitor },
                  ].map(({ v, l, I }) => (
                    <DropdownMenuItem key={v} onSelect={() => setTheme(v)}>
                      <I className="size-4" /> {l}
                      {theme === v && <Check className="ml-auto size-4" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuItem onSelect={() => router.push("/login?switch=1")}>
                <Users className="size-4" /> Switch user (demo)
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                signOut();
                router.replace("/login");
              }}
            >
              <LogOut className="size-4" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
