"use client";

import { CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
  const { resolvedTheme = "light" } = useTheme();

  return (
    <Sonner
      theme={resolvedTheme as ToasterProps["theme"]}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4 text-[var(--st-green-fg)]" />,
        info: <InfoIcon className="size-4 text-brand" />,
        warning: <TriangleAlertIcon className="size-4 text-[var(--st-amber-fg)]" />,
        error: <OctagonXIcon className="size-4 text-[var(--st-red-fg)]" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      toastOptions={{
        classNames: {
          toast: "!rounded-lg !border-rule-2 !shadow-pop !text-sm !gap-2.5",
          description: "!text-ink-3",
        },
      }}
      style={
        {
          "--normal-bg": "var(--paper)",
          "--normal-text": "var(--ink)",
          "--normal-border": "var(--rule-2)",
          "--border-radius": "8px",
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
