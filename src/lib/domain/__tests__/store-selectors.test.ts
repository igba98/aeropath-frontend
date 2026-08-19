import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Zustand reads state through `useSyncExternalStore`, which compares snapshots by reference.
 * A selector that builds a fresh array or object on every call therefore never settles, and the
 * component re-renders until React throws "Maximum update depth exceeded". This is invisible to
 * typecheck, lint and SSR — every route still returns 200 — so it is guarded here instead.
 */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

/** Expressions that allocate a new value on each call. */
const ALLOCATES = /Object\.(values|entries|keys)\(|\.filter\(|\.map\(|\.sort\(|\.slice\(|\.concat\(|\?\?\s*\[\]|\|\|\s*\[\]|\?\?\s*\{\}/;
/** Terminal operations that collapse an allocation back to a stable scalar. */
const COLLAPSES = /\.length\b|\.find\(|\.some\(|\.every\(|\.includes\(|\.reduce\(|\.indexOf\(|\.join\(/;

describe("store selectors return stable references", () => {
  it("never selects a freshly allocated collection without useShallow", () => {
    const offenders: string[] = [];

    for (const file of walk(join(process.cwd(), "src"))) {
      readFileSync(file, "utf8").split("\n").forEach((line, i) => {
        if (!line.includes("useStore((") || line.includes("useShallow")) return;
        if (!ALLOCATES.test(line) || COLLAPSES.test(line)) return;
        offenders.push(`${file.replace(process.cwd() + "/", "")}:${i + 1}\n    ${line.trim().slice(0, 130)}`);
      });
    }

    expect(
      offenders,
      `Wrap these in useShallow, or select raw state and derive with useMemo:\n\n${offenders.join("\n")}\n`,
    ).toEqual([]);
  });
});
