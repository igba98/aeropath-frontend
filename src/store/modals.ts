"use client";

import { create } from "zustand";
import type { ID, MessageAttachment, MessageChannel, MessageTemplateKey } from "@/domain/types";

/** Global, app-wide modals that can open from any screen, the palette, or a shortcut. */
export interface MessageDraft {
  clientId?: ID;
  fileId?: ID;
  channel?: MessageChannel;
  template?: MessageTemplateKey;
  /** Documents to attach straight away. */
  attachments?: MessageAttachment[];
}

interface Modals {
  payment: { open: boolean; clientId?: ID; fileId?: ID };
  message: { open: boolean } & MessageDraft;
  client: { open: boolean; onCreated?: (clientId: ID) => void };
  expense: { open: boolean };
  palette: { open: boolean };
  openPayment: (p?: { clientId?: ID; fileId?: ID }) => void;
  openClient: (p?: { onCreated?: (clientId: ID) => void }) => void;
  openExpense: () => void;
  /** Message a client by SMS, WhatsApp or email (Communications composer). */
  openMessage: (p?: MessageDraft) => void;
  setPalette: (open: boolean) => void;
  close: (k: "payment" | "client" | "expense" | "message") => void;
}

export const useModals = create<Modals>()((set) => ({
  payment: { open: false },
  client: { open: false },
  expense: { open: false },
  message: { open: false },
  palette: { open: false },
  openPayment: (p) => set({ payment: { open: true, ...p } }),
  openClient: (p) => set({ client: { open: true, ...p } }),
  openExpense: () => set({ expense: { open: true } }),
  openMessage: (p) => set({ message: { open: true, ...p } }),
  setPalette: (open) => set({ palette: { open } }),
  close: (k) => set({ [k]: { open: false } } as Partial<Modals>),
}));
