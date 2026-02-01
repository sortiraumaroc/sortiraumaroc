import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import { initSentry, captureException, sentryRequestHandler, sentryErrorHandler } from "./lib/sentry";
import {
  acceptConsumerWaitlistOffer,
  cancelConsumerWaitlist,
  checkoutConsumerPack,
  confirmConsumerPackPurchase,
  createConsumerReservation,
  createConsumerWaitlist,
  ensureConsumerDemoAccount,
  trackPublicEstablishmentVisit,
  trackPublicCampaignEvent,
  geocodePublic,
  getConsumerMe,
  updateConsumerMe,
  deactivateConsumerAccount,
  reactivateConsumerAccount,
  deleteConsumerAccount,
  requestConsumerDataExport,
  downloadConsumerDataExport,
  getConsumerReservation,
  getConsumerReservationInvoice,
  getConsumerPackPurchaseInvoice,
  getPublicSitemapXml,
  getPublicEstablishment,
  listPublicEstablishments,
  getPublicHomeFeed,
  getPublicCategoryImages,
  getPublicCategories,
  hideConsumerPackPurchase,
  listConsumerNotifications,
  getConsumerNotificationsUnreadCount,
  markConsumerNotificationRead,
  markAllConsumerNotificationsRead,
  listConsumerPackPurchases,
  listConsumerReservationMessages,
  listConsumerReservations,
  listConsumerWaitlist,
  refuseConsumerWaitlistOffer,
  sendConsumerReservationMessage,
  updateConsumerReservation,
  getPublicBillingCompanyProfile,
  getPublicMediaQuote,
  getPublicMediaQuotePdf,
  getPublicMediaInvoice,
  getPublicMediaInvoicePdf,
  createPublicMediaInvoicePaymentSession,
  acceptPublicMediaQuote,
  getPublicUniverses,
  getPublicHomeSettings,
  getPublicHomeCities,
} from "./routes/public";
import {
  trackEmailClick,
  trackEmailOpen,
  trackEmailUnsubscribe,
} from "./routes/emailTracking";
import {
  authenticateWithFirebase,
  checkFirebaseAuthStatus,
} from "./routes/firebaseAuth";
import {
  sendEmailVerificationCode,
  verifyEmailCode,
} from "./routes/emailVerification";
import {
  createAdminEmailCampaign,
  duplicateAdminEmailTemplate,
  getAdminEmailBranding,
  listAdminEmailCampaignRecipients,
  listAdminEmailCampaigns,
  listAdminEmailSends,
  listAdminEmailTemplates,
  previewAdminEmail,
  sendAdminEmailCampaignNow,
  updateAdminEmailBranding,
  upsertAdminEmailTemplate,
} from "./routes/adminEmails";
import {
  listNewsletterTemplates,
  getNewsletterTemplate,
  upsertNewsletterTemplate,
  duplicateNewsletterTemplate,
  deleteNewsletterTemplate,
  previewNewsletter,
  listNewsletterCampaigns,
  createNewsletterCampaign,
  sendNewsletterCampaign,
} from "./routes/adminNewsletter";
import {
  acceptAdminEstablishmentProfileChange,
  acceptAllAdminEstablishmentProfileUpdates,
  adminHealth,
  adminProductionCheck,
  approveModerationItem,
  createEstablishment,
  createProUser,
  getConsumerUser,
  recomputeConsumerUserReliability,
  getEstablishment,
  listAdminEstablishmentConversationMessages,
  listAdminEstablishmentConversations,
  listAdminEstablishmentOffers,
  listAdminEstablishmentPackBilling,
  listAdminEstablishmentQrLogs,
  listAdminEstablishmentReservations,
  getAdminImpactReport,
  listAdminEstablishmentPendingProfileUpdates,
  listAdminFinanceDiscrepancies,
  listAdminFinancePayouts,
  listAdminLogs,
  sendAdminTestEmail,
  listAdminWaitlist,
  listAdminSupportTicketMessages,
  listAdminSupportTickets,
  listAdminContentPages,
  listAdminContentPageBlocks,
  listAdminFaqArticles,
  listAdminCmsBlogArticles,
  listAdminCmsBlogAuthors,
  listAdminCmsBlogCategories,
  createAdminCmsBlogAuthor,
  updateAdminCmsBlogAuthor,
  listAdminCmsBlogArticleBlocks,
  listConsumerUserEvents,
  listConsumerUserPurchases,
  listConsumerUsers,
  listConsumerAccountActions,
  listEstablishments,
  listModerationQueue,
  listProUserMemberships,
  listProUsers,
  rejectAdminEstablishmentProfileChange,
  rejectAllAdminEstablishmentProfileUpdates,
  rejectModerationItem,
  setProUserMemberships,
  suspendProUser,
  bulkDeleteProUsers,
  regenerateProUserPassword,
  runAdminFinanceReconciliation,
  updateAdminEstablishmentReservation,
  updateAdminFinanceDiscrepancy,
  updateAdminFinancePayout,
  updateAdminSupportTicket,
  updateAdminContentPage,
  updateAdminFaqArticle,
  updateAdminCmsBlogArticle,
  deleteAdminCmsBlogArticle,
  replaceAdminContentPageBlocks,
  replaceAdminCmsBlogArticleBlocks,
  uploadAdminCmsBlogImage,
  uploadAdminCmsBlogDocument,
  getAdminCmsBlogPollStats,
  updateConsumerUserEvent,
  updateConsumerUserPurchase,
  updateConsumerUserStatus,
  updateEstablishmentStatus,
  updateEstablishmentFlags,
  getAdminSupportTicket,
  postAdminSupportTicketMessage,
  createAdminContentPage,
  createAdminFaqArticle,
  createAdminCmsBlogArticle,
  getPublicContentPage,
  listPublicFaqArticles,
  getAdminSettingsSnapshot,
  updateAdminBillingCompanyProfile,
  listAdminCities,
  createAdminCity,
  updateAdminCity,
  deleteAdminCity,
  listAdminCategories,
  createAdminCategory,
  updateAdminCategory,
  deleteAdminCategory,
  applyAdminUniverseCommission,
  getAdminFinanceRules,
  updateAdminFinanceRules,
  getAdminReservationRules,
  updateAdminReservationRules,
  listAdminFeatureFlags,
  updateAdminFeatureFlag,
  listPlatformSettingsHandler,
  getPlatformSettingsSnapshotHandler,
  updatePlatformSettingHandler,
  setPlatformModeHandler,
  invalidatePlatformSettingsCacheHandler,
  listAdminHomeCurationItems,
  createAdminHomeCurationItem,
  updateAdminHomeCurationItem,
  deleteAdminHomeCurationItem,
  listAdminUniverses,
  createAdminUniverse,
  updateAdminUniverse,
  reorderAdminUniverses,
  deleteAdminUniverse,
  uploadAdminUniverseImage,
  getAdminHomeSettings,
  updateAdminHomeSettings,
  uploadAdminHeroImage,
  deleteAdminHeroImage,
  listAdminHomeCities,
  createAdminHomeCity,
  updateAdminHomeCity,
  reorderAdminHomeCities,
  deleteAdminHomeCity,
  uploadAdminHomeCityImage,
  listAdminCategoryImages,
  createAdminCategoryImage,
  updateAdminCategoryImage,
  deleteAdminCategoryImage,
  uploadAdminCategoryImage,
  listAdminCategoriesLevel2,
  createAdminCategoryLevel2,
  updateAdminCategoryLevel2,
  deleteAdminCategoryLevel2,
  listAdminVisibilityOffers,
  createAdminVisibilityOffer,
  updateAdminVisibilityOffer,
  deleteAdminVisibilityOffer,
  listAdminVisibilityPromoCodes,
  createAdminVisibilityPromoCode,
  updateAdminVisibilityPromoCode,
  deleteAdminVisibilityPromoCode,
  listAdminConsumerPromoCodes,
  createAdminConsumerPromoCode,
  updateAdminConsumerPromoCode,
  deleteAdminConsumerPromoCode,
  listAdminVisibilityOrders,
  listAdminCommissionOverrides,
  createAdminCommissionOverride,
  updateAdminCommissionOverride,
  deleteAdminCommissionOverride,
  getAdminProTerms,
  updateAdminProTerms,
  listAdminPayoutRequests,
  updateAdminPayoutRequest,
  updateAdminVisibilityOrderStatus,
  updateAdminVisibilityOrderItemMeta,
  getAdminVisibilityInvoice,

  // PRO profiles (clients = PRO)
  listAdminProProfiles,
  getAdminProProfile,
  updateAdminProProfile,

  // SAM Media: Quotes & Invoices
  listAdminMediaQuotes,
  getAdminMediaQuote,
  createAdminMediaQuote,
  updateAdminMediaQuote,
  addAdminMediaQuoteItem,
  updateAdminMediaQuoteItem,
  deleteAdminMediaQuoteItem,
  createAdminMediaQuotePublicLink,
  downloadAdminMediaQuotePdf,
  downloadAdminMediaInvoicePdf,
  createAdminMediaInvoicePublicLink,
  sendAdminMediaQuoteEmail,
  markAdminMediaQuoteAccepted,
  markAdminMediaQuoteRejected,
  convertAdminMediaQuoteToInvoice,
  listAdminMediaInvoices,
  getAdminMediaInvoice,
  sendAdminMediaInvoiceEmail,
  markAdminMediaInvoicePaid,
  getAdminEstablishmentBankDetails,
  upsertAdminEstablishmentBankDetails,
  validateAdminEstablishmentBankDetails,
  listAdminEstablishmentBankDetailsHistory,
  uploadAdminEstablishmentBankDocument,
  listAdminEstablishmentBankDocuments,
  getAdminEstablishmentBookingPolicy,
  updateAdminEstablishmentBookingPolicy,
  resetAdminEstablishmentBookingPolicy,
} from "./routes/admin";

import {
  createAdminBlogArticle,
  getAdminFixedPage,
  getPublicBlogArticleBySlug,
  getPublicBlogAuthorBySlug,
  listPublicBlogArticles,
  listPublicBlogRelatedArticles,
  markPublicBlogArticleRead,
  votePublicBlogPoll,
  getPublicBlogPollResults,
  listAdminBlogArticles,
  listAdminBlogAuthors,
  listAdminBlogCategories,
  listAdminFixedPages,
  updateAdminBlogArticle,
  updateAdminFixedPage,
} from "./routes/mysqlContent";
import { adminLogin, adminLogout } from "./routes/adminAuth";
import { registerAdminAIRoutes } from "./routes/adminAI";
import { registerAdminImportExportRoutes } from "./routes/adminImportExport";
import { registerAdminDashboardRoutes } from "./routes/adminDashboard";
import { registerAdminUserManagementRoutes } from "./routes/adminUserManagement";
import { registerAdminAmazonSESRoutes } from "./routes/adminAmazonSES";
import { registerProAdsRoutes } from "./routes/proAds";
import { registerAdminAdsRoutes } from "./routes/adminAds";
import { registerPublicAdsRoutes } from "./routes/publicAds";
import {
  listSupportTickets,
  createSupportTicket,
  getSupportTicket,
  addSupportTicketMessage,
  updateSupportTicketStatus,
  getOrCreateChatSession,
  sendChatMessage,
  getChatMessages,
} from "./routes/support";
import {
  approveAdminMediaBrief,
  assignAdminDeliverablePartner,
  confirmProMediaCheckin,
  createAdminMediaCheckinToken,
  createAdminMediaScheduleSlot,
  generateAdminMediaBriefPdf,
  getAdminMediaFactoryJob,
  getPartnerMe,
  getPartnerMission,
  getProMediaJob,
  getPublicMediaCheckinInfo,
  listAdminMediaFactoryJobs,
  listAdminPartnerInvoiceRequests,
  listPartnerMissions,
  listProMediaJobs,
  publicMediaCheckin,
  requestPartnerInvoice,
  reviewAdminDeliverable,
  saveProMediaBriefDraft,
  selectProMediaScheduleSlot,
  submitProMediaBrief,
  updateAdminInvoiceRequest,
  updateAdminMediaFactoryJob,
  uploadPartnerDeliverableFile,
  updatePartnerProfile,
  uploadPartnerAvatar,
  deletePartnerAvatar,
  listAdminPartners,
  getAdminPartner,
  createAdminPartner,
  updateAdminPartner,
  updateAdminPartnerBilling,
  // Messaging
  listProMessageThreads,
  getProThreadMessages,
  sendProMessage,
  listPartnerMessageThreads,
  getPartnerThreadMessages,
  sendPartnerMessage,
  listAdminMessageThreads,
  getAdminThreadMessages,
  sendAdminMessage,
  closeAdminThread,
  reopenAdminThread,
  createAdminCommunicationLog,
  listAdminCommunicationLogs,
  // Polish Premium
  getProUnreadCount,
  getPartnerUnreadCount,
  // Blogger Portal
  listPartnerBloggerArticles,
  getPartnerBloggerArticle,
  createPartnerBloggerArticle,
  updatePartnerBloggerArticle,
  submitPartnerBloggerArticleForModeration,
  getPartnerBloggerArticlePaymentStatus,
  requestPartnerBloggerArticlePayment,
  getPartnerBloggerStats,
  getProNotifications,
  getPartnerNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  getAdminNotifications as getAdminMediaNotifications,
  // Mark thread as read
  markProThreadRead,
  markPartnerThreadRead,
  markAdminThreadRead,
  listQuickReplyTemplates,
  createQuickReplyTemplate,
  updateQuickReplyTemplate,
  deleteQuickReplyTemplate,
  getMessageReadReceipts,
  // Attachments
  getAttachmentUrl,
  getMessageAttachments,
  adminSendMessageWithAttachments,
  proSendMessageWithAttachments,
  partnerSendMessageWithAttachments,
} from "./routes/mediaFactory";
import {
  getAdminNotificationsUnreadCount,
  listAdminNotifications,
  markAdminNotificationRead,
  markAllAdminNotificationsRead,
} from "./routes/adminNotifications";
import {
  listAdminReviews,
  getAdminReview,
  approveReview,
  rejectReview,
  sendReviewToPro,
  listAdminReports,
  resolveReport,
  getReviewStats,
} from "./routes/adminReviews";
import {
  getReviewInvitation,
  submitReview,
  submitReport,
  listPublicEstablishmentReviews,
} from "./routes/reviews";
import {
  listProPendingReviews,
  respondToReview,
  addPublicResponse,
  listProPublishedReviews,
} from "./routes/proReviews";
import {
  cronSendReviewInvitations,
  cronAutoPublishReviews,
} from "./routes/reviewCron";
import { submitEstablishmentLead, submitProDemoRequest, leadsRateLimiter } from "./routes/leads";
import {
  listCollaborators,
  createCollaborator,
  updateCollaborator,
  deleteCollaborator,
  suspendCollaborator,
  reactivateCollaborator,
  resetCollaboratorPassword,
  listRoles,
  createRole,
  updateRole,
  deleteRole,
  collaboratorLogin,
  getMyProfile,
  updateMyProfile,
} from "./routes/adminCollaborators";
import {
  // PRO endpoints
  createProPrestataireDemande,
  listProPrestataireDemandes,
  listProPrestataires,
  createProPrestataire,
  getProPrestataire,
  updateProPrestataire,
  submitProPrestataireForValidation,
  listProPrestataireDocuments,
  uploadProPrestataireDocument,
  deleteProPrestataireDocument,
  listProPrestataireMessages,
  sendProPrestataireMessage,
  // Admin endpoints
  listAdminPrestataireDemandes,
  processAdminPrestataireDemande,
  listAdminPrestataires,
  getAdminPrestataire,
  createAdminPrestataire,
  updateAdminPrestataire,
  updateAdminPrestataireStatus,
  reviewAdminPrestataireDocument,
  getAdminPrestatairesDashboard,
  batchAdminPrestatairesAction,
  exportAdminPrestataires,
  listAdminPrestataireAuditLogs,
  listAdminPrestataireMessages,
  sendAdminPrestataireMessage,
} from "./routes/prestataires";
import { handlePaymentsWebhook } from "./routes/payments";
import { createLacaissePaySession, paymentRateLimiter } from "./routes/lacaissepay";
import { createGoogleWalletPass, createAppleWalletPass } from "./routes/wallet";
import {
  getTOTPSecret,
  generateTOTPCode,
  validateTOTPCode,
  regenerateTOTPSecret,
} from "./routes/totp";
import {
  sendH3ConfirmationEmails,
  confirmBookingByToken,
  autoCancelUnconfirmedReservations,
  getConfirmationRequestInfo,
} from "./bookingConfirmation";
import {
  createManualReservation,
  createProEstablishment,
  createProOnboardingRequest,
  createProInventoryCategory,
  createProInventoryItem,
  createProTeamUser,
  listProTeamMembers,
  updateProTeamMemberRole,
  deleteProTeamMember,
  updateProTeamMemberEmail,
  toggleProTeamMemberActive,
  resetProTeamMemberPassword,
  activateProOwnerMembership,
  listProCampaigns,
  createProCampaign,
  deleteProCampaign,
  listProEstablishmentProfileDrafts,
  listProEstablishmentProfileDraftChanges,
  deleteProInventoryCategory,
  deleteProInventoryItem,
  ensureProDemoAccount,
  getOrCreateProConversationForReservation,
  greenThumbProInventoryItem,
  listMyEstablishments,
  listMyMemberships,
  checkPasswordStatus,
  requestPasswordReset,
  changePassword,
  listProConversationMessages,
  listProConversations,
  listProInventory,
  createProReservationMessageTemplate,
  updateProReservationMessageTemplate,
  listProReservationMessageTemplates,
  listProOffers,
  listProInvoices,
  getProInvoiceFinanceInvoice,
  listProNotifications,
  markProNotificationRead,
  markAllProNotificationsRead,
  upsertProSlots,
  deleteProSlot,
  createProPack,
  updateProPack,
  deleteProPack,
  getProBookingPolicy,
  updateProBookingPolicy,
  listProConsumerPromoCodes,
  createProConsumerPromoCode,
  updateProConsumerPromoCode,
  deleteProConsumerPromoCode,
  getProDashboardAlerts,
  getProDashboardMetrics,
  getProImpactReport,
  listProPackBilling,
  listProQrScanLogs,
  listProReservations,
  listProWaitlist,
  scanProQrCode,
  sendProWaitlistOffer,
  seedDemoProInventory,
  seedFakeReservations,
  sendProConversationMessage,
  listProClientHistory,
  markProMessagesRead,
  getProMessageReadReceipts,
  getProAutoReplySettings,
  updateProAutoReplySettings,
  closeProWaitlistEntry,
  submitEstablishmentProfileUpdate,
  updateProInventoryCategory,
  updateProInventoryItem,
  updateProReservation,
  listProVisibilityOffers,
  validateProVisibilityPromoCode,
  checkoutProVisibilityCart,
  listProVisibilityOrders,
  getProVisibilityOrderInvoice,
  confirmProVisibilityOrder,
  getProFinanceDashboard,
  acceptProTerms,
  getProBankDetails,
  listProPayoutWindows,
  createProPayoutRequest,
  listProPayoutRequests,
  uploadProInventoryImage,
  deleteProInventoryImage,
  listProCustomLabels,
  createProCustomLabel,
  updateProCustomLabel,
  deleteProCustomLabel,
  reorderProInventoryItems,
  getProPromoAnalytics,
  listProPromoTemplates,
  createProPromoTemplate,
  updateProPromoTemplate,
  deleteProPromoTemplate,
  createPromoFromTemplate,
  exportProPromoCodesCsv,
  getReservationHistory,
  logReservationAction,
  listEstablishmentReservationHistory,
} from "./routes/pro";

export function createServer() {
  const app = express();

  app.set("trust proxy", 1);
  app.disable("x-powered-by");

  // Sentry request handler must be the first middleware
  app.use(sentryRequestHandler());

  // Security headers (lightweight, no extra deps)
  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader(
      "Permissions-Policy",
      "camera=(), microphone=(), geolocation=(self)",
    );

    // Only enable HSTS when we are sure we're behind HTTPS (production).
    if (process.env.NODE_ENV === "production") {
      res.setHeader(
        "Strict-Transport-Security",
        "max-age=31536000; includeSubDomains; preload",
      );
    }

    // Helps mitigate clickjacking; keep disabled in dev/preview where the app may be iframe-embedded.
    if (
      process.env.NODE_ENV === "production" &&
      !req.path.startsWith("/api/")
    ) {
      res.setHeader("X-Frame-Options", "SAMEORIGIN");
    }

    // Content-Security-Policy - Critical for XSS prevention
    // Only apply to HTML pages, not API responses
    if (!req.path.startsWith("/api/")) {
      const cspDirectives = [
        // Only allow resources from same origin by default
        "default-src 'self'",

        // Scripts: allow self, inline scripts (for React hydration), and trusted CDNs
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.builder.io https://www.gstatic.com https://www.google.com https://apis.google.com https://*.firebaseapp.com https://*.googleapis.com",

        // Styles: allow self, inline styles (for Tailwind), and Google Fonts
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",

        // Images: allow self, data URIs, and trusted image sources
        "img-src 'self' data: blob: https: http:",

        // Fonts: allow self and Google Fonts
        "font-src 'self' https://fonts.gstatic.com data:",

        // Connect: allow API calls to own server and trusted services
        "connect-src 'self' https://*.supabase.co https://*.supabase.in wss://*.supabase.co wss://*.supabase.in https://*.googleapis.com https://www.google.com https://apis.google.com https://*.firebaseio.com https://*.firebaseapp.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://cdn.builder.io https://*.lacaissepay.ma",

        // Frames: allow Google reCAPTCHA and Firebase Auth
        "frame-src 'self' https://www.google.com https://www.gstatic.com https://*.firebaseapp.com",

        // Object/embed: disallow plugins
        "object-src 'none'",

        // Base URI: restrict to same origin
        "base-uri 'self'",

        // Form actions: restrict to same origin
        "form-action 'self'",

        // Upgrade insecure requests in production
        ...(process.env.NODE_ENV === "production" ? ["upgrade-insecure-requests"] : []),
      ];

      res.setHeader("Content-Security-Policy", cspDirectives.join("; "));
    }

    // X-XSS-Protection (legacy, but still useful for older browsers)
    res.setHeader("X-XSS-Protection", "1; mode=block");

    next();
  });

  // Middleware
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
  // Express 5 (path-to-regexp v8) doesn't accept "*" as a route pattern.
  app.options(/.*/, cors(corsOptions));

  // RAW BODY ROUTES - Must be registered BEFORE express.json() middleware
  // These routes need raw binary data, not parsed JSON
  app.post(
    "/api/admin/category-images/upload",
    express.raw({
      type: ["image/jpeg", "image/png", "image/webp"],
      limit: "2mb",
    }),
    uploadAdminCategoryImage,
  );

  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true, limit: "2mb" }));

  const allowDemoRoutes =
    process.env.NODE_ENV !== "production" &&
    String(process.env.ALLOW_DEMO_ROUTES ?? "").toLowerCase() === "true";

  // Legacy favicon support: some clients still request /favicon.ico regardless of <link rel="icon">.
  // We cannot always ship a binary .ico in this environment, so we serve it via redirect.
  app.get(["/favicon.ico"], (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=86400");
    res.redirect(
      302,
      "https://cdn.builder.io/api/v1/image/assets%2F9d79e075af8c480ea94841fd41e63e5c%2Fc16969ff26074ebca70eb03a15c1fd0b?format=ico&width=64",
    );
  });

  // Example API routes
  app.get("/sitemap.xml", getPublicSitemapXml);

  app.get("/api/ping", (_req, res) => {
    const ping = process.env.PING_MESSAGE ?? "ping";
    res.json({ message: ping });
  });

  // Public consumer API (read-only establishment data + booking creation)
  registerPublicAdsRoutes(app);
  app.get("/api/public/establishments", listPublicEstablishments);
  app.get("/api/public/establishments/:ref", getPublicEstablishment);
  app.get("/api/public/establishments/:id/reviews", listPublicEstablishmentReviews);
  app.get("/api/public/home", getPublicHomeFeed);
  app.get("/api/public/categories", getPublicCategories);
  app.get("/api/public/category-images", getPublicCategoryImages);
  app.get("/api/public/content/pages/:slug", getPublicContentPage);
  app.get("/api/public/faq", listPublicFaqArticles);
  app.get("/api/public/blog", listPublicBlogArticles);
  // Keep /author before /:slug to avoid routing conflicts
  app.get("/api/public/blog/author/:slug", getPublicBlogAuthorBySlug);
  app.get("/api/public/blog/:slug", getPublicBlogArticleBySlug);
  app.get("/api/public/blog/:slug/related", listPublicBlogRelatedArticles);
  app.post("/api/public/blog/:slug/read", markPublicBlogArticleRead);
  app.post("/api/public/blog/:slug/polls/:pollId/vote", votePublicBlogPoll);
  app.post(
    "/api/public/blog/:slug/polls/:pollId/results",
    getPublicBlogPollResults,
  );
  app.get("/api/public/geocode", geocodePublic);
  app.get(
    "/api/public/billing/company-profile",
    getPublicBillingCompanyProfile,
  );

  // Platform settings (public read-only snapshot for feature checks)
  app.get("/api/public/platform-settings", async (_req, res) => {
    try {
      const { getPlatformSettingsSnapshot } = await import("./platformSettings");
      const snapshot = await getPlatformSettingsSnapshot();
      res.json({ ok: true, snapshot });
    } catch (error) {
      console.error("[Public] Platform settings error:", error);
      // Return safe defaults on error
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
          branding: { name: "Sortir Au Maroc", short: "SAM", domain: "sortiraumaroc.ma" },
        },
      });
    }
  });

  // Public — SAM Media quotes (no account)
  app.get("/api/public/media/quotes/:token", getPublicMediaQuote);
  app.get("/api/public/media/quotes/:token/pdf", getPublicMediaQuotePdf);
  app.post("/api/public/media/quotes/:token/accept", acceptPublicMediaQuote);

  // Public — SAM Media invoices (no account)
  app.get("/api/public/media/invoices/:token", getPublicMediaInvoice);
  app.get("/api/public/media/invoices/:token/pdf", getPublicMediaInvoicePdf);
  app.post(
    "/api/public/media/invoices/:token/pay",
    createPublicMediaInvoicePaymentSession,
  );

  app.post(
    "/api/public/establishments/:establishmentId/visit",
    trackPublicEstablishmentVisit,
  );
  app.post(
    "/api/public/campaigns/:campaignId/events",
    trackPublicCampaignEvent,
  );
  app.get("/api/public/email/open", trackEmailOpen);
  app.get("/api/public/email/click", trackEmailClick);
  app.get("/api/public/email/unsubscribe", trackEmailUnsubscribe);
  // Routes publiques avec rate limiting
  app.post("/api/leads/establishment", leadsRateLimiter, submitEstablishmentLead);
  app.post("/api/leads/pro-demo", leadsRateLimiter, submitProDemoRequest);
  app.post("/api/payments/webhook", handlePaymentsWebhook);
  app.post("/api/payments/lacaissepay/session", paymentRateLimiter, createLacaissePaySession);

  // Wallet integration (Apple Wallet & Google Wallet)
  app.post("/api/wallet/apple", createAppleWalletPass);
  app.post("/api/wallet/google", createGoogleWalletPass);

  // TOTP Dynamic QR Code routes
  app.get("/api/totp/secret/:reservationId", getTOTPSecret);
  app.get("/api/totp/code/:reservationId", generateTOTPCode);
  app.post("/api/totp/validate", validateTOTPCode);
  app.post("/api/totp/regenerate/:reservationId", regenerateTOTPSecret);

  // ==========================================================================
  // BOOKING CONFIRMATION H-3 SYSTEM (Ramadan no-show prevention)
  // ==========================================================================

  // Public: Get confirmation request info (for confirmation page UI)
  app.get("/api/booking/confirm/:token/info", async (req, res) => {
    try {
      const { token } = req.params;
      const info = await getConfirmationRequestInfo(token);
      res.json(info);
    } catch (err) {
      console.error("[Booking Confirm] Error getting info:", err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  });

  // Public: Confirm booking by token (user clicks link in email)
  app.post("/api/booking/confirm/:token", async (req, res) => {
    try {
      const { token } = req.params;
      const result = await confirmBookingByToken(token);
      res.json(result);
    } catch (err) {
      console.error("[Booking Confirm] Error confirming:", err);
      res.status(500).json({ success: false, error: "Erreur serveur" });
    }
  });

  // Admin/Cron: Trigger H-3 confirmation emails
  // Called by cron job every 5-10 minutes
  app.post("/api/admin/cron/h3-confirmation-emails", async (req, res) => {
    // Verify admin key for security
    const adminKey = req.headers["x-admin-key"];
    if (adminKey !== process.env.ADMIN_API_KEY) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      const result = await sendH3ConfirmationEmails();
      res.json(result);
    } catch (err) {
      console.error("[H3 Cron] Error:", err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  });

  // Admin/Cron: Trigger auto-cancellation of unconfirmed reservations
  // Called by cron job every 5 minutes
  app.post("/api/admin/cron/auto-cancel-unconfirmed", async (req, res) => {
    // Verify admin key for security
    const adminKey = req.headers["x-admin-key"];
    if (adminKey !== process.env.ADMIN_API_KEY) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      const result = await autoCancelUnconfirmedReservations();
      res.json(result);
    } catch (err) {
      console.error("[Auto Cancel Cron] Error:", err);
      res.status(500).json({ error: "Erreur serveur" });
    }
  });

  // Admin/Cron: Send review invitations after customer visits
  // Called every 30 minutes
  app.post("/api/admin/cron/review-invitations", cronSendReviewInvitations);

  // Admin/Cron: Auto-publish reviews after 24h without pro response
  // Called every 5 minutes
  app.post("/api/admin/cron/review-auto-publish", cronAutoPublishReviews);

  if (allowDemoRoutes) {
    app.post("/api/consumer/demo/ensure", ensureConsumerDemoAccount);
  }

  // Firebase phone authentication
  app.post("/api/consumer/auth/firebase", authenticateWithFirebase);
  app.get("/api/consumer/auth/firebase/status", checkFirebaseAuthStatus);

  // Email verification (for signup)
  app.post("/api/consumer/verify-email/send", sendEmailVerificationCode);
  app.post("/api/consumer/verify-email/verify", verifyEmailCode);

  app.get("/api/consumer/me", getConsumerMe);
  app.post("/api/consumer/me/update", updateConsumerMe);

  app.post("/api/consumer/account/deactivate", deactivateConsumerAccount);
  app.post("/api/consumer/account/reactivate", reactivateConsumerAccount);
  app.post("/api/consumer/account/delete", deleteConsumerAccount);
  app.post("/api/consumer/account/export/request", requestConsumerDataExport);
  app.get("/api/consumer/account/export/download", downloadConsumerDataExport);

  app.post("/api/consumer/reservations", createConsumerReservation);
  app.get("/api/consumer/reservations", listConsumerReservations);

  app.get("/api/consumer/notifications", listConsumerNotifications);
  app.get(
    "/api/consumer/notifications/unread-count",
    getConsumerNotificationsUnreadCount,
  );
  app.post(
    "/api/consumer/notifications/mark-all-read",
    markAllConsumerNotificationsRead,
  );
  app.post(
    "/api/consumer/notifications/:id/read",
    markConsumerNotificationRead,
  );

  // Consumer waitlist
  app.post(
    "/api/consumer/establishments/:establishmentId/waitlist",
    createConsumerWaitlist,
  );
  app.get("/api/consumer/waitlist", listConsumerWaitlist);
  app.post("/api/consumer/waitlist/:id/cancel", cancelConsumerWaitlist);
  app.post(
    "/api/consumer/waitlist/:id/accept-offer",
    acceptConsumerWaitlistOffer,
  );
  app.post(
    "/api/consumer/waitlist/:id/refuse-offer",
    refuseConsumerWaitlistOffer,
  );

  // Consumer packs
  app.post("/api/consumer/packs/checkout", checkoutConsumerPack);
  app.get("/api/consumer/packs/purchases", listConsumerPackPurchases);
  app.get(
    "/api/consumer/packs/purchases/:id/invoice",
    getConsumerPackPurchaseInvoice,
  );
  app.post(
    "/api/consumer/packs/purchases/:id/confirm",
    confirmConsumerPackPurchase,
  );
  app.post("/api/consumer/packs/purchases/:id/hide", hideConsumerPackPurchase);

  app.get("/api/consumer/reservations/:id", getConsumerReservation);
  app.get(
    "/api/consumer/reservations/:id/invoice",
    getConsumerReservationInvoice,
  );
  app.get(
    "/api/consumer/reservations/:id/messages",
    listConsumerReservationMessages,
  );
  app.post(
    "/api/consumer/reservations/:id/messages",
    sendConsumerReservationMessage,
  );
  app.post("/api/consumer/reservations/:id/update", updateConsumerReservation);

  // Consumer reviews & reports
  app.get("/api/consumer/reviews/invitation/:token", getReviewInvitation);
  app.post("/api/consumer/reviews", submitReview);
  app.post("/api/consumer/reports", submitReport);

  // Support tickets (consumer/pro)
  app.get("/api/support/tickets", listSupportTickets);
  app.post("/api/support/tickets", createSupportTicket);
  app.get("/api/support/tickets/:id", getSupportTicket);
  app.post("/api/support/tickets/:id/messages", addSupportTicketMessage);
  app.patch("/api/support/tickets/:id", updateSupportTicketStatus);

  // Support chat (consumer/pro)
  app.post("/api/support/chat/session", getOrCreateChatSession);
  app.post("/api/support/chat/messages", sendChatMessage);
  app.get("/api/support/chat/:sessionId/messages", getChatMessages);

  app.post("/api/admin/auth/login", adminLogin);
  app.post("/api/admin/auth/logout", adminLogout);

  // AI Assistant routes
  registerAdminAIRoutes(app);

  // Import/Export routes
  registerAdminImportExportRoutes(app);

  // Dashboard stats routes
  registerAdminDashboardRoutes(app);

  // User management & marketing routes
  registerAdminUserManagementRoutes(app);
  registerAdminAmazonSESRoutes(app);

  // Ads system routes
  registerProAdsRoutes(app);
  registerAdminAdsRoutes(app);

  app.get("/api/admin/health", adminHealth);
  app.get("/api/admin/production-check", adminProductionCheck);
  app.get("/api/admin/impact", getAdminImpactReport);
  app.get("/api/admin/logs", listAdminLogs);
  app.post("/api/admin/emails/test", sendAdminTestEmail);
  app.get("/api/admin/emails/templates", listAdminEmailTemplates);
  app.post("/api/admin/emails/templates/upsert", upsertAdminEmailTemplate);
  app.post(
    "/api/admin/emails/templates/:id/duplicate",
    duplicateAdminEmailTemplate,
  );
  app.get("/api/admin/emails/branding", getAdminEmailBranding);
  app.post("/api/admin/emails/branding/update", updateAdminEmailBranding);
  app.post("/api/admin/emails/preview", previewAdminEmail);
  app.get("/api/admin/emails/sends", listAdminEmailSends);
  app.get("/api/admin/emails/campaigns", listAdminEmailCampaigns);
  app.post("/api/admin/emails/campaigns", createAdminEmailCampaign);
  app.post("/api/admin/emails/campaigns/:id/send", sendAdminEmailCampaignNow);
  app.get(
    "/api/admin/emails/campaigns/:id/recipients",
    listAdminEmailCampaignRecipients,
  );

  // Newsletter Templates & Campaigns
  app.get("/api/admin/newsletter/templates", listNewsletterTemplates);
  app.get("/api/admin/newsletter/templates/:id", getNewsletterTemplate);
  app.post("/api/admin/newsletter/templates/upsert", upsertNewsletterTemplate);
  app.post("/api/admin/newsletter/templates/:id/duplicate", duplicateNewsletterTemplate);
  app.delete("/api/admin/newsletter/templates/:id", deleteNewsletterTemplate);
  app.post("/api/admin/newsletter/preview", previewNewsletter);
  app.get("/api/admin/newsletter/campaigns", listNewsletterCampaigns);
  app.post("/api/admin/newsletter/campaigns", createNewsletterCampaign);
  app.post("/api/admin/newsletter/campaigns/:id/send", sendNewsletterCampaign);

  app.get("/api/admin/waitlist", listAdminWaitlist);

  app.get("/api/admin/notifications", listAdminNotifications);
  app.get(
    "/api/admin/notifications/unread-count",
    getAdminNotificationsUnreadCount,
  );
  app.post("/api/admin/notifications/:id/read", markAdminNotificationRead);
  app.post(
    "/api/admin/notifications/mark-all-read",
    markAllAdminNotificationsRead,
  );

  // Alias routes: some browser extensions / blockers aggressively block URLs containing "notifications".
  // Keep both paths supported.
  app.get("/api/admin/alerts", listAdminNotifications);
  app.get("/api/admin/alerts/unread-count", getAdminNotificationsUnreadCount);
  app.post("/api/admin/alerts/:id/read", markAdminNotificationRead);
  app.post("/api/admin/alerts/mark-all-read", markAllAdminNotificationsRead);

  // PARTNERS (Media Factory)
  const partnerAvatarUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 },
  });
  app.get("/api/partners/me", getPartnerMe);
  app.post("/api/partners/me/profile", updatePartnerProfile);
  app.post(
    "/api/partners/me/avatar",
    partnerAvatarUpload.single("avatar"),
    uploadPartnerAvatar,
  );
  app.delete("/api/partners/me/avatar", deletePartnerAvatar);
  app.get("/api/partners/missions", listPartnerMissions);
  app.get("/api/partners/missions/:jobId", getPartnerMission);
  app.post(
    "/api/partners/deliverables/:deliverableId/upload",
    express.raw({ type: () => true, limit: "30mb" }),
    uploadPartnerDeliverableFile,
  );
  app.post(
    "/api/partners/missions/:jobId/invoice-request",
    requestPartnerInvoice,
  );

  // PARTNER Messaging
  app.get("/api/partners/messages/threads", listPartnerMessageThreads);
  app.get("/api/partners/messages/threads/:threadId", getPartnerThreadMessages);
  app.post("/api/partners/messages/threads/:threadId", sendPartnerMessage);
  app.post(
    "/api/partners/messages/threads/:threadId/with-attachments",
    partnerSendMessageWithAttachments,
  );
  app.post(
    "/api/partners/messages/threads/:threadId/read",
    markPartnerThreadRead,
  );
  // PARTNER Unread count & Notifications
  app.get("/api/partners/media/messages/unread-count", getPartnerUnreadCount);
  app.get("/api/partners/media/notifications", getPartnerNotifications);
  app.post("/api/partners/media/notifications/:id/read", markNotificationRead);
  app.post(
    "/api/partners/media/notifications/read-all",
    markAllNotificationsRead,
  );

  // PARTNER Blogger Portal
  app.get("/api/partner/blogger/articles", listPartnerBloggerArticles);
  app.get("/api/partner/blogger/articles/:id", getPartnerBloggerArticle);
  app.post("/api/partner/blogger/articles", createPartnerBloggerArticle);
  app.post("/api/partner/blogger/articles/:id", updatePartnerBloggerArticle);
  app.post("/api/partner/blogger/articles/:id/submit", submitPartnerBloggerArticleForModeration);
  app.get("/api/partner/blogger/articles/:id/payment-status", getPartnerBloggerArticlePaymentStatus);
  app.post("/api/partner/blogger/articles/:id/request-payment", requestPartnerBloggerArticlePayment);
  app.get("/api/partner/blogger/stats", getPartnerBloggerStats);

  // Paramètres (superadmin)
  app.get("/api/admin/settings/snapshot", getAdminSettingsSnapshot);
  app.post(
    "/api/admin/settings/billing-company-profile/update",
    updateAdminBillingCompanyProfile,
  );

  app.get("/api/admin/settings/cities", listAdminCities);
  app.post("/api/admin/settings/cities", createAdminCity);
  app.post("/api/admin/settings/cities/:id/update", updateAdminCity);
  app.post("/api/admin/settings/cities/:id/delete", deleteAdminCity);

  app.get("/api/admin/settings/categories", listAdminCategories);
  app.post("/api/admin/settings/categories", createAdminCategory);
  app.post("/api/admin/settings/categories/:id/update", updateAdminCategory);
  app.post("/api/admin/settings/categories/:id/delete", deleteAdminCategory);
  app.post(
    "/api/admin/settings/categories/apply-universe-commission",
    applyAdminUniverseCommission,
  );

  app.get("/api/admin/settings/finance-rules", getAdminFinanceRules);
  app.post("/api/admin/settings/finance-rules/update", updateAdminFinanceRules);

  app.get("/api/admin/settings/reservation-rules", getAdminReservationRules);
  app.post(
    "/api/admin/settings/reservation-rules/update",
    updateAdminReservationRules,
  );

  app.get("/api/admin/settings/feature-flags", listAdminFeatureFlags);
  app.post(
    "/api/admin/settings/feature-flags/:key/update",
    updateAdminFeatureFlag,
  );

  // Platform settings (Superadmin only)
  app.get("/api/admin/settings/platform", listPlatformSettingsHandler);
  app.get("/api/admin/settings/platform/snapshot", getPlatformSettingsSnapshotHandler);
  app.post("/api/admin/settings/platform/:key/update", updatePlatformSettingHandler);
  app.post("/api/admin/settings/platform/set-mode", setPlatformModeHandler);
  app.post("/api/admin/settings/platform/invalidate-cache", invalidatePlatformSettingsCacheHandler);

  // Homepage curation
  app.get("/api/admin/home-curation", listAdminHomeCurationItems);
  app.post("/api/admin/home-curation", createAdminHomeCurationItem);
  app.post("/api/admin/home-curation/:id/update", updateAdminHomeCurationItem);
  app.post("/api/admin/home-curation/:id/delete", deleteAdminHomeCurationItem);

  // Universes management
  app.get("/api/admin/universes", listAdminUniverses);
  app.post("/api/admin/universes", createAdminUniverse);
  app.post("/api/admin/universes/:id/update", updateAdminUniverse);
  app.post("/api/admin/universes/reorder", reorderAdminUniverses);
  app.post("/api/admin/universes/:id/delete", deleteAdminUniverse);
  app.post("/api/admin/universes/upload-image", uploadAdminUniverseImage);

  // Home settings (hero background, etc.)
  app.get("/api/admin/home-settings", getAdminHomeSettings);
  app.post("/api/admin/home-settings", updateAdminHomeSettings);
  app.post("/api/admin/home-settings/hero-image", uploadAdminHeroImage);
  app.post("/api/admin/home-settings/hero-image/delete", deleteAdminHeroImage);

  // Home cities management
  app.get("/api/admin/home-cities", listAdminHomeCities);
  app.post("/api/admin/home-cities", createAdminHomeCity);
  app.post("/api/admin/home-cities/:id/update", updateAdminHomeCity);
  app.post("/api/admin/home-cities/reorder", reorderAdminHomeCities);
  app.post("/api/admin/home-cities/:id/delete", deleteAdminHomeCity);
  app.post("/api/admin/home-cities/:id/image", uploadAdminHomeCityImage);

  // Public universes & home settings
  app.get("/api/public/universes", getPublicUniverses);
  app.get("/api/public/home-settings", getPublicHomeSettings);
  app.get("/api/public/home-cities", getPublicHomeCities);

  // Category images management (subcategories - level 3)
  // NOTE: Upload route is registered earlier (before express.json middleware) to receive raw binary data
  app.get("/api/admin/category-images", listAdminCategoryImages);
  app.post("/api/admin/category-images", createAdminCategoryImage);
  app.post("/api/admin/category-images/:id/update", updateAdminCategoryImage);
  app.post("/api/admin/category-images/:id/delete", deleteAdminCategoryImage);

  // Categories management (level 2 - between universe and subcategory)
  app.get("/api/admin/categories-level2", listAdminCategoriesLevel2);
  app.post("/api/admin/categories-level2", createAdminCategoryLevel2);
  app.post("/api/admin/categories-level2/:id/update", updateAdminCategoryLevel2);
  app.post("/api/admin/categories-level2/:id/delete", deleteAdminCategoryLevel2);

  // Support (inbox)
  app.get("/api/admin/support/tickets", listAdminSupportTickets);
  app.get("/api/admin/support/tickets/:id", getAdminSupportTicket);
  app.get(
    "/api/admin/support/tickets/:id/messages",
    listAdminSupportTicketMessages,
  );
  app.post("/api/admin/support/tickets/:id/update", updateAdminSupportTicket);
  app.post(
    "/api/admin/support/tickets/:id/messages",
    postAdminSupportTicketMessage,
  );

  // Content (CMS)
  app.get("/api/admin/content/pages", listAdminContentPages);
  app.post("/api/admin/content/pages", createAdminContentPage);
  app.post("/api/admin/content/pages/:id/update", updateAdminContentPage);
  app.get("/api/admin/content/pages/:id/blocks", listAdminContentPageBlocks);
  app.post(
    "/api/admin/content/pages/:id/blocks/replace",
    replaceAdminContentPageBlocks,
  );

  app.get("/api/admin/content/faq", listAdminFaqArticles);
  app.post("/api/admin/content/faq", createAdminFaqArticle);
  app.post("/api/admin/content/faq/:id/update", updateAdminFaqArticle);

  app.get("/api/admin/content/blog", listAdminCmsBlogArticles);
  app.get("/api/admin/content/blog/authors", listAdminCmsBlogAuthors);
  app.post("/api/admin/content/blog/authors", createAdminCmsBlogAuthor);
  app.post(
    "/api/admin/content/blog/authors/:id/update",
    updateAdminCmsBlogAuthor,
  );
  app.get("/api/admin/content/blog/categories", listAdminCmsBlogCategories);

  app.post("/api/admin/content/blog", createAdminCmsBlogArticle);
  app.post("/api/admin/content/blog/:id/update", updateAdminCmsBlogArticle);
  app.delete("/api/admin/content/blog/:id", deleteAdminCmsBlogArticle);
  app.get("/api/admin/content/blog/:id/blocks", listAdminCmsBlogArticleBlocks);
  app.get("/api/admin/content/blog/:id/polls/stats", getAdminCmsBlogPollStats);
  app.post(
    "/api/admin/content/blog/:id/blocks/replace",
    replaceAdminCmsBlogArticleBlocks,
  );

  // CMS media (blog images)
  app.post(
    "/api/admin/content/blog/media/images/upload",
    express.raw({
      type: ["image/jpeg", "image/png", "image/webp"],
      limit: "3mb",
    }),
    uploadAdminCmsBlogImage,
  );

  // CMS media (blog documents)
  app.post(
    "/api/admin/content/blog/media/documents/upload",
    express.raw({ type: "application/pdf", limit: "12mb" }),
    uploadAdminCmsBlogDocument,
  );

  // MODE A (MySQL schema): fixed pages + blog (demo persistence)
  app.get("/api/admin/mysql/content/pages", listAdminFixedPages);
  app.get("/api/admin/mysql/content/pages/:key", getAdminFixedPage);
  app.post("/api/admin/mysql/content/pages/:key/update", updateAdminFixedPage);

  app.get("/api/admin/mysql/blog/categories", listAdminBlogCategories);
  app.get("/api/admin/mysql/blog/authors", listAdminBlogAuthors);
  app.get("/api/admin/mysql/blog/articles", listAdminBlogArticles);
  app.post("/api/admin/mysql/blog/articles", createAdminBlogArticle);
  app.post("/api/admin/mysql/blog/articles/:id/update", updateAdminBlogArticle);

  // Finance (ledger/escrow reconciliation)
  app.get("/api/admin/finance/discrepancies", listAdminFinanceDiscrepancies);
  app.post(
    "/api/admin/finance/discrepancies/:id/update",
    updateAdminFinanceDiscrepancy,
  );
  app.post("/api/admin/finance/reconcile/run", runAdminFinanceReconciliation);

  // Finance (payout operations)
  app.get("/api/admin/finance/payouts", listAdminFinancePayouts);
  app.post("/api/admin/finance/payouts/:id/update", updateAdminFinancePayout);

  // Finance (commission overrides)
  app.get(
    "/api/admin/finance/commission-overrides",
    listAdminCommissionOverrides,
  );
  app.post(
    "/api/admin/finance/commission-overrides/create",
    createAdminCommissionOverride,
  );
  app.post(
    "/api/admin/finance/commission-overrides/:establishmentId/update",
    updateAdminCommissionOverride,
  );
  app.post(
    "/api/admin/finance/commission-overrides/:establishmentId/delete",
    deleteAdminCommissionOverride,
  );

  // Finance (PRO terms)
  app.get("/api/admin/pro-terms", getAdminProTerms);
  app.post("/api/admin/pro-terms/update", updateAdminProTerms);

  // Finance (payout requests)
  app.get("/api/admin/finance/payout-requests", listAdminPayoutRequests);
  app.post(
    "/api/admin/finance/payout-requests/:id/update",
    updateAdminPayoutRequest,
  );

  app.get("/api/admin/moderation", listModerationQueue);
  app.post("/api/admin/moderation/:id/approve", approveModerationItem);
  app.post("/api/admin/moderation/:id/reject", rejectModerationItem);

  // Reviews & Reports moderation
  app.get("/api/admin/reviews", listAdminReviews);
  app.get("/api/admin/reviews/stats", getReviewStats);
  app.get("/api/admin/reviews/:id", getAdminReview);
  app.post("/api/admin/reviews/:id/approve", approveReview);
  app.post("/api/admin/reviews/:id/reject", rejectReview);
  app.post("/api/admin/reviews/:id/send-to-pro", sendReviewToPro);
  app.get("/api/admin/reports", listAdminReports);
  app.post("/api/admin/reports/:id/resolve", resolveReport);
  app.get("/api/admin/establishments", listEstablishments);
  app.post("/api/admin/establishments", createEstablishment);
  app.get("/api/admin/establishments/:id", getEstablishment);
  app.post("/api/admin/establishments/:id/status", updateEstablishmentStatus);
  app.post("/api/admin/establishments/:id/flags", updateEstablishmentFlags);

  // PRO bank details (RIB) — Superadmin-only
  app.get(
    "/api/admin/establishments/:id/bank-details",
    getAdminEstablishmentBankDetails,
  );
  app.post(
    "/api/admin/establishments/:id/bank-details/upsert",
    upsertAdminEstablishmentBankDetails,
  );
  app.post(
    "/api/admin/establishments/:id/bank-details/validate",
    validateAdminEstablishmentBankDetails,
  );
  app.get(
    "/api/admin/establishments/:id/bank-details/history",
    listAdminEstablishmentBankDetailsHistory,
  );
  app.get(
    "/api/admin/establishments/:id/bank-details/documents",
    listAdminEstablishmentBankDocuments,
  );
  app.post(
    "/api/admin/establishments/:id/bank-details/documents/upload",
    express.raw({ type: "application/pdf", limit: "12mb" }),
    uploadAdminEstablishmentBankDocument,
  );

  // Booking policies (per-establishment) — Superadmin only
  app.get(
    "/api/admin/establishments/:id/booking-policy",
    getAdminEstablishmentBookingPolicy,
  );
  app.post(
    "/api/admin/establishments/:id/booking-policy/update",
    updateAdminEstablishmentBookingPolicy,
  );
  app.post(
    "/api/admin/establishments/:id/booking-policy/reset",
    resetAdminEstablishmentBookingPolicy,
  );

  // Establishment profile moderation (per-field change-set review)
  app.get(
    "/api/admin/establishments/:id/profile-updates/pending",
    listAdminEstablishmentPendingProfileUpdates,
  );
  app.post(
    "/api/admin/establishments/:id/profile-updates/:draftId/changes/:changeId/accept",
    acceptAdminEstablishmentProfileChange,
  );
  app.post(
    "/api/admin/establishments/:id/profile-updates/:draftId/changes/:changeId/reject",
    rejectAdminEstablishmentProfileChange,
  );
  app.post(
    "/api/admin/establishments/:id/profile-updates/:draftId/accept-all",
    acceptAllAdminEstablishmentProfileUpdates,
  );
  app.post(
    "/api/admin/establishments/:id/profile-updates/:draftId/reject-all",
    rejectAllAdminEstablishmentProfileUpdates,
  );

  app.get(
    "/api/admin/establishments/:id/reservations",
    listAdminEstablishmentReservations,
  );
  app.post(
    "/api/admin/establishments/:id/reservations/:reservationId/update",
    updateAdminEstablishmentReservation,
  );
  app.get("/api/admin/establishments/:id/offers", listAdminEstablishmentOffers);
  app.get(
    "/api/admin/establishments/:id/billing/packs",
    listAdminEstablishmentPackBilling,
  );

  // Visibilité (SAM Media)
  app.get("/api/admin/visibility/offers", listAdminVisibilityOffers);
  app.post("/api/admin/visibility/offers", createAdminVisibilityOffer);
  app.post(
    "/api/admin/visibility/offers/:id/update",
    updateAdminVisibilityOffer,
  );
  app.post(
    "/api/admin/visibility/offers/:id/delete",
    deleteAdminVisibilityOffer,
  );

  app.get("/api/admin/visibility/promo-codes", listAdminVisibilityPromoCodes);
  app.post("/api/admin/visibility/promo-codes", createAdminVisibilityPromoCode);
  app.post(
    "/api/admin/visibility/promo-codes/:id/update",
    updateAdminVisibilityPromoCode,
  );
  app.post(
    "/api/admin/visibility/promo-codes/:id/delete",
    deleteAdminVisibilityPromoCode,
  );

  // Codes promo USERS (packs offerts / remises)
  app.get("/api/admin/consumer/promo-codes", listAdminConsumerPromoCodes);
  app.post("/api/admin/consumer/promo-codes", createAdminConsumerPromoCode);
  app.post(
    "/api/admin/consumer/promo-codes/:id/update",
    updateAdminConsumerPromoCode,
  );
  app.post(
    "/api/admin/consumer/promo-codes/:id/delete",
    deleteAdminConsumerPromoCode,
  );

  app.get("/api/admin/visibility/orders", listAdminVisibilityOrders);
  app.post(
    "/api/admin/visibility/orders/:id/update-status",
    updateAdminVisibilityOrderStatus,
  );
  app.post(
    "/api/admin/visibility/orders/:orderId/items/:itemId/update-meta",
    updateAdminVisibilityOrderItemMeta,
  );
  app.get(
    "/api/admin/visibility/invoices/:invoiceId",
    getAdminVisibilityInvoice,
  );

  // PRO profiles (clients = PRO)
  app.get("/api/admin/pro-profiles", listAdminProProfiles);
  app.get("/api/admin/pro-profiles/:id", getAdminProProfile);
  app.post("/api/admin/pro-profiles/:id/update", updateAdminProProfile);

  // SAM Media — Quotes & Invoices

  app.get("/api/admin/media/quotes", listAdminMediaQuotes);
  app.post("/api/admin/media/quotes", createAdminMediaQuote);
  app.get("/api/admin/media/quotes/:id", getAdminMediaQuote);
  app.get("/api/admin/media/quotes/:id/pdf", downloadAdminMediaQuotePdf);
  app.post("/api/admin/media/quotes/:id/update", updateAdminMediaQuote);
  app.post("/api/admin/media/quotes/:id/items", addAdminMediaQuoteItem);
  app.post(
    "/api/admin/media/quotes/:id/items/:itemId/update",
    updateAdminMediaQuoteItem,
  );
  app.post(
    "/api/admin/media/quotes/:id/items/:itemId/delete",
    deleteAdminMediaQuoteItem,
  );
  app.post(
    "/api/admin/media/quotes/:id/public-link",
    createAdminMediaQuotePublicLink,
  );
  app.post("/api/admin/media/quotes/:id/send-email", sendAdminMediaQuoteEmail);
  app.post(
    "/api/admin/media/quotes/:id/mark-accepted",
    markAdminMediaQuoteAccepted,
  );
  app.post(
    "/api/admin/media/quotes/:id/mark-rejected",
    markAdminMediaQuoteRejected,
  );
  app.post(
    "/api/admin/media/quotes/:id/convert-to-invoice",
    convertAdminMediaQuoteToInvoice,
  );

  app.get("/api/admin/media/invoices", listAdminMediaInvoices);
  app.get("/api/admin/media/invoices/:id", getAdminMediaInvoice);
  app.get("/api/admin/media/invoices/:id/pdf", downloadAdminMediaInvoicePdf);
  app.post(
    "/api/admin/media/invoices/:id/public-link",
    createAdminMediaInvoicePublicLink,
  );
  app.post(
    "/api/admin/media/invoices/:id/send-email",
    sendAdminMediaInvoiceEmail,
  );
  app.post(
    "/api/admin/media/invoices/:id/mark-paid",
    markAdminMediaInvoicePaid,
  );

  // MEDIA FACTORY (Production)
  app.get("/api/admin/production/jobs", listAdminMediaFactoryJobs);
  app.get("/api/admin/production/jobs/:id", getAdminMediaFactoryJob);
  app.post("/api/admin/production/jobs/:id/update", updateAdminMediaFactoryJob);
  app.post(
    "/api/admin/production/jobs/:id/brief/approve",
    approveAdminMediaBrief,
  );
  app.post(
    "/api/admin/production/jobs/:id/schedule-slots",
    createAdminMediaScheduleSlot,
  );
  app.post(
    "/api/admin/production/deliverables/:id/assign-partner",
    assignAdminDeliverablePartner,
  );
  app.post(
    "/api/admin/production/deliverables/:id/review",
    reviewAdminDeliverable,
  );
  app.post(
    "/api/admin/production/jobs/:id/checkin-token",
    createAdminMediaCheckinToken,
  );
  app.get(
    "/api/admin/production/jobs/:id/brief.pdf",
    generateAdminMediaBriefPdf,
  );

  // MEDIA FACTORY Compta (Invoice management)
  app.get(
    "/api/admin/production/invoice-requests",
    listAdminPartnerInvoiceRequests,
  );
  app.post(
    "/api/admin/production/invoice-requests/:id",
    updateAdminInvoiceRequest,
  );

  // ADMIN Partner Management
  app.get("/api/admin/partners", listAdminPartners);
  app.get("/api/admin/partners/:id", getAdminPartner);
  app.post("/api/admin/partners", createAdminPartner);
  app.post("/api/admin/partners/:id", updateAdminPartner);
  app.post("/api/admin/partners/:id/billing", updateAdminPartnerBilling);

  // Public media check-in (no auth required)
  app.get("/api/media/checkin/:token", getPublicMediaCheckinInfo);
  app.post("/api/media/checkin", publicMediaCheckin);

  // MEDIA FACTORY Messaging (Admin)
  app.get("/api/admin/production/messages/threads", listAdminMessageThreads);
  app.get(
    "/api/admin/production/messages/threads/:threadId",
    getAdminThreadMessages,
  );
  app.post(
    "/api/admin/production/messages/threads/:threadId",
    sendAdminMessage,
  );
  app.post(
    "/api/admin/production/messages/threads/:threadId/read",
    markAdminThreadRead,
  );
  app.post(
    "/api/admin/production/messages/threads/:threadId/close",
    closeAdminThread,
  );
  app.post(
    "/api/admin/production/messages/threads/:threadId/reopen",
    reopenAdminThread,
  );
  app.get(
    "/api/admin/production/communication-logs",
    listAdminCommunicationLogs,
  );
  app.post(
    "/api/admin/production/jobs/:jobId/communication-logs",
    createAdminCommunicationLog,
  );

  // MEDIA FACTORY Quick Reply Templates
  app.get("/api/admin/production/quick-replies", listQuickReplyTemplates);
  app.post("/api/admin/production/quick-replies", createQuickReplyTemplate);
  app.post("/api/admin/production/quick-replies/:id", updateQuickReplyTemplate);
  app.delete(
    "/api/admin/production/quick-replies/:id",
    deleteQuickReplyTemplate,
  );
  // Read receipts
  app.get(
    "/api/admin/production/messages/:messageId/reads",
    getMessageReadReceipts,
  );
  // Attachments
  app.get("/api/admin/production/attachments/:id/url", getAttachmentUrl);
  app.get(
    "/api/admin/production/messages/:messageId/attachments",
    getMessageAttachments,
  );
  app.post(
    "/api/admin/production/messages/threads/:threadId/with-attachments",
    adminSendMessageWithAttachments,
  );
  // Admin Media Notifications
  app.get("/api/admin/production/notifications", getAdminMediaNotifications);

  app.get(
    "/api/admin/establishments/:id/qr/logs",
    listAdminEstablishmentQrLogs,
  );
  app.get(
    "/api/admin/establishments/:id/conversations",
    listAdminEstablishmentConversations,
  );
  app.get(
    "/api/admin/establishments/:id/conversations/:conversationId/messages",
    listAdminEstablishmentConversationMessages,
  );

  app.get("/api/admin/pros/users", listProUsers);
  app.post("/api/admin/pros/users", createProUser);
  app.get("/api/admin/pros/users/:id/memberships", listProUserMemberships);
  app.post("/api/admin/pros/users/:id/memberships", setProUserMemberships);
  app.post("/api/admin/pros/users/:id/regenerate-password", regenerateProUserPassword);
  app.post("/api/admin/pros/users/:id/suspend", suspendProUser);
  app.post("/api/admin/pros/users/bulk-delete", bulkDeleteProUsers);

  app.get("/api/admin/users", listConsumerUsers);
  app.get("/api/admin/users/account-actions", listConsumerAccountActions);
  app.get("/api/admin/users/:id", getConsumerUser);
  app.post(
    "/api/admin/users/:id/reliability/recompute",
    recomputeConsumerUserReliability,
  );
  app.get("/api/admin/users/:id/events", listConsumerUserEvents);
  app.post("/api/admin/users/:id/status", updateConsumerUserStatus);
  app.post("/api/admin/users/:id/events/:eventId", updateConsumerUserEvent);
  app.get("/api/admin/users/:id/purchases", listConsumerUserPurchases);
  app.post(
    "/api/admin/users/:id/purchases/:purchaseId",
    updateConsumerUserPurchase,
  );

  // Admin Collaborators (team management)
  app.get("/api/admin/collaborators", listCollaborators);
  app.post("/api/admin/collaborators", createCollaborator);
  app.post("/api/admin/collaborators/:id/update", updateCollaborator);
  app.post("/api/admin/collaborators/:id/delete", deleteCollaborator);
  app.post("/api/admin/collaborators/:id/suspend", suspendCollaborator);
  app.post("/api/admin/collaborators/:id/reactivate", reactivateCollaborator);
  app.post("/api/admin/collaborators/:id/reset-password", resetCollaboratorPassword);

  // Current user profile (self-service)
  app.get("/api/admin/me", getMyProfile);
  app.post("/api/admin/me", updateMyProfile);

  // Admin Roles (permission management)
  app.get("/api/admin/roles", listRoles);
  app.post("/api/admin/roles", createRole);
  app.post("/api/admin/roles/:id/update", updateRole);
  app.post("/api/admin/roles/:id/delete", deleteRole);

  // Collaborator login (separate from main admin login)
  app.post("/api/admin/collaborators/login", collaboratorLogin);

  app.get("/api/pro/my/establishments", listMyEstablishments);
  app.get("/api/pro/my/memberships", listMyMemberships);

  // Pro user account management
  app.get("/api/pro/me/check-password-status", checkPasswordStatus);
  app.post("/api/pro/me/request-password-reset", requestPasswordReset);
  app.post("/api/pro/me/change-password", changePassword);

  app.post("/api/pro/establishments", createProEstablishment);
  app.post("/api/pro/onboarding-request", createProOnboardingRequest);

  app.post(
    "/api/pro/establishments/:establishmentId/profile-update",
    submitEstablishmentProfileUpdate,
  );
  app.get(
    "/api/pro/establishments/:establishmentId/profile-drafts",
    listProEstablishmentProfileDrafts,
  );
  app.get(
    "/api/pro/establishments/:establishmentId/profile-drafts/:draftId/changes",
    listProEstablishmentProfileDraftChanges,
  );

  app.get(
    "/api/pro/establishments/:establishmentId/reservations",
    listProReservations,
  );
  app.get("/api/pro/establishments/:establishmentId/waitlist", listProWaitlist);
  app.post("/api/pro/waitlist/:id/send-offer", sendProWaitlistOffer);
  app.post("/api/pro/waitlist/:id/close", closeProWaitlistEntry);
  app.post(
    "/api/pro/establishments/:establishmentId/reservations/:reservationId/update",
    updateProReservation,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/reservations/manual",
    createManualReservation,
  );

  if (allowDemoRoutes) {
    app.post(
      "/api/pro/establishments/:establishmentId/reservations/seed",
      seedFakeReservations,
    );
  }

  app.get(
    "/api/pro/establishments/:establishmentId/reservation-message-templates",
    listProReservationMessageTemplates,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/reservation-message-templates",
    createProReservationMessageTemplate,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/reservation-message-templates/:templateId/update",
    updateProReservationMessageTemplate,
  );

  app.post("/api/pro/establishments/:establishmentId/qr/scan", scanProQrCode);
  app.get(
    "/api/pro/establishments/:establishmentId/qr/logs",
    listProQrScanLogs,
  );

  app.get("/api/pro/establishments/:establishmentId/offers", listProOffers);

  // Bank details (read-only)
  app.get(
    "/api/pro/establishments/:establishmentId/bank-details",
    getProBankDetails,
  );

  // Finance (dashboard, payout workflows)
  app.get(
    "/api/pro/establishments/:establishmentId/finance/dashboard",
    getProFinanceDashboard,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/finance/terms/accept",
    acceptProTerms,
  );
  app.get(
    "/api/pro/establishments/:establishmentId/finance/windows",
    listProPayoutWindows,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/finance/payout-request",
    createProPayoutRequest,
  );
  app.get(
    "/api/pro/establishments/:establishmentId/finance/payout-requests",
    listProPayoutRequests,
  );

  // Visibilité (SAM Media)
  app.get(
    "/api/pro/establishments/:establishmentId/visibility/offers",
    listProVisibilityOffers,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/visibility/promo/validate",
    validateProVisibilityPromoCode,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/visibility/cart/checkout",
    checkoutProVisibilityCart,
  );
  app.get(
    "/api/pro/establishments/:establishmentId/visibility/orders",
    listProVisibilityOrders,
  );
  app.get(
    "/api/pro/establishments/:establishmentId/visibility/orders/:orderId/invoice",
    getProVisibilityOrderInvoice,
  );
  if (allowDemoRoutes) {
    app.post(
      "/api/pro/establishments/:establishmentId/visibility/orders/:orderId/confirm",
      confirmProVisibilityOrder,
    );
  }

  // MEDIA FACTORY (PRO)
  app.get(
    "/api/pro/establishments/:establishmentId/media/jobs",
    listProMediaJobs,
  );
  app.get(
    "/api/pro/establishments/:establishmentId/media/jobs/:jobId",
    getProMediaJob,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/media/jobs/:jobId/brief/save",
    saveProMediaBriefDraft,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/media/jobs/:jobId/brief/submit",
    submitProMediaBrief,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/media/jobs/:jobId/schedule/select",
    selectProMediaScheduleSlot,
  );
  app.post("/api/pro/media/checkin/confirm", confirmProMediaCheckin);

  // MEDIA FACTORY Messaging (PRO)
  app.get(
    "/api/pro/establishments/:establishmentId/media/messages/threads",
    listProMessageThreads,
  );
  app.get(
    "/api/pro/establishments/:establishmentId/media/messages/threads/:threadId",
    getProThreadMessages,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/media/messages/threads/:threadId",
    sendProMessage,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/media/messages/threads/:threadId/with-attachments",
    proSendMessageWithAttachments,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/media/messages/threads/:threadId/read",
    markProThreadRead,
  );
  // PRO Unread count & Notifications
  app.get(
    "/api/pro/establishments/:establishmentId/media/messages/unread-count",
    getProUnreadCount,
  );
  app.get("/api/pro/media/notifications", getProNotifications);
  app.post("/api/pro/media/notifications/:id/read", markNotificationRead);
  app.post("/api/pro/media/notifications/read-all", markAllNotificationsRead);

  // Pro reviews management
  app.get("/api/pro/reviews/pending", listProPendingReviews);
  app.get("/api/pro/reviews/published", listProPublishedReviews);
  app.post("/api/pro/reviews/:id/respond", respondToReview);
  app.post("/api/pro/reviews/:id/public-response", addPublicResponse);

  app.post(
    "/api/pro/establishments/:establishmentId/slots/upsert",
    upsertProSlots,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/slots/:slotId/delete",
    deleteProSlot,
  );
  app.post("/api/pro/establishments/:establishmentId/packs", createProPack);
  app.patch(
    "/api/pro/establishments/:establishmentId/packs/:packId/update",
    updateProPack,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/packs/:packId/delete",
    deleteProPack,
  );
  app.get(
    "/api/pro/establishments/:establishmentId/booking-policies",
    getProBookingPolicy,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/booking-policies/update",
    updateProBookingPolicy,
  );

  // Codes promo USERS (packs offerts / remises) — scope: cet établissement
  app.get(
    "/api/pro/establishments/:establishmentId/consumer/promo-codes",
    listProConsumerPromoCodes,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/consumer/promo-codes",
    createProConsumerPromoCode,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/consumer/promo-codes/:id/update",
    updateProConsumerPromoCode,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/consumer/promo-codes/:id/delete",
    deleteProConsumerPromoCode,
  );

  // Promo Analytics
  app.get(
    "/api/pro/establishments/:establishmentId/promo-analytics",
    getProPromoAnalytics,
  );

  // Promo CSV Export
  app.get(
    "/api/pro/establishments/:establishmentId/promo-codes/export-csv",
    exportProPromoCodesCsv,
  );

  // Promo Templates
  app.get(
    "/api/pro/establishments/:establishmentId/promo-templates",
    listProPromoTemplates,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/promo-templates",
    createProPromoTemplate,
  );
  app.patch(
    "/api/pro/establishments/:establishmentId/promo-templates/:templateId",
    updateProPromoTemplate,
  );
  app.delete(
    "/api/pro/establishments/:establishmentId/promo-templates/:templateId",
    deleteProPromoTemplate,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/promo-templates/:templateId/create-promo",
    createPromoFromTemplate,
  );

  // Reservation History / Timeline
  app.get(
    "/api/pro/establishments/:establishmentId/reservations/:reservationId/history",
    getReservationHistory,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/reservations/:reservationId/history",
    logReservationAction,
  );
  app.get(
    "/api/pro/establishments/:establishmentId/reservation-history",
    listEstablishmentReservationHistory,
  );

  app.get(
    "/api/pro/establishments/:establishmentId/dashboard/metrics",
    getProDashboardMetrics,
  );
  app.get(
    "/api/pro/establishments/:establishmentId/dashboard/alerts",
    getProDashboardAlerts,
  );

  app.get(
    "/api/pro/establishments/:establishmentId/impact",
    getProImpactReport,
  );

  app.get(
    "/api/pro/establishments/:establishmentId/notifications",
    listProNotifications,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/notifications/:notificationId/read",
    markProNotificationRead,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/notifications/mark-all-read",
    markAllProNotificationsRead,
  );
  app.get("/api/pro/establishments/:establishmentId/invoices", listProInvoices);
  app.get(
    "/api/pro/establishments/:establishmentId/invoices/:invoiceId/finance-invoice",
    getProInvoiceFinanceInvoice,
  );

  app.get(
    "/api/pro/establishments/:establishmentId/inventory",
    listProInventory,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/inventory/categories",
    createProInventoryCategory,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/inventory/categories/:categoryId",
    updateProInventoryCategory,
  );
  app.delete(
    "/api/pro/establishments/:establishmentId/inventory/categories/:categoryId",
    deleteProInventoryCategory,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/inventory/items",
    createProInventoryItem,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/inventory/items/:itemId",
    updateProInventoryItem,
  );
  app.delete(
    "/api/pro/establishments/:establishmentId/inventory/items/:itemId",
    deleteProInventoryItem,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/inventory/items/:itemId/green-thumb",
    greenThumbProInventoryItem,
  );

  // Inventory image upload
  const inventoryImageUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  });
  app.post(
    "/api/pro/establishments/:establishmentId/inventory/images/upload",
    inventoryImageUpload.single("image"),
    uploadProInventoryImage,
  );
  app.delete(
    "/api/pro/establishments/:establishmentId/inventory/images",
    deleteProInventoryImage,
  );

  // Custom labels
  app.get(
    "/api/pro/establishments/:establishmentId/inventory/labels",
    listProCustomLabels,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/inventory/labels",
    createProCustomLabel,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/inventory/labels/:labelId",
    updateProCustomLabel,
  );
  app.delete(
    "/api/pro/establishments/:establishmentId/inventory/labels/:labelId",
    deleteProCustomLabel,
  );

  // Reorder items
  app.post(
    "/api/pro/establishments/:establishmentId/inventory/items/reorder",
    reorderProInventoryItems,
  );

  if (allowDemoRoutes) {
    app.post(
      "/api/pro/establishments/:establishmentId/inventory/demo-seed",
      seedDemoProInventory,
    );
  }

  app.get(
    "/api/pro/establishments/:establishmentId/billing/packs",
    listProPackBilling,
  );

  app.get(
    "/api/pro/establishments/:establishmentId/conversations",
    listProConversations,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/conversations/for-reservation",
    getOrCreateProConversationForReservation,
  );
  app.get(
    "/api/pro/establishments/:establishmentId/conversations/:conversationId/messages",
    listProConversationMessages,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/conversations/:conversationId/messages",
    sendProConversationMessage,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/conversations/:conversationId/mark-read",
    markProMessagesRead,
  );
  app.get(
    "/api/pro/establishments/:establishmentId/conversations/:conversationId/read-receipts",
    getProMessageReadReceipts,
  );
  app.get(
    "/api/pro/establishments/:establishmentId/clients/:clientUserId/history",
    listProClientHistory,
  );
  app.get(
    "/api/pro/establishments/:establishmentId/auto-reply",
    getProAutoReplySettings,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/auto-reply",
    updateProAutoReplySettings,
  );

  app.post(
    "/api/pro/establishments/:establishmentId/team/create-user",
    createProTeamUser,
  );
  app.get("/api/pro/establishments/:establishmentId/team", listProTeamMembers);
  app.post(
    "/api/pro/establishments/:establishmentId/team/:membershipId/update",
    updateProTeamMemberRole,
  );
  app.delete(
    "/api/pro/establishments/:establishmentId/team/:membershipId",
    deleteProTeamMember,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/team/:membershipId/email",
    updateProTeamMemberEmail,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/team/:membershipId/toggle-active",
    toggleProTeamMemberActive,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/team/:membershipId/reset-password",
    resetProTeamMemberPassword,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/activate-owner",
    activateProOwnerMembership,
  );

  app.get(
    "/api/pro/establishments/:establishmentId/campaigns",
    listProCampaigns,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/campaigns",
    createProCampaign,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/campaigns/:campaignId/delete",
    deleteProCampaign,
  );
  if (allowDemoRoutes) {
    app.post("/api/pro/demo/ensure", ensureProDemoAccount);
  }

  // ==========================================================================
  // PRESTATAIRES MODULE
  // ==========================================================================

  // PRO: Demandes de prestataires
  app.post("/api/pro/prestataires/demandes", createProPrestataireDemande);
  app.get("/api/pro/prestataires/demandes", listProPrestataireDemandes);
  app.get(
    "/api/pro/establishments/:establishmentId/prestataires",
    listProPrestataires,
  );

  // PRO: Gestion complète des prestataires
  app.post("/api/pro/prestataires", createProPrestataire);
  app.get("/api/pro/prestataires/:id", getProPrestataire);
  app.post("/api/pro/prestataires/:id/update", updateProPrestataire);
  app.post(
    "/api/pro/prestataires/:id/submit",
    submitProPrestataireForValidation,
  );
  app.get("/api/pro/prestataires/:id/documents", listProPrestataireDocuments);
  app.post("/api/pro/prestataires/:id/documents", uploadProPrestataireDocument);
  app.post(
    "/api/pro/prestataires/:id/documents/:docId/delete",
    deleteProPrestataireDocument,
  );
  app.get("/api/pro/prestataires/:id/messages", listProPrestataireMessages);
  app.post("/api/pro/prestataires/:id/messages", sendProPrestataireMessage);

  // ADMIN: Gestion des demandes
  app.get("/api/admin/prestataires/demandes", listAdminPrestataireDemandes);
  app.post(
    "/api/admin/prestataires/demandes/:id/process",
    processAdminPrestataireDemande,
  );

  // ADMIN: Gestion des prestataires
  app.get("/api/admin/prestataires", listAdminPrestataires);
  app.get("/api/admin/prestataires/dashboard", getAdminPrestatairesDashboard);
  app.get("/api/admin/prestataires/export", exportAdminPrestataires);
  app.get("/api/admin/prestataires/audit-logs", listAdminPrestataireAuditLogs);
  app.post("/api/admin/prestataires", createAdminPrestataire);
  app.post(
    "/api/admin/prestataires/batch-action",
    batchAdminPrestatairesAction,
  );
  app.get("/api/admin/prestataires/:id", getAdminPrestataire);
  app.post("/api/admin/prestataires/:id/update", updateAdminPrestataire);
  app.post("/api/admin/prestataires/:id/status", updateAdminPrestataireStatus);
  app.post(
    "/api/admin/prestataires/:id/documents/:docId/review",
    reviewAdminPrestataireDocument,
  );
  app.get("/api/admin/prestataires/:id/messages", listAdminPrestataireMessages);
  app.post("/api/admin/prestataires/:id/messages", sendAdminPrestataireMessage);

  // Sentry error handler must be before other error handlers
  app.use(sentryErrorHandler());

  // Final error handler: make sure unexpected exceptions don't surface as opaque network errors.
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      if (res.headersSent) return next(err);

      const message = err instanceof Error ? err.message : "Unknown error";
      // Avoid leaking sensitive info; still log for server-side debugging.
      console.error("[api] unhandled error:", message);

      // Also capture to Sentry
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
  console.error("[Sentry] Initialization failed:", err);
});
