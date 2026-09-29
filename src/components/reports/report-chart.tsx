"use client";

import * as React from "react";
import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts";

import type { Currency } from "@/domain/types";
import type { ChartSpec } from "@/domain/selectors/reports";
import { cn } from "@/lib/utils";
import { fmtDay } from "@/lib/dates";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

const compact = (v: number) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v);
const full = (v: number, unit: Currency | "count") =>
  unit === "count"
    ? v.toLocaleString("en-US")
    : `${unit} ${v.toLocaleString("en-US", { maximumFractionDigits: unit === "TZS" ? 0 : 2, minimumFractionDigits: unit === "TZS" ? 0 : 2 })}`;
const dayLabel = (iso: string) => fmtDay(iso);
const monthLabel = (ym: string) => new Date(`${ym}-15T12:00:00Z`).toLocaleDateString("en-US", { month: "short", year: "2-digit", timeZone: "UTC" });

const axis = { fontSize: 11, fill: "var(--ink-3)", fontFamily: "var(--font-montserrat)", fontVariantNumeric: "tabular-nums" } as const;
const color = (i: number) => `var(--chart-${i})`;

/** A line drawn next to bars sits on its own right-hand axis, so a small margin line is not flattened against the sales scale. */
const splitAxis = (spec: ChartSpec) => !spec.horizontal && !spec.stacked && spec.series.some((s) => s.mark === "line") && spec.series.some((s) => (s.mark ?? "bar") === "bar");

function Legend({ spec }: { spec: ChartSpec }) {
  if (spec.series.length < 2) return null;
  const split = splitAxis(spec);
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-3">
      {spec.series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          {s.mark === "line" ? <span className="h-0.5 w-4" style={{ background: color(s.color) }} aria-hidden /> : <span className="size-2.5 rounded-[2px]" style={{ background: color(s.color) }} aria-hidden />}
          {s.label}
          {split && s.mark === "line" && <span className="text-ink-4">(right axis)</span>}
        </li>
      ))}
    </ul>
  );
}

/**
 * One report chart on the shadcn ChartContainer: hairline grid, brand for the primary series and navy for the second,
 * tabular tick labels, the shadcn tooltip. Horizontal bars take their height from the row count.
 */
export function ReportChart({ spec, height = 240, className }: { spec: ChartSpec; height?: number; className?: string }) {
  const labelFmt = spec.xFormat === "date" ? dayLabel : spec.xFormat === "month" ? monthLabel : (l: string) => l;
  const horizontal = !!spec.horizontal;
  const rows = spec.data.length;
  const h = horizontal ? Math.max(120, Math.min(520, rows * 44 + 36)) : height;
  const split = splitAxis(spec);
  const config = Object.fromEntries(spec.series.map((s) => [s.key, { label: s.label, color: color(s.color) }])) satisfies ChartConfig;
  const total = spec.data.reduce((s, d) => s + (Number(d[spec.series[0]?.key]) || 0), 0);
  const aria = `${spec.title}. ${spec.series.map((s) => s.label).join(" and ")}${spec.series[0] ? `, total ${full(total, spec.unit)}` : ""}.`;
  const valueTick = (v: number) => (spec.unit === "count" ? String(v) : compact(v));
  const allZero = spec.data.every((d) => spec.series.every((s) => !Number(d[s.key])));

  return (
    <figure className={cn("min-w-0", className)}>
      <figcaption className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-sm font-medium text-ink">{spec.title}</span>
        <span className="flex items-center gap-4">
          <Legend spec={spec} />
          <span className="text-xs text-ink-4">{spec.unit === "count" ? "count" : `in ${spec.unit}`}</span>
        </span>
      </figcaption>
      {allZero ? (
        <p className="grid place-items-center border-y border-rule text-sm text-ink-3" style={{ height: Math.min(h, 120) }}>
          Nothing to chart in this period.
        </p>
      ) : (
        <div role="img" aria-label={aria}>
          <ChartContainer config={config} className="aspect-auto w-full" style={{ height: h }}>
            <ComposedChart
              data={spec.data}
              layout={horizontal ? "vertical" : "horizontal"}
              margin={{ top: 6, right: 8, bottom: 0, left: 0 }}
              barGap={2}
              barCategoryGap={horizontal ? 8 : "22%"}
            >
              <CartesianGrid stroke="var(--rule)" vertical={horizontal} horizontal={!horizontal} />
              {horizontal ? (
                <>
                  <XAxis type="number" tickFormatter={valueTick} tick={axis} tickLine={false} axisLine={{ stroke: "var(--rule-2)" }} />
                  <YAxis type="category" dataKey={spec.xKey} tick={axis} tickLine={false} axisLine={false} width={130} tickFormatter={(v: string) => (v.length > 20 ? `${v.slice(0, 19)}…` : v)} />
                </>
              ) : (
                <>
                  <XAxis dataKey={spec.xKey} tickFormatter={labelFmt} tick={axis} tickLine={false} axisLine={{ stroke: "var(--rule-2)" }} minTickGap={16} />
                  <YAxis yAxisId="left" tickFormatter={valueTick} tick={axis} tickLine={false} axisLine={false} width={48} />
                  {split && <YAxis yAxisId="right" orientation="right" tickFormatter={valueTick} tick={{ ...axis, fill: "var(--chart-2)" }} tickLine={false} axisLine={false} width={44} />}
                </>
              )}
              <ChartTooltip
                content={<ChartTooltipContent labelFormatter={(_, p) => labelFmt(String(p?.[0]?.payload?.[spec.xKey] ?? ""))} valueFormatter={(v) => full(v, spec.unit)} />}
                cursor={horizontal || spec.kind !== "line" ? { fill: "var(--band-hover)" } : { stroke: "var(--rule-2)" }}
              />
              {spec.series.map((s) =>
                (s.mark ?? (spec.kind === "line" ? "line" : "bar")) === "line" ? (
                  <Line key={s.key} yAxisId={horizontal ? undefined : split ? "right" : "left"} type="monotone" dataKey={s.key} name={s.key} stroke={color(s.color)} strokeWidth={2} dot={false} activeDot={{ r: 3 }} isAnimationActive={false} />
                ) : (
                  <Bar
                    key={s.key}
                    yAxisId={horizontal ? undefined : "left"}
                    dataKey={s.key}
                    name={s.key}
                    fill={color(s.color)}
                    stackId={spec.stacked ? "a" : undefined}
                    radius={spec.stacked ? 0 : horizontal ? [0, 3, 3, 0] : [3, 3, 0, 0]}
                    maxBarSize={horizontal ? 14 : 28}
                    isAnimationActive={false}
                  />
                ),
              )}
            </ComposedChart>
          </ChartContainer>
        </div>
      )}
    </figure>
  );
}
