/** Deterministic helpers for fixture generation. All dates relative to "now" so the demo stays fresh. */
export const NOW = () => new Date();

export function iso(d: Date): string {
  return d.toISOString();
}
export function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
export function daysFromNow(n: number, hour = 9): Date {
  const d = new Date();
  d.setUTCHours(hour, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}
export function hoursFromNow(n: number): Date {
  return new Date(Date.now() + n * 3_600_000);
}
export function minutesFromNow(n: number): Date {
  return new Date(Date.now() + n * 60_000);
}
export function ref(prefix: string, n: number): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let x = (n * 2654435761) >>> 0;
  let out = "";
  for (let i = 0; i < 5; i++) {
    out += alphabet[x % alphabet.length];
    x = Math.floor(x / alphabet.length) + 7;
  }
  return `${prefix}-${out}`;
}
let seq = 1000;
export function id(prefix: string): string {
  seq += 1;
  return `${prefix}_${seq.toString(36)}`;
}
export function img(seed: string, w = 900, h = 640): string {
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/${w}/${h}`;
}
