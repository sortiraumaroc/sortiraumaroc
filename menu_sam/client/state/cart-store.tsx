import * as React from "react";

import type { MenuProduct } from "@/lib/menu-data";

export type CartLine = {
  product: MenuProduct;
  quantity: number;
  note: string;
  categoryId: string;
};

type CartState = {
  lines: CartLine[];
  promoCode: string | null;
  discountPercent: number;
  createdAt: number | null; // Timestamp when cart was created
};

type ApplyPromoResult =
  | { ok: true; code: string; discountType: string; discountValue: number; discountAmount: number; percent?: number }
  | { ok: false; message: string };

type CartContextValue = {
  lines: CartLine[];
  add: (product: MenuProduct) => void;
  remove: (productId: string) => void;
  setQuantity: (productId: string, quantity: number) => void;
  setNote: (productId: string, note: string) => void;
  clear: () => void;
  itemCount: number;
  subtotalDh: number;
  promoCode: string | null;
  discountPercent: number;
  discountDh: number;
  totalDh: number;
  applyPromoCode: (code: string, placeId: number, orderAmount: number) => Promise<ApplyPromoResult>;
  clearPromoCode: () => void;
  createdAt: number | null;
  timeRemainingSeconds: number | null; // Time remaining in seconds (null if cart is empty)
};

const CartContext = React.createContext<CartContextValue | null>(null);

const STORAGE_KEY = "sam_cart_v2";

/**
 * Check if a category exists in the cart lines
 */
export function hasCategoryInCart(lines: CartLine[], categoryId: string): boolean {
  return lines.some((line) => line.categoryId === categoryId);
}

function clampInt(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function safeParseCart(raw: string | null): CartState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<CartState>;
    if (!parsed || typeof parsed !== "object") return null;

    const linesRaw = Array.isArray((parsed as any).lines) ? ((parsed as any).lines as any[]) : [];

    const lines = linesRaw
      .map((l) => {
        if (!l || typeof l !== "object") return null;
        if (!l.product || typeof l.product !== "object") return null;
        if (typeof l.product.id !== "string") return null;
        if (typeof l.quantity !== "number") return null;

        return {
          product: l.product as MenuProduct,
          quantity: clampInt(l.quantity, 1, 99),
          note: typeof l.note === "string" ? l.note : "",
          categoryId: typeof l.categoryId === "string" ? l.categoryId : l.product?.categoryId || "",
        } satisfies CartLine;
      })
      .filter(Boolean) as CartLine[];

    const promoCode = typeof (parsed as any).promoCode === "string" ? ((parsed as any).promoCode as string) : null;
    const discountPercentRaw =
      typeof (parsed as any).discountPercent === "number" && Number.isFinite((parsed as any).discountPercent)
        ? ((parsed as any).discountPercent as number)
        : 0;
    const createdAtRaw =
      typeof (parsed as any).createdAt === "number" && Number.isFinite((parsed as any).createdAt)
        ? ((parsed as any).createdAt as number)
        : null;

    return {
      lines,
      promoCode: promoCode ? promoCode.trim().toUpperCase() : null,
      discountPercent: clampInt(discountPercentRaw, 0, 100),
      createdAt: createdAtRaw,
    };
  } catch {
    return null;
  }
}

function usePersistedCartState(): [CartState, React.Dispatch<React.SetStateAction<CartState>>] {
  const [state, setState] = React.useState<CartState>(() => {
    if (typeof window === "undefined") {
      return {
        lines: [],
        promoCode: null,
        discountPercent: 0,
        createdAt: null,
      };
    }

    return (
      safeParseCart(window.localStorage.getItem(STORAGE_KEY)) ?? {
        lines: [],
        promoCode: null,
        discountPercent: 0,
        createdAt: null,
      }
    );
  });

  React.useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore persistence errors (private mode, quota, etc.)
    }
  }, [state]);

  return [state, setState];
}

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = usePersistedCartState();
  const [timeRemainingSeconds, setTimeRemainingSeconds] = React.useState<number | null>(null);

  // Countdown timer effect - runs every second
  React.useEffect(() => {
    if (!state.createdAt || state.lines.length === 0) {
      setTimeRemainingSeconds(null);
      return;
    }

    const interval = setInterval(() => {
      const now = Date.now();
      const elapsedMs = now - state.createdAt;
      const fifteenMinutesMs = 15 * 60 * 1000; // 15 minutes in milliseconds
      const remainingMs = fifteenMinutesMs - elapsedMs;
      const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));

      setTimeRemainingSeconds(remainingSeconds);

      // Auto-clear cart when countdown reaches 0
      if (remainingSeconds === 0) {
        setState({
          lines: [],
          promoCode: null,
          discountPercent: 0,
          createdAt: null,
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [state.createdAt, state.lines.length, setState]);

  const add = React.useCallback(
    (product: MenuProduct) => {
      setState((prev) => {
        const existing = prev.lines.find((l) => l.product.id === product.id);
        const wasEmpty = prev.lines.length === 0;

        if (existing) {
          return {
            ...prev,
            lines: prev.lines.map((l) =>
              l.product.id === product.id
                ? { ...l, quantity: clampInt(l.quantity + 1, 1, 99) }
                : l,
            ),
          };
        }

        return {
          ...prev,
          lines: [...prev.lines, { product, quantity: 1, note: "", categoryId: product.categoryId }],
          createdAt: wasEmpty ? Date.now() : prev.createdAt,
        };
      });
    },
    [setState],
  );

  const remove = React.useCallback(
    (productId: string) => {
      setState((prev) => {
        const nextLines = prev.lines.filter((l) => l.product.id !== productId);
        const isEmpty = nextLines.length === 0;
        return {
          ...prev,
          lines: nextLines,
          promoCode: isEmpty ? null : prev.promoCode,
          discountPercent: isEmpty ? 0 : prev.discountPercent,
          createdAt: isEmpty ? null : prev.createdAt,
        };
      });
    },
    [setState],
  );

  const setQuantity = React.useCallback(
    (productId: string, quantity: number) => {
      setState((prev) => {
        const clamped = clampInt(quantity, 0, 99);
        const nextLines =
          clamped === 0
            ? prev.lines.filter((l) => l.product.id !== productId)
            : prev.lines.map((l) => (l.product.id === productId ? { ...l, quantity: clamped } : l));

        const isEmpty = nextLines.length === 0;
        return {
          ...prev,
          lines: nextLines,
          promoCode: isEmpty ? null : prev.promoCode,
          discountPercent: isEmpty ? 0 : prev.discountPercent,
          createdAt: isEmpty ? null : prev.createdAt,
        };
      });
    },
    [setState],
  );

  const setNote = React.useCallback(
    (productId: string, note: string) => {
      setState((prev) => ({
        ...prev,
        lines: prev.lines.map((l) => (l.product.id === productId ? { ...l, note } : l)),
      }));
    },
    [setState],
  );

  const clear = React.useCallback(() => {
    setState({
      lines: [],
      promoCode: null,
      discountPercent: 0,
      createdAt: null,
    });
  }, [setState]);

  const itemCount = React.useMemo(
    () => state.lines.reduce((sum, l) => sum + l.quantity, 0),
    [state.lines],
  );

  const subtotalDh = React.useMemo(
    () => state.lines.reduce((sum, l) => sum + l.product.priceDh * l.quantity, 0),
    [state.lines],
  );

  const discountDh = React.useMemo(() => {
    if (!state.discountPercent) return 0;
    const discountedTotal = Math.round((subtotalDh * (100 - state.discountPercent)) / 100);
    return Math.max(0, subtotalDh - discountedTotal);
  }, [state.discountPercent, subtotalDh]);

  const totalDh = React.useMemo(() => subtotalDh - discountDh, [discountDh, subtotalDh]);

  const applyPromoCode = React.useCallback(
    async (rawCode: string, placeId: number, orderAmount: number): Promise<ApplyPromoResult> => {
      const code = rawCode.trim().toUpperCase();
      if (!code) return { ok: false, message: "Entrez un code." };

      try {
        const response = await fetch("/api/mysql/promos/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            placeId,
            code,
            orderAmount,
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          return { ok: false, message: error.error || "Code invalide." };
        }

        const data = await response.json();

        // Calculate discount percent for display purposes
        let discountPercent = 0;
        if (data.discountType === "percent") {
          discountPercent = data.discountValue;
        } else if (data.discountType === "amount") {
          discountPercent = Math.round((data.discount / orderAmount) * 100);
        }

        setState((prev) => ({
          ...prev,
          promoCode: code,
          discountPercent,
        }));

        return {
          ok: true,
          code: data.code,
          discountType: data.discountType,
          discountValue: data.discountValue,
          discountAmount: data.discount,
          percent: discountPercent,
        };
      } catch (error) {
        console.error("Error applying promo code:", error);
        return { ok: false, message: "Une erreur est survenue. Veuillez réessayer." };
      }
    },
    [setState],
  );

  const clearPromoCode = React.useCallback(() => {
    setState((prev) => ({ ...prev, promoCode: null, discountPercent: 0 }));
  }, [setState]);

  const value = React.useMemo<CartContextValue>(
    () => ({
      lines: state.lines,
      add,
      remove,
      setQuantity,
      setNote,
      clear,
      itemCount,
      subtotalDh,
      promoCode: state.promoCode,
      discountPercent: state.discountPercent,
      discountDh,
      totalDh,
      applyPromoCode,
      clearPromoCode,
      createdAt: state.createdAt,
      timeRemainingSeconds,
    }),
    [
      state.lines,
      state.promoCode,
      state.discountPercent,
      state.createdAt,
      timeRemainingSeconds,
      add,
      remove,
      setQuantity,
      setNote,
      clear,
      itemCount,
      subtotalDh,
      discountDh,
      totalDh,
      applyPromoCode,
      clearPromoCode,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = React.useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}

/**
 * Submit a cart to the MySQL API to create a commande
 */
export async function submitCartToMySQL(
  placeId: number,
  cartLines: CartLine[],
  total: number,
  options?: {
    nbrTable?: number;
    serviceType?: "sur_place" | "livraison" | "emporter";
    joinCode?: string;
    userId?: number;
    orderByUser?: string;
    comment?: string;
    discountAmount?: number;
    paymentMethod?: "card" | "cash";
    pourboire?: number;
  }
) {
  try {
    const response = await fetch("/api/mysql/orders/complete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        placeId,
        nbrTable: options?.nbrTable || 1,
        serviceType: options?.serviceType || "sur_place",
        joinCode: options?.joinCode || null,
        userId: options?.userId ?? 7591, // Default to 7591
        orderByUser: options?.orderByUser || null,
        total,
        comment: options?.comment || "",
        discountAmount: options?.discountAmount || 0,
        paymentMethod: options?.paymentMethod || "card",
        pourboire: options?.pourboire || 0,
        products: cartLines.map((line) => ({
          menuId: parseInt(line.product.id), // Assuming product.id is menuId
          quantite: line.quantity,
          prix: line.product.priceDh,
          comment: line.note || "",
          categoryId: line.categoryId,
        })),
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Failed to submit order");
    }

    const order = await response.json();
    return { ok: true, order };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return { ok: false, error: message };
  }
}
