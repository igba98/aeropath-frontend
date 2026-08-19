/** Builds a CSV string in memory. The prototype toasts the result rather than downloading a file. */
export function toCsv(headers: string[], rows: Array<Array<string | number>>): string {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
}

/** yyyy-mm of an ISO timestamp */
export const monthKey = (iso: string) => iso.slice(0, 7);

export const monthLabel = (key: string) =>
  new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" }).format(new Date(`${key}-01T00:00:00Z`));

export function startOfMonthIso(d = new Date()): string {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}
