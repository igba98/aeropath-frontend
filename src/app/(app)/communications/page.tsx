"use client";

import * as React from "react";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";

import type { ID } from "@/domain/types";
import { can } from "@/domain/permissions";
import { upcomingAutoMessages } from "@/domain/comms";
import { useApp, useMe } from "@/store";
import { useNow } from "@/lib/use-now";

import { Button } from "@/components/ui/button";
import { PageHeader, TabsNav, useSetParam } from "@/components/shared/page";
import { openComposer } from "@/components/comms/composer";
import { SentTab } from "@/components/comms/sent-tab";
import { MessageSheet } from "@/components/comms/message-sheet";
import { UpcomingTab } from "@/components/comms/upcoming-tab";
import { AutoTab } from "@/components/comms/auto-tab";
import { TemplatesTab } from "@/components/comms/templates-tab";
import { SenderTab } from "@/components/comms/sender-tab";
import { useSkipped } from "@/components/comms/skipped";

type Tab = "sent" | "upcoming" | "automatic" | "templates" | "sender";
const TABS: Tab[] = ["sent", "upcoming", "automatic", "templates", "sender"];

export default function CommunicationsPage() {
  return (
    <Suspense>
      <Communications />
    </Suspense>
  );
}

/** Communications: messages to clients by SMS, WhatsApp and email, the automatic ones coming up, and their settings. */
function Communications() {
  const me = useMe();
  const db = useApp((s) => s.db)!;
  const sp = useSearchParams();
  const setParam = useSetParam();
  const now = useNow();
  const skipped = useSkipped((s) => s.ids);

  const raw = sp.get("tab") as Tab | null;
  const tab: Tab = raw && TABS.includes(raw) ? raw : "sent";
  const openId = sp.get("open");
  const open = (id: ID | null) => setParam("open", id);

  const counts = React.useMemo(() => {
    const messages = Object.values(db.messages ?? {});
    const weekAgo = now.getTime() - 7 * 86_400_000;
    return {
      sent: messages.length,
      week: messages.filter((m) => Date.parse(m.sentAt ?? m.createdAt) >= weekAgo).length,
      upcoming: upcomingAutoMessages(db, now).filter((m) => !skipped.includes(m.id)).length,
    };
  }, [db, now, skipped]);

  return (
    <>
      <PageHeader
        title="Communications"
        meta={
          <>
            <span className="tnum">{counts.week} sent in the last 7 days</span>
            <span aria-hidden>·</span>
            <span className="tnum">
              {counts.upcoming} automatic message{counts.upcoming === 1 ? "" : "s"} coming up
            </span>
          </>
        }
        actions={
          can(me, "comms.send") && (
            <Button onClick={() => openComposer()}>
              <Plus /> New message
            </Button>
          )
        }
      />

      <TabsNav
        defaultTab="sent"
        className="gap-5"
        tabs={[
          { id: "sent", label: "Sent", count: counts.sent },
          { id: "upcoming", label: "Upcoming automatic", count: counts.upcoming },
          { id: "automatic", label: "Automatic messages" },
          { id: "templates", label: "Templates" },
          { id: "sender", label: "Sender settings" },
        ]}
      >
        {tab === "sent" && <SentTab onOpen={open} openId={openId} />}
        {tab === "upcoming" && <UpcomingTab />}
        {tab === "automatic" && <AutoTab />}
        {tab === "templates" && <TemplatesTab />}
        {tab === "sender" && <SenderTab />}
      </TabsNav>

      <MessageSheet messageId={openId} onClose={() => open(null)} />
    </>
  );
}
