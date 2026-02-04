import * as React from "react";

import { SAM_ESTABLISHMENT_ID } from "@/lib/supabase";
import type { MenuCategory, MenuProduct } from "@/lib/menu-data";
import { menuCategories as fallbackCategories, menuProducts as fallbackProducts } from "@/lib/menu-data";

type ApiResponse = {
  establishmentId: string;
  categories: MenuCategory[];
  products: MenuProduct[];
};

type State =
  | { status: "loading"; categories: MenuCategory[]; products: MenuProduct[] }
  | { status: "ready"; categories: MenuCategory[]; products: MenuProduct[] };

export function useLiveMenuData(): State {
  const [state, setState] = React.useState<State>({
    status: "loading",
    categories: fallbackCategories,
    products: fallbackProducts,
  });

  React.useEffect(() => {
    const establishmentId = SAM_ESTABLISHMENT_ID;
    if (!establishmentId) {
      setState({ status: "ready", categories: fallbackCategories, products: fallbackProducts });
      return;
    }

    let cancelled = false;

    async function run() {
      try {
        const res = await fetch(`/api/menu?establishmentId=${encodeURIComponent(establishmentId)}`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
        });

        if (cancelled) return;

        if (!res.ok) {
          setState({ status: "ready", categories: fallbackCategories, products: fallbackProducts });
          return;
        }

        const json = (await res.json()) as Partial<ApiResponse>;
        if (cancelled) return;
        const categories = Array.isArray(json.categories) && json.categories.length > 0 ? (json.categories as MenuCategory[]) : null;
        const products = Array.isArray(json.products) && json.products.length > 0 ? (json.products as MenuProduct[]) : null;

        if (!categories || !products) {
          setState({ status: "ready", categories: fallbackCategories, products: fallbackProducts });
          return;
        }

        setState({ status: "ready", categories, products });
      } catch {
        if (cancelled) return;
        setState({ status: "ready", categories: fallbackCategories, products: fallbackProducts });
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
