/**
 * Demo seed generator (spec §14). Pure and deterministic: a fixed PRNG seed, deterministic ids, and every date
 * relative to `now` so the demo always looks current. Apart from the first Manager, every record is produced by
 * running the real domain commands in chronological order — so the ledger and the audit log are the commands' own.
 */
import type { DbState } from "@/domain/types";
import { createEmptyDb } from "@/domain/defaults";
import { draftsAndBooked } from "./seed-bookings-a";
import { issuedFiles } from "./seed-bookings-b";
import { afterSalesFiles } from "./seed-bookings-c";
import { bootstrap } from "./seed-bootstrap";
import { Seeder, type SeedFailure } from "./seed-kit";
import { moneyOut } from "./seed-money-out";
import { messages } from "./seed-messages";

export type { SeedFailure } from "./seed-kit";

/** Fixed PRNG seed: every reset produces the same data (relative to `now`). */
export const SEED_NUMBER = 20260928;

export function generateSeedWithReport(now: Date): { db: DbState; failures: SeedFailure[] } {
  const s = new Seeder(createEmptyDb(now), now, SEED_NUMBER);
  bootstrap(s);
  const files = { ...draftsAndBooked(s), ...issuedFiles(s), ...afterSalesFiles(s) };
  moneyOut(s, files);
  messages(s, files);
  s.flush();
  return { db: { ...s.state, session: { userId: null } }, failures: s.failures };
}

export function generateSeed(now: Date): DbState {
  const { db, failures } = generateSeedWithReport(now);
  if (failures.length) console.warn(`[seed] ${failures.length} seed step(s) failed`, failures);
  return db;
}
