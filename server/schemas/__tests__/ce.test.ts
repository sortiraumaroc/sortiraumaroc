import { describe, it, expect } from "vitest";
import {
  createCompanySchema,
  createAdvantageSchema,
  validateScanSchema,
  ceListQuerySchema,
} from "../ce";

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

// =============================================================================
// createCompanySchema
// =============================================================================

describe("createCompanySchema", () => {
  it("accepts valid minimal input (name only)", () => {
    const result = createCompanySchema.parse({ name: "SAM Corp" });
    expect(result.name).toBe("SAM Corp");
  });

  it("accepts valid full input", () => {
    const result = createCompanySchema.parse({
      name: "SAM Corp",
      ice_siret: "ICE12345",
      address: "123 Rue Mohammed V",
      sector: "Tech",
      estimated_employees: 50,
      contact_name: "Ahmed",
      contact_email: "ahmed@example.com",
      contact_phone: "+212612345678",
    });
    expect(result.contact_email).toBe("ahmed@example.com");
  });

  it("rejects name too short (< 2 chars)", () => {
    expect(() => createCompanySchema.parse({ name: "A" })).toThrow();
  });

  it("trims name whitespace", () => {
    const result = createCompanySchema.parse({ name: "  SAM Corp  " });
    expect(result.name).toBe("SAM Corp");
  });
});

// =============================================================================
// createAdvantageSchema
// =============================================================================

describe("createAdvantageSchema", () => {
  it("accepts valid input", () => {
    const result = createAdvantageSchema.parse({
      establishment_id: VALID_UUID,
      advantage_type: "percentage",
      advantage_value: 10,
    });
    expect(result.advantage_type).toBe("percentage");
  });

  it("accepts target_companies 'all'", () => {
    const result = createAdvantageSchema.parse({
      establishment_id: VALID_UUID,
      advantage_type: "gift",
    });
    expect(result.target_companies).toBe("all"); // default
  });

  it("accepts target_companies as UUID array", () => {
    const result = createAdvantageSchema.parse({
      establishment_id: VALID_UUID,
      advantage_type: "fixed",
      target_companies: [VALID_UUID],
    });
    expect(result.target_companies).toEqual([VALID_UUID]);
  });

  it("rejects invalid advantage_type", () => {
    expect(() =>
      createAdvantageSchema.parse({
        establishment_id: VALID_UUID,
        advantage_type: "unknown",
      }),
    ).toThrow();
  });
});

// =============================================================================
// validateScanSchema
// =============================================================================

describe("validateScanSchema", () => {
  it("accepts valid input", () => {
    const result = validateScanSchema.parse({
      qr_payload: "payload123",
      establishment_id: VALID_UUID,
    });
    expect(result.qr_payload).toBe("payload123");
  });

  it("rejects missing qr_payload", () => {
    expect(() =>
      validateScanSchema.parse({ establishment_id: VALID_UUID }),
    ).toThrow();
  });

  it("rejects missing establishment_id", () => {
    expect(() =>
      validateScanSchema.parse({ qr_payload: "payload123" }),
    ).toThrow();
  });
});

// =============================================================================
// ceListQuerySchema
// =============================================================================

describe("ceListQuerySchema", () => {
  it("applies defaults", () => {
    const result = ceListQuerySchema.parse({});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.order).toBe("desc");
  });

  it("coerces strings to numbers", () => {
    const result = ceListQuerySchema.parse({ page: "3", limit: "50" });
    expect(result.page).toBe(3);
    expect(result.limit).toBe(50);
  });
});
