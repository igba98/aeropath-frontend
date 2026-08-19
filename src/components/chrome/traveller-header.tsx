"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, Briefcase, Heart, LogIn, Menu, ShoppingBag, User2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Logo } from "./logo";
import { useSession } from "@/hooks/use-session";
import { useStore } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";
import { auth } from "@/lib/api";
import { VERTICALS } from "@/components/shared/search-widget";
import { cn } from "@/lib/utils";

export function TravellerHeader() {
  const s = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const cartBooking = useStore((st) => (st.carts[st.session.userId ?? "guest"] ? st.bookings[st.carts[st.session.userId ?? "guest"]!] : undefined));
  const items = useStore(useShallow((st) => Object.values(st.items).filter((i) => i.bookingId === cartBooking?.id)));
  const notifications = useStore(useShallow((st) => st.notifications.filter((n) => n.userId === s.user?.id && !n.read)));
  const cartCount = cartBooking?.status === "draft" ? items.length : 0;


  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-3 px-4">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
              <Menu className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <SheetHeader className="border-b p-4">
              <SheetTitle asChild><Logo /></SheetTitle>
            </SheetHeader>
            <nav className="flex flex-col p-2">
              {VERTICALS.map((v) => (
                <Link key={v.id} href={v.path} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-muted">
                  <v.icon className="size-4 text-brand-text" aria-hidden /> {v.label}
                </Link>
              ))}
              <div className="my-2 border-t" />
              <Link href="/trips" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-muted"><Briefcase className="size-4" aria-hidden /> My Trips</Link>
              <Link href="/wishlist" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-muted"><Heart className="size-4" aria-hidden /> Wishlist</Link>
              <Link href="/profile" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-muted"><User2 className="size-4" aria-hidden /> Profile</Link>
            </nav>
          </SheetContent>
        </Sheet>

        <Logo />

        <nav className="ml-4 hidden items-center gap-0.5 md:flex" aria-label="Verticals">
          {VERTICALS.map((v) => (
            <Link
              key={v.id}
              href={v.path}
              className={cn("rounded-lg px-3 py-1.5 text-sm font-medium transition-colors", pathname.startsWith(v.path) ? "bg-brand-50 text-brand-text-strong" : "text-muted-foreground hover:bg-muted hover:text-foreground")}
            >
              {v.label.split(" ")[0]}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1.5">



          <CurrencyToggle />

          {s.user ? (
            <Button asChild variant="ghost" size="icon" className="relative" aria-label={`Notifications${notifications.length ? `, ${notifications.length} unread` : ""}`}>
              <Link href="/trips">
                <Bell className="size-4.5" />
                {notifications.length ? <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-destructive ring-2 ring-background" /> : null}
              </Link>
            </Button>
          ) : null}

          <Button asChild variant="ghost" size="icon" className="relative" aria-label={`Trip cart, ${cartCount} item${cartCount === 1 ? "" : "s"}`}>
            <Link href="/cart">
              <ShoppingBag className="size-4.5" />
              {cartCount ? (
                <Badge className="absolute -right-0.5 -top-0.5 size-4 justify-center rounded-full p-0 text-[10px] tabular-nums">{cartCount}</Badge>
              ) : null}
            </Link>
          </Button>

          {s.user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className={cn("flex size-8 items-center justify-center rounded-full bg-gradient-to-br text-xs font-semibold text-white", s.user.avatarTone)} aria-label="Account">
                  {s.user.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <p className="text-sm">{s.user.name}</p>
                  <p className="text-xs font-normal text-muted-foreground">{s.roleLabel}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild><Link href="/trips">My Trips</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link href="/wishlist">Wishlist</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link href="/profile">Profile & travellers</Link></DropdownMenuItem>
                {s.org ? <DropdownMenuItem asChild><Link href="/partner/supplier">{s.org.name} console</Link></DropdownMenuItem> : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => { auth.logout(); router.push("/"); }}>Sign out</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button asChild size="sm" className="gap-1.5">
              <Link href="/login"><LogIn className="size-4" aria-hidden /> Sign in</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

function CurrencyToggle() {
  const currency = useStore((s) => s.session.currency);
  return (
    <div className="hidden items-center rounded-full border p-0.5 sm:flex" role="group" aria-label="Display currency">
      {(["TZS", "USD"] as const).map((c) => (
        <button
          key={c}
          onClick={() => auth.setCurrency(c)}
          aria-pressed={currency === c}
          className={cn("rounded-full px-2.5 py-1 text-xs font-medium transition-colors", currency === c ? "bg-brand-50 text-brand-text-strong" : "text-muted-foreground hover:text-foreground")}
        >
          {c}
        </button>
      ))}
    </div>
  );
}

/** Agent overlay: every booking must be attributed to a client (flow spec §5.2). */
