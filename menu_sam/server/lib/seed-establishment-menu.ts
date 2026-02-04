import type { SupabaseClient } from "@supabase/supabase-js";

import { menuCategories, menuProducts } from "../../shared/menu-data";

type CategoryRow = { id: string; title: string };

type InsertCategory = {
  establishment_id: string;
  title: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
};

type InsertItem = {
  establishment_id: string;
  category_id: string | null;
  title: string;
  description: string | null;
  base_price: number | null;
  currency: string;
  is_active: boolean;
  labels: string[];
};

export async function ensureEstablishmentMenuSeeded(
  supabase: SupabaseClient,
  establishmentId: string,
): Promise<{ seeded: boolean; reason: "seeded" | "already_present" | "missing_establishment" | "failed" }> {
  if (!establishmentId) {
    return { seeded: false, reason: "missing_establishment" };
  }

  try {
    const existingCountRes = await supabase
      .from("pro_inventory_categories")
      .select("id", { count: "exact", head: true })
      .eq("establishment_id", establishmentId);

    const existingCount = existingCountRes.count ?? 0;
    if (existingCount > 0) {
      return { seeded: false, reason: "already_present" };
    }

    const categoryInserts: InsertCategory[] = menuCategories.map((c, idx) => ({
      establishment_id: establishmentId,
      title: c.label,
      description: null,
      sort_order: idx + 1,
      is_active: true,
    }));

    const catInsertRes = await supabase
      .from("pro_inventory_categories")
      .insert(categoryInserts)
      .select("id, title");

    if (catInsertRes.error) {
      return { seeded: false, reason: "failed" };
    }

    const insertedCats = (catInsertRes.data ?? []) as CategoryRow[];
    const dbCatIdByTitle = new Map<string, string>();
    for (const c of insertedCats) dbCatIdByTitle.set(c.title, c.id);

    const categoryLabelByStaticId = new Map(menuCategories.map((c) => [c.id, c.label] as const));

    const itemInserts: InsertItem[] = menuProducts.map((p) => {
      const label = categoryLabelByStaticId.get(p.categoryId) ?? "";
      const categoryId = label ? dbCatIdByTitle.get(label) ?? null : null;

      return {
        establishment_id: establishmentId,
        category_id: categoryId,
        title: p.title,
        description: p.description || null,
        base_price: Number.isFinite(p.priceDh) ? Math.max(0, p.priceDh) : null,
        currency: "MAD",
        is_active: true,
        labels: (p.badges ?? []) as string[],
      };
    });

    const itemInsertRes = await supabase.from("pro_inventory_items").insert(itemInserts);
    if (itemInsertRes.error) {
      return { seeded: false, reason: "failed" };
    }

    return { seeded: true, reason: "seeded" };
  } catch {
    return { seeded: false, reason: "failed" };
  }
}
