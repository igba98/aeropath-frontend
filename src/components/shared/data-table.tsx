"use client";

import { cn } from "@/lib/utils";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  numeric?: boolean;
  className?: string;
}

/** Simple, consistent table for console lists. Numeric columns get tabular numerals. */
export function DataTable<T>({ columns, rows, empty, onRowClick, rowKey, className, caption }: {
  columns: Column<T>[];
  rows: T[];
  empty?: React.ReactNode;
  onRowClick?: (row: T) => void;
  rowKey: (row: T) => string;
  className?: string;
  caption?: string;
}) {
  if (!rows.length && empty) return <>{empty}</>;
  return (
    <div className={cn("overflow-x-auto rounded-xl border bg-card", className)}>
      <table className="w-full min-w-[640px] border-collapse text-base">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr className="border-b">
            {columns.map((c) => (
              <th key={c.key} scope="col" className={cn("px-3 py-3.5 text-left text-sm font-medium text-muted-foreground", c.numeric && "text-right", c.className)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn("border-b last:border-0 transition-colors", onRowClick && "cursor-pointer hover:bg-brand-50/50")}
            >
              {columns.map((c) => (
                <td key={c.key} data-numeric={c.numeric || undefined} className={cn("px-3 py-4 align-middle", c.numeric && "text-right tabular-nums", c.className)}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
