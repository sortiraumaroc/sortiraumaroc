import type { AppLocale } from "@/lib/i18n/types";

export type FaqCategoryId =
  | "reservations"
  | "paiements"
  | "annulations"
  | "comptes_utilisateurs"
  | "comptes_pro"
  | "packs_offres"
  | "support_general";

export type FaqCategoryDefinition = {
  id: FaqCategoryId;
  labelKey: string;
  descriptionKey: string;
};

export const FAQ_CATEGORIES: readonly FaqCategoryDefinition[] = [
  {
    id: "reservations",
    labelKey: "faq.category.reservations",
    descriptionKey: "faq.category.reservations.desc",
  },
  {
    id: "paiements",
    labelKey: "faq.category.paiements",
    descriptionKey: "faq.category.paiements.desc",
  },
  {
    id: "annulations",
    labelKey: "faq.category.annulations",
    descriptionKey: "faq.category.annulations.desc",
  },
  {
    id: "comptes_utilisateurs",
    labelKey: "faq.category.comptes_utilisateurs",
    descriptionKey: "faq.category.comptes_utilisateurs.desc",
  },
  {
    id: "comptes_pro",
    labelKey: "faq.category.comptes_pro",
    descriptionKey: "faq.category.comptes_pro.desc",
  },
  {
    id: "packs_offres",
    labelKey: "faq.category.packs_offres",
    descriptionKey: "faq.category.packs_offres.desc",
  },
  {
    id: "support_general",
    labelKey: "faq.category.support_general",
    descriptionKey: "faq.category.support_general.desc",
  },
] as const;

export type PublicFaqArticle = {
  id: string;
  category: FaqCategoryId;
  display_order: number;
  tags: string[];
  updated_at: string | null;
  resolved: {
    lang: "fr" | "en";
    question: string;
    answer_html: string;
  };
};

export type FaqAudience = "consumer" | "pro";

export async function listPublicFaqArticles(locale: AppLocale, audience?: FaqAudience): Promise<PublicFaqArticle[]> {
  const qs = new URLSearchParams();
  qs.set("lang", locale === "en" ? "en" : "fr");
  if (audience) qs.set("audience", audience);

  const res = await fetch(`/api/public/faq?${qs.toString()}`, { credentials: "omit" });
  if (!res.ok) throw new Error("Failed to load FAQ");

  const payload = (await res.json()) as { items?: unknown };
  const items = Array.isArray(payload.items) ? payload.items : [];

  return items
    .map((it) => it as any)
    .filter((it) => it && typeof it === "object")
    .map((it) => {
      return {
        id: String(it.id ?? ""),
        category: (String(it.category ?? "reservations") as FaqCategoryId) || "reservations",
        display_order: typeof it.display_order === "number" ? it.display_order : 0,
        tags: Array.isArray(it.tags) ? it.tags.filter((t: unknown) => typeof t === "string") : [],
        updated_at: typeof it.updated_at === "string" ? it.updated_at : null,
        resolved: {
          lang: it?.resolved?.lang === "en" ? "en" : "fr",
          question: String(it?.resolved?.question ?? ""),
          answer_html: String(it?.resolved?.answer_html ?? ""),
        },
      } satisfies PublicFaqArticle;
    })
    .filter((it) => it.id);
}

export function matchesFaqQuery(item: PublicFaqArticle, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const hay = [item.resolved.question, item.resolved.answer_html, item.tags.join(" ")].join(" ").toLowerCase();
  return hay.includes(q);
}

export function filterFaqItems(args: {
  items: PublicFaqArticle[];
  query: string;
  category?: FaqCategoryId;
}): PublicFaqArticle[] {
  return args.items
    .filter((it) => (args.category ? it.category === args.category : true))
    .filter((it) => matchesFaqQuery(it, args.query))
    .sort((a, b) => {
      if (a.category !== b.category) return a.category.localeCompare(b.category);
      if (a.display_order !== b.display_order) return a.display_order - b.display_order;
      return String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? ""));
    });
}
