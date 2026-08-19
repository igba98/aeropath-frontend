"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useSession } from "@/hooks/use-session";
import { useStore } from "@/lib/store";
import { useShallow } from "zustand/react/shallow";
import { admin, auth } from "@/lib/api";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/format";
import { initials } from "@/lib/format";

export function ConsoleUserMenu() {
  const s = useSession();
  const router = useRouter();
  const notifications = useStore(useShallow((st) => st.notifications.filter((n) => n.userId === s.user?.id)));
  const unread = notifications.filter((n) => !n.read);

  return (
    <>
      <DropdownMenu onOpenChange={(o) => { if (!o && s.user && unread.length) admin.markNotificationsRead(s.user.id); }}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="relative" aria-label={`Notifications${unread.length ? `, ${unread.length} unread` : ""}`}>
            <Bell className="size-4.5" />
            {unread.length ? <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-destructive ring-2 ring-background" /> : null}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80">
          <DropdownMenuLabel>Notifications</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {notifications.length ? notifications.slice(0, 8).map((n) => (
            <div key={n.id} className={cn("px-2 py-2", !n.read && "bg-brand-50/60")}>
              <p className="text-sm font-medium">{n.title}</p>
              <p className="text-xs text-muted-foreground">{n.body}</p>
              <p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{n.channel} · {relativeTime(n.createdAt)}</p>
            </div>
          )) : <p className="px-2 py-6 text-center text-sm text-muted-foreground">Nothing yet</p>}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className={cn("flex size-8 items-center justify-center rounded-full bg-gradient-to-br text-xs font-semibold text-white", s.user?.avatarTone ?? "from-slate-500 to-slate-300")} aria-label="Account">
            {s.user ? initials(s.user.name) : "?"}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>
            <p className="text-sm">{s.user?.name ?? "Not signed in"}</p>
            <p className="text-xs font-normal text-muted-foreground">{s.roleLabel}{s.org ? ` · ${s.org.name}` : ""}</p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild><Link href="/">Traveller site</Link></DropdownMenuItem>
          <DropdownMenuItem asChild><Link href="/login">Switch persona</Link></DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => { auth.logout(); router.push("/login"); }}>Sign out</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
