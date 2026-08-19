"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Eye, LayoutGrid, LogOut, RefreshCw, ShieldCheck, UserCog } from "lucide-react";
import { toast } from "sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useSession } from "@/hooks/use-session";
import { auth } from "@/lib/api";
import { cn } from "@/lib/utils";

/**
 * Prototype-only chrome. Shows which persona is active, gives one-click movement between the
 * three surfaces, and surfaces the impersonation banner required by tech spec §17.4.
 */
export function PersonaBar() {
  const s = useSession();
  const router = useRouter();
  const pathname = usePathname();

  if (!s.hydrated) return null;

  const surface = pathname.startsWith("/admin") ? "admin" : pathname.startsWith("/partner") ? "partner" : "web";

  return (
    <>
      {s.impersonating ? (
        <div className="sticky top-0 z-50 flex items-center justify-center gap-3 bg-destructive px-4 py-1.5 text-xs font-medium text-white">
          <Eye className="size-3.5" aria-hidden />
          Read-only impersonation of {s.user?.name}. Every request is audited.
          <button className="underline underline-offset-2" onClick={() => { auth.stopImpersonation(); toast.info("Impersonation ended"); }}>
            End session
          </button>
        </div>
      ) : null}
      <div className="border-b bg-muted text-muted-foreground">
        <div className="mx-auto flex h-9 max-w-[1600px] items-center gap-3 px-4 text-[11px]">
          <span className="hidden items-center gap-1.5 font-medium uppercase tracking-[0.14em] text-placeholder sm:inline-flex">
            <ShieldCheck className="size-3" aria-hidden /> Prototype
          </span>
          <nav className="flex items-center gap-1" aria-label="Surface">
            {[
              { id: "web", label: "Traveller", href: "/" },
              { id: "partner", label: "Partner portal", href: "/partner" },
              { id: "admin", label: "Back office", href: "/admin" },
            ].map((x) => (
              <Link
                key={x.id}
                href={x.href}
                className={cn("rounded-md px-2 py-1 transition-colors", surface === x.id ? "bg-brand-500 font-medium text-white" : "hover:bg-brand-50 hover:text-brand-text")}
              >
                {x.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-brand-50 hover:text-brand-text">
                  <UserCog className="size-3.5" aria-hidden />
                  <span className="max-w-[42vw] truncate">{s.user ? `${s.user.name} · ${s.roleLabel}` : "Guest · not signed in"}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Demo persona</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => router.push("/login")}>
                  <LayoutGrid className="size-4" /> Switch persona
                </DropdownMenuItem>
                {s.user ? (
                  <DropdownMenuItem onClick={() => { auth.logout(); toast.info("Signed out"); router.push("/"); }}>
                    <LogOut className="size-4" /> Sign out
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    auth.resetDemo();
                    toast.success("Demo data reset", { description: "All bookings, products and payments restored to the seed." });
                    router.push("/");
                  }}
                >
                  <RefreshCw className="size-4" /> Reset demo data
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </>
  );
}
