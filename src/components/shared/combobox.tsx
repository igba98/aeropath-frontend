"use client";

import * as React from "react";
import { Command as Cmdk } from "cmdk";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { Popover as PopoverPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";
import { controlBase } from "@/components/ui/input";

export interface ComboOption {
  value: string;
  label: string;
  /** Right-aligned quiet text: a code, phone, balance… */
  hint?: string;
  /** Extra words that match the search but aren't shown. */
  keywords?: string[];
  disabled?: boolean;
}

/**
 * Searchable select for long lists (clients, airports, airlines, suppliers).
 * Type to filter, arrows to move, Enter to pick. Optional "create" row for inline creation.
 */
export function Combobox({
  id,
  value,
  onChange,
  options,
  placeholder = "Select…",
  searchPlaceholder = "Type to search",
  emptyText = "No matches.",
  invalid,
  disabled,
  className,
  onCreate,
  createLabel = (q: string) => `Create “${q}”`,
  renderValue,
  mono,
  autoFocus,
  size = "default",
}: {
  id?: string;
  value: string | null | undefined;
  onChange: (value: string) => void;
  options: ComboOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  invalid?: boolean;
  disabled?: boolean;
  className?: string;
  onCreate?: (query: string) => void;
  createLabel?: (q: string) => string;
  renderValue?: (o: ComboOption) => React.ReactNode;
  mono?: boolean;
  autoFocus?: boolean;
  size?: "default" | "sm";
}) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const listId = React.useId();
  const selected = options.find((o) => o.value === value);

  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQ("");
      }}
    >
      <PopoverPrimitive.Trigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          autoFocus={autoFocus}
          className={cn(
            controlBase,
            "flex items-center justify-between gap-2 px-3 text-left",
            size === "sm" ? "h-8 text-[13px]" : "h-9",
            !selected && "text-ink-4",
            className,
          )}
        >
          <span className={cn("min-w-0 flex-1 truncate", mono && selected && "font-mono text-[13.5px]")}>
            {selected ? (renderValue ? renderValue(selected) : selected.label) : placeholder}
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-ink-3" />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          className="z-50 w-(--radix-popover-trigger-width) min-w-64 overflow-hidden rounded-lg border border-rule-2 bg-popover shadow-pop data-[state=open]:animate-in data-[state=open]:fade-in-0"
        >
          <Cmdk
            filter={(v, search, keywords) => {
              const hay = (v + " " + (keywords ?? []).join(" ")).toLowerCase();
              return search
                .toLowerCase()
                .split(/\s+/)
                .filter(Boolean)
                .every((t) => hay.includes(t))
                ? 1
                : 0;
            }}
          >
            <div className="border-b border-rule px-2.5">
              <Cmdk.Input
                value={q}
                onValueChange={setQ}
                placeholder={searchPlaceholder}
                className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-ink-4"
              />
            </div>
            <Cmdk.List id={listId} className="max-h-72 overflow-y-auto p-1">
              <Cmdk.Empty className="px-2 py-5 text-center text-sm text-ink-3">{emptyText}</Cmdk.Empty>
              {options.map((o) => (
                <Cmdk.Item
                  key={o.value}
                  value={`${o.label} ${o.hint ?? ""} ${o.value}`}
                  keywords={o.keywords}
                  disabled={o.disabled}
                  onSelect={() => {
                    onChange(o.value);
                    setOpen(false);
                    setQ("");
                  }}
                  className="flex cursor-default items-center gap-2 rounded-[4px] px-2 py-1.5 text-sm data-[disabled=true]:opacity-45 data-[selected=true]:bg-band"
                >
                  <Check className={cn("size-3.5 shrink-0 text-brand-600 dark:text-brand-300", o.value === value ? "opacity-100" : "opacity-0")} />
                  <span className={cn("min-w-0 flex-1 truncate", mono && "font-mono text-[13.5px]")}>{o.label}</span>
                  {o.hint && <span className="tnum shrink-0 text-[13px] text-ink-3">{o.hint}</span>}
                </Cmdk.Item>
              ))}
              {onCreate && q.trim() && (
                <Cmdk.Item
                  value={`__create__ ${q}`}
                  onSelect={() => {
                    onCreate(q.trim());
                    setOpen(false);
                    setQ("");
                  }}
                  className="mt-1 flex cursor-default items-center gap-2 rounded-[4px] border-t border-rule px-2 py-1.5 text-sm font-medium text-brand-700 data-[selected=true]:bg-band dark:text-brand-300"
                >
                  <Plus className="size-3.5" />
                  {createLabel(q.trim())}
                </Cmdk.Item>
              )}
            </Cmdk.List>
          </Cmdk>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
