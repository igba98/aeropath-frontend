import { describe, expect, it } from "vitest";
import { major } from "../money";
import { createBookingFile, createClient, updateClient } from "../commands";
import { formatNida, type CreateClientInput } from "../commands/createClient";
import { newClient } from "./builders";
import { attempt, createWorld, errorOf, run } from "./fixtures";

const org = (over: Partial<CreateClientInput> = {}): CreateClientInput => ({
  type: "corporate",
  name: "Kilimanjaro Mining Ltd",
  phone: "022 211 0000",
  defaultCurrency: "USD",
  orgType: "company",
  sector: "Mining",
  registrationNumber: " 12345 ",
  website: "www.kml.co.tz",
  billingEmail: " Finance@KML.co.tz ",
  postalAddress: "P.O. Box 1234",
  city: "Dar es Salaam",
  region: "Dar es Salaam",
  country: " tz ",
  contacts: [
    { name: "Asha Mrema", role: "Travel coordinator", phone: "0754 111 222", email: "asha@kml.co.tz", canBook: true },
    { name: "John Mushi", role: "Finance manager", phone: "+255 713 000 111", primary: true },
  ],
  departments: ["Finance", " Operations ", "finance", "Geology"],
  travelPolicy: { cabin: "economy", approvalRequired: true, approver: "John Mushi" },
  poRequired: true,
  ...over,
});

describe("organisation clients", () => {
  it("stores the organisation profile with normalised phones, codes and contact ids", () => {
    const w = createWorld();
    const { clientId } = run(w, createClient, org(), "neema");
    const c = w.db.clients[clientId];
    expect(c).toMatchObject({
      type: "corporate",
      phone: "+255222110000",
      orgType: "company",
      sector: "Mining",
      registrationNumber: "12345",
      website: "https://www.kml.co.tz",
      billingEmail: "finance@kml.co.tz",
      postalAddress: "P.O. Box 1234",
      country: "TZ",
      poRequired: true,
      travelPolicy: { cabin: "economy", approvalRequired: true, approver: "John Mushi" },
    });
    expect(c.contacts).toHaveLength(2);
    expect(c.contacts!.every((x) => /^cct_/.test(x.id))).toBe(true);
    expect(new Set(c.contacts!.map((x) => x.id)).size).toBe(2);
    expect(c.contacts![0]).toEqual({ id: c.contacts![0].id, name: "Asha Mrema", role: "Travel coordinator", phone: "+255754111222", email: "asha@kml.co.tz", canBook: true });
    expect(c.contacts![1]).toMatchObject({ phone: "+255713000111", primary: true });
    expect(c.contactPerson).toBe("John Mushi");
    expect(c.departments).toEqual(["Finance", "Operations", "Geology"]);
    expect(w.db.audit.at(-1)?.summary).toBe("Organisation Kilimanjaro Mining Ltd created");
  });

  it("makes the first contact primary when none is marked", () => {
    const w = createWorld();
    const { clientId } = run(w, createClient, org({ contacts: [{ name: "Asha Mrema" }, { name: "John Mushi" }] }), "neema");
    const c = w.db.clients[clientId];
    expect(c.contacts!.map((x) => Boolean(x.primary))).toEqual([true, false]);
    expect(c.contactPerson).toBe("Asha Mrema");
  });

  it("rejects bad contact details, codes and a policy without an approver", () => {
    const w = createWorld();
    expect(errorOf(attempt(w, createClient, org({ contacts: [{ name: "Asha", phone: "123" }] }), "neema")).field).toBe("contacts.0.phone");
    expect(errorOf(attempt(w, createClient, org({ contacts: [{ name: " " }] }), "neema"))).toMatchObject({ field: "contacts.0.name", message: "Contact name is required." });
    expect(errorOf(attempt(w, createClient, org({ country: "Tanzania" }), "neema"))).toMatchObject({ field: "country", message: "Use the 2-letter country code, e.g. TZ." });
    expect(errorOf(attempt(w, createClient, org({ website: "not a site" }), "neema")).field).toBe("website");
    expect(errorOf(attempt(w, createClient, org({ billingEmail: "finance@" }), "neema")).field).toBe("billingEmail");
    expect(errorOf(attempt(w, createClient, org({ travelPolicy: { cabin: "business", approvalRequired: true } }), "neema")).field).toBe("travelPolicy.approver");
  });

  it("keeps credit limits and payment terms Manager only", () => {
    const w = createWorld();
    const input = org({ creditLimit: major(10_000, "USD"), paymentTermsDays: 30 });
    expect(errorOf(attempt(w, createClient, input, "neema"))).toMatchObject({ code: "FORBIDDEN", field: "creditLimit" });
    const { clientId } = run(w, createClient, input, "grace");
    expect(w.db.clients[clientId]).toMatchObject({ creditLimit: major(10_000, "USD"), paymentTermsDays: 30 });
    expect(errorOf(attempt(w, updateClient, { clientId, patch: { paymentTermsDays: 45 } }, "neema")).code).toBe("FORBIDDEN");
  });
});

describe("individual clients", () => {
  const person = (over: Partial<CreateClientInput> = {}): CreateClientInput => ({
    type: "individual",
    name: "Neema Joseph",
    phone: "0754 000 111",
    defaultCurrency: "TZS",
    dateOfBirth: "1990-01-01",
    gender: "F",
    nationality: "tz",
    idType: "nida",
    idNumber: "19900101 12345 00001 12",
    occupation: "Doctor",
    employer: "Muhimbili National Hospital",
    country: "tz",
    emergencyContact: { name: "Joseph Mrema", phone: "0713 222 333", relation: "Father" },
    preferences: { seat: "aisle", meal: "Vegetarian" },
    ...over,
  });

  it("stores personal details with normalised codes, phones and the NIDA number", () => {
    const w = createWorld();
    const { clientId } = run(w, createClient, person(), "neema");
    expect(w.db.clients[clientId]).toMatchObject({
      nationality: "TZ",
      country: "TZ",
      idNumber: "19900101-12345-00001-12",
      emergencyContact: { name: "Joseph Mrema", phone: "+255713222333", relation: "Father" },
      preferences: { seat: "aisle", meal: "Vegetarian" },
    });
    expect(formatNida("1990010112345000011 2")).toBe("19900101-12345-00001-12");
  });

  it("leaves out organisation fields and empty preferences", () => {
    const w = createWorld();
    const { clientId } = run(
      w,
      createClient,
      person({ contacts: [{ name: "Someone" }], departments: ["Finance"], poRequired: true, sector: "Health", preferences: { seat: undefined, meal: "" } }),
      "neema",
    );
    const c = w.db.clients[clientId];
    expect(c.contacts).toBeUndefined();
    expect(c.departments).toBeUndefined();
    expect(c.poRequired).toBeUndefined();
    expect(c.sector).toBeUndefined();
    expect(c.preferences).toBeUndefined();
  });

  it("rejects a future date of birth, an ID number without its type and a short NIDA number", () => {
    const w = createWorld();
    expect(errorOf(attempt(w, createClient, person({ dateOfBirth: "2027-01-01" }), "neema"))).toMatchObject({ field: "dateOfBirth", message: "Date of birth cannot be in the future." });
    expect(errorOf(attempt(w, createClient, person({ idType: undefined }), "neema")).field).toBe("idType");
    expect(errorOf(attempt(w, createClient, person({ idNumber: "12345" }), "neema"))).toMatchObject({ field: "idNumber", message: "A NIDA number has 20 digits." });
    expect(errorOf(attempt(w, createClient, person({ emergencyContact: { name: "Joseph", phone: "" } }), "neema")).field).toBe("emergencyContact.phone");
    expect(errorOf(attempt(w, createClient, person({ creditLimit: major(1, "TZS") }), "grace")).code).toBe("VALIDATION");
  });
});

describe("updating a detailed client", () => {
  it("keeps the new fields on an unrelated edit", () => {
    const w = createWorld();
    const { clientId } = run(w, createClient, org(), "neema");
    const before = w.db.clients[clientId];
    run(w, updateClient, { clientId, patch: { email: "info@kml.co.tz" } }, "neema");
    const after = w.db.clients[clientId];
    expect(after.email).toBe("info@kml.co.tz");
    expect(after.contacts).toEqual(before.contacts);
    expect(after.departments).toEqual(before.departments);
    expect(after.travelPolicy).toEqual(before.travelPolicy);
    expect(after.poRequired).toBe(true);
  });

  it("keeps existing contact ids, numbers new contacts and moves the contact person with the primary", () => {
    const w = createWorld();
    const { clientId } = run(w, createClient, org(), "neema");
    const [asha, john] = w.db.clients[clientId].contacts!;
    run(
      w,
      updateClient,
      {
        clientId,
        patch: {
          contacts: [
            { ...asha, primary: true },
            { ...john, primary: false },
            { id: "cct_forged", name: "Rehema Ally", email: "rehema@kml.co.tz" },
          ],
        },
      },
      "neema",
    );
    const c = w.db.clients[clientId];
    expect(c.contacts!.map((x) => x.id).slice(0, 2)).toEqual([asha.id, john.id]);
    expect(c.contacts![2].id).not.toBe("cct_forged");
    expect(c.contacts![2].id).toMatch(/^cct_/);
    expect(c.contactPerson).toBe("Asha Mrema");
    run(w, updateClient, { clientId, patch: { contacts: null, departments: null, poRequired: null } }, "neema");
    expect(w.db.clients[clientId]).not.toHaveProperty("contacts");
    expect(w.db.clients[clientId]).not.toHaveProperty("departments");
    expect(w.db.clients[clientId]).not.toHaveProperty("poRequired");
  });

  it("drops organisation fields when the client becomes an individual", () => {
    const w = createWorld();
    const { clientId } = run(w, createClient, org(), "neema");
    run(w, updateClient, { clientId, patch: { type: "individual", name: "Asha Mrema", nationality: "ke" } }, "neema");
    const c = w.db.clients[clientId];
    expect(c.type).toBe("individual");
    expect(c.nationality).toBe("KE");
    expect(c.contacts).toBeUndefined();
    expect(c.travelPolicy).toBeUndefined();
    expect(c.sector).toBeUndefined();
  });
});

describe("organisation bookings", () => {
  it("record the PO or reference and the cost centre, trimmed", () => {
    const w = createWorld();
    const { clientId, travellerIds } = newClient(w, { type: "corporate" });
    const { fileId } = run(w, createBookingFile, { clientId, currency: "USD", source: "corporate", travellerIds, reference: "  PO-2026-114 ", costCentre: " Finance " }, "neema");
    expect(w.db.files[fileId]).toMatchObject({ reference: "PO-2026-114", costCentre: "Finance" });
    const blank = run(w, createBookingFile, { clientId, currency: "USD", source: "corporate", travellerIds, reference: " ", costCentre: "" }, "neema");
    expect(w.db.files[blank.fileId]).not.toHaveProperty("reference");
    expect(w.db.files[blank.fileId]).not.toHaveProperty("costCentre");
    expect(errorOf(attempt(w, createBookingFile, { clientId, currency: "USD", source: "corporate", travellerIds, reference: "x".repeat(81) }, "neema")).field).toBe("reference");
  });
});
