import { useEffect, useState } from "react";

export interface MenuItemData {
  menuItemId: number;
  menuCategoryId: number;
  img?: string;
  title: string;
  note?: string;
  description?: string;
  price: number;
  priority: number;
  type: string;
  disponibleProduct: string;
  votes: number;
  label?: string;
}

export interface MenuCategoryData {
  menuCategoryId: number;
  placeId: number;
  title: string;
  priority: number;
  disponibleCat: string;
  showAsButton: string;
  parentId?: number;
  iconScan: string;
  menuItems?: MenuItemData[];
}

interface UseMySQLMenuResult {
  categories: MenuCategoryData[];
  items: MenuItemData[];
  loading: boolean;
  error: string | null;
}

/**
 * Fetch menu categories and items from MySQL API
 * Example: GET /api/mysql/menu/1
 */
export function useMySQLMenu(placeId?: number): UseMySQLMenuResult {
  const [categories, setCategories] = useState<MenuCategoryData[]>([]);
  const [items, setItems] = useState<MenuItemData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!placeId) {
      setCategories([]);
      setItems([]);
      setError(null);
      return;
    }

    const fetchMenu = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/mysql/menudispo/${placeId}`);

        if (!response.ok) {
          if (response.status === 404) {
            setError("Menu non trouvé");
          } else {
            setError("Erreur lors du chargement du menu");
          }
          setCategories([]);
          setItems([]);
          return;
        }

        const data = await response.json();

        // Extract categories and items
        const fetchedCategories = data.categories || [];
        const fetchedItems = data.items || [];

        setCategories(fetchedCategories);
        setItems(fetchedItems);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur inconnue");
        setCategories([]);
        setItems([]);
      } finally {
        setLoading(false);
      }
    };

    fetchMenu();
  }, [placeId]);

  return { categories, items, loading, error };
}
