"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Tabs as TabsPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

/*
 * shadcn Tabs, tuned to Aeropath tokens.
 * - default: grey pill track, the active tab a white pill (quick views, periods, breakdowns).
 * - line: underline tabs with the brand line under the active one (page sections).
 */

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      orientation={orientation}
      className={cn(
        "group/tabs flex min-w-0 gap-2 data-[orientation=horizontal]:flex-col",
        className
      )}
      {...props}
    />
  )
}

const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit min-w-max items-center text-ink-3",
  {
    variants: {
      variant: {
        default: "gap-1 rounded-xl bg-canvas-2 p-1",
        line: "w-full gap-6 border-b border-rule",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center gap-2 font-semibold whitespace-nowrap transition-colors outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        // pill
        "group-data-[variant=default]/tabs-list:h-9 group-data-[variant=default]/tabs-list:rounded-lg group-data-[variant=default]/tabs-list:px-3.5 group-data-[variant=default]/tabs-list:text-sm",
        "group-data-[variant=default]/tabs-list:data-[state=inactive]:hover:text-ink",
        "group-data-[variant=default]/tabs-list:data-[state=active]:bg-paper group-data-[variant=default]/tabs-list:data-[state=active]:text-ink group-data-[variant=default]/tabs-list:data-[state=active]:shadow-[0_1px_3px_rgb(15_23_42/0.12)]",
        // line
        "group-data-[variant=line]/tabs-list:-mb-px group-data-[variant=line]/tabs-list:h-11 group-data-[variant=line]/tabs-list:border-b-2 group-data-[variant=line]/tabs-list:text-[15px]",
        "group-data-[variant=line]/tabs-list:data-[state=inactive]:border-transparent group-data-[variant=line]/tabs-list:data-[state=inactive]:hover:border-rule-2 group-data-[variant=line]/tabs-list:data-[state=inactive]:hover:text-ink",
        "group-data-[variant=line]/tabs-list:data-[state=active]:border-primary group-data-[variant=line]/tabs-list:data-[state=active]:text-ink",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("min-w-0 flex-1 outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
