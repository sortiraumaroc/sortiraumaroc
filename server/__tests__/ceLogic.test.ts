/**
 * Tests for pure functions in server/ceLogic.ts
 *
 * Only pure / deterministic helpers are tested here — no Supabase calls.
 * Heavy dependencies (supabaseAdmin, totp) are mocked at module level
 * so the module can be imported without connecting to a real database.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Module-level mocks — prevent import-time side effects
// ---------------------------------------------------------------------------

vi.mock("../supabaseAdmin", () => ({
  getAdminSupabase: vi.fn(() => ({})),
}));

vi.mock("../lib/totp", () => ({
  generateSecret: vi.fn(() => "MOCKSECRETBASE32AAAA"),
  generateTOTP: vi.fn(() => "123456"),
  validateTOTP: vi.fn(() => ({ valid: true, timeWindow: 0 })),
}));

// ---------------------------------------------------------------------------
// Import the functions under test AFTER the mocks are declared
// ---------------------------------------------------------------------------

import {
  generateRegistrationCode,
  formatEmployeeName,
  encodeCeQrPayload,
  decodeCeQrPayload,
} from "../ceLogic";

// ============================================================================
// generateRegistrationCode
// ============================================================================

describe("generateRegistrationCode", () => {
  const ALLOWED_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";

  it("should return a string of exactly 8 characters", () => {
    const code = generateRegistrationCode();
    expect(code).toHaveLength(8);
  });

  it("should only contain characters from the allowed charset", () => {
    for (let i = 0; i < 20; i++) {
      const code = generateRegistrationCode();
      for (const ch of code) {
        expect(ALLOWED_CHARS).toContain(ch);
      }
    }
  });

  it("should not contain ambiguous characters (0, O, 1, l, I)", () => {
    const ambiguous = ["0", "O", "1", "l", "I"];
    for (let i = 0; i < 50; i++) {
      const code = generateRegistrationCode();
      for (const ch of ambiguous) {
        expect(code).not.toContain(ch);
      }
    }
  });

  it("should produce unique codes across multiple calls", () => {
    const codes = new Set<string>();
    for (let i = 0; i < 100; i++) {
      codes.add(generateRegistrationCode());
    }
    // With 54^8 possible codes, 100 calls should virtually never collide
    expect(codes.size).toBe(100);
  });

  it("should return a different code on each call (not static)", () => {
    const a = generateRegistrationCode();
    const b = generateRegistrationCode();
    // Extremely unlikely to collide twice — if they match the impl is broken
    // We give it 10 tries to prove non-determinism
    let allSame = true;
    for (let i = 0; i < 10; i++) {
      if (generateRegistrationCode() !== a) {
        allSame = false;
        break;
      }
    }
    expect(allSame).toBe(false);
  });
});

// ============================================================================
// formatEmployeeName
// ============================================================================

describe("formatEmployeeName", () => {
  it('should return "Salari\u00e9" for null input', () => {
    expect(formatEmployeeName(null)).toBe("Salari\u00e9");
  });

  it('should return "Salari\u00e9" for empty string', () => {
    expect(formatEmployeeName("")).toBe("Salari\u00e9");
  });

  it("should return empty string for whitespace-only input (truthy but trims to empty)", () => {
    // "   " is truthy so the null guard doesn't fire, but trim().split gives [""]
    expect(formatEmployeeName("   ")).toBe("");
  });

  it("should return the single name as-is for a one-word name", () => {
    expect(formatEmployeeName("Karim")).toBe("Karim");
  });

  it("should format two-word name as 'First L.'", () => {
    expect(formatEmployeeName("Salah Eddine")).toBe("Salah E.");
  });

  it("should use the last word's initial for multi-word names (3+)", () => {
    expect(formatEmployeeName("Mohamed El Amrani")).toBe("Mohamed A.");
  });

  it("should handle leading/trailing whitespace", () => {
    expect(formatEmployeeName("  Fatima  Zahra  ")).toBe("Fatima Z.");
  });

  it("should handle names with accented characters", () => {
    expect(formatEmployeeName("R\u00e9da B\u00e9nani")).toBe("R\u00e9da B.");
  });

  it("should handle Arabic-script names without crashing", () => {
    const result = formatEmployeeName("\u0645\u062d\u0645\u062f \u0639\u0644\u064a");
    expect(result).toBe("\u0645\u062d\u0645\u062f \u0639.");
  });

  it("should uppercase the last-name initial", () => {
    expect(formatEmployeeName("ahmed kaddouri")).toBe("ahmed K.");
  });

  it("should handle a name with many spaces between parts", () => {
    expect(formatEmployeeName("Youssef    Tazi")).toBe("Youssef T.");
  });
});

// ============================================================================
// encodeCeQrPayload
// ============================================================================

describe("encodeCeQrPayload", () => {
  let realDateNow: typeof Date.now;

  beforeEach(() => {
    realDateNow = Date.now;
  });

  afterEach(() => {
    Date.now = realDateNow;
  });

  it("should produce the expected format SAM:CE:v1:{id}:{code}:{ts}", () => {
    Date.now = vi.fn(() => 1708700000000); // fixed timestamp
    const payload = encodeCeQrPayload("emp-123", "654321");
    expect(payload).toBe("SAM:CE:v1:emp-123:654321:1708700000");
  });

  it("should embed the current timestamp in seconds (not ms)", () => {
    const ms = 1700000000000;
    Date.now = vi.fn(() => ms);
    const payload = encodeCeQrPayload("x", "000000");
    expect(payload).toContain(`:${Math.floor(ms / 1000)}`);
  });

  it("should include the employeeId and code verbatim", () => {
    Date.now = vi.fn(() => 1000000);
    const payload = encodeCeQrPayload("abc-def", "112233");
    const parts = payload.split(":");
    expect(parts[3]).toBe("abc-def");
    expect(parts[4]).toBe("112233");
  });

  it("should start with the SAM:CE:v1 prefix", () => {
    const payload = encodeCeQrPayload("id", "code");
    expect(payload.startsWith("SAM:CE:v1:")).toBe(true);
  });

  it("should contain exactly 6 colon-separated segments", () => {
    const payload = encodeCeQrPayload("emp", "code");
    expect(payload.split(":")).toHaveLength(6);
  });
});

// ============================================================================
// decodeCeQrPayload
// ============================================================================

describe("decodeCeQrPayload", () => {
  it("should correctly decode a well-formed SAM:CE:v1 payload", () => {
    const result = decodeCeQrPayload("SAM:CE:v1:emp-42:987654:1708700000");
    expect(result).not.toBeNull();
    expect(result!.employeeId).toBe("emp-42");
    expect(result!.code).toBe("987654");
    expect(result!.ts).toBe(1708700000);
  });

  it("should return null for completely unrelated strings", () => {
    expect(decodeCeQrPayload("random-garbage")).toBeNull();
  });

  it("should return null for empty string", () => {
    expect(decodeCeQrPayload("")).toBeNull();
  });

  it("should return null for a SAM: prefix without CE (wrong namespace)", () => {
    // The function checks for "SAM:CE:v" prefix
    expect(decodeCeQrPayload("SAM:v1:rid:code:123")).toBeNull();
  });

  it("should return null when there are fewer than 6 colon-separated parts", () => {
    expect(decodeCeQrPayload("SAM:CE:v1:emp:code")).toBeNull(); // only 5 parts
  });

  it("should handle whitespace around the payload (trimming)", () => {
    const result = decodeCeQrPayload("  SAM:CE:v1:emp-1:000000:1700000000  ");
    expect(result).not.toBeNull();
    expect(result!.employeeId).toBe("emp-1");
  });

  it("should return ts=0 for non-numeric timestamp", () => {
    const result = decodeCeQrPayload("SAM:CE:v1:emp:code:notanumber");
    expect(result).not.toBeNull();
    expect(result!.ts).toBe(0);
  });

  it("should accept version strings other than v1 (starts with SAM:CE:v)", () => {
    const result = decodeCeQrPayload("SAM:CE:v2:emp:code:999");
    expect(result).not.toBeNull();
    expect(result!.employeeId).toBe("emp");
  });
});

// ============================================================================
// encodeCeQrPayload / decodeCeQrPayload round-trip
// ============================================================================

describe("encodeCeQrPayload <-> decodeCeQrPayload round-trip", () => {
  let realDateNow: typeof Date.now;

  beforeEach(() => {
    realDateNow = Date.now;
  });

  afterEach(() => {
    Date.now = realDateNow;
  });

  it("should decode what was encoded (basic round-trip)", () => {
    Date.now = vi.fn(() => 1708700000000);
    const encoded = encodeCeQrPayload("employee-xyz", "543210");
    const decoded = decodeCeQrPayload(encoded);

    expect(decoded).not.toBeNull();
    expect(decoded!.employeeId).toBe("employee-xyz");
    expect(decoded!.code).toBe("543210");
    expect(decoded!.ts).toBe(1708700000);
  });

  it("should round-trip with UUID-style employee IDs", () => {
    Date.now = vi.fn(() => 1700000000000);
    const uuid = "550e8400-e29b-41d4-a716-446655440000";
    const encoded = encodeCeQrPayload(uuid, "111111");
    const decoded = decodeCeQrPayload(encoded);

    expect(decoded).not.toBeNull();
    expect(decoded!.employeeId).toBe(uuid);
  });

  it("should round-trip preserving the exact code digits", () => {
    Date.now = vi.fn(() => 1600000000000);
    const code = "007890";
    const encoded = encodeCeQrPayload("e1", code);
    const decoded = decodeCeQrPayload(encoded);

    expect(decoded).not.toBeNull();
    expect(decoded!.code).toBe(code);
  });

  it("should produce a timestamp that reflects Date.now in seconds", () => {
    const nowMs = 1708712345678;
    Date.now = vi.fn(() => nowMs);
    const encoded = encodeCeQrPayload("e", "c");
    const decoded = decodeCeQrPayload(encoded);

    expect(decoded!.ts).toBe(Math.floor(nowMs / 1000));
  });
});
