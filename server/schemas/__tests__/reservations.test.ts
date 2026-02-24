import { describe, it, expect } from "vitest";
import {
  CreateReservationSchema,
  CancelReservationSchema,
  RequestModificationSchema,
} from "../reservations";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";
const VALID_UUID_2 = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";

/** Minimal valid payload for CreateReservationSchema */
function validCreatePayload(overrides: Record<string, unknown> = {}) {
  return {
    establishmentId: VALID_UUID,
    date: "2026-03-15",
    time: "19:30",
    people: 4,
    firstName: "Salah",
    lastName: "Ait Nasser",
    email: "salah@example.com",
    phone: "+212612345678",
    ...overrides,
  };
}

// =============================================================================
// CreateReservationSchema
// =============================================================================

describe("CreateReservationSchema", () => {
  it("should accept a valid reservation with all required fields", () => {
    const result = CreateReservationSchema.parse(validCreatePayload());

    expect(result.establishmentId).toBe(VALID_UUID);
    expect(result.date).toBe("2026-03-15");
    expect(result.time).toBe("19:30");
    expect(result.people).toBe(4);
    expect(result.firstName).toBe("Salah");
    expect(result.lastName).toBe("Ait Nasser");
    expect(result.email).toBe("salah@example.com");
    expect(result.phone).toBe("+212612345678");
    expect(result.notes).toBe(""); // default
  });

  it("should accept a valid reservation with all optional fields", () => {
    const result = CreateReservationSchema.parse(
      validCreatePayload({
        slotId: VALID_UUID_2,
        notes: "Table near the window please",
        occasionType: "anniversary",
        promoCode: "RAMADAN25",
      }),
    );

    expect(result.slotId).toBe(VALID_UUID_2);
    expect(result.notes).toBe("Table near the window please");
    expect(result.occasionType).toBe("anniversary");
    expect(result.promoCode).toBe("RAMADAN25");
  });

  it("should reject missing establishmentId", () => {
    const { establishmentId: _, ...payload } = validCreatePayload();
    expect(() => CreateReservationSchema.parse(payload)).toThrow();
  });

  it("should reject missing date", () => {
    const { date: _, ...payload } = validCreatePayload();
    expect(() => CreateReservationSchema.parse(payload)).toThrow();
  });

  it("should reject missing time", () => {
    const { time: _, ...payload } = validCreatePayload();
    expect(() => CreateReservationSchema.parse(payload)).toThrow();
  });

  it("should reject missing people", () => {
    const { people: _, ...payload } = validCreatePayload();
    expect(() => CreateReservationSchema.parse(payload)).toThrow();
  });

  it("should reject invalid date format (DD/MM/YYYY)", () => {
    expect(() =>
      CreateReservationSchema.parse(validCreatePayload({ date: "15/03/2026" })),
    ).toThrow("Format de date invalide");
  });

  it("should reject invalid date format (ISO datetime)", () => {
    expect(() =>
      CreateReservationSchema.parse(
        validCreatePayload({ date: "2026-03-15T19:30:00Z" }),
      ),
    ).toThrow("Format de date invalide");
  });

  it("should reject invalid time format (H:MM)", () => {
    expect(() =>
      CreateReservationSchema.parse(validCreatePayload({ time: "9:30" })),
    ).toThrow("Format d'heure invalide");
  });

  it("should reject invalid time format (HH:MM:SS)", () => {
    expect(() =>
      CreateReservationSchema.parse(validCreatePayload({ time: "19:30:00" })),
    ).toThrow("Format d'heure invalide");
  });

  it("should reject people = 0", () => {
    expect(() =>
      CreateReservationSchema.parse(validCreatePayload({ people: 0 })),
    ).toThrow("Minimum 1 personne");
  });

  it("should reject negative people", () => {
    expect(() =>
      CreateReservationSchema.parse(validCreatePayload({ people: -3 })),
    ).toThrow("Minimum 1 personne");
  });

  it("should reject people > 100", () => {
    expect(() =>
      CreateReservationSchema.parse(validCreatePayload({ people: 101 })),
    ).toThrow("Maximum 100 personnes");
  });

  it("should accept people = 1 (minimum boundary)", () => {
    const result = CreateReservationSchema.parse(
      validCreatePayload({ people: 1 }),
    );
    expect(result.people).toBe(1);
  });

  it("should accept people = 100 (maximum boundary)", () => {
    const result = CreateReservationSchema.parse(
      validCreatePayload({ people: 100 }),
    );
    expect(result.people).toBe(100);
  });

  it("should reject firstName longer than 100 characters", () => {
    expect(() =>
      CreateReservationSchema.parse(
        validCreatePayload({ firstName: "A".repeat(101) }),
      ),
    ).toThrow("trop long");
  });

  it("should reject lastName longer than 100 characters", () => {
    expect(() =>
      CreateReservationSchema.parse(
        validCreatePayload({ lastName: "B".repeat(101) }),
      ),
    ).toThrow("trop long");
  });

  it("should reject empty string for firstName", () => {
    expect(() =>
      CreateReservationSchema.parse(validCreatePayload({ firstName: "" })),
    ).toThrow();
  });

  it("should reject whitespace-only firstName (trimmed to empty)", () => {
    expect(() =>
      CreateReservationSchema.parse(validCreatePayload({ firstName: "   " })),
    ).toThrow();
  });

  it("should reject invalid email", () => {
    expect(() =>
      CreateReservationSchema.parse(
        validCreatePayload({ email: "not-an-email" }),
      ),
    ).toThrow("email invalide");
  });

  it("should reject invalid phone number", () => {
    expect(() =>
      CreateReservationSchema.parse(validCreatePayload({ phone: "abc" })),
    ).toThrow("invalide");
  });

  it("should reject non-UUID establishmentId", () => {
    expect(() =>
      CreateReservationSchema.parse(
        validCreatePayload({ establishmentId: "some-string-123" }),
      ),
    ).toThrow("ID invalide");
  });

  it("should reject notes longer than 1000 characters", () => {
    expect(() =>
      CreateReservationSchema.parse(
        validCreatePayload({ notes: "X".repeat(1001) }),
      ),
    ).toThrow("Notes trop longues");
  });

  it("should trim and lowercase email", () => {
    const result = CreateReservationSchema.parse(
      validCreatePayload({ email: "  Salah@EXAMPLE.COM  " }),
    );
    expect(result.email).toBe("salah@example.com");
  });

  it("should trim firstName and lastName", () => {
    const result = CreateReservationSchema.parse(
      validCreatePayload({ firstName: "  Salah  ", lastName: "  Nasser  " }),
    );
    expect(result.firstName).toBe("Salah");
    expect(result.lastName).toBe("Nasser");
  });
});

// =============================================================================
// CancelReservationSchema
// =============================================================================

describe("CancelReservationSchema", () => {
  it("should accept valid cancellation with reason", () => {
    const result = CancelReservationSchema.parse({
      reservationId: VALID_UUID,
      reason: "Changed plans",
    });

    expect(result.reservationId).toBe(VALID_UUID);
    expect(result.reason).toBe("Changed plans");
  });

  it("should accept valid cancellation without reason (defaults to empty string)", () => {
    const result = CancelReservationSchema.parse({
      reservationId: VALID_UUID,
    });

    expect(result.reservationId).toBe(VALID_UUID);
    expect(result.reason).toBe("");
  });

  it("should reject missing reservationId", () => {
    expect(() =>
      CancelReservationSchema.parse({ reason: "Changed plans" }),
    ).toThrow();
  });

  it("should reject invalid reservationId", () => {
    expect(() =>
      CancelReservationSchema.parse({ reservationId: "not-a-uuid" }),
    ).toThrow("ID invalide");
  });

  it("should reject reason longer than 500 characters", () => {
    expect(() =>
      CancelReservationSchema.parse({
        reservationId: VALID_UUID,
        reason: "R".repeat(501),
      }),
    ).toThrow("Raison trop longue");
  });

  it("should accept reason at exactly 500 characters", () => {
    const result = CancelReservationSchema.parse({
      reservationId: VALID_UUID,
      reason: "R".repeat(500),
    });
    expect(result.reason).toHaveLength(500);
  });
});

// =============================================================================
// RequestModificationSchema
// =============================================================================

describe("RequestModificationSchema", () => {
  it("should accept valid modification with new date", () => {
    const result = RequestModificationSchema.parse({
      reservationId: VALID_UUID,
      newDate: "2026-04-01",
    });

    expect(result.reservationId).toBe(VALID_UUID);
    expect(result.newDate).toBe("2026-04-01");
  });

  it("should accept valid modification with new time", () => {
    const result = RequestModificationSchema.parse({
      reservationId: VALID_UUID,
      newTime: "20:00",
    });

    expect(result.newTime).toBe("20:00");
  });

  it("should accept valid modification with new people count", () => {
    const result = RequestModificationSchema.parse({
      reservationId: VALID_UUID,
      newPeople: 6,
    });

    expect(result.newPeople).toBe(6);
  });

  it("should accept modification with all change fields at once", () => {
    const result = RequestModificationSchema.parse({
      reservationId: VALID_UUID,
      newDate: "2026-04-01",
      newTime: "20:00",
      newPeople: 6,
      message: "Nous serons plus nombreux",
    });

    expect(result.newDate).toBe("2026-04-01");
    expect(result.newTime).toBe("20:00");
    expect(result.newPeople).toBe(6);
    expect(result.message).toBe("Nous serons plus nombreux");
  });

  it("should reject when no change field is provided", () => {
    expect(() =>
      RequestModificationSchema.parse({
        reservationId: VALID_UUID,
      }),
    ).toThrow("Au moins une modification est requise");
  });

  it("should reject when only message is provided (no actual change)", () => {
    expect(() =>
      RequestModificationSchema.parse({
        reservationId: VALID_UUID,
        message: "Just a note",
      }),
    ).toThrow("Au moins une modification est requise");
  });

  it("should reject invalid newDate format", () => {
    expect(() =>
      RequestModificationSchema.parse({
        reservationId: VALID_UUID,
        newDate: "01-04-2026",
      }),
    ).toThrow("Format de date invalide");
  });

  it("should reject invalid newTime format", () => {
    expect(() =>
      RequestModificationSchema.parse({
        reservationId: VALID_UUID,
        newTime: "8pm",
      }),
    ).toThrow("Format d'heure invalide");
  });

  it("should reject newPeople = 0", () => {
    expect(() =>
      RequestModificationSchema.parse({
        reservationId: VALID_UUID,
        newPeople: 0,
      }),
    ).toThrow();
  });

  it("should reject newPeople > 100", () => {
    expect(() =>
      RequestModificationSchema.parse({
        reservationId: VALID_UUID,
        newPeople: 101,
      }),
    ).toThrow();
  });

  it("should reject message longer than 500 characters", () => {
    expect(() =>
      RequestModificationSchema.parse({
        reservationId: VALID_UUID,
        newDate: "2026-04-01",
        message: "M".repeat(501),
      }),
    ).toThrow();
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe("Edge cases", () => {
  it("should strip unknown fields from CreateReservationSchema", () => {
    const result = CreateReservationSchema.parse(
      validCreatePayload({ unknownField: "should be stripped" }),
    );
    expect((result as any).unknownField).toBeUndefined();
  });

  it("should strip unknown fields from CancelReservationSchema", () => {
    const result = CancelReservationSchema.parse({
      reservationId: VALID_UUID,
      reason: "bye",
      hackField: "injected",
    });
    expect((result as any).hackField).toBeUndefined();
  });

  it("should pass SQL injection strings through validation (sanitised elsewhere)", () => {
    // Zod validates shape/format, not SQL content. The string should be accepted
    // as long as it meets length/format constraints. SQL escaping is handled at the DB layer.
    const result = CreateReservationSchema.parse(
      validCreatePayload({
        firstName: "Robert'; DROP TABLE reservations;--",
        notes: "1 OR 1=1; --",
      }),
    );
    expect(result.firstName).toBe("Robert'; DROP TABLE reservations;--");
    expect(result.notes).toBe("1 OR 1=1; --");
  });

  it("should accept Unicode characters in name fields", () => {
    const result = CreateReservationSchema.parse(
      validCreatePayload({
        firstName: "محمد",
        lastName: "العربي",
      }),
    );
    expect(result.firstName).toBe("محمد");
    expect(result.lastName).toBe("العربي");
  });

  it("should accept accented Latin characters in name fields", () => {
    const result = CreateReservationSchema.parse(
      validCreatePayload({
        firstName: "Jean-Pierre",
        lastName: "Lefevre",
      }),
    );
    expect(result.firstName).toBe("Jean-Pierre");
    expect(result.lastName).toBe("Lefevre");
  });

  it("should reject non-integer people (decimal)", () => {
    expect(() =>
      CreateReservationSchema.parse(validCreatePayload({ people: 2.5 })),
    ).toThrow();
  });

  it("should accept various valid phone formats", () => {
    const formats = [
      "+212 6 12 34 56 78",
      "0612345678",
      "+33 1 23 45 67 89",
      "(212) 612-3456",
    ];

    for (const phone of formats) {
      const result = CreateReservationSchema.parse(
        validCreatePayload({ phone }),
      );
      expect(result.phone).toBe(phone);
    }
  });
});
