import { describe, it, expect } from "vitest";
import {
  isRecord,
  asString,
  asNumber,
  asStringArray,
  asJsonObject,
  normalizeEmail,
  generateProvisionalPassword,
  translateErrorMessage,
} from "../adminHelpers";

// =============================================================================
// isRecord
// =============================================================================

describe("isRecord", () => {
  it("should return true for plain objects", () => {
    expect(isRecord({})).toBe(true);
    expect(isRecord({ key: "val" })).toBe(true);
  });

  it("should return true for arrays", () => {
    expect(isRecord([1, 2, 3])).toBe(true);
  });

  it("should return false for null", () => {
    expect(isRecord(null)).toBe(false);
  });

  it("should return false for primitives", () => {
    expect(isRecord(undefined)).toBe(false);
    expect(isRecord("hello")).toBe(false);
    expect(isRecord(42)).toBe(false);
    expect(isRecord(true)).toBe(false);
  });
});

// =============================================================================
// asString
// =============================================================================

describe("asString", () => {
  it("should return trimmed value for valid strings", () => {
    expect(asString("hello")).toBe("hello");
    expect(asString("  world  ")).toBe("world");
  });

  it("should return undefined for empty/whitespace strings", () => {
    expect(asString("")).toBeUndefined();
    expect(asString("    ")).toBeUndefined();
  });

  it("should return undefined for non-string types", () => {
    expect(asString(123)).toBeUndefined();
    expect(asString(null)).toBeUndefined();
    expect(asString(undefined)).toBeUndefined();
    expect(asString(false)).toBeUndefined();
    expect(asString({})).toBeUndefined();
  });
});

// =============================================================================
// asNumber
// =============================================================================

describe("asNumber", () => {
  it("should return the number for finite values", () => {
    expect(asNumber(0)).toBe(0);
    expect(asNumber(42)).toBe(42);
    expect(asNumber(-7.5)).toBe(-7.5);
  });

  it("should return undefined for Infinity and NaN", () => {
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
// asStringArray
// =============================================================================

describe("asStringArray", () => {
  it("should return filtered and trimmed strings", () => {
    expect(asStringArray(["a", "b", "c"])).toEqual(["a", "b", "c"]);
    expect(asStringArray(["  x  ", "y"])).toEqual(["x", "y"]);
  });

  it("should filter out non-strings and empty items", () => {
    expect(asStringArray(["a", 42, "", null, "b"])).toEqual(["a", "b"]);
  });

  it("should return undefined for non-array input", () => {
    expect(asStringArray("string")).toBeUndefined();
    expect(asStringArray(42)).toBeUndefined();
    expect(asStringArray(null)).toBeUndefined();
    expect(asStringArray(undefined)).toBeUndefined();
  });
});

// =============================================================================
// asJsonObject
// =============================================================================

describe("asJsonObject", () => {
  it("should return object for plain objects", () => {
    const o = { x: 1 };
    expect(asJsonObject(o)).toBe(o);
  });

  it("should return undefined for non-objects", () => {
    expect(asJsonObject(null)).toBeUndefined();
    expect(asJsonObject("str")).toBeUndefined();
    expect(asJsonObject(42)).toBeUndefined();
    expect(asJsonObject(undefined)).toBeUndefined();
    expect(asJsonObject(true)).toBeUndefined();
  });
});

// =============================================================================
// normalizeEmail
// =============================================================================

describe("normalizeEmail", () => {
  it("should lowercase and trim", () => {
    expect(normalizeEmail("  ADMIN@SAM.MA  ")).toBe("admin@sam.ma");
  });

  it("should handle already-normalized email", () => {
    expect(normalizeEmail("test@example.com")).toBe("test@example.com");
  });
});

// =============================================================================
// generateProvisionalPassword
// =============================================================================

describe("generateProvisionalPassword", () => {
  it("should start with 'Sam-' prefix", () => {
    const pwd = generateProvisionalPassword();
    expect(pwd.startsWith("Sam-")).toBe(true);
  });

  it("should be at least 20 characters long", () => {
    const pwd = generateProvisionalPassword();
    // "Sam-" (4) + 18 bytes base64url (24 chars) = 28 chars
    expect(pwd.length).toBeGreaterThanOrEqual(20);
  });

  it("should generate unique passwords each time", () => {
    const a = generateProvisionalPassword();
    const b = generateProvisionalPassword();
    expect(a).not.toBe(b);
  });
});

// =============================================================================
// translateErrorMessage
// =============================================================================

describe("translateErrorMessage", () => {
  it("should translate known English messages to French", () => {
    expect(translateErrorMessage("User already registered")).toBe(
      "Utilisateur d\u00e9j\u00e0 enregistr\u00e9",
    );
    expect(translateErrorMessage("Invalid email")).toBe(
      "Adresse email invalide",
    );
    expect(
      translateErrorMessage("Password should be at least 6 characters"),
    ).toBe("Le mot de passe doit contenir au moins 6 caract\u00e8res");
  });

  it("should match case-insensitively via partial match", () => {
    expect(
      translateErrorMessage(
        "Error: A user with this email address has already been registered in the system",
      ),
    ).toBe("Un utilisateur avec cette adresse email existe d\u00e9j\u00e0");
  });

  it("should return original message if no translation found", () => {
    expect(translateErrorMessage("Some random error")).toBe(
      "Some random error",
    );
  });

  it("should return default message for undefined/empty input", () => {
    expect(translateErrorMessage(undefined)).toBe("Erreur inattendue");
    expect(translateErrorMessage("")).toBe("Erreur inattendue");
  });
});
