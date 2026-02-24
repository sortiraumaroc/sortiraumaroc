import { describe, it, expect } from "vitest";
import {
  createReservationSchema,
  createPublicReservationSchema,
  updateReservationProSchema,
  reservationFiltersSchema,
} from "../reservation";

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

// =============================================================================
// createReservationSchema
// =============================================================================

describe("createReservationSchema", () => {
  it("accepts valid input with establishment_id", () => {
    const result = createReservationSchema.parse({
      establishment_id: VALID_UUID,
      starts_at: "2026-03-15T19:00:00Z",
    });
    expect(result.establishment_id).toBe(VALID_UUID);
  });

  it("accepts valid input with establishmentId (camelCase)", () => {
    const result = createReservationSchema.parse({
      establishmentId: VALID_UUID,
      starts_at: "2026-03-15T19:00:00Z",
    });
    expect(result.establishmentId).toBe(VALID_UUID);
  });

  it("rejects missing both establishment_id and establishmentId", () => {
    expect(() =>
      createReservationSchema.parse({
        starts_at: "2026-03-15T19:00:00Z",
      }),
    ).toThrow();
  });

  it("rejects missing both starts_at and startsAt", () => {
    expect(() =>
      createReservationSchema.parse({
        establishment_id: VALID_UUID,
      }),
    ).toThrow();
  });

  it("applies default kind and status", () => {
    const result = createReservationSchema.parse({
      establishment_id: VALID_UUID,
      starts_at: "2026-03-15T19:00:00Z",
    });
    expect(result.kind).toBe("restaurant");
    expect(result.status).toBe("requested");
  });
});

// =============================================================================
// createPublicReservationSchema
// =============================================================================

describe("createPublicReservationSchema", () => {
  const validPublic = {
    establishment_id: VALID_UUID,
    starts_at: "2026-03-15T19:00:00Z",
    customer_name: "Ahmed Benali",
    customer_phone: "+212612345678",
  };

  it("accepts valid input", () => {
    const result = createPublicReservationSchema.parse(validPublic);
    expect(result.customer_name).toBe("Ahmed Benali");
  });

  it("rejects missing customer_name and customerName", () => {
    const { customer_name, ...rest } = validPublic;
    expect(() => createPublicReservationSchema.parse(rest)).toThrow();
  });

  it("rejects missing customer_phone and customerPhone", () => {
    const { customer_phone, ...rest } = validPublic;
    expect(() => createPublicReservationSchema.parse(rest)).toThrow();
  });
});

// =============================================================================
// updateReservationProSchema
// =============================================================================

describe("updateReservationProSchema", () => {
  it("accepts valid partial update", () => {
    const result = updateReservationProSchema.parse({ party_size: 6 });
    expect(result.party_size).toBe(6);
  });

  it("accepts valid status enum", () => {
    const result = updateReservationProSchema.parse({ status: "confirmed" });
    expect(result.status).toBe("confirmed");
  });

  it("rejects invalid status", () => {
    expect(() =>
      updateReservationProSchema.parse({ status: "unknown" }),
    ).toThrow();
  });
});

// =============================================================================
// reservationFiltersSchema
// =============================================================================

describe("reservationFiltersSchema", () => {
  it("applies defaults", () => {
    const result = reservationFiltersSchema.parse({});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it("accepts all filters", () => {
    const result = reservationFiltersSchema.parse({
      establishment_id: VALID_UUID,
      status: "confirmed,pending",
      date_from: "2026-03-01",
      date_to: "2026-03-31",
      search: "Ahmed",
      page: "2",
      limit: "50",
    });
    expect(result.page).toBe(2);
    expect(result.search).toBe("Ahmed");
  });
});
