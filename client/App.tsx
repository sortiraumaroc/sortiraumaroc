import { Suspense, lazy, useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { BookingProvider } from "@/hooks/useBooking";
import { PlatformSettingsProvider } from "@/hooks/usePlatformSettings";
import { ScrollToTop } from "@/components/ScrollToTop";
import { UnifiedFAB } from "@/components/UnifiedFAB";
import { PushNotificationPrompt } from "@/components/PushNotificationPrompt";
import { PushForegroundToast } from "@/components/PushForegroundToast";
import { Footer } from "@/components/Footer";
import { PageLoading } from "@/components/PageLoading";
import { Toaster } from "@/components/ui/toaster";
import { NavigationResumeToast } from "@/components/NavigationResumeToast";
import { CookieConsent } from "@/components/CookieConsent";
import { useI18n } from "@/lib/i18n";
import type { AppLocale } from "@/lib/i18n/types";
import { ScrollProvider } from "@/lib/scrollContext";
import { initNavigationStateTracking } from "@/lib/navigationState";
import { BannerProvider } from "@/components/banners/BannerProvider";

const Index = lazy(() => import("./pages/Index"));
const Results = lazy(() => import("./pages/Results"));
const Restaurant = lazy(() => import("./pages/Restaurant"));
const Hotel = lazy(() => import("./pages/Hotel"));
const HotelBooking = lazy(() => import("./pages/HotelBooking"));
const Booking = lazy(() => import("./pages/Booking"));
const Profile = lazy(() => import("./pages/Profile"));
const BookingDetails = lazy(() => import("./pages/BookingDetails"));
const ProfileMessages = lazy(() => import("./pages/ProfileMessages"));
const MyUserQRPage = lazy(() => import("./pages/MyUserQRPage"));
const Faq = lazy(() => import("./pages/Faq"));
const Help = lazy(() => import("./pages/Help"));
const ContentPage = lazy(() => import("./pages/ContentPage"));
const Blog = lazy(() => import("./pages/Blog"));
const BlogArticle = lazy(() => import("./pages/BlogArticle"));
const BlogAuthor = lazy(() => import("./pages/BlogAuthor"));
const Videos = lazy(() => import("./pages/Videos"));
const Pro = lazy(() => import("./pages/Pro"));
const Conciergerie = lazy(() => import("./pages/Conciergerie"));
const Shopping = lazy(() => import("./pages/Shopping"));
const Loisir = lazy(() => import("./pages/Loisir"));
const Wellness = lazy(() => import("./pages/Wellness"));
const Culture = lazy(() => import("./pages/Culture"));
const Admin = lazy(() => import("./pages/Admin"));
const AddEstablishment = lazy(() => import("./pages/AddEstablishment"));
const NotFound = lazy(() => import("./pages/NotFound"));
const Parrainage = lazy(() => import("./pages/Parrainage"));

const PublicMediaQuote = lazy(() => import("./pages/PublicMediaQuote"));
const PublicMediaInvoice = lazy(() => import("./pages/PublicMediaInvoice"));
const PublicMediaCheckin = lazy(() => import("./pages/PublicMediaCheckin"));
const BookingConfirm = lazy(() => import("./pages/BookingConfirm"));
const ReviewSubmission = lazy(() => import("./pages/ReviewSubmission"));
const GestureResponse = lazy(() => import("./pages/GestureResponse"));
const MyQRCodePage = lazy(() => import("./pages/MyQRCodePage"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));

const Cities = lazy(() => import("./pages/Cities"));
const CityDetail = lazy(() => import("./pages/CityDetail"));

const PacksPage = lazy(() => import("./pages/Packs"));
const PackDetailPage = lazy(() => import("./pages/PackDetail"));
const RamadanOffersPage = lazy(() => import("./pages/RamadanOffers"));
const OnboardingRamadanPage = lazy(() => import("./pages/OnboardingRamadan"));
const WheelPage = lazy(() => import("./pages/WheelPage"));

const LandingPage = lazy(() => import("./pages/LandingPage"));

// Rental vehicle pages
const VehicleDetail = lazy(() => import("./pages/VehicleDetail"));
const RentalBooking = lazy(() => import("./pages/RentalBooking"));
const RentalBookingConfirm = lazy(() => import("./pages/RentalBookingConfirm"));

const UsernameRedirect = lazy(() =>
  import("./pages/UsernameRedirect").then((m) => ({
    default: m.UsernameRedirect,
  })),
);

// Direct booking page (book.sam.ma/:username)
const DirectBooking = lazy(() => import("./pages/DirectBooking"));

const Partner = lazy(() => import("./pages/Partner"));
const Partners = lazy(() => import("./pages/Partners"));
const PartnerDashboard = lazy(() =>
  import("./pages/partners/PartnerDashboard").then((m) => ({
    default: m.PartnerDashboard,
  })),
);
const PartnerMissionDetails = lazy(() =>
  import("./pages/partners/PartnerMissionDetails").then((m) => ({
    default: m.PartnerMissionDetails,
  })),
);
const PartnerProfile = lazy(() =>
  import("./pages/partners/PartnerProfile").then((m) => ({
    default: m.PartnerProfile,
  })),
);
const PartnerBilling = lazy(() =>
  import("./pages/partners/PartnerBilling").then((m) => ({
    default: m.PartnerBilling,
  })),
);
const PartnerMessages = lazy(() =>
  import("./pages/partners/PartnerMessages").then((m) => ({
    default: m.PartnerMessages,
  })),
);
const PartnerBloggerArticles = lazy(
  () => import("./pages/partners/PartnerBloggerArticles"),
);
const PartnerBloggerArticleEditor = lazy(
  () => import("./pages/partners/PartnerBloggerArticleEditor"),
);

const AdminDashboardPage = lazy(() =>
  import("./pages/admin/AdminDashboardPage").then((m) => ({
    default: m.AdminDashboardPage,
  })),
);
const AdminImpactPage = lazy(() =>
  import("./pages/admin/AdminImpactPage").then((m) => ({
    default: m.AdminImpactPage,
  })),
);
const AdminPartnerActivationKitPage = lazy(() =>
  import("./pages/admin/AdminPartnerActivationKitPage").then((m) => ({
    default: m.AdminPartnerActivationKitPage,
  })),
);
const AdminUsersPage = lazy(() =>
  import("./pages/admin/AdminUsersPage").then((m) => ({
    default: m.AdminUsersPage,
  })),
);
const AdminUserAccountActionsPage = lazy(() =>
  import("./pages/admin/AdminUserAccountActionsPage").then((m) => ({
    default: m.AdminUserAccountActionsPage,
  })),
);
const AdminUserDetailsPage = lazy(() =>
  import("./pages/admin/AdminUserDetailsPage").then((m) => ({
    default: m.AdminUserDetailsPage,
  })),
);
const AdminProsPage = lazy(() =>
  import("./pages/admin/AdminProsPage").then((m) => ({
    default: m.AdminProsPage,
  })),
);
const AdminProUserDetailsPage = lazy(() =>
  import("./pages/admin/AdminProUserDetailsPage").then((m) => ({
    default: m.AdminProUserDetailsPage,
  })),
);
const AdminEstablishmentsPage = lazy(() =>
  import("./pages/admin/AdminEstablishmentsPage").then((m) => ({
    default: m.AdminEstablishmentsPage,
  })),
);
const AdminEstablishmentDetailsPage = lazy(() =>
  import("./pages/admin/AdminEstablishmentDetailsPage").then((m) => ({
    default: m.AdminEstablishmentDetailsPage,
  })),
);
const AdminModerationPage = lazy(() =>
  import("./pages/admin/AdminModerationPage").then((m) => ({
    default: m.AdminModerationPage,
  })),
);
const AdminActivityTrackingPage = lazy(() =>
  import("./pages/admin/AdminActivityTrackingPage").then((m) => ({
    default: m.AdminActivityTrackingPage,
  })),
);
const AdminCollaboratorsPage = lazy(() =>
  import("./pages/admin/AdminCollaboratorsPage").then((m) => ({
    default: m.AdminCollaboratorsPage,
  })),
);
const AdminRolesPage = lazy(() =>
  import("./pages/admin/AdminRolesPage").then((m) => ({
    default: m.AdminRolesPage,
  })),
);
const AdminFinanceDiscrepanciesPage = lazy(() =>
  import("./pages/admin/AdminFinanceDiscrepanciesPage").then((m) => ({
    default: m.AdminFinanceDiscrepanciesPage,
  })),
);
const AdminNotificationsPage = lazy(() =>
  import("./pages/admin/AdminNotificationsPage").then((m) => ({
    default: m.AdminNotificationsPage,
  })),
);
const AdminAuditTestsPage = lazy(() =>
  import("./pages/admin/AdminAuditTestsPage").then((m) => ({
    default: m.AdminAuditTestsPage,
  })),
);
const AdminWaitlistPage = lazy(() =>
  import("./pages/admin/AdminWaitlistPage").then((m) => ({
    default: m.AdminWaitlistPage,
  })),
);
const AdminProductionCheckPage = lazy(() =>
  import("./pages/admin/AdminProductionCheckPage").then((m) => ({
    default: m.AdminProductionCheckPage,
  })),
);
const AdminRamadanModerationPage = lazy(() =>
  import("./pages/admin/AdminRamadanModerationPage"),
);

const AdminReservationsPage = lazy(() =>
  import("./pages/admin/AdminReservationsPage").then((m) => ({
    default: m.AdminReservationsPage,
  })),
);
const AdminPaymentsPage = lazy(() =>
  import("./pages/admin/AdminPaymentsPage").then((m) => ({
    default: m.AdminPaymentsPage,
  })),
);
const AdminReviewsPage = lazy(() =>
  import("./pages/admin/AdminPlaceholders").then((m) => ({
    default: m.AdminReviewsPage,
  })),
);
const AdminDealsPage = lazy(() =>
  import("./pages/admin/AdminDealsPage").then((m) => ({
    default: m.AdminDealsPage,
  })),
);
const AdminSupportPage = lazy(() =>
  import("./pages/admin/AdminSupportPage").then((m) => ({
    default: m.AdminSupportPage,
  })),
);
const AdminContentPage = lazy(() =>
  import("./pages/admin/AdminContentPage").then((m) => ({
    default: m.AdminContentPage,
  })),
);
const AdminImportExportPage = lazy(() =>
  import("./pages/admin/AdminImportExportPage").then((m) => ({
    default: m.AdminImportExportPage,
  })),
);
const AdminHomePage = lazy(() => import("./pages/admin/AdminHomePage"));
const AdminSettingsPage = lazy(() =>
  import("./pages/admin/AdminSettingsPage").then((m) => ({
    default: m.AdminSettingsPage,
  })),
);
const AdminLogsPage = lazy(() =>
  import("./pages/admin/AdminLogsPage").then((m) => ({
    default: m.AdminLogsPage,
  })),
);
const AdminPayoutRequestsPage = lazy(() =>
  import("./pages/admin/AdminPayoutRequestsPage").then((m) => ({
    default: m.AdminPayoutRequestsPage,
  })),
);
const AdminVisibilityPage = lazy(() =>
  import("./pages/admin/AdminVisibilityPage").then((m) => ({
    default: m.AdminVisibilityPage,
  })),
);
const AdminUsernameSubscriptionsPage = lazy(() =>
  import("./pages/admin/AdminUsernameSubscriptionsPage").then((m) => ({
    default: m.AdminUsernameSubscriptionsPage,
  })),
);
const AdminMediaFactoryJobsPage = lazy(() =>
  import("./pages/admin/AdminMediaFactoryJobsPage").then((m) => ({
    default: m.AdminMediaFactoryJobsPage,
  })),
);
const AdminMediaFactoryJobDetailsPage = lazy(() =>
  import("./pages/admin/AdminMediaFactoryJobDetailsPage").then((m) => ({
    default: m.AdminMediaFactoryJobDetailsPage,
  })),
);
const AdminMediaFactoryQaPage = lazy(() =>
  import("./pages/admin/AdminMediaFactoryQaPage").then((m) => ({
    default: m.AdminMediaFactoryQaPage,
  })),
);
const AdminMediaFactoryComptaPage = lazy(() =>
  import("./pages/admin/AdminMediaFactoryComptaPage").then((m) => ({
    default: m.AdminMediaFactoryComptaPage,
  })),
);
const AdminPartnersPage = lazy(() =>
  import("./pages/admin/AdminPartnersPage").then((m) => ({
    default: m.AdminPartnersPage,
  })),
);
const AdminMessagesPage = lazy(() =>
  import("./pages/admin/AdminMessagesPage").then((m) => ({
    default: m.AdminMessagesPage,
  })),
);
const AdminPrestatairesPage = lazy(() =>
  import("./pages/admin/AdminPrestatairesPage").then((m) => ({
    default: m.AdminPrestatairesPage,
  })),
);
const AdminMarketingProspectsPage = lazy(() =>
  import("./pages/admin/AdminMarketingProspectsPage").then((m) => ({
    default: m.AdminMarketingProspectsPage,
  })),
);
const AdminUserCleanupPage = lazy(() =>
  import("./pages/admin/AdminUserCleanupPage").then((m) => ({
    default: m.AdminUserCleanupPage,
  })),
);
const AdminAdsPage = lazy(() =>
  import("./pages/admin/AdminAdsPage").then((m) => ({
    default: m.AdminAdsPage,
  })),
);
const AdminReferralPage = lazy(() =>
  import("./pages/admin/AdminReferralPage").then((m) => ({
    default: m.AdminReferralPage,
  })),
);

const AdminEmailsTemplatesPage = lazy(() =>
  import("./pages/admin/emails/AdminEmailsTemplatesPage").then((m) => ({
    default: m.AdminEmailsTemplatesPage,
  })),
);
const AdminEmailsCampaignsPage = lazy(() =>
  import("./pages/admin/emails/AdminEmailsCampaignsPage").then((m) => ({
    default: m.AdminEmailsCampaignsPage,
  })),
);
const AdminEmailsSentPage = lazy(() =>
  import("./pages/admin/emails/AdminEmailsSentPage").then((m) => ({
    default: m.AdminEmailsSentPage,
  })),
);
const AdminEmailsSettingsPage = lazy(() =>
  import("./pages/admin/emails/AdminEmailsSettingsPage").then((m) => ({
    default: m.AdminEmailsSettingsPage,
  })),
);
const AdminEmailsProspectsPage = lazy(() =>
  import("./pages/admin/emails/AdminEmailsProspectsPage").then((m) => ({
    default: m.AdminEmailsProspectsPage,
  })),
);
const AdminNewsletterPage = lazy(() =>
  import("./pages/admin/emails/AdminNewsletterPage").then((m) => ({
    default: m.AdminNewsletterPage,
  })),
);
const AdminEmailsNewsletterHomepagePage = lazy(() =>
  import("./pages/admin/emails/AdminEmailsNewsletterHomepagePage").then((m) => ({
    default: m.AdminEmailsNewsletterHomepagePage,
  })),
);
const AdminEmailsAudiencesPage = lazy(() =>
  import("./pages/admin/emails/AdminEmailsAudiencesPage").then((m) => ({
    default: m.AdminEmailsAudiencesPage,
  })),
);
const AdminContactFormsPage = lazy(() =>
  import("./pages/admin/AdminContactFormsPage"),
);
const AdminContactFormEditPage = lazy(() =>
  import("./pages/admin/AdminContactFormEditPage"),
);
const AdminContactFormSubmissionsPage = lazy(() =>
  import("./pages/admin/AdminContactFormSubmissionsPage"),
);
const AdminClaimRequestsPage = lazy(() =>
  import("./pages/admin/AdminClaimRequestsPage"),
);
const AdminPushCampaignsPage = lazy(() =>
  import("./components/admin/AdminPushCampaignsDashboard"),
);
const AdminBannersPage = lazy(() =>
  import("./components/admin/AdminBannersDashboard"),
);
const AdminWheelPage = lazy(() =>
  import("./components/admin/AdminWheelDashboard"),
);
const AdminPacksModerationPage = lazy(() =>
  import("./components/packs/AdminPacksModerationDashboard").then((m) => ({
    default: m.AdminPacksModerationDashboard,
  })),
);
const AdminFinancesPage = lazy(() =>
  import("./components/packs/AdminFinancesDashboard").then((m) => ({
    default: m.AdminFinancesDashboard,
  })),
);
const AdminLoyaltyV2Page = lazy(() =>
  import("./components/loyaltyV2/AdminLoyaltyV2Dashboard").then((m) => ({
    default: m.AdminLoyaltyV2Dashboard,
  })),
);
const AdminCePage = lazy(() =>
  import("./pages/admin/AdminCePage").then((m) => ({
    default: m.AdminCePage,
  })),
);
const AdminPartnershipsPage = lazy(() =>
  import("./pages/admin/AdminPartnershipsPage").then((m) => ({
    default: m.AdminPartnershipsPage,
  })),
);
const AdminRentalPage = lazy(() =>
  import("./pages/admin/AdminRentalPage").then((m) => ({
    default: m.AdminRentalPage,
  })),
);

// CE (Comité d'Entreprise) pages
const CeAdmin = lazy(() => import("./pages/CeAdmin"));
const CeRegistration = lazy(() => import("./pages/CeRegistration"));
const CeAdvantages = lazy(() => import("./pages/CeAdvantages"));

// Public Contact Form
const ContactFormPage = lazy(() =>
  import("./pages/public/ContactFormPage"),
);

function LocaleLayout({ locale }: { locale: AppLocale }) {
  const { setLocale } = useI18n();

  useEffect(() => {
    setLocale(locale, { persist: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]); // setLocale is stable (created with useCallback([], []))

  const prefix = locale === "fr" ? "" : `/${locale}`;

  return (
    <>
      <Routes>
        <Route index element={<Index />} />
        <Route path="results" element={<Results />} />
        <Route path="restaurant/:id" element={<Restaurant />} />
        <Route path="hotel/:id" element={<Hotel />} />
        <Route path="hotel-booking/:hotelId" element={<HotelBooking />} />
        <Route path="booking/:establishmentId" element={<Booking />} />
        <Route path="profile" element={<Profile />} />
        <Route path="mon-qr" element={<MyUserQRPage />} />
        <Route
          path="profile/notifications"
          element={
            <Navigate to={`${prefix}/profile?tab=notifications`} replace />
          }
        />
        <Route
          path="profile/messages/:reservationId"
          element={<ProfileMessages />}
        />
        <Route
          path="profile/bookings/:bookingId"
          element={<BookingDetails />}
        />
        <Route path="faq" element={<Faq />} />
        <Route path="aide" element={<Help />} />
        <Route path="reset-password" element={<ResetPassword />} />
        <Route path="content/:slug" element={<ContentPage />} />
        {/* Short URLs for Google Auth Platform branding verification */}
        <Route path="privacy" element={<Navigate to={`${prefix}/content/politique-confidentialite`} replace />} />
        <Route path="terms" element={<Navigate to={`${prefix}/content/conditions-utilisation`} replace />} />
        <Route path="blog" element={<Blog />} />
        <Route path="blog/auteur/:slug" element={<BlogAuthor />} />
        <Route path="blog/:slug" element={<BlogArticle />} />
        <Route path="videos" element={<Videos />} />
        <Route path="pro" element={<Pro />} />
        <Route path="conciergerie" element={<Conciergerie />} />
        <Route path="partner" element={<Partner />} />
        <Route path="parrainage" element={<Parrainage />} />
        <Route
          path="pro/notifications"
          element={<Navigate to={`${prefix}/pro?tab=notifications`} replace />}
        />
        <Route
          path="ajouter-mon-etablissement"
          element={<AddEstablishment />}
        />
        <Route path="shopping/:id" element={<Shopping />} />
        <Route path="loisir/:id" element={<Loisir />} />
        <Route path="wellness/:id" element={<Wellness />} />
        <Route path="culture/:id" element={<Culture />} />

        {/* Packs pages */}
        <Route path="packs" element={<PacksPage />} />
        <Route path="packs/:id" element={<PackDetailPage />} />

        {/* Ramadan offers listing */}
        <Route path="ramadan-offers" element={<RamadanOffersPage />} />

        {/* Rental vehicle pages */}
        <Route path="vehicle/:id" element={<VehicleDetail />} />
        <Route path="rental-booking/:vehicleId" element={<RentalBooking />} />
        <Route path="rental-booking/confirm/:reservationId" element={<RentalBookingConfirm />} />

        {/* Wheel of Fortune */}
        <Route path="wheel" element={<WheelPage />} />

        {/* Cities pages */}
        <Route path="villes" element={<Cities />} />
        <Route path="villes/:slug" element={<CityDetail />} />

        {/* CE (Comité d'Entreprise) pages */}
        <Route path="ce/:code" element={<CeRegistration />} />
        <Route path="ce/avantages" element={<CeAdvantages />} />
        <Route path="ce-admin/:slug" element={<CeAdmin />} />

        {/* Username short URLs (e.g., sam.ma/@monrestaurant) */}
        <Route path="@:username" element={<UsernameRedirect />} />

        {/* Direct booking page (book.sam.ma/:username or sam.ma/book/:username) */}
        <Route path="book/:username" element={<DirectBooking />} />

        <Route path="quotes/:token" element={<PublicMediaQuote />} />
        <Route path="invoices/:token" element={<PublicMediaInvoice />} />
        <Route path="media/checkin" element={<PublicMediaCheckin />} />
        <Route path="form/:slug" element={<ContactFormPage />} />
        <Route path="booking/confirm/:token" element={<BookingConfirm />} />
        <Route path="review/:token" element={<ReviewSubmission />} />
        <Route path="review/gesture/:gestureId" element={<GestureResponse />} />
        <Route path="my-qr/:reservationId" element={<MyQRCodePage />} />

        {/* Avoid locale-prefixed admin routes */}
        <Route path="admin/*" element={<Navigate to="/admin" replace />} />

        {/* SEO Landing pages (e.g., /restaurants-casablanca, /sushi-tanger) */}
        <Route path=":landingSlug" element={<LandingPage />} />

        <Route path="*" element={<NotFound />} />
      </Routes>

      <Footer />
    </>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60_000, // 5 minutes
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function AppContent() {
  // Initialize navigation state tracking on mount
  useEffect(() => {
    initNavigationStateTracking();
  }, []);

  return (
    <>
      <ScrollToTop />
      <PlatformSettingsProvider>
        <BookingProvider>
          <BannerProvider>
          <Suspense fallback={<PageLoading />}>
          <Routes>
            {/* Partner Portal Routes */}
            <Route path="/partners" element={<Partners />}>
              <Route index element={<PartnerDashboard />} />
              <Route path="dashboard" element={<PartnerDashboard />} />
              <Route path="missions/:id" element={<PartnerMissionDetails />} />
              <Route path="profile" element={<PartnerProfile />} />
              <Route path="billing" element={<PartnerBilling />} />
              <Route path="messages" element={<PartnerMessages />} />
              {/* Blogger-specific routes */}
              <Route path="articles" element={<PartnerBloggerArticles />} />
              <Route path="articles/:id" element={<PartnerBloggerArticleEditor />} />
            </Route>

            <Route path="/admin" element={<Admin />}>
              <Route index element={<AdminDashboardPage />} />
              <Route path="impact" element={<Navigate to="/admin" replace />} />
              <Route
                path="partner-activation"
                element={<Navigate to="/admin" replace />}
              />
              <Route
                path="notifications"
                element={<AdminNotificationsPage />}
              />
              <Route path="audit-tests" element={<AdminAuditTestsPage />} />
              <Route
                path="production-check"
                element={<AdminProductionCheckPage />}
              />
              <Route
                path="production-media"
                element={<AdminMediaFactoryJobsPage />}
              />
              <Route
                path="production-media/:id"
                element={<AdminMediaFactoryJobDetailsPage />}
              />
              <Route
                path="production-media/qa"
                element={<AdminMediaFactoryQaPage />}
              />
              <Route
                path="production-media/compta"
                element={<AdminMediaFactoryComptaPage />}
              />
              <Route path="partners" element={<AdminPartnersPage />} />
              <Route path="prestataires" element={<AdminPrestatairesPage />} />
              <Route path="messages" element={<AdminMessagesPage />} />
              <Route path="users" element={<AdminUsersPage />} />
              <Route
                path="users/account-actions"
                element={<AdminUserAccountActionsPage />}
              />
              <Route path="users/:id" element={<AdminUserDetailsPage />} />
              <Route path="pros" element={<AdminProsPage />} />
              <Route path="pros/:id" element={<AdminProUserDetailsPage />} />
              <Route
                path="establishments"
                element={<AdminEstablishmentsPage />}
              />
              <Route
                path="establishments/:id"
                element={<AdminEstablishmentDetailsPage />}
              />
              <Route
                path="establishment-leads"
                element={<AdminClaimRequestsPage defaultTab="leads" />}
              />
              <Route path="moderation" element={<AdminModerationPage />} />
              <Route
                path="activity-tracking"
                element={<AdminActivityTrackingPage />}
              />
              <Route
                path="collaborators"
                element={<AdminCollaboratorsPage />}
              />
              <Route path="roles" element={<AdminRolesPage />} />
              <Route path="reservations" element={<AdminReservationsPage />} />
              <Route path="waitlist" element={<AdminWaitlistPage />} />
              <Route path="payments" element={<AdminPaymentsPage />} />
              <Route
                path="finance/discrepancies"
                element={<AdminFinanceDiscrepanciesPage />}
              />
              <Route
                path="finance/payout-requests"
                element={<AdminPayoutRequestsPage />}
              />
              <Route path="visibility" element={<AdminVisibilityPage />} />
              <Route path="username-subscriptions" element={<AdminUsernameSubscriptionsPage />} />
              <Route path="ads" element={<AdminAdsPage />} />
              <Route path="referral" element={<AdminReferralPage />} />
              <Route path="import-export" element={<AdminImportExportPage />} />
              <Route path="marketing/prospects" element={<AdminMarketingProspectsPage />} />
              <Route path="users/cleanup" element={<AdminUserCleanupPage />} />
              <Route path="reviews" element={<AdminReviewsPage />} />
              <Route path="deals" element={<AdminDealsPage />} />
              <Route path="support" element={<AdminSupportPage />} />
              <Route path="contact-forms" element={<AdminContactFormsPage />} />
              <Route path="contact-forms/:id" element={<AdminContactFormEditPage />} />
              <Route path="contact-forms/:id/submissions" element={<AdminContactFormSubmissionsPage />} />
              <Route path="claim-requests" element={<AdminClaimRequestsPage />} />
              <Route path="push-campaigns" element={<AdminPushCampaignsPage />} />
              <Route path="banners" element={<AdminBannersPage />} />
              <Route path="wheel" element={<AdminWheelPage />} />
              <Route path="packs-moderation" element={<AdminPacksModerationPage />} />
              <Route path="ramadan" element={<AdminRamadanModerationPage />} />
              <Route path="finances" element={<AdminFinancesPage />} />
              <Route path="loyalty-v2" element={<AdminLoyaltyV2Page />} />
              <Route path="ce" element={<AdminCePage />} />
              <Route path="partnerships" element={<AdminPartnershipsPage />} />
              <Route path="rental" element={<AdminRentalPage />} />
              <Route path="content" element={<AdminContentPage />} />
              <Route path="homepage" element={<AdminHomePage />} />
              <Route path="settings" element={<AdminSettingsPage />} />
              <Route
                path="emails"
                element={<Navigate to="/admin/emails/templates" replace />}
              />
              <Route
                path="emails/templates"
                element={<AdminEmailsTemplatesPage />}
              />
              <Route
                path="emails/newsletter"
                element={<AdminNewsletterPage />}
              />
              <Route
                path="emails/campaigns"
                element={<AdminEmailsCampaignsPage />}
              />
              <Route path="emails/sent" element={<AdminEmailsSentPage />} />
              <Route
                path="emails/settings"
                element={<AdminEmailsSettingsPage />}
              />
              <Route
                path="emails/prospects"
                element={<AdminEmailsProspectsPage />}
              />
              <Route
                path="emails/newsletter-homepage"
                element={<AdminEmailsNewsletterHomepagePage />}
              />
              <Route
                path="emails/audiences"
                element={<AdminEmailsAudiencesPage />}
              />
              <Route path="logs" element={<AdminLogsPage />} />
            </Route>

            {/* Standalone public onboarding (no Header/Footer) */}
            <Route path="/onboarding/ramadan" element={<OnboardingRamadanPage />} />

            <Route path="/fr/*" element={<LocaleLayout locale="fr" />} />
            <Route path="/en/*" element={<LocaleLayout locale="en" />} />
            <Route path="/es/*" element={<LocaleLayout locale="es" />} />
            <Route path="/it/*" element={<LocaleLayout locale="it" />} />
            <Route path="/ar/*" element={<LocaleLayout locale="ar" />} />
            <Route path="/*" element={<LocaleLayout locale="fr" />} />
          </Routes>
        </Suspense>

          <Toaster />
          <NavigationResumeToast />
          <CookieConsent />
          <PushNotificationPrompt />
          <PushForegroundToast />
          <UnifiedFAB />
          </BannerProvider>
        </BookingProvider>
      </PlatformSettingsProvider>
    </>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ScrollProvider>
          <AppContent />
        </ScrollProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
