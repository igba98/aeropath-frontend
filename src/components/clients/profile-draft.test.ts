import { describe, expect, it } from "vitest";
import { createClient, updateClient, upsertTraveller } from "@/domain/commands";
import { createWorld, run } from "@/domain/__tests__/fixtures";
import {
  blankContact,
  draftToInput,
  draftToPatch,
  findSelfTraveller,
  firstInvalidStep,
  paxTypeFor,
  profileDraftFrom,
  selfTravellerInput,
  validateStep,
  type CheckOpts,
  type ProfileDraft,
} from "./profile-draft";

const opts: CheckOpts = { today: "2026-09-28", mode: "create", canSetCredit: false };

const orgDraft = (): ProfileDraft => ({
  ...profileDraftFrom(),
  type: "corporate",
  orgType: "ngo",
  sector: "NGO and development",
  legalName: "Tumaini Health Trust",
  phone: "022 260 0000",
  postalAddress: "4521",
  city: "Dodoma",
  region: "Dodoma",
  contacts: [
    { ...blankContact(true), name: "Rehema Ally", role: "Travel coordinator", phone: "0754 111 222" },
    { ...blankContact(), name: "Juma Said", email: "juma@tumaini.or.tz", canBook: true },
  ],
  departments: ["Programmes", "Finance"],
  approvalRequired: true,
  approver: "Juma Said",
  poRequired: true,
});

const personDraft = (): ProfileDraft => ({
  ...profileDraftFrom(),
  type: "individual",
  title: "MS",
  firstName: "Neema",
  lastName: "Joseph",
  phone: "0754 000 111",
  dateOfBirth: "1990-01-01",
  gender: "F",
  passportNumber: "tz 123456",
  passportExpiry: "2030-01-01",
  seat: "aisle",
});

describe("stepper checks", () => {
  it("asks for the kind of client, then the organisation's kind and sector", () => {
    expect(validateStep("type", profileDraftFrom(), opts)).toEqual({ type: "Choose Individual or Organisation." });
    expect(Object.keys(validateStep("type", { ...profileDraftFrom(), type: "corporate" }, opts))).toEqual(["orgType", "sector"]);
  });

  it("needs at least one contact, each reachable by phone or email", () => {
    const d = orgDraft();
    expect(validateStep("people", { ...d, contacts: [] }, opts)).toEqual({ contacts: "Add at least one contact person." });
    expect(validateStep("people", { ...d, contacts: [{ ...blankContact(true), name: "Rehema" }] }, opts)).toEqual({ "contacts.0.phone": "Add a phone or an email so we can reach them." });
    expect(validateStep("people", d, opts)).toEqual({});
  });

  it("wants passport-style names and a title when the traveller record is written", () => {
    const d = { ...personDraft(), title: "" as const, firstName: "Dr. Neema" };
    expect(validateStep("personal", d, opts)).toMatchObject({ title: expect.any(String), firstName: expect.stringMatching(/^Letters/) });
    // Editing an older client with no traveller record and no passport: plain names are fine.
    expect(validateStep("personal", { ...d, passportNumber: "" }, { ...opts, mode: "edit" })).toEqual({});
  });

  it("finds the first step with a problem", () => {
    expect(firstInvalidStep({ ...orgDraft(), approver: "" }, opts)).toEqual({ step: "policy", errors: { approver: "Name who approves bookings, or turn approval off." } });
    expect(firstInvalidStep(personDraft(), opts)).toBeNull();
  });
});

describe("draft to commands", () => {
  it("builds an organisation input with the P.O. Box, contacts and policy, credit only for Managers", () => {
    const d = { ...orgDraft(), creditLimitMinor: 500_000, paymentTermsDays: "45" };
    const input = draftToInput(d, { includeCredit: false });
    expect(input).toMatchObject({
      type: "corporate",
      name: "Tumaini Health Trust",
      postalAddress: "P.O. Box 4521",
      poRequired: true,
      travelPolicy: { cabin: "economy", approvalRequired: true, approver: "Juma Said" },
    });
    expect(input.contacts?.map((k) => k.name)).toEqual(["Rehema Ally", "Juma Said"]);
    expect(input.creditLimit).toBeUndefined();
    expect(draftToInput(d, { includeCredit: true })).toMatchObject({ creditLimit: { amountMinor: 500_000, currency: "TZS" }, paymentTermsDays: 45 });
    expect(draftToInput({ ...d, approvalRequired: false }, { includeCredit: false }).travelPolicy?.approver).toBeUndefined();
  });

  it("round-trips: saving an unchanged profile changes nothing", () => {
    const w = createWorld();
    const { clientId } = run(w, createClient, draftToInput(orgDraft(), { includeCredit: false }), "neema");
    const before = w.db.clients[clientId];
    const again = profileDraftFrom(before);
    expect(again.postalAddress).toBe("4521");
    run(w, updateClient, { clientId, patch: draftToPatch(again, { includeCredit: false }) }, "neema");
    expect(w.db.clients[clientId]).toEqual(before);
  });

  it("clears what was emptied and drops the other kind's fields on a switch", () => {
    const w = createWorld();
    const { clientId } = run(w, createClient, draftToInput(orgDraft(), { includeCredit: false }), "neema");
    const d = profileDraftFrom(w.db.clients[clientId]);
    run(w, updateClient, { clientId, patch: draftToPatch({ ...d, departments: [], city: "" }, { includeCredit: false }) }, "neema");
    expect(w.db.clients[clientId].departments).toBeUndefined();
    expect(w.db.clients[clientId].city).toBeUndefined();
    const asPerson = { ...profileDraftFrom(w.db.clients[clientId]), type: "individual" as const, firstName: "Rehema", lastName: "Ally" };
    run(w, updateClient, { clientId, patch: draftToPatch(asPerson, { includeCredit: false }) }, "neema");
    expect(w.db.clients[clientId]).toMatchObject({ type: "individual", name: "Rehema Ally" });
    expect(w.db.clients[clientId].contacts).toBeUndefined();
  });

  it("writes the individual's own traveller once, and only again when it changes", () => {
    const w = createWorld();
    const d = personDraft();
    const { clientId } = run(w, createClient, draftToInput(d, { includeCredit: false }), "neema");
    const t = selfTravellerInput(d, clientId, opts)!;
    expect(t).toMatchObject({ title: "MS", givenName: "Neema", surname: "Joseph", paxType: "ADT", passportNumber: "TZ123456", passportCountry: "TZ", phone: "0754 000 111" });
    const { travellerId } = run(w, upsertTraveller, { traveller: t }, "neema");
    const self = findSelfTraveller(w.db.clients[clientId], Object.values(w.db.travellers))!;
    expect(self.id).toBe(travellerId);
    const edit = profileDraftFrom(w.db.clients[clientId], self);
    expect(edit).toMatchObject({ title: "MS", firstName: "Neema", lastName: "Joseph", passportNumber: "TZ123456", selfTravellerId: travellerId });
    expect(selfTravellerInput(edit, clientId, { ...opts, mode: "edit" }, self)).toBeNull();
    expect(selfTravellerInput({ ...edit, passportExpiry: "2031-01-01" }, clientId, { ...opts, mode: "edit" }, self)).toMatchObject({ id: travellerId, passportExpiry: "2031-01-01" });
  });

  it("works out the passenger type from the date of birth", () => {
    expect(paxTypeFor("2025-01-01", "2026-09-28")).toBe("INF");
    expect(paxTypeFor("2020-09-29", "2026-09-28")).toBe("CHD");
    expect(paxTypeFor("2014-09-28", "2026-09-28")).toBe("ADT");
  });
});
