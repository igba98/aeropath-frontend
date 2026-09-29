import * as React from "react";

import { cn } from "@/lib/utils";

export const controlBase =
  "w-full min-w-0 rounded-lg border border-input bg-paper text-sm text-ink shadow-[0_1px_2px_rgb(15_23_42/0.04)] transition-[border-color,box-shadow] duration-150 outline-none placeholder:text-ink-4 hover:border-ink-4/50 focus-visible:border-brand focus-visible:shadow-[0_0_0_3px_color-mix(in_oklab,var(--brand-400)_22%,transparent)] focus-visible:outline-none disabled:cursor-not-allowed disabled:bg-canvas disabled:text-ink-3 aria-invalid:border-destructive aria-invalid:shadow-[0_0_0_3px_color-mix(in_oklab,var(--destructive)_16%,transparent)]";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return <input type={type} data-slot="input" className={cn(controlBase, "h-9 px-3 py-1 read-only:bg-canvas read-only:hover:border-input", className)} {...props} />;
}

export { Input };
