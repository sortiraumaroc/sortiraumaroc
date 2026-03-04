import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isProduction, expectedWebhookKey } from "../publicMedia";

// =============================================================================
// isProduction
// =============================================================================

describe("isProduction", () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.NODE_ENV = originalEnv;
    } else {
      delete process.env.NODE_ENV;
    }
  });

  it('should return true for "production"', () => {
    process.env.NODE_ENV = "production";
    expect(isProduction()).toBe(true);
  });

  it('should return true for "prod"', () => {
    process.env.NODE_ENV = "prod";
    expect(isProduction()).toBe(true);
  });

  it("should be case-insensitive", () => {
    process.env.NODE_ENV = "PRODUCTION";
    expect(isProduction()).toBe(true);

    process.env.NODE_ENV = "Production";
    expect(isProduction()).toBe(true);

    process.env.NODE_ENV = "PROD";
    expect(isProduction()).toBe(true);
  });

  it("should trim whitespace", () => {
    process.env.NODE_ENV = "  production  ";
    expect(isProduction()).toBe(true);
  });

  it('should return false for "development"', () => {
    process.env.NODE_ENV = "development";
    expect(isProduction()).toBe(false);
  });

  it('should return false for "test"', () => {
    process.env.NODE_ENV = "test";
    expect(isProduction()).toBe(false);
  });

  it("should return false for empty string", () => {
    process.env.NODE_ENV = "";
    expect(isProduction()).toBe(false);
  });

  it("should return false when unset", () => {
    delete process.env.NODE_ENV;
    expect(isProduction()).toBe(false);
  });
});

// =============================================================================
// expectedWebhookKey
// =============================================================================

describe("expectedWebhookKey", () => {
  const savedKeys = {
    PAYMENTS_WEBHOOK_KEY: process.env.PAYMENTS_WEBHOOK_KEY,
    ADMIN_API_KEY: process.env.ADMIN_API_KEY,
  };

  afterEach(() => {
    // Restore
    for (const [key, val] of Object.entries(savedKeys)) {
      if (val !== undefined) {
        process.env[key] = val;
      } else {
        delete process.env[key];
      }
    }
  });

  it("should prefer PAYMENTS_WEBHOOK_KEY when set", () => {
    process.env.PAYMENTS_WEBHOOK_KEY = "webhook-secret-123";
    process.env.ADMIN_API_KEY = "admin-key-456";
    expect(expectedWebhookKey()).toBe("webhook-secret-123");
  });

  it("should fall back to ADMIN_API_KEY when PAYMENTS_WEBHOOK_KEY is not set", () => {
    delete process.env.PAYMENTS_WEBHOOK_KEY;
    process.env.ADMIN_API_KEY = "admin-key-456";
    expect(expectedWebhookKey()).toBe("admin-key-456");
  });

  it("should fall back to ADMIN_API_KEY when PAYMENTS_WEBHOOK_KEY is empty", () => {
    process.env.PAYMENTS_WEBHOOK_KEY = "";
    process.env.ADMIN_API_KEY = "admin-key-456";
    expect(expectedWebhookKey()).toBe("admin-key-456");
  });

  it("should return empty string when neither key is set", () => {
    delete process.env.PAYMENTS_WEBHOOK_KEY;
    delete process.env.ADMIN_API_KEY;
    expect(expectedWebhookKey()).toBe("");
  });

  it("should trim whitespace from keys", () => {
    process.env.PAYMENTS_WEBHOOK_KEY = "  my-key  ";
    expect(expectedWebhookKey()).toBe("my-key");
  });
});
