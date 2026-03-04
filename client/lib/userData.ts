import { z } from "zod";
import { isDemoModeEnabled } from "@/lib/demoMode";

export const USER_PROFILE_STORAGE_KEY = "sam_profile_v1";
export const USER_BOOKINGS_STORAGE_KEY = "sam_bookings_v1";
export const USER_FAVORITES_STORAGE_KEY = "sam_favorites_v1";
export const USER_PACK_PURCHASES_STORAGE_KEY = "sam_pack_purchases_v1";
export const USER_BOOKINGS_DEMO_SEEDED_KEY = "sam_bookings_demo_seeded_v1";

const CURRENT_DEMO_BOOKINGS_VERSION = 2;
const MAX_BOOKINGS_BEFORE_RESET_TO_DEMO = 200;

function getDemoBookingsSeedVersion(): number {
  const raw = readJson(USER_BOOKINGS_DEMO_SEEDED_KEY);
  if (raw === true) return 1;
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) return Math.floor(raw);
  return 0;
}

export const USER_DATA_CHANGED_EVENT = "sam-user-data-changed";

const USER_AVATAR_BACKUP_KEY = "sam_avatar_backup_v1";

export function clearUserLocalData(): void {
  if (typeof window === "undefined") return;

  // Preserve avatar across logout/login cycles — it's only stored client-side
  try {
    const profile = readJson(USER_PROFILE_STORAGE_KEY);
    const avatar =
      profile && typeof profile === "object" && "avatarDataUrl" in profile
        ? (profile as Record<string, unknown>).avatarDataUrl
        : undefined;
    if (typeof avatar === "string" && avatar.startsWith("data:image/")) {
      window.localStorage.setItem(USER_AVATAR_BACKUP_KEY, avatar);
    }
  } catch {
    // ignore
  }

  const keys = [
    USER_PROFILE_STORAGE_KEY,
    USER_BOOKINGS_STORAGE_KEY,
    USER_FAVORITES_STORAGE_KEY,
    USER_PACK_PURCHASES_STORAGE_KEY,
    USER_BOOKINGS_DEMO_SEEDED_KEY,
  ];

  try {
    for (const k of keys) window.localStorage.removeItem(k);
  } catch {
    // ignore
  }

  window.dispatchEvent(new Event(USER_DATA_CHANGED_EVENT));
}

const preferencesSchema = z
  .object({
    newsletter: z.boolean().optional(),
    reminders: z.boolean().optional(),
    whatsapp: z.boolean().optional(),
  })
  .optional();

const socioProfessionalStatusSchema = z.enum([
  "student",
  "intern",
  "unemployed",
  "job_seeker",
  "retraining",
  "employee",
  "technician",
  "supervisor",
  "manager",
  "executive",
  "freelance",
  "entrepreneur",
  "liberal_profession",
  "public_servant",
  "merchant",
  "artisan",
  "worker",
  "service_employee",
  "retired",
  "stay_at_home",
  "other",
]);

type SocioProfessionalStatus = z.infer<typeof socioProfessionalStatusSchema>;

const optionalDateYmd = z
  .preprocess((v) => {
    if (typeof v !== "string") return undefined;
    const t = v.trim();
    return t.length ? t : undefined;
  }, z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional())
  .optional();

const storedProfileSchema = z
  .object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    contact: z.string().optional(),
    email: z.string().optional(),
    socio_professional_status: socioProfessionalStatusSchema.optional(),
    date_of_birth: z.string().optional(),
    city: z.string().optional(),
    country: z.string().optional(),
    preferences: preferencesSchema,
    avatarDataUrl: z.string().max(750000).optional(),
    updatedAtIso: z.string().optional(),
    // Vérification téléphone/email
    phoneVerified: z.boolean().optional(),
    phoneVerifiedAtIso: z.string().optional(),
    emailVerified: z.boolean().optional(),
    emailVerifiedAtIso: z.string().optional(),
  })
  .passthrough();

const optionalTrimmedString = (max: number) =>
  z
    .preprocess((v) => {
      if (typeof v !== "string") return undefined;
      const t = v.trim();
      return t.length ? t : undefined;
    }, z.string().max(max).optional())
    .optional();

const profileInputSchema = z.object({
  firstName: optionalTrimmedString(60),
  lastName: optionalTrimmedString(60),
  contact: optionalTrimmedString(120).refine((v) => !v || v.length >= 3, { message: "Contact trop court" }),
  email: optionalTrimmedString(200),
  socio_professional_status: socioProfessionalStatusSchema.optional(),
  date_of_birth: optionalDateYmd,
  city: optionalTrimmedString(80),
  country: optionalTrimmedString(10),
  preferences: z
    .object({
      newsletter: z.boolean(),
      reminders: z.boolean(),
      whatsapp: z.boolean(),
    })
    .optional(),
});

export type UserPreferences = Required<NonNullable<z.infer<typeof profileInputSchema>["preferences"]>>;
export type UserProfile = {
  firstName?: string;
  lastName?: string;
  contact?: string;
  socio_professional_status?: SocioProfessionalStatus;
  date_of_birth?: string;
  city?: string;
  country?: string;
  avatarDataUrl?: string;
  preferences: UserPreferences;
  updatedAtIso?: string;
  // Vérification téléphone/email
  phoneVerified?: boolean;
  phoneVerifiedAtIso?: string;
  emailVerified?: boolean;
  emailVerifiedAtIso?: string;
  email?: string;
};

export type { SocioProfessionalStatus };

const bookingKindSchema = z.enum(["restaurant", "hotel"]);
const bookingStatusSchema = z.enum([
  "confirmed",
  "requested",
  "pending_pro_validation",
  "waitlist",
  "refused",
  "cancelled",
  "cancelled_user",
  "cancelled_pro",
  "noshow",
]);
const bookingPaymentStatusSchema = z.enum(["paid", "pending", "refunded"]);
const bookingAttendanceSchema = z.enum(["unknown", "present", "no_show"]);

const bookingPaymentSchema = z
  .object({
    status: bookingPaymentStatusSchema,
    currency: z.string().min(1),
    depositAmount: z.number().nonnegative(),
    totalAmount: z.number().nonnegative().optional(),
    paidAtIso: z.string().optional(),
    methodLabel: z.string().optional(),
  })
  .passthrough();

const bookingReviewCriteriaSchema = z.object({
  accueil: z.number().int().min(1).max(5),
  cadre_ambiance: z.number().int().min(1).max(5),
  service: z.number().int().min(1).max(5),
  qualite_prestation: z.number().int().min(1).max(5),
  prix: z.number().int().min(1).max(5),
  emplacement: z.number().int().min(1).max(5),
});

const bookingReviewSchema = z.union([
  z
    .object({
      rating: z.number().int().min(1).max(5),
      comment: z.string().min(1).max(1000),
      createdAtIso: z.string().min(1),
    })
    .passthrough(),
  z
    .object({
      criteria: bookingReviewCriteriaSchema,
      overallRating: z.number().min(1).max(5).optional(),
      comment: z.string().min(1).max(1000),
      createdAtIso: z.string().min(1),
    })
    .passthrough(),
]);

const bookingRecordSchema = z
  .object({
    id: z.string().min(1),
    bookingReference: z.string().optional(),
    kind: bookingKindSchema,
    title: z.string().min(1),
    status: bookingStatusSchema,
    dateIso: z.string().min(1),
    endDateIso: z.string().optional(),
    partySize: z.number().int().positive().max(50).optional(),
    createdAtIso: z.string().min(1),

    establishmentId: z.string().optional(),
    addressLine: z.string().optional(),
    city: z.string().optional(),
    phone: z.string().optional(),
    notes: z.string().optional(),

    refusalReasonCode: z.string().optional(),
    refusalReasonCustom: z.string().optional(),
    isFromWaitlist: z.boolean().optional(),

    payment: bookingPaymentSchema.optional(),
    attendance: bookingAttendanceSchema.optional(),
    review: bookingReviewSchema.optional(),
  })
  .passthrough();

export type BookingKind = z.infer<typeof bookingKindSchema>;
export type BookingStatus = z.infer<typeof bookingStatusSchema>;
export type BookingPaymentStatus = z.infer<typeof bookingPaymentStatusSchema>;
export type BookingAttendance = z.infer<typeof bookingAttendanceSchema>;
export type BookingPayment = z.infer<typeof bookingPaymentSchema>;
export type BookingReviewCriteria = z.infer<typeof bookingReviewCriteriaSchema>;
export type BookingReview = z.infer<typeof bookingReviewSchema>;

export function computeBookingReviewOverallRatingFromCriteria(criteria: BookingReviewCriteria): number {
  const keys: Array<keyof BookingReviewCriteria> = [
    "accueil",
    "cadre_ambiance",
    "service",
    "qualite_prestation",
    "prix",
    "emplacement",
  ];

  const values = keys.map((k) => Number(criteria[k]));
  const nums = values.filter((v) => Number.isFinite(v) && v >= 1 && v <= 5);
  if (!nums.length) return 0;
  const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
  return Math.round(avg * 10) / 10;
}

export function getBookingReviewOverallRating(review: BookingReview | undefined): number | null {
  if (!review) return null;
  if (typeof (review as { criteria?: unknown }).criteria === "object" && (review as { criteria?: unknown }).criteria !== null) {
    const r = review as { criteria: BookingReviewCriteria; overallRating?: number };
    const computed = computeBookingReviewOverallRatingFromCriteria(r.criteria);
    if (Number.isFinite(r.overallRating)) return Math.round(Number(r.overallRating) * 10) / 10;
    return computed;
  }
  const legacy = review as { rating?: number };
  const v = Number(legacy.rating);
  if (!Number.isFinite(v)) return null;
  return Math.max(1, Math.min(5, Math.round(v)));
}
export type BookingRecord = z.infer<typeof bookingRecordSchema>;

const favoritesKindSchema = z.enum(["restaurant", "hotel"]);

const favoriteItemSchema = z
  .object({
    kind: favoritesKindSchema,
    id: z.string().min(1),
    title: z.string().min(1),
    createdAtIso: z.string().min(1),
  })
  .passthrough();

export type FavoriteItem = z.infer<typeof favoriteItemSchema>;

function readJson(key: string): unknown {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new Event(USER_DATA_CHANGED_EVENT));
}

function defaultPreferences(): UserPreferences {
  return { newsletter: true, reminders: true, whatsapp: true };
}

export function getUserProfile(): UserProfile {
  const parsed = storedProfileSchema.safeParse(readJson(USER_PROFILE_STORAGE_KEY));
  const p = parsed.success ? parsed.data : {};

  const prefs = {
    ...defaultPreferences(),
    ...(p.preferences ?? {}),
  };

  const dob = typeof p.date_of_birth === "string" ? p.date_of_birth.trim() : "";
  const dateOfBirth = /^\d{4}-\d{2}-\d{2}$/.test(dob) ? dob : undefined;

  return {
    firstName: p.firstName?.trim() || undefined,
    lastName: p.lastName?.trim() || undefined,
    contact: p.contact?.trim() || undefined,
    socio_professional_status: p.socio_professional_status,
    date_of_birth: dateOfBirth,
    city: p.city?.trim() || undefined,
    country: p.country?.trim() || undefined,
    avatarDataUrl: typeof p.avatarDataUrl === "string" && p.avatarDataUrl.startsWith("data:image/") ? p.avatarDataUrl : undefined,
    preferences: prefs,
    updatedAtIso: p.updatedAtIso,
    // Vérification téléphone/email
    phoneVerified: p.phoneVerified ?? false,
    phoneVerifiedAtIso: p.phoneVerifiedAtIso,
    emailVerified: p.emailVerified ?? false,
    emailVerifiedAtIso: p.emailVerifiedAtIso,
    email: p.email?.trim() || undefined,
  };
}

export function saveUserProfile(input: unknown): { ok: true } | { ok: false; message: string } {
  const parsed = profileInputSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, message: issue?.message || "Profil invalide" };
  }

  const existingParsed = storedProfileSchema.safeParse(readJson(USER_PROFILE_STORAGE_KEY));
  const existing = existingParsed.success ? existingParsed.data : {};

  const nowIso = new Date().toISOString();
  const value = {
    ...existing,
    ...parsed.data,
    avatarDataUrl:
      typeof existing.avatarDataUrl === "string" && existing.avatarDataUrl.startsWith("data:image/")
        ? existing.avatarDataUrl
        : undefined,
    preferences: parsed.data.preferences ?? defaultPreferences(),
    updatedAtIso: nowIso,
  };

  writeJson(USER_PROFILE_STORAGE_KEY, value);
  return { ok: true };
}

export function saveUserAvatar(avatarDataUrl: string): { ok: true } | { ok: false; message: string } {
  const v = String(avatarDataUrl ?? "").trim();
  if (!v.startsWith("data:image/")) return { ok: false, message: "Image invalide" };
  if (v.length > 750000) return { ok: false, message: "Image trop lourde" };

  const existingParsed = storedProfileSchema.safeParse(readJson(USER_PROFILE_STORAGE_KEY));
  const existing = existingParsed.success ? existingParsed.data : {};

  const next = {
    ...existing,
    avatarDataUrl: v,
    updatedAtIso: new Date().toISOString(),
  };

  writeJson(USER_PROFILE_STORAGE_KEY, next);
  return { ok: true };
}

/**
 * Restore avatar from backup (saved before logout) into the current profile.
 * Called after login sync so the avatar survives logout/login cycles.
 */
export function restoreAvatarFromBackup(): void {
  if (typeof window === "undefined") return;
  try {
    const backup = window.localStorage.getItem(USER_AVATAR_BACKUP_KEY);
    if (!backup || !backup.startsWith("data:image/")) return;

    // Only restore if the current profile doesn't already have an avatar
    const profile = getUserProfile();
    if (profile.avatarDataUrl) return;

    saveUserAvatar(backup);
    // Clean up backup after successful restore
    window.localStorage.removeItem(USER_AVATAR_BACKUP_KEY);
  } catch {
    // ignore
  }
}

export function removeUserAvatar(): void {
  const existingParsed = storedProfileSchema.safeParse(readJson(USER_PROFILE_STORAGE_KEY));
  const existing = existingParsed.success ? existingParsed.data : {};

  const next = {
    ...existing,
    avatarDataUrl: undefined,
    updatedAtIso: new Date().toISOString(),
  };

  writeJson(USER_PROFILE_STORAGE_KEY, next);

  // Also clear the backup so it doesn't resurrect after next logout
  try {
    window.localStorage.removeItem(USER_AVATAR_BACKUP_KEY);
  } catch {
    // ignore
  }
}

/**
 * Marquer le téléphone comme vérifié
 */
export function markPhoneAsVerified(phone: string): { ok: true } | { ok: false; message: string } {
  const v = String(phone ?? "").trim();
  if (!v) return { ok: false, message: "Numéro invalide" };

  const existingParsed = storedProfileSchema.safeParse(readJson(USER_PROFILE_STORAGE_KEY));
  const existing = existingParsed.success ? existingParsed.data : {};

  const nowIso = new Date().toISOString();
  const next = {
    ...existing,
    contact: v,
    phoneVerified: true,
    phoneVerifiedAtIso: nowIso,
    updatedAtIso: nowIso,
  };

  writeJson(USER_PROFILE_STORAGE_KEY, next);
  return { ok: true };
}

/**
 * Marquer l'email comme vérifié
 */
export function markEmailAsVerified(email: string): { ok: true } | { ok: false; message: string } {
  const v = String(email ?? "").trim().toLowerCase();
  if (!v || !/.+@.+\..+/.test(v)) return { ok: false, message: "Email invalide" };

  const existingParsed = storedProfileSchema.safeParse(readJson(USER_PROFILE_STORAGE_KEY));
  const existing = existingParsed.success ? existingParsed.data : {};

  const nowIso = new Date().toISOString();
  const next = {
    ...existing,
    email: v,
    emailVerified: true,
    emailVerifiedAtIso: nowIso,
    updatedAtIso: nowIso,
  };

  writeJson(USER_PROFILE_STORAGE_KEY, next);
  return { ok: true };
}

function randomIdSegment(len: number) {
  let out = "";
  while (out.length < len) {
    out += Math.random().toString(36).slice(2).toUpperCase();
  }
  return out.slice(0, len);
}

function createBookingId(): string {
  return `SAM${randomIdSegment(14)}`;
}

function createLocalIso(y: number, m: number, d: number, hh: number, mm: number): string {
  return new Date(y, m - 1, d, hh, mm, 0, 0).toISOString();
}

function generateDemoBookings(): BookingRecord[] {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const d = now.getDate();

  const nextFriday = new Date(now);
  nextFriday.setDate(d + ((5 - now.getDay() + 7) % 7 || 7));

  const lastWeek = new Date(now);
  lastWeek.setDate(d - 7);

  const lastMonth = new Date(now);
  lastMonth.setMonth(now.getMonth() - 1);

  const cancelledStayStart = new Date(lastMonth);
  cancelledStayStart.setDate(cancelledStayStart.getDate() - 3);

  const cancelledStayEnd = new Date(cancelledStayStart);
  cancelledStayEnd.setDate(cancelledStayStart.getDate() + 2);

  const demo: BookingRecord[] = [
    {
      id: createBookingId(),
      kind: "restaurant",
      title: "Restaurant Riad Atlas",
      status: "confirmed",
      dateIso: createLocalIso(nextFriday.getFullYear(), nextFriday.getMonth() + 1, nextFriday.getDate(), 20, 0),
      partySize: 2,
      createdAtIso: new Date(now.getTime() - 1000 * 60 * 60 * 24).toISOString(),
      establishmentId: "1",
      addressLine: "Rue des Orangers",
      city: "Marrakech",
      phone: "+212 6 12 34 56 78",
      notes: "Table à l'extérieur si possible.",
      payment: {
        status: "paid",
        currency: "MAD",
        depositAmount: 100,
        totalAmount: 200,
        paidAtIso: new Date(now.getTime() - 1000 * 60 * 60 * 20).toISOString(),
        methodLabel: "Paiement sécurisé",
      },
    },
    {
      id: createBookingId(),
      kind: "restaurant",
      title: "Le Jardin Secret",
      status: "requested",
      dateIso: createLocalIso(y, m, d + 2, 13, 30),
      partySize: 4,
      createdAtIso: new Date(now.getTime() - 1000 * 60 * 60 * 2).toISOString(),
      establishmentId: "2",
      addressLine: "Quartier Gueliz",
      city: "Marrakech",
      phone: "+212 5 24 00 00 00",
    },
    {
      id: createBookingId(),
      kind: "restaurant",
      title: "Café Majorelle",
      status: "confirmed",
      dateIso: createLocalIso(lastWeek.getFullYear(), lastWeek.getMonth() + 1, lastWeek.getDate(), 19, 30),
      partySize: 3,
      createdAtIso: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 10).toISOString(),
      establishmentId: "3",
      addressLine: "Avenue Yacoub El Mansour",
      city: "Marrakech",
      payment: {
        status: "paid",
        currency: "MAD",
        depositAmount: 100,
        totalAmount: 300,
        paidAtIso: new Date(lastWeek.getTime() - 1000 * 60 * 60 * 24).toISOString(),
        methodLabel: "Carte bancaire",
      },
      attendance: "present",
    },
    {
      id: createBookingId(),
      kind: "restaurant",
      title: "La Terrasse Kasbah",
      status: "confirmed",
      dateIso: createLocalIso(lastMonth.getFullYear(), lastMonth.getMonth() + 1, lastMonth.getDate(), 21, 0),
      partySize: 2,
      createdAtIso: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 40).toISOString(),
      establishmentId: "4",
      addressLine: "Kasbah",
      city: "Marrakech",
      payment: {
        status: "paid",
        currency: "MAD",
        depositAmount: 80,
        totalAmount: 160,
        paidAtIso: new Date(lastMonth.getTime() - 1000 * 60 * 60 * 2).toISOString(),
        methodLabel: "Paiement sécurisé",
      },
      attendance: "no_show",
    },
    {
      id: createBookingId(),
      kind: "hotel",
      title: "Riad Atlas - Chambre Double",
      status: "cancelled",
      dateIso: createLocalIso(
        cancelledStayStart.getFullYear(),
        cancelledStayStart.getMonth() + 1,
        cancelledStayStart.getDate(),
        15,
        0,
      ),
      endDateIso: createLocalIso(
        cancelledStayEnd.getFullYear(),
        cancelledStayEnd.getMonth() + 1,
        cancelledStayEnd.getDate(),
        11,
        0,
      ),
      partySize: 2,
      createdAtIso: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 25).toISOString(),
      establishmentId: "h1",
      city: "Marrakech",
      payment: {
        status: "refunded",
        currency: "MAD",
        depositAmount: 200,
        totalAmount: 900,
        paidAtIso: new Date(cancelledStayStart.getTime() - 1000 * 60 * 60 * 24).toISOString(),
        methodLabel: "Carte bancaire",
      },
      attendance: "unknown",
    },
  ];

  return demo;
}

function sortBookings(list: BookingRecord[]): BookingRecord[] {
  return list.slice().sort((a, b) => (a.createdAtIso < b.createdAtIso ? 1 : a.createdAtIso > b.createdAtIso ? -1 : 0));
}

export function getBookingHistory(): BookingRecord[] {
  const seededVersion = getDemoBookingsSeedVersion();
  const value = readJson(USER_BOOKINGS_STORAGE_KEY);
  const parsed = z.array(bookingRecordSchema).safeParse(value);

  if (!parsed.success || parsed.data.length === 0) {
    if (!isDemoModeEnabled()) return [];

    const demo = generateDemoBookings();
    writeJson(USER_BOOKINGS_STORAGE_KEY, demo);
    writeJson(USER_BOOKINGS_DEMO_SEEDED_KEY, CURRENT_DEMO_BOOKINGS_VERSION);
    return sortBookings(demo);
  }

  if (parsed.data.length > MAX_BOOKINGS_BEFORE_RESET_TO_DEMO) {
    if (!isDemoModeEnabled()) return sortBookings(parsed.data);

    const demo = generateDemoBookings();
    writeJson(USER_BOOKINGS_STORAGE_KEY, demo);
    writeJson(USER_BOOKINGS_DEMO_SEEDED_KEY, CURRENT_DEMO_BOOKINGS_VERSION);
    return sortBookings(demo);
  }

  if (seededVersion < CURRENT_DEMO_BOOKINGS_VERSION) {
    if (!isDemoModeEnabled()) return sortBookings(parsed.data);

    const demo = generateDemoBookings();
    const existing = parsed.data;

    const fingerprint = (b: BookingRecord) => {
      const end = typeof b.endDateIso === "string" ? b.endDateIso : "";
      const size = typeof b.partySize === "number" ? String(b.partySize) : "";
      return [b.kind, b.title, b.status, b.dateIso, end, size].join("|");
    };

    const existingIds = new Set(existing.map((b) => b.id));
    const existingFingerprints = new Set(existing.map(fingerprint));

    const merged = [
      ...existing,
      ...demo.filter((b) => !existingIds.has(b.id) && !existingFingerprints.has(fingerprint(b))),
    ];

    writeJson(USER_BOOKINGS_STORAGE_KEY, merged);
    writeJson(USER_BOOKINGS_DEMO_SEEDED_KEY, CURRENT_DEMO_BOOKINGS_VERSION);
    return sortBookings(merged);
  }

  const deduped = (() => {
    const byId = new Set<string>();
    const out: BookingRecord[] = [];
    for (const b of parsed.data) {
      if (byId.has(b.id)) continue;
      byId.add(b.id);
      out.push(b);
    }
    return out;
  })();

  if (deduped.length !== parsed.data.length) {
    writeJson(USER_BOOKINGS_STORAGE_KEY, deduped);
  }

  return sortBookings(deduped);
}

export function getBookingRecordById(id: string): BookingRecord | null {
  const booking = getBookingHistory().find((b) => b.id === id);
  return booking ?? null;
}

export function saveBookingReview(params: { id: string; rating: number; comment: string }): { ok: true } | { ok: false; message: string } {
  const booking = getBookingRecordById(params.id);
  if (!booking) return { ok: false, message: "Réservation introuvable" };

  const rating = Math.round(Number(params.rating));
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) return { ok: false, message: "Note invalide" };

  const comment = String(params.comment ?? "").trim();
  if (!comment) return { ok: false, message: "Avis vide" };
  if (comment.length > 1000) return { ok: false, message: "Avis trop long" };

  const next: BookingRecord = {
    ...booking,
    review: {
      rating,
      comment,
      createdAtIso: new Date().toISOString(),
    },
  };

  upsertBookingRecord(next);
  return { ok: true };
}

export function saveBookingCriteriaReview(params: {
  id: string;
  criteria: unknown;
  comment: string;
}): { ok: true } | { ok: false; message: string } {
  const booking = getBookingRecordById(params.id);
  if (!booking) return { ok: false, message: "Réservation introuvable" };

  const criteriaParsed = bookingReviewCriteriaSchema.safeParse(params.criteria);
  if (!criteriaParsed.success) return { ok: false, message: "Notes invalides" };

  const comment = String(params.comment ?? "").trim();
  if (!comment) return { ok: false, message: "Avis vide" };
  if (comment.length > 1000) return { ok: false, message: "Avis trop long" };

  const overallRating = computeBookingReviewOverallRatingFromCriteria(criteriaParsed.data);

  const next: BookingRecord = {
    ...booking,
    review: {
      criteria: criteriaParsed.data,
      overallRating,
      comment,
      createdAtIso: new Date().toISOString(),
    },
  };

  upsertBookingRecord(next);
  return { ok: true };
}

export function upsertBookingRecord(record: BookingRecord): void {
  const parsed = bookingRecordSchema.safeParse(record);
  if (!parsed.success) return;

  const list = getBookingHistory();
  const idx = list.findIndex((r) => r.id === record.id);
  const nextRecord = idx >= 0 ? { ...record, createdAtIso: list[idx]!.createdAtIso } : record;
  const next = idx >= 0 ? list.map((r) => (r.id === record.id ? nextRecord : r)) : [nextRecord, ...list];
  writeJson(USER_BOOKINGS_STORAGE_KEY, next);
}

export function removeBookingRecord(id: string): void {
  const next = getBookingHistory().filter((r) => r.id !== id);
  writeJson(USER_BOOKINGS_STORAGE_KEY, next);
}

export function getFavorites(): FavoriteItem[] {
  const value = readJson(USER_FAVORITES_STORAGE_KEY);
  const parsed = z.array(favoriteItemSchema).safeParse(value);
  if (!parsed.success) return [];
  return parsed.data
    .slice()
    .sort((a, b) => (a.createdAtIso < b.createdAtIso ? 1 : a.createdAtIso > b.createdAtIso ? -1 : 0));
}

const DEMO_FAVORITES_POOL: Array<Pick<FavoriteItem, "kind" | "id" | "title">> = [
  { kind: "restaurant", id: "1", title: "Restaurant Riad Atlas" },
  { kind: "restaurant", id: "2", title: "Terrasse Moderne" },
  { kind: "restaurant", id: "3", title: "Fusion Cuisine" },
  { kind: "restaurant", id: "4", title: "Casa de Paco" },
  { kind: "restaurant", id: "5", title: "Le Comptoir" },
  { kind: "restaurant", id: "6", title: "Le Jardin Secret" },
  { kind: "restaurant", id: "7", title: "Café Majorelle" },
  { kind: "hotel", id: "movenpick-malabata-tanger", title: "Mövenpick Hotel & Casino Malabata Tanger" },
];

export function ensureDemoFavorites(targetCount = 8): FavoriteItem[] {
  const safeTarget = Math.max(0, Math.floor(targetCount));
  if (safeTarget === 0) return getFavorites();

  const existing = getFavorites();
  if (existing.length >= safeTarget) return existing;

  const existingKeys = new Set(existing.map((f) => `${f.kind}:${f.id}`));
  const now = Date.now();

  const additions: FavoriteItem[] = [];
  for (const base of DEMO_FAVORITES_POOL) {
    if (existing.length + additions.length >= safeTarget) break;
    const key = `${base.kind}:${base.id}`;
    if (existingKeys.has(key)) continue;

    const createdAtIso = new Date(now - additions.length * 1000).toISOString();
    additions.push({ ...base, createdAtIso });
  }

  if (!additions.length) return existing;

  writeJson(USER_FAVORITES_STORAGE_KEY, [...additions, ...existing]);
  return getFavorites();
}

export function addFavorite(item: FavoriteItem): void {
  const parsed = favoriteItemSchema.safeParse(item);
  if (!parsed.success) return;

  const list = getFavorites();
  if (list.some((f) => f.kind === item.kind && f.id === item.id)) return;
  writeJson(USER_FAVORITES_STORAGE_KEY, [item, ...list]);
}

export function removeFavorite(params: { kind: FavoriteItem["kind"]; id: string }): void {
  const next = getFavorites().filter((f) => !(f.kind === params.kind && f.id === params.id));
  writeJson(USER_FAVORITES_STORAGE_KEY, next);
}

const packUniverseSchema = z.enum(["restaurant", "loisir", "wellness"]);
const packPurchaseStatusSchema = z.enum(["active", "used", "expired", "refunded"]);

const packPurchaseSchema = z
  .object({
    id: z.string().min(1),
    packId: z.string().min(1),
    title: z.string().min(1),
    universe: packUniverseSchema,

    establishmentId: z.string().optional(),
    establishmentName: z.string().optional(),
    detailsUrl: z.string().optional(),

    quantity: z.number().int().positive().max(50),
    unitMad: z.number().nonnegative(),

    validFromIso: z.string().min(1),
    validUntilIso: z.string().min(1),

    createdAtIso: z.string().min(1),
    payment: bookingPaymentSchema.optional(),
    status: packPurchaseStatusSchema,
  })
  .passthrough();

export type PackUniverse = z.infer<typeof packUniverseSchema>;
export type PackPurchaseStatus = z.infer<typeof packPurchaseStatusSchema>;
export type PackPurchase = z.infer<typeof packPurchaseSchema>;

function createPackPurchaseId(): string {
  return `SAMPK${randomIdSegment(14)}`;
}

function addDaysIso(base: Date, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function generateDemoPackPurchases(): PackPurchase[] {
  const now = new Date();

  const base = [
    {
      universe: "restaurant" as const,
      establishmentId: "1",
      establishmentName: "Restaurant Riad Atlas",
      detailsUrl: "/restaurant/1",
      packId: "pack-decouverte-marocain",
      title: "Pack Découverte Marocain",
      unitMad: 180,
      quantity: 2,
      validDays: 7,
    },
    {
      universe: "restaurant" as const,
      establishmentId: "1",
      establishmentName: "Restaurant Riad Atlas",
      detailsUrl: "/restaurant/1",
      packId: "pack-rooftop-soiree",
      title: "Pack Rooftop – Soirée",
      unitMad: 220,
      quantity: 2,
      validDays: 10,
    },
    {
      universe: "restaurant" as const,
      establishmentId: "2",
      establishmentName: "Terrasse Moderne",
      detailsUrl: "/restaurant/2",
      packId: "pack-2-premium",
      title: "Pack Premium",
      unitMad: 260,
      quantity: 3,
      validDays: 14,
    },

    {
      universe: "loisir" as const,
      establishmentId: "quad-agafay",
      establishmentName: "Quad Agafay",
      detailsUrl: "/loisir/quad-agafay",
      packId: "loisir-pack-buggy-quad",
      title: "Pack Buggy + Quad (combo)",
      unitMad: 780,
      quantity: 1,
      validDays: 30,
    },
    {
      universe: "loisir" as const,
      establishmentId: "quad-agafay",
      establishmentName: "Quad Agafay",
      detailsUrl: "/loisir/quad-agafay",
      packId: "loisir-pack-quad-sunset",
      title: "Pack Quad sunset + thé au camp",
      unitMad: 650,
      quantity: 1,
      validDays: 30,
    },
    {
      universe: "loisir" as const,
      establishmentId: "quad-agafay",
      establishmentName: "Quad Agafay",
      detailsUrl: "/loisir/quad-agafay",
      packId: "loisir-pack-famille",
      title: "Pack Famille (quad enfant + chameau)",
      unitMad: 520,
      quantity: 1,
      validDays: 30,
    },

    {
      universe: "wellness" as const,
      establishmentId: "hammam-topkapi",
      establishmentName: "Hammam Topkapi",
      detailsUrl: "/wellness/hammam-topkapi?title=Hammam%20Topkapi&category=Hammam%20Topkapi&city=Marrakech",
      packId: "wellness-pack-decouverte",
      title: "Pack Découverte Hammam",
      unitMad: 320,
      quantity: 1,
      validDays: 45,
    },
    {
      universe: "wellness" as const,
      establishmentId: "hammam-topkapi",
      establishmentName: "Hammam Topkapi",
      detailsUrl: "/wellness/hammam-topkapi?title=Hammam%20Topkapi&category=Hammam%20Topkapi&city=Marrakech",
      packId: "wellness-pack-signature",
      title: "Pack Topkapi Signature (hammam + massage)",
      unitMad: 580,
      quantity: 1,
      validDays: 45,
    },
    {
      universe: "wellness" as const,
      establishmentId: "hammam-topkapi",
      establishmentName: "Hammam Topkapi",
      detailsUrl: "/wellness/hammam-topkapi?title=Hammam%20Topkapi&category=Hammam%20Topkapi&city=Marrakech",
      packId: "wellness-pack-duo",
      title: "Pack Duo (2 personnes)",
      unitMad: 990,
      quantity: 1,
      validDays: 45,
    },
  ];

  return base.map((p, idx) => {
    const createdAtIso = new Date(now.getTime() - idx * 1000 * 60 * 60 * 18).toISOString();
    const validFromIso = addDaysIso(now, -1);
    const validUntilIso = addDaysIso(now, p.validDays);
    const totalMad = Math.round(p.unitMad * p.quantity);

    return {
      id: createPackPurchaseId(),
      packId: p.packId,
      title: p.title,
      universe: p.universe,
      establishmentId: p.establishmentId,
      establishmentName: p.establishmentName,
      detailsUrl: p.detailsUrl,
      quantity: p.quantity,
      unitMad: p.unitMad,
      validFromIso,
      validUntilIso,
      createdAtIso,
      payment: {
        status: "paid",
        currency: "MAD",
        depositAmount: p.unitMad,
        totalAmount: totalMad,
        paidAtIso: createdAtIso,
        methodLabel: "Paiement sécurisé",
      },
      status: "active",
    };
  });
}

export function getPackPurchases(): PackPurchase[] {
  const value = readJson(USER_PACK_PURCHASES_STORAGE_KEY);
  const parsed = z.array(packPurchaseSchema).safeParse(value);
  if (!parsed.success) return [];
  return parsed.data
    .slice()
    .sort((a, b) => (a.createdAtIso < b.createdAtIso ? 1 : a.createdAtIso > b.createdAtIso ? -1 : 0));
}

export function ensureDemoPackPurchases(targetCount = 9): PackPurchase[] {
  const safeTarget = Math.max(0, Math.floor(targetCount));
  const existing = getPackPurchases();
  if (safeTarget === 0) return existing;
  if (existing.length >= safeTarget) return existing;

  const demo = generateDemoPackPurchases();
  const existingKeys = new Set(existing.map((p) => `${p.universe}:${p.packId}:${p.title}`));

  const additions: PackPurchase[] = [];
  for (const d of demo) {
    if (existing.length + additions.length >= safeTarget) break;
    const key = `${d.universe}:${d.packId}:${d.title}`;
    if (existingKeys.has(key)) continue;
    additions.push(d);
  }

  if (!additions.length) return existing;
  writeJson(USER_PACK_PURCHASES_STORAGE_KEY, [...additions, ...existing]);
  return getPackPurchases();
}

export function removePackPurchase(id: string): void {
  const next = getPackPurchases().filter((p) => p.id !== id);
  writeJson(USER_PACK_PURCHASES_STORAGE_KEY, next);
}
