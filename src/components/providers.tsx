"use client";

import { useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { useStore } from "@/lib/store";
import { cart } from "@/lib/api";

/** Hydrates the persisted prototype store and runs the hold sweeper. */
export function Providers({ children }: { children: React.ReactNode }) {
  const hydrated = useStore((s) => s.hydrated);

  useEffect(() => {
    void useStore.persist.rehydrate();
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const t = setInterval(() => cart.sweep(), 15_000);
    return () => clearInterval(t);
  }, [hydrated]);

  return (
    <>
      {children}
      <Toaster position="top-center" richColors closeButton />
    </>
  );
}
