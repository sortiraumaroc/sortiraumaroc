import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  parseBearerToken,
  isRecord,
  asString,
  asNumber,
  asBoolean,
  asStringArray,
  asJsonObject,
  normalizeEmail,
  looksLikeUuid,
  isDemoRoutesAllowed,
  getDemoProCredentials,
  getDemoProEmail,
  listInternalVisibilityOrderEmails,
} from "../proHelpers";

// =============================================================================
// parseBearerToken
// =============================================================================

describe("parseBearerToken", () => {
  it("should extract token from valid Bearer header", () => {
    expect(parseBearerToken("Bearer abc123")).toBe("abc123");
  });

  it("should be case-insensitive for scheme", () => {
    expect(parseBearerToken("bearer abc123")).toBe("abc123");
    expect(parseBearerToken("BEARER abc123")).toBe("abc123");
  });

  it("should return null for empty/missing header", () => {
    expect(parseBearerToken(undefined)).toBeNull();
    expect(parseBearerToken("")).toBeNull();
    expect(parseBearerToken("   ")).toBeNull();
  });

  it("should return null for non-Bearer scheme", () => {
    expect(parseBearerToken("Basic abc123")).toBeNull();
    expect(parseBearerToken("Token abc123")).toBeNull();
  });

  it("should return null if token part is missing", () => {
    expect(parseBearerToken("Bearer")).toBeNull();
    expect(parseBearerToken("Bearer ")).toBeNull();
  });

  it("should trim whitespace around token", () => {
    expect(parseBearerToken("  Bearer   mytoken  ")).toBe("mytoken");
  });
});

// =============================================================================
// isRecord
// =============================================================================

describe("isRecord", () => {
  it("should return true for plain objects", () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ a: 1 })).toBe(true);
  });

  it("should return true for arrays (they are objects)", () => {
    expect(isRecord([])).toBe(true);
  });

  it("should return false for primitives", () => {
    expect(isRecord(null)).toBe(false);
    expect(isRecord(undefined)).toBe(false);
    expect(isRecord("string")).toBe(false);
    expect(isRecord(42)).toBe(false);
    expect(isRecord(true)).toBe(false);
  });
});

// =============================================================================
// asString
// =============================================================================

describe("asString", () => {
  it("should return trimmed string for non-empty strings", () => {
    expect(asString("hello")).toBe("hello");
    expect(asString("  hello  ")).toBe("hello");
  });

  it("should return undefined for empty/whitespace strings", () => {
    expect(asString("")).toBeUndefined();
    expect(asString("   ")).toBeUndefined();
  });

  it("should return undefined for non-string types", () => {
    expect(asString(42)).toBeUndefined();
    expect(asString(null)).toBeUndefined();
    expect(asString(undefined)).toBeUndefined();
    expect(asString(true)).toBeUndefined();
    expect(asString({})).toBeUndefined();
  });
});

// =============================================================================
// asNumber
// =============================================================================

describe("asNumber", () => {
  it("should return the number for finite numbers", () => {
    expect(asNumber(42)).toBe(42);
    expect(asNumber(0)).toBe(0);
    expect(asNumber(-3.14)).toBe(-3.14);
  });

  it("should return undefined for Infinity/NaN", () => {
    expect(asNumber(Infinity)).toBeUndefined();
    expect(asNumber(-Infinity)).toBeUndefined();
    expect(asNumber(NaN)).toBeUndefined();
  });

  it("should return undefined for non-number types", () => {
    expect(asNumber("42")).toBeUndefined();
    expect(asNumber(null)).toBeUndefined();
    expect(asNumber(undefined)).toBeUndefined();
    expect(asNumber(true)).toBeUndefined();
  });
});

// =============================================================================
// asBoolean
// =============================================================================

describe("asBoolean", () => {
  it("should return the boolean value", () => {
    expect(asBoolean(true)).toBe(true);
    expect(asBoolean(false)).toBe(false);
  });

  it("should return undefined for non-boolean types", () => {
    expect(asBoolean(0)).toBeUndefined();
    expect(asBoolean(1)).toBeUndefined();
    expect(asBoolean("true")).toBeUndefined();
    expect(asBoolean(null)).toBeUndefined();
    expect(asBoolean(undefined)).toBeUndefined();
  });
});

// =============================================================================
// asStringArray
// =============================================================================

describe("asStringArray", () => {
  it("should return trimmed non-empty strings", () => {
    expect(asStringArray(["a", "b", "c"])).toEqual(["a", "b", "c"]);
    expect(asStringArray(["  a  ", " b "])).toEqual(["a", "b"]);
  });

  it("should filter out empty strings and non-strings", () => {
    expect(asStringArray(["a", "", "  ", 42, null, "b"])).toEqual(["a", "b"]);
  });

  it("should return undefined for non-array types", () => {
    expect(asStringArray("not-array")).toBeUndefined();
    expect(asStringArray(42)).toBeUndefined();
    expect(asStringArray(null)).toBeUndefined();
    expect(asStringArray(undefined)).toBeUndefined();
  });

  it("should return empty array for all-empty input", () => {
    expect(asStringArray(["", "  "])).toEqual([]);
  });
});

// =============================================================================
// asJsonObject
// =============================================================================

describe("asJsonObject", () => {
  it("should return the object for plain objects", () => {
    const obj = { a: 1, b: "x" };
    expect(asJsonObject(obj)).toBe(obj);
  });

  it("should return undefined for non-objects", () => {
    expect(asJsonObject(null)).toBeUndefined();
    expect(asJsonObject("string")).toBeUndefined();
    expect(asJsonObject(42)).toBeUndefined();
    expect(asJsonObject(undefined)).toBeUndefined();
  });
});

// =============================================================================
// normalizeEmail
// =============================================================================

describe("normalizeEmail", () => {
  it("should lowercase and trim", () => {
    expect(normalizeEmail("  Test@Example.COM  ")).toBe("test@example.com");
  });

  it("should handle already normalized email", () => {
    expect(normalizeEmail("user@example.com")).toBe("user@example.com");
  });
});

// =============================================================================
// looksLikeUuid
// =============================================================================

describe("looksLikeUuid", () => {
  it("should return true for valid UUIDs", () => {
    expect(looksLikeUuid("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
    expect(looksLikeUuid("AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE")).toBe(true);
  });

  it("should return false for invalid strings", () => {
    expect(looksLikeUuid("not-a-uuid")).toBe(false);
    expect(looksLikeUuid("550e8400e29b41d4a716446655440000")).toBe(false);
    expect(looksLikeUuid("")).toBe(false);
    expect(looksLikeUuid("550e8400-e29b-41d4-a716-44665544000")).toBe(false);
  });
});

// =============================================================================
// isDemoRoutesAllowed / getDemoProCredentials / getDemoProEmail
// =============================================================================

describe("isDemoRoutesAllowed", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("should return false in production", () => {
    process.env.NODE_ENV = "production";
    process.env.ALLOW_DEMO_ROUTES = "true";
    expect(isDemoRoutesAllowed()).toBe(false);
  });

  it("should return true when ALLOW_DEMO_ROUTES=true and not production", () => {
    process.env.NODE_ENV = "development";
    process.env.ALLOW_DEMO_ROUTES = "true";
    expect(isDemoRoutesAllowed()).toBe(true);
  });

  it("should return false when ALLOW_DEMO_ROUTES is not set", () => {
    process.env.NODE_ENV = "development";
    delete process.env.ALLOW_DEMO_ROUTES;
    expect(isDemoRoutesAllowed()).toBe(false);
  });
});

describe("getDemoProCredentials", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("should return null in production", () => {
    process.env.NODE_ENV = "production";
    process.env.ALLOW_DEMO_ROUTES = "true";
    process.env.DEMO_PRO_EMAIL = "demo@test.com";
    process.env.DEMO_PRO_PASSWORD = "secret123";
    expect(getDemoProCredentials()).toBeNull();
  });

  it("should return credentials when demo is allowed", () => {
    process.env.NODE_ENV = "development";
    process.env.ALLOW_DEMO_ROUTES = "true";
    process.env.DEMO_PRO_EMAIL = "Demo@Test.COM";
    process.env.DEMO_PRO_PASSWORD = "secret123";
    const creds = getDemoProCredentials();
    expect(creds).toEqual({ email: "demo@test.com", password: "secret123" });
  });

  it("should return null if email is missing or invalid", () => {
    process.env.NODE_ENV = "development";
    process.env.ALLOW_DEMO_ROUTES = "true";
    process.env.DEMO_PRO_EMAIL = "notanemail";
    process.env.DEMO_PRO_PASSWORD = "secret123";
    expect(getDemoProCredentials()).toBeNull();
  });

  it("should return null if password is empty", () => {
    process.env.NODE_ENV = "development";
    process.env.ALLOW_DEMO_ROUTES = "true";
    process.env.DEMO_PRO_EMAIL = "demo@test.com";
    process.env.DEMO_PRO_PASSWORD = "";
    expect(getDemoProCredentials()).toBeNull();
  });
});

describe("getDemoProEmail", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("should return email when demo is allowed", () => {
    process.env.NODE_ENV = "development";
    process.env.ALLOW_DEMO_ROUTES = "true";
    process.env.DEMO_PRO_EMAIL = "demo@test.com";
    process.env.DEMO_PRO_PASSWORD = "secret123";
    expect(getDemoProEmail()).toBe("demo@test.com");
  });

  it("should return null when demo is not allowed", () => {
    process.env.NODE_ENV = "production";
    expect(getDemoProEmail()).toBeNull();
  });
});

// =============================================================================
// listInternalVisibilityOrderEmails
// =============================================================================

describe("listInternalVisibilityOrderEmails", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("should parse semicolon-separated emails from env", () => {
    process.env.VISIBILITY_ORDERS_EMAILS = "a@test.com;b@test.com";
    expect(listInternalVisibilityOrderEmails()).toEqual(["a@test.com", "b@test.com"]);
  });

  it("should parse comma-separated emails from env", () => {
    process.env.VISIBILITY_ORDERS_EMAILS = "a@test.com,b@test.com";
    expect(listInternalVisibilityOrderEmails()).toEqual(["a@test.com", "b@test.com"]);
  });

  it("should fall back to default when env is empty", () => {
    delete process.env.VISIBILITY_ORDERS_EMAILS;
    process.env.EMAIL_DOMAIN = "myapp.com";
    expect(listInternalVisibilityOrderEmails()).toEqual(["pro@myapp.com"]);
  });

  it("should use sortiraumaroc.ma when EMAIL_DOMAIN is empty", () => {
    delete process.env.VISIBILITY_ORDERS_EMAILS;
    delete process.env.EMAIL_DOMAIN;
    expect(listInternalVisibilityOrderEmails()).toEqual(["pro@sortiraumaroc.ma"]);
  });
});
