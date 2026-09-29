"use client";

import * as React from "react";
import type { User } from "@/domain/types";
import { attentionItems } from "@/domain/selectors/attention";
import { can } from "@/domain/permissions";
import { useApp } from "@/store";
import { useNow } from "@/lib/use-now";

/** Counts beside rail items: what needs attention (Home) and money waiting on finance (Payments). */
export function useNavBadges(user: User): Partial<Record<string, number>> {
  const db = useApp((s) => s.db);
  const now = useNow(120_000);
  return React.useMemo(() => {
    if (!db) return {};
    const items = attentionItems(db, user, now);
    const out: Partial<Record<string, number>> = {};
    if (items.length) out["/"] = items.length;
    if (can(user, "payment.verify")) {
      const unverified = Object.values(db.payments).filter((p) => p.status === "recorded" && p.direction === "in").length;
      const refunds = Object.values(db.refunds).filter((r) => r.status === "requested" || r.status === "approved").length;
      if (unverified + refunds) out["/payments"] = unverified + refunds;
    }
    return out;
  }, [db, user, now]);
}
