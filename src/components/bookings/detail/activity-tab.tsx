"use client";

import type { ID } from "@/domain/types";
import { useApp } from "@/store";
import { fmtDateTime } from "@/lib/dates";
import { UserMark } from "@/components/shared/bits";
import { EmptyState } from "@/components/shared/page";

/** The audit trail for this booking, newest first. */
export function ActivityTab({ fileId }: { fileId: ID }) {
  const db = useApp((s) => s.db)!;
  const events = db.audit.filter((e) => e.fileId === fileId).sort((a, b) => b.at.localeCompare(a.at));
  if (!events.length) return <EmptyState title="No activity yet" />;
  return (
    <ol className="relative border-l border-rule pl-5">
      {events.map((e) => (
        <li key={e.id} className="relative pb-4 last:pb-0">
          <span aria-hidden className="absolute top-1 -left-[25px] size-2 rounded-[2px] border border-rule-2 bg-paper" />
          <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <span className="text-ink">{e.summary}</span>
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[13px] text-ink-3">
            <UserMark user={db.users[e.actorId]} size="xs" />
            {db.users[e.actorId]?.name ?? "System"} · <span className="tnum">{fmtDateTime(e.at)}</span> · <span className="font-mono whitespace-nowrap text-xs">{e.action}</span>
          </div>
        </li>
      ))}
    </ol>
  );
}
