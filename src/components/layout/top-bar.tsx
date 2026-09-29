"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus, Search, Wallet } from "lucide-react";

import type { User } from "@/domain/types";
import { can } from "@/domain/permissions";
import { useUi } from "@/store";
import { useModals } from "@/store/modals";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Kbd } from "@/components/shared/bits";
import { Segmented } from "@/components/shared/page";
import { NAV, isActive } from "./nav";

/** Header of the inset panel: sidebar toggle, section, search, display currency and the two daily actions. */
export function TopBar({ user }: { user: User }) {
  const pathname = usePathname();
  const setPalette = useModals((s) => s.setPalette);
  const openPayment = useModals((s) => s.openPayment);
  const cur = useUi((s) => s.displayCurrency);
  const setCur = useUi((s) => s.setDisplayCurrency);
  // Pages whose own header records a payment in context (booking, client, Payments) don't repeat it here.
  const pageOwnsPayment = pathname === "/payments" || /^\/(bookings|clients)\/(?!new$)[^/]+$/.test(pathname);
  const section = NAV.find((n) => isActive(pathname, n.href) && n.href !== "/") ?? (pathname === "/" ? NAV[0] : undefined);

  return (
    <header className="app-header sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b border-rule bg-paper/90 px-3 backdrop-blur-md sm:gap-3 sm:px-5 lg:px-6 md:rounded-t-xl">
      <SidebarTrigger className="-ml-1 size-9 text-ink-2" />
      <Separator orientation="vertical" className="mr-1 hidden data-[orientation=vertical]:h-5 sm:block" />
      <span className="hidden text-[15px] font-semibold text-ink lg:inline">{section?.label ?? "Aeropath"}</span>

      <button
        type="button"
        onClick={() => setPalette(true)}
        className="flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-rule-2 bg-canvas px-3 text-left text-sm text-ink-4 transition-colors hover:border-ink-4/50 hover:text-ink-3 sm:max-w-md lg:ml-4"
        aria-label="Search (Ctrl K)"
      >
        <Search className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">
          <span className="hidden sm:inline">Search file no., client, PNR, ticket…</span>
          <span className="sm:hidden">Search</span>
        </span>
        <span className="hidden items-center gap-0.5 sm:flex">
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>

      <div className="ml-auto flex items-center gap-2">
        <Segmented
          label="Display totals in"
          value={cur}
          onChange={setCur}
          options={[
            { value: "TZS", label: "TZS", title: "Show totals in TZS" },
            { value: "USD", label: "USD", title: "Show totals in USD" },
          ]}
          className="hidden md:inline-flex"
        />
        {can(user, "payment.record") && !pageOwnsPayment && (
          <Button variant="outline" onClick={() => openPayment()} className="hidden lg:inline-flex" title="Record payment (P)">
            <Wallet /> Record payment
          </Button>
        )}
        {can(user, "booking.create") && (
          <Button asChild title="New booking (N)">
            <Link href="/book">
              <Plus /> <span className="hidden sm:inline">New booking</span>
              <span className="sm:hidden">New</span>
            </Link>
          </Button>
        )}
      </div>
    </header>
  );
}
