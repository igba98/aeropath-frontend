"use client";

import * as React from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";

/**
 * Table filters: inline from `lg`, behind one "Filters" button (bottom sheet) on smaller screens,
 * so a phone sees its list instead of five rows of dropdowns.
 */
export function ResponsiveFilters({ children, active = 0, onClear }: { children: React.ReactNode; active?: number; onClear?: () => void }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      {/* Unmounted while the sheet is open so the sheet's copy owns the ids and labels. */}
      {!open && <div className="hidden flex-wrap items-center gap-2 lg:flex">{children}</div>}
      <Button variant="outline" size="sm" className="lg:hidden" onClick={() => setOpen(true)}>
        <SlidersHorizontal /> Filters
        {active > 0 && <span className="tnum rounded-full bg-primary px-1.5 text-[11px] leading-5 text-primary-foreground">{active}</span>}
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
          </SheetHeader>
          <SheetBody className="grid gap-3 [&_[data-slot=select-trigger]]:w-full [&>button]:w-full">{children}</SheetBody>
          <SheetFooter>
            {onClear && active > 0 && (
              <Button variant="outline" onClick={onClear}>
                Clear filters
              </Button>
            )}
            <Button onClick={() => setOpen(false)}>Show results</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
