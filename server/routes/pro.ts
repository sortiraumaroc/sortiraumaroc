/**
 * pro.ts — Hub module for pro routes.
 *
 * All handler logic lives in sub-modules. This file:
 * 1. Re-exports every handler so existing patterns still work
 * 2. Provides `registerProCoreRoutes(app)` to wire Express routes
 */

import type { Express } from "express";
import multer from "multer";
import {
  messageSendRateLimiter,
  messageReadRateLimiter,
  messageAttachmentRateLimiter,
  createRateLimiter,
} from "../middleware/rateLimiter";
import { zBody, zParams, zIdParam } from "../lib/validate";

// ── Zod schemas for request body validation ─────────────────────────────────
import {
  CreateManualReservationSchema,
  CreateReservationMessageTemplateSchema,
  UpdateReservationMessageTemplateSchema,
  UpdateProReservationSchema,
  ScanProQrCodeSchema,
  CheckinByUserIdSchema,
  SendProWaitlistOfferSchema,
  CloseProWaitlistEntrySchema,
  LogReservationActionSchema,
  SeedFakeReservationsSchema,
  EstablishmentIdParams,
  EstablishmentIdDraftIdParams,
  EstablishmentIdReservationIdParams,
  EstablishmentIdTemplateIdParams,
} from "../schemas/proReservations";
import {
  RequestPasswordResetSchema,
  ChangePasswordSchema,
  CreateProEstablishmentSchema,
  CreateProOnboardingRequestSchema,
  SaveOnboardingWizardProgressSchema,
  SubmitEstablishmentProfileUpdateSchema,
} from "../schemas/proAccount";
import {
  CreateInventoryCategorySchema,
  UpdateInventoryCategorySchema,
  CreateInventoryItemSchema,
  UpdateInventoryItemSchema,
  EstablishmentIdCategoryIdParams,
  EstablishmentIdItemIdParams,
  EstablishmentIdLabelIdParams,
} from "../schemas/proInventory";
import {
  UpsertProSlotsSchema,
  UpdateProPackSchema,
  UpdateProBookingPolicySchema,
  CreateProConsumerPromoCodeSchema,
  UpdateProConsumerPromoCodeSchema,
  DeleteProInventoryImageSchema,
  CreateProCustomLabelSchema,
  UpdateProCustomLabelSchema,
  ReorderProInventoryItemsSchema,
  CreateProPromoTemplateSchema,
  UpdateProPromoTemplateSchema,
  CreatePromoFromTemplateSchema,
  EstablishmentIdSlotIdParams,
  EstablishmentIdPackIdParams,
  EstablishmentIdOrderIdParams,
  EstablishmentIdPromoCodeIdParams,
  EstablishmentIdPromoTemplateIdParams,
} from "../schemas/proOffers";
import {
  SendProConversationMessageSchema,
  GetOrCreateProConversationForReservationSchema,
  UpdateProAutoReplySettingsSchema,
  ValidateProVisibilityPromoCodeSchema,
  CheckoutProVisibilityCartSchema,
  AcceptProTermsSchema,
  CreateProPayoutRequestSchema,
  CreateProTeamUserSchema,
  UpdateProTeamMemberRoleSchema,
  UpdateProTeamMemberEmailSchema,
  ToggleProTeamMemberActiveSchema,
  ToggleProOnlineStatusSchema,
  CreateProCampaignSchema,
  ToggleGoogleReviewsSchema,
  UpdateProNotificationPreferencesSchema,
  UpdateEstablishmentPermissionsSchema,
  EstablishmentIdConversationIdParams,
  EstablishmentIdClientUserIdParams,
  EstablishmentIdMembershipIdParams,
  EstablishmentIdNotificationIdParams,
  EstablishmentIdCampaignIdParams,
} from "../schemas/proMisc";
import { EstablishmentIdInvoiceIdParams } from "../schemas/proNotifs";
import { EstablishmentIdRequestIdParams } from "../schemas/proUsername";

// ── Account (auth, onboarding, profile updates) ───────────────────────────
import {
  listMyEstablishments,
  listMyMemberships,
  checkPasswordStatus,
  requestPasswordReset,
  changePassword,
  getOnboardingWizardProgress,
  saveOnboardingWizardProgress,
  createProEstablishment,
  createProOnboardingRequest,
  submitEstablishmentProfileUpdate,
  listProEstablishmentProfileDrafts,
  listProEstablishmentProfileDraftChanges,
  activateProOwnerMembership,
} from "./proAccount";
export {
  listMyEstablishments,
  listMyMemberships,
  checkPasswordStatus,
  requestPasswordReset,
  changePassword,
  getOnboardingWizardProgress,
  saveOnboardingWizardProgress,
  createProEstablishment,
  createProOnboardingRequest,
  submitEstablishmentProfileUpdate,
  listProEstablishmentProfileDrafts,
  listProEstablishmentProfileDraftChanges,
  activateProOwnerMembership,
};

// ── Reservations ──────────────────────────────────────────────────────────
import {
  createManualReservation,
  listProReservations,
  listProWaitlist,
  sendProWaitlistOffer,
  closeProWaitlistEntry,
  listProReservationMessageTemplates,
  createProReservationMessageTemplate,
  updateProReservationMessageTemplate,
  updateProReservation,
  listProQrScanLogs,
  scanProQrCode,
  checkinByUserId,
  listProPackBilling,
  seedFakeReservations,
  getReservationHistory,
  logReservationAction,
  listEstablishmentReservationHistory,
} from "./proReservations";
export {
  createManualReservation,
  listProReservations,
  listProWaitlist,
  sendProWaitlistOffer,
  closeProWaitlistEntry,
  listProReservationMessageTemplates,
  createProReservationMessageTemplate,
  updateProReservationMessageTemplate,
  updateProReservation,
  listProQrScanLogs,
  scanProQrCode,
  checkinByUserId,
  listProPackBilling,
  seedFakeReservations,
  getReservationHistory,
  logReservationAction,
  listEstablishmentReservationHistory,
};

// ── Offers (slots, packs, booking policy, promo codes, inventory images, labels) ──
import {
  listProOffers,
  upsertProSlots,
  deleteProSlot,
  validateCreateProPack,
  createProPack,
  deleteProPack,
  updateProPack,
  getProBookingPolicy,
  updateProBookingPolicy,
  listProConsumerPromoCodes,
  createProConsumerPromoCode,
  updateProConsumerPromoCode,
  deleteProConsumerPromoCode,
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
} from "./proOffers";
export {
  listProOffers,
  upsertProSlots,
  deleteProSlot,
  validateCreateProPack,
  createProPack,
  deleteProPack,
  updateProPack,
  getProBookingPolicy,
  updateProBookingPolicy,
  listProConsumerPromoCodes,
  createProConsumerPromoCode,
  updateProConsumerPromoCode,
  deleteProConsumerPromoCode,
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
};

// ── Dashboard (metrics, alerts, impact, online status, campaigns) ─────────
import {
  getProDashboardMetrics,
  getProDashboardAlerts,
  getProImpactReport,
  getProBookingSourceStats,
  getProOnlineStatus,
  toggleProOnlineStatus,
  getProActivityStats,
  toggleGoogleReviews,
  listProCampaigns,
  createProCampaign,
  deleteProCampaign,
} from "./proDashboard";
export {
  getProDashboardMetrics,
  getProDashboardAlerts,
  getProImpactReport,
  getProBookingSourceStats,
  getProOnlineStatus,
  toggleProOnlineStatus,
  getProActivityStats,
  toggleGoogleReviews,
  listProCampaigns,
  createProCampaign,
  deleteProCampaign,
};

// ── Username management ───────────────────────────────────────────────────
import {
  checkUsernameAvailability,
  getEstablishmentUsername,
  submitUsernameRequest,
  cancelUsernameRequest,
  getUsernameSubscription,
  startUsernameTrialHandler,
  cancelUsernameSubscriptionHandler,
} from "./proUsername";
import { SubmitUsernameRequestSchema } from "../schemas/proUsername";
export {
  checkUsernameAvailability,
  getEstablishmentUsername,
  submitUsernameRequest,
  cancelUsernameRequest,
  getUsernameSubscription,
  startUsernameTrialHandler,
  cancelUsernameSubscriptionHandler,
};

// ── Notifications, permissions, invoices ──────────────────────────────────
import {
  listProNotifications,
  markProNotificationRead,
  markAllProNotificationsRead,
  deleteProNotification,
  getProNotificationPreferences,
  updateProNotificationPreferences,
  getEstablishmentPermissions,
  updateEstablishmentPermissions,
  resetEstablishmentPermissions,
  listProInvoices,
  getProInvoiceFinanceInvoice,
} from "./proNotifs";
export {
  listProNotifications,
  markProNotificationRead,
  markAllProNotificationsRead,
  deleteProNotification,
  getProNotificationPreferences,
  updateProNotificationPreferences,
  getEstablishmentPermissions,
  updateEstablishmentPermissions,
  resetEstablishmentPermissions,
  listProInvoices,
  getProInvoiceFinanceInvoice,
};

// ── Inventory (already extracted) ─────────────────────────────────────────
import {
  listProInventory,
  seedDemoProInventory,
  listProInventoryPendingChanges,
  createProInventoryCategory,
  updateProInventoryCategory,
  deleteProInventoryCategory,
  createProInventoryItem,
  updateProInventoryItem,
  deleteProInventoryItem,
  greenThumbProInventoryItem,
} from "./proInventory";
export {
  listProInventory,
  seedDemoProInventory,
  listProInventoryPendingChanges,
  createProInventoryCategory,
  updateProInventoryCategory,
  deleteProInventoryCategory,
  createProInventoryItem,
  updateProInventoryItem,
  deleteProInventoryItem,
  greenThumbProInventoryItem,
};

// ── Messaging (already extracted) ─────────────────────────────────────────
import {
  listProConversations,
  listProConversationMessages,
  sendProConversationMessage,
  getOrCreateProConversationForReservation,
  listProClientHistory,
  markProMessagesRead,
  getProMessageReadReceipts,
  getProAutoReplySettings,
  updateProAutoReplySettings,
  uploadMessageAttachment,
  markProConversationUnread,
} from "./proMessaging";
export {
  listProConversations,
  listProConversationMessages,
  sendProConversationMessage,
  getOrCreateProConversationForReservation,
  listProClientHistory,
  markProMessagesRead,
  getProMessageReadReceipts,
  getProAutoReplySettings,
  updateProAutoReplySettings,
  uploadMessageAttachment,
  markProConversationUnread,
};

// ── Team management (already extracted) ───────────────────────────────────
import {
  createProTeamUser,
  listProTeamMembers,
  updateProTeamMemberRole,
  deleteProTeamMember,
  updateProTeamMemberEmail,
  toggleProTeamMemberActive,
  resetProTeamMemberPassword,
} from "./proTeam";
export {
  createProTeamUser,
  listProTeamMembers,
  updateProTeamMemberRole,
  deleteProTeamMember,
  updateProTeamMemberEmail,
  toggleProTeamMemberActive,
  resetProTeamMemberPassword,
};

// ── Visibility & finance (already extracted) ──────────────────────────────
import {
  listProVisibilityOffers,
  validateProVisibilityPromoCode,
  checkoutProVisibilityCart,
  confirmProVisibilityOrder,
  listProVisibilityOrders,
  getProVisibilityOrderInvoice,
  downloadProVisibilityOrderInvoicePdf,
  ensureProDemoAccount,
  getProFinanceDashboard,
  acceptProTerms,
  getProBankDetails,
  listProPayoutWindows,
  createProPayoutRequest,
  listProPayoutRequests,
} from "./proVisibility";
export {
  listProVisibilityOffers,
  validateProVisibilityPromoCode,
  checkoutProVisibilityCart,
  confirmProVisibilityOrder,
  listProVisibilityOrders,
  getProVisibilityOrderInvoice,
  downloadProVisibilityOrderInvoicePdf,
  ensureProDemoAccount,
  getProFinanceDashboard,
  acceptProTerms,
  getProBankDetails,
  listProPayoutWindows,
  createProPayoutRequest,
  listProPayoutRequests,
};

// ===========================================================================
// registerProCoreRoutes — registers ALL pro-core routes from index.ts
// ===========================================================================
export function registerProCoreRoutes(app: Express) {
  const allowDemoRoutes =
    process.env.NODE_ENV !== "production" &&
    String(process.env.ALLOW_DEMO_ROUTES ?? "").toLowerCase() === "true";

  // ---- My establishments & memberships ----
  app.get("/api/pro/my/establishments", listMyEstablishments);
  app.get("/api/pro/my/memberships", listMyMemberships);

  // ---- Pro user account management ----
  app.get("/api/pro/me/check-password-status", checkPasswordStatus);
  app.post("/api/pro/me/request-password-reset", zBody(RequestPasswordResetSchema), requestPasswordReset);
  app.post("/api/pro/me/change-password", zBody(ChangePasswordSchema), changePassword);
  app.get("/api/pro/me/onboarding-wizard-progress", getOnboardingWizardProgress);
  app.post("/api/pro/me/onboarding-wizard-progress", zBody(SaveOnboardingWizardProgressSchema), saveOnboardingWizardProgress);

  app.post("/api/pro/establishments", createRateLimiter("pro-create-establishment", { windowMs: 60 * 60 * 1000, maxRequests: 10 }), zBody(CreateProEstablishmentSchema), createProEstablishment);
  app.post("/api/pro/onboarding-request", createRateLimiter("pro-onboarding", { windowMs: 60 * 60 * 1000, maxRequests: 5 }), zBody(CreateProOnboardingRequestSchema), createProOnboardingRequest);

  // ---- Profile updates & drafts ----
  app.post(
    "/api/pro/establishments/:establishmentId/profile-update",
    zParams(EstablishmentIdParams),
    zBody(SubmitEstablishmentProfileUpdateSchema),
    submitEstablishmentProfileUpdate,
  );
  app.get(
    "/api/pro/establishments/:establishmentId/profile-drafts",
    zParams(EstablishmentIdParams),
    listProEstablishmentProfileDrafts,
  );
  app.get(
    "/api/pro/establishments/:establishmentId/profile-drafts/:draftId/changes",
    zParams(EstablishmentIdDraftIdParams),
    listProEstablishmentProfileDraftChanges,
  );

  // ---- Reservations ----
  app.get(
    "/api/pro/establishments/:establishmentId/reservations",
    zParams(EstablishmentIdParams),
    listProReservations,
  );
  app.get("/api/pro/establishments/:establishmentId/waitlist", zParams(EstablishmentIdParams), listProWaitlist);
  app.post("/api/pro/waitlist/:id/send-offer", zParams(zIdParam), zBody(SendProWaitlistOfferSchema), sendProWaitlistOffer);
  app.post("/api/pro/waitlist/:id/close", zParams(zIdParam), zBody(CloseProWaitlistEntrySchema), closeProWaitlistEntry);
  app.post(
    "/api/pro/establishments/:establishmentId/reservations/:reservationId/update",
    zParams(EstablishmentIdReservationIdParams),
    zBody(UpdateProReservationSchema),
    updateProReservation,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/reservations/manual",
    zParams(EstablishmentIdParams),
    zBody(CreateManualReservationSchema),
    createManualReservation,
  );

  if (allowDemoRoutes) {
    app.post(
      "/api/pro/establishments/:establishmentId/reservations/seed",
      zParams(EstablishmentIdParams),
      zBody(SeedFakeReservationsSchema),
      seedFakeReservations,
    );
  }

  // ---- Reservation message templates ----
  app.get(
    "/api/pro/establishments/:establishmentId/reservation-message-templates",
    zParams(EstablishmentIdParams),
    listProReservationMessageTemplates,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/reservation-message-templates",
    zParams(EstablishmentIdParams),
    zBody(CreateReservationMessageTemplateSchema),
    createProReservationMessageTemplate,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/reservation-message-templates/:templateId/update",
    zParams(EstablishmentIdTemplateIdParams),
    zBody(UpdateReservationMessageTemplateSchema),
    updateProReservationMessageTemplate,
  );

  // ---- QR scanning ----
  app.post("/api/pro/establishments/:establishmentId/qr/scan", zParams(EstablishmentIdParams), zBody(ScanProQrCodeSchema), scanProQrCode);
  app.post("/api/pro/establishments/:establishmentId/checkin-by-user", zParams(EstablishmentIdParams), zBody(CheckinByUserIdSchema), checkinByUserId);
  app.get(
    "/api/pro/establishments/:establishmentId/qr/logs",
    zParams(EstablishmentIdParams),
    listProQrScanLogs,
  );

  // ---- Offers ----
  app.get("/api/pro/establishments/:establishmentId/offers", zParams(EstablishmentIdParams), listProOffers);

  // ---- Bank details (read-only) ----
  app.get(
    "/api/pro/establishments/:establishmentId/bank-details",
    zParams(EstablishmentIdParams),
    getProBankDetails,
  );

  // ---- Finance (dashboard, payout workflows) ----
  app.get(
    "/api/pro/establishments/:establishmentId/finance/dashboard",
    zParams(EstablishmentIdParams),
    getProFinanceDashboard,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/finance/terms/accept",
    zParams(EstablishmentIdParams),
    zBody(AcceptProTermsSchema),
    acceptProTerms,
  );
  app.get(
    "/api/pro/establishments/:establishmentId/finance/windows",
    zParams(EstablishmentIdParams),
    listProPayoutWindows,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/finance/payout-request",
    zParams(EstablishmentIdParams),
    zBody(CreateProPayoutRequestSchema),
    createProPayoutRequest,
  );
  app.get(
    "/api/pro/establishments/:establishmentId/finance/payout-requests",
    zParams(EstablishmentIdParams),
    listProPayoutRequests,
  );

  // ---- Visibilité (SAM Media) ----
  app.get(
    "/api/pro/establishments/:establishmentId/visibility/offers",
    zParams(EstablishmentIdParams),
    listProVisibilityOffers,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/visibility/promo/validate",
    zParams(EstablishmentIdParams),
    zBody(ValidateProVisibilityPromoCodeSchema),
    validateProVisibilityPromoCode,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/visibility/cart/checkout",
    zParams(EstablishmentIdParams),
    zBody(CheckoutProVisibilityCartSchema),
    checkoutProVisibilityCart,
  );
  app.get(
    "/api/pro/establishments/:establishmentId/visibility/orders",
    zParams(EstablishmentIdParams),
    listProVisibilityOrders,
  );
  app.get(
    "/api/pro/establishments/:establishmentId/visibility/orders/:orderId/invoice",
    zParams(EstablishmentIdOrderIdParams),
    getProVisibilityOrderInvoice,
  );
  app.get(
    "/api/pro/establishments/:establishmentId/visibility/orders/:orderId/invoice/pdf",
    zParams(EstablishmentIdOrderIdParams),
    downloadProVisibilityOrderInvoicePdf,
  );
  if (allowDemoRoutes) {
    app.post(
      "/api/pro/establishments/:establishmentId/visibility/orders/:orderId/confirm",
      zParams(EstablishmentIdOrderIdParams),
      confirmProVisibilityOrder,
    );
  }

  // ---- Slots ----
  app.post(
    "/api/pro/establishments/:establishmentId/slots/upsert",
    zParams(EstablishmentIdParams),
    zBody(UpsertProSlotsSchema),
    upsertProSlots,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/slots/:slotId/delete",
    zParams(EstablishmentIdSlotIdParams),
    deleteProSlot,
  );

  // ---- Packs ----
  app.post("/api/pro/establishments/:establishmentId/packs", zParams(EstablishmentIdParams), validateCreateProPack, createProPack);
  app.patch(
    "/api/pro/establishments/:establishmentId/packs/:packId/update",
    zParams(EstablishmentIdPackIdParams),
    zBody(UpdateProPackSchema),
    updateProPack,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/packs/:packId/delete",
    zParams(EstablishmentIdPackIdParams),
    deleteProPack,
  );

  // ---- Booking policies ----
  app.get(
    "/api/pro/establishments/:establishmentId/booking-policies",
    zParams(EstablishmentIdParams),
    getProBookingPolicy,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/booking-policies/update",
    zParams(EstablishmentIdParams),
    zBody(UpdateProBookingPolicySchema),
    updateProBookingPolicy,
  );

  // ---- Codes promo USERS (packs offerts / remises) ----
  app.get(
    "/api/pro/establishments/:establishmentId/consumer/promo-codes",
    zParams(EstablishmentIdParams),
    listProConsumerPromoCodes,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/consumer/promo-codes",
    zParams(EstablishmentIdParams),
    zBody(CreateProConsumerPromoCodeSchema),
    createProConsumerPromoCode,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/consumer/promo-codes/:id/update",
    zParams(EstablishmentIdPromoCodeIdParams),
    zBody(UpdateProConsumerPromoCodeSchema),
    updateProConsumerPromoCode,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/consumer/promo-codes/:id/delete",
    zParams(EstablishmentIdPromoCodeIdParams),
    deleteProConsumerPromoCode,
  );

  // ---- Promo Analytics ----
  app.get(
    "/api/pro/establishments/:establishmentId/promo-analytics",
    zParams(EstablishmentIdParams),
    getProPromoAnalytics,
  );

  // ---- Promo CSV Export ----
  app.get(
    "/api/pro/establishments/:establishmentId/promo-codes/export-csv",
    zParams(EstablishmentIdParams),
    exportProPromoCodesCsv,
  );

  // ---- Promo Templates ----
  app.get(
    "/api/pro/establishments/:establishmentId/promo-templates",
    zParams(EstablishmentIdParams),
    listProPromoTemplates,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/promo-templates",
    zParams(EstablishmentIdParams),
    zBody(CreateProPromoTemplateSchema),
    createProPromoTemplate,
  );
  app.patch(
    "/api/pro/establishments/:establishmentId/promo-templates/:templateId",
    zParams(EstablishmentIdPromoTemplateIdParams),
    zBody(UpdateProPromoTemplateSchema),
    updateProPromoTemplate,
  );
  app.delete(
    "/api/pro/establishments/:establishmentId/promo-templates/:templateId",
    zParams(EstablishmentIdPromoTemplateIdParams),
    deleteProPromoTemplate,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/promo-templates/:templateId/create-promo",
    zParams(EstablishmentIdPromoTemplateIdParams),
    zBody(CreatePromoFromTemplateSchema),
    createPromoFromTemplate,
  );

  // ---- Reservation History / Timeline ----
  app.get(
    "/api/pro/establishments/:establishmentId/reservations/:reservationId/history",
    zParams(EstablishmentIdReservationIdParams),
    getReservationHistory,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/reservations/:reservationId/history",
    zParams(EstablishmentIdReservationIdParams),
    zBody(LogReservationActionSchema),
    logReservationAction,
  );
  app.get(
    "/api/pro/establishments/:establishmentId/reservation-history",
    zParams(EstablishmentIdParams),
    listEstablishmentReservationHistory,
  );

  // ---- Username management (custom short URLs like @username) ----
  app.get(
    "/api/pro/username/check",
    checkUsernameAvailability,
  );
  app.get(
    "/api/pro/establishments/:establishmentId/username",
    zParams(EstablishmentIdParams),
    getEstablishmentUsername,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/username",
    zParams(EstablishmentIdParams),
    zBody(SubmitUsernameRequestSchema),
    submitUsernameRequest,
  );
  app.delete(
    "/api/pro/establishments/:establishmentId/username/request/:requestId",
    zParams(EstablishmentIdRequestIdParams),
    cancelUsernameRequest,
  );

  // ---- Username subscription management ----
  app.get(
    "/api/pro/establishments/:establishmentId/username-subscription",
    zParams(EstablishmentIdParams),
    getUsernameSubscription,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/username-subscription/start-trial",
    zParams(EstablishmentIdParams),
    startUsernameTrialHandler,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/username-subscription/cancel",
    zParams(EstablishmentIdParams),
    cancelUsernameSubscriptionHandler,
  );

  // ---- Booking source stats (direct link vs platform) ----
  app.get(
    "/api/pro/establishments/:establishmentId/stats/booking-sources",
    zParams(EstablishmentIdParams),
    getProBookingSourceStats,
  );

  // ---- Online status and activity tracking ----
  app.get(
    "/api/pro/establishments/:establishmentId/online-status",
    zParams(EstablishmentIdParams),
    getProOnlineStatus,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/toggle-online",
    zParams(EstablishmentIdParams),
    zBody(ToggleProOnlineStatusSchema),
    toggleProOnlineStatus,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/toggle-google-reviews",
    zParams(EstablishmentIdParams),
    zBody(ToggleGoogleReviewsSchema),
    toggleGoogleReviews,
  );
  app.get(
    "/api/pro/establishments/:establishmentId/activity-stats",
    zParams(EstablishmentIdParams),
    getProActivityStats,
  );

  // ---- Dashboard ----
  app.get(
    "/api/pro/establishments/:establishmentId/dashboard/metrics",
    zParams(EstablishmentIdParams),
    getProDashboardMetrics,
  );
  app.get(
    "/api/pro/establishments/:establishmentId/dashboard/alerts",
    zParams(EstablishmentIdParams),
    getProDashboardAlerts,
  );

  // ---- Impact report ----
  app.get(
    "/api/pro/establishments/:establishmentId/impact",
    zParams(EstablishmentIdParams),
    getProImpactReport,
  );

  // ---- Notifications ----
  app.get(
    "/api/pro/establishments/:establishmentId/notifications",
    zParams(EstablishmentIdParams),
    listProNotifications,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/notifications/:notificationId/read",
    zParams(EstablishmentIdNotificationIdParams),
    markProNotificationRead,
  );
  app.delete(
    "/api/pro/establishments/:establishmentId/notifications/:notificationId",
    zParams(EstablishmentIdNotificationIdParams),
    deleteProNotification,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/notifications/mark-all-read",
    zParams(EstablishmentIdParams),
    markAllProNotificationsRead,
  );
  app.get("/api/pro/notification-preferences", getProNotificationPreferences);
  app.put("/api/pro/notification-preferences", zBody(UpdateProNotificationPreferencesSchema), updateProNotificationPreferences);

  // ---- Invoices ----
  app.get("/api/pro/establishments/:establishmentId/invoices", zParams(EstablishmentIdParams), listProInvoices);
  app.get(
    "/api/pro/establishments/:establishmentId/invoices/:invoiceId/finance-invoice",
    zParams(EstablishmentIdInvoiceIdParams),
    getProInvoiceFinanceInvoice,
  );

  // ---- Inventory ----
  app.get(
    "/api/pro/establishments/:establishmentId/inventory",
    zParams(EstablishmentIdParams),
    listProInventory,
  );
  app.get(
    "/api/pro/establishments/:establishmentId/inventory/pending-changes",
    zParams(EstablishmentIdParams),
    listProInventoryPendingChanges,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/inventory/categories",
    zParams(EstablishmentIdParams),
    zBody(CreateInventoryCategorySchema),
    createProInventoryCategory,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/inventory/categories/:categoryId",
    zParams(EstablishmentIdCategoryIdParams),
    zBody(UpdateInventoryCategorySchema),
    updateProInventoryCategory,
  );
  app.delete(
    "/api/pro/establishments/:establishmentId/inventory/categories/:categoryId",
    zParams(EstablishmentIdCategoryIdParams),
    deleteProInventoryCategory,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/inventory/items",
    zParams(EstablishmentIdParams),
    zBody(CreateInventoryItemSchema),
    createProInventoryItem,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/inventory/items/:itemId",
    zParams(EstablishmentIdItemIdParams),
    zBody(UpdateInventoryItemSchema),
    updateProInventoryItem,
  );
  app.delete(
    "/api/pro/establishments/:establishmentId/inventory/items/:itemId",
    zParams(EstablishmentIdItemIdParams),
    deleteProInventoryItem,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/inventory/items/:itemId/green-thumb",
    zParams(EstablishmentIdItemIdParams),
    greenThumbProInventoryItem,
  );

  // Inventory image upload
  const inventoryImageUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  });
  app.post(
    "/api/pro/establishments/:establishmentId/inventory/images/upload",
    zParams(EstablishmentIdParams),
    inventoryImageUpload.single("image"),
    uploadProInventoryImage,
  );
  app.delete(
    "/api/pro/establishments/:establishmentId/inventory/images",
    zParams(EstablishmentIdParams),
    zBody(DeleteProInventoryImageSchema),
    deleteProInventoryImage,
  );

  // ---- Custom labels ----
  app.get(
    "/api/pro/establishments/:establishmentId/inventory/labels",
    zParams(EstablishmentIdParams),
    listProCustomLabels,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/inventory/labels",
    zParams(EstablishmentIdParams),
    zBody(CreateProCustomLabelSchema),
    createProCustomLabel,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/inventory/labels/:labelId",
    zParams(EstablishmentIdLabelIdParams),
    zBody(UpdateProCustomLabelSchema),
    updateProCustomLabel,
  );
  app.delete(
    "/api/pro/establishments/:establishmentId/inventory/labels/:labelId",
    zParams(EstablishmentIdLabelIdParams),
    deleteProCustomLabel,
  );

  // ---- Reorder items ----
  app.post(
    "/api/pro/establishments/:establishmentId/inventory/items/reorder",
    zParams(EstablishmentIdParams),
    zBody(ReorderProInventoryItemsSchema),
    reorderProInventoryItems,
  );

  if (allowDemoRoutes) {
    app.post(
      "/api/pro/establishments/:establishmentId/inventory/demo-seed",
      zParams(EstablishmentIdParams),
      seedDemoProInventory,
    );
  }

  // ---- Billing ----
  app.get(
    "/api/pro/establishments/:establishmentId/billing/packs",
    zParams(EstablishmentIdParams),
    listProPackBilling,
  );

  // ---- Conversations / Messaging ----
  app.get(
    "/api/pro/establishments/:establishmentId/conversations",
    zParams(EstablishmentIdParams),
    messageReadRateLimiter,
    listProConversations,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/conversations/for-reservation",
    zParams(EstablishmentIdParams),
    messageSendRateLimiter,
    zBody(GetOrCreateProConversationForReservationSchema),
    getOrCreateProConversationForReservation,
  );
  app.get(
    "/api/pro/establishments/:establishmentId/conversations/:conversationId/messages",
    zParams(EstablishmentIdConversationIdParams),
    messageReadRateLimiter,
    listProConversationMessages,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/conversations/:conversationId/messages",
    zParams(EstablishmentIdConversationIdParams),
    messageSendRateLimiter,
    zBody(SendProConversationMessageSchema),
    sendProConversationMessage,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/conversations/:conversationId/mark-read",
    zParams(EstablishmentIdConversationIdParams),
    messageReadRateLimiter,
    markProMessagesRead,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/conversations/:conversationId/mark-unread",
    zParams(EstablishmentIdConversationIdParams),
    messageReadRateLimiter,
    markProConversationUnread,
  );

  // Message attachment upload
  const messageAttachmentUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  });
  app.post(
    "/api/pro/establishments/:establishmentId/conversations/:conversationId/attachments",
    zParams(EstablishmentIdConversationIdParams),
    messageAttachmentRateLimiter,
    messageAttachmentUpload.single("file"),
    uploadMessageAttachment,
  );

  app.get(
    "/api/pro/establishments/:establishmentId/conversations/:conversationId/read-receipts",
    zParams(EstablishmentIdConversationIdParams),
    messageReadRateLimiter,
    getProMessageReadReceipts,
  );
  app.get(
    "/api/pro/establishments/:establishmentId/clients/:clientUserId/history",
    zParams(EstablishmentIdClientUserIdParams),
    messageReadRateLimiter,
    listProClientHistory,
  );
  app.get(
    "/api/pro/establishments/:establishmentId/auto-reply",
    zParams(EstablishmentIdParams),
    messageReadRateLimiter,
    getProAutoReplySettings,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/auto-reply",
    zParams(EstablishmentIdParams),
    messageSendRateLimiter,
    zBody(UpdateProAutoReplySettingsSchema),
    updateProAutoReplySettings,
  );

  // ---- Team management ----
  app.post(
    "/api/pro/establishments/:establishmentId/team/create-user",
    zParams(EstablishmentIdParams),
    zBody(CreateProTeamUserSchema),
    createProTeamUser,
  );
  app.get("/api/pro/establishments/:establishmentId/team", zParams(EstablishmentIdParams), listProTeamMembers);
  app.post(
    "/api/pro/establishments/:establishmentId/team/:membershipId/update",
    zParams(EstablishmentIdMembershipIdParams),
    zBody(UpdateProTeamMemberRoleSchema),
    updateProTeamMemberRole,
  );
  app.delete(
    "/api/pro/establishments/:establishmentId/team/:membershipId",
    zParams(EstablishmentIdMembershipIdParams),
    deleteProTeamMember,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/team/:membershipId/email",
    zParams(EstablishmentIdMembershipIdParams),
    zBody(UpdateProTeamMemberEmailSchema),
    updateProTeamMemberEmail,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/team/:membershipId/toggle-active",
    zParams(EstablishmentIdMembershipIdParams),
    zBody(ToggleProTeamMemberActiveSchema),
    toggleProTeamMemberActive,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/team/:membershipId/reset-password",
    zParams(EstablishmentIdMembershipIdParams),
    resetProTeamMemberPassword,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/activate-owner",
    zParams(EstablishmentIdParams),
    activateProOwnerMembership,
  );

  // ---- Permissions CRUD ----
  app.get(
    "/api/pro/establishments/:establishmentId/permissions",
    zParams(EstablishmentIdParams),
    getEstablishmentPermissions,
  );
  app.put(
    "/api/pro/establishments/:establishmentId/permissions",
    zParams(EstablishmentIdParams),
    zBody(UpdateEstablishmentPermissionsSchema),
    updateEstablishmentPermissions,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/permissions/reset",
    zParams(EstablishmentIdParams),
    resetEstablishmentPermissions,
  );

  // ---- Campaigns ----
  app.get(
    "/api/pro/establishments/:establishmentId/campaigns",
    zParams(EstablishmentIdParams),
    listProCampaigns,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/campaigns",
    zParams(EstablishmentIdParams),
    zBody(CreateProCampaignSchema),
    createProCampaign,
  );
  app.post(
    "/api/pro/establishments/:establishmentId/campaigns/:campaignId/delete",
    zParams(EstablishmentIdCampaignIdParams),
    deleteProCampaign,
  );

  if (allowDemoRoutes) {
    app.post("/api/pro/demo/ensure", ensureProDemoAccount);
  }
}
