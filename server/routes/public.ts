/**
 * public.ts — Barrel re-export for all public API handlers.
 *
 * Each handler module lives in its own file; this barrel exists so that
 * `server/index.ts` can keep its single `import * as pub from "./routes/public"`
 * without any change.
 *
 * Modules:
 *   publicHelpers.ts            — shared utilities, types, auth helpers
 *   publicConsumerAccount.ts    — 17 handlers (profile, password, devices, export)
 *   publicEstablishments.ts     — 10 handlers (discovery, search, home feed)
 *   publicReservations.ts       — 16 handlers (booking, waitlist, notifications)
 *   publicConsumerData.ts       — 12 handlers (packs, invoices, messages)
 *   publicMedia.ts              —  6 handlers (media quotes, invoices, payments)
 *   publicConfig.ts             — 15 handlers (universes, cities, landing pages)
 */

import type { Express } from "express";
import { cacheMiddleware, buildCacheKey, normalizeQuery } from "../lib/cache";
import {
  searchHistorySaveRateLimiter,
  searchHistoryReadRateLimiter,
  messageSendRateLimiter,
  messageReadRateLimiter,
} from "../middleware/rateLimiter";
import { getPlatformSettingsSnapshot } from "../platformSettings";
import { logger } from "../lib/logger";
import { zBody, zQuery, zParams, zIdParam } from "../lib/validate";
import {
  UpdateConsumerMeSchema,
  DeactivateConsumerAccountSchema,
  RequestConsumerDataExportSchema,
  ChangeConsumerPasswordSchema,
  CompletePasswordResetSchema,
  RequestPasswordResetLinkSchema,
  SendWelcomeEmailSchema,
  CheckoutConsumerPackSchema,
  SendConsumerReservationMessageSchema,
  UpdateConsumerReservationSchema,
  TrackEstablishmentVisitSchema,
  TrackCampaignEventSchema,
  CreateConsumerReservationSchema,
  CreateConsumerWaitlistSchema,
  MarkAllNotificationsReadSchema,
  ValidateBookingPromoCodeSchema,
  SaveSearchHistorySchema,
  TrackSearchClickSchema,
  ListEstablishmentsQuery,
  SearchAutocompleteQuery,
  PopularSearchesQuery,
  PublicCategoriesQuery,
  PublicCategoryImagesQuery,
  PublicHomeFeedQuery,
  PublicLandingPageQuery,
  PublicHomeCitiesQuery,
  GetSearchHistoryQuery,
  DeleteSearchHistoryQuery,
  SlugParams,
  UsernameParams,
  EstablishmentRefParams,
  TokenParams,
  EstablishmentIdParams,
  CampaignIdParams,
  ConsumerIdParams,
  DeviceIdParams,
} from "../schemas/publicRoutes";

// ── Local imports for registerPublicRoutes ──────────────────────────────────
import {
  getConsumerMe as _getConsumerMe,
  updateConsumerMe as _updateConsumerMe,
  deactivateConsumerAccount as _deactivateConsumerAccount,
  reactivateConsumerAccount as _reactivateConsumerAccount,
  deleteConsumerAccount as _deleteConsumerAccount,
  requestConsumerDataExport as _requestConsumerDataExport,
  downloadConsumerDataExport as _downloadConsumerDataExport,
  requestConsumerPasswordReset as _requestConsumerPasswordReset,
  changeConsumerPassword as _changeConsumerPassword,
  listConsumerTrustedDevices as _listConsumerTrustedDevices,
  revokeConsumerTrustedDevice as _revokeConsumerTrustedDevice,
  revokeAllConsumerTrustedDevices as _revokeAllConsumerTrustedDevices,
  requestConsumerPasswordResetLink as _requestConsumerPasswordResetLink,
  validatePasswordResetToken as _validatePasswordResetToken,
  completePasswordReset as _completePasswordReset,
  requestPublicPasswordResetLink as _requestPublicPasswordResetLink,
  sendWelcomeEmail as _sendWelcomeEmail,
} from "./publicConsumerAccount";
import {
  getPublicSitemapXml as _getPublicSitemapXml,
  getPublicEstablishment as _getPublicEstablishment,
  getPublicBillingCompanyProfile as _getPublicBillingCompanyProfile,
  listPublicEstablishments as _listPublicEstablishments,
  searchAutocomplete as _searchAutocomplete,
  getPopularSearches as _getPopularSearches,
  getPublicCategories as _getPublicCategories,
  getPublicCategoryImages as _getPublicCategoryImages,
  getPublicHomeFeed as _getPublicHomeFeed,
} from "./publicEstablishments";
import {
  ensureConsumerDemoAccount as _ensureConsumerDemoAccount,
  trackPublicEstablishmentVisit as _trackPublicEstablishmentVisit,
  trackPublicCampaignEvent as _trackPublicCampaignEvent,
  geocodePublic as _geocodePublic,
  createConsumerReservation as _createConsumerReservation,
  listConsumerReservations as _listConsumerReservations,
  listConsumerWaitlist as _listConsumerWaitlist,
  cancelConsumerWaitlist as _cancelConsumerWaitlist,
  acceptConsumerWaitlistOffer as _acceptConsumerWaitlistOffer,
  refuseConsumerWaitlistOffer as _refuseConsumerWaitlistOffer,
  createConsumerWaitlist as _createConsumerWaitlist,
  listConsumerNotifications as _listConsumerNotifications,
  getConsumerNotificationsUnreadCount as _getConsumerNotificationsUnreadCount,
  markConsumerNotificationRead as _markConsumerNotificationRead,
  markAllConsumerNotificationsRead as _markAllConsumerNotificationsRead,
  deleteConsumerNotification as _deleteConsumerNotification,
} from "./publicReservations";
import {
  listConsumerPackPurchases as _listConsumerPackPurchases,
  checkoutConsumerPack as _checkoutConsumerPack,
  confirmConsumerPackPurchase as _confirmConsumerPackPurchase,
  hideConsumerPackPurchase as _hideConsumerPackPurchase,
  getConsumerReservation as _getConsumerReservation,
  getConsumerReservationInvoice as _getConsumerReservationInvoice,
  getConsumerPackPurchaseInvoice as _getConsumerPackPurchaseInvoice,
  listConsumerReservationMessages as _listConsumerReservationMessages,
  sendConsumerReservationMessage as _sendConsumerReservationMessage,
  updateConsumerReservation as _updateConsumerReservation,
} from "./publicConsumerData";
import {
  getPublicMediaQuote as _getPublicMediaQuote,
  getPublicMediaQuotePdf as _getPublicMediaQuotePdf,
  acceptPublicMediaQuote as _acceptPublicMediaQuote,
  getPublicMediaInvoice as _getPublicMediaInvoice,
  getPublicMediaInvoicePdf as _getPublicMediaInvoicePdf,
  createPublicMediaInvoicePaymentSession as _createPublicMediaInvoicePaymentSession,
} from "./publicMedia";
import {
  getPublicUniverses as _getPublicUniverses,
  getPublicHomeSettings as _getPublicHomeSettings,
  getPublicHomeCities as _getPublicHomeCities,
  getPublicCountries as _getPublicCountries,
  detectUserCountry as _detectUserCountry,
  detectUserCity as _detectUserCity,
  getPublicHomeVideos as _getPublicHomeVideos,
  getPublicHomeTakeover as _getPublicHomeTakeover,
  getPublicEstablishmentByUsername as _getPublicEstablishmentByUsername,
  validateBookingPromoCode as _validateBookingPromoCode,
  saveSearchHistory as _saveSearchHistory,
  getSearchHistoryList as _getSearchHistoryList,
  deleteSearchHistory as _deleteSearchHistory,
  trackSearchClick as _trackSearchClick,
  getPublicLandingPage as _getPublicLandingPage,
  getPublicLandingSlugMap as _getPublicLandingSlugMap,
} from "./publicConfig";

// ── Consumer Account ────────────────────────────────────────────────────────
export {
  getConsumerMe,
  updateConsumerMe,
  deactivateConsumerAccount,
  reactivateConsumerAccount,
  deleteConsumerAccount,
  requestConsumerDataExport,
  downloadConsumerDataExport,
  requestConsumerPasswordReset,
  changeConsumerPassword,
  listConsumerTrustedDevices,
  revokeConsumerTrustedDevice,
  revokeAllConsumerTrustedDevices,
  requestConsumerPasswordResetLink,
  validatePasswordResetToken,
  completePasswordReset,
  requestPublicPasswordResetLink,
  sendWelcomeEmail,
} from "./publicConsumerAccount";

// ── Establishments / Discovery / Search / Home Feed ─────────────────────────
export {
  getPublicSitemapXml,
  getPublicEstablishment,
  getPublicBillingCompanyProfile,
  listPublicEstablishments,
  searchAutocomplete,
  getPopularSearches,
  getPublicCategories,
  getPublicCategoryImages,
  getPublicHomeFeed,
} from "./publicEstablishments";

// ── Reservations / Waitlist / Notifications ─────────────────────────────────
export {
  ensureConsumerDemoAccount,
  trackPublicEstablishmentVisit,
  trackPublicCampaignEvent,
  geocodePublic,
  createConsumerReservation,
  listConsumerReservations,
  listConsumerWaitlist,
  cancelConsumerWaitlist,
  acceptConsumerWaitlistOffer,
  refuseConsumerWaitlistOffer,
  createConsumerWaitlist,
  listConsumerNotifications,
  getConsumerNotificationsUnreadCount,
  markConsumerNotificationRead,
  markAllConsumerNotificationsRead,
  deleteConsumerNotification,
} from "./publicReservations";

// ── Consumer Data (Packs, Invoices, Messages) ───────────────────────────────
export {
  listConsumerPackPurchases,
  checkoutConsumerPack,
  confirmConsumerPackPurchase,
  hideConsumerPackPurchase,
  getConsumerReservation,
  getConsumerReservationInvoice,
  getConsumerPackPurchaseInvoice,
  listConsumerReservationMessages,
  sendConsumerReservationMessage,
  updateConsumerReservation,
} from "./publicConsumerData";

// ── Media (public quotes, invoices, payments) ───────────────────────────────
export {
  getPublicMediaQuote,
  getPublicMediaQuotePdf,
  acceptPublicMediaQuote,
  getPublicMediaInvoice,
  getPublicMediaInvoicePdf,
  createPublicMediaInvoicePaymentSession,
} from "./publicMedia";

// ── Config / Universes / Cities / Landing Pages ─────────────────────────────
export {
  getPublicUniverses,
  getPublicHomeSettings,
  getPublicHomeCities,
  getPublicCountries,
  detectUserCountry,
  detectUserCity,
  getPublicHomeVideos,
  getPublicHomeTakeover,
  getPublicEstablishmentByUsername,
  validateBookingPromoCode,
  saveSearchHistory,
  getSearchHistoryList,
  deleteSearchHistory,
  trackSearchClick,
  getPublicLandingPage,
  getPublicLandingSlugMap,
} from "./publicConfig";
import { getPublicContentPage } from "./adminContent";

// ── Route registration ──────────────────────────────────────────────────────

export function registerPublicRoutes(app: Express) {
  // Demo routes guard
  const allowDemoRoutes =
    process.env.NODE_ENV !== "production" &&
    String(process.env.ALLOW_DEMO_ROUTES ?? "").toLowerCase() === "true";

  // ── Sitemap ──────────────────────────────────────────────────────────────
  app.get("/sitemap.xml", _getPublicSitemapXml);

  // ── Establishments / discovery ────────────────────────────────────────────
  const establishmentSearchCache = cacheMiddleware(120, (req) =>
    buildCacheKey("search", {
      q: String(req.query.q ?? ""),
      universe: String(req.query.universe ?? ""),
      city: String(req.query.city ?? ""),
      category: String(req.query.category ?? ""),
      sort: String(req.query.sort ?? ""),
      promo: String(req.query.promo ?? req.query.promoOnly ?? ""),
      cursor: String(req.query.cursor ?? ""),
      limit: String(req.query.limit ?? "12"),
      swLat: String(req.query.swLat ?? ""),
      swLng: String(req.query.swLng ?? ""),
      neLat: String(req.query.neLat ?? ""),
      neLng: String(req.query.neLng ?? ""),
      lang: String(req.query.lang ?? "fr"),
    }),
  );
  app.get("/api/public/establishments", zQuery(ListEstablishmentsQuery), (req, res, next) => {
    const auth = String(req.headers.authorization ?? "");
    const hasAuth = auth.toLowerCase().startsWith("bearer ");
    const personalized = String(req.query.personalized ?? "1") !== "0";
    if (hasAuth && personalized) return next();
    return establishmentSearchCache(req, res, next);
  }, _listPublicEstablishments);

  // SEO Landing pages
  app.get("/api/public/landing-slugs", _getPublicLandingSlugMap);
  app.get(
    "/api/public/landing/:slug",
    zParams(SlugParams),
    zQuery(PublicLandingPageQuery),
    cacheMiddleware(900, (req) =>
      buildCacheKey("landing", {
        slug: req.params.slug ?? "",
        cursor: String(req.query.cursor ?? ""),
        limit: String(req.query.limit ?? "12"),
        lang: String(req.query.lang ?? "fr"),
      }),
    ),
    _getPublicLandingPage,
  );

  // Direct booking by username (book.sam.ma/:username)
  app.get("/api/public/establishments/by-username/:username", zParams(UsernameParams), _getPublicEstablishmentByUsername);
  app.get("/api/public/establishments/:ref", zParams(EstablishmentRefParams), _getPublicEstablishment);

  // ── Home feed ─────────────────────────────────────────────────────────────
  app.get(
    "/api/public/home",
    zQuery(PublicHomeFeedQuery),
    cacheMiddleware(300, (req) => {
      const hourBucket = Math.floor(
        new Date().getHours() * 2 + (new Date().getMinutes() >= 30 ? 1 : 0),
      );
      const cityVal = String(req.query.city ?? "");
      const latRound = req.query.lat
        ? String(Math.round(parseFloat(String(req.query.lat)) * 10) / 10)
        : "";
      const lngRound = req.query.lng
        ? String(Math.round(parseFloat(String(req.query.lng)) * 10) / 10)
        : "";
      return buildCacheKey("homepage", {
        universe: String(req.query.universe ?? ""),
        city: cityVal,
        geo: latRound && lngRound ? `${latRound},${lngRound}` : "",
        hourBucket: String(hourBucket),
      });
    }),
    _getPublicHomeFeed,
  );

  app.get("/api/public/categories", zQuery(PublicCategoriesQuery), _getPublicCategories);
  app.get("/api/public/category-images", zQuery(PublicCategoryImagesQuery), _getPublicCategoryImages);

  // ── Search ────────────────────────────────────────────────────────────────
  app.get(
    "/api/public/search/autocomplete",
    zQuery(SearchAutocompleteQuery),
    cacheMiddleware(300, (req) =>
      buildCacheKey("autocomplete", {
        q: normalizeQuery(String(req.query.q ?? "")),
        universe: String(req.query.universe ?? ""),
        city: String(req.query.city ?? ""),
        lang: String(req.query.lang ?? "fr"),
      }),
    ),
    _searchAutocomplete,
  );
  app.get(
    "/api/public/search/popular",
    zQuery(PopularSearchesQuery),
    cacheMiddleware(600, (req) =>
      buildCacheKey("popular", {
        universe: String(req.query.universe ?? "all"),
        city: String(req.query.city ?? "all"),
        lang: String(req.query.lang ?? "fr"),
      }),
    ),
    _getPopularSearches,
  );
  app.post("/api/public/search/history", searchHistorySaveRateLimiter, zBody(SaveSearchHistorySchema), _saveSearchHistory);
  app.get("/api/public/search/history", searchHistoryReadRateLimiter, zQuery(GetSearchHistoryQuery), _getSearchHistoryList);
  app.delete("/api/public/search/history", searchHistoryReadRateLimiter, zQuery(DeleteSearchHistoryQuery), _deleteSearchHistory);
  app.patch("/api/public/search/history/:id/click", zParams(zIdParam), searchHistorySaveRateLimiter, zBody(TrackSearchClickSchema), _trackSearchClick);

  // ── Geocode ───────────────────────────────────────────────────────────────
  app.get("/api/public/geocode", _geocodePublic);

  // ── Billing ───────────────────────────────────────────────────────────────
  app.get("/api/public/billing/company-profile", _getPublicBillingCompanyProfile);

  // ── Platform settings (public read-only snapshot) ─────────────────────────
  app.get("/api/public/platform-settings", async (_req, res) => {
    try {
      const snapshot = await getPlatformSettingsSnapshot();
      res.json({ ok: true, snapshot });
    } catch (error) {
      logger.error({ err: error }, "platform settings error");
      res.json({
        ok: true,
        snapshot: {
          mode: "test",
          payments: {
            reservations_enabled: false,
            commissions_enabled: false,
            subscriptions_enabled: false,
            packs_purchases_enabled: false,
            payouts_enabled: false,
            guarantee_deposits_enabled: false,
            wallet_credits_enabled: false,
          },
          visibility: { orders_enabled: true },
          reservations: { free_enabled: true },
          branding: { name: "Sortir Au Maroc", short: "SAM", domain: "sam.ma" },
          footer: {
            social_instagram: "",
            social_tiktok: "",
            social_facebook: "",
            social_youtube: "",
            social_snapchat: "",
            social_linkedin: "",
          },
        },
      });
    }
  });

  // ── Media quotes & invoices (public, no account) ──────────────────────────
  app.get("/api/public/media/quotes/:token", zParams(TokenParams), _getPublicMediaQuote);
  app.get("/api/public/media/quotes/:token/pdf", zParams(TokenParams), _getPublicMediaQuotePdf);
  app.post("/api/public/media/quotes/:token/accept", zParams(TokenParams), _acceptPublicMediaQuote);
  app.get("/api/public/media/invoices/:token", zParams(TokenParams), _getPublicMediaInvoice);
  app.get("/api/public/media/invoices/:token/pdf", zParams(TokenParams), _getPublicMediaInvoicePdf);
  app.post("/api/public/media/invoices/:token/pay", zParams(TokenParams), _createPublicMediaInvoicePaymentSession);

  // ── Visit / campaign tracking ─────────────────────────────────────────────
  app.post("/api/public/establishments/:establishmentId/visit", zParams(EstablishmentIdParams), zBody(TrackEstablishmentVisitSchema), _trackPublicEstablishmentVisit);
  app.post("/api/public/campaigns/:campaignId/events", zParams(CampaignIdParams), zBody(TrackCampaignEventSchema), _trackPublicCampaignEvent);

  // ── Booking promo codes ───────────────────────────────────────────────────
  app.post("/api/public/booking/promo/validate", zBody(ValidateBookingPromoCodeSchema), _validateBookingPromoCode);

  // ── Password reset (no auth required) ─────────────────────────────────────
  app.post("/api/public/password/reset-link", zBody(RequestPasswordResetLinkSchema), _requestPublicPasswordResetLink);
  app.get("/api/public/password/validate-token", _validatePasswordResetToken);
  app.post("/api/public/password/complete-reset", zBody(CompletePasswordResetSchema), _completePasswordReset);

  // ── Welcome email ─────────────────────────────────────────────────────────
  app.post("/api/public/welcome-email", zBody(SendWelcomeEmailSchema), _sendWelcomeEmail);

  // ── Universes / home settings / countries ─────────────────────────────────
  app.get("/api/public/universes", _getPublicUniverses);
  app.get("/api/public/home-settings", _getPublicHomeSettings);
  app.get("/api/public/home-cities", zQuery(PublicHomeCitiesQuery), _getPublicHomeCities);
  app.get("/api/public/home-videos", _getPublicHomeVideos);
  app.get("/api/public/home-takeover", _getPublicHomeTakeover);
  app.get("/api/public/countries", _getPublicCountries);
  app.get("/api/public/detect-country", _detectUserCountry);
  app.get("/api/public/detect-city", _detectUserCity);

  // ── Content pages (public, no auth) ─────────────────────────────────────
  app.get("/api/public/content/pages/:slug", getPublicContentPage);

  // ── Consumer demo routes ──────────────────────────────────────────────────
  if (allowDemoRoutes) {
    app.post("/api/consumer/demo/ensure", _ensureConsumerDemoAccount);
  }

  // ── Consumer: me / account ────────────────────────────────────────────────
  app.get("/api/consumer/me", _getConsumerMe);
  app.post("/api/consumer/me/update", zBody(UpdateConsumerMeSchema), _updateConsumerMe);
  app.post("/api/consumer/account/deactivate", zBody(DeactivateConsumerAccountSchema), _deactivateConsumerAccount);
  app.post("/api/consumer/account/reactivate", _reactivateConsumerAccount);
  app.post("/api/consumer/account/delete", zBody(DeactivateConsumerAccountSchema), _deleteConsumerAccount);
  app.post("/api/consumer/account/export/request", zBody(RequestConsumerDataExportSchema), _requestConsumerDataExport);
  app.get("/api/consumer/account/export/download", _downloadConsumerDataExport);
  app.post("/api/consumer/account/password/reset", _requestConsumerPasswordReset);
  app.post("/api/consumer/account/password/reset-link", _requestConsumerPasswordResetLink);
  app.get("/api/consumer/account/password/validate-token", _validatePasswordResetToken);
  app.post("/api/consumer/account/password/complete-reset", zBody(CompletePasswordResetSchema), _completePasswordReset);
  app.post("/api/consumer/account/password/change", zBody(ChangeConsumerPasswordSchema), _changeConsumerPassword);

  // Consumer: trusted device management
  app.get("/api/consumer/account/trusted-devices", _listConsumerTrustedDevices);
  app.post("/api/consumer/account/trusted-devices/revoke-all", _revokeAllConsumerTrustedDevices);
  app.post("/api/consumer/account/trusted-devices/:deviceId/revoke", zParams(DeviceIdParams), _revokeConsumerTrustedDevice);

  // ── Consumer: reservations ────────────────────────────────────────────────
  app.post("/api/consumer/reservations", zBody(CreateConsumerReservationSchema), _createConsumerReservation);
  app.get("/api/consumer/reservations", _listConsumerReservations);
  app.get("/api/consumer/reservations/:id", zParams(ConsumerIdParams), _getConsumerReservation);
  app.get("/api/consumer/reservations/:id/invoice", zParams(ConsumerIdParams), _getConsumerReservationInvoice);
  app.get(
    "/api/consumer/reservations/:id/messages",
    zParams(ConsumerIdParams),
    messageReadRateLimiter,
    _listConsumerReservationMessages,
  );
  app.post(
    "/api/consumer/reservations/:id/messages",
    zParams(ConsumerIdParams),
    messageSendRateLimiter,
    zBody(SendConsumerReservationMessageSchema),
    _sendConsumerReservationMessage,
  );
  app.post("/api/consumer/reservations/:id/update", zParams(ConsumerIdParams), zBody(UpdateConsumerReservationSchema), _updateConsumerReservation);

  // ── Consumer: notifications ───────────────────────────────────────────────
  app.get("/api/consumer/notifications", _listConsumerNotifications);
  app.get("/api/consumer/notifications/unread-count", _getConsumerNotificationsUnreadCount);
  app.post("/api/consumer/notifications/mark-all-read", zBody(MarkAllNotificationsReadSchema), _markAllConsumerNotificationsRead);
  app.post("/api/consumer/notifications/:id/read", zParams(ConsumerIdParams), _markConsumerNotificationRead);
  app.delete("/api/consumer/notifications/:id", zParams(ConsumerIdParams), _deleteConsumerNotification);

  // ── Consumer: waitlist ────────────────────────────────────────────────────
  app.post("/api/consumer/establishments/:establishmentId/waitlist", zParams(EstablishmentIdParams), zBody(CreateConsumerWaitlistSchema), _createConsumerWaitlist);
  app.get("/api/consumer/waitlist", _listConsumerWaitlist);
  app.post("/api/consumer/waitlist/:id/cancel", zParams(ConsumerIdParams), _cancelConsumerWaitlist);
  app.post("/api/consumer/waitlist/:id/accept-offer", zParams(ConsumerIdParams), _acceptConsumerWaitlistOffer);
  app.post("/api/consumer/waitlist/:id/refuse-offer", zParams(ConsumerIdParams), _refuseConsumerWaitlistOffer);

  // ── Consumer: packs ───────────────────────────────────────────────────────
  app.post("/api/consumer/packs/checkout", zBody(CheckoutConsumerPackSchema), _checkoutConsumerPack);
  app.get("/api/consumer/packs/purchases", _listConsumerPackPurchases);
  app.get("/api/consumer/packs/purchases/:id/invoice", zParams(ConsumerIdParams), _getConsumerPackPurchaseInvoice);
  app.post("/api/consumer/packs/purchases/:id/confirm", zParams(ConsumerIdParams), _confirmConsumerPackPurchase);
  app.post("/api/consumer/packs/purchases/:id/hide", zParams(ConsumerIdParams), _hideConsumerPackPurchase);
}
