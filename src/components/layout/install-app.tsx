"use client";

import * as React from "react";

import { installPlatform, type InstallPlatform } from "@/lib/install-platform";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type InstallPromptEvent = Event & { prompt: () => Promise<void> };
type InstallState = { prompt: InstallPromptEvent | null; installed: boolean };

// Chrome and Edge fire `beforeinstallprompt` once per page load, usually before this file loads;
// the inline script in app/layout.tsx keeps it on window.__installPrompt for us.
const SERVER: InstallState = { prompt: null, installed: false };
let state = SERVER;
const subs = new Set<() => void>();
const setState = (next: Partial<InstallState>) => {
  state = { ...state, ...next };
  subs.forEach((f) => f());
};
if (typeof window !== "undefined") {
  const w = window as Window & { __installPrompt?: InstallPromptEvent };
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  state = { prompt: w.__installPrompt ?? null, installed: standalone };
  window.addEventListener("beforeinstallprompt", (e) => setState({ prompt: e as InstallPromptEvent }));
  window.addEventListener("appinstalled", () => setState({ prompt: null, installed: true }));
}
const subscribe = (f: () => void) => (subs.add(f), () => void subs.delete(f));

/** `install()` opens the browser's own install dialog where it has one, otherwise our step-by-step help. */
export function useInstallApp() {
  const { prompt, installed } = React.useSyncExternalStore(subscribe, () => state, () => SERVER);
  const [helpOpen, setHelpOpen] = React.useState(false);
  const install = async () => {
    if (prompt) {
      try {
        await prompt.prompt();
        setState({ prompt: null }); // an install prompt can only be shown once
        return;
      } catch {
        setState({ prompt: null });
      }
    }
    setHelpOpen(true);
  };
  return { installed, install, helpOpen, setHelpOpen };
}

const B = ({ children }: { children: React.ReactNode }) => <strong className="font-semibold text-ink">{children}</strong>;

const STEPS: Record<InstallPlatform, { lead: string; steps: React.ReactNode[] }> = {
  ios: {
    lead: "On iPhone and iPad, install from the Share menu. This works in Safari, Chrome and Edge.",
    steps: [
      <>
        Tap the <B>Share</B> button (a square with an arrow). If you can&apos;t see it, tap <B>•••</B> first.
      </>,
      <>
        Scroll down and tap <B>Add to Home Screen</B>.
      </>,
      <>
        If you see <B>Open as Web App</B>, keep it on. Then tap <B>Add</B>.
      </>,
    ],
  },
  android: {
    lead: "On Android, install from the browser menu.",
    steps: [
      <>
        Open the browser menu (<B>⋮</B> or <B>≡</B>).
      </>,
      <>
        Tap <B>Install app</B> or <B>Add to Home screen</B>.
      </>,
      <>
        Confirm with <B>Install</B>. Aeropath appears with your other apps.
      </>,
    ],
  },
  "mac-safari": {
    lead: "Safari on a Mac adds Aeropath to the Dock. This needs macOS Sonoma (14) or later.",
    steps: [
      <>
        In the menu bar, choose <B>File → Add to Dock</B>.
      </>,
      <>
        Click <B>Add</B>. Aeropath opens from the Dock and Launchpad in its own window.
      </>,
    ],
  },
  "firefox-desktop": {
    lead: "Firefox can't install web apps on a computer.",
    steps: [
      <>
        Open this page in <B>Chrome</B> or <B>Edge</B> (Windows, Mac, Linux) or <B>Safari</B> (Mac).
      </>,
      <>
        Choose <B>Install app</B> from Aeropath&apos;s account menu there.
      </>,
    ],
  },
  desktop: {
    lead: "Chrome, Edge and Brave install Aeropath on Windows, Mac, Linux and ChromeOS.",
    steps: [
      <>
        Click the <B>install</B> icon at the right end of the address bar.
      </>,
      <>
        No icon? Open the browser menu and look for <B>Install</B> (Chrome: <B>Cast, save and share</B>; Edge: <B>Apps</B>).
      </>,
      <>
        Already installed? Open Aeropath from the Start menu, Dock or app launcher.
      </>,
    ],
  },
};

export function InstallHelpDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const help = open ? STEPS[installPlatform(navigator.userAgent, navigator.maxTouchPoints)] : null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-110">
        <DialogHeader>
          <DialogTitle>Install Aeropath</DialogTitle>
          <DialogDescription>Open the back office like an app, with its own icon and window and no browser bar.</DialogDescription>
        </DialogHeader>
        {help && (
          <DialogBody className="space-y-3">
            <p className="text-sm text-ink-2">{help.lead}</p>
            <ol className="space-y-2.5">
              {help.steps.map((step, i) => (
                <li key={i} className="flex gap-3 text-sm leading-6 text-ink-2">
                  <span aria-hidden className="grid size-6 shrink-0 place-items-center rounded-full bg-band text-xs font-semibold text-ink tabular-nums">
                    {i + 1}
                  </span>
                  <span className="min-w-0">{step}</span>
                </li>
              ))}
            </ol>
          </DialogBody>
        )}
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
