/**
 * Sam AI Assistant — Data Access Layer
 *
 * Bridge entre les tools GPT-4o-mini et la base Supabase.
 * Réutilise les mêmes requêtes que server/routes/public.ts
 * mais sous forme de fonctions pures (sans req/res Express).
 */

import { getAdminSupabase } from "../supabaseAdmin";
import { OCCUPYING_RESERVATION_STATUSES } from "../../shared/reservationStates";
import { createModuleLogger } from "./logger";

const log = createModuleLogger("samDataAccess");

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SamEstablishmentListItem {
  id: string;
  slug: string | null;
  name: string;
  universe: string;
  subcategory: string | null;
  city: string | null;
  address: string | null;
  neighborhood: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  cover_url: string | null;
  booking_enabled: boolean;
  google_rating: number | null;
  google_review_count: number | null;
  promo_percent: number | null;
  next_slot_at: string | null;
  reservations_30d: number;
}

export interface SamEstablishmentDetails {
  id: string;
  slug: string | null;
  name: string;
  universe: string;
  subcategory: string | null;
  category: string | null;
  city: string | null;
  address: string | null;
  neighborhood: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  whatsapp: string | null;
  website: string | null;
  description_short: string | null;
  description_long: string | null;
  cover_url: string | null;
  hours: unknown;
  tags: string[] | null;
  highlights: unknown;
  amenities: unknown;
  booking_enabled: boolean;
  google_rating: number | null;
  google_review_count: number | null;
  google_maps_url: string | null;
  menu_digital_url: string | null;
}

export interface SamDateSlots {
  date: string;
  services: Array<{ service: string; times: string[] }>;
  promos: Record<string, number | null>;
  slotIds: Record<string, string>;
  remaining: Record<string, number | null>;
}

export interface SamReservation {
  id: string;
  booking_reference: string | null;
  kind: string;
  establishment_id: string;
  status: string;
  starts_at: string;
  party_size: number | null;
  amount_total: number | null;
  amount_deposit: number | null;
  payment_status: string | null;
  created_at: string;
  establishment_name: string | null;
  establishment_city: string | null;
}

export interface SamUserProfile {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  country: string | null;
  reliability_score: number | null;
  reliability_level: string | null;
}

// ---------------------------------------------------------------------------
// Universe normalization (répliqué de public.ts — normalizePublicUniverseAliases)
// Le champ DB `establishments.universe` utilise l'enum Postgres `booking_kind`
// dont les valeurs sont SINGULIÈRES : restaurant, loisir, hebergement, wellness, culture.
// GPT envoie souvent les pluriels (restaurants, loisirs) → il faut normaliser.
// ---------------------------------------------------------------------------

const UNIVERSE_ALIASES: Record<string, string | null> = {
  restaurants: "restaurant",
  restaurant: "restaurant",
  loisirs: "loisir",
  loisir: "loisir",
  sport: "loisir",
  wellness: "wellness",
  hebergement: "hebergement",
  hotels: "hebergement",
  hotel: "hebergement",
  culture: "culture",
  shopping: null, // pas de valeur DB enum correspondante
};

const VALID_DB_UNIVERSES = new Set(["restaurant", "loisir", "hebergement", "wellness", "culture"]);

/**
 * Normalise une valeur `universe` provenant de GPT vers la valeur DB enum.
 * Retourne null si la valeur n'est pas reconnue (= pas de filtre univers).
 */
function normalizeUniverse(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const lower = raw.trim().toLowerCase();
  if (!lower) return null;

  const mapped = UNIVERSE_ALIASES[lower];
  if (mapped !== undefined) return mapped; // peut être null (shopping)

  // Si la valeur brute est déjà un enum valide
  if (VALID_DB_UNIVERSES.has(lower)) return lower;

  // Valeur inconnue → pas de filtre pour éviter un crash Postgres
  return null;
}

// ---------------------------------------------------------------------------
// Helpers (répliqués de public.ts pour éviter le couplage)
// ---------------------------------------------------------------------------

function toYmd(dt: Date): string {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

function timeHm(dt: Date): string {
  return `${String(dt.getHours()).padStart(2, "0")}:${String(dt.getMinutes()).padStart(2, "0")}`;
}

function getServiceLabel(min: number): string {
  if (min < 15 * 60) return "Midi";
  if (min < 17 * 60 + 30) return "Tea Time";
  if (min < 19 * 60 + 30) return "Happy Hour";
  return "Soir";
}

function promoPercent(promoType: string | null, promoValue: number | null): number | null {
  if (promoType !== "percent" || !promoValue || promoValue <= 0) return null;
  return Math.min(95, Math.max(1, Math.round(promoValue)));
}

function centsToMad(cents: unknown): number | null {
  if (typeof cents !== "number" || !Number.isFinite(cents)) return null;
  return Math.round(cents) / 100;
}

// ---------------------------------------------------------------------------
// 1. Recherche d'établissements
// ---------------------------------------------------------------------------

export async function searchEstablishments(params: {
  q?: string;
  city?: string;
  universe?: string;
  category?: string;
  sort?: string;
  promoOnly?: boolean;
  limit?: number;
  offset?: number;
}): Promise<{ establishments: SamEstablishmentListItem[]; total: number }> {
  const supabase = getAdminSupabase();
  const limit = Math.min(10, Math.max(1, params.limit ?? 5));
  const offset = Math.max(0, params.offset ?? 0);

  // Normaliser l'univers (restaurants → restaurant, loisirs → loisir, etc.)
  const dbUniverse = normalizeUniverse(params.universe);

  // Si recherche textuelle, utiliser la fonction scored
  // Incorporer la catégorie dans la requête de recherche pour filtrer par cuisine/type
  const effectiveQ = params.q && params.q.length >= 2
    ? (params.category ? `${params.q} ${params.category}`.trim() : params.q)
    : (params.category && params.category.length >= 2 ? params.category : null);

  if (effectiveQ) {
    const { data: scoredResults, error } = await supabase.rpc(
      "search_establishments_scored",
      {
        search_query: effectiveQ,
        filter_universe: dbUniverse,
        filter_city: params.city ?? null,
        result_limit: limit,
        result_offset: offset,
      },
    );

    if (error) {
      log.error({ err: error.message, q: params.q, universe: dbUniverse, city: params.city }, "search_establishments_scored error");
    }

    if (error || !scoredResults?.length) {
      // Fallback : essayer sans le filtre universe (peut-être que GPT a mal classé)
      if (dbUniverse) {
        const { data: fallbackResults } = await supabase.rpc(
          "search_establishments_scored",
          {
            search_query: effectiveQ,
            filter_universe: null,
            filter_city: params.city ?? null,
            result_limit: limit,
            result_offset: offset,
          },
        );
        if (fallbackResults?.length) {
          const ids = fallbackResults.map((r: any) => r.id);
          return enrichEstablishmentList(ids, limit);
        }
      }

      return { establishments: [], total: 0 };
    }

    const ids = scoredResults.map((r: any) => r.id);
    return enrichEstablishmentList(ids, limit);
  }

  // Sinon, requête directe avec filtres
  let query = supabase
    .from("establishments")
    .select(
      "id,slug,name,universe,subcategory,city,address,neighborhood,lat,lng,phone,cover_url,booking_enabled,google_rating,google_review_count",
      { count: "exact" },
    )
    .eq("status", "active");

  if (dbUniverse) {
    query = query.eq("universe", dbUniverse);
  }
  if (params.city) {
    query = query.ilike("city", params.city);
  }
  if (params.category) {
    query = query.ilike("subcategory", `%${params.category}%`);
  }

  query = query.order("updated_at", { ascending: false }).range(offset, offset + limit - 1);

  const { data: rows, count, error } = await query;

  if (error) {
    log.error({ err: error.message, universe: dbUniverse, city: params.city, category: params.category }, "Direct query error");
  }

  if (error || !rows?.length) {
    // Fallback : si on avait un filtre catégorie, essayer la catégorie comme terme de recherche
    if (params.category && params.category.length >= 2) {
      const searchQ = params.category;
      const { data: catResults } = await supabase.rpc(
        "search_establishments_scored",
        {
          search_query: searchQ,
          filter_universe: dbUniverse,
          filter_city: params.city ?? null,
          result_limit: limit,
          result_offset: offset,
        },
      );
      if (catResults?.length) {
        const ids = catResults.map((r: any) => r.id);
        return enrichEstablishmentList(ids, limit);
      }
    }
    return { establishments: [], total: 0 };
  }

  const ids = (rows as any[]).map((r) => r.id);
  const result = await enrichEstablishmentList(ids, limit);
  return { ...result, total: count ?? result.establishments.length };
}

async function enrichEstablishmentList(
  ids: string[],
  limit: number,
): Promise<{ establishments: SamEstablishmentListItem[]; total: number }> {
  if (!ids.length) return { establishments: [], total: 0 };

  const supabase = getAdminSupabase();
  const nowIso = new Date().toISOString();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [{ data: establishments }, { data: slots }, { data: reservations }] =
    await Promise.all([
      supabase
        .from("establishments")
        .select(
          "id,slug,name,universe,subcategory,city,address,neighborhood,lat,lng,phone,cover_url,booking_enabled,google_rating,google_review_count",
        )
        .in("id", ids)
        .eq("status", "active"),
      supabase
        .from("pro_slots")
        .select("establishment_id,starts_at,promo_type,promo_value")
        .in("establishment_id", ids)
        .eq("active", true)
        .gte("starts_at", nowIso)
        .order("starts_at", { ascending: true })
        .limit(2000),
      supabase
        .from("reservations")
        .select("establishment_id")
        .in("establishment_id", ids)
        .gte("created_at", thirtyDaysAgo)
        .in("status", OCCUPYING_RESERVATION_STATUSES as unknown as string[])
        .limit(5000),
    ]);

  const nextSlotByEst = new Map<string, string>();
  const promoByEst = new Map<string, number>();
  for (const s of (slots ?? []) as any[]) {
    if (!s.establishment_id) continue;
    if (!nextSlotByEst.has(s.establishment_id)) {
      nextSlotByEst.set(s.establishment_id, s.starts_at);
    }
    const p = promoPercent(s.promo_type, s.promo_value);
    if (p != null) {
      promoByEst.set(s.establishment_id, Math.max(promoByEst.get(s.establishment_id) ?? 0, p));
    }
  }

  const resByEst = new Map<string, number>();
  for (const r of (reservations ?? []) as any[]) {
    if (!r.establishment_id) continue;
    resByEst.set(r.establishment_id, (resByEst.get(r.establishment_id) ?? 0) + 1);
  }

  const items: SamEstablishmentListItem[] = ((establishments ?? []) as any[]).map((e) => ({
    id: e.id,
    slug: e.slug ?? null,
    name: e.name,
    universe: e.universe,
    subcategory: e.subcategory ?? null,
    city: e.city ?? null,
    address: e.address ?? null,
    neighborhood: e.neighborhood ?? null,
    lat: e.lat ?? null,
    lng: e.lng ?? null,
    phone: e.phone ?? null,
    cover_url: e.cover_url ?? null,
    booking_enabled: e.booking_enabled ?? false,
    google_rating: e.google_rating ?? null,
    google_review_count: e.google_review_count ?? null,
    promo_percent: promoByEst.get(e.id) ?? null,
    next_slot_at: nextSlotByEst.get(e.id) ?? null,
    reservations_30d: resByEst.get(e.id) ?? 0,
  }));

  // Garder l'ordre des IDs d'entrée (scoring)
  const idOrder = new Map(ids.map((id, i) => [id, i]));
  items.sort((a, b) => (idOrder.get(a.id) ?? 999) - (idOrder.get(b.id) ?? 999));

  return { establishments: items.slice(0, limit), total: items.length };
}

// ---------------------------------------------------------------------------
// 2. Détails d'un établissement
// ---------------------------------------------------------------------------

export async function getEstablishmentDetails(
  ref: string,
): Promise<{ establishment: SamEstablishmentDetails; availableSlots: SamDateSlots[] } | null> {
  const supabase = getAdminSupabase();

  // Résolution de l'ID (UUID, slug, ou username)
  const establishmentId = await resolveEstablishmentId(ref);
  if (!establishmentId) return null;

  const { data: est } = await supabase
    .from("establishments")
    .select(
      "id,slug,name,universe,subcategory,category,city,address,neighborhood,lat,lng,phone,whatsapp,website,description_short,description_long,cover_url,hours,tags,highlights,amenities,booking_enabled,google_rating,google_review_count,google_maps_url,menu_digital_enabled",
    )
    .eq("id", establishmentId)
    .maybeSingle();

  if (!est) return null;

  // Charger les créneaux disponibles
  const nowIso = new Date().toISOString();
  const { data: slots } = await supabase
    .from("pro_slots")
    .select(
      "id,starts_at,capacity,promo_type,promo_value,promo_label,service_label,active",
    )
    .eq("establishment_id", establishmentId)
    .eq("active", true)
    .gte("starts_at", nowIso)
    .order("starts_at", { ascending: true })
    .limit(500);

  const slotsArr = (slots ?? []) as any[];

  // Compter les réservations par slot pour calculer les places restantes
  const usedBySlotId = new Map<string, number>();
  if (slotsArr.length) {
    const slotIds = slotsArr.map((s) => s.id);
    const { data: bySlot } = await supabase
      .from("reservations")
      .select("slot_id, party_size")
      .in("slot_id", slotIds)
      .in("status", OCCUPYING_RESERVATION_STATUSES as unknown as string[])
      .limit(5000);

    for (const r of (bySlot ?? []) as any[]) {
      if (!r.slot_id) continue;
      const size = typeof r.party_size === "number" ? Math.max(0, Math.round(r.party_size)) : 0;
      usedBySlotId.set(r.slot_id, (usedBySlotId.get(r.slot_id) ?? 0) + size);
    }
  }

  // Grouper les créneaux par date (même format que public.ts)
  const byDate = new Map<string, SamDateSlots>();

  for (const s of slotsArr) {
    const dt = new Date(s.starts_at);
    if (!Number.isFinite(dt.getTime())) continue;

    const date = toYmd(new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()));
    const time = timeHm(dt);
    const minutes = dt.getHours() * 60 + dt.getMinutes();
    const serviceLabel = String(s.service_label ?? "").trim() || getServiceLabel(minutes);

    const dateSlot = byDate.get(date) ?? {
      date,
      services: [],
      promos: {},
      slotIds: {},
      remaining: {},
    };

    dateSlot.promos[time] = promoPercent(s.promo_type, s.promo_value);
    dateSlot.slotIds[time] = s.id;

    const used = usedBySlotId.get(s.id) ?? 0;
    const cap = typeof s.capacity === "number" ? Math.max(0, Math.round(s.capacity)) : null;
    dateSlot.remaining[time] = cap == null ? null : Math.max(0, cap - used);

    const existingService = dateSlot.services.find((x) => x.service === serviceLabel);
    if (existingService) {
      if (!existingService.times.includes(time)) existingService.times.push(time);
    } else {
      dateSlot.services.push({ service: serviceLabel, times: [time] });
    }

    for (const svc of dateSlot.services) {
      svc.times.sort((a, b) => a.localeCompare(b));
    }

    byDate.set(date, dateSlot);
  }

  const availableSlots = Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));

  const menuDigitalBaseUrl = process.env.MENU_DIGITAL_BASE_URL || "https://menu.sam.ma";
  const menuDigitalUrl =
    (est as any).menu_digital_enabled && est.slug
      ? `${menuDigitalBaseUrl}/${est.slug}`
      : null;

  const establishment: SamEstablishmentDetails = {
    id: est.id as string,
    slug: (est.slug as string) ?? null,
    name: est.name as string,
    universe: est.universe as string,
    subcategory: (est.subcategory as string) ?? null,
    category: (est.category as string) ?? null,
    city: (est.city as string) ?? null,
    address: (est.address as string) ?? null,
    neighborhood: (est.neighborhood as string) ?? null,
    lat: (est.lat as number) ?? null,
    lng: (est.lng as number) ?? null,
    phone: (est.phone as string) ?? null,
    whatsapp: (est.whatsapp as string) ?? null,
    website: (est.website as string) ?? null,
    description_short: (est.description_short as string) ?? null,
    description_long: (est.description_long as string) ?? null,
    cover_url: (est.cover_url as string) ?? null,
    hours: est.hours ?? null,
    tags: (est.tags as string[]) ?? null,
    highlights: est.highlights ?? null,
    amenities: est.amenities ?? null,
    booking_enabled: (est.booking_enabled as boolean) ?? false,
    google_rating: (est.google_rating as number) ?? null,
    google_review_count: (est.google_review_count as number) ?? null,
    google_maps_url: (est.google_maps_url as string) ?? null,
    menu_digital_url: menuDigitalUrl,
  };

  return { establishment, availableSlots };
}

async function resolveEstablishmentId(ref: string): Promise<string | null> {
  const trimmed = ref.trim();
  if (!trimmed) return null;

  const supabase = getAdminSupabase();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  if (isUuid.test(trimmed)) return trimmed;

  // Par slug
  const { data: bySlug } = await supabase
    .from("establishments")
    .select("id")
    .eq("slug", trimmed)
    .eq("status", "active")
    .limit(1);
  if ((bySlug as any[])?.[0]?.id) return (bySlug as any[])[0].id;

  // Par username
  const { data: byUsername } = await supabase
    .from("establishments")
    .select("id")
    .ilike("username", trimmed)
    .eq("status", "active")
    .limit(1);
  if ((byUsername as any[])?.[0]?.id) return (byUsername as any[])[0].id;

  return null;
}

// ---------------------------------------------------------------------------
// 3. Créneaux disponibles pour une date spécifique
// ---------------------------------------------------------------------------

export async function getAvailableSlots(
  establishmentId: string,
  date: string,
): Promise<SamDateSlots | null> {
  const result = await getEstablishmentDetails(establishmentId);
  if (!result) return null;

  return result.availableSlots.find((s) => s.date === date) ?? null;
}

// ---------------------------------------------------------------------------
// 4. Créer une réservation
// ---------------------------------------------------------------------------

export async function createReservation(params: {
  userId: string;
  establishmentId: string;
  slotId: string;
  startsAt: string;
  partySize: number;
  meta?: Record<string, unknown>;
}): Promise<{ ok: true; reservationId: string; reference: string } | { ok: false; error: string }> {
  const supabase = getAdminSupabase();

  // Validation de base
  const startsAtDate = new Date(params.startsAt);
  if (!Number.isFinite(startsAtDate.getTime())) {
    return { ok: false, error: "invalid_starts_at" };
  }

  const PAST_TOLERANCE_MS = 5 * 60 * 1000;
  if (startsAtDate.getTime() < Date.now() - PAST_TOLERANCE_MS) {
    return { ok: false, error: "reservation_date_in_past" };
  }

  // Vérifier doublon
  const { data: dup } = await supabase
    .from("reservations")
    .select("id")
    .eq("user_id", params.userId)
    .eq("slot_id", params.slotId)
    .in("status", ["confirmed", "pending_pro_validation", "requested", "waitlist"])
    .limit(1)
    .maybeSingle();

  if ((dup as any)?.id) {
    return { ok: false, error: "duplicate_slot_booking" };
  }

  // Générer une référence unique
  const reference = `SAM-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

  const { data: inserted, error } = await supabase
    .from("reservations")
    .insert({
      establishment_id: params.establishmentId,
      user_id: params.userId,
      slot_id: params.slotId,
      starts_at: startsAtDate.toISOString(),
      party_size: params.partySize,
      booking_reference: reference,
      kind: "restaurant",
      status: "pending_pro_validation",
      payment_status: "pending",
      meta: {
        ...(params.meta ?? {}),
        source: "sam_assistant",
      },
    })
    .select("id,booking_reference")
    .single();

  if (error) {
    log.error({ err: error }, "createReservation error");
    return { ok: false, error: "db_error" };
  }

  return {
    ok: true,
    reservationId: (inserted as any).id,
    reference: (inserted as any).booking_reference,
  };
}

// ---------------------------------------------------------------------------
// 5. Réservations de l'utilisateur
// ---------------------------------------------------------------------------

export async function getUserReservations(
  userId: string,
  filter?: "upcoming" | "past" | "all",
): Promise<SamReservation[]> {
  const supabase = getAdminSupabase();

  let query = supabase
    .from("reservations")
    .select(
      "id,booking_reference,kind,establishment_id,status,starts_at,party_size,amount_total,amount_deposit,payment_status,created_at,establishments(name,city)",
    )
    .eq("user_id", userId)
    .order("starts_at", { ascending: false })
    .limit(50);

  const nowIso = new Date().toISOString();
  if (filter === "upcoming") {
    query = query.gte("starts_at", nowIso);
  } else if (filter === "past") {
    query = query.lt("starts_at", nowIso);
  }

  const { data: rows, error } = await query;
  if (error || !rows?.length) return [];

  return (rows as any[]).map((r) => ({
    id: r.id,
    booking_reference: r.booking_reference ?? null,
    kind: r.kind ?? "restaurant",
    establishment_id: r.establishment_id,
    status: r.status,
    starts_at: r.starts_at,
    party_size: r.party_size ?? null,
    amount_total: centsToMad(r.amount_total),
    amount_deposit: centsToMad(r.amount_deposit),
    payment_status: r.payment_status ?? null,
    created_at: r.created_at,
    establishment_name: r.establishments?.name ?? null,
    establishment_city: r.establishments?.city ?? null,
  }));
}

// ---------------------------------------------------------------------------
// 6. Trending / Home Feed
// ---------------------------------------------------------------------------

export async function getTrendingEstablishments(
  city?: string,
  universe?: string,
): Promise<SamEstablishmentListItem[]> {
  const supabase = getAdminSupabase();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Normaliser l'univers
  const dbUniverse = normalizeUniverse(universe);

  let query = supabase
    .from("establishments")
    .select(
      "id,slug,name,universe,subcategory,city,address,neighborhood,lat,lng,phone,cover_url,booking_enabled,google_rating,google_review_count",
    )
    .eq("status", "active")
    .not("cover_url", "is", null);

  if (dbUniverse) query = query.eq("universe", dbUniverse);
  if (city) query = query.ilike("city", city);

  query = query.order("updated_at", { ascending: false }).limit(20);

  const { data: establishments } = await query;
  if (!establishments?.length) return [];

  const ids = (establishments as any[]).map((e) => e.id);
  const result = await enrichEstablishmentList(ids, 10);

  // Trier par popularité (réservations 30j)
  result.establishments.sort((a, b) => b.reservations_30d - a.reservations_30d);

  return result.establishments;
}

// ---------------------------------------------------------------------------
// 7. Profil utilisateur
// ---------------------------------------------------------------------------

export async function getUserProfile(userId: string): Promise<SamUserProfile | null> {
  const supabase = getAdminSupabase();

  const { data: user } = await supabase.auth.admin.getUserById(userId);
  if (!user?.user) return null;

  const meta = (user.user.user_metadata ?? {}) as Record<string, unknown>;

  // Fallback sur consumer_users
  const { data: consumerUser } = await supabase
    .from("consumer_users")
    .select("city,country,socio_professional_status")
    .eq("id", userId)
    .maybeSingle();

  // Score de fiabilité
  const { data: stats } = await supabase
    .from("consumer_user_stats")
    .select("reliability_score")
    .eq("user_id", userId)
    .maybeSingle();

  const reliabilityScore = (stats as any)?.reliability_score ?? null;

  return {
    id: userId,
    first_name: (meta.first_name as string) ?? null,
    last_name: (meta.last_name as string) ?? null,
    email: user.user.email ?? null,
    phone: user.user.phone ?? null,
    city: (consumerUser as any)?.city ?? (meta.city as string) ?? null,
    country: (consumerUser as any)?.country ?? (meta.country as string) ?? null,
    reliability_score: reliabilityScore,
    reliability_level: reliabilityScore != null ? scoreToLevel(reliabilityScore) : null,
  };
}

function scoreToLevel(score: number): string {
  if (score >= 80) return "excellent";
  if (score >= 60) return "bon";
  if (score >= 40) return "moyen";
  return "faible";
}

// ---------------------------------------------------------------------------
// 8. Catégories disponibles
// ---------------------------------------------------------------------------

export async function getCategories(
  universe?: string,
): Promise<Array<{ name: string; count: number }>> {
  const supabase = getAdminSupabase();

  // Normaliser l'univers
  const dbUniverse = normalizeUniverse(universe);

  let query = supabase
    .from("establishments")
    .select("subcategory")
    .eq("status", "active")
    .not("subcategory", "is", null);

  if (dbUniverse) query = query.eq("universe", dbUniverse);

  const { data } = await query.limit(5000);
  if (!data?.length) return [];

  const counts = new Map<string, number>();
  for (const row of data as any[]) {
    const cat = String(row.subcategory ?? "").trim();
    if (cat) counts.set(cat, (counts.get(cat) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);
}

// ---------------------------------------------------------------------------
// 9. Recherches populaires
// ---------------------------------------------------------------------------

export async function getPopularSearches(
  city?: string,
  universe?: string,
): Promise<string[]> {
  const supabase = getAdminSupabase();

  // Normaliser l'univers
  const dbUniverse = normalizeUniverse(universe);

  const { data } = await supabase.rpc("get_popular_searches", {
    filter_city: city ?? null,
    filter_universe: dbUniverse,
    result_limit: 10,
  });

  if (!data || !Array.isArray(data)) return [];
  return data.map((r: any) => r.query ?? r.search_query ?? "").filter(Boolean);
}

// ---------------------------------------------------------------------------
// 10. Avis utilisateurs d'un établissement
// ---------------------------------------------------------------------------

export interface SamReview {
  id: string;
  rating: number;
  comment: string | null;
  author_first_name: string | null;
  created_at: string;
  status: string;
}

export async function getEstablishmentReviews(
  establishmentId: string,
  limit = 5,
): Promise<{ reviews: SamReview[]; average_rating: number | null; total_count: number }> {
  const supabase = getAdminSupabase();

  const { data: rows, count } = await supabase
    .from("reviews")
    .select("id,overall_rating,comment,reviewer_name,created_at,status", { count: "exact" })
    .eq("establishment_id", establishmentId)
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!rows?.length) return { reviews: [], average_rating: null, total_count: 0 };

  const reviews: SamReview[] = (rows as any[]).map((r) => ({
    id: r.id,
    rating: r.overall_rating ?? 0,
    comment: r.comment ?? null,
    author_first_name: r.reviewer_name ?? null,
    created_at: r.created_at,
    status: r.status,
  }));

  const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
  const average = reviews.length > 0 ? Math.round((sum / reviews.length) * 10) / 10 : null;

  return { reviews, average_rating: average, total_count: count ?? reviews.length };
}

// ---------------------------------------------------------------------------
// 11. Packs disponibles d'un établissement
// ---------------------------------------------------------------------------

export interface SamPack {
  id: string;
  title: string;
  short_description: string | null;
  price: number;
  original_price: number | null;
  discount_percent: number | null;
  cover_url: string | null;
  stock: number | null;
  sold_count: number;
  uses_per_purchase: number;
  valid_from: string | null;
  valid_to: string | null;
}

export async function getEstablishmentPacks(
  establishmentId: string,
): Promise<{ packs: SamPack[]; total: number }> {
  const supabase = getAdminSupabase();

  const { data: rows } = await supabase
    .from("packs")
    .select("id,title,short_description,price,original_price,cover_url,stock,sold_count,uses_per_purchase,sale_start_date,sale_end_date,status")
    .eq("establishment_id", establishmentId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(20);

  if (!rows?.length) return { packs: [], total: 0 };

  const packs: SamPack[] = (rows as any[]).map((p) => {
    const price = typeof p.price === "number" ? Math.round(p.price) / 100 : 0;
    const original = typeof p.original_price === "number" ? Math.round(p.original_price) / 100 : null;
    const discount = original && original > price ? Math.round(((original - price) / original) * 100) : null;

    return {
      id: p.id,
      title: p.title,
      short_description: p.short_description ?? null,
      price,
      original_price: original,
      discount_percent: discount,
      cover_url: p.cover_url ?? null,
      stock: p.stock ?? null,
      sold_count: p.sold_count ?? 0,
      uses_per_purchase: p.uses_per_purchase ?? 1,
      valid_from: p.sale_start_date ?? null,
      valid_to: p.sale_end_date ?? null,
    };
  });

  return { packs, total: packs.length };
}

// ---------------------------------------------------------------------------
// 12. Menu digital d'un établissement (catégories + plats + variantes + prix)
// ---------------------------------------------------------------------------

export interface SamMenuItem {
  title: string;
  description: string | null;
  category: string | null;
  price: number | null;
  currency: string;
  labels: string[];
  variants: Array<{ title: string | null; price: number }>;
}

export interface SamMenuCategory {
  id: string;
  title: string;
  description: string | null;
}

export interface SamMenu {
  categories: SamMenuCategory[];
  items: SamMenuItem[];
}

export async function getEstablishmentMenu(
  establishmentId: string,
): Promise<SamMenu | null> {
  const supabase = getAdminSupabase();

  // Résoudre l'ID si c'est un slug
  const resolvedId = await resolveEstablishmentId(establishmentId);
  if (!resolvedId) return null;

  const [{ data: categories }, { data: items }] = await Promise.all([
    supabase
      .from("pro_inventory_categories")
      .select("id,title,description")
      .eq("establishment_id", resolvedId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    supabase
      .from("pro_inventory_items")
      .select("id,category_id,title,description,base_price,currency,labels")
      .eq("establishment_id", resolvedId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .limit(100),
  ]);

  if (!categories?.length && !items?.length) return null;

  // Charger les variantes pour les items trouvés
  const itemIds = ((items ?? []) as any[]).map((i) => i.id);
  let variantsByItem = new Map<string, Array<{ title: string | null; price: number }>>();

  if (itemIds.length > 0) {
    const { data: variants } = await supabase
      .from("pro_inventory_variants")
      .select("item_id,title,price")
      .in("item_id", itemIds)
      .eq("is_active", true)
      .order("sort_order", { ascending: true });

    for (const v of (variants ?? []) as any[]) {
      if (!v.item_id) continue;
      const list = variantsByItem.get(v.item_id) ?? [];
      list.push({ title: v.title ?? null, price: typeof v.price === "number" ? v.price : 0 });
      variantsByItem.set(v.item_id, list);
    }
  }

  // Mapper les catégories par ID pour résoudre le nom
  const catMap = new Map<string, string>();
  const menuCategories: SamMenuCategory[] = ((categories ?? []) as any[]).map((c) => {
    catMap.set(c.id, c.title ?? "");
    return {
      id: c.id,
      title: c.title ?? "",
      description: c.description ?? null,
    };
  });

  const menuItems: SamMenuItem[] = ((items ?? []) as any[]).map((i) => ({
    title: i.title ?? "",
    description: i.description ?? null,
    category: catMap.get(i.category_id) ?? null,
    price: typeof i.base_price === "number" ? i.base_price : null,
    currency: i.currency ?? "MAD",
    labels: Array.isArray(i.labels) ? i.labels : [],
    variants: variantsByItem.get(i.id) ?? [],
  }));

  return { categories: menuCategories, items: menuItems };
}
