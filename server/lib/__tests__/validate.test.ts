import { describe, it, expect } from "vitest";
import {
  validate,
  zBody,
  zQuery,
  zParams,
  zUuid,
  zPositiveInt,
  zIsoDate,
  zEmail,
  zPhone,
  zNonEmptyString,
  zPagination,
  zIdParam,
  z,
} from "../validate";

// Helper to create mock req/res/next
function createMocks(overrides?: { body?: any; query?: any; params?: any }) {
  const req = {
    body: overrides?.body ?? {},
    query: overrides?.query ?? {},
    params: overrides?.params ?? {},
  } as any;

  let statusCode = 200;
  let jsonBody: any = null;

  const res = {
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(body: any) {
      jsonBody = body;
      return res;
    },
  } as any;

  let nextCalled = false;
  let nextError: any = null;
  const next = (err?: any) => {
    nextCalled = true;
    nextError = err;
  };

  return { req, res, next, getStatus: () => statusCode, getJson: () => jsonBody, wasNextCalled: () => nextCalled, getNextError: () => nextError };
}

describe("validate middleware", () => {
  it("should call next() on valid body", () => {
    const schema = z.object({ name: z.string() });
    const middleware = validate({ body: schema });
    const { req, res, next, wasNextCalled } = createMocks({ body: { name: "test" } });

    middleware(req, res, next);

    expect(wasNextCalled()).toBe(true);
    expect(req.body.name).toBe("test");
  });

  it("should return 400 with details on invalid body", () => {
    const schema = z.object({ name: z.string(), age: z.number() });
    const middleware = validate({ body: schema });
    const { req, res, next, getStatus, getJson, wasNextCalled } = createMocks({ body: { name: 123 } });

    middleware(req, res, next);

    expect(wasNextCalled()).toBe(false);
    expect(getStatus()).toBe(400);
    const json = getJson();
    expect(json.error).toBe("Données invalides");
    expect(json.details).toBeInstanceOf(Array);
    expect(json.details.length).toBeGreaterThan(0);
  });

  it("should validate query params", () => {
    const schema = z.object({ page: z.coerce.number().int().min(1) });
    const middleware = validate({ query: schema });
    const { req, res, next, wasNextCalled } = createMocks({ query: { page: "3" } });

    middleware(req, res, next);

    expect(wasNextCalled()).toBe(true);
    expect(req.query.page).toBe(3);
  });

  it("should validate route params", () => {
    const schema = z.object({ id: z.string().uuid() });
    const middleware = validate({ params: schema });
    const { req, res, next, wasNextCalled } = createMocks({
      params: { id: "550e8400-e29b-41d4-a716-446655440000" },
    });

    middleware(req, res, next);

    expect(wasNextCalled()).toBe(true);
  });

  it("should reject invalid UUID in params", () => {
    const schema = z.object({ id: z.string().uuid() });
    const middleware = validate({ params: schema });
    const { req, res, next, getStatus, wasNextCalled } = createMocks({
      params: { id: "not-a-uuid" },
    });

    middleware(req, res, next);

    expect(wasNextCalled()).toBe(false);
    expect(getStatus()).toBe(400);
  });
});

describe("shorthand helpers", () => {
  it("zBody should validate body only", () => {
    const middleware = zBody(z.object({ x: z.number() }));
    const { req, res, next, wasNextCalled } = createMocks({ body: { x: 5 } });

    middleware(req, res, next);
    expect(wasNextCalled()).toBe(true);
  });

  it("zQuery should validate query only", () => {
    const middleware = zQuery(z.object({ q: z.string() }));
    const { req, res, next, wasNextCalled } = createMocks({ query: { q: "search" } });

    middleware(req, res, next);
    expect(wasNextCalled()).toBe(true);
  });

  it("zParams should validate params only", () => {
    const middleware = zParams(zIdParam);
    const { req, res, next, wasNextCalled } = createMocks({
      params: { id: "550e8400-e29b-41d4-a716-446655440000" },
    });

    middleware(req, res, next);
    expect(wasNextCalled()).toBe(true);
  });
});

describe("common schemas", () => {
  describe("zUuid", () => {
    it("should accept valid UUIDs", () => {
      expect(zUuid.parse("550e8400-e29b-41d4-a716-446655440000")).toBeTruthy();
    });

    it("should reject invalid UUIDs", () => {
      expect(() => zUuid.parse("not-a-uuid")).toThrow();
      expect(() => zUuid.parse("")).toThrow();
    });
  });

  describe("zIsoDate", () => {
    it("should accept YYYY-MM-DD format", () => {
      expect(zIsoDate.parse("2026-02-23")).toBe("2026-02-23");
    });

    it("should reject invalid formats", () => {
      expect(() => zIsoDate.parse("23/02/2026")).toThrow();
      expect(() => zIsoDate.parse("2026-2-3")).toThrow();
    });
  });

  describe("zEmail", () => {
    it("should accept valid emails and normalize", () => {
      expect(zEmail.parse("  Test@Example.COM  ")).toBe("test@example.com");
    });

    it("should reject invalid emails", () => {
      expect(() => zEmail.parse("not-an-email")).toThrow();
    });
  });

  describe("zPhone", () => {
    it("should accept valid phone formats", () => {
      expect(zPhone.parse("+212 6 12 34 56 78")).toBeTruthy();
      expect(zPhone.parse("0612345678")).toBeTruthy();
    });

    it("should reject too short", () => {
      expect(() => zPhone.parse("123")).toThrow();
    });
  });

  describe("zPagination", () => {
    it("should coerce string to number and apply defaults", () => {
      const result = zPagination.parse({});
      expect(result.page).toBe(1);
      expect(result.per_page).toBe(20);
    });

    it("should coerce string values", () => {
      const result = zPagination.parse({ page: "3", per_page: "50" });
      expect(result.page).toBe(3);
      expect(result.per_page).toBe(50);
    });

    it("should reject per_page > 100", () => {
      expect(() => zPagination.parse({ per_page: "200" })).toThrow();
    });
  });

  describe("zPositiveInt", () => {
    it("should coerce strings to numbers", () => {
      expect(zPositiveInt.parse("5")).toBe(5);
    });

    it("should reject zero and negatives", () => {
      expect(() => zPositiveInt.parse("0")).toThrow();
      expect(() => zPositiveInt.parse("-1")).toThrow();
    });
  });

  describe("zNonEmptyString", () => {
    it("should trim and validate", () => {
      expect(zNonEmptyString.parse("  hello  ")).toBe("hello");
    });

    it("should reject empty/whitespace-only", () => {
      expect(() => zNonEmptyString.parse("")).toThrow();
      expect(() => zNonEmptyString.parse("   ")).toThrow();
    });
  });
});
