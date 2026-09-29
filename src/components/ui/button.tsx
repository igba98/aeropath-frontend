import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import { Loader2 } from "lucide-react";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "relative inline-flex shrink-0 items-center justify-center gap-2 rounded-lg text-sm leading-none font-semibold whitespace-nowrap select-none transition-[background-color,border-color,color,box-shadow] duration-150 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-[0_1px_2px_rgb(15_23_42/0.12),inset_0_-1px_0_rgb(0_0_0/0.12)] hover:bg-primary-hover active:bg-primary-hover",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive-hover shadow-[inset_0_-1px_0_rgb(0_0_0/0.14)]",
        outline: "border border-rule-2 bg-paper text-ink shadow-[0_1px_2px_rgb(15_23_42/0.05)] hover:bg-canvas active:bg-canvas-2",
        secondary: "bg-canvas-2 text-ink hover:bg-rule active:bg-rule-2",
        ghost: "text-ink-2 hover:bg-canvas-2 hover:text-ink active:bg-rule",
        link: "h-auto px-0 text-link underline-offset-4 hover:underline",
        "danger-ghost": "text-destructive hover:bg-[var(--st-red-bg)]",
      },
      size: {
        default: "h-9 px-4 has-[>svg]:px-3",
        xs: "h-7 gap-1.5 rounded-md px-2.5 text-[13px] has-[>svg]:px-2 [&_svg:not([class*='size-'])]:size-3.5",
        sm: "h-8 gap-1.5 rounded-md px-3 text-[13.5px] has-[>svg]:px-2.5 [&_svg:not([class*='size-'])]:size-4",
        lg: "h-11 px-5 text-[15px] has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-7 rounded-md [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-8 rounded-md [&_svg:not([class*='size-'])]:size-4",
        "icon-lg": "size-11",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  loading = false,
  children,
  disabled,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    loading?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={asChild ? undefined : disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading && <Loader2 className="animate-spin" aria-hidden />}
          {children}
        </>
      )}
    </Comp>
  );
}

export { Button, buttonVariants };
