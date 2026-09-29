"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Download, Search, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { downloadCsv, type CsvCell } from "@/lib/csv";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { InCardContext, Panel } from "./page";

/**
 * Data table in the shadcn / Stripe manner: a card with a toolbar, a roomy table with a soft header
 * band, sortable columns, 25-row pages and CSV export (spec §9 general rules).
 * Wide screens show more columns as space allows; below `lg` every row becomes a labelled card,
 * so no screen ever scrolls sideways. Inside a Section card it renders flush instead of nesting.
 */

export interface Column<T> {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  /** Value used for sorting; omit to make the column unsortable. */
  sort?: (row: T) => string | number | null | undefined;
  /** Plain value for CSV; omit to leave the column out of the export. */
  csv?: (row: T) => CsvCell;
  csvHeader?: string;
  align?: "left" | "right" | "center";
  className?: string;
  headClassName?: string;
  /** Hide in the desktop table below this breakpoint (xl or 2xl; the card view still shows it). */
  hideBelow?: "sm" | "md" | "lg" | "xl" | "2xl";
  /** Export-only column: not rendered, still in the CSV. */
  hidden?: boolean;
  /** Phone card placement: "title" (lead line), "aside" (top right), false (leave out). Defaults are inferred. */
  mobile?: "title" | "aside" | false;
  width?: string;
}

const HIDE: Record<NonNullable<Column<unknown>["hideBelow"]>, string> = {
  sm: "",
  md: "",
  lg: "",
  xl: "hidden xl:table-cell",
  "2xl": "hidden 2xl:table-cell",
};

const labelOf = <T,>(c: Column<T>) => (typeof c.header === "string" ? c.header : (c.csvHeader ?? ""));

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  rowHref,
  onRowClick,
  search,
  searchPlaceholder = "Search",
  toolbar,
  exportName,
  canExport = true,
  initialSort,
  pageSize = 25,
  empty,
  footer,
  rowClassName,
  dense = false,
  caption,
  id,
  selectedKey,
  className,
  title,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  rowHref?: (row: T) => string | undefined;
  onRowClick?: (row: T) => void;
  /** Return the text a row is searched by; omit to hide the search box. */
  search?: (row: T) => string;
  searchPlaceholder?: string;
  toolbar?: React.ReactNode;
  exportName?: string;
  canExport?: boolean;
  initialSort?: { key: string; dir: "asc" | "desc" };
  pageSize?: number;
  empty?: React.ReactNode;
  footer?: React.ReactNode;
  rowClassName?: (row: T) => string | undefined;
  dense?: boolean;
  caption?: string;
  /** id on the wrapper, for QuickTabs `controls`. */
  id?: string;
  selectedKey?: string;
  className?: string;
  /** Optional heading shown at the top of a standalone table card. */
  title?: React.ReactNode;
}) {
  const router = useRouter();
  const inCard = React.useContext(InCardContext);
  const [q, setQ] = React.useState("");
  const [sort, setSort] = React.useState(initialSort);
  const resetKey = `${q}|${rows.length}`;
  const [pageState, setPageState] = React.useState({ key: resetKey, page: 0 });
  const page = pageState.key === resetKey ? pageState.page : 0;
  const setPage = (n: number) => setPageState({ key: resetKey, page: n });

  const filtered = React.useMemo(() => {
    if (!search || !q.trim()) return rows;
    const terms = q.toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter((r) => {
      const hay = search(r).toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }, [rows, q, search]);

  const sorted = React.useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sort) return filtered;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const va = col.sort!(a);
      const vb = col.sort!(b);
      if (va === vb) return 0;
      if (va === null || va === undefined || va === "") return 1;
      if (vb === null || vb === undefined || vb === "") return -1;
      return (va < vb ? -1 : 1) * dir;
    });
  }, [filtered, sort, columns]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, pages - 1);
  const visible = sorted.slice(current * pageSize, current * pageSize + pageSize);

  const toggleSort = (key: string) => {
    setSort((s) => (s?.key === key ? (s.dir === "asc" ? { key, dir: "desc" } : undefined) : { key, dir: "asc" }));
  };

  const shown = columns.filter((c) => !c.hidden);

  const exportCsv = () => {
    const cols = columns.filter((c) => c.csv);
    downloadCsv(
      `${exportName ?? "export"}-${new Date().toISOString().slice(0, 10)}`,
      cols.map((c) => c.csvHeader ?? (typeof c.header === "string" ? c.header : c.key)),
      sorted.map((r) => cols.map((c) => c.csv!(r))),
    );
  };

  const clickable = Boolean(rowHref || onRowClick);
  const activate = (r: T) => {
    const href = rowHref?.(r);
    if (href) router.push(href);
    else onRowClick?.(r);
  };
  const ignoreTarget = (e: React.SyntheticEvent) => Boolean((e.target as HTMLElement).closest("a,button,input,label,[role=checkbox],[data-no-row]"));

  // Phone card layout: lead column, the amount on the right, the rest as labelled fields.
  const titleCol = shown.find((c) => c.mobile === "title") ?? shown.find((c) => c.mobile !== false);
  const asideCol = shown.find((c) => c.mobile === "aside") ?? [...shown].reverse().find((c) => c !== titleCol && c.align === "right" && c.mobile !== false && labelOf(c) !== "");
  const fieldCols = shown.filter((c) => c !== titleCol && c !== asideCol && c.mobile !== false);

  const showToolbar = Boolean(search || toolbar || (exportName && canExport) || title);
  const edge = inCard ? "px-5" : "px-4 sm:px-5";

  const emptyRow = (
    <div className="py-4">
      {q ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <p className="text-[15px] text-ink-2">Nothing matches “{q}”.</p>
          <Button variant="outline" size="sm" onClick={() => setQ("")}>
            Clear search
          </Button>
        </div>
      ) : (
        (empty ?? <p className="py-8 text-center text-sm text-ink-3">Nothing here yet.</p>)
      )}
    </div>
  );

  const body = (
    <>
      {showToolbar && (
        <div className={cn("no-print flex flex-wrap items-center gap-2", inCard ? "pb-4" : cn(edge, "border-b border-rule py-4"))}>
          {title && <div className="mr-auto text-[17px] font-semibold text-ink">{title}</div>}
          {search && (
            <div className="relative w-full sm:w-80">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-4" aria-hidden />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={searchPlaceholder} aria-label={searchPlaceholder} className="pr-8 pl-9" />
              {q && (
                <button
                  type="button"
                  onClick={() => setQ("")}
                  className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-ink-3 hover:bg-canvas-2 hover:text-ink"
                  aria-label="Clear search"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
          )}
          {toolbar}
          {exportName && canExport && (
            <Button variant="outline" size="sm" onClick={exportCsv} className="ml-auto" disabled={!sorted.length}>
              <Download /> Export CSV
            </Button>
          )}
        </div>
      )}

      {/* Phones: labelled cards */}
      <ul className={cn("divide-y divide-rule lg:hidden", inCard ? "-mx-5 border-t border-rule" : "")}>
        {visible.map((r) => {
          const k = rowKey(r);
          return (
            <li
              key={k}
              tabIndex={clickable ? 0 : undefined}
              onClick={clickable ? (e) => !ignoreTarget(e) && activate(r) : undefined}
              onKeyDown={clickable ? (e) => e.key === "Enter" && e.target === e.currentTarget && activate(r) : undefined}
              className={cn("px-4 py-4 sm:px-5", clickable && "cursor-pointer active:bg-band-hover", selectedKey === k && "bg-band", rowClassName?.(r))}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1 text-[15px]">{titleCol?.cell(r)}</div>
                {asideCol && <div className="shrink-0 text-right text-[15px] font-semibold">{asideCol.cell(r)}</div>}
              </div>
              {fieldCols.length > 0 && (
                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2.5">
                  {fieldCols.map((c) => (
                    <div key={c.key} className="min-w-0">
                      {labelOf(c) && <dt className="text-xs font-medium text-ink-4">{labelOf(c)}</dt>}
                      <dd className="mt-0.5 min-w-0 text-sm text-ink">{c.cell(r)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </li>
          );
        })}
        {!visible.length && <li className="px-4">{emptyRow}</li>}
      </ul>
      {footer && (
        <div className={cn("overflow-x-auto lg:hidden", inCard && "-mx-5")}>
          <Table>
            <TableFooter>{footer}</TableFooter>
          </Table>
        </div>
      )}

      {/* Tablets and up: the table */}
      <Table containerClassName={cn("hidden lg:block", inCard && "-mx-5 w-[calc(100%+2.5rem)]")}>
        {caption && <caption className="sr-only">{caption}</caption>}
        <TableHeader>
          <TableRow>
            {shown.map((c) => {
              const active = sort?.key === c.key;
              return (
                <TableHead
                  key={c.key}
                  scope="col"
                  style={c.width ? { width: c.width } : undefined}
                  aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : undefined}
                  className={cn(c.align === "right" && "text-right", c.align === "center" && "text-center", c.hideBelow && HIDE[c.hideBelow], c.headClassName)}
                >
                  {c.sort ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(c.key)}
                      className={cn("group/sort inline-flex items-center gap-1.5 transition-colors hover:text-ink", active && "text-ink", c.align === "right" && "flex-row-reverse")}
                    >
                      {c.header}
                      {active ? (
                        sort!.dir === "asc" ? (
                          <ArrowUp className="size-3.5" />
                        ) : (
                          <ArrowDown className="size-3.5" />
                        )
                      ) : (
                        <ArrowUpDown className="size-3.5 opacity-0 transition-opacity group-hover/sort:opacity-60" />
                      )}
                    </button>
                  ) : (
                    c.header
                  )}
                </TableHead>
              );
            })}
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((r) => {
            const k = rowKey(r);
            return (
              <TableRow
                key={k}
                tabIndex={clickable ? 0 : undefined}
                onClick={clickable ? (e) => !ignoreTarget(e) && activate(r) : undefined}
                onKeyDown={clickable ? (e) => e.key === "Enter" && e.target === e.currentTarget && activate(r) : undefined}
                aria-selected={selectedKey === k || undefined}
                className={cn("group", clickable && "cursor-pointer hover:bg-band-hover focus-visible:bg-band focus-visible:outline-none", selectedKey === k && "bg-band", rowClassName?.(r))}
              >
                {shown.map((c) => (
                  <TableCell
                    key={c.key}
                    className={cn(dense ? "h-12 py-2" : "h-14 py-3", c.align === "right" && "tnum text-right", c.align === "center" && "text-center", c.hideBelow && HIDE[c.hideBelow], c.className)}
                  >
                    {c.cell(r)}
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
          {!visible.length && (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={shown.length} className="px-5">
                {emptyRow}
              </TableCell>
            </TableRow>
          )}
        </TableBody>
        {footer && <TableFooter>{footer}</TableFooter>}
      </Table>

      {sorted.length > pageSize && (
        <div className={cn("no-print flex items-center justify-between gap-3 border-t border-rule text-[13px] text-ink-3", inCard ? "-mx-5 -mb-5 px-5 py-3" : cn(edge, "py-3"))}>
          <span className="tnum">
            Showing {current * pageSize + 1}–{Math.min(sorted.length, (current + 1) * pageSize)} of {sorted.length}
          </span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon-sm" onClick={() => setPage(current - 1)} disabled={current === 0} aria-label="Previous page">
              <ChevronLeft />
            </Button>
            <span className="tnum px-1 font-medium text-ink-2">
              {current + 1} / {pages}
            </span>
            <Button variant="outline" size="icon-sm" onClick={() => setPage(current + 1)} disabled={current >= pages - 1} aria-label="Next page">
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </>
  );

  if (inCard)
    return (
      <div id={id} className={cn("min-w-0", className)}>
        {body}
      </div>
    );
  return (
    <Panel id={id} className={cn("overflow-hidden", className)}>
      {body}
    </Panel>
  );
}

/** A totals row for <DataTable footer>: first cell label, right-aligned amounts. */
export function TotalsRow({
  cells,
}: {
  cells: {
    content?: React.ReactNode;
    align?: "left" | "right";
    colSpan?: number;
    className?: string;
  }[];
}) {
  return (
    <TableRow className="border-t-2 border-b-0 border-rule-2 bg-table-head">
      {cells.map((c, i) => (
        <TableCell key={i} colSpan={c.colSpan} className={cn("h-12 font-semibold", c.align === "right" && "tnum text-right", c.className)}>
          {c.content}
        </TableCell>
      ))}
    </TableRow>
  );
}
