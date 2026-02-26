import type { Request, Response } from "express";

import { createModuleLogger } from "../lib/logger";

const log = createModuleLogger("publicEstablishments");

import { transformWizardHoursToOpeningHours } from "../lib/transformHours";
import { loadOrComputePreferences, applyPersonalizationBonus } from "../lib/userPreferences";
import { getRamadanConfig } from "../platformSettings";
import { generateSearchFallback, type SearchFallbackResult } from "../lib/searchFallback";
import { getContextualBoostsForNow, applyContextualBoosting } from "../lib/search/contextualBoosting";
import { OCCUPYING_RESERVATION_STATUSES } from "../../shared/reservationStates";

import {
  getAdminSupabase,
  isUuid,
  generateEstablishmentSlug,
  asString,
  asRecord,
  asInt,
  centsToMad,
  dateYmdToEndOfDayIso,
  addDaysIso,
  MOROCCO_TZ,
  moroccoDateParts,
  toYmd,
  timeHm,
  moroccoMinutes,
  promoPercentFromSlot,
  getRestaurantServiceLabelFromMinutes,
  resolveEstablishmentId,
  isTimeoutError,
  withTimeout,
  getUserFromBearerToken,
  normalizeUserMetaString,
  getRequestLang,
  getSearchLang,
  getRequestBaseUrl,
  getRequestIp,
  type PublicDateSlots,
  type PublicEstablishmentListItem,
  type PublicEstablishmentsListResponse,
  maxPromoPercent,
} from "./publicHelpers";

type SitemapUrl = {
  loc: string;
  lastmod?: string;
  changefreq?: string;
  priority?: number;
  alternates?: { fr: string; en: string; es: string; it: string; ar: string; xDefault: string };
};

export async function getPublicSitemapXml(req: Request, res: Response) {
  const supabase = getAdminSupabase();

  const [
    { data: establishments, error: estError },
    { data: contentPagesRaw, error: contentError },
    { data: blogArticlesRaw, error: blogError },
    { data: landingPagesRaw, error: landingError },
  ] = await Promise.all([
    supabase
      .from("establishments")
      .select("id,universe,updated_at")
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(50000),
    supabase
      .from("content_pages")
      .select("slug_fr,slug_en,canonical_url_fr,canonical_url_en,updated_at")
      .eq("status", "published")
      .limit(500),
    supabase
      .from("blog_articles")
      .select("slug,updated_at")
      .eq("is_published", true)
      .limit(500),
    supabase
      .from("landing_pages")
      .select("slug,priority,updated_at")
      .eq("is_active", true)
      .limit(1000),
  ]);

  const contentPages = contentError ? [] : (contentPagesRaw ?? []);
  const blogArticles = blogError ? [] : (blogArticlesRaw ?? []);
  const landingPages = landingError ? [] : (landingPagesRaw ?? []);
  if (landingError) log.error({ err: landingError }, "sitemap: failed to load landing_pages");
  if (contentError)
    log.error({ err: contentError }, "sitemap: failed to load content_pages");
  if (blogError)
    log.error({ err: blogError }, "sitemap: failed to load blog_articles");

  if (estError) return res.status(500).send("Unable to generate sitemap");

  const baseUrl = (() => {
    const host = String(req.get("host") ?? "");
    const proto = String(
      req.get("x-forwarded-proto") ?? req.protocol ?? "https",
    );
    if (!host) return "";
    return `${proto}://${host}`;
  })();

  const urls: SitemapUrl[] = [];

  // Static pages with high priority
  const staticPaths: Array<{
    path: string;
    changefreq: string;
    priority: number;
  }> = [
    { path: "/", changefreq: "daily", priority: 1.0 },
    { path: "/results", changefreq: "daily", priority: 0.9 },
    { path: "/faq", changefreq: "weekly", priority: 0.7 },
    { path: "/aide", changefreq: "weekly", priority: 0.7 },
    {
      path: "/ajouter-mon-etablissement",
      changefreq: "monthly",
      priority: 0.6,
    },
  ];

  for (const item of staticPaths) {
    urls.push({
      loc: baseUrl ? `${baseUrl}${item.path}` : item.path,
      changefreq: item.changefreq,
      priority: item.priority,
    });
  }

  // Content pages (localized slugs)
  for (const row of (contentPages ?? []) as Array<{
    slug_fr: string | null;
    slug_en: string | null;
    canonical_url_fr?: string | null;
    canonical_url_en?: string | null;
    updated_at?: string | null;
  }>) {
    const slugFr = row.slug_fr ? String(row.slug_fr) : "";
    const slugEn = row.slug_en ? String(row.slug_en) : "";
    if (!slugFr || !slugEn) continue;

    const frPath = `/content/${slugFr}`;
    const enPath = `/en/content/${slugEn}`;

    const frUrl =
      String(row.canonical_url_fr ?? "").trim() ||
      (baseUrl ? `${baseUrl}${frPath}` : frPath);
    const enUrl =
      String(row.canonical_url_en ?? "").trim() ||
      (baseUrl ? `${baseUrl}${enPath}` : enPath);

    const esUrl = baseUrl ? `${baseUrl}/es/content/${slugFr}` : `/es/content/${slugFr}`;
    const itUrl = baseUrl ? `${baseUrl}/it/content/${slugFr}` : `/it/content/${slugFr}`;
    const arUrl = baseUrl ? `${baseUrl}/ar/content/${slugFr}` : `/ar/content/${slugFr}`;

    urls.push({
      loc: frUrl,
      alternates: {
        fr: frUrl,
        en: enUrl,
        es: esUrl,
        it: itUrl,
        ar: arUrl,
        xDefault: frUrl,
      },
      lastmod: row.updated_at ? String(row.updated_at) : undefined,
      changefreq: "monthly",
      priority: 0.6,
    });
  }

  // Blog articles
  for (const row of (blogArticles ?? []) as Array<{
    slug: string | null;
    updated_at?: string | null;
  }>) {
    const slug = row.slug ? String(row.slug) : null;
    if (!slug) continue;
    urls.push({
      loc: baseUrl ? `${baseUrl}/blog/${slug}` : `/blog/${slug}`,
      lastmod: row.updated_at ? String(row.updated_at) : undefined,
      changefreq: "weekly",
      priority: 0.7,
    });
  }

  // Landing pages (SEO)
  for (const lp of landingPages as Array<{ slug?: string | null; priority?: number | null; updated_at?: string | null }>) {
    const lpSlug = lp.slug ? String(lp.slug) : null;
    if (!lpSlug) continue;
    urls.push({
      loc: baseUrl ? `${baseUrl}/${lpSlug}` : `/${lpSlug}`,
      lastmod: lp.updated_at ? String(lp.updated_at) : undefined,
      changefreq: "weekly",
      priority: typeof lp.priority === "number" ? lp.priority : 0.8,
    });
  }

  // Establishments (dynamic content)
  for (const row of (establishments ?? []) as Array<{
    id: string;
    universe: unknown;
    updated_at?: string | null;
  }>) {
    const id = String(row.id ?? "");
    if (!id) continue;
    const path = buildEstablishmentDetailsUrl(id, row.universe);
    urls.push({
      loc: baseUrl ? `${baseUrl}${path}` : path,
      lastmod: row.updated_at ? String(row.updated_at) : undefined,
      changefreq: "weekly",
      priority: 0.8,
    });
  }

  const escapeXml = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&apos;");

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...urls.map((u) => {
      const lastmod = u.lastmod
        ? `<lastmod>${escapeXml(new Date(u.lastmod).toISOString())}</lastmod>`
        : "";
      const changefreq = u.changefreq
        ? `<changefreq>${escapeXml(u.changefreq)}</changefreq>`
        : "";
      const priority = u.priority ? `<priority>${u.priority}</priority>` : "";

      if (!baseUrl) {
        return `<url><loc>${escapeXml(u.loc)}</loc>${lastmod}${changefreq}${priority}</url>`;
      }

      let pathname = "";
      try {
        const parsed = new URL(u.loc);
        pathname = parsed.pathname || "/";
      } catch (err) {
        log.warn({ err, loc: u.loc }, "failed to parse sitemap URL");
        pathname = u.loc.startsWith(baseUrl)
          ? u.loc.slice(baseUrl.length)
          : u.loc;
      }

      const defaultFrUrl = `${baseUrl}${pathname}`;
      const defaultEnUrl =
        pathname === "/" ? `${baseUrl}/en/` : `${baseUrl}/en${pathname}`;
      const defaultEsUrl =
        pathname === "/" ? `${baseUrl}/es/` : `${baseUrl}/es${pathname}`;
      const defaultItUrl =
        pathname === "/" ? `${baseUrl}/it/` : `${baseUrl}/it${pathname}`;
      const defaultArUrl =
        pathname === "/" ? `${baseUrl}/ar/` : `${baseUrl}/ar${pathname}`;
      const defaultXDefaultUrl = defaultFrUrl;

      const frUrl = u.alternates?.fr ?? defaultFrUrl;
      const enUrl = u.alternates?.en ?? defaultEnUrl;
      const esUrl = u.alternates?.es ?? defaultEsUrl;
      const itUrl = u.alternates?.it ?? defaultItUrl;
      const arUrl = u.alternates?.ar ?? defaultArUrl;
      const xDefaultUrl = u.alternates?.xDefault ?? defaultXDefaultUrl;

      const alternates = [
        `<xhtml:link rel="alternate" hreflang="fr" href="${escapeXml(frUrl)}" />`,
        `<xhtml:link rel="alternate" hreflang="en" href="${escapeXml(enUrl)}" />`,
        `<xhtml:link rel="alternate" hreflang="es" href="${escapeXml(esUrl)}" />`,
        `<xhtml:link rel="alternate" hreflang="it" href="${escapeXml(itUrl)}" />`,
        `<xhtml:link rel="alternate" hreflang="ar" href="${escapeXml(arUrl)}" />`,
        `<xhtml:link rel="alternate" hreflang="x-default" href="${escapeXml(xDefaultUrl)}" />`,
      ].join("");

      return `<url><loc>${escapeXml(frUrl)}</loc>${alternates}${lastmod}${changefreq}${priority}</url>`;
    }),
    "</urlset>",
  ].join("");

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.status(200).send(xml);
}

export async function getPublicEstablishment(req: Request, res: Response) {
  const ref = String(req.params.ref ?? "");
  const title = typeof req.query.title === "string" ? req.query.title : null;

  const establishmentId = await resolveEstablishmentId({ ref, title });
  if (!establishmentId)
    return res.status(404).json({ error: "establishment_not_found" });

  const supabase = getAdminSupabase();

  const { data: establishment, error: estError } = await supabase
    .from("establishments")
    .select(
      "id,slug,name,universe,subcategory,category,city,address,postal_code,region,country,neighborhood,lat,lng,description_short,description_long,phone,whatsapp,website,social_links,cover_url,gallery_urls,hours,tags,highlights,amenities,extra,booking_enabled,status,menu_digital_enabled,email,google_maps_url,google_rating,google_review_count,hide_google_reviews,specialties,cuisine_types,ambiance_tags,service_types",
    )
    .eq("id", establishmentId)
    .maybeSingle();

  if (estError) return res.status(500).json({ error: estError.message });
  if (!establishment)
    return res.status(404).json({ error: "establishment_not_found" });

  const nowIso = new Date().toISOString();

  const [
    { data: slots, error: slotsError },
    { data: packs, error: packsError },
    { data: bookingPolicy, error: bookingPolicyError },
    { data: inventoryCategories, error: inventoryCategoriesError },
    { data: inventoryItems, error: inventoryItemsError },
  ] = await Promise.all([
    supabase
      .from("pro_slots")
      .select(
        "id,establishment_id,starts_at,ends_at,capacity,base_price,promo_type,promo_value,promo_label,service_label,active",
      )
      .eq("establishment_id", establishmentId)
      .eq("active", true)
      .gte("starts_at", nowIso)
      .order("starts_at", { ascending: true })
      .limit(500),
    supabase
      .from("packs")
      .select(
        "id,establishment_id,title,description,label,items,price,original_price,is_limited,stock,availability,max_reservations,active,valid_from,valid_to,conditions",
      )
      .eq("establishment_id", establishmentId)
      .eq("active", true)
      .order("created_at", { ascending: true })
      .limit(200),
    supabase
      .from("booking_policies")
      .select("*")
      .eq("establishment_id", establishmentId)
      .maybeSingle(),
    // Fetch inventory categories
    supabase
      .from("pro_inventory_categories")
      .select("id,title,description,parent_id,sort_order,is_active")
      .eq("establishment_id", establishmentId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .limit(100),
    // Fetch inventory items
    supabase
      .from("pro_inventory_items")
      .select("id,category_id,title,description,base_price,currency,labels,photos,sort_order,is_active")
      .eq("establishment_id", establishmentId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .limit(500),
  ]);

  if (slotsError) return res.status(500).json({ error: slotsError.message });
  if (packsError) return res.status(500).json({ error: packsError.message });
  if (bookingPolicyError)
    return res.status(500).json({ error: bookingPolicyError.message });
  // Note: inventory errors are non-fatal - we just won't show menu if it fails
  if (inventoryCategoriesError) log.error({ err: inventoryCategoriesError }, "Inventory categories error");
  if (inventoryItemsError) log.error({ err: inventoryItemsError }, "Inventory items error");

  // Group slots to a DateSlots format for the public booking widgets.
  const slotsArr = (slots ?? []) as Array<{
    id: string;
    starts_at: string;
    capacity: number | null;
    promo_type: string | null;
    promo_value: number | null;
    promo_label: string | null;
    service_label: string | null;
  }>;

  const usedBySlotId = new Map<string, number>();
  const usedByStartsAtIso = new Map<string, number>();

  const minStartsAt = slotsArr[0]?.starts_at ?? null;
  const maxStartsAt = slotsArr[slotsArr.length - 1]?.starts_at ?? null;

  if (slotsArr.length) {
    const slotIds = slotsArr.map((s) => s.id);

    const [{ data: bySlot }, { data: byTime }] = await Promise.all([
      supabase
        .from("reservations")
        .select("slot_id, party_size")
        .in("slot_id", slotIds)
        .in("status", OCCUPYING_RESERVATION_STATUSES as unknown as string[])
        .limit(5000),
      minStartsAt && maxStartsAt
        ? supabase
            .from("reservations")
            .select("starts_at, party_size")
            .eq("establishment_id", establishmentId)
            .is("slot_id", null)
            .in("status", ["confirmed", "pending_pro_validation", "requested"])
            .gte("starts_at", minStartsAt)
            .lte("starts_at", maxStartsAt)
            .limit(5000)
        : Promise.resolve({
            data: [] as Array<{ starts_at: string; party_size: number | null }>,
          }),
    ]);

    for (const r of (bySlot ?? []) as Array<{
      slot_id: string | null;
      party_size: number | null;
    }>) {
      const slotId = r.slot_id;
      if (!slotId) continue;
      const size =
        typeof r.party_size === "number" && Number.isFinite(r.party_size)
          ? Math.max(0, Math.round(r.party_size))
          : 0;
      usedBySlotId.set(slotId, (usedBySlotId.get(slotId) ?? 0) + size);
    }

    for (const r of (byTime ?? []) as Array<{
      starts_at: string;
      party_size: number | null;
    }>) {
      const startsAt = String(r.starts_at ?? "").trim();
      if (!startsAt) continue;
      const size =
        typeof r.party_size === "number" && Number.isFinite(r.party_size)
          ? Math.max(0, Math.round(r.party_size))
          : 0;
      usedByStartsAtIso.set(
        startsAt,
        (usedByStartsAtIso.get(startsAt) ?? 0) + size,
      );
    }
  }

  const byDate = new Map<string, PublicDateSlots>();

  for (const s of slotsArr) {
    const dt = new Date(s.starts_at);
    if (!Number.isFinite(dt.getTime())) continue;

    const date = toYmd(dt);
    const time = timeHm(dt);

    const minutes = moroccoMinutes(dt);
    const derivedServiceLabel = getRestaurantServiceLabelFromMinutes(minutes);
    const serviceLabel =
      String(s.service_label ?? "").trim() || derivedServiceLabel;

    const dateSlot = byDate.get(date) ?? {
      date,
      services: [],
      promos: {},
      slotIds: {},
      remaining: {},
    };
    const promos = dateSlot.promos ?? {};
    const slotIds = dateSlot.slotIds ?? {};
    const remaining =
      (
        dateSlot as PublicDateSlots & {
          remaining?: Record<string, number | null>;
        }
      ).remaining ?? {};

    const promo = promoPercentFromSlot({
      promo_type: s.promo_type,
      promo_value: s.promo_value,
    });
    promos[time] = promo;
    slotIds[time] = s.id;

    const used =
      usedBySlotId.get(s.id) ?? usedByStartsAtIso.get(s.starts_at) ?? 0;
    const cap =
      typeof s.capacity === "number" && Number.isFinite(s.capacity)
        ? Math.max(0, Math.round(s.capacity))
        : null;
    remaining[time] = cap == null ? null : Math.max(0, cap - used);

    const existingService = dateSlot.services.find(
      (x) => x.service === serviceLabel,
    );
    if (existingService) {
      if (!existingService.times.includes(time))
        existingService.times.push(time);
    } else {
      dateSlot.services.push({ service: serviceLabel, times: [time] });
    }

    // Keep service time ordering
    for (const svc of dateSlot.services) {
      svc.times.sort((a, b) => a.localeCompare(b));
    }

    (
      dateSlot as PublicDateSlots & {
        remaining?: Record<string, number | null>;
      }
    ).remaining = remaining;
    byDate.set(date, dateSlot);
  }

  const availableSlots = Array.from(byDate.values()).sort((a, b) =>
    a.date.localeCompare(b.date),
  );

  const normalizedPacks = ((packs ?? []) as Array<Record<string, unknown>>).map(
    (p) => {
      // Packs are stored in DB in cents, but the public consumer UI expects MAD amounts.
      // Normalize at the API boundary to avoid leaking cents into the UI.
      const priceMad = centsToMad(p.price);
      const originalMad = centsToMad(p.original_price);
      return {
        ...p,
        price: priceMad,
        original_price: originalMad,
      };
    },
  );

  // Generate slug on-the-fly if not present in database
  const estSlug = establishment.slug ?? generateEstablishmentSlug(
    establishment.name as string | null,
    establishment.city as string | null
  );

  // Generate menu digital URL if enabled
  const menuDigitalBaseUrl = process.env.MENU_DIGITAL_BASE_URL || "https://menu.sam.ma";
  const menuDigitalEnabled = Boolean((establishment as any).menu_digital_enabled);
  const menuDigitalUrl = menuDigitalEnabled && estSlug
    ? `${menuDigitalBaseUrl}/${estSlug}`
    : null;

  const establishmentWithSlug = {
    ...establishment,
    slug: estSlug,
    menu_digital_enabled: menuDigitalEnabled,
    menu_digital_url: menuDigitalUrl,
  };

  // Transform inventory into MenuCategory format for the frontend
  const menuCategories = transformInventoryToMenuCategories(
    inventoryCategories ?? [],
    inventoryItems ?? []
  );

  return res.json({
    establishment: establishmentWithSlug,
    booking_policy: bookingPolicy ?? null,
    offers: {
      slots: slotsArr,
      packs: normalizedPacks,
      availableSlots,
    },
    menu: menuCategories,
  });
}

// Helper function to transform pro_inventory data to MenuCategory format
function transformInventoryToMenuCategories(
  categories: Array<{
    id: string;
    title: string;
    description?: string | null;
    parent_id?: string | null;
    sort_order?: number;
  }>,
  items: Array<{
    id: string;
    category_id?: string | null;
    title: string;
    description?: string | null;
    base_price?: number | null;
    currency?: string | null;
    labels?: string[] | null;
    photos?: string[] | null;
    sort_order?: number;
  }>
): Array<{
  id: string;
  name: string;
  items: Array<{
    id: number;
    name: string;
    description: string;
    price: string;
    badges?: string[];
  }>;
}> {
  // Build category map
  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  // Group items by category
  const itemsByCategory = new Map<string, typeof items>();
  const uncategorizedItems: typeof items = [];

  for (const item of items) {
    if (item.category_id && categoryMap.has(item.category_id)) {
      const existing = itemsByCategory.get(item.category_id) ?? [];
      existing.push(item);
      itemsByCategory.set(item.category_id, existing);
    } else {
      uncategorizedItems.push(item);
    }
  }

  // Map labels to badge format
  const labelToBadge = (label: string): string | null => {
    const l = label.toLowerCase().trim();
    if (l === "best_seller" || l === "populaire") return "Best seller";
    if (l === "vegetarien" || l === "végétarien") return "Végétarien";
    if (l === "nouveau" || l === "new") return "Nouveau";
    if (l === "specialite" || l === "spécialité") return "Spécialité";
    if (l === "healthy" || l === "sain") return "Healthy";
    if (l === "rapide") return "Rapide";
    return null;
  };

  // Format price
  const formatPrice = (price: number | null | undefined, currency: string | null | undefined): string => {
    if (price == null || !Number.isFinite(price)) return "";
    const curr = currency || "MAD";
    return `${price.toFixed(0)} ${curr}`;
  };

  // Transform item to MenuSection format
  const transformItem = (item: typeof items[0], index: number) => {
    const badges = (item.labels ?? [])
      .map(labelToBadge)
      .filter((b): b is string => b !== null);

    return {
      id: index + 1,
      name: item.title,
      description: item.description ?? "",
      price: formatPrice(item.base_price, item.currency),
      badges: badges.length > 0 ? badges : undefined,
    };
  };

  // Build result - only include root categories (no parent_id)
  // For now, flatten subcategories into their parents
  const rootCategories = categories.filter((c) => !c.parent_id);
  const result: Array<{
    id: string;
    name: string;
    items: Array<{
      id: number;
      name: string;
      description: string;
      price: string;
      badges?: string[];
    }>;
  }> = [];

  for (const cat of rootCategories) {
    const catItems = itemsByCategory.get(cat.id) ?? [];

    // Also include items from subcategories
    const subcategories = categories.filter((c) => c.parent_id === cat.id);
    for (const sub of subcategories) {
      const subItems = itemsByCategory.get(sub.id) ?? [];
      catItems.push(...subItems);
    }

    if (catItems.length === 0) continue;

    result.push({
      id: cat.id,
      name: cat.title,
      items: catItems.map((item, i) => transformItem(item, i)),
    });
  }

  // Add uncategorized items if any
  if (uncategorizedItems.length > 0) {
    result.push({
      id: "uncategorized",
      name: "Autres",
      items: uncategorizedItems.map((item, i) => transformItem(item, i)),
    });
  }

  return result;
}


function normalizePublicUniverseAliases(raw: unknown): string[] {
  const u = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!u) return [];

  // The `establishments.universe` column is backed by a Postgres enum.
  // Passing unknown values (e.g. "restaurants", "hotels", "sport") triggers a 500.
  // So we map UI-friendly values to DB-safe enum values and drop anything else.
  const aliases: Record<string, string[]> = {
    restaurants: ["restaurant"],
    restaurant: ["restaurant"],

    loisirs: ["loisir"],
    loisir: ["loisir"],
    sport: ["loisir"],

    wellness: ["wellness"],

    hebergement: ["hebergement"],
    hotels: ["hebergement"],
    hotel: ["hebergement"],

    culture: ["culture"],

    rentacar: ["rentacar"],

    // NOTE: "shopping" exists as a UI universe, but may not exist in the DB enum.
    // Returning [] means "no filter" to avoid a backend 500.
    shopping: [],
  };

  const allowed = new Set([
    "restaurant",
    "loisir",
    "hebergement",
    "wellness",
    "culture",
    "rentacar",
  ]);
  const candidates = aliases[u] ?? [u];
  const safe = candidates.filter((value) => allowed.has(value));

  // If the user asked for an unknown universe, don't filter at all.
  // This avoids breaking the whole page with a backend 500.
  return safe;
}


export async function getPublicBillingCompanyProfile(
  _req: Request,
  res: Response,
) {
  try {
    const profile = await getBillingCompanyProfile();
    res.json({ ok: true, profile });
  } catch (e) {
    log.error({ err: e }, "getPublicBillingCompanyProfile failed");
    res.status(500).json({ error: "billing_profile_unavailable" });
  }
}

export async function listPublicEstablishments(req: Request, res: Response) {
  const limitRaw =
    typeof req.query.limit === "string" ? Number(req.query.limit) : 12;
  const limit = Number.isFinite(limitRaw)
    ? Math.min(50, Math.max(1, Math.floor(limitRaw)))
    : 12;

  const offsetRaw =
    typeof req.query.offset === "string" ? Number(req.query.offset) : 0;
  const offset = Number.isFinite(offsetRaw)
    ? Math.max(0, Math.floor(offsetRaw))
    : 0;

  // Cursor-based pagination params
  const cursor = asString(req.query.cursor) || null;
  const cursorScoreRaw = typeof req.query.cs === "string" ? Number(req.query.cs) : NaN;
  const cursorScore = Number.isFinite(cursorScoreRaw) ? cursorScoreRaw : null;
  const cursorDate = asString(req.query.cd) || null; // ISO date for fallback path

  // Backward compatibility: warn if offset is used without cursor
  if (offset > 0 && !cursor) {
    log.warn("DEPRECATED: offset-based pagination used without cursor, migrate to cursor-based pagination");
  }

  const q = asString(req.query.q);
  const city = asString(req.query.city);
  const category = asString(req.query.category); // Filter by subcategory/activity type
  const sortMode = asString(req.query.sort); // "best" for best results scoring

  // Bounding box params for map-based "search this area" feature
  const swLat = typeof req.query.swLat === "string" ? Number(req.query.swLat) : NaN;
  const swLng = typeof req.query.swLng === "string" ? Number(req.query.swLng) : NaN;
  const neLat = typeof req.query.neLat === "string" ? Number(req.query.neLat) : NaN;
  const neLng = typeof req.query.neLng === "string" ? Number(req.query.neLng) : NaN;
  const hasBounds = Number.isFinite(swLat) && Number.isFinite(swLng) && Number.isFinite(neLat) && Number.isFinite(neLng);

  const promoOnly =
    String(req.query.promo ?? "").trim() === "1" ||
    String(req.query.promoOnly ?? "").trim() === "1";

  // Prompt 11 — practical filters
  const openNowOnly = String(req.query.open_now ?? "").trim() === "1";
  const instantBookingOnly = String(req.query.instant_booking ?? "").trim() === "1";
  const amenitiesFilter = asString(req.query.amenities)?.split(",").filter(Boolean) || [];
  const priceRangeFilter = asString(req.query.price_range)?.split(",").map(Number).filter((n: number) => n >= 1 && n <= 4) || [];

  const universeAliases = normalizePublicUniverseAliases(req.query.universe);
  const universeMeta = asString(req.query.universe) ?? undefined;

  // Prompt 12 — Optional auth for personalization
  const personalizedParam = String(req.query.personalized ?? "1");
  let personalizeUserId: string | null = null;
  if (personalizedParam !== "0") {
    const authHeader = String(req.headers.authorization ?? "");
    const token = authHeader.toLowerCase().startsWith("bearer ") ? authHeader.slice(7) : "";
    if (token) {
      try {
        const { data: authData } = await getAdminSupabase().auth.getUser(token);
        if (authData?.user) personalizeUserId = authData.user.id;
      } catch (err) {
        log.warn({ err }, "auth token verification failed for optional personalization");
      }
    }
  }

  // Load preferences if authenticated (lazy computation)
  type UserPrefs = Awaited<ReturnType<typeof loadOrComputePreferences>>;
  let userPrefs: UserPrefs = null;
  if (personalizeUserId) {
    try {
      userPrefs = await loadOrComputePreferences(personalizeUserId);
    } catch (err) {
      log.warn({ err, userId: personalizeUserId }, "failed to load user preferences for personalization");
    }
  }

  const supabase = getAdminSupabase();

  // Note: verified, premium, curated, is_online, activity_score columns may not exist yet - handle gracefully
  // These will be added by migrations:
  // - 20260201_search_engine_enhancement.sql (verified, premium, curated)
  // - 20260204_pro_activity_score.sql (is_online, activity_score)
  let estQuery = supabase
    .from("establishments")
    .select(
      "id,slug,name,universe,subcategory,city,address,neighborhood,region,country,lat,lng,phone,cover_url,booking_enabled,updated_at,tags,amenities,hours,price_range,is_online,activity_score,verified,premium,curated,google_rating,google_review_count",
    )
    .eq("status", "active")
    .not("cover_url", "is", null)
    .neq("cover_url", "");
  // Note: We do NOT filter by is_online here — many establishments haven't set up activity tracking yet.

  // Prompt 11 — SQL-level filters (applied to fallback path query)
  if (amenitiesFilter.length > 0) {
    estQuery = estQuery.contains("amenities", amenitiesFilter);
  }
  if (priceRangeFilter.length > 0) {
    estQuery = estQuery.in("price_range", priceRangeFilter);
  }
  if (instantBookingOnly) {
    estQuery = estQuery.eq("booking_enabled", true);
  }
  // Instead, is_online is used as a RANKING boost (online establishments appear higher in results).

  if (universeAliases.length === 1) {
    estQuery = estQuery.eq("universe", universeAliases[0]);
  } else if (universeAliases.length > 1) {
    estQuery = estQuery.in("universe", universeAliases);
  }

  if (city && !hasBounds) {
    // City values are usually normalized (e.g. "Marrakech"), but we keep it case-insensitive for resilience.
    // Skip city filter when bounding box is provided (map area search)
    estQuery = estQuery.ilike("city", city);
  }

  // Apply bounding box filter for map-based "search this area"
  if (hasBounds) {
    estQuery = estQuery
      .gte("lat", swLat)
      .lte("lat", neLat)
      .gte("lng", swLng)
      .lte("lng", neLng);
  }

  // If there's a search query, use the scored search function for better results
  if (q && q.length >= 2) {
    // Use the PostgreSQL search function with scoring
    const universeFilter = universeAliases.length === 1 ? universeAliases[0] : null;

    // Build RPC params with cursor support
    const searchLang = getSearchLang(req);
    const rpcParams: Record<string, unknown> = {
      search_query: q,
      filter_universe: universeFilter,
      filter_city: city || null,
      result_limit: limit + 1, // fetch one extra to determine has_more
      result_offset: 0,
      search_lang: searchLang,
    };

    // If cursor is provided, use cursor-based pagination
    if (cursor && cursorScore !== null) {
      rpcParams.cursor_score = cursorScore;
      rpcParams.cursor_id = cursor;
    } else if (offset > 0) {
      // Backward compat: use offset if no cursor
      rpcParams.result_offset = offset;
    }

    // Run scored search and (on first page) count in parallel
    const isFirstPage = !cursor && offset === 0;
    const [{ data: scoredResultsRaw, error: searchErr }, countResult] = await Promise.all([
      supabase.rpc('search_establishments_scored', rpcParams),
      isFirstPage
        ? supabase.rpc('count_establishments_scored', {
            search_query: q,
            filter_universe: universeFilter,
            filter_city: city || null,
            search_lang: searchLang,
          })
        : Promise.resolve({ data: null, error: null }),
    ]);

    const totalCountScored: number | null = typeof countResult?.data === "number" ? countResult.data : null;

    // Log RPC result for debugging
    if (searchErr) {
      log.warn({ q, universe: universeFilter, city: city || null, detail: searchErr.message || searchErr }, "search RPC search_establishments_scored failed");
    } else {
      log.info({ q, resultCount: scoredResultsRaw?.length ?? 0, cursor: cursor ?? "none" }, "search RPC search_establishments_scored OK");
    }

    if (!searchErr && scoredResultsRaw && scoredResultsRaw.length > 0) {
      // Filter out establishments without cover photo
      const scoredResultsFiltered = scoredResultsRaw.filter((r: any) => r.cover_url && r.cover_url !== "");
      // Determine has_more from the extra item we fetched
      const hasMore = scoredResultsFiltered.length > limit;
      const scoredResults = hasMore ? scoredResultsFiltered.slice(0, limit) : scoredResultsFiltered;
      // Fire-and-forget: track search suggestion popularity
      const universeForTracking = universeAliases.length === 1 ? universeAliases[0] : null;
      void trackSearchSuggestion(q, universeForTracking, scoredResults.length);

      // Return scored results directly
      const ids = scoredResults.map((r: any) => r.id);
      const nowIso = new Date().toISOString();
      const thirtyDaysAgo = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString();

      const [{ data: slots }, { data: reservations }] = await Promise.all([
        ids.length
          ? supabase
              .from("pro_slots")
              .select("establishment_id,starts_at,promo_type,promo_value,active")
              .in("establishment_id", ids)
              .eq("active", true)
              .gte("starts_at", nowIso)
              .order("starts_at", { ascending: true })
              .limit(5000)
          : Promise.resolve({ data: [] as unknown[] }),
        ids.length
          ? supabase
              .from("reservations")
              .select("establishment_id,created_at,status")
              .in("establishment_id", ids)
              .gte("created_at", thirtyDaysAgo)
              .in("status", ["confirmed", "pending_pro_validation", "requested"])
              .limit(5000)
          : Promise.resolve({ data: [] as unknown[] }),
      ]);

      const nextSlotByEst = new Map<string, string>();
      const promoByEst = new Map<string, number>();
      for (const s of (slots ?? []) as Array<Record<string, unknown>>) {
        const estId = typeof s.establishment_id === "string" ? s.establishment_id : "";
        const startsAt = typeof s.starts_at === "string" ? s.starts_at : "";
        if (!estId || !startsAt) continue;
        if (!nextSlotByEst.has(estId)) nextSlotByEst.set(estId, startsAt);
        const promo = maxPromoPercent(s.promo_type, s.promo_value);
        if (promo != null) promoByEst.set(estId, Math.max(promoByEst.get(estId) ?? 0, promo));
      }

      const reservationCountByEst = new Map<string, number>();
      for (const r of (reservations ?? []) as Array<Record<string, unknown>>) {
        const estId = typeof r.establishment_id === "string" ? r.establishment_id : "";
        if (estId) reservationCountByEst.set(estId, (reservationCountByEst.get(estId) ?? 0) + 1);
      }

      // Fetch activity data + filter data + geo/review data for scored results
      // (RPC doesn't return lat, lng, address, neighborhood, region, country, google_rating, google_review_count, subcategory)
      const needsFilterData = openNowOnly || priceRangeFilter.length > 0 || amenitiesFilter.length > 0 || instantBookingOnly;
      // Prompt 14 — always fetch price_range,amenities for contextual boosting
      // Also fetch geo/review/subcategory data (not returned by scored RPC)
      const enrichSelectBase = "id,is_online,activity_score,price_range,amenities,lat,lng,address,neighborhood,region,country,google_rating,google_review_count,subcategory";
      const enrichSelect = needsFilterData
        ? enrichSelectBase + ",hours,booking_enabled"
        : enrichSelectBase;
      const { data: activityData } = ids.length
        ? await supabase
            .from("establishments")
            .select(enrichSelect)
            .in("id", ids)
        : { data: [] };

      const activityByEst = new Map<string, { isOnline: boolean; activityScore: number | null }>();
      const filterDataByEst = new Map<string, { hours: unknown; priceRange: number | null; amenities: string[]; bookingEnabled: boolean }>();
      const enrichByEst = new Map<string, {
        lat: number | null; lng: number | null; address: string | null; neighborhood: string | null;
        region: string | null; country: string | null; google_rating: number | null; google_review_count: number | null;
        subcategory: string | null;
      }>();
      for (const a of (activityData ?? []) as Array<Record<string, unknown>>) {
        const estId = typeof a.id === "string" ? a.id : "";
        if (!estId) continue;
        activityByEst.set(estId, {
          isOnline: typeof a.is_online === "boolean" ? a.is_online : false,
          activityScore: typeof a.activity_score === "number" && Number.isFinite(a.activity_score) ? a.activity_score : null,
        });
        enrichByEst.set(estId, {
          lat: typeof a.lat === "number" && Number.isFinite(a.lat) ? a.lat : null,
          lng: typeof a.lng === "number" && Number.isFinite(a.lng) ? a.lng : null,
          address: typeof a.address === "string" ? a.address : null,
          neighborhood: typeof a.neighborhood === "string" ? a.neighborhood : null,
          region: typeof a.region === "string" ? a.region : null,
          country: typeof a.country === "string" ? a.country : null,
          google_rating: typeof a.google_rating === "number" ? a.google_rating : null,
          google_review_count: typeof a.google_review_count === "number" ? a.google_review_count : null,
          subcategory: typeof a.subcategory === "string" ? a.subcategory : null,
        });
        if (needsFilterData) {
          filterDataByEst.set(estId, {
            hours: a.hours ?? null,
            priceRange: typeof a.price_range === "number" ? a.price_range : null,
            amenities: Array.isArray(a.amenities) ? (a.amenities as string[]) : [],
            bookingEnabled: typeof a.booking_enabled === "boolean" ? a.booking_enabled : false,
          });
        }
      }

      // Prompt 14 — build boost data map (price_range + amenities always available now)
      const boostDataByEst = new Map<string, { priceRange: number | null; amenities: string[] }>();
      for (const a of (activityData ?? []) as Array<Record<string, unknown>>) {
        const estId = typeof a.id === "string" ? a.id : "";
        if (!estId) continue;
        boostDataByEst.set(estId, {
          priceRange: typeof a.price_range === "number" ? a.price_range : null,
          amenities: Array.isArray(a.amenities) ? (a.amenities as string[]) : [],
        });
      }

      const nowForOpenCheck = new Date();
      const items: PublicEstablishmentListItem[] = scoredResults.map((e: any) => {
        const promo = promoByEst.get(e.id) ?? null;
        if (promoOnly && (!promo || promo <= 0)) return null;

        // Enrichment data from establishments table (RPC doesn't return these)
        const enrich = enrichByEst.get(e.id);

        // Note: `category` param (e.g. "cuisine", "tag") is the autocomplete suggestion TYPE,
        // not a filter value. The actual filtering is done by the search query (q param).
        // The scored RPC already handles text matching, so no post-filter needed here.

        // Prompt 11 — post-fetch filters for scored path
        if (needsFilterData) {
          const fd = filterDataByEst.get(e.id);
          if (openNowOnly && (!fd?.hours || !isCurrentlyOpen(fd.hours, nowForOpenCheck))) return null;
          if (instantBookingOnly && !fd?.bookingEnabled) return null;
          if (priceRangeFilter.length > 0 && (fd?.priceRange == null || !priceRangeFilter.includes(fd.priceRange))) return null;
          if (amenitiesFilter.length > 0) {
            const estAmenities = (fd?.amenities ?? []).map((a: string) => a.toLowerCase());
            if (!amenitiesFilter.every((f: string) => estAmenities.some((a: string) => a.includes(f.toLowerCase())))) return null;
          }
        }

        const activity = activityByEst.get(e.id);
        const isOnline = activity?.isOnline ?? false;
        const activityScore = activity?.activityScore ?? null;

        // Note: We do NOT exclude offline establishments — is_online is used for ranking only.
        // Many establishments haven't set up activity tracking yet.

        // Use enrichment data for fields not returned by RPC
        const lat = enrich?.lat ?? null;
        const lng = enrich?.lng ?? null;
        const googleRating = enrich?.google_rating ?? null;
        const googleReviewCount = enrich?.google_review_count ?? null;

        return {
          id: e.id,
          name: e.name,
          universe: e.universe,
          subcategory: enrich?.subcategory ?? e.subcategory ?? null,
          city: e.city,
          address: enrich?.address ?? null,
          neighborhood: enrich?.neighborhood ?? null,
          region: enrich?.region ?? null,
          country: enrich?.country ?? null,
          lat,
          lng,
          cover_url: e.cover_url,
          booking_enabled: e.booking_enabled ?? null,
          promo_percent: promo ?? e.promo_percent ?? null,
          next_slot_at: nextSlotByEst.get(e.id) ?? null,
          reservations_30d: reservationCountByEst.get(e.id) ?? e.reservations_30d ?? 0,
          avg_rating: e.rating_avg ?? googleRating ?? null,
          review_count: googleReviewCount ?? 0,
          reviews_last_30d: 0,
          verified: typeof e.verified === "boolean" ? e.verified : false,
          premium: typeof e.premium === "boolean" ? e.premium : false,
          curated: typeof e.curated === "boolean" ? e.curated : false,
          tags: Array.isArray(e.tags) ? e.tags : null,
          slug: e.slug ?? generateEstablishmentSlug(e.name, e.city),
          relevance_score: e.relevance_score,
          total_score: e.total_score,
          // Activity/assiduity fields
          is_online: isOnline,
          activity_score: activityScore ?? undefined,
          // Google rating fields
          google_rating: googleRating,
          google_review_count: googleReviewCount,
        };
      }).filter(Boolean);

      // ── Minimum relevance threshold: remove noise results that barely match the query ──
      // Establishments with very low relevance_score (< 0.1) have no meaningful text match —
      // their score comes from trigram similarity or activity bonuses only.
      if (q && items.length > 0) {
        const MIN_RELEVANCE = 0.1;
        const before = items.length;
        const filtered = items.filter((item: any) => {
          const rel = typeof item.relevance_score === "number" ? item.relevance_score : 0;
          return rel >= MIN_RELEVANCE;
        });
        // Only apply filter if we'd still have results; never show 0 results
        if (filtered.length > 0) {
          items.length = 0;
          items.push(...filtered);
        }
      }

      // ── Subcategory boost: prioritize establishments whose primary specialty matches the query ──
      // When searching "italien", restaurants with subcategory="italien" should rank higher
      // than those that merely have "italien" in their name or tags.
      if (q && items.length > 1) {
        const qLower = q.toLowerCase().trim();
        for (const item of items as any[]) {
          const sub = typeof item.subcategory === "string" ? item.subcategory.toLowerCase() : "";
          if (sub && sub.includes(qLower)) {
            // Primary specialty match → significant boost (1.5x)
            item.total_score = (item.total_score ?? 0) * 1.5;
          }
        }
        // Re-sort by boosted total_score (descending)
        (items as any[]).sort((a: any, b: any) => (b.total_score ?? 0) - (a.total_score ?? 0));
      }

      // Prompt 12 — Apply personalization bonus (re-ranks by multiplied score)
      if (userPrefs && items.length > 1) {
        applyPersonalizationBonus(items as any[], userPrefs);
      }

      // Prompt 14 — Apply contextual boosting (time-of-day, day-of-week, seasonal)
      try {
        const ctxBoosts = await getContextualBoostsForNow();
        if (ctxBoosts.active_rules.length > 0) {
          for (const item of items as any[]) {
            const bd = boostDataByEst.get(item.id);
            if (bd) {
              item._price_range = bd.priceRange;
              item._amenities = bd.amenities;
            }
          }
          applyContextualBoosting(items as any[], ctxBoosts);
        }
      } catch (err) {
        log.warn({ err }, "contextual boosting failed for scored results");
      }

      // Build cursor info for next page
      const lastItem = items.length > 0 ? scoredResults[scoredResults.length - 1] : null;
      const nextCursor = hasMore && lastItem ? lastItem.id : null;
      const nextCursorScore = hasMore && lastItem ? lastItem.total_score : null;

      // Prompt 13 — fallback suggestions when results are sparse
      let fallbackScored: SearchFallbackResult | undefined;
      if (items.length < 3 && q && !cursor) {
        try {
          fallbackScored = (await generateSearchFallback({
            query: q,
            universe: universeAliases.length === 1 ? universeAliases[0] : null,
            city: city || null,
            filters: {
              amenities: amenitiesFilter,
              price_range: priceRangeFilter,
              open_now: openNowOnly,
              instant_booking: instantBookingOnly,
              promo_only: promoOnly,
            },
          })) ?? undefined;
        } catch (err) {
          log.warn({ err }, "fallback listing failed for scored path");
        }
      }

      return res.json({
        ok: true,
        items,
        meta: {
          limit,
          offset,
          ...(universeMeta ? { universe: universeMeta } : {}),
          ...(city ? { city } : {}),
          ...(q ? { q } : {}),
          ...(promoOnly ? { promoOnly: true } : {}),
          search_mode: 'scored',
          personalized: !!userPrefs,
        },
        pagination: {
          next_cursor: nextCursor,
          next_cursor_score: nextCursorScore,
          next_cursor_date: null,
          has_more: hasMore,
          total_count: totalCountScored,
        },
        ...(fallbackScored ? { fallback: fallbackScored } : {}),
      });
    }

    // Fallback to basic search if scored search fails or returns no results
    const words = q.split(/\s+/).filter((w: string) => w.length >= 2);
    if (words.length > 1) {
      // Multi-word: each word must match at least one field (AND logic)
      // This ensures "restaurant français" only returns French restaurants
      for (const word of words) {
        const term = `%${word}%`;
        estQuery = estQuery.or(
          `name.ilike.${term},subcategory.ilike.${term},tags.cs.{${word}}`
        );
      }
    } else {
      const searchTerm = `%${q}%`;
      estQuery = estQuery.or(
        `name.ilike.${searchTerm},subcategory.ilike.${searchTerm},tags.cs.{${q}}`
      );
    }
  } else if (q) {
    // Short query (< 2 chars): use basic ilike search
    const searchTerm = `%${q}%`;
    estQuery = estQuery.or(
      `name.ilike.${searchTerm},subcategory.ilike.${searchTerm},tags.cs.{${q}}`
    );
  }

  // Filter by category/subcategory (activity type)
  if (category) {
    estQuery = estQuery.ilike("subcategory", `%${category}%`);
  }

  // Apply ordering based on sort mode
  // Note: avg_rating/review_count columns not yet created - use updated_at for now
  estQuery = estQuery
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false }); // deterministic tie-breaker

  // Cursor-based pagination for fallback path
  if (cursor && cursorDate) {
    // Keyset pagination: fetch items after the cursor position
    estQuery = estQuery.or(
      `updated_at.lt.${cursorDate},and(updated_at.eq.${cursorDate},id.lt.${cursor})`
    );
    estQuery = estQuery.limit(limit + 1); // +1 to detect has_more
  } else if (offset > 0) {
    // Backward compat: offset-based
    estQuery = estQuery.range(offset, offset + limit);
  } else {
    estQuery = estQuery.limit(limit + 1); // first page, +1 to detect has_more
  }

  // Count query for first page only (no cursor, no offset)
  const isFirstPageFallback = !cursor && offset === 0;
  let totalCountFallback: number | null = null;
  if (isFirstPageFallback) {
    // Build a count query with same filters
    let countQuery = supabase
      .from("establishments")
      .select("id", { count: "exact", head: true })
      .eq("status", "active")
      .not("cover_url", "is", null)
      .neq("cover_url", "");

    if (universeAliases.length === 1) {
      countQuery = countQuery.eq("universe", universeAliases[0]);
    } else if (universeAliases.length > 1) {
      countQuery = countQuery.in("universe", universeAliases);
    }
    if (city && !hasBounds) {
      countQuery = countQuery.ilike("city", city);
    }
    if (hasBounds) {
      countQuery = countQuery.gte("lat", swLat).lte("lat", neLat).gte("lng", swLng).lte("lng", neLng);
    }
    if (category) {
      countQuery = countQuery.ilike("subcategory", `%${category}%`);
    }
    // Note: search term filters (ilike OR conditions) are harder to replicate in count query.
    // For simplicity, if there's a search query, we skip precise count (will be null).
    if (!q) {
      const { count } = await countQuery;
      totalCountFallback = typeof count === "number" ? count : null;
    }
  }

  const { data: establishments, error: estErr } = await estQuery;
  if (estErr) return res.status(500).json({ error: estErr.message });

  const estArrRaw = (establishments ?? []) as Array<Record<string, unknown>>;

  // Detect has_more from the extra item and slice to actual limit
  const hasMoreFallback = estArrRaw.length > limit;
  const estArr = hasMoreFallback ? estArrRaw.slice(0, limit) : estArrRaw;

  // Fire-and-forget: track search suggestion popularity (fallback search path)
  if (q && q.length >= 2) {
    const universeForTracking = universeAliases.length === 1 ? universeAliases[0] : null;
    void trackSearchSuggestion(q, universeForTracking, estArr.length);
  }

  const ids = estArr
    .map((e) => (typeof e.id === "string" ? e.id : ""))
    .filter(Boolean);

  const nowIso = new Date().toISOString();
  const thirtyDaysAgo = new Date(
    Date.now() - 1000 * 60 * 60 * 24 * 30,
  ).toISOString();

  const [{ data: slots }, { data: reservations }] = await Promise.all([
    ids.length
      ? supabase
          .from("pro_slots")
          .select("establishment_id,starts_at,promo_type,promo_value,active")
          .in("establishment_id", ids)
          .eq("active", true)
          .gte("starts_at", nowIso)
          .order("starts_at", { ascending: true })
          .limit(5000)
      : Promise.resolve({ data: [] as unknown[] }),
    ids.length
      ? supabase
          .from("reservations")
          .select("establishment_id,created_at,status")
          .in("establishment_id", ids)
          .gte("created_at", thirtyDaysAgo)
          .in("status", ["confirmed", "pending_pro_validation", "requested"]) // ignore cancelled/no_show for "popular"
          .limit(5000)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  const nextSlotByEst = new Map<string, string>();
  const promoByEst = new Map<string, number>();

  for (const s of (slots ?? []) as Array<Record<string, unknown>>) {
    const establishmentId =
      typeof s.establishment_id === "string" ? s.establishment_id : "";
    const startsAt = typeof s.starts_at === "string" ? s.starts_at : "";
    if (!establishmentId || !startsAt) continue;

    if (!nextSlotByEst.has(establishmentId)) {
      nextSlotByEst.set(establishmentId, startsAt);
    }

    const promo = maxPromoPercent(s.promo_type, s.promo_value);
    if (promo != null) {
      promoByEst.set(
        establishmentId,
        Math.max(promoByEst.get(establishmentId) ?? 0, promo),
      );
    }
  }

  const reservationCountByEst = new Map<string, number>();
  for (const r of (reservations ?? []) as Array<Record<string, unknown>>) {
    const establishmentId =
      typeof r.establishment_id === "string" ? r.establishment_id : "";
    if (!establishmentId) continue;
    reservationCountByEst.set(
      establishmentId,
      (reservationCountByEst.get(establishmentId) ?? 0) + 1,
    );
  }

  // Best results scoring function: rating × sqrt(review_count) × velocity_multiplier × assiduity_factor
  // Activity/assiduity score is weighted at 30% to reward engaged establishments
  const computeBestScore = (args: {
    avgRating: number | null;
    reviewCount: number;
    reviewsLast30d: number;
    reservations30d: number;
    activityScore: number | null;
    isOnline: boolean;
  }): number => {
    const rating = args.avgRating ?? 3.0; // Default to neutral rating
    const reviewCount = Math.max(1, args.reviewCount); // Avoid division by zero
    const reviewsLast30d = args.reviewsLast30d;
    const reservations30d = args.reservations30d;
    const activityScore = args.activityScore ?? 0; // 0-100 scale
    const isOnline = args.isOnline;

    // Velocity multiplier: boost for recent activity
    // If reviewsLast30d is high relative to total reviews, it means momentum
    const velocityRatio = reviewCount > 0 ? reviewsLast30d / Math.sqrt(reviewCount) : 0;
    const velocityMultiplier = 1 + Math.min(velocityRatio, 2); // Cap at 3x

    // Base score: rating × sqrt(review_count) gives diminishing returns for more reviews
    const baseScore = rating * Math.sqrt(reviewCount);

    // Add reservation activity as a bonus
    const reservationBonus = Math.sqrt(reservations30d) * 0.5;

    // Assiduity factor: 0.7 to 1.3 range based on activity_score (0-100)
    // Score of 0 → factor of 0.7 (30% penalty)
    // Score of 50 → factor of 1.0 (neutral)
    // Score of 100 → factor of 1.3 (30% boost)
    const assiduityFactor = 0.7 + (activityScore / 100) * 0.6;

    // Online bonus: currently online establishments get a small visibility boost
    const onlineBonus = isOnline ? 2.0 : 0;

    return (baseScore * velocityMultiplier + reservationBonus) * assiduityFactor + onlineBonus;
  };

  const nowForOpenCheckFallback = new Date();
  const items: PublicEstablishmentListItem[] = estArr
    .map((e) => {
      const id = typeof e.id === "string" ? e.id : "";
      if (!id) return null;

      const promo = promoByEst.get(id) ?? null;
      if (promoOnly && (!promo || promo <= 0)) return null;

      // Prompt 11 — open_now post-fetch filter (fallback path)
      if (openNowOnly && (!e.hours || !isCurrentlyOpen(e.hours, nowForOpenCheckFallback))) return null;

      const avgRating = typeof e.avg_rating === "number" && Number.isFinite(e.avg_rating) ? e.avg_rating : null;
      const reviewCount = typeof e.review_count === "number" && Number.isFinite(e.review_count) ? e.review_count : 0;
      const reviewsLast30d = typeof e.reviews_last_30d === "number" && Number.isFinite(e.reviews_last_30d) ? e.reviews_last_30d : 0;
      const reservations30d = reservationCountByEst.get(id) ?? 0;
      // Activity/assiduity fields - may not exist until migration 20260204_pro_activity_score.sql is run
      const isOnline = typeof e.is_online === "boolean" ? e.is_online : false;
      const activityScore = typeof e.activity_score === "number" && Number.isFinite(e.activity_score) ? e.activity_score : null;

      const item: PublicEstablishmentListItem = {
        id,
        name: typeof e.name === "string" ? e.name : null,
        universe: typeof e.universe === "string" ? e.universe : null,
        subcategory: typeof e.subcategory === "string" ? e.subcategory : null,
        city: typeof e.city === "string" ? e.city : null,
        address: typeof e.address === "string" ? e.address : null,
        neighborhood: typeof e.neighborhood === "string" ? e.neighborhood : null,
        region: typeof e.region === "string" ? e.region : null,
        country: typeof e.country === "string" ? e.country : null,
        lat: typeof e.lat === "number" && Number.isFinite(e.lat) ? e.lat : null,
        lng: typeof e.lng === "number" && Number.isFinite(e.lng) ? e.lng : null,
        cover_url: typeof e.cover_url === "string" ? e.cover_url : null,
        booking_enabled:
          typeof e.booking_enabled === "boolean" ? e.booking_enabled : null,
        promo_percent: promo,
        next_slot_at: nextSlotByEst.get(id) ?? null,
        reservations_30d: reservations30d,
        avg_rating: avgRating,
        review_count: reviewCount,
        reviews_last_30d: reviewsLast30d,
        // These columns may not exist yet - default to false until migration is run
        verified: typeof e.verified === "boolean" ? e.verified : false,
        premium: typeof e.premium === "boolean" ? e.premium : false,
        curated: typeof e.curated === "boolean" ? e.curated : false,
        tags: Array.isArray(e.tags) ? (e.tags as string[]) : null,
        // Activity/assiduity fields
        is_online: isOnline,
        activity_score: activityScore ?? undefined,
        // Google rating
        google_rating: typeof e.google_rating === "number" ? e.google_rating : null,
        google_review_count: typeof e.google_review_count === "number" ? e.google_review_count : null,
      };

      // Compute best score if sorting by best
      if (sortMode === "best") {
        item.best_score = computeBestScore({
          avgRating,
          reviewCount,
          reviewsLast30d,
          reservations30d,
          activityScore,
          isOnline,
        });
      }

      return item;
    })
    .filter(Boolean) as PublicEstablishmentListItem[];

  // Sort by best_score if sort=best
  if (sortMode === "best") {
    items.sort((a, b) => (b.best_score ?? 0) - (a.best_score ?? 0));
  }

  // ── Subcategory boost (fallback path): prioritize primary specialty matches ──
  if (q && items.length > 1) {
    const qLower = q.toLowerCase().trim();
    // Stable sort: subcategory matches first, then keep original order within each group
    items.sort((a, b) => {
      const aSub = typeof a.subcategory === "string" && a.subcategory.toLowerCase().includes(qLower);
      const bSub = typeof b.subcategory === "string" && b.subcategory.toLowerCase().includes(qLower);
      if (aSub && !bSub) return -1;
      if (!aSub && bSub) return 1;
      return 0; // keep original order within same group
    });
  }

  // Prompt 12 — Apply personalization bonus (re-ranks by multiplied score)
  if (userPrefs && items.length > 1) {
    applyPersonalizationBonus(items as any[], userPrefs);
  }

  // Prompt 14 — Apply contextual boosting (fallback path)
  try {
    const ctxBoostsFallback = await getContextualBoostsForNow();
    if (ctxBoostsFallback.active_rules.length > 0) {
      const estByIdFb = new Map<string, Record<string, unknown>>();
      for (const e of estArr) {
        const eid = typeof e.id === "string" ? e.id : "";
        if (eid) estByIdFb.set(eid, e);
      }
      for (const item of items as any[]) {
        const raw = estByIdFb.get(item.id);
        if (raw) {
          item._price_range = typeof raw.price_range === "number" ? raw.price_range : null;
          item._amenities = Array.isArray(raw.amenities) ? (raw.amenities as string[]) : null;
        }
      }
      applyContextualBoosting(items as any[], ctxBoostsFallback);
    }
  } catch (err) {
    log.warn({ err }, "contextual boosting failed for fallback results");
  }

  // Build cursor info for next page (fallback path uses updated_at + id)
  const lastEstItem = estArr.length > 0 ? estArr[estArr.length - 1] : null;
  const nextCursorFallback = hasMoreFallback && lastEstItem && typeof lastEstItem.id === "string"
    ? lastEstItem.id : null;
  const nextCursorDateFallback = hasMoreFallback && lastEstItem && typeof lastEstItem.updated_at === "string"
    ? lastEstItem.updated_at : null;

  // Prompt 13 — fallback suggestions when results are sparse (basic fallback path)
  let fallbackBasic: SearchFallbackResult | undefined;
  if (items.length < 3 && q && !cursor) {
    try {
      fallbackBasic = (await generateSearchFallback({
        query: q,
        universe: universeAliases.length === 1 ? universeAliases[0] : null,
        city: city || null,
        filters: {
          amenities: amenitiesFilter,
          price_range: priceRangeFilter,
          open_now: openNowOnly,
          instant_booking: instantBookingOnly,
          promo_only: promoOnly,
        },
      })) ?? undefined;
    } catch (err) {
      log.warn({ err }, "fallback listing failed for unscored path");
    }
  }

  const payload = {
    ok: true as const,
    items,
    meta: {
      limit,
      offset,
      ...(universeMeta ? { universe: universeMeta } : {}),
      ...(city ? { city } : {}),
      ...(q ? { q } : {}),
      ...(promoOnly ? { promoOnly: true } : {}),
      personalized: !!userPrefs,
    },
    pagination: {
      next_cursor: nextCursorFallback,
      next_cursor_score: null as number | null,
      next_cursor_date: nextCursorDateFallback,
      has_more: hasMoreFallback,
      total_count: totalCountFallback,
    },
    ...(fallbackBasic ? { fallback: fallbackBasic } : {}),
  };

  return res.json(payload);
}

// ============================================
// SEARCH AUTOCOMPLETE API
// ============================================

type AutocompleteSuggestion = {
  id: string;
  term: string;
  category: "establishment" | "cuisine" | "specialty" | "dish" | "tag" | "city" | "activity" | "accommodation" | "hashtag";
  displayLabel: string;
  iconName: string | null;
  universe: string | null;
  extra?: {
    establishmentId?: string;
    coverUrl?: string;
    city?: string;
    usageCount?: number;
    resultCount?: number;
  };
};

type AutocompleteResponse = {
  ok: true;
  suggestions: AutocompleteSuggestion[];
  query: string;
};

export async function searchAutocomplete(req: Request, res: Response) {
  const q = asString(req.query.q);
  const rawUniverse = asString(req.query.universe);
  const cityParam = asString(req.query.city) || null; // City filter from the city selector
  const limitParam = asInt(req.query.limit);
  const limit = Math.min(Math.max(limitParam ?? 10, 1), 20);

  // Normalize universe: "restaurants" -> "restaurant", etc.
  const universeMap: Record<string, string> = {
    restaurants: "restaurant",
    sport: "wellness",
    sport_bien_etre: "wellness",
    hebergement: "hebergement",
    loisirs: "loisir",
    culture: "culture",
  };
  const universe = rawUniverse ? (universeMap[rawUniverse] ?? rawUniverse) : null;

  if (!q || q.length < 2) {
    return res.json({ ok: true, suggestions: [], query: q ?? "" });
  }

  const supabase = getAdminSupabase();
  const suggestions: AutocompleteSuggestion[] = [];
  const searchTerm = q.toLowerCase().trim();

  // ── 1. Search establishments by name (highest priority) ──
  // When a city is selected, ONLY return establishments from that city
  let estQuery = supabase
    .from("establishments")
    .select("id,name,universe,city,cover_url")
    .eq("status", "active")
    .eq("is_online", true)
    .not("cover_url", "is", null)
    .neq("cover_url", "")
    .ilike("name", `%${searchTerm}%`);

  if (cityParam) {
    estQuery = estQuery.ilike("city", cityParam);
  }

  const { data: establishments } = await estQuery.limit(5);

  let establishmentCount = 0;
  if (establishments) {
    for (const est of establishments as Array<Record<string, unknown>>) {
      if (!universe || est.universe === universe) {
        suggestions.push({
          id: `est-${est.id}`,
          term: String(est.name ?? ""),
          category: "establishment",
          displayLabel: String(est.name ?? ""),
          iconName: "building",
          universe: typeof est.universe === "string" ? est.universe : null,
          extra: {
            establishmentId: String(est.id),
            coverUrl: typeof est.cover_url === "string" ? est.cover_url : undefined,
            city: typeof est.city === "string" ? est.city : undefined,
          },
        });
        establishmentCount++;
      }
    }
  }

  // 2. Search in search_suggestions table (if it exists)
  // Generic suggestions (cuisine types, categories) are always shown regardless of city
  try {
    let suggQuery = supabase
      .from("search_suggestions")
      .select("id,term,category,display_label,icon_name,universe")
      .eq("is_active", true)
      .ilike("term", `%${searchTerm}%`)
      .order("search_count", { ascending: false })
      .limit(10);

    if (universe) {
      // Filter by universe or null (applies to all)
      suggQuery = suggQuery.or(`universe.eq.${universe},universe.is.null`);
    }

    const { data: searchSuggestions } = await suggQuery;

    if (searchSuggestions) {
      for (const sugg of searchSuggestions as Array<Record<string, unknown>>) {
        const cat = String(sugg.category ?? "tag");
        suggestions.push({
          id: String(sugg.id),
          term: String(sugg.term ?? ""),
          category: cat as AutocompleteSuggestion["category"],
          displayLabel: String(sugg.display_label ?? sugg.term ?? ""),
          iconName: typeof sugg.icon_name === "string" ? sugg.icon_name : null,
          universe: typeof sugg.universe === "string" ? sugg.universe : null,
        });
      }
    }
  } catch (err) {
    log.warn({ err }, "search_suggestions query failed");
  }

  // 3. Search cities — ONLY if no city is already selected
  // If user already chose a city, showing city suggestions is useless
  if (!cityParam && suggestions.filter((s) => s.category === "city").length === 0) {
    const { data: cities } = await supabase
      .from("home_cities")
      .select("id,name,slug")
      .eq("is_active", true)
      .ilike("name", `%${searchTerm}%`)
      .limit(5);

    if (cities) {
      for (const city of cities as Array<Record<string, unknown>>) {
        suggestions.push({
          id: `city-${city.id}`,
          term: String(city.name ?? ""),
          category: "city",
          displayLabel: String(city.name ?? ""),
          iconName: "map-pin",
          universe: null,
        });
      }
    }
  }

  // 4. Search distinct specialties from establishments
  // Dynamically suggest specialties that match the query (e.g. "Marocain" → "Spécialité Marocain")
  if (suggestions.length < limit) {
    try {
      let specQuery = supabase
        .from("establishments")
        .select("specialties")
        .eq("status", "active")
        .not("cover_url", "is", null)
        .neq("cover_url", "")
        .not("specialties", "is", null);
      if (universe) specQuery = specQuery.eq("universe", universe);
      if (cityParam) specQuery = specQuery.ilike("city", cityParam);
      const { data: specData } = await specQuery.limit(500);
      if (specData) {
        // Collect distinct specialties matching the search term + count establishments
        const specCounts = new Map<string, number>();
        for (const row of specData as Array<{ specialties: string[] | null }>) {
          if (!Array.isArray(row.specialties)) continue;
          for (const sp of row.specialties) {
            if (typeof sp === "string" && sp.toLowerCase().includes(searchTerm)) {
              const key = sp.trim();
              specCounts.set(key, (specCounts.get(key) ?? 0) + 1);
            }
          }
        }
        // Sort by count descending and add as suggestions
        const sortedSpecs = [...specCounts.entries()].sort((a, b) => b[1] - a[1]);
        for (const [specName, count] of sortedSpecs) {
          // Only skip if there's already a "specialty" suggestion with the same term
          // (allow coexistence with "cuisine" — they represent different concepts)
          if (suggestions.some((s) => s.category === "specialty" && s.term.toLowerCase() === specName.toLowerCase())) continue;
          suggestions.push({
            id: `specialty-${specName}`,
            term: specName,
            category: "specialty",
            displayLabel: `Tag ${specName}`,
            iconName: "star",
            universe: universe ?? null,
            extra: { resultCount: count },
          });
        }
      }
    } catch (err) {
      log.warn({ err }, "specialty suggestions query failed");
    }
  }

  // 4b. Fallback: search distinct tags from establishments
  if (suggestions.length < limit) {
    try {
      const { data: tagResults } = await supabase
        .rpc("search_establishment_tags", { search_term: searchTerm })
        .limit(5);

      if (tagResults) {
        for (const tag of tagResults as Array<{ tag: string }>) {
          if (!suggestions.some((s) => s.term.toLowerCase() === tag.tag.toLowerCase())) {
            suggestions.push({
              id: `tag-${tag.tag}`,
              term: tag.tag,
              category: "tag",
              displayLabel: tag.tag,
              iconName: "tag",
              universe: null,
            });
          }
        }
      }
    } catch (err) {
      log.warn({ err }, "search_establishment_tags RPC failed");
    }
  }

  // 5. Search hashtags from video descriptions (with usage count)
  // Only search if query explicitly starts with # (hashtag intent)
  const isHashtagSearch = searchTerm.startsWith("#") || searchTerm.startsWith("%23");
  const hashtagSearchTerm = searchTerm.replace(/^#/, "").replace(/^%23/, "");

  if (isHashtagSearch && hashtagSearchTerm.length >= 1) {
    try {
      const { data: hashtagResults } = await supabase
        .rpc("search_hashtags", { search_term: hashtagSearchTerm })
        .limit(5);

      if (hashtagResults) {
        for (const ht of hashtagResults as Array<{ hashtag: string; usage_count: number }>) {
          const hashtagTerm = `#${ht.hashtag}`;
          if (!suggestions.some((s) => s.term.toLowerCase() === hashtagTerm.toLowerCase())) {
            suggestions.push({
              id: `hashtag-${ht.hashtag}`,
              term: hashtagTerm,
              category: "hashtag",
              displayLabel: `${hashtagTerm} (${ht.usage_count})`,
              iconName: "hash",
              universe: null,
              extra: {
                usageCount: ht.usage_count,
              },
            });
          }
        }
      }
    } catch (err) {
      log.warn({ err }, "search_video_hashtags RPC failed");
    }
  }

  // Remove duplicates and limit results
  // Group similar categories together for dedup:
  //   - "establishment" always unique (keyed by establishmentId)
  //   - "cuisine", "dish" share the same dedup bucket (e.g. "brunch" cuisine = "brunch" dish)
  //   - "specialty" is its own bucket (can coexist with "cuisine" for same term)
  //   - "tag" is its own bucket
  //   - "city", "hashtag" etc. are their own buckets
  const seen = new Set<string>();
  const uniqueSuggestions = suggestions.filter((s) => {
    let key: string;
    if (s.category === "establishment") {
      key = `est-${s.extra?.establishmentId ?? s.term.toLowerCase()}`;
    } else if (s.category === "cuisine" || s.category === "dish") {
      key = `cuisine-${s.term.toLowerCase()}`;
    } else {
      key = `${s.category}-${s.term.toLowerCase()}`;
    }
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort: establishments first, then cuisines/categories, then tags
  const categoryOrder: Record<string, number> = {
    establishment: 0,
    cuisine: 1,
    specialty: 2,
    dish: 3,
    activity: 4,
    hashtag: 5,
    tag: 6,
    city: 7,
    accommodation: 8,
  };

  uniqueSuggestions.sort((a, b) => {
    const orderA = categoryOrder[a.category] ?? 99;
    const orderB = categoryOrder[b.category] ?? 99;
    return orderA - orderB;
  });

  // ── Enrich non-establishment suggestions with result counts ──
  // For cuisine/tag/activity suggestions, count how many establishments match
  const finalSuggestions = uniqueSuggestions.slice(0, limit);
  const countableSuggestions = finalSuggestions.filter(
    (s) => s.category !== "establishment" && s.category !== "city" && s.category !== "hashtag"
  );

  if (countableSuggestions.length > 0) {
    // Batch count: for each suggestion term, count matching establishments
    // Skip suggestions that already have a resultCount (e.g. specialties from step 4)
    const needsCounting = countableSuggestions.filter(
      (s) => typeof s.extra?.resultCount !== "number"
    );
    const countPromises = needsCounting.map(async (s) => {
      try {
        const term = s.term.toLowerCase();
        // Use the scored RPC to count — it uses full-text search and matches the same
        // results the user will see when they click the suggestion
        const { data: countData } = await supabase.rpc("search_establishments_scored", {
          search_query: term,
          filter_universe: universe || null,
          filter_city: cityParam || null,
          result_limit: 100,
          result_offset: 0,
          cursor_score: null,
          cursor_id: null,
          search_lang: "fr",
        });
        // Apply same minimum relevance threshold as search results (0.1)
        const relevantCount = Array.isArray(countData)
          ? countData.filter((r: any) => typeof r.relevance_score === "number" && r.relevance_score >= 0.1).length
          : 0;
        s.extra = { ...s.extra, resultCount: relevantCount };
      } catch (err) {
        log.warn({ err, term: s.term }, "suggestion result count query failed");
      }
    });
    await Promise.all(countPromises);
  }

  // No longer show "Aucun établissement" message — suggestions with counts are more useful
  return res.json({
    ok: true,
    suggestions: finalSuggestions,
    query: q,
    noEstablishmentsMessage: null,
  });
}

// ============================================
// SEARCH SUGGESTION TRACKING (auto-increment search_count)
// ============================================

/** Normalize a search query for comparison: lowercase, remove accents, trim, remove punctuation */
function normalizeSearchTerm(term: string): string {
  return term
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")  // Remove diacritics
    .replace(/[^\w\s]/g, "")          // Remove punctuation
    .replace(/\s+/g, " ")             // Collapse whitespace
    .trim();
}

/**
 * Increment search_count for a search term in search_suggestions.
 * If the term doesn't exist and results were found, create it.
 * MUST be called fire-and-forget (don't await in request handler).
 */
async function trackSearchSuggestion(
  query: string,
  universe: string | null,
  resultsCount: number,
): Promise<void> {
  if (!query || query.length < 2) return;

  const normalized = normalizeSearchTerm(query);
  if (!normalized || normalized.length < 2) return;

  const supabase = getAdminSupabase();

  try {
    // Try to find an existing suggestion matching this term
    // Check with universe first, then without
    let matchId: string | null = null;

    if (universe) {
      const { data: withUniverse } = await supabase
        .from("search_suggestions")
        .select("id")
        .eq("term", normalized)
        .eq("universe", universe)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      if (withUniverse) matchId = withUniverse.id;
    }

    if (!matchId) {
      const { data: withoutUniverse } = await supabase
        .from("search_suggestions")
        .select("id")
        .eq("term", normalized)
        .is("universe", null)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      if (withoutUniverse) matchId = withoutUniverse.id;
    }

    if (matchId) {
      // Existing suggestion found — increment search_count via read-modify-write
      const { data: row } = await supabase
        .from("search_suggestions")
        .select("search_count")
        .eq("id", matchId)
        .single();

      if (row) {
        await supabase
          .from("search_suggestions")
          .update({
            search_count: (row.search_count ?? 0) + 1,
            last_searched_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", matchId);
      }
    } else if (resultsCount > 0) {
      // No existing suggestion AND results found → create a new one
      // Use the original query (not normalized) for display
      const displayLabel = query.trim().charAt(0).toUpperCase() + query.trim().slice(1);

      await supabase
        .from("search_suggestions")
        .upsert(
          {
            term: normalized,
            category: "tag", // Default category for user-generated suggestions
            universe: universe ?? null,
            display_label: displayLabel,
            search_count: 1,
            last_searched_at: new Date().toISOString(),
            is_active: true,
          },
          { onConflict: "term,category,universe" }
        );
    }
    // If resultsCount === 0 and no match, do nothing (don't pollute with zero-result queries)
  } catch (err) {
    // Best-effort — never fail the main request
    log.warn({ err }, "trackSearchSuggestion failed");
  }
}

// ============================================
// POPULAR SEARCHES API (for empty state)
// ============================================
export async function getPopularSearches(req: Request, res: Response) {
  const rawUniverse = asString(req.query.universe);
  const city = asString(req.query.city);
  const limit = Math.min(Math.max(asInt(req.query.limit) ?? 10, 1), 20);

  // Normalize universe: "restaurants" -> "restaurant", etc.
  const universeMap: Record<string, string> = {
    restaurants: "restaurant",
    sport: "wellness",
    sport_bien_etre: "wellness",
    hebergement: "hebergement",
    loisirs: "loisir",
    culture: "culture",
    shopping: "shopping",
    rentacar: "rentacar",
  };
  const universe = rawUniverse ? (universeMap[rawUniverse] ?? rawUniverse) : null;

  const supabase = getAdminSupabase();

  // Helper to format a DB row into the response shape
  function formatSuggestion(s: Record<string, unknown>) {
    const count = typeof s.search_count === "number" ? s.search_count : 0;
    return {
      term: String(s.term ?? ""),
      category: String(s.category ?? "tag"),
      displayLabel: String(s.display_label ?? s.term ?? ""),
      iconName: typeof s.icon_name === "string" ? s.icon_name : null,
      searchCount: count,
    };
  }

  // Try to get from search_suggestions with popularity+freshness scoring
  const searchLang = getSearchLang(req);
  const langForPopular = searchLang === "both" ? "fr" : searchLang;
  try {
    // Try the SQL RPC function first (uses popularity * freshness formula)
    const { data: rpcData, error: rpcError } = await supabase.rpc("get_popular_suggestions", {
      filter_universe: universe,
      max_results: limit * 2, // Over-fetch to allow filtering
      filter_lang: langForPopular,
    });

    if (!rpcError && rpcData && rpcData.length >= 5) {
      // RPC worked and has enough results — use them
      const results = (rpcData as Array<Record<string, unknown>>).map(formatSuggestion);

      // If universe is specified, prioritize universe-specific results
      if (universe) {
        const universeResults = results.filter((r) => {
          const row = rpcData.find((d: any) => String(d.term) === r.term);
          return row && (row.universe === universe || row.universe === null);
        });
        return res.json({ ok: true, searches: universeResults.slice(0, limit) });
      }

      return res.json({ ok: true, searches: results.slice(0, limit) });
    }

    // Fallback: use Supabase client queries with simple search_count ordering
    if (universe) {
      // First, get suggestions specific to this universe
      const { data: universeSpecific } = await supabase
        .from("search_suggestions")
        .select("term,category,display_label,icon_name,universe,search_count")
        .eq("is_active", true)
        .eq("universe", universe)
        .eq("lang", langForPopular)
        .order("search_count", { ascending: false })
        .limit(limit);

      // If we have enough universe-specific suggestions, return them
      if (universeSpecific && universeSpecific.length >= limit) {
        return res.json({
          ok: true,
          searches: (universeSpecific as Array<Record<string, unknown>>).map(formatSuggestion),
        });
      }

      // If we have some universe-specific suggestions but not enough, complement with generic ones
      if (universeSpecific && universeSpecific.length > 0) {
        const remaining = limit - universeSpecific.length;
        const existingTerms = universeSpecific.map((s) => String(s.term));

        const { data: genericSuggestions } = await supabase
          .from("search_suggestions")
          .select("term,category,display_label,icon_name,universe,search_count")
          .eq("is_active", true)
          .is("universe", null)
          .eq("lang", langForPopular)
          .not("term", "in", `(${existingTerms.map(t => `"${t}"`).join(",")})`)
          .order("search_count", { ascending: false })
          .limit(remaining);

        const combined = [...universeSpecific, ...(genericSuggestions || [])];
        return res.json({
          ok: true,
          searches: (combined as Array<Record<string, unknown>>).map(formatSuggestion),
        });
      }

      // If universe is specified but no universe-specific suggestions found, skip DB and use hardcoded fallbacks
    }

    // Only use generic DB suggestions when NO universe is specified
    if (!universe) {
      const { data } = await supabase
        .from("search_suggestions")
        .select("term,category,display_label,icon_name,universe,search_count")
        .eq("is_active", true)
        .eq("lang", langForPopular)
        .order("search_count", { ascending: false })
        .limit(limit);

      if (data && data.length >= 5) {
        return res.json({
          ok: true,
          searches: (data as Array<Record<string, unknown>>).map(formatSuggestion),
        });
      }
    }
  } catch (err) {
    log.warn({ err }, "popular searches query failed");
  }

  // Fallback: return hardcoded popular searches per universe
  const fallbackSearches = universe === "restaurant"
    ? [
        // Cuisines
        { term: "marocain", category: "cuisine", displayLabel: "Cuisine Marocaine", iconName: "utensils" },
        { term: "japonais", category: "cuisine", displayLabel: "Japonais", iconName: "utensils" },
        { term: "italien", category: "cuisine", displayLabel: "Italien", iconName: "utensils" },
        { term: "libanais", category: "cuisine", displayLabel: "Libanais", iconName: "utensils" },
        // Plats
        { term: "sushi", category: "dish", displayLabel: "Sushi", iconName: "utensils" },
        { term: "tajine", category: "dish", displayLabel: "Tajine", iconName: "utensils" },
        { term: "brunch", category: "dish", displayLabel: "Brunch", iconName: "coffee" },
        { term: "pizza", category: "dish", displayLabel: "Pizza", iconName: "utensils" },
        // Tags/ambiances
        { term: "terrasse", category: "tag", displayLabel: "Terrasse", iconName: "sun" },
        { term: "romantique", category: "tag", displayLabel: "Romantique", iconName: "heart" },
        { term: "rooftop", category: "tag", displayLabel: "Rooftop", iconName: "building" },
        { term: "vue mer", category: "tag", displayLabel: "Vue Mer", iconName: "waves" },
      ]
    : universe === "hebergement"
    ? [
        // Types d'hébergement
        { term: "riad", category: "accommodation", displayLabel: "Riad", iconName: "home" },
        { term: "hotel", category: "accommodation", displayLabel: "Hôtel", iconName: "building" },
        { term: "villa", category: "accommodation", displayLabel: "Villa", iconName: "home" },
        { term: "appartement", category: "accommodation", displayLabel: "Appartement", iconName: "building" },
        // Équipements/Tags
        { term: "piscine", category: "tag", displayLabel: "Piscine", iconName: "waves" },
        { term: "spa", category: "tag", displayLabel: "Spa", iconName: "sparkles" },
        { term: "vue mer", category: "tag", displayLabel: "Vue Mer", iconName: "waves" },
        { term: "luxe", category: "tag", displayLabel: "Luxe", iconName: "star" },
        { term: "jacuzzi", category: "tag", displayLabel: "Jacuzzi", iconName: "waves" },
        { term: "petit dejeuner", category: "tag", displayLabel: "Petit-déjeuner inclus", iconName: "coffee" },
      ]
    : universe === "wellness"
    ? [
        // Types de soins
        { term: "spa", category: "activity", displayLabel: "Spa", iconName: "sparkles" },
        { term: "hammam", category: "activity", displayLabel: "Hammam", iconName: "droplet" },
        { term: "massage", category: "activity", displayLabel: "Massage", iconName: "hand" },
        { term: "coiffeur", category: "activity", displayLabel: "Coiffeur", iconName: "scissors" },
        { term: "esthetique", category: "activity", displayLabel: "Esthétique", iconName: "sparkles" },
        // Tags
        { term: "detente", category: "tag", displayLabel: "Détente", iconName: "heart" },
        { term: "soins visage", category: "tag", displayLabel: "Soins Visage", iconName: "sparkles" },
        { term: "manucure", category: "tag", displayLabel: "Manucure", iconName: "hand" },
      ]
    : universe === "loisir"
    ? [
        // Types d'activités
        { term: "escape game", category: "activity", displayLabel: "Escape Game", iconName: "puzzle" },
        { term: "karting", category: "activity", displayLabel: "Karting", iconName: "car" },
        { term: "bowling", category: "activity", displayLabel: "Bowling", iconName: "target" },
        { term: "paintball", category: "activity", displayLabel: "Paintball", iconName: "target" },
        { term: "quad", category: "activity", displayLabel: "Quad", iconName: "car" },
        { term: "jet ski", category: "activity", displayLabel: "Jet Ski", iconName: "waves" },
        // Tags
        { term: "famille", category: "tag", displayLabel: "En Famille", iconName: "users" },
        { term: "entre amis", category: "tag", displayLabel: "Entre Amis", iconName: "users" },
        { term: "enfants", category: "tag", displayLabel: "Pour Enfants", iconName: "baby" },
        { term: "plein air", category: "tag", displayLabel: "Plein Air", iconName: "sun" },
      ]
    : universe === "culture"
    ? [
        // Types de lieux/activités
        { term: "musee", category: "activity", displayLabel: "Musée", iconName: "building" },
        { term: "cinema", category: "activity", displayLabel: "Cinéma", iconName: "film" },
        { term: "theatre", category: "activity", displayLabel: "Théâtre", iconName: "drama" },
        { term: "galerie", category: "activity", displayLabel: "Galerie d'Art", iconName: "image" },
        { term: "concert", category: "activity", displayLabel: "Concert", iconName: "music" },
        // Tags
        { term: "exposition", category: "tag", displayLabel: "Exposition", iconName: "image" },
        { term: "histoire", category: "tag", displayLabel: "Histoire", iconName: "book" },
        { term: "art contemporain", category: "tag", displayLabel: "Art Contemporain", iconName: "palette" },
      ]
    : universe === "shopping"
    ? [
        // Types de commerces
        { term: "centre commercial", category: "activity", displayLabel: "Centre Commercial", iconName: "shopping-bag" },
        { term: "souk", category: "activity", displayLabel: "Souk", iconName: "store" },
        { term: "boutique", category: "activity", displayLabel: "Boutique", iconName: "shirt" },
        { term: "artisanat", category: "activity", displayLabel: "Artisanat", iconName: "hand" },
        { term: "bijouterie", category: "activity", displayLabel: "Bijouterie", iconName: "gem" },
        // Tags
        { term: "mode", category: "tag", displayLabel: "Mode", iconName: "shirt" },
        { term: "decoration", category: "tag", displayLabel: "Décoration", iconName: "home" },
        { term: "luxe", category: "tag", displayLabel: "Luxe", iconName: "star" },
      ]
    : universe === "rentacar"
    ? [
        // Types de véhicules
        { term: "voiture", category: "activity", displayLabel: "Voiture", iconName: "car" },
        { term: "4x4", category: "activity", displayLabel: "4x4 / SUV", iconName: "car" },
        { term: "moto", category: "activity", displayLabel: "Moto / Scooter", iconName: "bike" },
        { term: "minibus", category: "activity", displayLabel: "Minibus", iconName: "bus" },
        { term: "luxe", category: "activity", displayLabel: "Véhicule de Luxe", iconName: "car" },
        // Tags
        { term: "avec chauffeur", category: "tag", displayLabel: "Avec Chauffeur", iconName: "user" },
        { term: "aeroport", category: "tag", displayLabel: "Aéroport", iconName: "plane" },
        { term: "longue duree", category: "tag", displayLabel: "Longue Durée", iconName: "calendar" },
      ]
    : [
        // Default fallback (tous univers)
        { term: "spa", category: "activity", displayLabel: "Spa", iconName: "sparkles" },
        { term: "restaurant", category: "cuisine", displayLabel: "Restaurant", iconName: "utensils" },
        { term: "escape game", category: "activity", displayLabel: "Escape Game", iconName: "puzzle" },
        { term: "famille", category: "tag", displayLabel: "En Famille", iconName: "users" },
        { term: "terrasse", category: "tag", displayLabel: "Terrasse", iconName: "sun" },
        { term: "romantique", category: "tag", displayLabel: "Romantique", iconName: "heart" },
      ];

  return res.json({
    ok: true,
    searches: fallbackSearches.slice(0, limit),
  });
}

type PublicHomeFeedItem = PublicEstablishmentListItem & {
  distance_km?: number | null;
  curated?: boolean;
  score?: number;
  google_rating?: number | null;
  google_review_count?: number | null;
};

type PublicHomeFeedResponse = {
  ok: true;
  lists: {
    best_deals: PublicHomeFeedItem[];
    selected_for_you: PublicHomeFeedItem[];
    near_you: PublicHomeFeedItem[];
    most_booked: PublicHomeFeedItem[];
    open_now: PublicHomeFeedItem[];
    trending: PublicHomeFeedItem[];
    new_establishments: PublicHomeFeedItem[];
    top_rated: PublicHomeFeedItem[];
    deals: PublicHomeFeedItem[];
    themed: PublicHomeFeedItem[];
  };
  meta: {
    universe?: string;
    city?: string;
    lat?: number;
    lng?: number;
    sessionId?: string;
    favoriteCount?: number;
    theme?: string | null;
  };
};

function parseFloatSafe(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

// ============================================
// PUBLIC CATEGORIES (Level 2)
// ============================================
export async function getPublicCategories(req: Request, res: Response) {
  const universe = asString(req.query.universe);

  const supabase = getAdminSupabase();

  let query = supabase
    .from("categories")
    .select("id,universe_slug,slug,name_fr,name_en,description_fr,description_en,icon_name,image_url,display_order,requires_booking,supports_packs")
    .eq("is_active", true)
    .order("display_order", { ascending: true })
    .order("name_fr", { ascending: true });

  if (universe) {
    query = query.eq("universe_slug", universe);
  }

  const { data, error } = await query.limit(200);

  if (error) return res.status(500).json({ error: error.message });

  res.json({
    ok: true,
    items: (data ?? []).map((row: Record<string, unknown>) => ({
      id: String(row.id ?? ""),
      slug: String(row.slug ?? ""),
      universe: String(row.universe_slug ?? ""),
      nameFr: String(row.name_fr ?? ""),
      nameEn: String(row.name_en ?? ""),
      descriptionFr: row.description_fr ? String(row.description_fr) : null,
      descriptionEn: row.description_en ? String(row.description_en) : null,
      iconName: row.icon_name ? String(row.icon_name) : null,
      imageUrl: row.image_url ? String(row.image_url) : null,
      requiresBooking: Boolean(row.requires_booking),
      supportsPacks: Boolean(row.supports_packs),
    })),
  });
}

// ============================================
// PUBLIC CATEGORY IMAGES (Subcategories - Level 3)
// ============================================
export async function getPublicCategoryImages(req: Request, res: Response) {
  const universe = asString(req.query.universe);

  const supabase = getAdminSupabase();

  // Use basic columns only (category_slug may not exist if migration wasn't run)
  let query = supabase
    .from("category_images")
    .select("category_id,name,image_url,universe,display_order")
    .eq("is_active", true)
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });

  if (universe) {
    query = query.eq("universe", universe);
  }

  const { data, error } = await query.limit(200);

  if (error) return res.status(500).json({ error: error.message });

  res.json({
    ok: true,
    items: (data ?? []).map((row: Record<string, unknown>) => ({
      id: String(row.category_id ?? ""),
      name: String(row.name ?? ""),
      imageUrl: String(row.image_url ?? ""),
      universe: String(row.universe ?? ""),
      categorySlug: null,
    })),
  });
}

function hasFiniteCoords(
  lat: number | null,
  lng: number | null,
): lat is number {
  return (
    typeof lat === "number" &&
    Number.isFinite(lat) &&
    typeof lng === "number" &&
    Number.isFinite(lng)
  );
}

function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const q =
    s1 * s1 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      s2 *
      s2;
  return 2 * R * Math.atan2(Math.sqrt(q), Math.sqrt(1 - q));
}

// ── Homepage "open now" / themed helpers ──

const FRENCH_TO_ENGLISH_DAY: Record<string, string> = {
  lundi: "monday", mardi: "tuesday", mercredi: "wednesday",
  jeudi: "thursday", vendredi: "friday", samedi: "saturday", dimanche: "sunday",
};

const WEEKDAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function isCurrentlyOpen(hoursRaw: unknown, now: Date): boolean {
  if (!hoursRaw || typeof hoursRaw !== "object") return false;

  // Normalize: handle French keys, DaySchedule v1/v2, and OpeningHours array format
  const raw = hoursRaw as Record<string, unknown>;
  const normalized: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(raw)) {
    const englishKey = FRENCH_TO_ENGLISH_DAY[key.toLowerCase()] || key.toLowerCase();
    normalized[englishKey] = val;
  }

  let intervals: Record<string, Array<{ from: string; to: string }>>;
  try {
    intervals = transformWizardHoursToOpeningHours(normalized);
  } catch (err) {
    log.warn({ err }, "failed to transform wizard hours to opening hours");
    return false;
  }

  const dayKey = WEEKDAY_KEYS[now.getDay()];
  const todayIntervals = intervals[dayKey];
  if (!todayIntervals || todayIntervals.length === 0) return false;

  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  for (const interval of todayIntervals) {
    const [fH, fM] = interval.from.split(":").map(Number);
    const [tH, tM] = interval.to.split(":").map(Number);
    if (isNaN(fH) || isNaN(fM) || isNaN(tH) || isNaN(tM)) continue;

    const fromMin = fH * 60 + fM;
    const toMin = tH * 60 + tM;

    if (toMin > fromMin) {
      // Normal range (e.g., 12:00 - 15:00)
      if (currentMinutes >= fromMin && currentMinutes < toMin) return true;
    } else if (toMin < fromMin) {
      // Overnight range (e.g., 22:00 - 02:00)
      if (currentMinutes >= fromMin || currentMinutes < toMin) return true;
    }
  }
  return false;
}

type ThemeKey = "romantic" | "brunch" | "lunch" | "ftour_shour" | null;

function getCurrentTheme(
  now: Date,
  ramadanConfig?: { enabled: boolean; start_date: string; end_date: string },
): { key: ThemeKey; tags: string[]; subcategories: string[] } {
  // Check Ramadan via platform_settings (DB-backed, admin-configurable)
  if (ramadanConfig?.enabled && ramadanConfig.start_date && ramadanConfig.end_date) {
    const start = new Date(ramadanConfig.start_date + "T00:00:00");
    const end = new Date(ramadanConfig.end_date + "T23:59:59");
    if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && now >= start && now <= end) {
      return { key: "ftour_shour", tags: ["ftour", "shour", "iftar", "ramadan"], subcategories: [] };
    }
  }
  // Fallback: check legacy env vars for backwards compatibility
  const ramadanStart = process.env.RAMADAN_START;
  const ramadanEnd = process.env.RAMADAN_END;
  if (ramadanStart && ramadanEnd) {
    const start = new Date(ramadanStart + "T00:00:00");
    const end = new Date(ramadanEnd + "T23:59:59");
    if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && now >= start && now <= end) {
      return { key: "ftour_shour", tags: ["ftour", "shour", "iftar", "ramadan"], subcategories: [] };
    }
  }

  const day = now.getDay(); // 0=Sun, 5=Fri, 6=Sat
  const hour = now.getHours();

  // Friday or Saturday evening (>= 18h)
  if ((day === 5 || day === 6) && hour >= 18) {
    return { key: "romantic", tags: ["romantique", "cosy", "en amoureux", "romantic", "date night", "cozy"], subcategories: [] };
  }

  // Saturday or Sunday morning/brunch (7h-14h)
  if ((day === 6 || day === 0) && hour >= 7 && hour < 14) {
    return { key: "brunch", tags: ["brunch", "petit-dejeuner", "breakfast", "petit déjeuner"], subcategories: ["brunch"] };
  }

  // Weekday lunch (Mon-Fri, 11h-15h)
  if (day >= 1 && day <= 5 && hour >= 11 && hour < 15) {
    return { key: "lunch", tags: ["dejeuner", "lunch", "midi", "déjeuner", "business lunch"], subcategories: [] };
  }

  return { key: null, tags: [], subcategories: [] };
}

type HomeCurationKind =
  | "best_deals" | "selected_for_you" | "near_you" | "most_booked"
  | "open_now" | "trending" | "new_establishments" | "top_rated"
  | "deals" | "themed" | "by_service_buffet" | "by_service_table" | "by_service_carte";

const VALID_CURATION_KINDS = new Set<string>([
  "best_deals", "selected_for_you", "near_you", "most_booked",
  "open_now", "trending", "new_establishments", "top_rated",
  "deals", "themed", "by_service_buffet", "by_service_table", "by_service_carte",
]);

function normalizeKind(raw: unknown): HomeCurationKind | null {
  const v = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!v) return null;
  if (VALID_CURATION_KINDS.has(v)) return v as HomeCurationKind;
  return null;
}

function sameText(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  const aa = (a ?? "").trim().toLowerCase();
  const bb = (b ?? "").trim().toLowerCase();
  if (!aa || !bb) return false;
  return aa === bb;
}

export async function getPublicHomeFeed(req: Request, res: Response) {
  const city = asString(req.query.city);
  const lat = parseFloatSafe(req.query.lat);
  const lng = parseFloatSafe(req.query.lng);

  const requestedUniverse = asString(req.query.universe) ?? undefined;
  const universeAliases = normalizePublicUniverseAliases(req.query.universe);

  const sessionIdRaw = asString(req.query.sessionId ?? req.query.session_id);
  const sessionId = sessionIdRaw && isUuid(sessionIdRaw) ? sessionIdRaw : null;

  const favoritesRaw = asString(req.query.favorites);
  const favoriteIds = new Set(
    (favoritesRaw ? favoritesRaw.split(",") : [])
      .map((v) => v.trim())
      .filter((v) => v && isUuid(v))
      .slice(0, 50),
  );

  const supabase = getAdminSupabase();

  // Universe values in DB are enum-backed. For curation we store the DB-safe universe.
  const curationUniverse =
    universeAliases.length === 1 ? universeAliases[0] : null;

  // 1) candidates
  let estQuery = supabase
    .from("establishments")
    .select(
      "id,slug,name,universe,subcategory,city,address,neighborhood,region,country,lat,lng,cover_url,booking_enabled,updated_at,google_rating,google_review_count,hours,tags,highlights,created_at,service_types",
    )
    .eq("status", "active")
    .eq("is_online", true)
    .not("cover_url", "is", null)
    .neq("cover_url", "");

  if (universeAliases.length === 1) {
    estQuery = estQuery.eq("universe", universeAliases[0]);
  } else if (universeAliases.length > 1) {
    estQuery = estQuery.in("universe", universeAliases);
  }

  // "Autour de moi" is a UI-only label — skip city filter when geolocation is provided
  const isNearMe = city && /autour\s*de\s*moi/i.test(city);
  if (city && !isNearMe) {
    estQuery = estQuery.ilike("city", city);
  }

  estQuery = estQuery.order("updated_at", { ascending: false }).range(0, 299);

  const { data: establishments, error: estErr } = await estQuery;
  if (estErr) return res.status(500).json({ error: estErr.message });

  const estArr = (establishments ?? []) as Array<Record<string, unknown>>;
  const ids = estArr
    .map((e) => (typeof e.id === "string" ? e.id : ""))
    .filter(Boolean);

  const nowIso = new Date().toISOString();
  const thirtyDaysAgo = new Date(
    Date.now() - 1000 * 60 * 60 * 24 * 30,
  ).toISOString();

  const [{ data: slots }, { data: reservations }] = await Promise.all([
    ids.length
      ? supabase
          .from("pro_slots")
          .select("establishment_id,starts_at,promo_type,promo_value,active")
          .in("establishment_id", ids)
          .eq("active", true)
          .gte("starts_at", nowIso)
          .order("starts_at", { ascending: true })
          .limit(5000)
      : Promise.resolve({ data: [] as unknown[] }),
    ids.length
      ? supabase
          .from("reservations")
          .select("establishment_id,created_at,status")
          .in("establishment_id", ids)
          .gte("created_at", thirtyDaysAgo)
          .in("status", OCCUPYING_RESERVATION_STATUSES as unknown as string[])
          .limit(5000)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  const nextSlotByEst = new Map<string, string>();
  const promoByEst = new Map<string, number>();

  for (const s of (slots ?? []) as Array<Record<string, unknown>>) {
    const establishmentId =
      typeof s.establishment_id === "string" ? s.establishment_id : "";
    const startsAt = typeof s.starts_at === "string" ? s.starts_at : "";
    if (!establishmentId || !startsAt) continue;

    if (!nextSlotByEst.has(establishmentId)) {
      nextSlotByEst.set(establishmentId, startsAt);
    }

    const promo = maxPromoPercent(s.promo_type, s.promo_value);
    if (promo != null) {
      promoByEst.set(
        establishmentId,
        Math.max(promoByEst.get(establishmentId) ?? 0, promo),
      );
    }
  }

  const reservationCountByEst = new Map<string, number>();
  for (const r of (reservations ?? []) as Array<Record<string, unknown>>) {
    const establishmentId =
      typeof r.establishment_id === "string" ? r.establishment_id : "";
    if (!establishmentId) continue;
    reservationCountByEst.set(
      establishmentId,
      (reservationCountByEst.get(establishmentId) ?? 0) + 1,
    );
  }

  const candidateItems: PublicHomeFeedItem[] = estArr
    .map((e) => {
      const id = typeof e.id === "string" ? e.id : "";
      if (!id) return null;

      const promo = promoByEst.get(id) ?? null;

      const latVal =
        typeof e.lat === "number" && Number.isFinite(e.lat) ? e.lat : null;
      const lngVal =
        typeof e.lng === "number" && Number.isFinite(e.lng) ? e.lng : null;

      const distance =
        lat != null && lng != null && hasFiniteCoords(latVal, lngVal)
          ? haversineKm({ lat, lng }, { lat: latVal, lng: lngVal })
          : null;

      return {
        id,
        name: typeof e.name === "string" ? e.name : null,
        universe: typeof e.universe === "string" ? e.universe : null,
        subcategory: typeof e.subcategory === "string" ? e.subcategory : null,
        city: typeof e.city === "string" ? e.city : null,
        address: typeof e.address === "string" ? e.address : null,
        neighborhood: typeof e.neighborhood === "string" ? e.neighborhood : null,
        region: typeof e.region === "string" ? e.region : null,
        country: typeof e.country === "string" ? e.country : null,
        lat: latVal,
        lng: lngVal,
        cover_url: typeof e.cover_url === "string" ? e.cover_url : null,
        booking_enabled:
          typeof e.booking_enabled === "boolean" ? e.booking_enabled : null,
        promo_percent: promo,
        next_slot_at: nextSlotByEst.get(id) ?? null,
        reservations_30d: reservationCountByEst.get(id) ?? 0,
        distance_km:
          distance != null && Number.isFinite(distance)
            ? Math.max(0, distance)
            : null,
        // Google rating
        google_rating: typeof e.google_rating === "number" ? e.google_rating : null,
        google_review_count: typeof e.google_review_count === "number" ? e.google_review_count : null,
      };
    })
    .filter(Boolean) as PublicHomeFeedItem[];

  // Metadata for new homepage sections (hours, tags, created_at)
  const estMeta = new Map<string, { hours: unknown; tags: string[]; highlights: string[]; created_at: string | null; service_types: string[] }>();
  for (const e of estArr) {
    const id = typeof e.id === "string" ? e.id : "";
    if (!id) continue;
    const tags = Array.isArray(e.tags) ? (e.tags as unknown[]).filter((t): t is string => typeof t === "string") : [];
    const highlights = Array.isArray(e.highlights) ? (e.highlights as unknown[]).filter((h): h is string => typeof h === "string") : [];
    const serviceTypes = Array.isArray(e.service_types) ? (e.service_types as unknown[]).filter((t): t is string => typeof t === "string") : [];
    estMeta.set(id, {
      hours: e.hours ?? null,
      tags,
      highlights,
      created_at: typeof e.created_at === "string" ? e.created_at : null,
      service_types: serviceTypes,
    });
  }

  const candidateById = new Map(candidateItems.map((i) => [i.id, i] as const));

  // 2) personalization signals from session visits
  const preferredSubcategories = new Set<string>();
  if (sessionId) {
    const { data: visits } = await supabase
      .from("establishment_visits")
      .select("establishment_id,visited_at")
      .eq("session_id", sessionId)
      .gte("visited_at", thirtyDaysAgo)
      .order("visited_at", { ascending: false })
      .limit(200);

    const visitedIds = Array.from(
      new Set(
        ((visits as Array<{ establishment_id: string }> | null) ?? [])
          .map((v) => v.establishment_id)
          .filter(isUuid),
      ),
    ).slice(0, 50);

    if (visitedIds.length) {
      const { data: visitedEsts } = await supabase
        .from("establishments")
        .select("id,universe,subcategory,status")
        .in("id", visitedIds)
        .eq("status", "active")
        .limit(200);

      for (const row of (visitedEsts ?? []) as Array<Record<string, unknown>>) {
        const sub =
          typeof row.subcategory === "string" ? row.subcategory.trim() : "";
        if (!sub) continue;

        // If we have a selected universe, prefer signals coming from the same universe.
        if (
          curationUniverse &&
          typeof row.universe === "string" &&
          row.universe !== curationUniverse
        )
          continue;

        preferredSubcategories.add(sub);
      }
    }
  }

  const scoreItem = (item: PublicHomeFeedItem): number => {
    let score = 0;

    const promo =
      typeof item.promo_percent === "number" &&
      Number.isFinite(item.promo_percent)
        ? item.promo_percent
        : 0;
    const reservations =
      typeof item.reservations_30d === "number" &&
      Number.isFinite(item.reservations_30d)
        ? item.reservations_30d
        : 0;

    score += reservations * 2;
    score += promo * 3;

    if (item.next_slot_at) score += 25;
    if (item.booking_enabled) score += 10;
    if (item.cover_url) score += 3;
    if (item.lat != null && item.lng != null) score += 2;

    if (item.subcategory && preferredSubcategories.has(item.subcategory))
      score += 18;
    if (favoriteIds.has(item.id)) score += 50;

    // In near-me mode, strongly boost nearby establishments
    if (isNearMe && typeof item.distance_km === "number" && Number.isFinite(item.distance_km)) {
      if (item.distance_km <= 5) score += 40;
      else if (item.distance_km <= 15) score += 25;
      else if (item.distance_km <= 30) score += 10;
    }

    return score;
  };

  // 3) admin curation overlay
  const curatedByKind = new Map<HomeCurationKind, string[]>();
  {
    let curationQuery = supabase
      .from("home_curation_items")
      .select("kind,establishment_id,weight,city,starts_at,ends_at");
    if (curationUniverse) {
      curationQuery = curationQuery.eq("universe", curationUniverse);
    }
    const { data: curations } = await curationQuery.limit(200);

    const nowTs = Date.now();
    const active = (
      (curations as Array<Record<string, unknown>> | null) ?? []
    ).filter((row) => {
      const kind = normalizeKind(row.kind);
      if (!kind) return false;

      const rowCity = typeof row.city === "string" ? row.city : null;
      if (city && !isNearMe) {
        // With city filter: exclude curations targeting a DIFFERENT city.
        if (rowCity && !sameText(rowCity, city)) return false;
      }
      // Without city filter: keep ALL curations (global + city-specific).

      const startsAt =
        typeof row.starts_at === "string" ? Date.parse(row.starts_at) : NaN;
      const endsAt =
        typeof row.ends_at === "string" ? Date.parse(row.ends_at) : NaN;

      if (Number.isFinite(startsAt) && startsAt > nowTs) return false;
      if (Number.isFinite(endsAt) && endsAt < nowTs) return false;

      return true;
    });

    const byKind = new Map<string, Array<{ id: string; weight: number }>>();
    for (const row of active) {
      const kind = normalizeKind(row.kind);
      const estId =
        typeof row.establishment_id === "string" ? row.establishment_id : "";
      if (!kind || !estId || !isUuid(estId)) continue;
      const weight =
        typeof row.weight === "number" && Number.isFinite(row.weight)
          ? row.weight
          : 100;
      const bucket = byKind.get(kind) ?? [];
      bucket.push({ id: estId, weight });
      byKind.set(kind, bucket);
    }

    (
      Array.from(byKind.entries()) as Array<
        [string, Array<{ id: string; weight: number }>]
      >
    ).forEach(([kind, arr]) => {
      arr.sort((a, b) => b.weight - a.weight);
      curatedByKind.set(
        kind as any,
        arr.map((x) => x.id),
      );
    });
  }

  // ── Supplemental fetch for curated establishments not in candidate pool ──
  {
    const allCuratedIds = new Set<string>();
    for (const ids of curatedByKind.values()) {
      for (const id of ids) allCuratedIds.add(id);
    }
    const missingIds = [...allCuratedIds].filter((id) => !candidateById.has(id));
    if (missingIds.length > 0) {
      const { data: extras } = await supabase
        .from("establishments")
        .select(
          "id,slug,name,universe,subcategory,city,address,neighborhood,region,country,lat,lng,cover_url,booking_enabled,google_rating,google_review_count,service_types",
        )
        .in("id", missingIds)
        .eq("status", "active")
        .eq("is_online", true)
        .not("cover_url", "is", null)
        .neq("cover_url", "");
      for (const e of (extras ?? []) as Array<Record<string, unknown>>) {
        const id = typeof e.id === "string" ? e.id : "";
        if (!id) continue;
        const item: PublicHomeFeedItem = {
          id,
          name: typeof e.name === "string" ? e.name : null,
          universe: typeof e.universe === "string" ? e.universe : null,
          subcategory: typeof e.subcategory === "string" ? e.subcategory : null,
          city: typeof e.city === "string" ? e.city : null,
          address: typeof e.address === "string" ? e.address : null,
          neighborhood: typeof e.neighborhood === "string" ? e.neighborhood : null,
          region: typeof e.region === "string" ? e.region : null,
          country: typeof e.country === "string" ? e.country : null,
          lat: typeof e.lat === "number" ? e.lat : null,
          lng: typeof e.lng === "number" ? e.lng : null,
          cover_url: typeof e.cover_url === "string" ? e.cover_url : null,
          booking_enabled: typeof e.booking_enabled === "boolean" ? e.booking_enabled : null,
          promo_percent: promoByEst.get(id) ?? null,
          next_slot_at: nextSlotByEst.get(id) ?? null,
          reservations_30d: reservationCountByEst.get(id) ?? 0,
          distance_km: null,
          google_rating: typeof e.google_rating === "number" ? e.google_rating : null,
          google_review_count: typeof e.google_review_count === "number" ? e.google_review_count : null,
        };
        candidateById.set(id, item);
        // Also populate estMeta for service_type sections
        const serviceTypes = Array.isArray(e.service_types)
          ? (e.service_types as unknown[]).filter((t): t is string => typeof t === "string")
          : [];
        if (!estMeta.has(id)) {
          estMeta.set(id, { hours: null, tags: [], highlights: [], created_at: null, service_types: serviceTypes });
        }
      }
    }
  }

  const withCuratedFirst = (
    kind: HomeCurationKind,
    base: PublicHomeFeedItem[],
  ): PublicHomeFeedItem[] => {
    const curatedIds = curatedByKind.get(kind) ?? [];
    const curated: PublicHomeFeedItem[] = curatedIds
      .map((id) => candidateById.get(id))
      .filter(Boolean)
      .map((item) => ({ ...item, curated: true }));

    if (!curatedIds.length) return base;

    const curatedSet = new Set(curatedIds);
    return [...curated, ...base.filter((i) => !curatedSet.has(i.id))];
  };

  // 4) build lists
  const bestDealsBase = [...candidateItems]
    .filter(
      (i) =>
        typeof i.promo_percent === "number" &&
        Number.isFinite(i.promo_percent) &&
        (i.promo_percent ?? 0) > 0,
    )
    .sort((a, b) => {
      const ap = a.promo_percent ?? 0;
      const bp = b.promo_percent ?? 0;
      if (bp !== ap) return bp - ap;

      const at = a.next_slot_at ? Date.parse(a.next_slot_at) : Infinity;
      const bt = b.next_slot_at ? Date.parse(b.next_slot_at) : Infinity;
      if (at !== bt) return at - bt;

      return (b.reservations_30d ?? 0) - (a.reservations_30d ?? 0);
    });

  const mostBookedBase = [...candidateItems].sort(
    (a, b) => (b.reservations_30d ?? 0) - (a.reservations_30d ?? 0),
  );

  const nearBase =
    lat != null && lng != null
      ? [...candidateItems]
          .filter(
            (i) =>
              typeof i.distance_km === "number" &&
              Number.isFinite(i.distance_km),
          )
          .sort((a, b) => (a.distance_km ?? 0) - (b.distance_km ?? 0))
      : [...candidateItems].sort((a, b) => {
          const at = a.next_slot_at ? Date.parse(a.next_slot_at) : Infinity;
          const bt = b.next_slot_at ? Date.parse(b.next_slot_at) : Infinity;
          if (at !== bt) return at - bt;
          return (b.reservations_30d ?? 0) - (a.reservations_30d ?? 0);
        });

  const selectedBase = [...candidateItems]
    .map((i) => {
      const score = scoreItem(i);
      return { ...i, score };
    })
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

  const bestDeals = withCuratedFirst("best_deals", bestDealsBase);
  const selectedForYou = withCuratedFirst("selected_for_you", selectedBase);
  const nearYou = withCuratedFirst("near_you", nearBase);
  const mostBooked = withCuratedFirst("most_booked", mostBookedBase);

  // ── New smart sections ──
  const now = new Date();
  const currentHour = now.getHours();

  const bestScoreSort = (a: PublicHomeFeedItem, b: PublicHomeFeedItem) => {
    const sa = (a.google_rating ?? 3) * Math.sqrt(Math.max(1, a.google_review_count ?? 1));
    const sb = (b.google_rating ?? 3) * Math.sqrt(Math.max(1, b.google_review_count ?? 1));
    return sb - sa;
  };

  // Open now: only during 7h-23h, filter by opening hours, optionally by 20km radius
  const openNowBase = (currentHour >= 7 && currentHour < 23)
    ? [...candidateItems]
        .filter((i) => {
          const meta = estMeta.get(i.id);
          if (!meta?.hours) return false;
          if (!isCurrentlyOpen(meta.hours, now)) return false;
          if (lat != null && lng != null && typeof i.distance_km === "number" && i.distance_km > 20) return false;
          return true;
        })
        .sort(bestScoreSort)
    : [];

  // Trending: at least 1 reservation in past 30 days
  const trendingBase = [...candidateItems]
    .filter((i) => (i.reservations_30d ?? 0) >= 1)
    .sort((a, b) => (b.reservations_30d ?? 0) - (a.reservations_30d ?? 0));

  // New establishments: created within past 30 days
  const thirtyDaysAgoMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
  const newEstBase = [...candidateItems]
    .filter((i) => {
      const meta = estMeta.get(i.id);
      const ts = meta?.created_at ? Date.parse(meta.created_at) : NaN;
      return Number.isFinite(ts) && ts > thirtyDaysAgoMs;
    })
    .sort((a, b) => {
      const ca = Date.parse(estMeta.get(a.id)?.created_at ?? "") || 0;
      const cb = Date.parse(estMeta.get(b.id)?.created_at ?? "") || 0;
      return cb - ca;
    });

  // Top rated: google_rating >= 4.0 AND google_review_count >= 5
  const topRatedBase = [...candidateItems]
    .filter((i) =>
      typeof i.google_rating === "number" && i.google_rating >= 4.0 &&
      typeof i.google_review_count === "number" && i.google_review_count >= 5,
    )
    .sort(bestScoreSort);

  // Deals: has promotions
  const dealsNewBase = [...candidateItems]
    .filter((i) => typeof i.promo_percent === "number" && i.promo_percent > 0)
    .sort((a, b) => (b.promo_percent ?? 0) - (a.promo_percent ?? 0));

  // Themed: contextual based on time of week (Ramadan config loaded from DB)
  const ramadanConfig = await getRamadanConfig();
  const theme = getCurrentTheme(now, ramadanConfig);
  const themedBase = theme.key
    ? [...candidateItems]
        .filter((i) => {
          const meta = estMeta.get(i.id);
          const itemTags = [...(meta?.tags ?? []), ...(meta?.highlights ?? [])].map((t) => t.toLowerCase());
          const tagMatch = theme.tags.some((t) => itemTags.some((it) => it.includes(t)));
          const subMatch = theme.subcategories.some((s) => (i.subcategory ?? "").toLowerCase().includes(s));
          return tagMatch || subMatch;
        })
        .sort(bestScoreSort)
    : [];

  // ── Service type sections ──
  const buffetBase = [...candidateItems].filter((i) => {
    const meta = estMeta.get(i.id);
    return meta?.service_types.some((t) => t.toLowerCase().includes("buffet"));
  }).sort(bestScoreSort);

  const serviTableBase = [...candidateItems].filter((i) => {
    const meta = estMeta.get(i.id);
    return meta?.service_types.some((t) => t.toLowerCase().includes("servi"));
  }).sort(bestScoreSort);

  const aLaCarteBase = [...candidateItems].filter((i) => {
    const meta = estMeta.get(i.id);
    return meta?.service_types.some((t) => t.toLowerCase().includes("carte"));
  }).sort(bestScoreSort);

  // ── Dedup helpers ──
  const used = new Set<string>();
  const takeUnique = (
    items: PublicHomeFeedItem[],
    limit: number,
  ): PublicHomeFeedItem[] => {
    const out: PublicHomeFeedItem[] = [];
    for (const item of items) {
      if (out.length >= limit) break;
      if (used.has(item.id)) continue;
      used.add(item.id);
      out.push(item);
    }
    return out;
  };

  // Self-dedup (no cross-section dedup for new sections)
  const takeSelfUnique = (items: PublicHomeFeedItem[], limit: number): PublicHomeFeedItem[] => {
    const seen = new Set<string>();
    const out: PublicHomeFeedItem[] = [];
    for (const item of items) {
      if (out.length >= limit) break;
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
    return out;
  };

  const lists = {
    best_deals: takeUnique(bestDeals, 12),
    selected_for_you: takeUnique(selectedForYou, 12),
    near_you: takeUnique(nearYou, 12),
    most_booked: takeUnique(mostBooked, 12),
    // New smart sections — with curation support
    open_now: takeSelfUnique(withCuratedFirst("open_now", openNowBase), 10),
    trending: takeSelfUnique(withCuratedFirst("trending", trendingBase), 10),
    new_establishments: newEstBase.length >= 3 ? takeSelfUnique(withCuratedFirst("new_establishments", newEstBase), 8) : [],
    top_rated: takeSelfUnique(withCuratedFirst("top_rated", topRatedBase), 10),
    deals: dealsNewBase.length >= 2 ? takeSelfUnique(withCuratedFirst("deals", dealsNewBase), 8) : [],
    themed: takeSelfUnique(withCuratedFirst("themed", themedBase), 8),
    // Service type sections — with curation support
    by_service_buffet: takeSelfUnique(withCuratedFirst("by_service_buffet", buffetBase), 10),
    by_service_table: takeSelfUnique(withCuratedFirst("by_service_table", serviTableBase), 10),
    by_service_carte: takeSelfUnique(withCuratedFirst("by_service_carte", aLaCarteBase), 10),
  };

  const payload = {
    ok: true as const,
    lists,
    meta: {
      ...(requestedUniverse ? { universe: requestedUniverse } : {}),
      ...(city ? { city } : {}),
      ...(lat != null ? { lat } : {}),
      ...(lng != null ? { lng } : {}),
      ...(sessionId ? { sessionId } : {}),
      ...(favoriteIds.size ? { favoriteCount: favoriteIds.size } : {}),
      ...(theme.key ? { theme: theme.key } : {}),
      ramadan_active: theme.key === "ftour_shour",
    },
  };

  return res.json(payload);
}

export function isDemoRoutesAllowed(): boolean {
  // Defense-in-depth: even if a demo route gets registered by mistake, it should be a no-op in production.
  if (process.env.NODE_ENV === "production") return false;
  return String(process.env.ALLOW_DEMO_ROUTES ?? "").toLowerCase() === "true";
}

// ── Test-only exports ──
// Expose pure helper functions for unit testing.
export {
  normalizePublicUniverseAliases,
  normalizeSearchTerm,
  parseFloatSafe,
  hasFiniteCoords,
  haversineKm,
  isCurrentlyOpen,
  getCurrentTheme,
  normalizeKind,
  sameText,
};

