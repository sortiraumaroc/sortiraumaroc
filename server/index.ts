import "dotenv/config";
import express from "express";
import cors from "cors";
import compression from "compression";
import helmet from "helmet";
import { flushCache, getCacheStats } from "./lib/cache";
import { getAdminSupabase } from "./supabaseAdmin";
import { initSentry, captureException, sentryRequestHandler, sentryErrorHandler } from "./lib/sentry";
import { httpLogger } from "./lib/requestLogger";
import { logger } from "./lib/logger";
import { uploadAdminCategoryImage } from "./routes/admin";
import { getPlatformSettingsSnapshot } from "./platformSettings";

// ── Route registrations ─────────────────────────────────────────────────────
import { registerPublicRoutes } from "./routes/public";
import { registerAdminCoreRoutes } from "./routes/admin";
import { registerProCoreRoutes } from "./routes/pro";
import { registerMediaFactoryRoutes } from "./routes/mediaFactory";

// Auth
import { registerFirebaseAuthRoutes } from "./routes/firebaseAuth";
import { registerTwilioAuthRoutes } from "./routes/twilioAuth";
import { registerEmailVerificationRoutes } from "./routes/emailVerification";
import { registerAdminAuthRoutes } from "./routes/adminAuth";

// Admin sub-modules
import { registerAdminAIRoutes } from "./routes/adminAI";
import { registerAdminInventoryRoutes } from "./routes/adminInventory";
import { registerAdminImportExportRoutes } from "./routes/adminImportExport";
import { registerAdminImportSqlRoutes } from "./routes/adminImportSql";
import { registerAdminImportChrRoutes } from "./routes/adminImportChr";
import { registerAdminDashboardRoutes } from "./routes/adminDashboard";
import { registerAdminUserManagementRoutes } from "./routes/adminUserManagement";
import { registerAdminMarketingRoutes } from "./routes/adminMarketing";
import { registerAdminActivityTrackingRoutes } from "./routes/adminActivityTracking";
import { registerAdminEmailRoutes } from "./routes/adminEmails";
import { registerAdminNewsletterRoutes } from "./routes/adminNewsletter";
import { registerAdminNotificationRoutes } from "./routes/adminNotifications";
import { registerAdminCollaboratorRoutes } from "./routes/adminCollaborators";
import { registerAdminContactFormRoutes } from "./routes/adminContactForms";
import { registerAdminSearchBoostRoutes } from "./routes/adminSearchBoost";
import { registerAdminAdsRoutes } from "./routes/adminAds";

// Reviews (all layers)
import { registerReviewRoutes } from "./routes/reviews";
import { registerConsumerReviewsV2Routes } from "./routes/reviewsV2";
import { registerAdminReviewRoutes } from "./routes/adminReviews";
import { registerAdminReviewsV2Routes } from "./routes/adminReviewsV2";
import { registerProReviewRoutes } from "./routes/proReviews";
import { registerProReviewsV2Routes } from "./routes/proReviewsV2";
import { registerPublicReviewsV2Routes } from "./routes/publicReviewsV2";

// Pro sub-modules
import { registerProAdsRoutes } from "./routes/proAds";
import { registerPublicAdsRoutes } from "./routes/publicAds";

// Reservation V2
import { registerReservationV2PublicRoutes } from "./routes/reservationV2Public";
import { registerReservationV2ProRoutes } from "./routes/reservationV2Pro";
import { registerReservationV2AdminRoutes } from "./routes/reservationV2Admin";
import { registerReservationV2CronRoutes } from "./routes/reservationV2Cron";

// Packs
import { registerPacksPublicRoutes } from "./routes/packsPublic";
import { registerPacksProRoutes } from "./routes/packsPro";
import { registerPacksAdminRoutes } from "./routes/packsAdmin";
import { registerPacksCronRoutes } from "./routes/packsCron";

// Loyalty V2
import { registerLoyaltyV2PublicRoutes } from "./routes/loyaltyV2Public";
import { registerLoyaltyV2ProRoutes } from "./routes/loyaltyV2Pro";
import { registerLoyaltyV2AdminRoutes } from "./routes/loyaltyV2Admin";
import { registerLoyaltyV2CronRoutes } from "./routes/loyaltyV2Cron";

// Loyalty V1
import { registerLoyaltyRoutes } from "./routes/loyalty";

// Rental
import { registerRentalPublicRoutes } from "./routes/rentalPublic";
import { registerRentalConsumerRoutes } from "./routes/rentalConsumer";
import { registerRentalProRoutes } from "./routes/rentalPro";
import { registerRentalAdminRoutes } from "./routes/rentalAdmin";

// Notifications / Banners / Wheel
import { registerNotificationPublicRoutes } from "./routes/notificationsPublic";
import { registerBannerPublicRoutes } from "./routes/bannersPublic";
import { registerPushCampaignAdminRoutes } from "./routes/pushCampaignAdmin";
import { registerBannerAdminRoutes } from "./routes/bannersAdmin";
import { registerWheelPublicRoutes } from "./routes/wheelPublic";
import { registerWheelAdminRoutes } from "./routes/wheelAdmin";
import { registerNotificationsCronRoutes } from "./routes/notificationsCron";
import { registerSupportCronRoutes } from "./routes/supportCron";

// Social / Messaging
import { registerSocialRoutes } from "./routes/social";
import { registerMessagingRoutes } from "./routes/messaging";
import { registerSponsoredNotificationRoutes } from "./routes/sponsoredNotifications";

// SAM AI
import { registerSamRoutes } from "./sam/chatEndpoint";
import { registerSamVoiceRoutes } from "./sam/voice";

// CE (Comité d'Entreprise)
import { registerCeAdminRoutes } from "./routes/ceAdmin";
import { registerCeCompanyAdminRoutes } from "./routes/ceCompanyAdmin";
import { registerCePublicRoutes } from "./routes/cePublic";
import { registerCeProRoutes } from "./routes/cePro";

// Conciergerie
import { registerConciergerieRoutes } from "./routes/conciergerie";
import { registerConciergerieProInboxRoutes } from "./routes/conciergerieProInbox";

// Partnerships
import { registerPartnershipAdminRoutes } from "./routes/partnershipAdmin";
import { registerPartnershipProRoutes } from "./routes/partnershipPro";

// Ramadan 2026
import ramadanProRoutes from "./routes/ramadanPro";
import ramadanAdminRoutes from "./routes/ramadanAdmin";
import ramadanPublicRoutes from "./routes/ramadanPublic";
import ramadanCronRoutes from "./routes/ramadanCron";
import onboardingRamadanRouter from "./routes/onboardingRamadan";

// Small standalone modules
import { registerBookingConfirmationRoutes } from "./bookingConfirmation";
import { registerEmailTrackingRoutes } from "./routes/emailTracking";
import { registerMysqlContentRoutes } from "./routes/mysqlContent";
import { registerSupportRoutes } from "./routes/support";
import { registerPublicContactFormRoutes } from "./routes/publicContactForms";
import { registerClaimRequestRoutes } from "./routes/claimRequests";
import { registerReferralRoutes } from "./routes/referral";
import { registerMenuDigitalRoutes } from "./routes/menuDigitalSync";
import { registerPrestatairesRoutes } from "./routes/prestataires";
import { registerPreferenceCronRoutes } from "./routes/preferenceCron";
import { registerLeadsRoutes } from "./routes/leads";
import { registerPaymentsRoutes } from "./routes/payments";
import { registerLacaissePayRoutes } from "./routes/lacaissepay";
import { registerWalletRoutes } from "./routes/wallet";
import { registerTotpRoutes } from "./routes/totp";
import { registerConsumerTotpRoutes } from "./routes/consumerTotp";
import { registerPushTokenRoutes } from "./routes/pushTokens";
import { registerBugReportRoutes } from "./routes/bugReports";
import { registerReviewCronRoutes } from "./routes/reviewCron";
import { registerReviewCronV2Routes } from "./routes/reviewCronV2";
import { registerWaitlistCronRoutes } from "./routes/waitlistCron";
import { registerAdsCronRoutes } from "./routes/adsCron";
import { registerSubscriptionsCronRoutes } from "./routes/subscriptionsCron";
import { registerGoogleRatingSyncRoutes } from "./routes/googleRatingSync";
import newsletterRoutes from "./routes/newsletter";
import { purgeOldAuditLogs } from "./routes/admin";

// ── Server factory ───────────────────────────────────────────────────────────

export function createServer() {
  const app = express();

  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  // Sentry request handler must be the first middleware
  app.use(sentryRequestHandler());

  // Structured HTTP logging with request correlation IDs
  app.use(httpLogger);

  // Security headers
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=(self)",
    );

    if (process.env.NODE_ENV === "production") {
      res.setHeader(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains; preload",
      );
    }

    if (
      process.env.NODE_ENV === "production" &&
      !req.path.startsWith("/api/")
    ) {
      res.setHeader("X-Frame-Options", "SAMEORIGIN");
    }

    // Content-Security-Policy — only apply to HTML pages, not API responses
    if (!req.path.startsWith("/api/")) {
      const cspDirectives = [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' https://cdn.builder.io https://www.gstatic.com https://www.google.com https://apis.google.com https://*.firebaseapp.com https://*.googleapis.com https://www.googletagmanager.com https://tagmanager.google.com",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "img-src 'self' data: blob: https: http:",
        "font-src 'self' https://fonts.gstatic.com data:",
        "connect-src 'self' https://*.supabase.co https://*.supabase.in wss://*.supabase.co wss://*.supabase.in https://*.googleapis.com https://www.google.com https://apis.google.com https://*.firebaseio.com https://*.firebaseapp.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://cdn.builder.io https://*.lacaissepay.ma https://www.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com",
        "frame-src 'self' https://www.google.com https://www.gstatic.com https://*.firebaseapp.com",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        ...(process.env.NODE_ENV === "production" ? ["upgrade-insecure-requests"] : []),
      ];
      res.setHeader("Content-Security-Policy", cspDirectives.join("; "));
    }

    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=(self), payment=(self)"
    );

    next();
  });

  // ── Core middleware ──────────────────────────────────────────────────────
  const corsOptions = {
    origin: true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "authorization",
      "content-type",
      "x-admin-key",
      "x-admin-session",
      "x-file-name",
    ],
    optionsSuccessStatus: 204,
    maxAge: 60 * 60 * 24,
  };

  app.use(cors(corsOptions));
  app.options(/.*/, cors(corsOptions));
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(compression());

  // RAW BODY ROUTES — must be registered BEFORE express.json()
  app.post(
    "/api/admin/category-images/upload",
    express.raw({
      type: ["image/jpeg", "image/png", "image/webp"],
      limit: "2mb",
    }),
    uploadAdminCategoryImage,
  );

  // SQL Import routes — need higher body limit (50 MB)
  registerAdminImportSqlRoutes(app);

  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true, limit: "2mb" }));

  // Ensure all JSON responses include charset=utf-8
  app.use((_req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = (body: unknown) => {
      if (!res.headersSent) {
        res.setHeader("Content-Type", "application/json; charset=utf-8");
      }
      return originalJson(body);
    };
    next();
  });

  // ── Favicon ─────────────────────────────────────────────────────────────
  app.get(["/favicon.ico"], (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.redirect(
      302,
      "https://cdn.builder.io/api/v1/image/assets%2F9d79e075af8c480ea94841fd41e63e5c%2Fc16969ff26074ebca70eb03a15c1fd0b?format=ico&width=64",
    );
  });

  // ── Health check ────────────────────────────────────────────────────────
  app.get("/api/health", async (_req, res) => {
    try {
      const supabase = getAdminSupabase();
      const start = Date.now();
      const { error } = await supabase.from("establishments").select("id").limit(1);
      const dbLatencyMs = Date.now() - start;
      if (error) {
        return res.status(503).json({ status: "degraded", db: "unreachable", error: error.message });
      }
      return res.json({ status: "ok", uptime: process.uptime(), dbLatencyMs });
    } catch (err) {
      return res.status(503).json({ status: "error", error: err instanceof Error ? err.message : "unknown" });
    }
  });

  // ── Email assets ────────────────────────────────────────────────────────
  app.get("/api/public/assets/email-logo.png", async (_req, res) => {
    try {
      const { readFile } = await import("fs/promises");
      const { fileURLToPath } = await import("url");
      const { dirname, resolve } = await import("path");
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      const candidates = [
        resolve(__dirname, "../public/logo-white-red.png"),
        resolve(process.cwd(), "public/logo-white-red.png"),
        resolve(__dirname, "../spa/logo-white-red.png"),
      ];
      for (const p of candidates) {
        try {
          const buf = await readFile(p);
          res.setHeader("Cache-Control", "public, max-age=2592000, immutable");
          res.setHeader("Content-Type", "image/png");
          return res.end(buf);
        } catch { /* intentional: file may not exist at this path, try next */ }
      }
      res.status(404).end();
    } catch (err) {
      logger.error({ err }, "Error serving logo-white-red.png");
      res.status(500).end();
    }
  });

  // ── Ping ────────────────────────────────────────────────────────────────
  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });

  // ── Cache management (admin) ────────────────────────────────────────────
  app.post("/api/admin/cache/flush", async (req, res) => {
    const adminKey = req.headers["x-admin-key"];
    if (adminKey !== process.env.ADMIN_API_KEY) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const flushed = flushCache();
    res.json({ ok: true, flushed });
  });
  app.get("/api/admin/cache/stats", async (req, res) => {
    const adminKey = req.headers["x-admin-key"];
    if (adminKey !== process.env.ADMIN_API_KEY) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    res.json({ ok: true, ...getCacheStats() });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // ROUTE REGISTRATIONS
  // ══════════════════════════════════════════════════════════════════════════

  // Public & Consumer routes
  registerPublicRoutes(app);
  registerPublicAdsRoutes(app);
  registerEmailTrackingRoutes(app);
  registerPublicContactFormRoutes(app);
  registerClaimRequestRoutes(app);
  registerPublicReviewsV2Routes(app);

  // Consumer auth
  registerFirebaseAuthRoutes(app);
  registerTwilioAuthRoutes(app);
  registerEmailVerificationRoutes(app);
  registerPushTokenRoutes(app);

  // Consumer features
  registerReviewRoutes(app);
  registerConsumerReviewsV2Routes(app);
  registerTotpRoutes(app);
  registerConsumerTotpRoutes(app);
  registerWalletRoutes(app);
  registerLeadsRoutes(app);
  registerPaymentsRoutes(app);
  registerLacaissePayRoutes(app);
  registerBugReportRoutes(app);
  registerSupportRoutes(app);
  registerBookingConfirmationRoutes(app);

  // Newsletter public
  app.use("/api/newsletter", newsletterRoutes);

  // Admin auth
  registerAdminAuthRoutes(app);

  // Admin core + sub-modules
  registerAdminCoreRoutes(app);
  registerAdminAIRoutes(app);
  registerAdminInventoryRoutes(app);
  registerAdminImportExportRoutes(app);
  registerAdminImportChrRoutes(app);
  registerAdminDashboardRoutes(app);
  registerAdminActivityTrackingRoutes(app);
  registerAdminUserManagementRoutes(app);
  registerAdminMarketingRoutes(app);
  registerAdminEmailRoutes(app);
  registerAdminNewsletterRoutes(app);
  registerAdminNotificationRoutes(app);
  registerAdminCollaboratorRoutes(app);
  registerAdminContactFormRoutes(app);
  registerAdminSearchBoostRoutes(app);
  registerAdminAdsRoutes(app);
  registerAdminReviewRoutes(app);
  registerAdminReviewsV2Routes(app);
  registerMysqlContentRoutes(app);
  registerGoogleRatingSyncRoutes(app);

  // Pro core + sub-modules
  registerProCoreRoutes(app);
  registerProAdsRoutes(app);
  registerProReviewRoutes(app);
  registerProReviewsV2Routes(app);
  registerLoyaltyRoutes(app);
  registerMenuDigitalRoutes(app);
  registerPrestatairesRoutes(app);
  registerReferralRoutes(app);

  // Media Factory (partners + admin production + pro media)
  registerMediaFactoryRoutes(app);

  // Reservation V2
  registerReservationV2PublicRoutes(app);
  registerReservationV2ProRoutes(app);
  registerReservationV2AdminRoutes(app);
  registerReservationV2CronRoutes(app);

  // Packs & Billing
  registerPacksPublicRoutes(app);
  registerPacksProRoutes(app);
  registerPacksAdminRoutes(app);
  registerPacksCronRoutes(app);

  // Ramadan 2026
  app.use("/api/pro/ramadan-offers", ramadanProRoutes);
  app.use("/api/admin/ramadan", ramadanAdminRoutes);
  app.use("/api/public/ramadan-offers", ramadanPublicRoutes);
  app.use("/api/cron/ramadan", ramadanCronRoutes);
  app.use("/api/public/onboarding", onboardingRamadanRouter);

  // Loyalty V2
  registerLoyaltyV2PublicRoutes(app);
  registerLoyaltyV2ProRoutes(app);
  registerLoyaltyV2AdminRoutes(app);
  registerLoyaltyV2CronRoutes(app);

  // Rental vehicles
  registerRentalPublicRoutes(app);
  registerRentalConsumerRoutes(app);
  registerRentalProRoutes(app);
  registerRentalAdminRoutes(app);

  // Notifications, Banners, Wheel
  registerNotificationPublicRoutes(app);
  registerBannerPublicRoutes(app);
  registerPushCampaignAdminRoutes(app);
  registerBannerAdminRoutes(app);
  registerWheelPublicRoutes(app);
  registerWheelAdminRoutes(app);
  registerNotificationsCronRoutes(app);
  registerSupportCronRoutes(app);
  registerSponsoredNotificationRoutes(app);

  // Social & Messaging
  registerSocialRoutes(app);
  registerMessagingRoutes(app);

  // SAM AI Assistant
  registerSamRoutes(app);
  registerSamVoiceRoutes(app);

  // CE (Comité d'Entreprise)
  registerCeAdminRoutes(app);
  registerCeCompanyAdminRoutes(app);
  registerCePublicRoutes(app);
  registerCeProRoutes(app);

  // Conciergerie
  registerConciergerieRoutes(app);
  registerConciergerieProInboxRoutes(app);

  // Partner Agreements
  registerPartnershipAdminRoutes(app);
  registerPartnershipProRoutes(app);

  // Cron jobs
  registerPreferenceCronRoutes(app);
  registerReviewCronRoutes(app);
  registerReviewCronV2Routes(app);
  registerWaitlistCronRoutes(app);
  registerAdsCronRoutes(app);
  registerSubscriptionsCronRoutes(app);

  // Admin notifications cleanup cron (auto-delete >90 days)
  import("./adminNotifications").then((m) => m.startNotificationCleanupCron()).catch(() => {});

  // ══════════════════════════════════════════════════════════════════════════
  // ERROR HANDLERS
  // ══════════════════════════════════════════════════════════════════════════

  // Sentry error handler must be before other error handlers
  app.use(sentryErrorHandler());

  // Final error handler
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      if (res.headersSent) return next(err);

      const message = err instanceof Error ? err.message : "Unknown error";
      logger.error({ err, handler: "express_error_handler" }, "Unhandled API error: %s", message);

      captureException(err, {
        tags: { handler: "express_error_handler" },
        level: "error",
      });

      res.status(500).json({ error: "Erreur serveur. Veuillez réessayer." });
    },
  );

  return app;
}

// Initialize Sentry on module load (async, non-blocking)
initSentry().catch((err) => {
  logger.error({ err }, "Sentry initialization failed");
});
