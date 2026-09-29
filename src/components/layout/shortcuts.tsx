"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { User } from "@/domain/types";
import { can } from "@/domain/permissions";
import { useModals } from "@/store/modals";

const typing = (el: EventTarget | null) => {
  const t = el as HTMLElement | null;
  if (!t) return false;
  const tag = t.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || t.isContentEditable || Boolean(t.closest("[role=dialog],[cmdk-root]"));
};

/** N new booking · P record payment · / search · ⌘K / Ctrl+K palette (spec §5.1). */
export function useShortcuts(user: User) {
  const router = useRouter();
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const m = useModals.getState();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        m.setPalette(!m.palette.open);
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
      if (e.key === "/") {
        e.preventDefault();
        m.setPalette(true);
      } else if (e.key === "n" || e.key === "N") {
        if (can(user, "booking.create")) {
          e.preventDefault();
          router.push("/book");
        }
      } else if (e.key === "p" || e.key === "P") {
        if (can(user, "payment.record")) {
          e.preventDefault();
          m.openPayment();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, user]);
}
