/**
 * Zod Schemas for Public Consumer Routes
 *
 * Validates consumer-facing inputs for account, reservation, notification,
 * search, tracking, wheel, and contact form endpoints.
 * All schemas use  to avoid breaking handlers.
 */

import { z, zUuid } from "../lib/validate";

// =============================================================================
// Consumer Account (from publicConsumerAccount.ts)
// =============================================================================

export const UpdateConsumerMeSchema = z.object({
  first_name: z.string().max(100).optional(),
  firstName: z.string().max(100).optional(),
  last_name: z.string().max(100).optional(),
  lastName: z.string().max(100).optional(),
  phone: z.string().max(30).optional(),
  email: z.string().optional(),
  date_of_birth: z.string().optional(),
  dateOfBirth: z.string().optional(),
  city: z.string().max(100).optional(),
  country: z.string().max(100).optional(),
  socio_professional_status: z.string().max(100).optional(),
});

export const DeactivateConsumerAccountSchema = z.object({
  reason_code: z.string().max(100).optional(),
  reasonCode: z.string().max(100).optional(),
  reason_text: z.string().max(500).optional(),
  reasonText: z.string().max(500).optional(),
});

export const RequestConsumerDataExportSchema = z.object({
  format: z.string().max(10).optional(),
});

export const ChangeConsumerPasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(8),
});

export const CompletePasswordResetSchema = z.object({
  token: z.string().min(1),
  new_password: z.string().min(8),
});

export const RequestPasswordResetLinkSchema = z.object({
  email: z.string().min(1),
});

export const SendWelcomeEmailSchema = z.object({
  user_id: z.string().optional(),
  email: z.string().min(1),
  name: z.string().max(200).optional(),
});

// =============================================================================
// Consumer Data (from publicConsumerData.ts)
// =============================================================================

export const CheckoutConsumerPackSchema = z.object({
  pack_id: z.string().optional(),
  packId: z.string().optional(),
  quantity: z.coerce.number().int().min(1).max(50).optional(),
  buyer_name: z.string().max(200).optional(),
  buyerName: z.string().max(200).optional(),
  buyer_email: z.string().max(200).optional(),
  buyerEmail: z.string().max(200).optional(),
  contact: z.object({
    full_name: z.string().optional(),
    name: z.string().optional(),
    email: z.string().optional(),
  }).optional().nullable(),
  promo_code: z.string().max(50).optional(),
  promoCode: z.string().max(50).optional(),
  promo: z.string().max(50).optional(),
});

export const SendConsumerReservationMessageSchema = z.object({
  body: z.string().min(1).max(5000),
});

export const UpdateConsumerReservationSchema = z.object({
  action: z.string().min(1),
  requested_change: z.object({
    starts_at: z.string().optional(),
    startsAt: z.string().optional(),
    party_size: z.coerce.number().optional(),
    partySize: z.coerce.number().optional(),
  }).optional(),
  requestedChange: z.object({
    starts_at: z.string().optional(),
    startsAt: z.string().optional(),
    party_size: z.coerce.number().optional(),
    partySize: z.coerce.number().optional(),
  }).optional(),
});

// =============================================================================
// Consumer Reservations & Tracking (from publicReservations.ts)
// =============================================================================

export const TrackEstablishmentVisitSchema = z.object({
  session_id: z.string().optional(),
  sessionId: z.string().optional(),
  path: z.string().max(500).optional(),
});

export const TrackCampaignEventSchema = z.object({
  event_type: z.string().optional(),
  eventType: z.string().optional(),
  type: z.string().optional(),
  session_id: z.string().optional(),
  sessionId: z.string().optional(),
});

export const CreateConsumerReservationSchema = z.object({
  establishment_id: z.string().optional(),
  establishmentId: z.string().optional(),
  booking_reference: z.string().optional(),
  bookingReference: z.string().optional(),
  starts_at: z.string().optional(),
  startsAt: z.string().optional(),
  slot_id: z.string().optional().nullable(),
  slotId: z.string().optional().nullable(),
  kind: z.string().optional(),
  status: z.string().optional(),
  party_size: z.coerce.number().optional(),
  partySize: z.coerce.number().optional(),
  amount_total: z.coerce.number().optional(),
  amountTotal: z.coerce.number().optional(),
  amount_deposit: z.coerce.number().optional(),
  amountDeposit: z.coerce.number().optional(),
  meta: z.record(z.unknown()).optional(),
});

export const CreateConsumerWaitlistSchema = z.object({
  starts_at: z.string().optional(),
  startsAt: z.string().optional(),
  slot_id: z.string().optional().nullable(),
  slotId: z.string().optional().nullable(),
  party_size: z.coerce.number().optional(),
  partySize: z.coerce.number().optional(),
});

export const MarkAllNotificationsReadSchema = z.object({
  ids: z.array(z.string()).optional(),
});

// =============================================================================
// Search & Promo (from publicConfig.ts)
// =============================================================================

export const ValidateBookingPromoCodeSchema = z.object({
  code: z.string().min(1),
  establishmentId: z.string().optional(),
});

export const SaveSearchHistorySchema = z.object({
  query: z.string().min(1),
  universe: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  results_count: z.coerce.number().optional().nullable(),
  filters_applied: z.record(z.unknown()).optional(),
  session_id: z.string().optional().nullable(),
});

export const TrackSearchClickSchema = z.object({
  establishment_id: z.string().min(1),
});

// =============================================================================
// Wheel (from wheelPublic.ts)
// =============================================================================

export const SpinWheelSchema = z.object({
  device_id: z.string().optional(),
});

/** GET /api/me/wheel/history */
export const WheelHistoryQuery = z.object({
  wheel_id: z.string().optional(),
});

// =============================================================================
// Contact Form (from publicContactForms.ts)
// =============================================================================

export const SubmitContactFormSchema = z.object({
  data: z.record(z.unknown()),
  utm_source: z.string().max(200).optional(),
  utm_medium: z.string().max(200).optional(),
  utm_campaign: z.string().max(200).optional(),
});

// =============================================================================
// Query Schemas — Public Establishments (from publicEstablishments.ts)
// =============================================================================

/** GET /api/public/establishments */
export const ListEstablishmentsQuery = z.object({
  q: z.string().optional(),
  universe: z.string().optional(),
  city: z.string().optional(),
  category: z.string().optional(),
  sort: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  offset: z.coerce.number().int().min(0).optional(),
  cursor: z.string().optional(),
  cs: z.string().optional(),
  cd: z.string().optional(),
  swLat: z.string().optional(),
  swLng: z.string().optional(),
  neLat: z.string().optional(),
  neLng: z.string().optional(),
  promo: z.string().optional(),
  promoOnly: z.string().optional(),
  open_now: z.string().optional(),
  instant_booking: z.string().optional(),
  amenities: z.string().optional(),
  price_range: z.string().optional(),
  personalized: z.string().optional(),
  lang: z.string().optional(),
});

/** GET /api/public/search/autocomplete */
export const SearchAutocompleteQuery = z.object({
  q: z.string().optional(),
  universe: z.string().optional(),
  city: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(20).optional(),
});

/** GET /api/public/search/popular */
export const PopularSearchesQuery = z.object({
  universe: z.string().optional(),
  city: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(20).optional(),
  lang: z.string().optional(),
});

/** GET /api/public/categories */
export const PublicCategoriesQuery = z.object({
  universe: z.string().optional(),
});

/** GET /api/public/category-images */
export const PublicCategoryImagesQuery = z.object({
  universe: z.string().optional(),
});

/** GET /api/public/home */
export const PublicHomeFeedQuery = z.object({
  city: z.string().optional(),
  lat: z.string().optional(),
  lng: z.string().optional(),
  universe: z.string().optional(),
  sessionId: z.string().optional(),
  session_id: z.string().optional(),
  favorites: z.string().optional(),
});

/** GET /api/public/landing/:slug */
export const PublicLandingPageQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  cs: z.string().optional(),
  cd: z.string().optional(),
  lang: z.string().optional(),
});

/** GET /api/public/universes */
export const PublicUniversesQuery = z.object({
  universe: z.string().optional(),
});

// =============================================================================
// Query Schemas — Public Config (from publicConfig.ts)
// =============================================================================

/** GET /api/public/home-cities */
export const PublicHomeCitiesQuery = z.object({
  country: z.string().optional(),
});

/** GET /api/public/search/history */
export const GetSearchHistoryQuery = z.object({
  limit: z.coerce.number().int().min(1).max(10).default(5).optional(),
  universe: z.string().optional(),
  session_id: z.string().optional(),
});

/** DELETE /api/public/search/history */
export const DeleteSearchHistoryQuery = z.object({
  query: z.string().optional(),
  id: z.string().optional(),
  session_id: z.string().optional(),
});

// =============================================================================
// Params Schemas (URL route parameters)
// =============================================================================

/** :slug param for landing pages */
export const SlugParams = z.object({ slug: z.string().min(1) });

/** :username param */
export const UsernameParams = z.object({ username: z.string().min(1) });

/** :ref param for establishments (slug or ID) */
export const EstablishmentRefParams = z.object({ ref: z.string().min(1) });

/** :token param for media quotes/invoices */
export const TokenParams = z.object({ token: z.string().min(1) });

/** :establishmentId param (UUID) */
export const EstablishmentIdParams = z.object({ establishmentId: zUuid });

/** :campaignId param (UUID) */
export const CampaignIdParams = z.object({ campaignId: zUuid });

/** :id param for consumer resources (UUID) */
export const ConsumerIdParams = z.object({ id: zUuid });

/** :deviceId param for trusted devices (UUID) */
export const DeviceIdParams = z.object({ deviceId: zUuid });

/** :id param for wheel preview (UUID) */
export const WheelIdParams = z.object({ id: zUuid });
