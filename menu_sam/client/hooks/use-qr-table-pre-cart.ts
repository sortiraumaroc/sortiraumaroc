import * as React from "react";
import { toast } from "sonner";
import type { MenuProduct } from "@/lib/menu-data";
import { useSessionId } from "@/hooks/use-session-id";

export type TablePreCartLine = {
  id: number;
  productId: number;
  title: string;
  unitPriceDh: number;
  quantity: number;
  note: string;
  addedByFirstName: string;
  ownedByMe: boolean;
};

type TableCartRow = {
  id: number;
  placeId: number;
  tableNumber: number;
  menuItemId: number;
  sessionId: string;
  firstName: string | null;
  quantity: number;
  price: number;
  comment: string | null;
  createdAt: string;
  updatedAt: string;
  menuItem?: {
    menuItemId: number;
    title: string;
    price: number;
  };
};

type UseQrTablePreCartState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready" }
  | { status: "error"; message: string };

export function useQrTablePreCart({
  enabled,
  placeId,
  tableNumber,
  firstName,
}: {
  enabled: boolean;
  placeId: number | null;
  tableNumber: number;
  firstName: string | null;
}) {
  const sessionId = useSessionId();
  const [state, setState] = React.useState<UseQrTablePreCartState>({ status: "idle" });
  const [rows, setRows] = React.useState<TableCartRow[]>([]);
  const [timeRemainingSeconds, setTimeRemainingSeconds] = React.useState<number | null>(null);
  const inFlightAddsRef = React.useRef(new Set<string>());
  const pollIntervalRef = React.useRef<NodeJS.Timeout | null>(null);

  // Polling function to fetch all cart items for this table
  const loadItems = React.useCallback(async () => {
    if (!placeId) return;

    try {
      const res = await fetch(`/api/mysql/table-carts/${placeId}/${tableNumber}`);
      if (!res.ok) throw new Error("Failed to fetch carts");

      const items = await res.json();
      setRows(items);
    } catch (error) {
      console.error("Error loading pre-cart items:", error);
    }
  }, [placeId, tableNumber]);

  React.useEffect(() => {
    if (!enabled || !placeId) {
      setState({ status: "idle" });
      return;
    }

    const load = async () => {
      setState({ status: "loading" });
      await loadItems();
      setState({ status: "ready" });
    };

    void load();

    // Start polling every 2 seconds for real-time updates
    pollIntervalRef.current = setInterval(() => {
      void loadItems();
    }, 2000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [enabled, placeId, loadItems]);

  // Countdown timer effect - runs every second based on the earliest item in the table
  React.useEffect(() => {
    // Find the earliest createdAt timestamp from all items in the table
    if (rows.length === 0) {
      setTimeRemainingSeconds(null);
      return;
    }

    const earliestCreatedAt = rows.reduce((earliest, row) => {
      const rowTime = new Date(row.createdAt).getTime();
      return earliest ? Math.min(earliest, rowTime) : rowTime;
    }, 0);

    if (!earliestCreatedAt) {
      setTimeRemainingSeconds(null);
      return;
    }

    const interval = setInterval(() => {
      const now = Date.now();
      const elapsedMs = now - earliestCreatedAt;
      const fifteenMinutesMs = 15 * 60 * 1000; // 15 minutes in milliseconds
      const remainingMs = fifteenMinutesMs - elapsedMs;
      const remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));

      setTimeRemainingSeconds(remainingSeconds);

      // Auto-clear all table carts when countdown reaches 0
      if (remainingSeconds === 0 && rows.length > 0) {
        fetch(`/api/mysql/table-carts/${placeId}/${tableNumber}/clear`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }).catch((err) => console.error("Error auto-clearing carts:", err));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [rows, placeId, tableNumber]);

  const lines = React.useMemo<TablePreCartLine[]>(() => {
    return rows
      .filter((r) => r.quantity > 0)
      .map((r) => ({
        id: r.id,
        productId: r.menuItemId,
        title: r.menuItem?.title || "Unknown",
        unitPriceDh: r.price,
        quantity: r.quantity,
        note: r.comment || "",
        addedByFirstName: r.firstName || "Unknown",
        ownedByMe: r.sessionId === sessionId,
      }));
  }, [rows, sessionId]);

  const itemCount = React.useMemo(() => lines.reduce((sum, l) => sum + l.quantity, 0), [lines]);
  const totalDh = React.useMemo(() => lines.reduce((sum, l) => sum + l.unitPriceDh * l.quantity, 0), [lines]);

  const isReady = state.status === "ready";

  const add = React.useCallback(
    async ({ product, note }: { product: MenuProduct; note: string }): Promise<boolean> => {
      if (!isReady || !placeId || !firstName) return false;

      const trimmedNote = note.trim();
      const key = `${product.id}::${trimmedNote}`;

      if (inFlightAddsRef.current.has(key)) return false;
      inFlightAddsRef.current.add(key);

      try {
        const insertRes = await fetch("/api/mysql/table-carts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            placeId,
            tableNumber,
            menuItemId: parseInt(product.id),
            sessionId,
            firstName,
            quantity: 1,
            price: product.priceDh,
            comment: trimmedNote || null,
            categoryId: product.categoryId,
          }),
        });

        if (!insertRes.ok) {
          toast.message("Impossible d'ajouter au panier. Réessayez.", { duration: 2200 });
          return false;
        }

        await loadItems();
        return true;
      } finally {
        inFlightAddsRef.current.delete(key);
      }
    },
    [isReady, placeId, tableNumber, firstName, sessionId, loadItems],
  );

  const setQuantity = React.useCallback(
    async ({ itemId, quantity }: { itemId: number; quantity: number }): Promise<boolean> => {
      if (!isReady) return false;

      const row = rows.find((r) => r.id === itemId);
      if (!row) return false;
      if (row.sessionId !== sessionId) return false;

      const clamped = Math.min(99, Math.max(0, Math.trunc(quantity)));

      try {
        if (clamped === 0) {
          const res = await fetch(`/api/mysql/table-carts/${itemId}`, { method: "DELETE" });
          if (!res.ok) {
            toast.message("Suppression impossible. Réessayez.", { duration: 2200 });
            return false;
          }
          await loadItems();
          return true;
        }

        const res = await fetch(`/api/mysql/table-carts/${itemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quantity: clamped }),
        });

        if (!res.ok) {
          toast.message("Modification impossible. Réessayez.", { duration: 2200 });
          return false;
        }

        await loadItems();
        return true;
      } catch (error) {
        console.error("Error updating quantity:", error);
        toast.message("Modification impossible. Réessayez.", { duration: 2200 });
        return false;
      }
    },
    [isReady, rows, sessionId, loadItems],
  );

  const setNote = React.useCallback(
    async ({ itemId, note }: { itemId: number; note: string }): Promise<boolean> => {
      if (!isReady) return false;

      const row = rows.find((r) => r.id === itemId);
      if (!row) return false;
      if (row.sessionId !== sessionId) return false;

      try {
        const res = await fetch(`/api/mysql/table-carts/${itemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ comment: note.trim() }),
        });

        if (!res.ok) {
          toast.message("Modification impossible. Réessayez.", { duration: 2200 });
          return false;
        }

        await loadItems();
        return true;
      } catch (error) {
        console.error("Error updating note:", error);
        toast.message("Modification impossible. Réessayez.", { duration: 2200 });
        return false;
      }
    },
    [isReady, rows, sessionId, loadItems],
  );

  const clearMine = React.useCallback(async (): Promise<boolean> => {
    if (!isReady || !placeId) return false;

    try {
      const res = await fetch(`/api/mysql/table-carts/${placeId}/${tableNumber}/clear`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });

      if (!res.ok) {
        toast.message("Impossible de retirer vos articles. Réessayez.", { duration: 2200 });
        return false;
      }

      await loadItems();
      return true;
    } catch (error) {
      console.error("Error clearing items:", error);
      toast.message("Impossible de retirer vos articles. Réessayez.", { duration: 2200 });
      return false;
    }
  }, [isReady, placeId, tableNumber, sessionId, loadItems]);

  const clearAll = React.useCallback(async (): Promise<boolean> => {
    if (!isReady || !placeId) return false;

    try {
      const res = await fetch(`/api/mysql/table-carts/${placeId}/${tableNumber}/clear`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}), // Clear all, no sessionId
      });

      if (!res.ok) {
        console.warn("Warning: Could not clear all table carts");
        return false;
      }

      await loadItems();
      return true;
    } catch (error) {
      console.error("Error clearing all items:", error);
      return false;
    }
  }, [isReady, placeId, tableNumber, loadItems]);

  const hasAnyForProduct = React.useCallback(
    (productId: number) => rows.some((r) => r.menuItemId === productId && r.quantity > 0),
    [rows],
  );

  const myDraftNoteForProduct = React.useCallback(
    (productId: number) => {
      const mine = rows.find((r) => r.menuItemId === productId && r.sessionId === sessionId);
      return mine?.comment ?? "";
    },
    [rows, sessionId],
  );

  return {
    state,
    sessionId,
    lines,
    itemCount,
    totalDh,
    timeRemainingSeconds,
    add,
    setQuantity,
    setNote,
    clearMine,
    clearAll,
    hasAnyForProduct,
    myDraftNoteForProduct,
  };
}
