"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "./field";

/**
 * Every destructive action confirms here, repeating the consequences in plain words,
 * with amounts (spec §9 general rules). Optional required reason.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel,
  tone = "destructive",
  reason,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: React.ReactNode;
  /** The consequences, as a short list or paragraph. */
  children?: React.ReactNode;
  confirmLabel: string;
  tone?: "destructive" | "default";
  /** Ask for a reason; `required` blocks confirm until filled. */
  reason?: { label?: string; required?: boolean; placeholder?: string };
  /** Return false to keep the dialog open (e.g. the command failed). */
  onConfirm: (reason: string) => boolean | void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open && (
          <ConfirmBody title={title} description={description} confirmLabel={confirmLabel} tone={tone} reason={reason} onConfirm={onConfirm} onClose={() => onOpenChange(false)}>
            {children}
          </ConfirmBody>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ConfirmBody({
  title,
  description,
  children,
  confirmLabel,
  tone,
  reason,
  onConfirm,
  onClose,
}: {
  title: string;
  description?: React.ReactNode;
  children?: React.ReactNode;
  confirmLabel: string;
  tone: "destructive" | "default";
  reason?: { label?: string; required?: boolean; placeholder?: string };
  onConfirm: (reason: string) => boolean | void;
  onClose: () => void;
}) {
  const [text, setText] = React.useState("");
  const onOpenChange = (o: boolean) => {
    if (!o) onClose();
  };
  const blocked = Boolean(reason?.required && !text.trim());

  const submit = () => {
    if (blocked) return;
    const r = onConfirm(text.trim());
    if (r !== false) onOpenChange(false);
  };

  return (
    <>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {(children || reason) && (
          <DialogBody className="space-y-4 text-sm leading-5 text-ink-2">
            {children}
            {reason && (
              <Field label={reason.label ?? "Reason"} htmlFor="confirm-reason" required={reason.required} optional={!reason.required}>
                <Textarea
                  id="confirm-reason"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={reason.placeholder}
                  autoFocus
                  rows={2}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
                  }}
                />
              </Field>
            )}
          </DialogBody>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Keep it
          </Button>
          <Button variant={tone === "destructive" ? "destructive" : "default"} onClick={submit} disabled={blocked} autoFocus={!reason}>
            {confirmLabel}
          </Button>
        </DialogFooter>
    </>
  );
}

/** Consequence list used inside ConfirmDialog. */
export function Consequences({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2">
          <span aria-hidden className="mt-[7px] size-1.5 shrink-0 rounded-[1px] bg-ink-3" />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}
