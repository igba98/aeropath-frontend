"use client";

import * as React from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, XAxis, YAxis } from "recharts";
import type { Currency } from "@/domain/types";
import { fmtDay } from "@/lib/dates";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

const compact = (v: number) => new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(v);
const full = (v: number, cur: Currency) => `${cur} ${v.toLocaleString("en-US", { maximumFractionDigits: cur === "TZS" ? 0 : 2, minimumFractionDigits: cur === "TZS" ? 0 : 2 })}`;
const dayLabel = (iso: string) => fmtDay(iso);

const axis = { fontSize: 12, fill: "var(--ink-3)", fontFamily: "var(--font-montserrat)" };

const config = {
  sell: { label: "Sales", color: "var(--chart-1)" },
  margin: { label: "Margin", color: "var(--chart-2)" },
} satisfies ChartConfig;

/** Daily sales (area, left axis) and margin (line, right axis) for the last 30 days (manager home). */
export function SalesLineChart({ data, currency }: { data: { date: string; sell: number; margin: number }[]; currency: Currency }) {
  const total = data.reduce((s, d) => s + d.sell, 0);
  const id = React.useId().replace(/:/g, "");
  return (
    <figure>
      <div role="img" aria-label={`Sales over the last 30 days, total ${full(total, currency)}`}>
        <ChartContainer config={config} className="aspect-auto h-65 w-full">
          <AreaChart data={data} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-sell)" stopOpacity={0.35} />
                <stop offset="95%" stopColor="var(--color-sell)" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--rule)" vertical={false} />
            <XAxis dataKey="date" tickFormatter={dayLabel} tick={axis} tickLine={false} axisLine={false} minTickGap={28} />
            <YAxis yAxisId="sell" tickFormatter={compact} tick={axis} tickLine={false} axisLine={false} width={48} />
            <YAxis yAxisId="margin" orientation="right" tickFormatter={compact} tick={{ ...axis, fill: "var(--color-margin)" }} tickLine={false} axisLine={false} width={44} />
            <ChartTooltip cursor={{ stroke: "var(--rule-2)" }} content={<ChartTooltipContent labelFormatter={(_, p) => dayLabel(String(p?.[0]?.payload?.date ?? ""))} valueFormatter={(v) => full(v, currency)} />} />
            <Area yAxisId="sell" type="monotone" dataKey="sell" name="sell" stroke="var(--color-sell)" strokeWidth={2} fill={`url(#fill-${id})`} isAnimationActive={false} />
            <Line yAxisId="margin" type="monotone" dataKey="margin" name="margin" stroke="var(--color-margin)" strokeWidth={2} dot={false} isAnimationActive={false} />
          </AreaChart>
        </ChartContainer>
      </div>
      <ChartKey currency={currency} marginNote="right axis" />
    </figure>
  );
}

function ChartKey({ currency, marginNote }: { currency: Currency; marginNote?: string }) {
  return (
    <figcaption className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-rule pt-2 text-xs text-ink-3">
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-full bg-chart-1" /> Sales (issued)
      </span>
      <span className="flex items-center gap-1.5">
        <span className="size-2.5 rounded-full bg-chart-2" /> Margin{marginNote ? ` (${marginNote})` : ""}
      </span>
      <span className="ml-auto">in {currency}</span>
    </figcaption>
  );
}

/** Sales by agent this month (manager home), sized to the number of agents. */
export function AgentBarChart({ data, currency }: { data: { name: string; sell: number; margin: number }[]; currency: Currency }) {
  const h = Math.max(140, data.length * 56 + 36);
  return (
    <figure>
      <div role="img" aria-label="Sales by agent this month">
        <ChartContainer config={config} className="aspect-auto w-full" style={{ height: h }}>
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 8, bottom: 0, left: 0 }} barCategoryGap={12}>
            <CartesianGrid stroke="var(--rule)" horizontal={false} />
            <XAxis type="number" tickFormatter={compact} tick={axis} tickLine={false} axisLine={{ stroke: "var(--rule-2)" }} />
            <YAxis type="category" dataKey="name" tick={axis} tickLine={false} axisLine={false} width={110} />
            <ChartTooltip cursor={{ fill: "var(--band-hover)" }} content={<ChartTooltipContent valueFormatter={(v) => full(v, currency)} />} />
            <Bar dataKey="sell" name="sell" fill="var(--color-sell)" radius={[0, 4, 4, 0]} maxBarSize={16} isAnimationActive={false} />
            <Bar dataKey="margin" name="margin" fill="var(--color-margin)" radius={[0, 4, 4, 0]} maxBarSize={16} isAnimationActive={false} />
          </BarChart>
        </ChartContainer>
      </div>
      <ChartKey currency={currency} />
    </figure>
  );
}
