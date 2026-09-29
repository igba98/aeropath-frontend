import { z } from "zod";
import type { Command, ID, Role, User } from "../types";
import { makeAudit } from "../audit";
import { roleLabel } from "../permissions";
import { denied, fail, nowIso, ok, parse, produce } from "./_helpers";
import { zOptPhone, zText } from "./_schemas";

export interface UpsertUserInput {
  user: Partial<User> & { name: string; email: string; role: Role };
}

export interface UpsertUserResult {
  userId: ID;
}

const schema = z.object({
  id: z.preprocess((v) => (v === "" || v === null ? undefined : v), z.string().optional()),
  name: zText("Name"),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  role: z.enum(["agent", "accountant", "manager"]),
  phone: zOptPhone,
  active: z.boolean().optional(),
});

/** "Neema Mushi" → "NM"; "Grace" → "GR". */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

/** Manager only. Initials are generated. Keeps at least one active Manager; you cannot deactivate yourself. */
export const upsertUser: Command<UpsertUserInput, UpsertUserResult> = (state, input, ctx) => {
  const no = denied(ctx, "user.manage");
  if (no) return no;
  const parsed = parse(schema, input?.user, "user");
  if (!parsed.ok) return parsed;
  const f = parsed.data;

  const existing = f.id ? state.users[f.id] : undefined;
  if (f.id && !existing) return fail("NOT_FOUND", "This user could not be found.", "user.id");
  const clash = Object.values(state.users).find((u) => u.email.toLowerCase() === f.email && u.id !== existing?.id);
  if (clash) return fail("CONFLICT", `${clash.name} already uses ${f.email}.`, "user.email");

  const active = f.active ?? existing?.active ?? true;
  if (existing) {
    if (existing.id === ctx.user.id && !active) return fail("CONFLICT", "You cannot deactivate your own account.", "user.active");
    const losesManager = existing.role === "manager" && existing.active && (f.role !== "manager" || !active);
    const others = Object.values(state.users).filter((u) => u.id !== existing.id && u.role === "manager" && u.active);
    if (losesManager && others.length === 0) return fail("CONFLICT", "There must always be at least one active Manager.", "user.role");
  }

  const id = existing?.id ?? ctx.newId("usr");
  const user: User = { id, name: f.name, initials: initialsOf(f.name), email: f.email, role: f.role, active, createdAt: existing?.createdAt ?? nowIso(ctx) };
  if (f.phone) user.phone = f.phone;

  const next = produce(state, (d) => {
    d.users[id] = user;
  });
  const what = existing ? `User ${user.name} updated (${roleLabel(user.role)}${user.active ? "" : ", deactivated"})` : `User ${user.name} added as ${roleLabel(user.role)}`;
  return ok(next, [makeAudit(ctx, existing ? "user.updated" : "user.created", "user", id, what)], { userId: id }, existing ? "User saved" : `${user.name} added`);
};
