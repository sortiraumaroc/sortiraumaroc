import type { AppLocale } from "@/lib/i18n/types";

export type BlogLocale = "fr" | "en";

export type PublicBlogArticleV1 = {
  blog_article_id: number;
  title: string;
  description_google: string;
  slug: string;
  short: string;
  content: string;
  img: string;
  miniature: string;
  place_id: number;
  blog_category_id: number;
  blog_author_id: number;
  date_creation: string;
  active: 0 | 1;
};

export type PublicBlogArticleV2 = {
  slug: string;
  created_at: string | null;
  updated_at: string | null;
  published_at: string | null;
  is_published: boolean;

  // legacy/compat
  title: string;
  description_google: string;
  short: string;
  content: string;
  img: string;
  miniature: string;

  // bilingual
  title_fr: string;
  title_en: string;
  excerpt_fr: string;
  excerpt_en: string;
  body_html_fr: string;
  body_html_en: string;
  meta_title_fr: string;
  meta_title_en: string;
  meta_description_fr: string;
  meta_description_en: string;
  author_name: string;
  category: string;

  show_read_count?: boolean;
  read_count?: number;

  blocks?: Array<{
    id: string;
    sort_order: number;
    type: string;
    data: unknown;
    resolved: { lang: BlogLocale; data: unknown };
  }>;

  resolved: {
    lang: BlogLocale;
    title: string;
    excerpt: string;
    body_html: string;
    meta_title: string;
    meta_description: string;
    blocks?: Array<{ id: string; sort_order: number; type: string; data: unknown }>;
  };
};

export type PublicBlogArticle = PublicBlogArticleV1 | PublicBlogArticleV2;

export type PublicBlogListItemV1 = PublicBlogArticleV1;
export type PublicBlogListItemV2 = Pick<
  PublicBlogArticleV2,
  | "slug"
  | "created_at"
  | "updated_at"
  | "published_at"
  | "is_published"
  | "title"
  | "description_google"
  | "short"
  | "img"
  | "miniature"
  | "title_fr"
  | "title_en"
  | "excerpt_fr"
  | "excerpt_en"
  | "meta_title_fr"
  | "meta_title_en"
  | "meta_description_fr"
  | "meta_description_en"
  | "author_name"
  | "category"
  | "resolved"
>;

export type PublicBlogListItem = PublicBlogListItemV1 | PublicBlogListItemV2;

export function isPublicBlogListItemV2(item: PublicBlogListItem): item is PublicBlogListItemV2 {
  return !!item && typeof item === "object" && "resolved" in item && (item as any).resolved && typeof (item as any).resolved === "object";
}

export function isPublicBlogArticleV2(item: PublicBlogArticle | null): item is PublicBlogArticleV2 {
  return !!item && typeof item === "object" && "resolved" in item && (item as any).resolved && typeof (item as any).resolved === "object";
}

function localeToBlogLocale(locale: AppLocale): BlogLocale {
  return locale === "en" ? "en" : "fr";
}

export async function listPublicBlogArticles(args: { locale: AppLocale; limit?: number }): Promise<PublicBlogListItem[]> {
  const qs = new URLSearchParams();
  qs.set("lang", localeToBlogLocale(args.locale));
  if (typeof args.limit === "number" && Number.isFinite(args.limit)) qs.set("limit", String(Math.floor(args.limit)));

  const res = await fetch(`/api/public/blog?${qs.toString()}`, { credentials: "omit" });
  if (!res.ok) throw new Error(`Failed to load blog articles (${res.status})`);

  const payload = (await res.json()) as { items?: unknown };
  const items = Array.isArray(payload?.items) ? payload.items : [];
  return items as PublicBlogListItem[];
}

export async function getPublicBlogArticleBySlug(args: {
  slug: string;
  locale: AppLocale;
}): Promise<PublicBlogArticle | null> {
  const slug = String(args.slug ?? "").trim();
  if (!slug) throw new Error("missing_slug");

  const qs = new URLSearchParams();
  qs.set("lang", localeToBlogLocale(args.locale));

  const res = await fetch(`/api/public/blog/${encodeURIComponent(slug)}?${qs.toString()}`, { credentials: "omit" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to load blog article (${res.status})`);

  const payload = (await res.json()) as { item?: unknown };
  if (!payload || typeof payload !== "object" || !payload.item) return null;

  return payload.item as PublicBlogArticle;
}

export async function markPublicBlogArticleRead(args: { slug: string }): Promise<{ ok: true; read_count?: number }> {
  const slug = String(args.slug ?? "").trim();
  if (!slug) throw new Error("missing_slug");

  const res = await fetch(`/api/public/blog/${encodeURIComponent(slug)}/read`, {
    method: "POST",
    credentials: "omit",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({}),
  });

  // Not critical: never hard-fail rendering if this endpoint is unavailable.
  if (!res.ok) return { ok: true };

  const payload = (await res.json()) as { ok?: unknown; read_count?: unknown };
  const nextCount =
    typeof payload?.read_count === "number" && Number.isFinite(payload.read_count) ? Math.max(0, Math.floor(payload.read_count)) : undefined;
  return { ok: true, ...(nextCount !== undefined ? { read_count: nextCount } : {}) };
}

export async function listPublicBlogRelatedArticles(args: {
  slug: string;
  locale: AppLocale;
  limit?: number;
}): Promise<PublicBlogListItem[]> {
  const slug = String(args.slug ?? "").trim();
  if (!slug) throw new Error("missing_slug");

  const qs = new URLSearchParams();
  qs.set("lang", localeToBlogLocale(args.locale));
  if (typeof args.limit === "number" && Number.isFinite(args.limit)) qs.set("limit", String(Math.floor(args.limit)));

  const res = await fetch(`/api/public/blog/${encodeURIComponent(slug)}/related?${qs.toString()}`, { credentials: "omit" });
  if (!res.ok) return [];

  const payload = (await res.json()) as { items?: unknown };
  const items = Array.isArray(payload?.items) ? payload.items : [];
  return items as PublicBlogListItem[];
}

export type PublicBlogAuthor = {
  slug: string;
  display_name: string;
  bio_short: string;
  avatar_url: string | null;
  role: string;
  profile_url: string | null;
};

export type PublicBlogAuthorPayload = {
  author: PublicBlogAuthor;
  items: PublicBlogListItem[];
  page: number;
  limit: number;
  total: number;
};

export async function getPublicBlogAuthorBySlug(args: {
  slug: string;
  locale: AppLocale;
  page?: number;
  limit?: number;
}): Promise<PublicBlogAuthorPayload | null> {
  const slug = String(args.slug ?? "").trim();
  if (!slug) throw new Error("missing_slug");

  const qs = new URLSearchParams();
  qs.set("lang", localeToBlogLocale(args.locale));

  if (typeof args.page === "number" && Number.isFinite(args.page)) {
    qs.set("page", String(Math.max(1, Math.floor(args.page))));
  }

  if (typeof args.limit === "number" && Number.isFinite(args.limit)) {
    qs.set("limit", String(Math.max(1, Math.floor(args.limit))));
  }

  const res = await fetch(`/api/public/blog/author/${encodeURIComponent(slug)}?${qs.toString()}`, { credentials: "omit" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to load blog author (${res.status})`);

  const payload = (await res.json()) as Partial<PublicBlogAuthorPayload>;
  if (!payload || typeof payload !== "object" || !payload.author) return null;

  return {
    author: payload.author as PublicBlogAuthor,
    items: Array.isArray(payload.items) ? (payload.items as PublicBlogListItem[]) : [],
    page: typeof payload.page === "number" && Number.isFinite(payload.page) ? payload.page : 1,
    limit: typeof payload.limit === "number" && Number.isFinite(payload.limit) ? payload.limit : 12,
    total: typeof payload.total === "number" && Number.isFinite(payload.total) ? payload.total : 0,
  };
}
