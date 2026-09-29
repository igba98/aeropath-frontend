"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Lock } from "lucide-react";
import { useMe } from "@/store";
import { Button } from "@/components/ui/button";
import { ROLE_LABEL } from "@/components/layout/nav";

export default function ForbiddenPage() {
  return (
    <Suspense>
      <Forbidden />
    </Suspense>
  );
}

function Forbidden() {
  const me = useMe();
  const from = useSearchParams().get("from");
  return (
    <div className="mx-auto flex max-w-md flex-col items-start py-16">
      <Lock className="size-5 text-ink-3" />
      <h1 className="mt-4 text-xl font-semibold text-ink">This page isn&apos;t part of your role</h1>
      <p className="mt-2 text-sm leading-5 text-ink-2">
        You&apos;re signed in as {me.name} ({ROLE_LABEL[me.role]}).{" "}
        {from ? (
          <>
            <span className="font-mono whitespace-nowrap text-[13.5px]">{from}</span> needs a different role.
          </>
        ) : (
          "That page needs a different role."
        )}{" "}
        If you need it for your work, ask your manager to change your access.
      </p>
      <Button asChild className="mt-6">
        <Link href="/">Back to Home</Link>
      </Button>
    </div>
  );
}
