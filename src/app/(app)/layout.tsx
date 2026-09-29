"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";

import { canAccessRoute } from "@/domain/permissions";
import { useApp, useCurrentUser } from "@/store";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { TopBar } from "@/components/layout/top-bar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { CommandPalette } from "@/components/layout/command-palette";
import { GlobalModals } from "@/components/layout/global-modals";
import { useShortcuts } from "@/components/layout/shortcuts";
import { useNavBadges } from "@/components/layout/nav-badges";
import { BrandMark } from "@/components/layout/brand";

/** Signed-in shell: auth guard, route guard, sidebar, header, palette, shortcuts. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  const hydrated = useApp((s) => s.hydrated);
  const user = useCurrentUser();
  const pathname = usePathname();
  const router = useRouter();
  const allowed = user ? pathname === "/forbidden" || canAccessRoute(user, pathname) : false;

  React.useEffect(() => {
    if (!hydrated) return;
    if (!user) router.replace(`/login${pathname && pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : ""}`);
    else if (!allowed) router.replace(`/forbidden?from=${encodeURIComponent(pathname)}`);
  }, [hydrated, user, allowed, pathname, router]);

  if (!hydrated || !user) return <ShellLoading />;
  return <SignedIn>{allowed ? children : null}</SignedIn>;
}

function SignedIn({ children }: { children: React.ReactNode }) {
  const user = useCurrentUser()!;
  useShortcuts(user);
  const badges = useNavBadges(user);
  return (
    <SidebarProvider style={{ "--sidebar-width": "15.5rem" } as React.CSSProperties}>
      <AppSidebar user={user} badges={badges} />
      <SidebarInset className="min-w-0 bg-paper md:shadow-[0_12px_40px_-12px_rgb(3_14_40/0.45)]">
        <TopBar user={user} />
        <main id="main" className="w-full min-w-0 flex-1 px-4 pt-6 pb-16 sm:px-6 lg:px-8 lg:pt-8 2xl:px-10">
          {children}
        </main>
      </SidebarInset>
      <CommandPalette />
      <GlobalModals />
    </SidebarProvider>
  );
}

function ShellLoading() {
  return (
    <div className="grid min-h-dvh place-items-center bg-canvas" aria-busy="true" aria-live="polite">
      <div className="flex flex-col items-center gap-3 text-sm text-ink-3">
        <BrandMark className="size-8 animate-pulse" />
        Opening the back office…
      </div>
    </div>
  );
}
