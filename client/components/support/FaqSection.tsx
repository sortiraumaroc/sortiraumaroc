import { useEffect, useMemo, useState } from "react";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n";
import {
  FAQ_CATEGORIES,
  filterFaqItems,
  listPublicFaqArticles,
  type FaqAudience,
  type FaqCategoryId,
  type PublicFaqArticle,
} from "@/lib/faq";
import { sanitizeRichTextHtml } from "@/lib/richText";

type Props = {
  className?: string;
  defaultCategory?: FaqCategoryId | "all";
  compact?: boolean;
  audience?: FaqAudience;
};

export function FaqSection({ className, defaultCategory = "all", compact, audience }: Props) {
  const { t, locale } = useI18n();

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<FaqCategoryId | "all">(defaultCategory);

  const [items, setItems] = useState<PublicFaqArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      setError(null);

      try {
        const data = await listPublicFaqArticles(locale, audience);
        if (cancelled) return;

        // Strict language rule: only keep items that have both question+answer in the selected language.
        const filtered = data.filter((it) => it.resolved.question.trim() && it.resolved.answer_html.trim());
        setItems(filtered);
      } catch {
        if (!cancelled) setError(t("faq.section.error_load"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [locale, t, audience]);

  const results = useMemo(() => {
    return filterFaqItems({
      items,
      query,
      category: category === "all" ? undefined : category,
    });
  }, [items, query, category]);

  // Filter categories based on audience — hide irrelevant categories
  const visibleCategories = useMemo(() => {
    return FAQ_CATEGORIES.filter((c) => {
      if (audience === "consumer" && c.id === "comptes_pro") return false;
      if (audience === "pro" && c.id === "comptes_utilisateurs") return false;
      return true;
    });
  }, [audience]);

  const activeLabel = useMemo(() => {
    if (category === "all") return t("faq.section.category_all");
    const def = FAQ_CATEGORIES.find((c) => c.id === category);
    return def ? t(def.labelKey) : category;
  }, [category, t]);

  return (
    <section className={cn("rounded-lg border-2 border-slate-200 bg-white", compact ? "p-4" : "p-6 md:p-8", className)}>
      <div className={cn("flex flex-col md:flex-row md:items-end gap-4", compact ? "" : "mb-6")}>
        <div className="flex-1">
          <div className={cn("font-bold text-foreground", compact ? "text-base" : "text-xl")}>{t("faq.section.title")}</div>
          <div className="mt-1 text-sm text-slate-600">{t("faq.section.subtitle")}</div>
        </div>
        <div className="w-full md:w-[360px]">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("faq.section.search_placeholder")}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[260px_1fr] gap-6">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
          <div className="text-xs font-bold text-slate-700 px-2 py-1">{t("faq.section.categories")}</div>
          <div className="mt-2 space-y-1">
            <button
              type="button"
              onClick={() => setCategory("all")}
              className={cn(
                "w-full text-start rounded-md px-3 py-2 text-sm font-semibold transition",
                category === "all" ? "bg-primary text-white" : "hover:bg-white",
              )}
            >
              {t("faq.section.category_all_short")}
            </button>
            {visibleCategories.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setCategory(c.id)}
                className={cn(
                  "w-full text-start rounded-md px-3 py-2 text-sm font-semibold transition",
                  category === c.id ? "bg-primary text-white" : "hover:bg-white",
                )}
              >
                <div>{t(c.labelKey)}</div>
                <div className={cn("text-xs", category === c.id ? "text-white/90" : "text-slate-600")}>{t(c.descriptionKey)}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="min-w-0">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-bold text-slate-700">{activeLabel}</div>
            <div className="text-xs text-slate-500">
              {loading ? t("common.loading") : t("faq.section.results", { count: String(results.length) })}
            </div>
          </div>

          {error ? (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
          ) : null}

          {loading ? (
            <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700">{t("common.loading")}</div>
          ) : results.length === 0 ? (
            <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700">{t("faq.section.empty")}</div>
          ) : (
            <Accordion type="single" collapsible className="mt-4">
              {results.map((item) => {
                const answer = sanitizeRichTextHtml(item.resolved.answer_html);

                return (
                  <AccordionItem key={item.id} value={item.id}>
                    <AccordionTrigger className="text-start">
                      <div className="flex flex-col gap-1">
                        <div className="font-semibold text-slate-900">{item.resolved.question}</div>
                        <div className="text-xs text-slate-500">
                          {(() => {
                            const def = FAQ_CATEGORIES.find((c) => c.id === item.category);
                            return def ? t(def.labelKey) : item.category;
                          })()}
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="text-sm text-slate-700 leading-relaxed">
                      <div className="prose prose-slate max-w-none" dangerouslySetInnerHTML={{ __html: answer }} />
                    </AccordionContent>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
        </div>
      </div>
    </section>
  );
}
