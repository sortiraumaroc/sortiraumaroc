import { Router } from "express";

import { getServerSupabaseClient } from "../lib/supabase";

export const publicMenuRouter = Router();

type MenuCategoryDto = { id: string; label: string };

type MenuProductDto = {
  id: string;
  categoryId: string;
  title: string;
  description: string;
  priceDh: number;
  imageSrc: string;
  badges?: string[];
  likes: number;
};

publicMenuRouter.get("/", async (req, res) => {
  const establishmentId =
    (typeof req.query.establishmentId === "string" ? req.query.establishmentId : null) ??
    process.env.VITE_SAM_ESTABLISHMENT_ID ??
    null;

  if (!establishmentId) {
    res.status(400).json({ error: "Missing establishmentId" });
    return;
  }

  const supabase = getServerSupabaseClient();

  try {
    const catRes = await supabase
      .from("pro_inventory_categories")
      .select("id, title, sort_order, is_active")
      .eq("establishment_id", establishmentId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("title", { ascending: true });

    if (catRes.error) {
      res.status(500).json({ error: "Failed to load categories" });
      return;
    }

    const categories = (catRes.data ?? []) as Array<{ id: string; title: string }>;

    const categoriesDto: MenuCategoryDto[] = categories.map((c) => ({ id: c.id, label: c.title }));

    const itemRes = await supabase
      .from("pro_inventory_items")
      .select("id, category_id, title, description, base_price, is_active, labels, image_src")
      .eq("establishment_id", establishmentId)
      .eq("is_active", true)
      .order("title", { ascending: true });

    if (itemRes.error) {
      res.status(500).json({ error: "Failed to load items" });
      return;
    }

    const productsDto: MenuProductDto[] = ((itemRes.data ?? []) as any[]).map((p) => ({
      id: String(p.id),
      categoryId: p.category_id ? String(p.category_id) : "",
      title: String(p.title ?? ""),
      description: String(p.description ?? ""),
      priceDh: typeof p.base_price === "number" ? p.base_price : 0,
      imageSrc: typeof p.image_src === "string" && p.image_src.trim().length > 0 ? p.image_src.trim() : "/placeholder.svg",
      badges: Array.isArray(p.labels) ? p.labels.map(String) : [],
      likes: 0,
    }));

    const categoriesWithItems = new Set(productsDto.map((p) => p.categoryId).filter(Boolean));
    const filteredCategoriesDto = categoriesDto.filter((c) => categoriesWithItems.has(c.id));

    res.status(200).json({ establishmentId, categories: filteredCategoriesDto, products: productsDto });
  } catch {
    res.status(500).json({ error: "Failed to load menu" });
  }
});
