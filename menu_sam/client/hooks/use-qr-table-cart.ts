import * as React from "react";
import { toast } from "sonner";
import type { MenuProduct } from "@/lib/menu-data";
import { useSessionId } from "@/hooks/use-session-id";

export type QrTableOrderItemRow = {
  id: number;
  commandeId: number;
  menuId: number;
  titre?: string;
  prix: number;
  quantite: number;
  comment: string;
  addedBySessionId?: string;
  addedByName?: string;
  createdAt: string;
  updatedAt?: string;
  menuItem?: {
    menuItemId: number;
    title: string;
    price: number;
  };
};

export type QrTableCartLine = {
  id: number;
  productId: number;
  title: string;
  unitPriceDh: number;
  quantity: number;
  note: string;
  addedByFirstName: string;
  ownedByMe: boolean;
};

type UseQrTableCartState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready" }
  | { status: "error"; message: string };

function applyUpsert(prev: QrTableOrderItemRow[], next: QrTableOrderItemRow) {
  const idx = prev.findIndex((x) => x.id === next.id);
  if (idx === -1) return [next, ...prev];
  const copy = [...prev];
  copy[idx] = next;
  return copy;
}

function applyDelete(prev: QrTableOrderItemRow[], id: number) {
  return prev.filter((x) => x.id !== id);
}

export function useQrTableCart({
  enabled,
  orderId,
  firstName,
  locked,
}: {
  enabled: boolean;
  orderId: number | null;
  firstName: string | null;
  locked: boolean;
}) {
  const sessionId = useSessionId();
  const [state, setState] = React.useState<UseQrTableCartState>({ status: "idle" });
  const [rows, setRows] = React.useState<QrTableOrderItemRow[]>([]);
  const inFlightAddsRef = React.useRef(new Set<string>());
  const pollIntervalRef = React.useRef<NodeJS.Timeout | null>(null);

  // Polling function
  const loadItems = React.useCallback(async () => {
    if (!orderId) return;
    // Get placeId and tableNumber from order metadata (we'll need to pass this in)
    // For now, we extract from the window location or props
    // TODO: Pass placeId and tableNumber as parameters

    try {
      // Fetch from table_carts instead of order items
      // We need placeId and tableNumber - these should be passed in
      const res = await fetch(`/api/mysql/orders/${orderId}/items`);
      if (!res.ok) throw new Error("Failed to fetch items");

      const items = await res.json();
      setRows(
        items.map((item: any) => ({
          id: item.id,
          commandeId: item.commandeId,
          menuId: item.menuId,
          titre: item.menuItem?.title,
          prix: item.prix,
          quantite: item.quantite,
          comment: item.comment || "",
          addedBySessionId: item.addedBySessionId,
          addedByName: item.addedByName,
          createdAt: item.createdAt,
          updatedAt: item.updatedAt,
          menuItem: item.menuItem,
        })),
      );
    } catch (error) {
      console.error("Error loading cart items:", error);
    }
  }, [orderId]);

  React.useEffect(() => {
    if (!enabled || !orderId) return;

    const load = async () => {
      setState({ status: "loading" });
      await loadItems();
      setState({ status: "ready" });
    };

    void load();

    // Start polling every 2 seconds
    pollIntervalRef.current = setInterval(() => {
      void loadItems();
    }, 2000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [enabled, orderId, loadItems]);

  const lines = React.useMemo<QrTableCartLine[]>(() => {
    return rows
      .filter((r) => Number.isFinite(r.quantite) && r.quantite > 0)
      .map((r) => ({
        id: r.id,
        productId: r.menuId,
        title: r.titre || r.menuItem?.title || "Unknown",
        unitPriceDh: r.prix || r.menuItem?.price || 0,
        quantity: r.quantite,
        note: r.comment,
        addedByFirstName: r.addedByName || "Unknown",
        ownedByMe: r.addedBySessionId === sessionId,
      }));
  }, [rows, sessionId]);

  const itemCount = React.useMemo(() => lines.reduce((sum, l) => sum + l.quantity, 0), [lines]);
  const totalDh = React.useMemo(() => lines.reduce((sum, l) => sum + l.unitPriceDh * l.quantity, 0), [lines]);

  const isReady = state.status === "ready";

  const add = React.useCallback(
    async ({ product, note }: { product: MenuProduct; note: string }): Promise<boolean> => {
      if (!isReady || !orderId || !firstName) return false;
      if (locked) return false;

      const trimmedNote = note.trim();
      const key = `${product.id}::${trimmedNote}`;

      if (inFlightAddsRef.current.has(key)) return false;
      inFlightAddsRef.current.add(key);

      try {
        // Convert product.id to number for comparison (product.id is string, menuId is number)
        const productIdNum = parseInt(product.id, 10);
        const existing = rows.find(
          (r) =>
            r.commandeId === orderId &&
            r.menuId === productIdNum &&
            r.addedBySessionId === sessionId &&
            (r.comment ?? "") === trimmedNote,
        );

        if (existing) {
          const nextQty = Math.min(99, Math.max(1, existing.quantite + 1));
          const updateRes = await fetch(`/api/mysql/order-items/${existing.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ quantite: nextQty }),
          });

          if (!updateRes.ok) {
            toast.message("Impossible d'ajouter au panier partagé. Réessayez.", { duration: 2200 });
            return false;
          }

          await loadItems();
          return true;
        }

        const insertRes = await fetch("/api/mysql/order-items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            commandeId: orderId,
            menuId: productIdNum,
            quantite: 1,
            comment: trimmedNote,
            prix: product.priceDh,
            addedBySessionId: sessionId,
            addedByName: firstName,
            categoryId: product.categoryId,
          }),
        });

        if (!insertRes.ok) {
          toast.message("Impossible d'ajouter au panier partagé. Réessayez.", { duration: 2200 });
          return false;
        }

        await loadItems();
        return true;
      } finally {
        inFlightAddsRef.current.delete(key);
      }
    },
    [firstName, isReady, locked, orderId, rows, sessionId, loadItems],
  );

  const setQuantity = React.useCallback(
    async ({ itemId, quantity }: { itemId: number; quantity: number }): Promise<boolean> => {
      if (!isReady) return false;
      if (locked) return false;

      const row = rows.find((r) => r.id === itemId);
      if (!row) return false;
      if (row.addedBySessionId !== sessionId) return false;

      const clamped = Math.min(99, Math.max(0, Math.trunc(quantity)));

      try {
        if (clamped === 0) {
          const res = await fetch(`/api/mysql/order-items/${itemId}`, { method: "DELETE" });
          if (!res.ok) {
            toast.message("Suppression impossible. Réessayez.", { duration: 2200 });
            return false;
          }
          await loadItems();
          return true;
        }

        const res = await fetch(`/api/mysql/order-items/${itemId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quantite: clamped }),
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
    [isReady, locked, rows, sessionId, loadItems],
  );

  const setNote = React.useCallback(
    async ({ itemId, note }: { itemId: number; note: string }): Promise<boolean> => {
      if (!isReady) return false;
      if (locked) return false;

      const row = rows.find((r) => r.id === itemId);
      if (!row) return false;
      if (row.addedBySessionId !== sessionId) return false;

      try {
        const res = await fetch(`/api/mysql/order-items/${itemId}`, {
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
    [isReady, locked, rows, sessionId, loadItems],
  );

  const clearMine = React.useCallback(async (): Promise<boolean> => {
    if (!isReady || !orderId) return false;
    if (locked) return false;

    try {
      const res = await fetch(`/api/mysql/orders/${orderId}/items/clear`, {
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
  }, [isReady, locked, orderId, sessionId, loadItems]);

  const hasAnyForProduct = React.useCallback(
    (productId: number) => rows.some((r) => r.menuId === productId && r.quantite > 0),
    [rows],
  );

  const myDraftNoteForProduct = React.useCallback(
    (productId: number) => {
      const mine = rows.find((r) => r.menuId === productId && r.addedBySessionId === sessionId);
      return mine?.comment ?? "";
    },
    [rows, sessionId],
  );

  return {
    state,
    orderId,
    sessionId,
    lines,
    itemCount,
    totalDh,
    add,
    setQuantity,
    setNote,
    clearMine,
    hasAnyForProduct,
    myDraftNoteForProduct,
  };
}
