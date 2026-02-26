/**
 * Onboarding Ramadan — API publique (sans auth)
 *
 * GET  /api/public/onboarding/establishments     — liste des établissements actifs
 * POST /api/public/onboarding/send-code          — envoi OTP 6 chiffres par email
 * POST /api/public/onboarding/verify-code        — vérification du code OTP
 * POST /api/public/onboarding/submit             — soumission du formulaire complet
 * POST /api/public/onboarding/commercial-callback — demande de rappel commercial
 */

import { Router } from "express";
import type { RequestHandler } from "express";
import crypto, { randomUUID } from "crypto";
import multer from "multer";
import { createModuleLogger } from "../lib/logger";
import { getAdminSupabase } from "../supabaseAdmin";
import { zBody } from "../lib/validate";
import {
  ramadanSendCodeSchema,
  ramadanVerifyCodeSchema,
  ramadanSubmitSchema,
  ramadanCommercialCallbackSchema,
} from "../schemas/onboardingRamadan";

const log = createModuleLogger("onboardingRamadan");
import { sendLoggedEmail } from "../emailService";
import { emitAdminNotification } from "../adminNotifications";
import {
  createRamadanOffer,
  submitRamadanOfferForModeration,
} from "../ramadanOfferLogic";
import type { RamadanOfferType } from "../../shared/ramadanTypes";

// =============================================================================
// In-memory stores (same pattern as emailVerification.ts)
// =============================================================================

/** OTP codes: email → { code, expiresAt } */
const otpCodes = new Map<string, { code: string; expiresAt: number }>();

/** Verified emails: email → { verifiedAt, expiresAt } */
const verifiedEmails = new Map<string, { verifiedAt: number; expiresAt: number }>();
const VERIFIED_EMAIL_TTL = 15 * 60 * 1000; // 15 min

/** Rate limiting: email → { count, resetAt } */
const emailRateLimit = new Map<string, { count: number; resetAt: number }>();
const MAX_SEND_PER_HOUR = 5;

/** Submit rate limiting: ip → { count, resetAt } */
const submitRateLimit = new Map<string, { count: number; resetAt: number }>();
const MAX_SUBMIT_PER_HOUR = 3;

/** Upload rate limiting: ip → { count, resetAt } */
const uploadRateLimit = new Map<string, { count: number; resetAt: number }>();
const MAX_UPLOAD_PER_HOUR = 10;

// Upload constants
const RAMADAN_IMAGES_BUCKET = "ramadan-offer-images";
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

const onboardingPhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_IMAGE_SIZE_BYTES },
});

/** Establishment cache */
let cachedEstablishments: { data: any[]; fetchedAt: number } | null = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 min

// Cleanup every 5 min
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of otpCodes) if (v.expiresAt < now) otpCodes.delete(k);
  for (const [k, v] of verifiedEmails) if (v.expiresAt < now) verifiedEmails.delete(k);
  for (const [k, v] of emailRateLimit) if (v.resetAt < now) emailRateLimit.delete(k);
  for (const [k, v] of submitRateLimit) if (v.resetAt < now) submitRateLimit.delete(k);
  for (const [k, v] of uploadRateLimit) if (v.resetAt < now) uploadRateLimit.delete(k);
}, 5 * 60 * 1000);

// =============================================================================
// Helpers
// =============================================================================

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function isValidUUID(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

function generateCode(): string {
  return String(crypto.randomInt(100000, 999999));
}

function generateTempPassword(): string {
  return crypto.randomBytes(12).toString("base64url").slice(0, 16) + "!A1";
}

const VALID_OFFER_TYPES: RamadanOfferType[] = ["ftour", "shour", "traiteur", "pack_famille", "special"];

const VALID_ROLES = ["gerant", "proprietaire", "employe", "agence"];

const ROLE_TO_MEMBERSHIP: Record<string, string> = {
  proprietaire: "owner",
  gerant: "manager",
  employe: "reception",
  agence: "marketing",
};

const VALID_COMMERCIAL_SLOTS = ["10h-13h", "14h-17h", "20h-22h"];

// =============================================================================
// Router
// =============================================================================

const router = Router();

// ---------------------------------------------------------------------------
// GET /establishments — Liste des établissements actifs
// ---------------------------------------------------------------------------
router.get("/establishments", (async (_req, res) => {
  try {
    // Check cache
    if (cachedEstablishments && Date.now() - cachedEstablishments.fetchedAt < CACHE_TTL) {
      return res.json({ establishments: cachedEstablishments.data });
    }

    const supabase = getAdminSupabase();
    const { data, error } = await supabase
      .from("establishments")
      .select("id, name, city, cover_url")
      .order("name", { ascending: true })
      .limit(2000);

    if (error) {
      log.error({ err: error }, "failed to fetch establishments");
      return res.status(500).json({ error: "Erreur serveur" });
    }

    // Fetch claimed establishment IDs (those with at least one membership)
    const { data: claimedRows } = await supabase
      .from("pro_establishment_memberships")
      .select("establishment_id");

    const claimedIds = new Set((claimedRows ?? []).map((r: any) => r.establishment_id));

    const establishments = (data ?? []).map((e: any) => ({
      id: e.id,
      name: e.name,
      city: e.city ?? "",
      cover_url: e.cover_url ?? null,
      claimed: claimedIds.has(e.id),
    }));

    cachedEstablishments = { data: establishments, fetchedAt: Date.now() };

    return res.json({ establishments });
  } catch (err) {
    log.error({ err }, "establishments error");
    return res.status(500).json({ error: "Erreur serveur" });
  }
}) as RequestHandler);

// ---------------------------------------------------------------------------
// POST /send-code — Envoi OTP par email
// ---------------------------------------------------------------------------
router.post("/send-code", zBody(ramadanSendCodeSchema), (async (req, res) => {
  try {
    const email = asString(req.body?.email)?.toLowerCase();
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: "Email invalide" });
    }

    // Rate limit
    const now = Date.now();
    const rl = emailRateLimit.get(email);
    if (rl && rl.resetAt > now && rl.count >= MAX_SEND_PER_HOUR) {
      return res.status(429).json({ error: "Trop de tentatives. Réessayez dans une heure." });
    }

    if (rl && rl.resetAt > now) {
      rl.count++;
    } else {
      emailRateLimit.set(email, { count: 1, resetAt: now + 60 * 60 * 1000 });
    }

    // Generate & store code (5 min expiry)
    const code = generateCode();
    otpCodes.set(email, { code, expiresAt: now + 5 * 60 * 1000 });

    // Send email
    const result = await sendLoggedEmail({
      emailId: `onboarding-otp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      fromKey: "noreply",
      to: [email],
      subject: "Votre code de vérification SAM.ma",
      bodyText: `Bonjour,\n\nVotre code de vérification est : ${code}\n\nCe code est valide pendant 5 minutes.\n\nL'équipe SAM.ma`,
      meta: { type: "onboarding_otp", recipient_email: email },
    });

    if (!result.ok) {
      log.error({ err: result.error }, "failed to send OTP");
      return res.status(500).json({ error: "Impossible d'envoyer l'email" });
    }

    log.info({ email }, "OTP sent");
    return res.json({ ok: true });
  } catch (err) {
    log.error({ err }, "send-code error");
    return res.status(500).json({ error: "Erreur serveur" });
  }
}) as RequestHandler);

// ---------------------------------------------------------------------------
// POST /verify-code — Vérification du code OTP
// ---------------------------------------------------------------------------
router.post("/verify-code", zBody(ramadanVerifyCodeSchema), (async (req, res) => {
  try {
    const email = asString(req.body?.email)?.toLowerCase();
    const code = asString(req.body?.code);

    if (!email) return res.status(400).json({ error: "Email manquant" });
    if (!code) return res.status(400).json({ error: "Code manquant" });

    const stored = otpCodes.get(email);
    if (!stored) return res.status(400).json({ error: "Code expiré ou invalide" });
    if (stored.expiresAt < Date.now()) {
      otpCodes.delete(email);
      return res.status(400).json({ error: "Code expiré" });
    }
    if (stored.code !== code) return res.status(400).json({ error: "Code incorrect" });

    // Mark as verified
    otpCodes.delete(email);
    verifiedEmails.set(email, {
      verifiedAt: Date.now(),
      expiresAt: Date.now() + VERIFIED_EMAIL_TTL,
    });

    log.info({ email }, "email verified");
    return res.json({ ok: true, verified: true });
  } catch (err) {
    log.error({ err }, "verify-code error");
    return res.status(500).json({ error: "Erreur serveur" });
  }
}) as RequestHandler);

// ---------------------------------------------------------------------------
// POST /submit — Soumission du formulaire complet
// ---------------------------------------------------------------------------
router.post("/submit", zBody(ramadanSubmitSchema), (async (req, res) => {
  try {
    const ip = req.ip || req.socket.remoteAddress || "unknown";

    // Rate limit by IP
    const now = Date.now();
    const rl = submitRateLimit.get(ip);
    if (rl && rl.resetAt > now && rl.count >= MAX_SUBMIT_PER_HOUR) {
      return res.status(429).json({ error: "Trop de soumissions. Réessayez plus tard." });
    }
    if (rl && rl.resetAt > now) rl.count++;
    else submitRateLimit.set(ip, { count: 1, resetAt: now + 60 * 60 * 1000 });

    const body = req.body ?? {};

    // --- Validate inputs ---
    const isNewEstablishment = !!body.new_establishment;
    let establishmentId = asString(body.establishment_id);
    const newEstablishmentName = asString(body.new_establishment_name);
    const newEstablishmentSpecialty = asString(body.new_establishment_specialty);
    const newEstablishmentGoogleMaps = asString(body.new_establishment_google_maps);
    const newEstablishmentInstagram = asString(body.new_establishment_instagram);
    const existingEstabInstagram = asString(body.existing_establishment_instagram);
    const existingEstabGoogleMaps = asString(body.existing_establishment_google_maps);

    const email = asString(body.email)?.toLowerCase();
    const phone = asString(body.phone);
    const role = asString(body.role);
    const firstName = asString(body.first_name);
    const lastName = asString(body.last_name);
    const offerTitle = asString(body.offer_title);
    const offerDescription = asString(body.offer_description);
    const offerType = (asString(body.offer_type) || "ftour") as RamadanOfferType;
    const startDate = asString(body.start_date);
    const endDate = asString(body.end_date);
    const startTime = asString(body.start_time) || "18:00";
    const endTime = asString(body.end_time) || "20:00";
    const slotInterval = typeof body.slot_interval === "number" ? body.slot_interval : parseInt(body.slot_interval, 10) || 30;
    const price = typeof body.price === "number" ? body.price : parseFloat(body.price);
    const capacity = typeof body.capacity === "number" ? body.capacity : parseInt(body.capacity, 10);
    const promotionType = asString(body.promotion_type); // "percent" | "amount"
    const promotionValue = typeof body.promotion_value === "number" ? body.promotion_value : parseFloat(body.promotion_value);
    const wantCommercial = !!body.want_commercial;
    const commercialSlot = asString(body.commercial_slot);

    // Validate: either existing establishment ID or new establishment info
    if (!isNewEstablishment && (!establishmentId || !isValidUUID(establishmentId)))
      return res.status(400).json({ error: "Établissement requis." });
    if (isNewEstablishment && !newEstablishmentName)
      return res.status(400).json({ error: "Nom de l'établissement requis." });
    if (isNewEstablishment && !newEstablishmentSpecialty)
      return res.status(400).json({ error: "Spécialité requise." });
    if (isNewEstablishment && !newEstablishmentGoogleMaps)
      return res.status(400).json({ error: "Lien Google Maps requis." });
    if (isNewEstablishment && !newEstablishmentInstagram)
      return res.status(400).json({ error: "Lien Instagram requis." });

    if (!email || !isValidEmail(email))
      return res.status(400).json({ error: "Email invalide." });
    if (!phone)
      return res.status(400).json({ error: "Numéro de mobile requis." });
    if (!role || !VALID_ROLES.includes(role))
      return res.status(400).json({ error: "Fonction requise." });
    if (!firstName || !lastName)
      return res.status(400).json({ error: "Nom et prénom requis." });
    if (!offerTitle)
      return res.status(400).json({ error: "Titre de l'offre requis." });
    if (!VALID_OFFER_TYPES.includes(offerType))
      return res.status(400).json({ error: "Type d'offre invalide." });
    if (!startDate || !endDate)
      return res.status(400).json({ error: "Dates requises." });
    if (!price || price <= 0 || isNaN(price))
      return res.status(400).json({ error: "Prix requis." });
    if (!capacity || capacity <= 0 || isNaN(capacity))
      return res.status(400).json({ error: "Capacité requise." });

    // --- Check email was verified ---
    const verified = verifiedEmails.get(email);
    if (!verified || verified.expiresAt < Date.now()) {
      verifiedEmails.delete(email);
      return res.status(403).json({ error: "Email non vérifié. Veuillez d'abord vérifier votre email." });
    }
    // Consume verification
    verifiedEmails.delete(email);

    const supabase = getAdminSupabase();

    let establishmentName: string;

    if (isNewEstablishment) {
      // --- Create new establishment ---
      const baseSlug = newEstablishmentName!
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 70);
      const suffix = Math.random().toString(16).slice(2, 6);
      const slug = `${baseSlug}-${suffix}`;

      const socialLinks: Record<string, string> = {};
      if (newEstablishmentInstagram) socialLinks.instagram = newEstablishmentInstagram;
      if (newEstablishmentGoogleMaps) socialLinks.google_maps = newEstablishmentGoogleMaps;

      const newEstabRow: Record<string, unknown> = {
        name: newEstablishmentName,
        slug,
        universe: "restaurant",
        subcategory: "Restaurant",
        cuisine_types: [newEstablishmentSpecialty],
        phone: phone || null,
        google_maps_url: newEstablishmentGoogleMaps,
        highlights: { instagram_url: newEstablishmentInstagram },
        social_links: socialLinks,
        country: "Maroc",
        city: "Non renseignée",
        status: "pending",
        is_online: false,
        verified: false,
      };

      const { data: newEstab, error: createEstabErr } = await supabase
        .from("establishments")
        .insert(newEstabRow)
        .select("id, name")
        .single();

      if (createEstabErr || !newEstab) {
        log.error({ err: createEstabErr }, "failed to create establishment");
        const detail = createEstabErr?.message || "Aucune donnée retournée";
        return res.status(500).json({ error: `Erreur lors de la création de l'établissement: ${detail}` });
      }

      establishmentId = (newEstab as any).id;
      establishmentName = (newEstab as any).name || newEstablishmentName!;

      // Invalidate cache so new establishment appears in future searches
      cachedEstablishments = null;

      log.info({ establishmentId, establishmentName }, "new establishment created");

      void emitAdminNotification({
        type: "claim_request",
        title: "🏪 Nouvel établissement créé (Onboarding Ramadan)",
        body: `"${establishmentName}" — Spécialité: ${newEstablishmentSpecialty}`,
        data: { establishmentId, establishmentName, specialty: newEstablishmentSpecialty, googleMaps: newEstablishmentGoogleMaps, instagram: newEstablishmentInstagram },
      });
    } else {
      // --- Fetch existing establishment & update empty fields ---
      const { data: estab } = await supabase
        .from("establishments")
        .select("id, name, phone, social_links, google_maps_url")
        .eq("id", establishmentId)
        .maybeSingle();

      if (!estab) return res.status(404).json({ error: "Établissement introuvable." });
      establishmentName = (estab as any).name || "Établissement";

      // Fill empty fields with wizard data (don't overwrite existing admin data)
      const updatePayload: Record<string, unknown> = {};

      if (phone && !(estab as any).phone) {
        updatePayload.phone = phone;
      }

      const currentSocial = ((estab as any).social_links || {}) as Record<string, string>;
      let socialChanged = false;
      const newSocial = { ...currentSocial };

      if (existingEstabInstagram && !currentSocial.instagram) {
        newSocial.instagram = existingEstabInstagram;
        socialChanged = true;
      }
      if (existingEstabGoogleMaps && !currentSocial.google_maps) {
        newSocial.google_maps = existingEstabGoogleMaps;
        socialChanged = true;
      }
      if (socialChanged) {
        updatePayload.social_links = newSocial;
      }

      if (existingEstabGoogleMaps && !(estab as any).google_maps_url) {
        updatePayload.google_maps_url = existingEstabGoogleMaps;
      }

      if (Object.keys(updatePayload).length > 0) {
        const { error: updateErr } = await supabase
          .from("establishments")
          .update(updatePayload)
          .eq("id", establishmentId);

        if (updateErr) {
          log.error({ err: updateErr, establishmentId }, "onboarding: failed to enrich establishment");
        } else {
          log.info({ establishmentId, fields: Object.keys(updatePayload) }, "onboarding: enriched establishment");
          cachedEstablishments = null;
        }
      }
    }

    // At this point establishmentId is guaranteed to be set
    if (!establishmentId) {
      return res.status(500).json({ error: "Erreur interne : ID établissement manquant." });
    }

    // --- Check if existing establishment is already claimed ---
    if (!isNewEstablishment) {
      const { data: existingClaim } = await supabase
        .from("pro_establishment_memberships")
        .select("id")
        .eq("establishment_id", establishmentId)
        .limit(1)
        .maybeSingle();

      if (existingClaim) {
        return res.status(409).json({ error: "Nous sommes désolés, cette fiche a déjà été revendiquée." });
      }
    }

    // --- 2. Create claim_request (revendication) ---
    try {
      await supabase.from("claim_requests").insert({
        establishment_id: establishmentId,
        establishment_name: establishmentName,
        first_name: firstName,
        last_name: lastName,
        phone,
        email,
        preferred_day: "onboarding-ramadan",
        preferred_time: wantCommercial && commercialSlot ? commercialSlot : "aucun",
        status: "pending",
        created_at: new Date().toISOString(),
        instagram_url: isNewEstablishment
          ? newEstablishmentInstagram || null
          : existingEstabInstagram || null,
        google_maps_url: isNewEstablishment
          ? newEstablishmentGoogleMaps || null
          : existingEstabGoogleMaps || null,
      });

      void emitAdminNotification({
        type: "claim_request",
        title: "🌙 Nouvelle inscription Ramadan",
        body: `${firstName} ${lastName} a soumis une offre Ramadan pour "${establishmentName}"`,
        data: { establishmentId, establishmentName, email, phone },
      });

      // Email notification to hello@sam.ma
      void sendLoggedEmail({
        emailId: `onboarding-ramadan-admin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        fromKey: "noreply",
        to: ["hello@sam.ma"],
        subject: `[Onboarding Ramadan] Nouvelle inscription : ${establishmentName}`,
        bodyText: `Nouvelle inscription Ramadan reçue.\n\n• Établissement : ${establishmentName}\n• Contact : ${firstName} ${lastName}\n• Email : ${email}\n• Téléphone : ${phone}\n• Offre : ${offerTitle}`,
        ctaLabel: "Voir dans l'admin",
        ctaUrl: "https://sam.ma/admin/ramadan",
      }).catch((err) => log.error({ err }, "admin email error"));
    } catch (claimErr) {
      log.error({ err: claimErr }, "claim_request insert error");
      // Non-blocking — continue
    }

    // --- 3. Find or create pro user ---
    let userId: string;
    let isNewUser = false;
    const tempPassword = generateTempPassword();

    // Search by email in auth.users
    const { data: authList } = await supabase.auth.admin.listUsers({ page: 1, perPage: 500 });
    const existingUser = authList?.users?.find((u: any) => u.email === email);

    if (existingUser) {
      userId = existingUser.id;
      log.info({ userId }, "existing user found");
    } else {
      // Create new user
      const { data: newUser, error: createErr } = await supabase.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          auth_method: "onboarding",
          must_change_password: true,
          first_name: firstName,
          last_name: lastName,
          phone,
        },
      });

      if (createErr || !newUser?.user) {
        log.error({ err: createErr }, "failed to create user");
        return res.status(500).json({ error: "Erreur lors de la création du compte." });
      }

      userId = newUser.user.id;
      isNewUser = true;
      log.info({ userId }, "new user created");
    }

    // --- 4. Upsert pro_profiles ---
    const { error: profileErr } = await supabase.from("pro_profiles").upsert(
      {
        id: userId,
        email: email?.toLowerCase().trim() || undefined,
        must_change_password: isNewUser ? true : undefined,
      },
      { onConflict: "id" },
    );
    if (profileErr) {
      log.error({ err: profileErr }, "pro_profiles upsert error");
    }

    // --- 5. Create membership if not exists ---
    const membershipRole = ROLE_TO_MEMBERSHIP[role] || "reception";
    const { data: existingMembership } = await supabase
      .from("pro_establishment_memberships")
      .select("id")
      .eq("user_id", userId)
      .eq("establishment_id", establishmentId)
      .maybeSingle();

    if (!existingMembership) {
      const { error: memErr } = await supabase.from("pro_establishment_memberships").insert({
        user_id: userId,
        establishment_id: establishmentId,
        role: membershipRole,
      });
      if (memErr) {
        log.error({ err: memErr }, "membership insert error");
      }
    }

    // --- 6. Create Ramadan offer ---
    const priceInCentimes = Math.round(price * 100);
    let originalPrice: number | null = null;

    if (promotionType && promotionValue && promotionValue > 0) {
      if (promotionType === "percent") {
        // originalPrice is the pre-discount price; price is the discounted price
        // user enters the selling price + promotion %
        // originalPrice = price / (1 - percent/100)
        originalPrice = Math.round((priceInCentimes / (1 - promotionValue / 100)));
      } else if (promotionType === "amount") {
        originalPrice = priceInCentimes + Math.round(promotionValue * 100);
      }
    }

    const offerTypeLabel = offerType === "ftour" ? "Ftour"
      : offerType === "shour" ? "S'hour"
      : offerType === "traiteur" ? "Traiteur"
      : offerType === "pack_famille" ? "Pack Famille"
      : "Spécial";

    const coverUrl = asString(body.cover_url);

    const createResult = await createRamadanOffer(
      {
        establishmentId,
        title: offerTitle,
        descriptionFr: offerDescription || null,
        type: offerType,
        price: priceInCentimes,
        originalPrice,
        capacityPerSlot: capacity,
        slotIntervalMinutes: slotInterval,
        timeSlots: [{ start: startTime, end: endTime, label: offerTypeLabel }],
        validFrom: startDate,
        validTo: endDate,
        coverUrl: coverUrl || null,
      },
      userId,
    );

    if (!createResult.ok) {
      log.error({ err: createResult.error }, "createRamadanOffer failed");
      return res.status(500).json({ error: "Erreur lors de la création de l'offre." });
    }

    const offerId = createResult.data.offerId;

    // --- 7. Submit for moderation ---
    const submitResult = await submitRamadanOfferForModeration(offerId, establishmentId);
    if (!submitResult.ok) {
      log.error({ err: submitResult.error }, "submitForModeration failed");
      // Non-blocking — offer was created as draft, admin can still see it
    }

    // --- 8. Send "create password" email for new users ---
    if (isNewUser) {
      try {
        const baseUrl = (process.env.PUBLIC_URL ?? "https://sam.ma").replace(/\/+$/, "");
        const loginUrl = `${baseUrl}/pro`;

        await sendLoggedEmail({
          emailId: `onboarding-welcome-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          fromKey: "pro",
          to: [email],
          subject: "Bienvenue sur SAM.ma — Créez votre mot de passe",
          bodyText: [
            `Bonjour ${firstName},`,
            "",
            `Votre offre Ramadan pour "${establishmentName}" a été soumise avec succès.`,
            "Un modérateur va prendre en charge votre demande dans les plus brefs délais.",
            "",
            "Pour accéder à votre Espace Pro et gérer vos réservations, connectez-vous avec :",
            "",
            `Email : ${email}`,
            `Mot de passe provisoire : ${tempPassword}`,
            "",
            `Connectez-vous ici : ${loginUrl}`,
            "",
            "Vous serez invité à changer votre mot de passe lors de votre première connexion.",
            "",
            "Cordialement,",
            "L'équipe SAM.ma",
          ].join("\n"),
          meta: { type: "onboarding_welcome", user_id: userId, establishment_id: establishmentId },
        });
      } catch (emailErr) {
        log.error({ err: emailErr }, "welcome email error");
        // Non-blocking
      }
    }

    // --- 9. Log ---
    try {
      await supabase.from("system_logs").insert({
        actor_user_id: userId,
        actor_role: "pro",
        action: "onboarding.ramadan_submit",
        entity_type: "ramadan_offer",
        entity_id: offerId,
        payload: {
          establishment_id: establishmentId,
          email,
          role,
          is_new_user: isNewUser,
          want_commercial: wantCommercial,
          commercial_slot: commercialSlot || null,
        },
      });
    } catch (err) {
      log.warn({ err }, "Best-effort: ramadan onboarding audit log failed");
    }

    log.info({ offerId, userId, isNewUser }, "submit complete");

    return res.json({
      ok: true,
      is_new_user: isNewUser,
      offer_id: offerId,
    });
  } catch (err) {
    log.error({ err }, "submit error");
    return res.status(500).json({ error: "Erreur serveur" });
  }
}) as RequestHandler);

// ---------------------------------------------------------------------------
// POST /commercial-callback — Demande de rappel commercial
// ---------------------------------------------------------------------------
router.post("/commercial-callback", zBody(ramadanCommercialCallbackSchema), (async (req, res) => {
  try {
    const body = req.body ?? {};
    const establishmentId = asString(body.establishment_id);
    const firstName = asString(body.first_name);
    const lastName = asString(body.last_name);
    const phone = asString(body.phone);
    const email = asString(body.email)?.toLowerCase();
    const preferredSlot = asString(body.preferred_slot);

    if (!establishmentId || !isValidUUID(establishmentId))
      return res.status(400).json({ error: "Établissement requis." });
    if (!firstName || !lastName)
      return res.status(400).json({ error: "Nom requis." });
    if (!phone)
      return res.status(400).json({ error: "Téléphone requis." });
    if (!email || !isValidEmail(email))
      return res.status(400).json({ error: "Email invalide." });
    if (!preferredSlot || !VALID_COMMERCIAL_SLOTS.includes(preferredSlot))
      return res.status(400).json({ error: "Créneau invalide." });

    const supabase = getAdminSupabase();

    // Fetch establishment name
    const { data: estab } = await supabase
      .from("establishments")
      .select("name")
      .eq("id", establishmentId)
      .maybeSingle();

    const establishmentName = (estab as any)?.name || "Établissement";

    const { error: insertErr } = await supabase.from("claim_requests").insert({
      establishment_id: establishmentId,
      establishment_name: establishmentName,
      first_name: firstName,
      last_name: lastName,
      phone,
      email,
      preferred_day: "callback-commercial",
      preferred_time: preferredSlot,
      status: "pending",
      created_at: new Date().toISOString(),
    });

    if (insertErr) {
      log.error({ err: insertErr }, "commercial-callback insert error");
      return res.status(500).json({ error: "Erreur serveur" });
    }

    void emitAdminNotification({
      type: "claim_request",
      title: "📞 Demande de rappel commercial",
      body: `${firstName} ${lastName} souhaite être contacté (${preferredSlot}) — "${establishmentName}"`,
      data: { establishmentId, establishmentName, email, phone, preferredSlot },
    });

    // Email notification to hello@sam.ma
    void sendLoggedEmail({
      emailId: `onboarding-callback-admin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      fromKey: "noreply",
      to: ["hello@sam.ma"],
      subject: `[Onboarding Ramadan] Demande de rappel : ${establishmentName}`,
      bodyText: `Demande de rappel commercial.\n\n• Établissement : ${establishmentName}\n• Contact : ${firstName} ${lastName}\n• Email : ${email}\n• Téléphone : ${phone}\n• Créneau préféré : ${preferredSlot}`,
    }).catch((err) => log.error({ err }, "callback admin email error"));

    return res.json({ ok: true });
  } catch (err) {
    log.error({ err }, "commercial-callback error");
    return res.status(500).json({ error: "Erreur serveur" });
  }
}) as RequestHandler);

// =============================================================================
// POST /upload-photo — Upload offre image (public, rate-limited)
// =============================================================================

async function ensureStorageBucket(
  supabase: ReturnType<typeof getAdminSupabase>,
  bucket: string,
): Promise<void> {
  try {
    const exists = await supabase.storage.getBucket(bucket);
    if (!exists.error) return;

    const msg = String(exists.error.message ?? "").toLowerCase();
    const status = (exists.error as any)?.statusCode ?? (exists.error as any)?.status ?? null;

    if (status === 404 || msg.includes("not found") || msg.includes("does not exist")) {
      const created = await supabase.storage.createBucket(bucket, { public: true });
      const cmsg = String(created.error?.message ?? "").toLowerCase();
      if (created.error && !cmsg.includes("exists") && !cmsg.includes("duplicate")) {
        throw created.error;
      }
    }
  } catch (err) {
    log.warn({ err }, "Best-effort: storage bucket creation failed");
  }
}

router.post("/upload-photo", onboardingPhotoUpload.single("photo"), (async (req, res) => {
  try {
    // Rate limit by IP
    const ip = req.ip || "unknown";
    const now = Date.now();
    const rl = uploadRateLimit.get(ip);
    if (rl && rl.resetAt > now && rl.count >= MAX_UPLOAD_PER_HOUR) {
      return res.status(429).json({ error: "Trop de tentatives d'upload. Réessayez dans une heure." });
    }
    if (!rl || rl.resetAt <= now) {
      uploadRateLimit.set(ip, { count: 1, resetAt: now + 60 * 60 * 1000 });
    } else {
      rl.count++;
    }

    const file = (req as any).file;
    if (!file) {
      return res.status(400).json({ error: "Aucun fichier uploadé." });
    }

    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      return res.status(400).json({
        error: "file_too_large",
        message: "Le fichier dépasse la taille maximale de 5 Mo.",
      });
    }

    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return res.status(400).json({
        error: "invalid_mime_type",
        message: "Format non accepté. Formats autorisés : JPG, PNG, WebP, GIF.",
      });
    }

    const extension = file.originalname.split(".").pop()?.toLowerCase() || "jpg";
    const filename = `onboarding/${randomUUID()}.${extension}`;

    const supabase = getAdminSupabase();
    await ensureStorageBucket(supabase, RAMADAN_IMAGES_BUCKET);

    const { error: uploadError } = await supabase.storage
      .from(RAMADAN_IMAGES_BUCKET)
      .upload(filename, file.buffer, {
        contentType: file.mimetype,
        upsert: false,
      });

    if (uploadError) {
      log.error({ err: uploadError }, "ramadan upload-photo error");
      return res.status(500).json({ error: "upload_failed", message: uploadError.message });
    }

    const { data: { publicUrl } } = supabase.storage
      .from(RAMADAN_IMAGES_BUCKET)
      .getPublicUrl(filename);

    return res.json({ ok: true, url: publicUrl });
  } catch (err) {
    log.error({ err }, "upload-photo error");
    return res.status(500).json({ error: "Erreur serveur" });
  }
}) as RequestHandler);

export default router;
