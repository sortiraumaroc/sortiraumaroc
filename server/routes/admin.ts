/**
 * admin.ts — Hub module for admin routes.
 *
 * All handler logic lives in sub-modules. This file:
 * 1. Re-exports every handler so existing `import { ... } from "./admin"` still works
 * 2. Provides `registerAdminCoreRoutes(app)` to wire Express routes
 */

import type { Express } from "express";
import express from "express";
import { zBody, zQuery, zParams, zIdParam } from "../lib/validate";

// ── Zod schemas ──────────────────────────────────────────────────────────
import {
  CreateAdminContentPageSchema,
  UpdateAdminContentPageSchema,
  ReplaceAdminContentPageBlocksSchema,
  CreateAdminFaqArticleSchema,
  UpdateAdminFaqArticleSchema,
  CreateAdminCmsBlogArticleSchema,
  UpdateAdminCmsBlogArticleSchema,
  ReplaceAdminCmsBlogArticleBlocksSchema,
  CreateAdminCmsBlogAuthorSchema,
  UpdateAdminCmsBlogAuthorSchema,
} from "../schemas/adminContent";
import {
  CreateAdminCategoryImageSchema,
  UpdateAdminCategoryImageSchema,
  CreateAdminCategoryLevel2Schema,
  UpdateAdminCategoryLevel2Schema,
  CreateAdminUniverseSchema,
  UpdateAdminUniverseSchema,
  ReorderAdminUniversesSchema,
} from "../schemas/adminTaxonomy";
import {
  CreateHomeCurationItemSchema,
  UpdateHomeCurationItemSchema,
  UpdateHomeSettingsSchema,
  UploadHeroImageSchema,
  UploadMobileHeroImageSchema,
  CreateHomeCitySchema,
  UpdateHomeCitySchema,
  ReorderHomeCitiesSchema,
  UploadHomeCityImageSchema,
  UpdateHomeCityCountrySchema,
  CreateHomeVideoSchema,
  UpdateHomeVideoSchema,
  ReorderHomeVideosSchema,
  CreateCountrySchema,
  UpdateCountrySchema,
  ReorderCountriesSchema,
} from "../schemas/adminHomepage";
import {
  UpdateBillingCompanyProfileSchema,
  CreateAdminCitySchema,
  UpdateAdminCitySchema,
  CreateAdminNeighborhoodSchema,
  CreateAdminCategorySchema,
  UpdateAdminCategorySchema,
  ApplyUniverseCommissionSchema,
  UpdateFinanceRulesSchema,
  UpdateReservationRulesSchema,
  UpdateFeatureFlagSchema,
} from "../schemas/adminSettings";
import {
  CreateCommissionOverrideSchema,
  UpdateCommissionOverrideSchema,
  UpdateProTermsSchema,
  UpdatePayoutRequestSchema,
  UpsertBankDetailsSchema,
  UpdateContractSchema,
  UpdateBookingPolicySchema,
  CommissionOverrideParams,
} from "../schemas/adminFinance";
import {
  PostSupportTicketMessageSchema,
  UpdateSupportTicketSchema,
  SendTestEmailSchema,
  UpdatePlatformSettingSchema,
  SetPlatformModeSchema,
  RejectUsernameRequestSchema,
  ExtendUsernameSubscriptionSchema,
  UpdateClaimRequestSchema,
  UpdateEstablishmentLeadSchema,
  UpdateFinanceDiscrepancySchema,
  UpdateFinancePayoutSchema,
  ListSupportTicketsQuery,
  AdminImpactReportQuery,
  ListAdminLogsQuery,
  ListUsernameRequestsQuery,
  ListUsernameSubscriptionsQuery,
  ListClaimRequestsQuery,
  ListEstablishmentLeadsQuery,
  ListFinanceDiscrepanciesQuery,
  ListFinancePayoutsQuery,
  UsernameRequestParams,
  PlatformSettingKeyParams,
  FeatureFlagKeyParams,
} from "../schemas/adminMisc";
import {
  CreateProUserSchema,
  SetProUserMembershipsSchema,
  SuspendProUserSchema,
  BulkDeleteProUsersSchema,
  UpdateConsumerUserStatusSchema,
  UpdateConsumerUserEventSchema,
  UpdateConsumerUserPurchaseSchema,
  DeleteConsumerUsersSchema,
  ConsumerUserEventParams,
  ConsumerUserPurchaseParams,
} from "../schemas/adminUsers";
import {
  CreateEstablishmentSchema,
  CreateEstablishmentWizardSchema,
  UpdateEstablishmentWizardSchema,
  UpdateEstablishmentStatusSchema,
  BatchUpdateEstablishmentStatusSchema,
  UpdateEstablishmentFlagsSchema,
  UpdateAdminEstablishmentReservationSchema,
  AdminUpsertSlotsSchema,
  SearchEstablishmentsByNameQuery,
  ListEstablishmentsQuery,
  ListAdminWaitlistQuery,
  EstablishmentReservationParams,
  EstablishmentSlotParams,
  EstablishmentContractParams,
  EstablishmentProfileChangeParams,
  EstablishmentProfileDraftParams,
  EstablishmentProUserParams,
  EstablishmentConversationParams,
} from "../schemas/adminEstablishments";
import {
  CreateAdminVisibilityOfferSchema,
  UpdateAdminVisibilityOfferSchema,
  CreateAdminVisibilityPromoCodeSchema,
  UpdateAdminVisibilityPromoCodeSchema,
  CreateAdminConsumerPromoCodeSchema,
  UpdateAdminConsumerPromoCodeSchema,
  UpdateAdminVisibilityOrderStatusSchema,
  UpdateAdminVisibilityOrderItemMetaSchema,
  ListVisibilityOffersQuery,
  ListVisibilityPromoCodesQuery,
  ListConsumerPromoCodesQuery,
  ListVisibilityOrdersQuery,
  VisibilityOrderItemParams,
  VisibilityInvoiceParams,
} from "../schemas/adminVisibility";
import {
  CreateAdminMediaQuoteSchema,
  UpdateAdminMediaQuoteSchema,
  AddAdminMediaQuoteItemSchema,
  UpdateAdminMediaQuoteItemSchema,
  UpdateAdminProProfileSchema,
  SendAdminMediaQuoteEmailSchema,
  SendAdminMediaInvoiceEmailSchema,
  ListAdminProProfilesQuery,
  ListAdminMediaQuotesQuery,
  ListAdminMediaInvoicesQuery,
  MediaQuoteItemParams,
} from "../schemas/adminMediaQuotes";
import {
  RejectModerationItemSchema,
} from "../schemas/adminProfileModeration";

// ── Shared admin helpers (re-export for backward compat) ──────────────────
export {
  requireAdminKey,
  requireSuperadmin,
  getAuditActorInfo,
  getAdminSessionSub,
  hasValidAdminSession,
  getAdminSupabase,
  checkAdminKey,
  translateErrorMessage,
  generateProvisionalPassword,
  normalizeEmail,
  isRecord,
  asString,
  asNumber,
  asStringArray,
  asJsonObject,
  emitAdminNotification,
} from "./adminHelpers";

// ── Profile moderation ────────────────────────────────────────────────────
import {
  listAdminEstablishmentPendingProfileUpdates,
  acceptAdminEstablishmentProfileChange,
  rejectAdminEstablishmentProfileChange,
  acceptAllAdminEstablishmentProfileUpdates,
  rejectAllAdminEstablishmentProfileUpdates,
  listModerationQueue,
  approveModerationItem,
  rejectModerationItem,
} from "./adminProfileModeration";
export {
  listAdminEstablishmentPendingProfileUpdates,
  acceptAdminEstablishmentProfileChange,
  rejectAdminEstablishmentProfileChange,
  acceptAllAdminEstablishmentProfileUpdates,
  rejectAllAdminEstablishmentProfileUpdates,
  listModerationQueue,
  approveModerationItem,
  rejectModerationItem,
};

// ── Users ─────────────────────────────────────────────────────────────────
import {
  listConsumerUsers,
  getConsumerUser,
  updateConsumerUserStatus,
  deleteConsumerUsers,
  listConsumerUserEvents,
  updateConsumerUserEvent,
  recomputeConsumerUserReliability,
  listConsumerAccountActions,
  listConsumerUserPurchases,
  updateConsumerUserPurchase,
  listProUsers,
  createProUser,
  listProUserMemberships,
  setProUserMemberships,
  suspendProUser,
  getProUserDependencies,
  bulkDeleteProUsers,
  regenerateProUserPassword,
  removeProFromEstablishment,
} from "./adminUsers";
export {
  listConsumerUsers,
  getConsumerUser,
  updateConsumerUserStatus,
  deleteConsumerUsers,
  listConsumerUserEvents,
  updateConsumerUserEvent,
  recomputeConsumerUserReliability,
  listConsumerAccountActions,
  listConsumerUserPurchases,
  updateConsumerUserPurchase,
  listProUsers,
  createProUser,
  listProUserMemberships,
  setProUserMemberships,
  suspendProUser,
  getProUserDependencies,
  bulkDeleteProUsers,
  regenerateProUserPassword,
  removeProFromEstablishment,
};

// ── Establishments ────────────────────────────────────────────────────────
import {
  searchEstablishmentsByName,
  listEstablishments,
  createEstablishment,
  createEstablishmentWizard,
  updateEstablishmentWizard,
  getEstablishment,
  deleteEstablishment,
  updateEstablishmentStatus,
  batchUpdateEstablishmentStatus,
  updateEstablishmentFlags,
  listAdminEstablishmentReservations,
  updateAdminEstablishmentReservation,
  adminUpsertSlots,
  adminDeleteSlot,
  adminBulkDeleteSlots,
  detectDuplicateEstablishments,
  listAdminWaitlist,
  listAdminEstablishmentQrLogs,
  listAdminEstablishmentPackBilling,
  listAdminEstablishmentConversations,
  listAdminEstablishmentConversationMessages,
  listAdminEstablishmentOffers,
} from "./adminEstablishments";
export {
  searchEstablishmentsByName,
  listEstablishments,
  createEstablishment,
  createEstablishmentWizard,
  updateEstablishmentWizard,
  getEstablishment,
  deleteEstablishment,
  updateEstablishmentStatus,
  batchUpdateEstablishmentStatus,
  updateEstablishmentFlags,
  listAdminEstablishmentReservations,
  updateAdminEstablishmentReservation,
  adminUpsertSlots,
  adminDeleteSlot,
  adminBulkDeleteSlots,
  detectDuplicateEstablishments,
  listAdminWaitlist,
  listAdminEstablishmentQrLogs,
  listAdminEstablishmentPackBilling,
  listAdminEstablishmentConversations,
  listAdminEstablishmentConversationMessages,
  listAdminEstablishmentOffers,
  computeCompletenessScore,
  normalizeEstName,
} from "./adminEstablishments";

// ── Homepage curation ─────────────────────────────────────────────────────
import {
  listAdminHomeCurationItems,
  createAdminHomeCurationItem,
  updateAdminHomeCurationItem,
  deleteAdminHomeCurationItem,
  getAdminHomeSettings,
  updateAdminHomeSettings,
  uploadAdminHeroImage,
  deleteAdminHeroImage,
  uploadAdminMobileHeroImage,
  deleteAdminMobileHeroImage,
  listAdminHomeCities,
  createAdminHomeCity,
  updateAdminHomeCity,
  reorderAdminHomeCities,
  deleteAdminHomeCity,
  uploadAdminHomeCityImage,
  updateAdminHomeCityCountry,
  listAdminHomeVideos,
  createAdminHomeVideo,
  updateAdminHomeVideo,
  reorderAdminHomeVideos,
  deleteAdminHomeVideo,
  uploadAdminVideoThumbnail,
  listAdminCountries,
  createAdminCountry,
  updateAdminCountry,
  deleteAdminCountry,
  reorderAdminCountries,
} from "./adminHomepage";
export {
  listAdminHomeCurationItems,
  createAdminHomeCurationItem,
  updateAdminHomeCurationItem,
  deleteAdminHomeCurationItem,
  getAdminHomeSettings,
  updateAdminHomeSettings,
  uploadAdminHeroImage,
  deleteAdminHeroImage,
  uploadAdminMobileHeroImage,
  deleteAdminMobileHeroImage,
  listAdminHomeCities,
  createAdminHomeCity,
  updateAdminHomeCity,
  reorderAdminHomeCities,
  deleteAdminHomeCity,
  uploadAdminHomeCityImage,
  updateAdminHomeCityCountry,
  listAdminHomeVideos,
  createAdminHomeVideo,
  updateAdminHomeVideo,
  reorderAdminHomeVideos,
  deleteAdminHomeVideo,
  uploadAdminVideoThumbnail,
  listAdminCountries,
  createAdminCountry,
  updateAdminCountry,
  deleteAdminCountry,
  reorderAdminCountries,
};

// ── Taxonomy (categories, universes) ──────────────────────────────────────
import {
  listAdminCategoryImages,
  createAdminCategoryImage,
  updateAdminCategoryImage,
  deleteAdminCategoryImage,
  listAdminCategoriesLevel2,
  createAdminCategoryLevel2,
  updateAdminCategoryLevel2,
  deleteAdminCategoryLevel2,
  listAdminUniverses,
  createAdminUniverse,
  updateAdminUniverse,
  reorderAdminUniverses,
  deleteAdminUniverse,
  uploadAdminUniverseImage,
} from "./adminTaxonomy";
export {
  listAdminCategoryImages,
  createAdminCategoryImage,
  updateAdminCategoryImage,
  deleteAdminCategoryImage,
  uploadAdminCategoryImage,
  listAdminCategoriesLevel2,
  createAdminCategoryLevel2,
  updateAdminCategoryLevel2,
  deleteAdminCategoryLevel2,
  listAdminUniverses,
  createAdminUniverse,
  updateAdminUniverse,
  reorderAdminUniverses,
  deleteAdminUniverse,
  uploadAdminUniverseImage,
} from "./adminTaxonomy";

// ── Misc (support, diagnostics, platform settings, usernames, claims, leads, finance ops, audit) ──
import {
  listAdminSupportTickets,
  getAdminSupportTicket,
  listAdminSupportTicketMessages,
  postAdminSupportTicketMessage,
  updateAdminSupportTicket,
  adminHealth,
  adminProductionCheck,
  getAdminImpactReport,
  listAdminLogs,
  sendAdminTestEmail,
  listPlatformSettingsHandler,
  getPlatformSettingsSnapshotHandler,
  updatePlatformSettingHandler,
  setPlatformModeHandler,
  invalidatePlatformSettingsCacheHandler,
  listUsernameRequests,
  approveUsernameRequest,
  rejectUsernameRequest,
  listAdminUsernameSubscriptions,
  getAdminUsernameSubscriptionStats,
  extendAdminUsernameSubscription,
  cancelAdminUsernameSubscription,
  listAdminClaimRequests,
  getAdminClaimRequest,
  updateAdminClaimRequest,
  listAdminEstablishmentLeads,
  updateAdminEstablishmentLead,
  listAdminFinanceDiscrepancies,
  updateAdminFinanceDiscrepancy,
  runAdminFinanceReconciliation,
  listAdminFinancePayouts,
  updateAdminFinancePayout,
  cronAuditLogCleanup,
} from "./adminMisc";
export {
  listAdminSupportTickets,
  getAdminSupportTicket,
  listAdminSupportTicketMessages,
  postAdminSupportTicketMessage,
  updateAdminSupportTicket,
  adminHealth,
  adminProductionCheck,
  getAdminImpactReport,
  listAdminLogs,
  sendAdminTestEmail,
  listPlatformSettingsHandler,
  getPlatformSettingsSnapshotHandler,
  updatePlatformSettingHandler,
  setPlatformModeHandler,
  invalidatePlatformSettingsCacheHandler,
  listUsernameRequests,
  approveUsernameRequest,
  rejectUsernameRequest,
  listAdminUsernameSubscriptions,
  getAdminUsernameSubscriptionStats,
  extendAdminUsernameSubscription,
  cancelAdminUsernameSubscription,
  listAdminClaimRequests,
  getAdminClaimRequest,
  updateAdminClaimRequest,
  listAdminEstablishmentLeads,
  updateAdminEstablishmentLead,
  listAdminFinanceDiscrepancies,
  updateAdminFinanceDiscrepancy,
  runAdminFinanceReconciliation,
  listAdminFinancePayouts,
  updateAdminFinancePayout,
  cronAuditLogCleanup,
  purgeOldAuditLogs,
} from "./adminMisc";

// ── Settings ──────────────────────────────────────────────────────────────
import {
  getAdminSettingsSnapshot,
  updateAdminBillingCompanyProfile,
  listAdminCities,
  createAdminCity,
  updateAdminCity,
  deleteAdminCity,
  listAdminNeighborhoods,
  createAdminNeighborhood,
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
} from "./adminSettings";
export {
  getAdminSettingsSnapshot,
  updateAdminBillingCompanyProfile,
  listAdminCities,
  createAdminCity,
  updateAdminCity,
  deleteAdminCity,
  listAdminNeighborhoods,
  createAdminNeighborhood,
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
};

// ── Visibility ────────────────────────────────────────────────────────────
import {
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
  updateAdminVisibilityOrderStatus,
  updateAdminVisibilityOrderItemMeta,
  getAdminVisibilityInvoice,
} from "./adminVisibility";
export {
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
  updateAdminVisibilityOrderStatus,
  updateAdminVisibilityOrderItemMeta,
  getAdminVisibilityInvoice,
};

// ── Media Quotes & Invoices ───────────────────────────────────────────────
import {
  listAdminProProfiles,
  getAdminProProfile,
  updateAdminProProfile,
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
} from "./adminMediaQuotes";
export {
  listAdminProProfiles,
  getAdminProProfile,
  updateAdminProProfile,
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
};

// ── Content (CMS) ─────────────────────────────────────────────────────────
import {
  listAdminContentPages,
  createAdminContentPage,
  updateAdminContentPage,
  listAdminContentPageBlocks,
  replaceAdminContentPageBlocks,
  listAdminFaqArticles,
  createAdminFaqArticle,
  updateAdminFaqArticle,
  listAdminCmsBlogArticles,
  createAdminCmsBlogArticle,
  updateAdminCmsBlogArticle,
  deleteAdminCmsBlogArticle,
  listAdminCmsBlogAuthors,
  createAdminCmsBlogAuthor,
  updateAdminCmsBlogAuthor,
  listAdminCmsBlogCategories,
  listAdminCmsBlogArticleBlocks,
  replaceAdminCmsBlogArticleBlocks,
  getAdminCmsBlogPollStats,
  uploadAdminCmsBlogImage,
  uploadAdminCmsBlogDocument,
} from "./adminContent";
export {
  listAdminContentPages,
  createAdminContentPage,
  updateAdminContentPage,
  listAdminContentPageBlocks,
  replaceAdminContentPageBlocks,
  listAdminFaqArticles,
  createAdminFaqArticle,
  updateAdminFaqArticle,
  listAdminCmsBlogArticles,
  createAdminCmsBlogArticle,
  updateAdminCmsBlogArticle,
  deleteAdminCmsBlogArticle,
  listAdminCmsBlogAuthors,
  createAdminCmsBlogAuthor,
  updateAdminCmsBlogAuthor,
  listAdminCmsBlogCategories,
  listAdminCmsBlogArticleBlocks,
  replaceAdminCmsBlogArticleBlocks,
  getAdminCmsBlogPollStats,
  uploadAdminCmsBlogImage,
  uploadAdminCmsBlogDocument,
  getPublicContentPage,
  listPublicFaqArticles,
} from "./adminContent";

// ── Finance ───────────────────────────────────────────────────────────────
import {
  listAdminCommissionOverrides,
  createAdminCommissionOverride,
  updateAdminCommissionOverride,
  deleteAdminCommissionOverride,
  getAdminProTerms,
  updateAdminProTerms,
  listAdminPayoutRequests,
  updateAdminPayoutRequest,
  getAdminEstablishmentBankDetails,
  upsertAdminEstablishmentBankDetails,
  validateAdminEstablishmentBankDetails,
  listAdminEstablishmentBankDetailsHistory,
  uploadAdminEstablishmentBankDocument,
  listAdminEstablishmentBankDocuments,
  listAdminEstablishmentContracts,
  uploadAdminEstablishmentContract,
  updateAdminEstablishmentContract,
  deleteAdminEstablishmentContract,
  getAdminEstablishmentBookingPolicy,
  updateAdminEstablishmentBookingPolicy,
  resetAdminEstablishmentBookingPolicy,
} from "./adminFinance";
export {
  listAdminCommissionOverrides,
  createAdminCommissionOverride,
  updateAdminCommissionOverride,
  deleteAdminCommissionOverride,
  getAdminProTerms,
  updateAdminProTerms,
  listAdminPayoutRequests,
  updateAdminPayoutRequest,
  getAdminEstablishmentBankDetails,
  upsertAdminEstablishmentBankDetails,
  validateAdminEstablishmentBankDetails,
  listAdminEstablishmentBankDetailsHistory,
  uploadAdminEstablishmentBankDocument,
  listAdminEstablishmentBankDocuments,
  listAdminEstablishmentContracts,
  uploadAdminEstablishmentContract,
  updateAdminEstablishmentContract,
  deleteAdminEstablishmentContract,
  getAdminEstablishmentBookingPolicy,
  updateAdminEstablishmentBookingPolicy,
  resetAdminEstablishmentBookingPolicy,
};

// ---------------------------------------------------------------------------
// Register ALL admin-core routes (handlers exported from this file).
// Call this from server/index.ts to centralise route wiring.
// ---------------------------------------------------------------------------
export function registerAdminCoreRoutes(app: Express) {
  // ── Health / diagnostics ──────────────────────────────────────────────
  app.get("/api/admin/health", adminHealth);
  app.get("/api/admin/production-check", adminProductionCheck);
  app.get("/api/admin/impact", zQuery(AdminImpactReportQuery), getAdminImpactReport);
  app.get("/api/admin/logs", zQuery(ListAdminLogsQuery), listAdminLogs);

  // ── Test email ────────────────────────────────────────────────────────
  app.post("/api/admin/emails/test", zBody(SendTestEmailSchema), sendAdminTestEmail);

  // ── Waitlist ──────────────────────────────────────────────────────────
  app.get("/api/admin/waitlist", zQuery(ListAdminWaitlistQuery), listAdminWaitlist);

  // ── Settings (superadmin) ─────────────────────────────────────────────
  app.get("/api/admin/settings/snapshot", getAdminSettingsSnapshot);
  app.post(
    "/api/admin/settings/billing-company-profile/update",
    zBody(UpdateBillingCompanyProfileSchema),
    updateAdminBillingCompanyProfile,
  );

  app.get("/api/admin/settings/cities", listAdminCities);
  app.post("/api/admin/settings/cities", zBody(CreateAdminCitySchema), createAdminCity);
  app.post("/api/admin/settings/cities/:id/update", zParams(zIdParam), zBody(UpdateAdminCitySchema), updateAdminCity);
  app.post("/api/admin/settings/cities/:id/delete", zParams(zIdParam), deleteAdminCity);

  app.get("/api/admin/settings/neighborhoods", listAdminNeighborhoods);
  app.post("/api/admin/settings/neighborhoods", zBody(CreateAdminNeighborhoodSchema), createAdminNeighborhood);

  app.get("/api/admin/settings/categories", listAdminCategories);
  app.post("/api/admin/settings/categories", zBody(CreateAdminCategorySchema), createAdminCategory);
  app.post("/api/admin/settings/categories/:id/update", zParams(zIdParam), zBody(UpdateAdminCategorySchema), updateAdminCategory);
  app.post("/api/admin/settings/categories/:id/delete", zParams(zIdParam), deleteAdminCategory);
  app.post(
    "/api/admin/settings/categories/apply-universe-commission",
    zBody(ApplyUniverseCommissionSchema),
    applyAdminUniverseCommission,
  );

  app.get("/api/admin/settings/finance-rules", getAdminFinanceRules);
  app.post("/api/admin/settings/finance-rules/update", zBody(UpdateFinanceRulesSchema), updateAdminFinanceRules);

  app.get("/api/admin/settings/reservation-rules", getAdminReservationRules);
  app.post(
    "/api/admin/settings/reservation-rules/update",
    zBody(UpdateReservationRulesSchema),
    updateAdminReservationRules,
  );

  app.get("/api/admin/settings/feature-flags", listAdminFeatureFlags);
  app.post(
    "/api/admin/settings/feature-flags/:key/update",
    zParams(FeatureFlagKeyParams),
    zBody(UpdateFeatureFlagSchema),
    updateAdminFeatureFlag,
  );

  // Platform settings (Superadmin only)
  app.get("/api/admin/settings/platform", listPlatformSettingsHandler);
  app.get("/api/admin/settings/platform/snapshot", getPlatformSettingsSnapshotHandler);
  app.post("/api/admin/settings/platform/:key/update", zParams(PlatformSettingKeyParams), zBody(UpdatePlatformSettingSchema), updatePlatformSettingHandler);
  app.post("/api/admin/settings/platform/set-mode", zBody(SetPlatformModeSchema), setPlatformModeHandler);
  app.post("/api/admin/settings/platform/invalidate-cache", invalidatePlatformSettingsCacheHandler);

  // ── Username moderation ───────────────────────────────────────────────
  app.get("/api/admin/username-requests", zQuery(ListUsernameRequestsQuery), listUsernameRequests);
  app.post("/api/admin/username-requests/:requestId/approve", zParams(UsernameRequestParams), approveUsernameRequest);
  app.post("/api/admin/username-requests/:requestId/reject", zParams(UsernameRequestParams), zBody(RejectUsernameRequestSchema), rejectUsernameRequest);

  // ── Username subscriptions ────────────────────────────────────────────
  app.get("/api/admin/username-subscriptions", zQuery(ListUsernameSubscriptionsQuery), listAdminUsernameSubscriptions);
  app.get("/api/admin/username-subscriptions/stats", getAdminUsernameSubscriptionStats);
  app.post("/api/admin/username-subscriptions/:id/extend", zParams(zIdParam), zBody(ExtendUsernameSubscriptionSchema), extendAdminUsernameSubscription);
  app.post("/api/admin/username-subscriptions/:id/cancel", zParams(zIdParam), cancelAdminUsernameSubscription);

  // ── Claim requests (demandes de revendication) ────────────────────────
  app.get("/api/admin/claim-requests", zQuery(ListClaimRequestsQuery), listAdminClaimRequests);
  app.get("/api/admin/claim-requests/:id", zParams(zIdParam), getAdminClaimRequest);
  app.post("/api/admin/claim-requests/:id", zParams(zIdParam), zBody(UpdateClaimRequestSchema), updateAdminClaimRequest);

  // ── Establishment leads (demandes d'ajout d'établissement) ────────────
  app.get("/api/admin/establishment-leads", zQuery(ListEstablishmentLeadsQuery), listAdminEstablishmentLeads);
  app.post("/api/admin/establishment-leads/:id", zParams(zIdParam), zBody(UpdateEstablishmentLeadSchema), updateAdminEstablishmentLead);

  // ── Homepage curation ─────────────────────────────────────────────────
  app.get("/api/admin/home-curation", listAdminHomeCurationItems);
  app.post("/api/admin/home-curation", zBody(CreateHomeCurationItemSchema), createAdminHomeCurationItem);
  app.post("/api/admin/home-curation/:id/update", zParams(zIdParam), zBody(UpdateHomeCurationItemSchema), updateAdminHomeCurationItem);
  app.post("/api/admin/home-curation/:id/delete", zParams(zIdParam), deleteAdminHomeCurationItem);

  // ── Universes management ──────────────────────────────────────────────
  app.get("/api/admin/universes", listAdminUniverses);
  app.post("/api/admin/universes", zBody(CreateAdminUniverseSchema), createAdminUniverse);
  app.post("/api/admin/universes/:id/update", zParams(zIdParam), zBody(UpdateAdminUniverseSchema), updateAdminUniverse);
  app.post("/api/admin/universes/reorder", zBody(ReorderAdminUniversesSchema), reorderAdminUniverses);
  app.post("/api/admin/universes/:id/delete", zParams(zIdParam), deleteAdminUniverse);
  app.post("/api/admin/universes/upload-image", uploadAdminUniverseImage);

  // ── Home settings (hero background, etc.) ─────────────────────────────
  app.get("/api/admin/home-settings", getAdminHomeSettings);
  app.post("/api/admin/home-settings", zBody(UpdateHomeSettingsSchema), updateAdminHomeSettings);
  app.post("/api/admin/home-settings/hero-image", zBody(UploadHeroImageSchema), uploadAdminHeroImage);
  app.post("/api/admin/home-settings/hero-image/delete", deleteAdminHeroImage);
  app.post("/api/admin/home-settings/hero-image-mobile", zBody(UploadMobileHeroImageSchema), uploadAdminMobileHeroImage);
  app.post("/api/admin/home-settings/hero-image-mobile/delete", deleteAdminMobileHeroImage);

  // ── Home cities management ────────────────────────────────────────────
  app.get("/api/admin/home-cities", listAdminHomeCities);
  app.post("/api/admin/home-cities", zBody(CreateHomeCitySchema), createAdminHomeCity);
  app.post("/api/admin/home-cities/:id/update", zParams(zIdParam), zBody(UpdateHomeCitySchema), updateAdminHomeCity);
  app.post("/api/admin/home-cities/reorder", zBody(ReorderHomeCitiesSchema), reorderAdminHomeCities);
  app.post("/api/admin/home-cities/:id/delete", zParams(zIdParam), deleteAdminHomeCity);
  app.post("/api/admin/home-cities/:id/image", zParams(zIdParam), zBody(UploadHomeCityImageSchema), uploadAdminHomeCityImage);
  app.post("/api/admin/home-cities/:id/country", zParams(zIdParam), zBody(UpdateHomeCityCountrySchema), updateAdminHomeCityCountry);

  // ── Countries management ──────────────────────────────────────────────
  app.get("/api/admin/countries", listAdminCountries);
  app.post("/api/admin/countries", zBody(CreateCountrySchema), createAdminCountry);
  app.post("/api/admin/countries/:id/update", zParams(zIdParam), zBody(UpdateCountrySchema), updateAdminCountry);
  app.post("/api/admin/countries/:id/delete", zParams(zIdParam), deleteAdminCountry);
  app.post("/api/admin/countries/reorder", zBody(ReorderCountriesSchema), reorderAdminCountries);

  // ── Home videos management ────────────────────────────────────────────
  app.get("/api/admin/home-videos", listAdminHomeVideos);
  app.post("/api/admin/home-videos", zBody(CreateHomeVideoSchema), createAdminHomeVideo);
  app.post("/api/admin/home-videos/:id/update", zParams(zIdParam), zBody(UpdateHomeVideoSchema), updateAdminHomeVideo);
  app.post("/api/admin/home-videos/reorder", zBody(ReorderHomeVideosSchema), reorderAdminHomeVideos);
  app.post("/api/admin/home-videos/:id/delete", zParams(zIdParam), deleteAdminHomeVideo);
  app.post("/api/admin/home-videos/upload-thumbnail", uploadAdminVideoThumbnail);

  // ── Category images (subcategories - level 3) ─────────────────────────
  app.get("/api/admin/category-images", listAdminCategoryImages);
  app.post("/api/admin/category-images", zBody(CreateAdminCategoryImageSchema), createAdminCategoryImage);
  app.post("/api/admin/category-images/:id/update", zParams(zIdParam), zBody(UpdateAdminCategoryImageSchema), updateAdminCategoryImage);
  app.post("/api/admin/category-images/:id/delete", zParams(zIdParam), deleteAdminCategoryImage);
  // NOTE: The upload route (/api/admin/category-images/upload) uses express.raw()
  // and must be registered BEFORE express.json() middleware in index.ts.
  // It is intentionally NOT included here — it stays in index.ts.

  // ── Categories management (level 2) ───────────────────────────────────
  app.get("/api/admin/categories-level2", listAdminCategoriesLevel2);
  app.post("/api/admin/categories-level2", zBody(CreateAdminCategoryLevel2Schema), createAdminCategoryLevel2);
  app.post("/api/admin/categories-level2/:id/update", zParams(zIdParam), zBody(UpdateAdminCategoryLevel2Schema), updateAdminCategoryLevel2);
  app.post("/api/admin/categories-level2/:id/delete", zParams(zIdParam), deleteAdminCategoryLevel2);

  // ── Support (inbox) ─────────────────────────────────────────────────
  app.get("/api/admin/support/tickets", zQuery(ListSupportTicketsQuery), listAdminSupportTickets);
  app.get("/api/admin/support/tickets/:id", zParams(zIdParam), getAdminSupportTicket);
  app.get(
    "/api/admin/support/tickets/:id/messages",
    zParams(zIdParam),
    listAdminSupportTicketMessages,
  );
  app.post("/api/admin/support/tickets/:id/update", zParams(zIdParam), zBody(UpdateSupportTicketSchema), updateAdminSupportTicket);
  app.post(
    "/api/admin/support/tickets/:id/messages",
    zParams(zIdParam),
    zBody(PostSupportTicketMessageSchema),
    postAdminSupportTicketMessage,
  );

  // ── Content (CMS) ────────────────────────────────────────────────────
  app.get("/api/admin/content/pages", listAdminContentPages);
  app.post("/api/admin/content/pages", zBody(CreateAdminContentPageSchema), createAdminContentPage);
  app.post("/api/admin/content/pages/:id/update", zParams(zIdParam), zBody(UpdateAdminContentPageSchema), updateAdminContentPage);
  app.get("/api/admin/content/pages/:id/blocks", zParams(zIdParam), listAdminContentPageBlocks);
  app.post(
    "/api/admin/content/pages/:id/blocks/replace",
    zParams(zIdParam),
    zBody(ReplaceAdminContentPageBlocksSchema),
    replaceAdminContentPageBlocks,
  );

  app.get("/api/admin/content/faq", listAdminFaqArticles);
  app.post("/api/admin/content/faq", zBody(CreateAdminFaqArticleSchema), createAdminFaqArticle);
  app.post("/api/admin/content/faq/:id/update", zParams(zIdParam), zBody(UpdateAdminFaqArticleSchema), updateAdminFaqArticle);

  app.get("/api/admin/content/blog", listAdminCmsBlogArticles);
  app.get("/api/admin/content/blog/authors", listAdminCmsBlogAuthors);
  app.post("/api/admin/content/blog/authors", zBody(CreateAdminCmsBlogAuthorSchema), createAdminCmsBlogAuthor);
  app.post(
    "/api/admin/content/blog/authors/:id/update",
    zParams(zIdParam),
    zBody(UpdateAdminCmsBlogAuthorSchema),
    updateAdminCmsBlogAuthor,
  );
  app.get("/api/admin/content/blog/categories", listAdminCmsBlogCategories);

  app.post("/api/admin/content/blog", zBody(CreateAdminCmsBlogArticleSchema), createAdminCmsBlogArticle);
  app.post("/api/admin/content/blog/:id/update", zParams(zIdParam), zBody(UpdateAdminCmsBlogArticleSchema), updateAdminCmsBlogArticle);
  app.delete("/api/admin/content/blog/:id", zParams(zIdParam), deleteAdminCmsBlogArticle);
  app.get("/api/admin/content/blog/:id/blocks", zParams(zIdParam), listAdminCmsBlogArticleBlocks);
  app.get("/api/admin/content/blog/:id/polls/stats", zParams(zIdParam), getAdminCmsBlogPollStats);
  app.post(
    "/api/admin/content/blog/:id/blocks/replace",
    zParams(zIdParam),
    zBody(ReplaceAdminCmsBlogArticleBlocksSchema),
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

  // ── Finance (ledger/escrow reconciliation) ────────────────────────────
  app.get("/api/admin/finance/discrepancies", zQuery(ListFinanceDiscrepanciesQuery), listAdminFinanceDiscrepancies);
  app.post(
    "/api/admin/finance/discrepancies/:id/update",
    zParams(zIdParam),
    zBody(UpdateFinanceDiscrepancySchema),
    updateAdminFinanceDiscrepancy,
  );
  app.post("/api/admin/finance/reconcile/run", runAdminFinanceReconciliation);

  // Finance (payout operations)
  app.get("/api/admin/finance/payouts", zQuery(ListFinancePayoutsQuery), listAdminFinancePayouts);
  app.post("/api/admin/finance/payouts/:id/update", zParams(zIdParam), zBody(UpdateFinancePayoutSchema), updateAdminFinancePayout);

  // Finance (commission overrides)
  app.get(
    "/api/admin/finance/commission-overrides",
    listAdminCommissionOverrides,
  );
  app.post(
    "/api/admin/finance/commission-overrides/create",
    zBody(CreateCommissionOverrideSchema),
    createAdminCommissionOverride,
  );
  app.post(
    "/api/admin/finance/commission-overrides/:establishmentId/update",
    zParams(CommissionOverrideParams),
    zBody(UpdateCommissionOverrideSchema),
    updateAdminCommissionOverride,
  );
  app.post(
    "/api/admin/finance/commission-overrides/:establishmentId/delete",
    zParams(CommissionOverrideParams),
    deleteAdminCommissionOverride,
  );

  // Finance (PRO terms)
  app.get("/api/admin/pro-terms", getAdminProTerms);
  app.post("/api/admin/pro-terms/update", zBody(UpdateProTermsSchema), updateAdminProTerms);

  // Finance (payout requests)
  app.get("/api/admin/finance/payout-requests", listAdminPayoutRequests);
  app.post(
    "/api/admin/finance/payout-requests/:id/update",
    zParams(zIdParam),
    zBody(UpdatePayoutRequestSchema),
    updateAdminPayoutRequest,
  );

  // ── Moderation ────────────────────────────────────────────────────────
  app.get("/api/admin/moderation", listModerationQueue);
  app.post("/api/admin/moderation/:id/approve", zParams(zIdParam), approveModerationItem);
  app.post("/api/admin/moderation/:id/reject", zParams(zIdParam), zBody(RejectModerationItemSchema), rejectModerationItem);

  // ── Establishments ────────────────────────────────────────────────────
  app.get("/api/admin/establishments/search", zQuery(SearchEstablishmentsByNameQuery), searchEstablishmentsByName);
  app.get("/api/admin/establishments", zQuery(ListEstablishmentsQuery), listEstablishments);
  app.post("/api/admin/establishments/wizard", zBody(CreateEstablishmentWizardSchema), createEstablishmentWizard);
  app.patch("/api/admin/establishments/wizard/:id", zParams(zIdParam), zBody(UpdateEstablishmentWizardSchema), updateEstablishmentWizard);
  app.post("/api/admin/establishments", zBody(CreateEstablishmentSchema), createEstablishment);
  app.get("/api/admin/establishments/:id", zParams(zIdParam), getEstablishment);
  app.post("/api/admin/establishments/batch-status", zBody(BatchUpdateEstablishmentStatusSchema), batchUpdateEstablishmentStatus);
  app.post("/api/admin/establishments/:id/status", zParams(zIdParam), zBody(UpdateEstablishmentStatusSchema), updateEstablishmentStatus);
  app.post("/api/admin/establishments/:id/flags", zParams(zIdParam), zBody(UpdateEstablishmentFlagsSchema), updateEstablishmentFlags);
  app.delete("/api/admin/establishments/:id", zParams(zIdParam), deleteEstablishment);
  app.get("/api/admin/establishments-duplicates", detectDuplicateEstablishments);

  // PRO bank details (RIB) — Superadmin-only
  app.get(
    "/api/admin/establishments/:id/bank-details",
    zParams(zIdParam),
    getAdminEstablishmentBankDetails,
  );
  app.post(
    "/api/admin/establishments/:id/bank-details/upsert",
    zParams(zIdParam),
    zBody(UpsertBankDetailsSchema),
    upsertAdminEstablishmentBankDetails,
  );
  app.post(
    "/api/admin/establishments/:id/bank-details/validate",
    zParams(zIdParam),
    validateAdminEstablishmentBankDetails,
  );
  app.get(
    "/api/admin/establishments/:id/bank-details/history",
    zParams(zIdParam),
    listAdminEstablishmentBankDetailsHistory,
  );
  app.get(
    "/api/admin/establishments/:id/bank-details/documents",
    zParams(zIdParam),
    listAdminEstablishmentBankDocuments,
  );
  app.post(
    "/api/admin/establishments/:id/bank-details/documents/upload",
    zParams(zIdParam),
    express.raw({ type: "application/pdf", limit: "12mb" }),
    uploadAdminEstablishmentBankDocument,
  );

  // Establishment contracts (PDF documents) — Superadmin only
  app.get(
    "/api/admin/establishments/:id/contracts",
    zParams(zIdParam),
    listAdminEstablishmentContracts,
  );
  app.post(
    "/api/admin/establishments/:id/contracts/upload",
    zParams(zIdParam),
    express.raw({ type: "application/pdf", limit: "12mb" }),
    uploadAdminEstablishmentContract,
  );
  app.patch(
    "/api/admin/establishments/:id/contracts/:contractId",
    zParams(EstablishmentContractParams),
    zBody(UpdateContractSchema),
    updateAdminEstablishmentContract,
  );
  app.delete(
    "/api/admin/establishments/:id/contracts/:contractId",
    zParams(EstablishmentContractParams),
    deleteAdminEstablishmentContract,
  );

  // Booking policies (per-establishment) — Superadmin only
  app.get(
    "/api/admin/establishments/:id/booking-policy",
    zParams(zIdParam),
    getAdminEstablishmentBookingPolicy,
  );
  app.post(
    "/api/admin/establishments/:id/booking-policy/update",
    zParams(zIdParam),
    zBody(UpdateBookingPolicySchema),
    updateAdminEstablishmentBookingPolicy,
  );
  app.post(
    "/api/admin/establishments/:id/booking-policy/reset",
    zParams(zIdParam),
    resetAdminEstablishmentBookingPolicy,
  );

  // Establishment profile moderation (per-field change-set review)
  app.get(
    "/api/admin/establishments/:id/profile-updates/pending",
    zParams(zIdParam),
    listAdminEstablishmentPendingProfileUpdates,
  );
  app.post(
    "/api/admin/establishments/:id/profile-updates/:draftId/changes/:changeId/accept",
    zParams(EstablishmentProfileChangeParams),
    acceptAdminEstablishmentProfileChange,
  );
  app.post(
    "/api/admin/establishments/:id/profile-updates/:draftId/changes/:changeId/reject",
    zParams(EstablishmentProfileChangeParams),
    rejectAdminEstablishmentProfileChange,
  );
  app.post(
    "/api/admin/establishments/:id/profile-updates/:draftId/accept-all",
    zParams(EstablishmentProfileDraftParams),
    acceptAllAdminEstablishmentProfileUpdates,
  );
  app.post(
    "/api/admin/establishments/:id/profile-updates/:draftId/reject-all",
    zParams(EstablishmentProfileDraftParams),
    rejectAllAdminEstablishmentProfileUpdates,
  );

  app.get(
    "/api/admin/establishments/:id/reservations",
    zParams(zIdParam),
    listAdminEstablishmentReservations,
  );
  app.post(
    "/api/admin/establishments/:id/reservations/:reservationId/update",
    zParams(EstablishmentReservationParams),
    zBody(UpdateAdminEstablishmentReservationSchema),
    updateAdminEstablishmentReservation,
  );
  app.get("/api/admin/establishments/:id/offers", zParams(zIdParam), listAdminEstablishmentOffers);
  app.put("/api/admin/establishments/:id/slots/upsert", zParams(zIdParam), zBody(AdminUpsertSlotsSchema), adminUpsertSlots);
  app.delete("/api/admin/establishments/:id/slots/bulk", zParams(zIdParam), adminBulkDeleteSlots);
  app.delete("/api/admin/establishments/:id/slots/:slotId", zParams(EstablishmentSlotParams), adminDeleteSlot);
  app.get(
    "/api/admin/establishments/:id/billing/packs",
    zParams(zIdParam),
    listAdminEstablishmentPackBilling,
  );

  // ── Visibilité (SAM Media) ────────────────────────────────────────────
  app.get("/api/admin/visibility/offers", zQuery(ListVisibilityOffersQuery), listAdminVisibilityOffers);
  app.post("/api/admin/visibility/offers", zBody(CreateAdminVisibilityOfferSchema), createAdminVisibilityOffer);
  app.post(
    "/api/admin/visibility/offers/:id/update",
    zParams(zIdParam),
    zBody(UpdateAdminVisibilityOfferSchema),
    updateAdminVisibilityOffer,
  );
  app.post(
    "/api/admin/visibility/offers/:id/delete",
    zParams(zIdParam),
    deleteAdminVisibilityOffer,
  );

  app.get("/api/admin/visibility/promo-codes", zQuery(ListVisibilityPromoCodesQuery), listAdminVisibilityPromoCodes);
  app.post("/api/admin/visibility/promo-codes", zBody(CreateAdminVisibilityPromoCodeSchema), createAdminVisibilityPromoCode);
  app.post(
    "/api/admin/visibility/promo-codes/:id/update",
    zParams(zIdParam),
    zBody(UpdateAdminVisibilityPromoCodeSchema),
    updateAdminVisibilityPromoCode,
  );
  app.post(
    "/api/admin/visibility/promo-codes/:id/delete",
    zParams(zIdParam),
    deleteAdminVisibilityPromoCode,
  );

  // Codes promo USERS (packs offerts / remises)
  app.get("/api/admin/consumer/promo-codes", zQuery(ListConsumerPromoCodesQuery), listAdminConsumerPromoCodes);
  app.post("/api/admin/consumer/promo-codes", zBody(CreateAdminConsumerPromoCodeSchema), createAdminConsumerPromoCode);
  app.post(
    "/api/admin/consumer/promo-codes/:id/update",
    zParams(zIdParam),
    zBody(UpdateAdminConsumerPromoCodeSchema),
    updateAdminConsumerPromoCode,
  );
  app.post(
    "/api/admin/consumer/promo-codes/:id/delete",
    zParams(zIdParam),
    deleteAdminConsumerPromoCode,
  );

  app.get("/api/admin/visibility/orders", zQuery(ListVisibilityOrdersQuery), listAdminVisibilityOrders);
  app.post(
    "/api/admin/visibility/orders/:id/update-status",
    zParams(zIdParam),
    zBody(UpdateAdminVisibilityOrderStatusSchema),
    updateAdminVisibilityOrderStatus,
  );
  app.post(
    "/api/admin/visibility/orders/:orderId/items/:itemId/update-meta",
    zParams(VisibilityOrderItemParams),
    zBody(UpdateAdminVisibilityOrderItemMetaSchema),
    updateAdminVisibilityOrderItemMeta,
  );
  app.get(
    "/api/admin/visibility/invoices/:invoiceId",
    zParams(VisibilityInvoiceParams),
    getAdminVisibilityInvoice,
  );

  // ── PRO profiles (clients = PRO) ──────────────────────────────────────
  app.get("/api/admin/pro-profiles", zQuery(ListAdminProProfilesQuery), listAdminProProfiles);
  app.get("/api/admin/pro-profiles/:id", zParams(zIdParam), getAdminProProfile);
  app.post("/api/admin/pro-profiles/:id/update", zParams(zIdParam), zBody(UpdateAdminProProfileSchema), updateAdminProProfile);

  // ── SAM Media — Quotes & Invoices ─────────────────────────────────────
  app.get("/api/admin/media/quotes", zQuery(ListAdminMediaQuotesQuery), listAdminMediaQuotes);
  app.post("/api/admin/media/quotes", zBody(CreateAdminMediaQuoteSchema), createAdminMediaQuote);
  app.get("/api/admin/media/quotes/:id", zParams(zIdParam), getAdminMediaQuote);
  app.get("/api/admin/media/quotes/:id/pdf", zParams(zIdParam), downloadAdminMediaQuotePdf);
  app.post("/api/admin/media/quotes/:id/update", zParams(zIdParam), zBody(UpdateAdminMediaQuoteSchema), updateAdminMediaQuote);
  app.post("/api/admin/media/quotes/:id/items", zParams(zIdParam), zBody(AddAdminMediaQuoteItemSchema), addAdminMediaQuoteItem);
  app.post(
    "/api/admin/media/quotes/:id/items/:itemId/update",
    zParams(MediaQuoteItemParams),
    zBody(UpdateAdminMediaQuoteItemSchema),
    updateAdminMediaQuoteItem,
  );
  app.post(
    "/api/admin/media/quotes/:id/items/:itemId/delete",
    zParams(MediaQuoteItemParams),
    deleteAdminMediaQuoteItem,
  );
  app.post(
    "/api/admin/media/quotes/:id/public-link",
    zParams(zIdParam),
    createAdminMediaQuotePublicLink,
  );
  app.post("/api/admin/media/quotes/:id/send-email", zParams(zIdParam), zBody(SendAdminMediaQuoteEmailSchema), sendAdminMediaQuoteEmail);
  app.post(
    "/api/admin/media/quotes/:id/mark-accepted",
    zParams(zIdParam),
    markAdminMediaQuoteAccepted,
  );
  app.post(
    "/api/admin/media/quotes/:id/mark-rejected",
    zParams(zIdParam),
    markAdminMediaQuoteRejected,
  );
  app.post(
    "/api/admin/media/quotes/:id/convert-to-invoice",
    zParams(zIdParam),
    convertAdminMediaQuoteToInvoice,
  );

  app.get("/api/admin/media/invoices", zQuery(ListAdminMediaInvoicesQuery), listAdminMediaInvoices);
  app.get("/api/admin/media/invoices/:id", zParams(zIdParam), getAdminMediaInvoice);
  app.get("/api/admin/media/invoices/:id/pdf", zParams(zIdParam), downloadAdminMediaInvoicePdf);
  app.post(
    "/api/admin/media/invoices/:id/public-link",
    zParams(zIdParam),
    createAdminMediaInvoicePublicLink,
  );
  app.post(
    "/api/admin/media/invoices/:id/send-email",
    zParams(zIdParam),
    zBody(SendAdminMediaInvoiceEmailSchema),
    sendAdminMediaInvoiceEmail,
  );
  app.post(
    "/api/admin/media/invoices/:id/mark-paid",
    zParams(zIdParam),
    markAdminMediaInvoicePaid,
  );

  // ── QR logs & conversations ───────────────────────────────────────────
  app.get(
    "/api/admin/establishments/:id/qr/logs",
    zParams(zIdParam),
    listAdminEstablishmentQrLogs,
  );
  app.get(
    "/api/admin/establishments/:id/conversations",
    zParams(zIdParam),
    listAdminEstablishmentConversations,
  );
  app.get(
    "/api/admin/establishments/:id/conversations/:conversationId/messages",
    zParams(EstablishmentConversationParams),
    listAdminEstablishmentConversationMessages,
  );

  // ── PRO users ─────────────────────────────────────────────────────────
  app.get("/api/admin/pros/users", listProUsers);
  app.post("/api/admin/pros/users", zBody(CreateProUserSchema), createProUser);
  app.get("/api/admin/pros/users/:id/memberships", zParams(zIdParam), listProUserMemberships);
  app.post("/api/admin/pros/users/:id/memberships", zParams(zIdParam), zBody(SetProUserMembershipsSchema), setProUserMemberships);
  app.post("/api/admin/pros/users/:id/regenerate-password", zParams(zIdParam), regenerateProUserPassword);
  app.post("/api/admin/pros/users/:id/suspend", zParams(zIdParam), zBody(SuspendProUserSchema), suspendProUser);
  app.get("/api/admin/pros/users/:id/dependencies", zParams(zIdParam), getProUserDependencies);
  app.post("/api/admin/pros/users/bulk-delete", zBody(BulkDeleteProUsersSchema), bulkDeleteProUsers);

  // Remove a Pro from an establishment (admin only)
  app.delete("/api/admin/establishments/:establishmentId/pros/:proUserId", zParams(EstablishmentProUserParams), removeProFromEstablishment);

  // ── Consumer users ────────────────────────────────────────────────────
  app.get("/api/admin/users", listConsumerUsers);
  app.post("/api/admin/users/delete", zBody(DeleteConsumerUsersSchema), deleteConsumerUsers);
  app.get("/api/admin/users/account-actions", listConsumerAccountActions);
  app.get("/api/admin/users/:id", zParams(zIdParam), getConsumerUser);
  app.post(
    "/api/admin/users/:id/reliability/recompute",
    zParams(zIdParam),
    recomputeConsumerUserReliability,
  );
  app.get("/api/admin/users/:id/events", zParams(zIdParam), listConsumerUserEvents);
  app.post("/api/admin/users/:id/status", zParams(zIdParam), zBody(UpdateConsumerUserStatusSchema), updateConsumerUserStatus);
  app.post("/api/admin/users/:id/events/:eventId", zParams(ConsumerUserEventParams), zBody(UpdateConsumerUserEventSchema), updateConsumerUserEvent);
  app.get("/api/admin/users/:id/purchases", zParams(zIdParam), listConsumerUserPurchases);
  app.post(
    "/api/admin/users/:id/purchases/:purchaseId",
    zParams(ConsumerUserPurchaseParams),
    zBody(UpdateConsumerUserPurchaseSchema),
    updateConsumerUserPurchase,
  );

  // ── Cron: Audit log cleanup ───────────────────────────────────────────
  app.post("/api/admin/cron/audit-log-cleanup", cronAuditLogCleanup);
}
