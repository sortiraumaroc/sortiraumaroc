import { describe, it, expect } from "vitest";
import { maskEmail, csvEscapeCell } from "../publicConsumerAccount";

// =============================================================================
// maskEmail
// =============================================================================

describe("maskEmail", () => {
  it("should mask a typical email", () => {
    // "salah@gmail.com" → "s***h@gmail.com"
    expect(maskEmail("salah@gmail.com")).toBe("s***h@gmail.com");
  });

  it("should mask email with 2-char local part", () => {
    // "ab@test.com" → "a***b@test.com"
    expect(maskEmail("ab@test.com")).toBe("a***b@test.com");
  });

  it("should return as-is if local part is 0 or 1 char", () => {
    // atIdx <= 1 means local part is 0 or 1 chars
    expect(maskEmail("a@test.com")).toBe("a@test.com");
    expect(maskEmail("@test.com")).toBe("@test.com");
  });

  it("should handle long email addresses", () => {
    expect(maskEmail("firstname.lastname@company.co.ma")).toBe(
      "f***e@company.co.ma",
    );
  });

  it("should handle emails with special characters in local part", () => {
    expect(maskEmail("user+tag@example.com")).toBe("u***g@example.com");
  });

  it("should preserve domain part unchanged", () => {
    const result = maskEmail("test@subdomain.example.co.ma");
    expect(result).toContain("@subdomain.example.co.ma");
  });

  it("should handle single-char local part (edge case)", () => {
    // atIdx is 1, so <= 1 → returns as-is
    expect(maskEmail("x@y.com")).toBe("x@y.com");
  });
});

// =============================================================================
// csvEscapeCell
// =============================================================================

describe("csvEscapeCell", () => {
  it("should return plain string unchanged", () => {
    expect(csvEscapeCell("hello")).toBe("hello");
    expect(csvEscapeCell("simple text")).toBe("simple text");
  });

  it("should wrap string containing commas in double quotes", () => {
    expect(csvEscapeCell("foo,bar")).toBe('"foo,bar"');
  });

  it("should wrap string containing newlines in double quotes", () => {
    expect(csvEscapeCell("line1\nline2")).toBe('"line1\nline2"');
  });

  it("should wrap string containing carriage returns", () => {
    expect(csvEscapeCell("line1\rline2")).toBe('"line1\rline2"');
  });

  it("should escape double quotes by doubling them", () => {
    expect(csvEscapeCell('say "hello"')).toBe('"say ""hello"""');
  });

  it("should handle combined special characters", () => {
    expect(csvEscapeCell('a "b", c\nd')).toBe('"a ""b"", c\nd"');
  });

  it("should return empty string for null/undefined", () => {
    expect(csvEscapeCell(null)).toBe("");
    expect(csvEscapeCell(undefined)).toBe("");
  });

  it("should convert non-string values to string", () => {
    expect(csvEscapeCell(42)).toBe("42");
    expect(csvEscapeCell(true)).toBe("true");
    expect(csvEscapeCell(0)).toBe("0");
  });

  it("should handle empty string", () => {
    expect(csvEscapeCell("")).toBe("");
  });
});
