import { describe, it, expect } from "vitest";
import {
  createAgreementSchema,
  updateAgreementSchema,
  createAgreementLineSchema,
  updateAgreementLineSchema,
  partnershipListQuerySchema,
} from "../partnership";

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";
const VALID_UUID_2 = "660e8400-e29b-41d4-a716-446655440001";

// ============================================
// createAgreementSchema
// ============================================

describe("createAgreementSchema", () => {
  it("should accept valid input with all required fields", () => {
    const input = { establishment_id: VALID_UUID };
    const result = createAgreementSchema.parse(input);
    expect(result.establishment_id).toBe(VALID_UUID);
  });

  it("should accept valid input with all optional fields populated", () => {
    const input = {
      establishment_id: VALID_UUID,
      contact_name: "Ahmed Benali",
      contact_email: "ahmed@example.com",
      contact_phone: "+212600000000",
      start_date: "2026-03-01",
      end_date: "2026-12-31",
      commission_rate: 15,
      notes: "Partenariat premium",
      lines: [
        {
          advantage_type: "percentage" as const,
          advantage_value: 10,
        },
      ],
    };

    const result = createAgreementSchema.parse(input);
    expect(result.contact_name).toBe("Ahmed Benali");
    expect(result.contact_email).toBe("ahmed@example.com");
    expect(result.commission_rate).toBe(15);
    expect(result.lines).toHaveLength(1);
  });

  it("should reject missing establishment_id", () => {
    expect(() => createAgreementSchema.parse({})).toThrow();
  });

  it("should reject invalid UUID for establishment_id", () => {
    expect(() =>
      createAgreementSchema.parse({ establishment_id: "not-a-uuid" }),
    ).toThrow("UUID");
  });

  it("should reject invalid email format", () => {
    expect(() =>
      createAgreementSchema.parse({
        establishment_id: VALID_UUID,
        contact_email: "bad-email",
      }),
    ).toThrow("Email invalide");
  });

  it("should reject contact_name exceeding 200 characters", () => {
    expect(() =>
      createAgreementSchema.parse({
        establishment_id: VALID_UUID,
        contact_name: "A".repeat(201),
      }),
    ).toThrow();
  });

  it("should reject contact_phone exceeding 20 characters", () => {
    expect(() =>
      createAgreementSchema.parse({
        establishment_id: VALID_UUID,
        contact_phone: "0".repeat(21),
      }),
    ).toThrow();
  });

  it("should reject invalid date format for start_date", () => {
    expect(() =>
      createAgreementSchema.parse({
        establishment_id: VALID_UUID,
        start_date: "01/03/2026",
      }),
    ).toThrow("Format date invalide");
  });

  it("should reject commission_rate above 100", () => {
    expect(() =>
      createAgreementSchema.parse({
        establishment_id: VALID_UUID,
        commission_rate: 101,
      }),
    ).toThrow();
  });

  it("should reject negative commission_rate", () => {
    expect(() =>
      createAgreementSchema.parse({
        establishment_id: VALID_UUID,
        commission_rate: -1,
      }),
    ).toThrow();
  });

  it("should accept null for all nullable optional fields", () => {
    const input = {
      establishment_id: VALID_UUID,
      contact_name: null,
      contact_email: null,
      contact_phone: null,
      start_date: null,
      end_date: null,
      commission_rate: null,
      notes: null,
    };

    const result = createAgreementSchema.parse(input);
    expect(result.contact_name).toBeNull();
    expect(result.commission_rate).toBeNull();
  });

  it("should reject notes exceeding 5000 characters", () => {
    expect(() =>
      createAgreementSchema.parse({
        establishment_id: VALID_UUID,
        notes: "x".repeat(5001),
      }),
    ).toThrow();
  });
});

// ============================================
// updateAgreementSchema
// ============================================

describe("updateAgreementSchema", () => {
  it("should accept a valid partial update", () => {
    const input = { contact_name: "Nouveau Nom" };
    const result = updateAgreementSchema.parse(input);
    expect(result.contact_name).toBe("Nouveau Nom");
  });

  it("should accept valid status enum values", () => {
    const statuses = [
      "draft",
      "proposal_sent",
      "in_negotiation",
      "active",
      "suspended",
      "expired",
      "refused",
    ] as const;

    for (const status of statuses) {
      const result = updateAgreementSchema.parse({ status });
      expect(result.status).toBe(status);
    }
  });

  it("should reject invalid status value", () => {
    expect(() =>
      updateAgreementSchema.parse({ status: "unknown_status" }),
    ).toThrow();
  });

  it("should not accept establishment_id (omitted from update)", () => {
    const result = updateAgreementSchema.parse({
      establishment_id: VALID_UUID,
    } as any);
    expect((result as any).establishment_id).toBeUndefined();
  });

  it("should accept an empty object (all fields optional)", () => {
    const result = updateAgreementSchema.parse({});
    expect(result).toEqual({});
  });
});

// ============================================
// createAgreementLineSchema
// ============================================

describe("createAgreementLineSchema", () => {
  it("should accept valid input with required field and apply defaults", () => {
    const input = { advantage_type: "percentage" as const };
    const result = createAgreementLineSchema.parse(input);
    expect(result.advantage_type).toBe("percentage");
    expect(result.module).toBe("ce"); // default
    expect(result.max_uses_per_employee).toBe(0); // default
    expect(result.max_uses_total).toBe(0); // default
    expect(result.sort_order).toBe(0); // default
    expect(result.target_companies).toBe("all"); // default
  });

  it("should accept all valid advantage_type enum values", () => {
    const types = ["percentage", "fixed", "special_offer", "gift", "pack"] as const;
    for (const t of types) {
      const result = createAgreementLineSchema.parse({ advantage_type: t });
      expect(result.advantage_type).toBe(t);
    }
  });

  it("should reject invalid advantage_type", () => {
    expect(() =>
      createAgreementLineSchema.parse({ advantage_type: "free_stuff" }),
    ).toThrow();
  });

  it("should accept all valid module enum values", () => {
    const modules = ["ce", "conciergerie", "both"] as const;
    for (const m of modules) {
      const result = createAgreementLineSchema.parse({
        advantage_type: "percentage",
        module: m,
      });
      expect(result.module).toBe(m);
    }
  });

  it("should reject negative advantage_value", () => {
    expect(() =>
      createAgreementLineSchema.parse({
        advantage_type: "fixed",
        advantage_value: -5,
      }),
    ).toThrow();
  });

  it("should reject description exceeding 1000 characters", () => {
    expect(() =>
      createAgreementLineSchema.parse({
        advantage_type: "percentage",
        description: "d".repeat(1001),
      }),
    ).toThrow();
  });

  it("should reject conditions exceeding 2000 characters", () => {
    expect(() =>
      createAgreementLineSchema.parse({
        advantage_type: "percentage",
        conditions: "c".repeat(2001),
      }),
    ).toThrow();
  });

  it("should accept target_companies as 'all'", () => {
    const result = createAgreementLineSchema.parse({
      advantage_type: "percentage",
      target_companies: "all",
    });
    expect(result.target_companies).toBe("all");
  });

  it("should accept target_companies as array of UUIDs", () => {
    const result = createAgreementLineSchema.parse({
      advantage_type: "percentage",
      target_companies: [VALID_UUID, VALID_UUID_2],
    });
    expect(result.target_companies).toEqual([VALID_UUID, VALID_UUID_2]);
  });

  it("should reject target_companies with invalid UUID in array", () => {
    expect(() =>
      createAgreementLineSchema.parse({
        advantage_type: "percentage",
        target_companies: [VALID_UUID, "bad-uuid"],
      }),
    ).toThrow();
  });

  it("should accept valid sam_commission_type enum values", () => {
    for (const t of ["percentage", "fixed"] as const) {
      const result = createAgreementLineSchema.parse({
        advantage_type: "percentage",
        sam_commission_type: t,
        sam_commission_value: 5,
      });
      expect(result.sam_commission_type).toBe(t);
    }
  });

  it("should reject non-integer max_uses_per_employee", () => {
    expect(() =>
      createAgreementLineSchema.parse({
        advantage_type: "percentage",
        max_uses_per_employee: 2.5,
      }),
    ).toThrow();
  });

  it("should reject invalid date format in line start_date", () => {
    expect(() =>
      createAgreementLineSchema.parse({
        advantage_type: "percentage",
        start_date: "2026/03/01",
      }),
    ).toThrow("Format date invalide");
  });
});

// ============================================
// updateAgreementLineSchema
// ============================================

describe("updateAgreementLineSchema", () => {
  it("should accept an empty object (all fields optional via partial)", () => {
    const result = updateAgreementLineSchema.parse({});
    expect(result).toEqual({});
  });

  it("should accept is_active boolean field", () => {
    const result = updateAgreementLineSchema.parse({ is_active: false });
    expect(result.is_active).toBe(false);
  });

  it("should reject is_active with non-boolean value", () => {
    expect(() =>
      updateAgreementLineSchema.parse({ is_active: "yes" }),
    ).toThrow();
  });
});

// ============================================
// partnershipListQuerySchema
// ============================================

describe("partnershipListQuerySchema", () => {
  it("should apply defaults for page, limit, and order", () => {
    const result = partnershipListQuerySchema.parse({});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.order).toBe("desc");
  });

  it("should coerce string numbers for page and limit", () => {
    const result = partnershipListQuerySchema.parse({
      page: "3",
      limit: "50",
    });
    expect(result.page).toBe(3);
    expect(result.limit).toBe(50);
  });

  it("should reject page less than 1", () => {
    expect(() =>
      partnershipListQuerySchema.parse({ page: 0 }),
    ).toThrow();
  });

  it("should reject limit greater than 100", () => {
    expect(() =>
      partnershipListQuerySchema.parse({ limit: 101 }),
    ).toThrow();
  });

  it("should accept valid module filter", () => {
    const result = partnershipListQuerySchema.parse({ module: "conciergerie" });
    expect(result.module).toBe("conciergerie");
  });

  it("should reject invalid module filter value", () => {
    expect(() =>
      partnershipListQuerySchema.parse({ module: "invalid" }),
    ).toThrow();
  });

  it("should accept optional search and status strings", () => {
    const result = partnershipListQuerySchema.parse({
      search: "hotel royal",
      status: "active",
    });
    expect(result.search).toBe("hotel royal");
    expect(result.status).toBe("active");
  });

  it("should reject invalid order value", () => {
    expect(() =>
      partnershipListQuerySchema.parse({ order: "random" }),
    ).toThrow();
  });
});
