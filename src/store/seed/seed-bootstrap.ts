/**
 * Bootstrap of the seed: the Manager (inserted directly — no one can run commands before a Manager exists), then
 * every other record through commands: staff, suppliers, settings, money accounts, clients and travellers.
 */
import type { User } from "@/domain/types";
import { createClient, updateSettings, upsertMoneyAccount, upsertSupplier, upsertTraveller, upsertUser, type CreateClientInput } from "@/domain/commands";
import { initialsOf } from "@/domain/commands/upsertUser";
import { major } from "@/domain/money";
import { normalisePhone } from "@/domain/validation";
import { AIRLINES } from "./reference";
import { ACCOUNTS, CLIENTS, STAFF, SUPPLIERS } from "./seed-data";
import type { Seeder } from "./seed-kit";

/** Days before today when the agency's back office was set up. */
export const SETUP_DAYS_AGO = 120;

export function bootstrap(s: Seeder): void {
  const setup = s.day(SETUP_DAYS_AGO, "08:30");

  // 1. Grace (Manager) is the only direct write: commands need an acting Manager to create users.
  const g = STAFF.find((u) => u.key === "grace")!;
  const grace: User = {
    id: s.newId("usr"),
    name: g.name,
    initials: initialsOf(g.name),
    email: `${g.name.split(" ")[0].toLowerCase()}@aeropath.co.tz`,
    phone: normalisePhone(g.phone) ?? undefined,
    role: g.role,
    active: true,
    createdAt: setup.toISOString(),
  };
  s.state = { ...s.state, users: { ...s.state.users, [grace.id]: grace } };
  s.staff.grace = grace;

  // 2. The rest of the staff, as Grace.
  const t1 = s.plusMs(setup, 5 * 60_000);
  s.at(t1, "bootstrap: staff", () => {
    for (const u of STAFF.filter((x) => x.key !== "grace")) {
      const r = s.run(`bootstrap: upsertUser ${u.name}`, t1, "grace", upsertUser, {
        user: { name: u.name, email: `${u.name.split(" ")[0].toLowerCase()}@aeropath.co.tz`, role: u.role, phone: u.phone },
      });
      if (r) s.staff[u.key] = s.state.users[r.userId];
    }
  });

  // 3. Suppliers (the consolidator first: settings point to it).
  const t2 = s.plusMs(setup, 20 * 60_000);
  s.at(t2, "bootstrap: suppliers", () => {
    for (const sp of SUPPLIERS) {
      const r = s.run(`bootstrap: upsertSupplier ${sp.name}`, t2, "grace", upsertSupplier, {
        supplier: { name: sp.name, kind: sp.kind, currency: sp.currency, paymentTermsDays: sp.terms, contactName: sp.contact, phone: sp.phone, email: sp.email, notes: sp.notes, active: sp.active ?? true },
      });
      if (r) s.ids[`s:${sp.key}`] = r.supplierId;
    }
  });

  // 4. Settings (spec §14): airlines, air settlement via the consolidator, FX 2,600, VAT 18% on the service fee,
  //    refund limit TZS 500,000, same-day void, Amadeus off. Company placeholders stay.
  const t3 = s.plusMs(setup, 30 * 60_000);
  s.at(t3, "bootstrap: settings", () => {
    s.run("bootstrap: updateSettings", t3, "grace", updateSettings, {
      patch: {
        airlines: AIRLINES.map((a) => ({ ...a })),
        airSettlement: { mode: "consolidator", supplierId: s.ref("s:consolidator") },
        fx: { USD_TZS: 2600 },
        vatRate: 0.18,
        vatBase: "service_fee",
        refundApprovalLimit: major(500_000, "TZS"),
        voidWindow: "same_day",
        defaultPaymentTermsDays: 30,
        integrations: { amadeus: { mode: "off" } },
      },
    });
  });

  // 5. Money accounts with opening balances.
  const t4 = s.plusMs(setup, 40 * 60_000);
  s.at(t4, "bootstrap: money accounts", () => {
    for (const a of ACCOUNTS) {
      const r = s.run(`bootstrap: upsertMoneyAccount ${a.name}`, t4, "grace", upsertMoneyAccount, {
        account: { name: a.name, kind: a.kind, currency: a.currency, openingBalance: major(a.opening, a.currency) },
      });
      if (r) s.ids[`a:${a.key}`] = r.accountId;
    }
  });

  // 6. Clients and their travellers, created over the following weeks by whoever took the first call.
  CLIENTS.forEach((c, i) => {
    const at = s.day(c.daysAgo, `${String(9 + (i % 7)).padStart(2, "0")}:${String(10 + ((i * 7) % 45)).padStart(2, "0")}`);
    s.at(at, `client ${c.key}`, () => {
      const input: CreateClientInput = { type: c.type, name: c.name, phone: c.phone, defaultCurrency: c.currency, email: c.email, address: c.address, tin: c.tin, vrn: c.vrn, contactPerson: c.contact, source: c.source, notes: c.notes, tags: c.tags };
      if (c.credit !== undefined) input.creditLimit = major(c.credit, "TZS");
      if (c.terms !== undefined) input.paymentTermsDays = c.terms;
      const r = s.run(`client ${c.key}: createClient`, at, c.by, createClient, input);
      if (!r) return;
      s.ids[`c:${c.key}`] = r.clientId;
      for (const t of c.travellers) {
        const tr = s.run(`client ${c.key}: upsertTraveller ${t.key}`, s.plusMs(at, 3 * 60_000), c.by, upsertTraveller, {
          traveller: {
            clientId: r.clientId,
            title: t.title,
            givenName: t.given,
            surname: t.surname,
            paxType: t.pax ?? "ADT",
            dateOfBirth: t.dob,
            gender: t.gender,
            nationality: t.nat,
            passportNumber: t.passport,
            passportExpiry: s.date(t.expiry),
            passportCountry: t.nat,
            frequentFlyer: t.ff ? [{ airline: t.ff[0], number: t.ff[1] }] : [],
          },
        });
        if (tr) s.ids[`t:${c.key}.${t.key}`] = tr.travellerId;
      }
    });
  });
}
