import { describe, it, expect } from "vitest";
import {
  LacaissePayWebhookSchema,
  CreateReservationPaymentSchema,
  CreatePackPaymentSchema,
  WalletRechargeSchema,
} from "../payments";

describe("LacaissePayWebhookSchema", () => {
  it("should accept valid payment.success webhook", () => {
    const payload = {
      event: "payment.success",
      data: {
        transaction_id: "txn_12345",
        amount: 15000,
        currency: "MAD",
        status: "completed",
        metadata: { reservation_id: "abc" },
      },
    };

    const result = LacaissePayWebhookSchema.parse(payload);
    expect(result.event).toBe("payment.success");
    expect(result.data.transaction_id).toBe("txn_12345");
    expect(result.data.amount).toBe(15000);
  });

  it("should reject invalid event type", () => {
    const payload = {
      event: "payment.unknown",
      data: {
        transaction_id: "txn_12345",
        amount: 15000,
        status: "completed",
      },
    };

    expect(() => LacaissePayWebhookSchema.parse(payload)).toThrow();
  });

  it("should reject negative amount", () => {
    const payload = {
      event: "payment.success",
      data: {
        transaction_id: "txn_12345",
        amount: -100,
        status: "completed",
      },
    };

    expect(() => LacaissePayWebhookSchema.parse(payload)).toThrow();
  });

  it("should reject empty transaction_id", () => {
    const payload = {
      event: "payment.success",
      data: {
        transaction_id: "",
        amount: 15000,
        status: "completed",
      },
    };

    expect(() => LacaissePayWebhookSchema.parse(payload)).toThrow();
  });

  it("should default currency to MAD", () => {
    const payload = {
      event: "payment.success",
      data: {
        transaction_id: "txn_12345",
        amount: 15000,
        status: "completed",
      },
    };

    const result = LacaissePayWebhookSchema.parse(payload);
    expect(result.data.currency).toBe("MAD");
  });

  it("should allow additional fields (passthrough)", () => {
    const payload = {
      event: "payment.success",
      data: {
        transaction_id: "txn_12345",
        amount: 15000,
        status: "completed",
      },
      extra_field: "should be kept",
    };

    const result = LacaissePayWebhookSchema.parse(payload);
    expect((result as any).extra_field).toBe("should be kept");
  });
});

describe("CreateReservationPaymentSchema", () => {
  it("should accept valid reservation payment", () => {
    const input = {
      reservationId: "550e8400-e29b-41d4-a716-446655440000",
    };

    const result = CreateReservationPaymentSchema.parse(input);
    expect(result.reservationId).toBe("550e8400-e29b-41d4-a716-446655440000");
  });

  it("should reject invalid UUID", () => {
    expect(() =>
      CreateReservationPaymentSchema.parse({ reservationId: "not-uuid" }),
    ).toThrow("ID réservation invalide");
  });
});

describe("CreatePackPaymentSchema", () => {
  it("should accept valid pack payment with defaults", () => {
    const input = {
      packId: "550e8400-e29b-41d4-a716-446655440000",
    };

    const result = CreatePackPaymentSchema.parse(input);
    expect(result.quantity).toBe(1); // default
  });

  it("should reject quantity > 99", () => {
    expect(() =>
      CreatePackPaymentSchema.parse({
        packId: "550e8400-e29b-41d4-a716-446655440000",
        quantity: 100,
      }),
    ).toThrow();
  });
});

describe("WalletRechargeSchema", () => {
  it("should accept valid recharge", () => {
    const input = {
      amount: 5000,
      walletId: "550e8400-e29b-41d4-a716-446655440000",
    };

    const result = WalletRechargeSchema.parse(input);
    expect(result.amount).toBe(5000);
  });

  it("should reject amount below minimum (100 centimes = 1 MAD)", () => {
    expect(() =>
      WalletRechargeSchema.parse({
        amount: 50,
        walletId: "550e8400-e29b-41d4-a716-446655440000",
      }),
    ).toThrow("Montant minimum");
  });

  it("should reject amount above maximum", () => {
    expect(() =>
      WalletRechargeSchema.parse({
        amount: 2_000_000,
        walletId: "550e8400-e29b-41d4-a716-446655440000",
      }),
    ).toThrow("Montant maximum");
  });
});
