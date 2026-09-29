/**
 * Seed plumbing: deterministic PRNG and ids, time helpers relative to `now`, and a timeline that runs the real
 * commands (runCommand) in chronological order so numbers, ledger and audit read like a real history.
 */
import type { Command, DbState, ID, ISODate, User } from "@/domain/types";
import { runCommand } from "@/domain/commands/run";
import { addDaysISO, darLocalToUtc, darToday } from "@/domain/dates";

export interface SeedFailure {
  step: string;
  error: string;
}

export type StaffKey = "grace" | "neema" | "baraka" | "peter";

/** Record locators and ticket numbers kept free for the live demo (PNR samples and mock fixtures). */
export const RESERVED_LOCATORS = new Set(["Z8K4QM", "W3JN6P", "T5MV8C", "L9BX2D"]);
export const RESERVED_TICKETS = new Set(["176-2401234567", "176-2401234568", "176-2401234569", "071-2401555001", "071-2401555002", "071-2401555003"]);

/** Small fast deterministic PRNG. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Step {
  at: number;
  seq: number;
  label: string;
  run: () => void;
}

const LOCATOR_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export class Seeder {
  state: DbState;
  readonly now: Date;
  /** Dar es Salaam calendar date of `now`. */
  readonly today: ISODate;
  readonly failures: SeedFailure[] = [];
  readonly staff = {} as Record<StaffKey, User>;
  /** Named references filled while the timeline runs: "c:mwakalinga", "t:mwakalinga.peter", "s:consolidator", "a:crdb_tzs"… */
  readonly ids: Record<string, ID> = {};
  private readonly rand: () => number;
  private idCounter = 0;
  private seq = 0;
  private steps: Step[] = [];
  private usedLocators = new Set<string>();
  private usedTickets = new Set<string>();
  private usedCodes = new Set<string>();

  constructor(state: DbState, now: Date, seed: number) {
    this.state = state;
    this.now = now;
    this.today = darToday(now);
    this.rand = mulberry32(seed);
  }

  /** Deterministic id factory injected into every ctx: "fil_00001a". */
  newId = (prefix: string): ID => `${prefix}_${(++this.idCounter).toString(36).padStart(6, "0")}`;

  // ───────────────────────────── Time ─────────────────────────────

  /** Dar-local wall clock on (today − daysAgo) at "HH:mm". Use daysAgo ≥ 1 (always in the past). */
  day(daysAgo: number, hhmm: string): Date {
    return new Date(darLocalToUtc(`${addDaysISO(this.today, -daysAgo)}T${hhmm}`));
  }

  /** A moment earlier today (Dar time): frac 0 = midnight, 1 = now. */
  todayAt(frac: number): Date {
    const start = Date.parse(darLocalToUtc(`${this.today}T00:00`));
    return new Date(start + Math.floor((this.now.getTime() - start) * frac));
  }

  fromNow(hours: number): Date {
    return new Date(this.now.getTime() + hours * 3_600_000);
  }

  plusMs(d: Date, ms: number): Date {
    return new Date(d.getTime() + ms);
  }

  /** Dar calendar date `offset` days from today (negative = past). */
  date(offset: number): ISODate {
    return addDaysISO(this.today, offset);
  }

  /** Local wall clock "YYYY-MM-DDTHH:mm" `offset` days from today. */
  local(offset: number, hhmm: string): string {
    return `${this.date(offset)}T${hhmm}`;
  }

  // ───────────────────────────── Random ─────────────────────────────

  int(min: number, max: number): number {
    return min + Math.floor(this.rand() * (max - min + 1));
  }

  chars(n: number, alphabet: string): string {
    let s = "";
    for (let i = 0; i < n; i++) s += alphabet[Math.floor(this.rand() * alphabet.length)];
    return s;
  }

  digits(n: number): string {
    return this.chars(n, "0123456789");
  }

  /** A fresh 6-character record locator (never one of the demo samples). */
  locator(): string {
    for (;;) {
      const l = this.chars(1, "ABCDEFGHJKLMNPQRSTUVWXYZ") + this.chars(5, LOCATOR_CHARS);
      if (!RESERVED_LOCATORS.has(l) && !this.usedLocators.has(l)) {
        this.usedLocators.add(l);
        return l;
      }
    }
  }

  /** A fresh ticket number "PPP-NNNNNNNNNN" for a 3-digit airline prefix. */
  ticket(prefix: string): string {
    for (;;) {
      const t = `${prefix}-2${this.digits(9)}`;
      if (!RESERVED_TICKETS.has(t) && !this.usedTickets.has(t)) {
        this.usedTickets.add(t);
        return t;
      }
    }
  }

  /** A unique reference code: prefix + random characters. */
  code(prefix: string, n: number, alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789"): string {
    for (;;) {
      const c = prefix + this.chars(n, alphabet);
      if (!this.usedCodes.has(c)) {
        this.usedCodes.add(c);
        return c;
      }
    }
  }

  // ───────────────────────────── Commands ─────────────────────────────

  user(who: StaffKey | User): User {
    return typeof who === "string" ? this.staff[who] : who;
  }

  /** Runs a real command at simulated time `at` as `who`. Failures are collected; returns the result (or {} when none). */
  run<I, R>(label: string, at: Date, who: StaffKey | User, cmd: Command<I, R>, input: I): R | undefined {
    const user = this.user(who);
    if (!user) {
      this.failures.push({ step: label, error: `No seed user ${String(who)}` });
      return undefined;
    }
    const ctx = { user, now: at, settings: this.state.settings, newId: this.newId };
    const res = runCommand(this.state, cmd, input, ctx);
    if (!res.ok) {
      this.failures.push({ step: label, error: `${res.error.code}: ${res.error.message}${res.error.field ? ` [${res.error.field}]` : ""}` });
      return undefined;
    }
    this.state = res.state;
    return (res.result ?? {}) as R;
  }

  /** A named id; throws (recorded as a failure by the timeline) when an earlier step did not create it. */
  ref(key: string): ID {
    const id = this.ids[key];
    if (!id) throw new Error(`Missing seed reference "${key}" (an earlier step failed)`);
    return id;
  }

  // ───────────────────────────── Timeline ─────────────────────────────

  /** Schedules a step at simulated time `at`. Steps run in time order (ties keep scheduling order). */
  at(when: Date, label: string, run: () => void): void {
    this.steps.push({ at: when.getTime(), seq: this.seq++, label, run });
  }

  /** Runs every scheduled step in chronological order. */
  flush(): void {
    const steps = [...this.steps].sort((a, b) => a.at - b.at || a.seq - b.seq);
    this.steps = [];
    for (const step of steps) {
      if (step.at > this.now.getTime()) {
        this.failures.push({ step: step.label, error: `Scheduled in the future (${new Date(step.at).toISOString()})` });
        continue;
      }
      try {
        step.run();
      } catch (e) {
        this.failures.push({ step: step.label, error: e instanceof Error ? e.message : String(e) });
      }
    }
  }
}
