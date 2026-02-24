import { describe, it, expect } from "vitest";
import {
  uuidSchema,
  emailSchema,
  phoneMarocSchema,
  phoneInternationalSchema,
  dateIsoSchema,
  dateTimeIsoSchema,
  timeSchema,
  timeSlotSchema,
  nameSchema,
  titleSchema,
  slugSchema,
  priceCentsSchema,
  guestsSchema,
  ratingSchema,
  percentageSchema,
  coordinatesSchema,
  universeSchema,
  reservationStatusSchema,
  proRoleSchema,
  paginationSchema,
  makePartialExcept,
  emptyStringToUndefined,
} from "../common";
import { z } from "zod";

const VALID_UUID = "550e8400-e29b-41d4-a716-446655440000";

// =============================================================================
// uuidSchema
// =============================================================================

describe("uuidSchema", () => {
  it("accepts a valid UUID v4", () => {
    expect(uuidSchema.parse(VALID_UUID)).toBe(VALID_UUID);
  });

  it("rejects an invalid string", () => {
    expect(() => uuidSchema.parse("not-a-uuid")).toThrow();
  });

  it("rejects an empty string", () => {
    expect(() => uuidSchema.parse("")).toThrow();
  });
});

// =============================================================================
// emailSchema
// =============================================================================

describe("emailSchema", () => {
  it("accepts and normalizes a valid email (uppercase → lowercase)", () => {
    expect(emailSchema.parse("ADMIN@SAM.MA")).toBe("admin@sam.ma");
  });

  it("rejects an invalid email", () => {
    expect(() => emailSchema.parse("not-an-email")).toThrow();
  });
});

// =============================================================================
// phoneMarocSchema
// =============================================================================

describe("phoneMarocSchema", () => {
  it("accepts +212 format", () => {
    expect(phoneMarocSchema.parse("+212612345678")).toBe("+212612345678");
  });

  it("accepts 06 format", () => {
    expect(phoneMarocSchema.parse("0612345678")).toBe("0612345678");
  });

  it("accepts 07 format", () => {
    expect(phoneMarocSchema.parse("0712345678")).toBe("0712345678");
  });

  it("accepts 05 format", () => {
    expect(phoneMarocSchema.parse("0512345678")).toBe("0512345678");
  });

  it("rejects too short number", () => {
    expect(() => phoneMarocSchema.parse("061234")).toThrow();
  });

  it("rejects number with letters", () => {
    expect(() => phoneMarocSchema.parse("06abcdefgh")).toThrow();
  });

  it("rejects wrong prefix", () => {
    expect(() => phoneMarocSchema.parse("0312345678")).toThrow();
  });
});

// =============================================================================
// phoneInternationalSchema
// =============================================================================

describe("phoneInternationalSchema", () => {
  it("accepts a valid international number", () => {
    expect(phoneInternationalSchema.parse("+33612345678")).toBe("+33612345678");
  });

  it("rejects too short", () => {
    expect(() => phoneInternationalSchema.parse("1234")).toThrow();
  });

  it("rejects letters", () => {
    expect(() => phoneInternationalSchema.parse("abcdefghij")).toThrow();
  });
});

// =============================================================================
// dateIsoSchema
// =============================================================================

describe("dateIsoSchema", () => {
  it("accepts valid YYYY-MM-DD", () => {
    expect(dateIsoSchema.parse("2026-03-15")).toBe("2026-03-15");
  });

  it("rejects invalid month (13)", () => {
    expect(() => dateIsoSchema.parse("2026-13-01")).toThrow();
  });

  it("rejects non-matching format", () => {
    expect(() => dateIsoSchema.parse("15/03/2026")).toThrow();
  });
});

// =============================================================================
// dateTimeIsoSchema
// =============================================================================

describe("dateTimeIsoSchema", () => {
  it("accepts valid ISO 8601", () => {
    expect(dateTimeIsoSchema.parse("2026-03-15T10:30:00Z")).toBe("2026-03-15T10:30:00Z");
  });

  it("rejects plain date", () => {
    expect(() => dateTimeIsoSchema.parse("2026-03-15")).toThrow();
  });
});

// =============================================================================
// timeSchema
// =============================================================================

describe("timeSchema", () => {
  it("accepts 00:00", () => {
    expect(timeSchema.parse("00:00")).toBe("00:00");
  });

  it("accepts 23:59", () => {
    expect(timeSchema.parse("23:59")).toBe("23:59");
  });

  it("rejects 25:00", () => {
    expect(() => timeSchema.parse("25:00")).toThrow();
  });

  it("rejects 12:60", () => {
    expect(() => timeSchema.parse("12:60")).toThrow();
  });
});

// =============================================================================
// timeSlotSchema
// =============================================================================

describe("timeSlotSchema", () => {
  it("accepts valid HH:MM-HH:MM", () => {
    expect(timeSlotSchema.parse("12:00-14:00")).toBe("12:00-14:00");
  });

  it("rejects invalid format", () => {
    expect(() => timeSlotSchema.parse("12:00 - 14:00")).toThrow();
  });
});

// =============================================================================
// nameSchema / titleSchema / slugSchema
// =============================================================================

describe("nameSchema", () => {
  it("accepts valid name and trims", () => {
    expect(nameSchema.parse("  Ahmed  ")).toBe("Ahmed");
  });

  it("rejects too short (1 char)", () => {
    expect(() => nameSchema.parse("A")).toThrow();
  });
});

describe("titleSchema", () => {
  it("accepts valid title", () => {
    expect(titleSchema.parse("Mon Pack")).toBe("Mon Pack");
  });

  it("rejects too short (2 chars)", () => {
    expect(() => titleSchema.parse("AB")).toThrow();
  });
});

describe("slugSchema", () => {
  it("accepts valid slug", () => {
    expect(slugSchema.parse("mon-restaurant")).toBe("mon-restaurant");
  });

  it("rejects uppercase", () => {
    expect(() => slugSchema.parse("Mon-Restaurant")).toThrow();
  });

  it("rejects spaces", () => {
    expect(() => slugSchema.parse("mon restaurant")).toThrow();
  });
});

// =============================================================================
// Numeric schemas
// =============================================================================

describe("priceCentsSchema", () => {
  it("accepts 0", () => {
    expect(priceCentsSchema.parse(0)).toBe(0);
  });

  it("rejects negative", () => {
    expect(() => priceCentsSchema.parse(-1)).toThrow();
  });

  it("rejects non-integer", () => {
    expect(() => priceCentsSchema.parse(10.5)).toThrow();
  });
});

describe("guestsSchema", () => {
  it("accepts 1", () => {
    expect(guestsSchema.parse(1)).toBe(1);
  });

  it("rejects 0", () => {
    expect(() => guestsSchema.parse(0)).toThrow();
  });

  it("rejects 501", () => {
    expect(() => guestsSchema.parse(501)).toThrow();
  });
});

describe("ratingSchema", () => {
  it("accepts 1-5", () => {
    expect(ratingSchema.parse(3)).toBe(3);
  });

  it("rejects 0", () => {
    expect(() => ratingSchema.parse(0)).toThrow();
  });

  it("rejects 6", () => {
    expect(() => ratingSchema.parse(6)).toThrow();
  });
});

describe("percentageSchema", () => {
  it("accepts 0 and 100", () => {
    expect(percentageSchema.parse(0)).toBe(0);
    expect(percentageSchema.parse(100)).toBe(100);
  });

  it("rejects -1 and 101", () => {
    expect(() => percentageSchema.parse(-1)).toThrow();
    expect(() => percentageSchema.parse(101)).toThrow();
  });
});

// =============================================================================
// coordinatesSchema
// =============================================================================

describe("coordinatesSchema", () => {
  it("accepts valid coordinates", () => {
    const result = coordinatesSchema.parse({ lat: 33.57, lng: -7.58 });
    expect(result.lat).toBe(33.57);
    expect(result.lng).toBe(-7.58);
  });

  it("rejects lat > 90", () => {
    expect(() => coordinatesSchema.parse({ lat: 91, lng: 0 })).toThrow();
  });

  it("rejects lng > 180", () => {
    expect(() => coordinatesSchema.parse({ lat: 0, lng: 181 })).toThrow();
  });
});

// =============================================================================
// Enums
// =============================================================================

describe("universeSchema", () => {
  it("accepts valid universe", () => {
    expect(universeSchema.parse("restaurant")).toBe("restaurant");
  });

  it("rejects invalid universe", () => {
    expect(() => universeSchema.parse("cinema")).toThrow();
  });
});

describe("reservationStatusSchema", () => {
  it("accepts valid status", () => {
    expect(reservationStatusSchema.parse("confirmed")).toBe("confirmed");
  });

  it("rejects invalid status", () => {
    expect(() => reservationStatusSchema.parse("unknown")).toThrow();
  });
});

describe("proRoleSchema", () => {
  it("accepts valid role", () => {
    expect(proRoleSchema.parse("owner")).toBe("owner");
  });

  it("rejects invalid role", () => {
    expect(() => proRoleSchema.parse("admin")).toThrow();
  });
});

// =============================================================================
// paginationSchema
// =============================================================================

describe("paginationSchema", () => {
  it("applies defaults", () => {
    const result = paginationSchema.parse({});
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it("coerces string to number", () => {
    const result = paginationSchema.parse({ page: "3", limit: "10" });
    expect(result.page).toBe(3);
    expect(result.limit).toBe(10);
  });

  it("rejects page < 1", () => {
    expect(() => paginationSchema.parse({ page: 0 })).toThrow();
  });
});

// =============================================================================
// makePartialExcept
// =============================================================================

describe("makePartialExcept", () => {
  it("keeps required keys required and makes others optional", () => {
    const schema = z.object({
      name: z.string(),
      age: z.number(),
      email: z.string(),
    });

    const partial = makePartialExcept(schema, ["name"]);

    // name is required, age and email are optional
    expect(() => partial.parse({ name: "test" })).not.toThrow();
    expect(() => partial.parse({})).toThrow();
  });
});

// =============================================================================
// emptyStringToUndefined
// =============================================================================

describe("emptyStringToUndefined", () => {
  it("converts empty string to undefined", () => {
    expect(emptyStringToUndefined.parse("")).toBeUndefined();
  });

  it("converts whitespace-only to undefined", () => {
    expect(emptyStringToUndefined.parse("   ")).toBeUndefined();
  });

  it("trims and returns non-empty string", () => {
    expect(emptyStringToUndefined.parse("  hello  ")).toBe("hello");
  });
});
