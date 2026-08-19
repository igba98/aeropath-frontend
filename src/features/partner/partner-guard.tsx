"use client";

import Link from "next/link";
import { LogIn, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

/** Shown inside a console shell when the signed in persona has no organisation of the right type. */
export function NoOrgPrompt({ kind }: { kind: "agent" | "corporate" }) {
  const label = kind === "agent" ? "travel agency" : "company";
  return (
    <EmptyState
      icon={ShieldAlert}
      title={`No ${label} attached to this persona`}
      description={`This console reads bookings, credit and reports for the ${label} the signed in user belongs to. Sign in as one of the ${kind === "agent" ? "agency" : "corporate"} personas to see it populated.`}
      action={
        <Button asChild>
          <Link href="/login">
            <LogIn className="size-4" aria-hidden />
            Choose a persona
          </Link>
        </Button>
      }
    />
  );
}

/** Role gate for whole pages inside a console. */
export function RestrictedNotice({ title, description }: { title: string; description: string }) {
  return <EmptyState icon={ShieldAlert} title={title} description={description} />;
}

export function ConsoleSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-56" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );
}
