"use client";

import { useApp } from "@/store";
import { SYSTEM_USER_ID } from "@/domain/defaults";

/** True while the USD→TZS rate is still the seeded demo value nobody has set. */
export function useFxIsDemo(): boolean {
  return useApp((s) => {
    const by = s.db?.settings.fx.updatedBy;
    return !by || by === SYSTEM_USER_ID || !s.db?.users[by];
  });
}

/** "Converted at 1 USD = TZS 2,600 (demo rate)" — the rate line every converted total carries. */
export function FxNote({ rate, prefix = "Converted at" }: { rate?: number; prefix?: string }) {
  const settingsRate = useApp((s) => s.db?.settings.fx.USD_TZS ?? 0);
  const demo = useFxIsDemo();
  const r = rate ?? settingsRate;
  return (
    <span className="tnum">
      {prefix} 1 USD = TZS {r.toLocaleString("en-US")}
      {demo && r === settingsRate ? " (demo rate)" : ""}
    </span>
  );
}
