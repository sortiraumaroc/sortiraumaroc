import { describe, expect, it } from "vitest";

import { buildBookingPrefillPatch } from "./bookingPrefill";

describe("buildBookingPrefillPatch", () => {
  it("prefills all empty fields when untouched and profile has values", () => {
    const patch = buildBookingPrefillPatch({
      current: { firstName: "", lastName: "", email: "", phone: "" },
      touched: { firstName: false, lastName: false, email: false, phone: false },
      me: {
        id: "u1",
        first_name: "Salah",
        last_name: "Eddine",
        phone: "+212600000000",
        email: "salah@example.com",
        date_of_birth: null,
        city: null,
        country: null,
        socio_professional_status: null,
      },
    });

    expect(patch).toEqual({
      firstName: "Salah",
      lastName: "Eddine",
      phone: "+212600000000",
      email: "salah@example.com",
    });
  });

  it("does not prefill email when profile email is missing", () => {
    const patch = buildBookingPrefillPatch({
      current: { firstName: "", lastName: "", email: "", phone: "" },
      touched: { firstName: false, lastName: false, email: false, phone: false },
      me: { id: "u1", first_name: "Salah", last_name: "Eddine", phone: "+2126", email: null, date_of_birth: null, city: null, country: null, socio_professional_status: null },
    });

    expect(patch).toEqual({ firstName: "Salah", lastName: "Eddine", phone: "+2126" });
  });

  it("never overwrites user input when a field is touched", () => {
    const patch = buildBookingPrefillPatch({
      current: { firstName: "", lastName: "", email: "", phone: "0612345678" },
      touched: { firstName: false, lastName: false, email: false, phone: true },
      me: {
        id: "u1",
        first_name: "Salah",
        last_name: "Eddine",
        phone: "+212600000000",
        email: "salah@example.com",
        date_of_birth: null,
        city: null,
        country: null,
        socio_professional_status: null,
      },
    });

    expect(patch.phone).toBeUndefined();
    expect(patch.firstName).toBe("Salah");
  });

  it("never overwrites user input when field already has a value (even if not marked touched)", () => {
    const patch = buildBookingPrefillPatch({
      current: { firstName: "Ali", lastName: "", email: "", phone: "" },
      touched: { firstName: false, lastName: false, email: false, phone: false },
      me: {
        id: "u1",
        first_name: "Salah",
        last_name: "Eddine",
        phone: "+212600000000",
        email: "salah@example.com",
        date_of_birth: null,
        city: null,
        country: null,
        socio_professional_status: null,
      },
    });

    expect(patch.firstName).toBeUndefined();
    expect(patch.lastName).toBe("Eddine");
  });
});
