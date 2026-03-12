import * as React from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { ChevronLeft, MapPin, Star, ThumbsUp, ThumbsDown, UtensilsCrossed } from "lucide-react";

import { applySeo, setJsonLd, buildI18nSeoFields } from "@/lib/seo";
import { useI18n } from "@/lib/i18n";
import { buildEstablishmentUrl } from "@/lib/establishmentUrl";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DishDetailData {
  dish: {
    id: string;
    title: string;
    description: string | null;
    price: number | null;
    currency: string;
    photos: string[];
    labels: string[];
    slug: string | null;
    categoryName: string | null;
    likes: number;
    dislikes: number;
  };
  establishment: {
    id: string;
    slug: string | null;
    name: string | null;
    universe: string | null;
    city: string | null;
    address: string | null;
    cover_url: string | null;
    cuisine_types: string[] | null;
    subcategory: string | null;
    avg_rating: number | null;
    review_count: number | null;
    google_rating: number | null;
    google_review_count: number | null;
  };
  similarDishes: Array<{
    id: string;
    title: string;
    slug: string | null;
    price: number | null;
    currency: string;
    labels: string[];
  }>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatPrice(price: number | null | undefined, currency: string): string {
  if (price == null || !Number.isFinite(price)) return "";
  return `${price.toFixed(0)} ${currency}`;
}

const labelDisplayMap: Record<string, string> = {
  best_seller: "Best seller",
  populaire: "Best seller",
  vegetarien: "Végétarien",
  végétarien: "Végétarien",
  nouveau: "Nouveau",
  new: "Nouveau",
  specialite: "Spécialité",
  spécialité: "Spécialité",
  healthy: "Healthy",
  sain: "Healthy",
  rapide: "Rapide",
};

function displayLabel(raw: string): string {
  return labelDisplayMap[raw.toLowerCase().trim()] ?? raw;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DishDetail() {
  const { id: restaurantId, dishSlug } = useParams<{ id: string; dishSlug: string }>();
  const navigate = useNavigate();
  const { t, locale } = useI18n();

  const [data, setData] = React.useState<DishDetailData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState(false);

  React.useEffect(() => {
    let active = true;

    const fetchDish = async () => {
      if (!restaurantId || !dishSlug) return;

      try {
        setLoading(true);
        setError(false);

        const res = await fetch(
          `/api/public/establishments/${encodeURIComponent(restaurantId)}/menu/${encodeURIComponent(dishSlug)}`,
          { credentials: "omit" },
        );

        if (!res.ok) {
          if (active) setError(true);
          return;
        }

        const payload: DishDetailData = await res.json();
        if (!active) return;
        setData(payload);
      } catch {
        if (active) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    };

    void fetchDish();
    return () => { active = false; };
  }, [restaurantId, dishSlug]);

  // SEO
  React.useEffect(() => {
    if (!data) return;

    const { dish, establishment } = data;
    const estName = establishment.name ?? "Restaurant";
    const cityLabel = establishment.city ? ` à ${establishment.city}` : "";
    const priceLabel = dish.price != null ? ` — ${formatPrice(dish.price, dish.currency)}` : "";

    const title = `${dish.title}${priceLabel} | ${estName}${cityLabel} | sam.ma`;
    const description = [
      dish.description?.slice(0, 120),
      dish.categoryName ? `Catégorie : ${dish.categoryName}.` : null,
      dish.likes > 0 ? `${dish.likes} like${dish.likes > 1 ? "s" : ""}.` : null,
      `Chez ${estName}${cityLabel}.`,
    ].filter(Boolean).join(" ");

    applySeo({
      title,
      description,
      ogType: "article",
      ogImageUrl: dish.photos[0] ?? establishment.cover_url ?? undefined,
      canonicalStripQuery: true,
      ...buildI18nSeoFields(locale),
    });

    // JSON-LD MenuItem
    const schema: Record<string, unknown> = {
      "@context": "https://schema.org",
      "@type": "MenuItem",
      name: dish.title,
      ...(dish.description && { description: dish.description }),
      ...(dish.price != null && {
        offers: {
          "@type": "Offer",
          price: dish.price,
          priceCurrency: dish.currency,
        },
      }),
      ...(dish.photos[0] && { image: dish.photos[0] }),
    };
    setJsonLd("dish-detail", schema);

    return () => {
      // Cleanup JSON-LD on unmount
      const el = document.getElementById("sam-jsonld-dish-detail");
      el?.remove();
    };
  }, [data, locale]);

  // ── Loading skeleton ──
  if (loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div className="animate-pulse space-y-6">
          <div className="h-6 w-32 rounded bg-slate-200" />
          <div className="h-64 rounded-2xl bg-slate-200" />
          <div className="h-8 w-2/3 rounded bg-slate-200" />
          <div className="h-4 w-full rounded bg-slate-200" />
          <div className="h-4 w-3/4 rounded bg-slate-200" />
        </div>
      </div>
    );
  }

  // ── Error / not found ──
  if (error || !data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <UtensilsCrossed className="mx-auto h-12 w-12 text-slate-300" />
        <h1 className="mt-4 text-xl font-semibold text-slate-700">Plat introuvable</h1>
        <p className="mt-2 text-sm text-slate-500">Ce plat n'existe pas ou a été retiré du menu.</p>
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-[#a3001d] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#8a0019] transition"
        >
          <ChevronLeft className="h-4 w-4" />
          Retour
        </button>
      </div>
    );
  }

  const { dish, establishment, similarDishes } = data;

  const restaurantUrl = buildEstablishmentUrl({
    id: establishment.id,
    slug: establishment.slug,
    name: establishment.name,
    universe: establishment.universe as "restaurant" | undefined,
  });

  const mainPhoto = dish.photos[0] ?? establishment.cover_url;
  const priceDisplay = formatPrice(dish.price, dish.currency);

  const totalVotes = dish.likes + dish.dislikes;
  const likePercent = totalVotes > 0 ? Math.round((dish.likes / totalVotes) * 100) : null;

  const rating = establishment.avg_rating ?? establishment.google_rating;
  const reviewCount = establishment.review_count ?? establishment.google_review_count ?? 0;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-10">
      {/* ── Breadcrumb ── */}
      <nav className="mb-4 flex items-center gap-1.5 text-sm text-slate-500">
        <Link to="/" className="hover:text-[#a3001d] transition-colors">Accueil</Link>
        <span>/</span>
        <Link to={restaurantUrl} className="hover:text-[#a3001d] transition-colors line-clamp-1">
          {establishment.name ?? "Restaurant"}
        </Link>
        <span>/</span>
        <span className="text-slate-700 font-medium line-clamp-1">{dish.title}</span>
      </nav>

      {/* ── Photo ── */}
      {mainPhoto && (
        <div className="relative mb-6 overflow-hidden rounded-2xl">
          <img
            src={mainPhoto}
            alt={dish.title}
            className="w-full h-56 sm:h-72 object-cover"
            loading="eager"
          />
          {dish.categoryName && (
            <span className="absolute top-3 left-3 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-slate-700 shadow-sm backdrop-blur-sm">
              {dish.categoryName}
            </span>
          )}
        </div>
      )}

      {/* ── Title + Price ── */}
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">{dish.title}</h1>
        {priceDisplay && (
          <div className="shrink-0 text-xl sm:text-2xl font-bold text-[#a3001d] tabular-nums whitespace-nowrap">
            {priceDisplay}
          </div>
        )}
      </div>

      {/* ── Badges ── */}
      {dish.labels.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {dish.labels.map((label) => (
            <span
              key={label}
              className="inline-flex items-center rounded-full bg-[#a3001d]/10 px-3 py-1 text-xs font-semibold text-[#a3001d]"
            >
              {displayLabel(label)}
            </span>
          ))}
        </div>
      )}

      {/* ── Description ── */}
      {dish.description && (
        <p className="mt-4 text-base text-slate-600 leading-relaxed">{dish.description}</p>
      )}

      {/* ── Votes ── */}
      {totalVotes > 0 && (
        <div className="mt-4 flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1.5 text-emerald-600">
            <ThumbsUp className="h-4 w-4" />
            <span className="font-semibold">{dish.likes}</span>
          </div>
          <div className="flex items-center gap-1.5 text-red-500">
            <ThumbsDown className="h-4 w-4" />
            <span className="font-semibold">{dish.dislikes}</span>
          </div>
          {likePercent !== null && (
            <span className="text-slate-400">
              {likePercent}% d'avis positifs
            </span>
          )}
        </div>
      )}

      {/* ── Restaurant card ── */}
      <Link
        to={restaurantUrl}
        className="mt-8 block rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5 hover:border-[#a3001d]/30 transition group"
      >
        <div className="flex items-center gap-4">
          {establishment.cover_url && (
            <img
              src={establishment.cover_url}
              alt={establishment.name ?? ""}
              className="h-14 w-14 rounded-xl object-cover shrink-0"
            />
          )}
          <div className="min-w-0">
            <div className="text-base font-semibold text-slate-900 group-hover:text-[#a3001d] transition-colors line-clamp-1">
              {establishment.name}
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-sm text-slate-500">
              {establishment.city && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" />
                  {establishment.city}
                </span>
              )}
              {rating != null && (
                <span className="flex items-center gap-1">
                  <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />
                  {Number(rating).toFixed(1)}
                  {reviewCount > 0 && <span className="text-slate-400">({reviewCount})</span>}
                </span>
              )}
            </div>
            {establishment.cuisine_types && establishment.cuisine_types.length > 0 && (
              <div className="mt-1 text-xs text-slate-400 line-clamp-1">
                {establishment.cuisine_types.slice(0, 3).join(" · ")}
              </div>
            )}
          </div>
        </div>
      </Link>

      {/* ── Bouton réserver ── */}
      <div className="mt-6">
        <Link
          to={`/booking/${encodeURIComponent(establishment.id)}`}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#a3001d] px-6 py-3 text-base font-semibold text-white hover:bg-[#8a0019] transition shadow-sm"
        >
          Réserver chez {establishment.name ?? "ce restaurant"}
        </Link>
      </div>

      {/* ── Plats similaires ── */}
      {similarDishes.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold text-slate-900">Dans la même catégorie</h2>
          <div className="mt-4 space-y-3">
            {similarDishes.map((d) => {
              const dishUrl = d.slug
                ? `/restaurant/${encodeURIComponent(restaurantId ?? establishment.id)}/menu/${encodeURIComponent(d.slug)}`
                : null;

              const card = (
                <div
                  className={cn(
                    "rounded-xl border border-slate-200 bg-white p-4 flex items-center justify-between gap-3",
                    dishUrl && "hover:border-[#a3001d]/20 transition",
                  )}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-slate-900 line-clamp-1">{d.title}</div>
                    {d.labels.length > 0 && (
                      <div className="mt-1 flex gap-1.5">
                        {d.labels.slice(0, 2).map((l) => (
                          <span key={l} className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                            {displayLabel(l)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  {d.price != null && (
                    <span className="shrink-0 text-sm font-semibold text-[#a3001d] tabular-nums whitespace-nowrap">
                      {formatPrice(d.price, d.currency)}
                    </span>
                  )}
                </div>
              );

              return dishUrl ? (
                <Link key={d.id} to={dishUrl}>
                  {card}
                </Link>
              ) : (
                <div key={d.id}>{card}</div>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Retour au restaurant ── */}
      <div className="mt-8 text-center">
        <Link
          to={restaurantUrl}
          className="inline-flex items-center gap-2 text-sm font-semibold text-[#a3001d] hover:underline"
        >
          <ChevronLeft className="h-4 w-4" />
          Voir le menu complet
        </Link>
      </div>
    </div>
  );
}
