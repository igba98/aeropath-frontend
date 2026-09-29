"use client";

import * as React from "react";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { hydrateStore, useApp } from "@/store";

/** Theme, tooltips, toasts, and one-time hydration of the browser-held database. */
export function Providers({ children }: { children: React.ReactNode }) {
  React.useEffect(() => {
    if (!useApp.getState().hydrated) void hydrateStore();
  }, []);

  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
      <TooltipProvider delayDuration={300}>
        {children}
        <Toaster position="bottom-right" closeButton />
      </TooltipProvider>
    </ThemeProvider>
  );
}

/** Render children only once the store has hydrated (localStorage is client-only). */
export function WhenHydrated({ children, fallback }: { children: React.ReactNode; fallback?: React.ReactNode }) {
  const hydrated = useApp((s) => s.hydrated);
  return <>{hydrated ? children : fallback}</>;
}
