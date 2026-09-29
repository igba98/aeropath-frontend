"use client";

import * as React from "react";
import Link from "next/link";

import type { AutoRule, MessageChannel } from "@/domain/types";
import { can } from "@/domain/permissions";
import { AUTO_RULES, AUTO_RULE_INFO, CHANNELS, CHANNEL_LABELS, TEMPLATE_LABELS } from "@/domain/comms";
import { useMe } from "@/store";
import { cn } from "@/lib/utils";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Section } from "@/components/shared/page";
import { SaveBar, ViewOnlyNote, useSettingsDraft } from "@/components/settings/settings-kit";
import { CHANNEL_ICON } from "./channel";

/** Settings → Communications → automatic messages: on/off, channels and lead time per rule. Manager edits. */
export function AutoTab() {
  const me = useMe();
  const canEdit = can(me, "comms.settings");
  const { draft, setDraft, dirty, discard, save } = useSettingsDraft((s) => s.comms.auto);
  const [errors, setErrors] = React.useState<Partial<Record<AutoRule | "form", string>>>({});

  const set = (rule: AutoRule, patch: Partial<(typeof draft)[AutoRule]>) => {
    setDraft((d) => ({ ...d, [rule]: { ...d[rule], ...patch } }));
    setErrors((e) => ({ ...e, [rule]: undefined, form: undefined }));
  };

  const onSave = () => {
    const er: typeof errors = {};
    for (const r of AUTO_RULES) {
      const rc = draft[r];
      if (rc.enabled && !rc.channels.length) er[r] = `Pick at least one channel, or turn the ${AUTO_RULE_INFO[r].label.toLowerCase()} off.`;
      if (AUTO_RULE_INFO[r].lead && (!Number.isInteger(rc.leadHours) || (rc.leadHours ?? 0) < 1 || (rc.leadHours ?? 0) > 336)) er[r] = "Send it between 1 and 336 hours (14 days) ahead.";
    }
    setErrors(er);
    if (Object.keys(er).length) return;
    const r = save({ comms: { auto: draft } });
    if (!r.ok) setErrors({ form: r.error.message });
  };

  return (
    <div>
      <Section
        title="Automatic messages"
        description={
          <>
            Sent on their own when something happens or a date comes near. Messages you write by hand are separate.
            {!canEdit && <ViewOnlyNote className="mt-1.5" />}
          </>
        }
        contentClassName="px-0"
      >
        <ul className="divide-y divide-rule border-t border-rule">
          {AUTO_RULES.map((rule) => {
            const info = AUTO_RULE_INFO[rule];
            const rc = draft[rule];
            const id = `auto-${rule}`;
            return (
              <li key={rule} className="grid gap-x-6 gap-y-3 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_auto]">
                <div className="flex min-w-0 items-start gap-3">
                  <Switch id={id} checked={rc.enabled} onCheckedChange={(v) => set(rule, { enabled: v })} disabled={!canEdit} className="mt-0.5" aria-describedby={`${id}-desc`} />
                  <div className="min-w-0">
                    <label htmlFor={id} className={cn("text-[15px] font-semibold", rc.enabled ? "text-ink" : "text-ink-3")}>
                      {info.label}
                    </label>
                    <p id={`${id}-desc`} className="text-sm text-ink-3">
                      {info.description}{" "}
                      <Link href={`/communications?tab=templates&t=${info.template}`} scroll={false} className="font-medium whitespace-nowrap text-link hover:underline">
                        {TEMPLATE_LABELS[info.template]} template
                      </Link>
                    </p>
                    {errors[rule] && (
                      <p role="alert" className="mt-1 text-[13px] text-[var(--st-red-fg)]">
                        {errors[rule]}
                      </p>
                    )}
                  </div>
                </div>
                <div className={cn("flex flex-wrap items-center gap-x-5 gap-y-3 sm:pl-11 lg:pl-0", !rc.enabled && "opacity-60")}>
                  <fieldset className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
                    <legend className="sr-only">Channels for {info.label.toLowerCase()}</legend>
                    {CHANNELS.map((c) => {
                      const on = rc.channels.includes(c);
                      const Icon = CHANNEL_ICON[c];
                      const cid = `${id}-${c}`;
                      return (
                        <span key={c} className="inline-flex items-center gap-1.5">
                          <Checkbox
                            id={cid}
                            checked={on}
                            disabled={!canEdit}
                            onCheckedChange={(v) => set(rule, { channels: CHANNELS.filter((x) => (x === c ? v === true : rc.channels.includes(x))) as MessageChannel[] })}
                          />
                          <label htmlFor={cid} className="inline-flex cursor-pointer items-center gap-1 text-sm text-ink-2">
                            <Icon className="size-3.5 text-ink-3" aria-hidden />
                            {CHANNEL_LABELS[c]}
                          </label>
                        </span>
                      );
                    })}
                  </fieldset>
                  {info.lead && (
                    <span className="inline-flex items-center gap-2 text-sm text-ink-2">
                      <Input
                        id={`${id}-lead`}
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={336}
                        value={rc.leadHours ?? ""}
                        readOnly={!canEdit}
                        onChange={(e) => set(rule, { leadHours: e.target.value === "" ? undefined : Math.round(Number(e.target.value)) })}
                        className="tnum h-8 w-[4.5rem] text-right"
                        aria-label={`Hours ${info.lead}`}
                        aria-invalid={Boolean(errors[rule]) || undefined}
                      />
                      <label htmlFor={`${id}-lead`} className="whitespace-nowrap">
                        hours {info.lead}
                      </label>
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Section>
      {canEdit && <SaveBar dirty={dirty} onDiscard={() => (discard(), setErrors({}))} onSave={onSave} error={errors.form} />}
    </div>
  );
}
