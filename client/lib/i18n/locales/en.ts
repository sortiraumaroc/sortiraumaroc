import type { TranslationKey } from "../translation-keys";

const en: Partial<Record<TranslationKey, string>> = {
    // Common
    "common.close": "Close",
    "common.cancel": "Cancel",
    "common.confirm": "Confirm",
    "common.continue": "Continue",
    "common.back": "Back",
    "common.prev": "Previous",
    "common.next": "Next",
    "common.pdf": "PDF",
    "common.error.load_failed": "Loading error",
    "currency.mad.short": "MAD",
    "common.loading": "Loading…",
    "common.refresh": "Refresh",
    "common.impossible": "Not possible",
    "common.error.generic": "Error",
    "common.error.unexpected": "Unexpected error",
    "common.clear": "Clear",
    "common.edit": "Edit",
    "common.reset": "Reset",
    "common.help": "Help",

    // Navigation Resume
    "navigation.resume.title": "Resume navigation",
    "navigation.resume.description": "You started a search. Would you like to continue?",
    "navigation.resume.continue": "Continue",
    "navigation.resume.new_search": "New search",
    "navigation.resume.search": "Your search",
    "navigation.resume.establishment_page": "Establishment page",
    "navigation.resume.just_now": "Just now",
    "navigation.resume.minutes_ago": "{n} min ago",
    "navigation.resume.hours_ago": "{n}h ago",

    "content.toc": "Table of contents",
    "content.related_links": "Related links",

    "blog.index.title": "Blog",
    "blog.index.subtitle": "News, guides and tips for your outings in Morocco.",
    "blog.index.error": "Unable to load articles.",
    "blog.index.empty.title": "No articles yet",
    "blog.index.empty.subtitle":
      "Publish an article from the admin dashboard to see it here.",
    "blog.index.back_home": "Back to home",

    "common.coming_soon": "Coming soon",
    "common.change": "Change",
    "common.user": "User",
    "common.today": "Today",
    "common.at": "at",
    "common.tomorrow": "Tomorrow",
    "common.time_placeholder": "hh:mm",
    "common.person.one": "guest",
    "common.person.other": "guests",
    "timepicker.title": "Choose a time",

    // Persons
    "persons.title": "People",
    "persons.button.confirm": "Confirm",
    "persons.action.add": "Add {label}",
    "persons.action.remove": "Remove {label}",
    "persons.age_group.age0_2": "0–2 years",
    "persons.age_group.age3_6": "3–6 years",
    "persons.age_group.age6_12": "6–12 years",
    "persons.age_group.age12_17": "12–17 years",
    "persons.age_group.age18_plus": "18+ years",

    // Language
    "language.french": "Français",
    "language.english": "English",
    "language.switcher.label": "Language",
    "language.suggestion.title":
      "Sortir Au Maroc is available in Français / English.",
    "language.suggestion.subtitle":
      "Choose your language. You can change it anytime.",

    // Header
    "header.add_establishment.full": "Add my place",
    "header.add_establishment.short": "Add",
    "header.profile.menu": "Profile menu",
    "header.profile.photo_alt": "Profile photo",
    "header.profile.my_account": "My account",
    "header.profile.my_profile": "My profile",

    // NEW: auto-promotion waitlist logic
    "profile.bookings.waitlist_offer": "Spot available",
    "header.profile.logout": "Sign out",
    "header.login": "Sign in",
    "header.brand": "Sortir Au Maroc",
    "header.pro_space": "Pro space",
    "header.logo_alt": "Sortir Au Maroc",

    "header.pro_conflict.title": "Pro sign-out required",
    "header.pro_conflict.description":
      "You are signed in to the Pro area. To sign in as a customer, please sign out from Pro first.",
    "header.pro_conflict.go_to_pro": "Go to my Pro area",
    "header.pro_conflict.logout_pro": "Sign out from Pro",

    // Auth
    "auth.title.login": "Sign in to Sortir Au Maroc",
    "auth.title.forgot": "Forgot password?",
    "auth.title.signup": "Create a free account",

    "auth.subtitle.login":
      "Access your bookings, favorites and exclusive offers",
    "auth.subtitle.forgot":
      "Enter your email or phone number to receive a reset link.",
    "auth.subtitle.signup":
      "Create your account to access your bookings, favorites and exclusive offers.",

    "auth.field.email_or_phone.label": "Email or phone",
    "auth.field.email_or_phone.placeholder":
      "you@email.com or +212 6XX XXX XXX",
    "auth.field.password.label": "Password",

    "auth.link.forgot_password": "Forgot password?",
    "auth.link.create_account": "Create an account",
    "auth.link.login": "Sign in",

    "auth.password.show": "Show password",
    "auth.password.hide": "Hide password",

    "auth.button.login": "Sign in",
    "auth.button.login_busy": "Signing in…",
    "auth.button.demo_login": "Demo login",

    "auth.or_continue_with": "Or continue with",
    "auth.button.continue_with_google": "Continue with Google",
    "auth.button.continue_with_apple": "Continue with Apple",
    "auth.button.continue_with_facebook": "Continue with Facebook",

    "auth.button.send_reset": "Send link",
    "auth.button.send_reset_busy": "Sending…",

    "auth.button.signup": "Create my account",
    "auth.button.signup_busy": "Creating…",

    "auth.note.no_account": "No account?",
    "auth.note.have_account": "Already have an account?",

    "auth.error.demo_login_failed":
      "Unable to sign in to the demo account. Please try again.",
    "auth.error.phone_login_unavailable":
      "Phone login isn't available yet. Please use an email.",
    "auth.error.invalid_credentials":
      "Incorrect credentials or account not found.",
    "auth.error.reset_by_phone_unavailable":
      "Password reset by phone isn't available. Please use your email.",
    "auth.error.reset_send_failed":
      "Unable to send the reset link. Please try again.",
    "auth.error.signup_requires_email": "For now, sign up requires an email.",
    "auth.error.signup_failed":
      "Unable to create the account. Check your email and try again.",
    "auth.error.too_many_attempts":
      "Too many attempts. Please wait a few seconds and try again.",
    "auth.error.signup_spam_detected": "Sign up blocked (anti-spam detection).",
    "auth.error.social_unconfigured": "{provider} login isn't configured yet.",
    "auth.error.social_login_failed":
      "Unable to sign in with this social provider. Please try again.",

    "auth.notice.reset_link_sent": "Reset link sent. Check your inbox.",
    "auth.notice.account_created":
      "Account created. Check your email to confirm, then sign in again.",

    // Phone Auth
    "auth.phone.title": "Phone login",
    "auth.phone.subtitle": "Enter your phone number to receive a verification code via SMS.",
    "auth.phone.label": "Phone number",
    "auth.phone.hint": "You will receive an SMS with a 6-digit code.",
    "auth.phone.send_code": "Send code",
    "auth.phone.verify_title": "Verification",
    "auth.phone.code_sent_to": "Code sent to",
    "auth.phone.resend_code": "Resend code",
    "auth.phone.resend_in": "Resend in",
    "auth.phone.success_title": "Login successful",
    "auth.phone.success_message": "You are now logged in!",
    "auth.phone.redirecting": "Redirecting...",
    "auth.phone.use_email_instead": "Use email instead",
    "auth.phone.use_phone_instead": "Login with phone",
    "auth.phone.error.invalid_number": "Invalid phone number.",
    "auth.phone.error.send_failed": "Unable to send code. Please try again.",
    "auth.phone.error.too_many_requests": "Too many attempts. Please try again in a few minutes.",
    "auth.phone.error.invalid_code": "Incorrect code. Please check and try again.",
    "auth.phone.error.code_expired": "Code has expired. Please request a new one.",
    "auth.phone.error.verify_failed": "Verification failed. Please try again.",
    "auth.phone.error.not_configured": "Phone authentication is not available at the moment.",

    // Footer
    "footer.brand": "Sortir Au Maroc",
    "footer.section.partners": "Partners",
    "footer.section.professionals": "Professionals",
    "footer.section.help": "Help",
    "footer.section.legal": "Legal",
    "footer.section.download_app": "Download the app",

    "footer.link.discover": "Discover",
    "footer.link.about": "About",
    "footer.link.contact": "Contact",
    "footer.link.blog": "Blog",
    "footer.link.videos": "Videos",
    "footer.link.careers": "Careers",

    "footer.link.become_sponsor": "Become a sponsor",
    "footer.link.for_providers": "For providers",
    "footer.link.partner_space": "Partner Space",

    "footer.link.create_pro_account": "Create a Pro account",
    "footer.link.pro_space": "Pro space",
    "footer.link.pricing_offers": "Pricing & offers",
    "footer.link.features": "Features",
    "footer.link.request_demo": "Request a demo",

    "footer.link.faq": "FAQ",
    "footer.link.contact_phone": "Contact us · 05 20 12 34 56",
    "footer.link.terms": "Terms of use",
    "footer.link.privacy": "Privacy policy",
    "footer.link.legal_notice": "Legal notice",
    "footer.link.partner_charter": "Partner venue charter",
    "footer.link.refund_policy": "Refund policy",
    "footer.link.anti_no_show_policy": "Anti no-show policy",

    "footer.link.apple_store": "Apple Store",
    "footer.link.google_play": "Google Play",
    "footer.link.admin_aria": "Open Admin dashboard",

    "footer.section.discover": "Discover",
    "footer.section.follow_us": "Follow us",
    "footer.install_app": "Install the app",

    "footer.copyright_suffix": ". All rights reserved.",
    "footer.ramadan_moubarak": "Ramadan Mubarak",

    // PWA
    "pwa.update_available": "New version available",
    "pwa.update_description": "Click to update the application.",
    "pwa.update_button": "Update",
    "pwa.ios_guide_title": "Install the sam.ma webapp",
    "pwa.ios_guide_subtitle": "Add the app to your home screen for quick access.",
    "pwa.ios_step1_title": "Tap the Share button",
    "pwa.ios_step1_desc": "At the bottom of Safari, tap the share icon (square with an upward arrow).",
    "pwa.ios_step2_title": "\"Add to Home Screen\"",
    "pwa.ios_step2_desc": "Scroll through the options and tap \"Add to Home Screen\".",
    "pwa.ios_step3_title": "Tap Add",
    "pwa.ios_step3_desc": "Confirm by tapping \"Add\" in the top right corner. Done!",
    "pwa.ios_guide_ok": "Got it",

    // Push notifications
    "push.prompt_title": "Enable notifications",
    "push.prompt_description": "Get real-time booking confirmations and waitlist alerts.",
    "push.prompt_enable": "Enable",
    "push.prompt_enabling": "Enabling…",
    "push.prompt_later": "Later",

    // Profile preferences
    "profile.prefs.section_communication": "Communication",
    "profile.prefs.newsletter_desc": "Receive news, deals and selections.",
    "profile.prefs.reminders": "Booking reminders",
    "profile.prefs.reminders_desc": "Receive a reminder before your outings.",
    "profile.prefs.whatsapp_desc": "Allow confirmations and messages via WhatsApp.",
    "profile.prefs.section_push": "Push notifications",
    "profile.prefs.push_blocked": "Notifications are blocked in your browser settings. To re-enable them, change the site permissions in your browser.",
    "profile.prefs.push_enabled": "Push notifications",
    "profile.prefs.push_enabled_desc": "Receive notifications on this device.",
    "profile.prefs.push_bookings": "Bookings",
    "profile.prefs.push_bookings_desc": "Confirmations, reminders and booking updates.",
    "profile.prefs.push_waitlist": "Waitlist",
    "profile.prefs.push_waitlist_desc": "Alerts when a spot opens up.",
    "profile.prefs.push_marketing": "Deals & promotions",
    "profile.prefs.push_marketing_desc": "Special offers and personalized recommendations.",

    // Newsletter
    "newsletter.title": "Newsletter",
    "newsletter.subtitle": "Get our best deals and updates",
    "newsletter.placeholder": "Your email",
    "newsletter.button": "OK",
    "newsletter.success": "Thanks! You're subscribed.",
    "newsletter.error.generic": "An error occurred. Please try again.",
    "newsletter.error.invalid_email": "Invalid email address",

    // Videos page
    "videos.page.title": "Videos",
    "videos.page.subtitle": "Discover the best establishments in Morocco through our exclusive videos.",
    "videos.page.empty_title": "No videos available",
    "videos.page.empty_description": "Come back soon to discover our new videos.",

    // Support pages
    "help.title": "Help & Support",
    "help.subtitle": "FAQ, support tickets and chat (available 9am–7pm).",
    "help.login_required":
      "To create a ticket or use chat, you must be signed in. The FAQ remains available for everyone.",
    "help.tab.faq": "FAQ",
    "help.tab.tickets": "Tickets",
    "help.tab.chat": "Chat",

    "faq.title": "Frequently asked questions",
    "faq.subtitle":
      "Find answers to the most common questions: bookings, cancellations, payments and support.",
    "faq.button.access_help": "Open help (tickets & chat)",
    "faq.phone_support.title": "Phone support",
    "faq.phone_support.hours": " · 9am–7pm",

    "faq.section.title": "FAQ · Frequently asked questions",
    "faq.section.subtitle":
      "Type a few keywords (e.g., “cancellation”, “payment”, “late”).",
    "faq.section.search_placeholder": "Search the FAQ…",
    "faq.section.categories": "Categories",
    "faq.section.category_all": "All categories",
    "faq.section.category_all_short": "All",
    "faq.section.results": "{count} result(s)",
    "faq.section.empty": "No results. Try different keywords.",
    "faq.section.error_load": "Unable to load the FAQ. Please try again.",

    "faq.category.reservations": "Bookings",
    "faq.category.reservations.desc":
      "Confirmations, times, party size and booking details.",
    "faq.category.paiements": "Payments",
    "faq.category.paiements.desc":
      "Deposits, invoices, payment methods and refunds.",
    "faq.category.annulations": "Cancellations",
    "faq.category.annulations.desc": "Change a date, cancel, venue policies.",
    "faq.category.comptes_utilisateurs": "User accounts",
    "faq.category.comptes_utilisateurs.desc":
      "Sign-in, personal data and account security.",
    "faq.category.comptes_pro": "Pro accounts",
    "faq.category.comptes_pro.desc":
      "Pro area, visibility and booking management.",
    "faq.category.packs_offres": "Packs & offers",
    "faq.category.packs_offres.desc":
      "Offers, packs, visibility and conditions.",
    "faq.category.support_general": "General support",
    "faq.category.support_general.desc":
      "Assistance, tickets, contact and general questions.",

    // SEO
    "seo.home.title": "Sortir Au Maroc — Book the best experiences in Morocco",
    "seo.home.description":
      "Find and book restaurants, leisure, spas, hotels and experiences in Morocco. Simple booking, confirmations and support.",
    "seo.home.keywords":
      "booking, restaurant, leisure, spa, hotel, activities, Morocco",

    // Home
    "home.hero.title": "Discover and book the best activities",
    "home.hero.subtitle":
      "Restaurants, leisure, wellness and more. Book online in Morocco",

    "home.universe.restaurants": "Food & drink",
    "home.universe.sport": "Sport & wellness",
    "home.universe.leisure": "Leisure",
    "home.universe.accommodation": "Accommodation",
    "home.universe.culture": "Culture",
    "home.universe.shopping": "Shopping",
    "home.universe.rentacar": "Get around",

    "home.sections.best_offers.title": "Our best deals",
    "home.sections.selected_for_you.title": "Restaurants selected for you",
    "home.sections.selected_for_you.activities.title":
      "Activities selected for you",
    "home.sections.selected_for_you.sport.title":
      "Sport & wellness selected for you",
    "home.sections.selected_for_you.accommodation.title":
      "Accommodations selected for you",
    "home.sections.selected_for_you.culture.title": "Culture selected for you",
    "home.sections.selected_for_you.shopping.title":
      "Shopping selected for you",
    "home.sections.selected_for_you.rentacar.title":
      "Vehicles selected for you",
    "home.sections.nearby.title": "Near you",
    "home.sections.most_booked.title": "Most booked this month",
    "home.sections.open_now.title": "Open now",
    "home.sections.trending.title": "Trending this month",
    "home.sections.new.title": "New on SAM",
    "home.sections.top_rated.title": "Top rated",
    "home.sections.deals.title": "Best deals right now",
    "home.sections.themed.romantic": "For a romantic evening",
    "home.sections.themed.brunch": "Craving brunch?",
    "home.sections.themed.lunch": "For your lunch break",
    "home.sections.themed.ramadan": "Ftour & Shour selection",
    "home.sections.ramadan.title": "Ramadan Special",
    "home.sections.ramadan.subtitle": "Discover the best Ftour options",

    // Thousand and One Nights Theme — Ramadan 2026
    "home.ramadan.hero.title": "Ramadan Mubarak",
    "home.ramadan.hero.subtitle": "Experience exceptional evenings with Morocco's finest venues",
    "home.ramadan.announcement": "Ramadan Mubarak! Discover our special Ftour & Shour offers",
    "home.ramadan.cta.title": "Experience an exceptional Ramadan",
    "home.ramadan.cta.description": "The finest venues in the Kingdom await you for an unforgettable Ftour",
    "home.ramadan.cta.button": "View Ramadan offers",
    "home.ramadan.category.ftour": "Ramadan Ftour",
    "home.ramadan.badge.ftour": "Ftour",

    "home.categories.restaurants.title": "What are you craving?",
    "home.categories.sport.title": "What activity interests you?",
    "home.categories.loisirs.title": "Looking for leisure?",
    "home.categories.hebergement.title": "What type of accommodation?",
    "home.categories.culture.title": "Culture calling?",
    "home.categories.shopping.title": "Ready to shop?",
    "home.categories.rentacar.title": "Rent your vehicle",
    "home.sections.top100.title": "Discover the Top 100",
    "home.sections.top100.image_alt": "Top 100",
    "home.sections.view_all": "View all",
    "home.sections.view_more": "SEE MORE",

    "home.cards.reviews_count": "{count} reviews",
    "home.cards.next_slot": "Next slot: {slot}",
    "home.cards.promo_badge": "-{percent}%",
    "home.cards.curated_badge": "Editor's pick",
    "home.cards.month_reservations_label": "Bookings (30d)",
    "home.cards.view_details_aria": "View details: {name}",

    "home.how_it_works.title": "How it works?",
    "home.how_it_works.subtitle":
      "Book your favorite activity in just a few clicks",
    "home.how_it_works.step1.title": "Discover",
    "home.how_it_works.step1.text":
      "Explore restaurants and activities near you",
    "home.how_it_works.step2.title": "Select",
    "home.how_it_works.step2.text":
      "Choose your date, time and number of people",
    "home.how_it_works.step3.title": "Pay",
    "home.how_it_works.step3.text": "Complete your booking securely",
    "home.how_it_works.step4.title": "Enjoy",
    "home.how_it_works.step4.text":
      "Receive your confirmation and the venue guide",

    "home.owner_block.image_alt": "Venue owner",
    "home.owner_block.title": "Do you own a venue?",
    "home.owner_block.subtitle": "Register your venue",
    "home.owner_block.paragraph":
      "Tell us about your venue and we’ll contact you as soon as possible.",
    "home.owner_block.button_more": "MORE INFORMATION",
    "home.owner_block.already_partner": "Already a partner",
    "home.owner_block.already_partner_text":
      "Access your dashboard to manage your bookings, your information, your categories (taxonomies), your offers, your invoices and your messaging. Need help? Contact us via chat.",
    "home.owner_block.dashboard_button": "DASHBOARD LOGIN",

    "home.featured_offers.items.discount_50.title": "Up to 50% off",
    "home.featured_offers.items.discount_50.badge": "Deal of the moment",
    "home.featured_offers.items.weekend_brunch.title": "Weekend brunch",
    "home.featured_offers.items.weekend_brunch.badge": "Featured",
    "home.featured_offers.items.terrace_night.title": "Terrace night",
    "home.featured_offers.items.terrace_night.badge": "Limited offer",
    "home.featured_offers.items.beach_vibes.title": "Beach vibes",
    "home.featured_offers.items.beach_vibes.badge": "New",
    "home.featured_offers.items.tasting_menu.title": "Tasting menu",
    "home.featured_offers.items.tasting_menu.badge": "Special",
    "home.featured_offers.items.culinary_experience.title":
      "Culinary experience",
    "home.featured_offers.items.culinary_experience.badge": "Exclusive",

    // Homepage sections
    "home.search.placeholder.restaurants": "Cuisine, restaurant, dish...",
    "home.search.placeholder.restaurants_detailed": "Cuisine, restaurant name, dish...",
    "home.search.placeholder.accommodation": "Hotel, type, amenities...",
    "home.search.placeholder.accommodation_detailed": "Hotel name, type, amenities...",
    "home.search.placeholder.activities": "Activity, place...",
    "home.search.placeholder.activities_detailed": "Activity, place, type...",
    "home.cities.title": "Other cities in Morocco",
    "home.cities.see_more": "See more",
    "home.videos.title": "Videos",
    "home.videos.book": "Book",
    "home.videos.close": "Close",
    "home.videos.fullscreen": "Fullscreen",
    "home.blog.title": "Blog",
    "home.blog.read": "Read",
    "home.blog.see_more": "See more",
    "home.sponsored": "Sponsored",
    "home.how_it_works.default.exclusive_offers.title": "Exclusive offers",
    "home.how_it_works.default.exclusive_offers.description": "Enjoy unique discounts and perks at our partner venues across Morocco.",
    "home.how_it_works.default.best_choice.title": "The best choice",
    "home.how_it_works.default.best_choice.description": "A curated selection of venues for all your needs: restaurants, leisure, wellness...",
    "home.how_it_works.default.verified_reviews.title": "Verified reviews",
    "home.how_it_works.default.verified_reviews.description": "Authentic recommendations from our community to guide your choices.",
    "home.how_it_works.default.easy_booking.title": "Easy booking",
    "home.how_it_works.default.easy_booking.description": "Book instantly, for free, anywhere and anytime. 24/7.",

    // Results / Listing
    "results.search": "Search",
    "results.filters": "Filters",
    "results.view.list": "List",
    "results.view.map": "Map",
    "results.summary.found": "{label} found",
    "results.summary.showing": "Showing",
    "results.geolocation.enable": "Enable geolocation to see distance",
    "results.no_results.title": "No establishments found",
    "results.no_results.body": "We couldn't find any establishment matching your criteria.",
    "results.no_results.suggestion": "Try adjusting your filters or explore other destinations for your next outing with your partner, friends or family!",
    "results.no_results.open_filters": "Adjust filters",
    "results.no_results.new_search": "New search",
    "results.sponsored": "Sponsored",
    "results.status.open": "Open",
    "results.status.closed": "Closed",
    "results.promo.ongoing": "Ongoing offer",
    "results.favorite.add": "Add to favorites",
    "results.favorite.remove": "Remove from favorites",
    "results.highlight.today_prefix": "Today: ",
    "results.offer.up_to": "Up to -{percent}%",
    "results.action.book": "Book",
    "results.action.view": "View",
    "results.action.view_hotel": "View hotel",
    "results.load_more": "Show {count} more results",
    "results.people.option.1": "1 guest",
    "results.people.option.2": "2 guests",
    "results.people.option.3": "3 guests",
    "results.people.option.4": "4 guests",
    "results.people.option.5_plus": "5+ guests",
    "results.search_placeholder": "Where do you want to go?",
    "results.filter.date": "Date",
    "results.filter.time": "Time",
    "results.filter.persons_short": "pers.",
    "results.filter.promotions": "Promotions",
    "results.filter.best_rated": "Top rated",
    "results.filter.cuisine_type": "Cuisine type",
    "results.filter.ambiance": "Ambiance",
    "results.filter.sort_and_filter": "Sort & filter",
    "results.filter.open_now": "Open now",
    "results.filter.instant_booking": "Instant booking",
    "results.filter.terrace": "Terrace",
    "results.filter.parking": "Parking",
    "results.filter.kid_friendly": "Kid-friendly",
    "results.filter.wifi": "Wi-Fi",
    "results.filter.budget": "Budget",
    "results.filter.price_1": "€",
    "results.filter.price_2": "€€",
    "results.filter.price_3": "€€€",
    "results.filter.price_4": "€€€€",
    "results.filter.no_results_filters": "No results with these filters",
    "results.filter.reset_filters": "Reset filters",

    // Prompt 12 — Personalization
    "search.personalized": "Results adapted to your preferences",
    "search.personalized.tooltip": "Based on your bookings and past searches",
    "search.personalized.disable": "Disable personalization",
    "search.personalized.enable": "Enable personalization",
    "settings.personalization": "Personalized search results",
    "settings.personalization.description": "Adapt result order based on your tastes",

    // Search fallback (Prompt 13)
    "search.no_results": "No results for \"{query}\"",
    "search.did_you_mean": "Did you mean?",
    "search.did_you_mean.results": "{count} results",
    "search.similar_results": "Similar results",
    "search.relax_filters": "Try with fewer filters",
    "search.relax_filters.without": "Without {filter}",
    "search.reset_all_filters": "Reset all filters",
    "search.nearby": "Available nearby",
    "search.nearby.distance": "{km} km away",
    "search.nearby.see_results": "See {count} results in {city}",
    "search.popular_fallback": "Most popular",
    "search.also_like": "You may also like",

    // Search
    "search.field.city.placeholder": "City or area",
    "search.field.activity.placeholder": "Activity or place",
    "search.validation.minimum_people": "Minimum: {count} people",

    "search.placeholder.unified": "Cuisine, place name, dish...",
    "search.placeholder.restaurant_type": "Type of place",
    "search.title.choose_restaurant_type": "Choose a type of place",
    "search.placeholder.accommodation_type": "Accommodation type",
    "search.title.choose_accommodation_type": "Choose an accommodation type",
    "search.placeholder.culture_type": "Type of outing",
    "search.title.choose_culture_type": "Choose a type of outing",
    "search.placeholder.shopping_type": "Store type",
    "search.title.choose_shopping_type": "Choose a store type",
    "search.placeholder.sport_activity_type": "Activity type",
    "search.title.choose_sport_activity_type": "Choose an activity type",
    "search.placeholder.prestation_type": "Service type",
    "search.title.choose_prestation_type": "Choose a service type",

    "search.restaurant_type.gastronomique": "Fine dining",
    "search.restaurant_type.rooftop": "Rooftop",
    "search.restaurant_type.plage": "Beach restaurant",
    "search.restaurant_type.brunch": "Organized brunch",
    "search.restaurant_type.cafe": "Café",
    "search.restaurant_type.fast_food": "Fast food",
    "search.restaurant_type.bistronomie": "Bistronomy",
    "search.restaurant_type.familial": "Family restaurant",

    "search.shopping_type.mode": "Fashion",
    "search.shopping_type.chaussures": "Shoes",
    "search.shopping_type.beaute_parfumerie": "Beauty / perfumery",
    "search.shopping_type.optique": "Optics",
    "search.shopping_type.bijoux": "Jewelry",
    "search.shopping_type.maison_deco": "Home / decor",
    "search.shopping_type.epicerie_fine": "Fine grocery",
    "search.shopping_type.artisanat": "Crafts",
    "search.shopping_type.concept_store": "Concept store",
    "search.shopping_type.autres": "Other",

    // Rentacar search fields
    "search.placeholder.vehicle_type": "Vehicle type",
    "search.title.choose_vehicle_type": "Choose a vehicle type",
    "search.rentacar.pickup_location": "Pick-up location",
    "search.rentacar.dropoff_location": "Drop-off location",
    "search.rentacar.same_dropoff": "Same drop-off location",
    "search.rentacar.same_dropoff_checkbox": "Return to same location",
    "search.rentacar.pickup_date": "Pick-up date",
    "search.rentacar.dropoff_date": "Drop-off date",
    "search.rentacar.pickup_time": "Pick-up time",
    "search.rentacar.dropoff_time": "Drop-off time",
    "search.rentacar.driver_age": "Driver age",
    "search.rentacar.young_driver_warning": "Driver under 30 or over 70 years old",
    "search.rentacar.young_driver_description": "Young drivers and senior drivers may have to pay additional fees.",
    "search.rentacar.select_dates": "Select dates",

    // Search history
    "search.history.recent_searches": "Recent searches",
    "search.history.clear_all": "Clear all",
    "search.history.remove": "Remove",

    "results.universe.restaurants.count_label": "restaurants",
    "results.universe.sport.count_label": "wellness activities",
    "results.universe.loisirs.count_label": "leisure activities",
    "results.universe.hebergement.count_label": "accommodations",
    "results.universe.culture.count_label": "cultural sites",
    "results.universe.shopping.count_label": "shopping places",
    "results.universe.rentacar.count_label": "vehicles",
    "results.universe.default.count_label": "results",

    // Vehicle card translations
    "vehicle.badge.super_offer": "Super offer",
    "vehicle.badge.member_price": "Member price",
    "vehicle.feature.unlimited_mileage": "Unlimited mileage",
    "vehicle.cashback": "Earn {amount} MAD cashback",
    "vehicle.benefit.free_cancellation": "Free cancellation",
    "vehicle.benefit.basic_insurance": "Basic collision insurance",
    "vehicle.benefit.online_checkin": "Online check-in",
    "vehicle.positive_reviews": "positive reviews",
    "vehicle.discount": "discount",
    "vehicle.price_per_day": "per day",
    "vehicle.price_total": "total",
    "vehicle.or_similar": "or similar",
    "vehicle.seats": "{count} seats",
    "vehicle.sort_filter": "Sort and filter",
    "vehicle.total_taxes_included": "Total amount, taxes and fees included",
    "vehicle.sort_info": "How our sorting works",

    // Rental module
    "rental.title": "Vehicle Rental",
    "rental.search.title": "Find your vehicle",
    "rental.search.pickup_city": "Pick-up city",
    "rental.search.dropoff_city": "Drop-off city",
    "rental.search.pickup_date": "Pick-up date",
    "rental.search.dropoff_date": "Drop-off date",
    "rental.search.pickup_time": "Pick-up time",
    "rental.search.dropoff_time": "Drop-off time",
    "rental.search.vehicle_type": "Vehicle type",
    "rental.search.no_results": "No vehicles available for these criteria",
    "rental.category.economy": "Economy",
    "rental.category.compact": "Compact",
    "rental.category.midsize": "Midsize",
    "rental.category.fullsize": "Full-size",
    "rental.category.suv": "SUV",
    "rental.category.luxury": "Luxury",
    "rental.category.van": "Van",
    "rental.category.convertible": "Convertible",
    "rental.booking.step1": "Options",
    "rental.booking.step2": "Insurance",
    "rental.booking.step3": "Deposit",
    "rental.booking.step4": "ID Verification",
    "rental.booking.step5": "Payment",
    "rental.booking.confirm_title": "Booking confirmed!",
    "rental.booking.reference": "Booking reference",
    "rental.booking.next_steps": "Next steps",
    "rental.insurance.essential": "Essential",
    "rental.insurance.comfort": "Comfort",
    "rental.insurance.serenity": "Serenity",
    "rental.insurance.recommended": "Recommended",
    "rental.insurance.franchise": "Deductible",
    "rental.insurance.per_day": "/day",
    "rental.kyc.title": "Identity verification",
    "rental.kyc.permit_front": "Driving licence (front)",
    "rental.kyc.permit_back": "Driving licence (back)",
    "rental.kyc.cin_front": "National ID (front)",
    "rental.kyc.cin_back": "National ID (back)",
    "rental.kyc.passport_front": "Passport (photo page)",
    "rental.kyc.status.pending": "Pending validation",
    "rental.kyc.status.validated": "Validated",
    "rental.kyc.status.refused": "Refused",
    "rental.deposit.title": "Deposit",
    "rental.deposit.description": "A security deposit will be held upon vehicle pick-up",
    "rental.deposit.released": "Released upon return if no damage",
    "rental.price.per_day": "MAD/day",
    "rental.price.total": "Total",
    "rental.price.base": "Base rate",
    "rental.price.options": "Options",
    "rental.price.insurance": "Insurance",
    "rental.price.deposit": "Deposit",
    "rental.status.pending_kyc": "Pending KYC",
    "rental.status.confirmed": "Confirmed",
    "rental.status.in_progress": "In progress",
    "rental.status.completed": "Completed",
    "rental.status.cancelled": "Cancelled",
    "rental.status.disputed": "Disputed",
    "rental.mileage.unlimited": "Unlimited mileage",
    "rental.mileage.limited": "Limited mileage",
    "rental.specs.seats": "{count} seats",
    "rental.specs.doors": "{count} doors",
    "rental.specs.transmission.auto": "Automatic",
    "rental.specs.transmission.manual": "Manual",
    "rental.specs.ac": "Air conditioning",
    "rental.specs.fuel.gasoline": "Gasoline",
    "rental.specs.fuel.diesel": "Diesel",
    "rental.specs.fuel.electric": "Electric",
    "rental.specs.fuel.hybrid": "Hybrid",
    "rental.pro.vehicles": "Vehicles",
    "rental.pro.reservations": "Reservations",
    "rental.pro.options": "Options",
    "rental.pro.stats": "Statistics",
    "rental.pro.add_vehicle": "Add vehicle",
    "rental.pro.edit_vehicle": "Edit vehicle",
    "rental.pro.validate_kyc": "Validate KYC",
    "rental.pro.generate_contract": "Generate contract",
    "rental.admin.insurance_plans": "Insurance plans",
    "rental.admin.moderation": "Vehicle moderation",
    "rental.admin.stats": "Statistics",

    // Filters
    "filters.title": "Filters",
    "filters.promotions.title": "Promotions",
    "filters.promotions.subtitle": "Show promotions",
    "filters.promotions.description":
      "Highlights establishments with offers or discounts",
    "filters.none_available": "No filters available for this universe.",
    "filters.apply": "Apply",

    "filters.section.restaurant.specialties": "Culinary specialties",
    "filters.section.restaurant.specialties.search_placeholder":
      "Search a specialty",
    "filters.section.price": "Price",
    "filters.section.availability": "Availability",
    "filters.availability.now": "Available now",
    "filters.availability.tonight": "Tonight",
    "filters.availability.tomorrow": "Tomorrow",
    "filters.availability.specific": "Specific date",
    "filters.section.packs_offers": "Packages & offers",
    "filters.section.options": "Options",
    "filters.section.ambience": "Atmosphere",
    "filters.section.activity_type": "Activity type",
    "filters.section.duration": "Duration",
    "filters.section.audience": "Audience",
    "filters.section.level": "Level",
    "filters.section.constraints": "Constraints",
    "filters.constraints.min_people": "Minimum guests",
    "filters.constraints.privatization": "Private booking available",
    "filters.section.type": "Type",
    "filters.section.format": "Format",
    "filters.section.duration_minutes": "Duration (min)",
    "filters.section.equipment": "Equipment",
    "filters.section.offers": "Offers",
    "filters.section.budget_per_night": "Budget / night",
    "filters.section.ratings": "Ratings",
    "filters.section.conditions": "Conditions",
    "filters.section.language": "Language",
    "filters.section.access": "Access",
    "filters.section.store_type": "Store type",
    "filters.section.budget": "Budget",
    "filters.section.services": "Services",
    "filters.placeholder.example": "e.g. {value}",

    // Search suggestions
    "suggestions.my_position": "My location",
    "suggestions.use_my_location": "Use my location",
    "suggestions.section.cities": "Cities",
    "suggestions.section.neighborhoods": "Popular neighborhoods",
    "suggestions.section.establishments": "Places & activities",
    "suggestions.section.categories": "Categories & specialties",
    "suggestions.section.offers": "Offers",
    "suggestions.section.trending": "Trending",

    // Booking (high priority paths)
    "booking.steps.details": "Details",
    "booking.steps.payment": "Summary",
    "booking.steps.info": "Info",
    "booking.steps.confirmation": "Confirmation",
    "booking.step_header.label": "STEP {step} OF {total}",

    "booking.auth.title": "Sign in to finish (1 min)",
    "booking.auth.subtitle.step2":
      "This helps secure your booking and lets you find your confirmation.",
    "booking.auth.subtitle.step3":
      "You’ll be able to confirm your details and receive your QR code.",

    "booking.establishment.fallback": "Booking",

    "booking.card.title.restaurant": "Book a table",
    "booking.card.title.hotel": "Book a room",
    "booking.card.title.ticket": "Book a ticket",
    "booking.card.title.slot": "Book a slot",
    "booking.card.title.default": "Book",

    "booking.choose_slot": "Choose a time slot",
    "booking.reservations_today": "Already {count} reservations for today",
    "booking.cta.book_now": "Book now",
    "booking.module.step_progress": "Step {current} / {total}",

    "booking.people.more_than_10": "More than 10 guests",
    "booking.people.exact_count": "Exact number",
    "booking.people.remove_one": "Remove one guest",
    "booking.people.add_one": "Add one guest",
    "booking.people.up_to": "Up to 50 guests.",
    "booking.people.other_number": "Other number",
    "booking.people.range": "Between {min} and {max} guests.",

    "booking.step1.title": "Choose your time slot",
    "booking.step1.subtitle": "Select a date, a time and the number of guests.",
    "booking.step1.section.date": "Select a date",
    "booking.step1.section.time": "Select a time",
    "booking.step1.section.people": "Number of guests",

    "booking.date_time.placeholder": "Select a date and time",

    "booking.bottomsheet.tab.date": "Date",
    "booking.bottomsheet.tab.time": "Time",
    "booking.bottomsheet.tab.persons_short": "Guests",

    "booking.pack.selected": "SELECTED PACK",
    "booking.pack.remove": "Remove",

    "booking.step1.date.helper": "Choose a day to see available time slots.",
    "booking.step1.time.helper": "Choose an available time.",
    "booking.step1.people.helper":
      "Choose the number of guests for your booking.",

    "booking.step1.recap": "SUMMARY",

    "booking.step1.selected.date": "Selected date",
    "booking.step1.selected.time": "Selected time",
    "booking.step1.selected.slot": "Selected slot",
    "booking.step1.selected.participants": "Guests",

    "booking.step1.no_slots":
      "No time slots available for this date. Try another day.",
    "booking.step1.select_date_first":
      "Select a date first to see available slots.",
    "booking.step1.select_time_first":
      "Select a time first to choose the number of guests.",

    "booking.step1.more_choices": "More options",
    "booking.step1.more_dates": "See more dates",

    "booking.waitlist": "Waitlist",
    "booking.slot.full": "Full",
    "booking.slot.full_aria": "Time slot {time} is full",

    "booking.offer.short": "Deal -{promo}%",
    "booking.offer.long": "Deal -{promo}% on menu",

    "booking.capacity.full_waitlist":
      "This time slot is full. You can join the waitlist.",
    "booking.capacity.remaining":
      "Remaining capacity for this slot: {remaining}",
    "booking.capacity.limited": "This slot is limited to {remaining} {unit}.",
    "booking.waitlist.notice":
      "This time slot is full: your request will be sent to the waitlist.",

    "booking.step1.choose_people": "Choose number of guests",
    "booking.step1.choose_time": "Choose a time",
    "booking.step1.choose_date": "Choose a date",

    "booking.activity.slot_at": "Time slot at {time}",
    "booking.time.choose": "Choose {time}",
    "booking.service.at_time": "{service} at {time}",

    "booking.calendar.choose_date": "Choose a date",
    "booking.calendar.placeholder": "dd/mm/yyyy",
    "booking.calendar.prev_month": "Previous month",
    "booking.calendar.next_month": "Next month",

    "booking.time.bucket.other": "Other",
    "booking.time.bucket.morning": "Morning",
    "booking.time.bucket.afternoon": "Afternoon",
    "booking.time.bucket.evening": "Evening",
    "booking.time.bucket.breakfast": "Breakfast",
    "booking.time.bucket.lunch": "Lunch",
    "booking.time.bucket.tea_time": "Tea Time",
    "booking.time.bucket.happy_hour": "Happy hour",
    "booking.time.bucket.dinner": "Dinner",
    "booking.time.bucket.available": "Available",

    "booking.service.lunch": "Lunch",
    "booking.service.continuous": "All-day service",
    "booking.service.dinner": "Dinner",

    "booking.footer.security_notice":
      "🔒 Secure payment • ⚡ Powered by Sortir Au Maroc",

    "booking.recap.title": "Summary",
    "booking.recap.establishment": "Venue",
    "booking.recap.pack": "Package",
    "booking.recap.guests": "Guests",
    "booking.recap.date": "Date",
    "booking.recap.time": "Time",
    "booking.recap.discount": "Discount",

    "booking.mode.guaranteed": "Guaranteed booking",
    "booking.mode.not_guaranteed": "Not guaranteed",

    "booking.price.per_person": "{amount} / person",
    "booking.price.from": "From",

    "booking.step2.title.secure": "Secure your booking",
    "booking.step2.title.waitlist": "Waitlist request",
    "booking.step2.subtitle.secure":
      "Choose whether you want to guarantee your table.",
    "booking.step2.subtitle.waitlist":
      "This time slot is full. We’ll send your request to the venue.",

    "booking.waitlist.banner.title": "Slot full — waitlist",
    "booking.waitlist.banner.body":
      "We’ll send your request to the venue. You’ll be notified if a spot opens up.",
    "booking.waitlist.banner.note":
      "No payment is required for a waitlist request.",

    "booking.mode.guaranteed.short": "Guaranteed seat",
    "booking.mode.non_guaranteed.short": "Pending confirmation",
    "booking.mode.guaranteed.line1":
      "Pre-authorization of {unit} MAD/person (deducted from the bill)",
    "booking.mode.guaranteed.line2": "Free cancellation up to 24h",
    "booking.mode.non_guaranteed.line":
      "Without upfront payment, the venue may prioritize guaranteed bookings.",
    "booking.mode.non_guaranteed.line_simple":
      "Your booking will be confirmed by the venue.",
    "booking.mode.non_guaranteed.more":
      "Without prepayment, your booking depends on availability and priority. You'll receive confirmation quickly.",

    "booking.payment.banner.title":
      "Secure payment — cancellation under conditions",
    "booking.payment.banner.waitlist":
      "No immediate payment. The venue will confirm if a spot opens up.",
    "booking.payment.banner.followup":
      "You’ll receive a reply as soon as possible.",
    "booking.payment.banner.guaranteed":
      "Pre-authorization of {unit} MAD / person (deducted from the bill).",
    "booking.payment.banner.total": "Total paid today: {total} MAD",
    "booking.payment.banner.non_guaranteed":
      "No immediate payment. The venue may prioritize guaranteed bookings.",
    "booking.payment.method.card": "Card",
    "booking.payment.secure_method": "Secure payment",

    "booking.deposit.title": "A deposit is required",
    "booking.deposit.description":
      "To guarantee availability and reduce no-shows, a deposit may be required for some bookings.",
    "booking.deposit.amount_label": "Amount to pay",
    "booking.deposit.pre_auth":
      "Pre-authorization: {unit} {currency} × {partySize} guests",
    "booking.deposit.note":
      "This amount will be deducted from the final bill. In case of no-show, it may be kept under the conditions.",
    "booking.deposit.payma_hint":
      "You’ll be redirected to pay.ma to complete payment. After paying, come back here to finish.",
    "booking.deposit.pay_and_confirm": "Pay and confirm booking",

    "booking.deposit.pedagogy.context_label": "Context",
    "booking.deposit.pedagogy.context_value":
      "For some bookings, an extra confirmation step may apply.",
    "booking.deposit.pedagogy.impact_label": "Result",
    "booking.deposit.pedagogy.impact_value":
      "This booking requires a deposit to be confirmed.",
    "booking.deposit.pedagogy.reassurance":
      "This is not a penalty: it helps protect timeslots.",
    "booking.deposit.pedagogy.learn_more": "Learn more",

    "booking.step3.title": "Confirm your details",
    "booking.step3.subtitle": "These details help the venue contact you.",
    "booking.step3.description":
      "These details help the venue contact you about your booking.",

    "booking.form.first_name": "First name",
    "booking.form.last_name": "Last name",
    "booking.form.email": "Email",
    "booking.form.phone": "Phone",
    "booking.form.message": "Special message",
    "booking.form.optional": "optional",

    "booking.form.placeholder.first_name": "e.g. Amina",
    "booking.form.placeholder.last_name": "e.g. Benali",
    "booking.form.placeholder.email": "e.g. amina@example.com",
    "booking.form.placeholder.phone": "e.g. +212 6 12 34 56 78",
    "booking.form.placeholder.phone_local": "6 12 34 56 78",
    "booking.form.placeholder.message": "e.g. Allergies, special occasion…",
    "booking.form.placeholder.message_long":
      "Describe the occasion (birthday, date night...), list dietary restrictions, or any special request...",

    "booking.step3.privacy_notice":
      "🔒 Your data is secure and will only be shared with the venue for your booking.",
    "booking.step3.cta.review": "Review",

    "booking.step4.title.confirmed": "Your booking is confirmed",
    "booking.step4.title.waitlist": "Waitlist request",
    "booking.step4.title.sent": "Request sent",

    "booking.step4.subtitle.confirmed":
      "Find your QR code and documents to show on arrival.",
    "booking.step4.subtitle.waitlist":
      "This slot is full. The venue will contact you if a spot opens up.",
    "booking.step4.subtitle.sent":
      "The venue must validate your request. You’ll receive a reply soon.",

    "booking.step4.banner.title.confirmed": "Booking confirmed!",
    "booking.step4.banner.title.pending": "Request submitted",
    "booking.step4.banner.body.confirmed":
      "Your spot is guaranteed. A confirmation SMS has been sent.",
    "booking.step4.banner.body.pending":
      "The venue will confirm your booking by SMS or email shortly.",

    "booking.step4.contact.title": "CONTACT",
    "booking.step4.contact.confirmation_sent":
      "Confirmation sent to the provided number",
    "booking.step4.reference.title": "BOOKING REFERENCE",

    "booking.step4.qr.title": "QR code — show at the venue",
    "booking.step4.qr.alt": "Booking QR code",
    "booking.step4.qr.body":
      "The venue can scan this QR code to confirm your attendance",

    "booking.step4.pdf.title": "Download booking as PDF",
    "booking.step4.pdf.cta": "Export PDF",
    "booking.step4.pdf.generating": "Generating...",

    "booking.step4.wallet.apple": "Add to Apple Wallet",
    "booking.step4.wallet.google": "Add to Google Wallet",

    "booking.step4.calendar.add": "Add to calendar",
    "booking.step4.directions": "Get directions",

    "booking.step4.modify": "Edit",
    "booking.step4.cancel": "Cancel",
    "booking.step4.cancel.confirm":
      "Are you sure you want to cancel this booking?",

    "booking.step4.trust.ssl": "Secure payment with 256-bit SSL",
    "booking.step4.trust.managed_by": "Booking managed by Sortir Au Maroc",
    "booking.step4.trust.count": "Over 5,000 bookings made",

    "booking.step4.home": "Back to home",
    "booking.step4.calendar.event_title": "Booking - {establishment}",
    "booking.waitlist.missing_slot":
      "Unable to join the waitlist: no slot was selected.",

    "booking.modify.title": "Request a change",
    "booking.modify.datetime_label": "New date/time ({optional})",
    "booking.modify.datetime_help":
      "The venue will confirm the change (subject to availability).",
    "booking.modify.party_size_label": "Number of guests ({optional})",
    "booking.modify.party_size_placeholder": "e.g. 4",
    "booking.modify.send": "Send",

    // Reservation status (extra)
    "reservation.status.modification_pending": "In review (change requested)",
    "reservation.status.modification_pending.title":
      "Your change request is being reviewed by the venue.",

    "reservation.status.refused": "Refused",
    "reservation.status.refused.title": "Booking refused",
    "reservation.status.waitlist": "Waitlist",
    "reservation.status.pending_pro": "Pending validation",

    "reservation.status.cancelled.you": "Cancelled (you)",
    "reservation.status.cancelled.client": "Cancelled (customer)",
    "reservation.status.cancelled.establishment": "Cancelled (venue)",
    "reservation.status.cancelled.refunded": "Cancelled / refunded",
    "reservation.status.cancelled.generic": "Cancelled",

    "reservation.status.no_show": "No-show",

    "reservation.status.past.present": "Past · attended",
    "reservation.status.past.no_show": "Past · no-show",
    "reservation.status.past.generic": "Past",

    "reservation.status.confirmed": "Confirmed",
    "reservation.status.confirmed.guaranteed": "Confirmed · guaranteed",
    "reservation.status.confirmed.not_guaranteed": "Confirmed · not guaranteed",

    "reservation.status.generic": "Booking",

    // Payment status
    "payment.status.paid": "Paid",
    "payment.status.pending": "Unpaid",
    "payment.status.refunded": "Refunded",

    // Booking details
    "booking_details.loading.title": "Loading…",
    "booking_details.loading.body": "We are retrieving your booking.",

    "booking_details.not_found": "Booking not found",
    "booking_details.not_found.body_default":
      "This booking no longer exists or was deleted.",
    "booking_details.back_to_account": "Back to account",
    "booking_details.explore": "Explore",
    "booking_details.back": "Back",

    "booking_details.ref_prefix": "Ref.",
    "booking_details.field.date": "Date",
    "booking_details.field.time": "Time",
    "booking_details.field.people": "People",
    "booking_details.field.address": "Address",

    // NEW: auto-promotion waitlist logic
    "booking_details.waitlist_offer.badge": "Offer (waitlist)",
    "booking_details.waitlist_offer.title": "A spot is available",
    "booking_details.waitlist_offer.body":
      "You have 15 minutes to confirm this booking.",
    "booking_details.waitlist_offer.expires_at": "Expires at {time}",
    "booking_details.waitlist_offer.accept": "Accept",
    "booking_details.waitlist_offer.refuse": "Refuse",
    "booking_details.waitlist_offer.expired_title": "Offer expired",
    "booking_details.waitlist_offer.expired_body":
      "This offer is no longer available. The system will propose the spot to the next person.",
    "booking_details.waitlist_offer.waiting_title": "On the waitlist",
    "booking_details.waitlist_offer.waiting_body":
      "Your current position: #{position}.",

    "booking_details.payment.title": "Payment",
    "booking_details.payment.status": "Status",
    "booking_details.payment.amount": "Amount",
    "booking_details.payment.total": "Total",
    "booking_details.payment.paid_at": "Paid on",
    "booking_details.payment.method": "Method",
    "booking_details.payment.escrow_held_badge": "Funds retained ⚠️",
    "booking_details.payment.none": "No payment recorded.",
    "booking_details.payment.secure": "Secure payment",
    "booking_details.payment.pre_reservation_per_person":
      "Pre-booking (per person)",
    "booking_details.payment.total_prepaid": "Total prepaid",
    "booking_details.payment.calculation":
      "Calculation: {unit} × {count} people.",

    "booking_details.qr.title": "QR code & documents",
    "booking_details.qr.invoice": "Invoice",
    "booking_details.qr.alt": "QR Code",
    "booking_details.qr.present_on_arrival": "Show on arrival",
    "booking_details.qr.contains":
      "The QR code contains the booking reference and, if available, the prepaid amount.",
    "booking_details.qr.pdf_restaurant_only":
      "PDF is available for restaurant bookings.",

    "booking_details.review.title": "Review",
    "booking_details.review.overall": "Overall rating: {rating}/5",
    "booking_details.review.criteria_average": "Criteria average",
    "booking_details.review.published_at": "Published on {date}",
    "booking_details.review.leave": "Leave a review",
    "booking_details.review.rate_each": "Rate each criterion",
    "booking_details.review.estimated": "Estimated overall rating: {rating}/5",
    "booking_details.review.comment_label": "Comment",
    "booking_details.review.comment_placeholder": "Share your experience…",
    "booking_details.review.publish": "Publish",
    "booking_details.review.thank_you_title": "Thank you!",
    "booking_details.review.saved_body": "Your review has been saved.",
    "booking_details.review.unavailable":
      "Leaving a review is available after the booking, if the guest checked in.",

    "booking_details.summary.title": "Summary",
    "booking_details.summary.note": "Note:",
    "booking_details.summary.phone": "Phone:",

    "booking_details.pro_message.title": "Message from the venue",
    "booking_details.pro_message.template_prefix": "template",

    "booking_details.service.lunch": "lunch",
    "booking_details.service.continuous": "all day",
    "booking_details.service.dinner": "dinner",

    "booking_details.attendance.title": "Attendance",
    "booking_details.attendance.present": "Checked in",
    "booking_details.attendance.no_show": "Absent / no-show",
    "booking_details.attendance.unknown": "Not specified",

    "booking_details.toast.declined.title": "Proposal declined",
    "booking_details.toast.declined.body": "We have notified the system.",
    "booking_details.toast.accepted.title": "Request sent",
    "booking_details.toast.accepted.body":
      "Your acceptance was sent to the Pro for validation.",
    "booking_details.toast.change_cancelled.title": "Cancelled",
    "booking_details.toast.change_cancelled.body":
      "Your change request has been withdrawn.",
    "booking_details.toast.cancellation_sent.title":
      "Cancellation request sent",
    "booking_details.toast.cancellation_sent.body":
      "Your cancellation request has been recorded. You’ll receive a confirmation once the refund (if applicable) is processed.",
    "booking_details.toast.payment_initiated.title": "Payment started",
    "booking_details.toast.payment_initiated.body":
      "Once the payment is completed, come back here and try accepting the offer again.",
    "booking_details.toast.change_request_sent.title": "Request sent",
    "booking_details.toast.change_request_sent.body":
      "Your change request was sent to the venue. You’ll get an answer once it’s processed.",

    "booking_details.cancellation.free_until":
      "Free cancellation until {date}.",
    "booking_details.cancellation.conditional":
      "Cancellation with conditions (fee {percent}%).",
    "booking_details.cancellation.default_note":
      "Requests are handled by the venue based on availability and policy.",

    // UI (Menu / Restaurant / Profile / Support / etc.)
    "common.error": "Error",
    "common.limited_offer": "Limited offer",
    "common.per_person": "per person",
    "common.instead_of": "instead of",

    "not_found.title": "Page not found",
    "not_found.body": "Sorry, this page doesn’t exist (anymore).",
    "not_found.back_home": "Back to home",
    "not_found.view_results": "View results",

    "hotel.booking.title_fallback": "Hotel booking",
    "hotel.booking.step.details": "Details",
    "hotel.booking.step.conditions": "Conditions",
    "hotel.booking.step.info": "Info",
    "hotel.booking.step.confirmation": "Confirmation",
    "hotel.booking.payment_footer": "Secure payment • Managed by Sortir Au Maroc",

    "menu.search.placeholder": "Search the menu…",
    "menu.search.results_label": "Results",
    "menu.search.no_results": "No results for your search.",
    "menu.sort.label": "Sort",
    "menu.sort.all": "All",
    "menu.sort.popular": "Popular",
    "menu.sort.best_sellers": "Best sellers",
    "menu.group.packs": "Packs",
    "menu.packs.subtitle": "Deals & packs",
    "menu.items.count": "{count} items",

    "menu.badge.new": "New",
    "menu.badge.specialty": "Specialty",
    "menu.badge.best_seller": "Best seller",
    "menu.badge.healthy": "Healthy",
    "menu.badge.vegetarian": "Vegetarian",
    "menu.badge.fast": "Fast",

    "pack.book_cta": "Book this pack",
    "pack.urgency.today_only": "Today only",
    "pack.urgency.limited_recommended": "Limited spots",
    "pack.urgency.high_demand": "High demand",
    "pack.urgency.exclusive": "Exclusive deal",

    "restaurant.quick_booking.title": "Quick booking",
    "restaurant.quick_booking.subtitle":
      "Pick a date, time and number of people.",
    "restaurant.quick_booking.duration": "1 min",
    "restaurant.quick_booking.closed_warning": "Selected slot unavailable",
    "restaurant.quick_booking.advice":
      "You can complete the booking in the next step.",
    "restaurant.quick_booking.cta.choose_slot": "Choose this slot",
    "restaurant.quick_booking.cta.book_slot": "Book this slot",

    "weekday.monday": "Monday",
    "weekday.tuesday": "Tuesday",
    "weekday.wednesday": "Wednesday",
    "weekday.thursday": "Thursday",
    "weekday.friday": "Friday",
    "weekday.saturday": "Saturday",
    "weekday.sunday": "Sunday",

    "restaurant.hours.title": "Opening hours",
    "restaurant.hours.table.day": "Day",
    "restaurant.hours.service.lunch": "Lunch",
    "restaurant.hours.service.dinner": "Dinner",
    "restaurant.hours.status.open": "Open",
    "restaurant.hours.status.soon": "Soon",
    "restaurant.hours.status.closed": "Closed",
    "restaurant.hours.today_label": "Today: {day}",
    "restaurant.hours.week_toggle": "View weekly hours",
    "restaurant.hours.closed": "Closed",
    "restaurant.hours.closed_today": "Closed today",
    "restaurant.hours.next_slot.label": "Next slot: {day} {from}–{to}",
    "restaurant.hours.next_slot.unavailable": "No upcoming slots",

    "restaurant.hours.compatibility.ok": "Slot available",
    "restaurant.hours.compatibility.not_ok": "Slot unavailable",
    "restaurant.hours.compatibility.closed_day": "Closed that day.",
    "restaurant.hours.compatibility.opens_at": "Opens at {time}.",
    "restaurant.hours.compatibility.opens_tomorrow_at":
      "Opens tomorrow at {time}.",
    "restaurant.hours.compatibility.not_compatible": "Time not compatible.",

    "profile.user.fallback_name": "My account",

    "profile.gate.title": "Sign in to access your profile",
    "profile.gate.subtitle": "Find your bookings, favorites and preferences.",
    "profile.gate.cta.explore": "Explore",
    "profile.gate.card.bookings.title": "Bookings",
    "profile.gate.card.bookings.subtitle":
      "See your upcoming and past bookings.",
    "profile.gate.card.favorites.title": "Favorites",
    "profile.gate.card.favorites.subtitle": "Find the venues you saved.",
    "profile.gate.card.preferences.title": "Preferences",
    "profile.gate.card.preferences.subtitle": "Personalize your experience.",

    "profile.contact.placeholder": "Email or phone",

    "profile.stats.bookings": "Bookings",
    "profile.stats.favorites": "Favorites",
    "profile.stats.preferences": "Preferences",
    "profile.stats.preferences.short": "{enabled}/{total} enabled",
    "profile.stats.preferences.long":
      "{enabled} of {total} preferences enabled",
    "profile.stats.preferences.examples":
      "e.g., rooftop, brunch, hammam, family activities…",

    "profile.tabs.info": "Info",
    "profile.tabs.bookings": "Bookings",
    "profile.tabs.waitlist": "Waitlist",
    "profile.tabs.billing": "Billing",
    "profile.tabs.packs": "Packs",
    "profile.tabs.favorites": "Favorites",
    "profile.tabs.preferences": "Preferences",
    "profile.tabs.privacy_account": "Privacy & account",

    "profile.privacy.title": "Privacy & account",
    "profile.privacy.subtitle":
      "Manage your account, your data, and your requests (deactivation, deletion, export).",

    "profile.privacy.export.title": "Download my data",
    "profile.privacy.export.description":
      "Receive a secure download link by email (JSON or CSV).",
    "profile.privacy.export.button": "Request export",
    "profile.privacy.export.button.loading": "Requesting…",
    "profile.privacy.export.toast.title": "Request sent",
    "profile.privacy.export.toast.description":
      "If an email is associated with your account, you will receive a download link.",

    // Password management
    "profile.password.title": "Password",
    "profile.password.description": "Manage your account security.",
    "profile.password.reset.title": "Reset my password",
    "profile.password.reset.description": "A reset link will be sent to your email.",
    "profile.password.reset.button": "Send by email",
    "profile.password.reset.button.loading": "Sending…",
    "profile.password.reset.toast.title": "Email sent",
    "profile.password.reset.toast.description": "Check your inbox for the reset link.",
    "profile.password.reset.error.phone_only.title": "Reset not available",
    "profile.password.reset.error.phone_only.description": "You signed up with your phone. Please use the \"Change my password\" option instead.",
    "profile.password.change.title": "Change my password",
    "profile.password.change.description": "Update your current password.",
    "profile.password.change.button": "Change",
    "profile.password.change.button.loading": "Updating…",
    "profile.password.change.button.confirm": "Confirm",
    "profile.password.change.dialog.title": "Change password",
    "profile.password.change.dialog.description": "Enter your current password and choose a new one.",
    "profile.password.change.current": "Current password",
    "profile.password.change.new": "New password",
    "profile.password.change.confirm": "Confirm new password",
    "profile.password.change.hint": "Minimum 8 characters",
    "profile.password.change.toast.title": "Password changed",
    "profile.password.change.toast.description": "Your password has been updated successfully.",
    "profile.password.change.error.too_short": "Password must be at least 8 characters.",
    "profile.password.change.error.mismatch": "Passwords do not match.",
    "profile.password.change.error.invalid_current": "Current password is incorrect.",

    "profile.privacy.deactivate.title": "Temporarily deactivate my account",
    "profile.privacy.deactivate.description":
      "Your account will be paused. You can reactivate it by signing in again.",
    "profile.privacy.deactivate.button": "Deactivate",
    "profile.privacy.deactivate.button.loading": "Deactivating…",
    "profile.privacy.deactivate.button.confirm": "Confirm deactivation",
    "profile.privacy.deactivate.dialog.title": "Deactivate my account",
    "profile.privacy.deactivate.dialog.description":
      "Choose a reason (optional) and confirm. You will be signed out.",
    "profile.privacy.deactivate.toast.title": "Account deactivated",
    "profile.privacy.deactivate.toast.description":
      "Your account is paused. You can reactivate it by signing in again.",

    "profile.privacy.delete.title": "Permanently delete my account",
    "profile.privacy.delete.description":
      "This action is irreversible. Some information may be retained when required by law.",
    "profile.privacy.delete.button": "Delete",
    "profile.privacy.delete.button.loading": "Deleting…",
    "profile.privacy.delete.button.confirm": "Confirm deletion",
    "profile.privacy.delete.dialog.title": "Delete my account",
    "profile.privacy.delete.dialog.description":
      "Choose a reason, then confirm. This action is irreversible.",
    "profile.privacy.delete.step2.warning":
      "Final step: this action is irreversible. Once deleted, your account cannot be recovered.",
    "profile.privacy.delete.step2.confirm_label": 'Type "{word}" to confirm',
    "profile.privacy.delete.confirm_word": "DELETE",
    "profile.privacy.delete.toast.title": "Account deleted",
    "profile.privacy.delete.toast.description":
      "Your account has been deleted. Thank you for using Sortir Au Maroc.",

    "profile.privacy.reason.label": "Reason (optional)",
    "profile.privacy.reason.details.label": "Details (optional)",
    "profile.privacy.reason.details.placeholder": "Tell us in a few words…",

    "profile.privacy.reason.pause": "I’m taking a break",
    "profile.privacy.reason.not_using": "I don’t use Sortir Au Maroc enough",
    "profile.privacy.reason.too_many_notifications": "Too many notifications",
    "profile.privacy.reason.technical_issue": "Technical issue",
    "profile.privacy.reason.privacy_concerns": "Privacy concerns",
    "profile.privacy.reason.not_found": "I didn’t find what I was looking for",
    "profile.privacy.reason.other": "Other",

    "profile.privacy.deactivate.message.pause":
      "Thanks. We’ll put your account on pause. You can reactivate it whenever you want.",
    "profile.privacy.deactivate.message.not_using":
      "Thanks for your feedback. Your account will be paused.",
    "profile.privacy.deactivate.message.too_many_notifications":
      "Understood. Your account will be paused and you will stop receiving notifications.",
    "profile.privacy.deactivate.message.technical_issue":
      "Thanks. If you’d like, contact us — we’ll do our best to fix the issue.",
    "profile.privacy.deactivate.message.privacy_concerns":
      "Thanks. We take privacy seriously and we’re available if you have questions.",
    "profile.privacy.deactivate.message.not_found":
      "Thanks. We hope to see you again on Sortir Au Maroc.",
    "profile.privacy.deactivate.message.other":
      "Thanks. Your account will be paused.",

    "profile.privacy.delete.reason.not_using_anymore":
      "I no longer use Sortir Au Maroc",
    "profile.privacy.delete.reason.found_alternative": "I found an alternative",
    "profile.privacy.delete.reason.unsatisfied_experience":
      "Unsatisfactory experience",
    "profile.privacy.delete.reason.too_buggy": "Too many bugs",
    "profile.privacy.delete.reason.payment_issue": "Payment-related issue",
    "profile.privacy.delete.reason.data_privacy": "Personal data concerns",
    "profile.privacy.delete.reason.not_covered":
      "I’m no longer in a covered area",

    "profile.privacy.delete.message.not_using_anymore":
      "Thanks for your feedback. We’ll process your deletion request.",
    "profile.privacy.delete.message.found_alternative":
      "Thanks for your feedback. We’ll process your deletion request.",
    "profile.privacy.delete.message.unsatisfied_experience":
      "Thanks. We’re sorry the experience didn’t meet expectations.",
    "profile.privacy.delete.message.too_buggy":
      "Thanks. We’re sorry for the issues you encountered.",
    "profile.privacy.delete.message.payment_issue":
      "Thanks. If you’d like, contact us before deletion so we can clarify the situation.",
    "profile.privacy.delete.message.data_privacy":
      "Thanks. We’ll process your request in line with our privacy policy.",
    "profile.privacy.delete.message.not_covered":
      "Thanks. We hope to be available in your area soon.",
    "profile.privacy.delete.message.other":
      "Thanks. We’ll process your deletion request.",

    "profile.privacy.footer_hint":
      "Need help? You can contact support from the Help page.",

    "profile.waitlist.title": "Waitlist",
    "profile.waitlist.subtitle":
      "Track your position and respond when a spot becomes available.",
    "profile.waitlist.empty.title": "No waitlist requests",
    "profile.waitlist.empty.subtitle":
      "When a slot is full, you can join the waitlist from the booking page.",
    "profile.waitlist.empty.hint":
      "Tip: if you have a booking marked as “Waitlist”, it will appear under the Bookings tab.",
    "profile.waitlist.section.active": "Active requests",
    "profile.waitlist.section.expired": "History",
    "profile.waitlist.section.active_empty": "No active requests.",
    "profile.waitlist.section.expired_empty": "No history.",
    "profile.waitlist.status.offer": "Offer",
    "profile.waitlist.status.waiting": "Waiting",
    "profile.waitlist.status.accepted": "Accepted",
    "profile.waitlist.status.expired": "Finished",
    "profile.waitlist.status.unknown": "Status",
    "profile.waitlist.field.date": "Date",
    "profile.waitlist.field.time": "Time",
    "profile.waitlist.field.people": "People",
    "profile.waitlist.offer.expires_at": "Expires at {time}",
    "profile.waitlist.position": "Position: #{position}",
    "profile.waitlist.cancel": "Cancel",
    "profile.waitlist.view_reservation": "View",
    "profile.waitlist.establishment_fallback": "Venue",

    "profile.info.title": "My details",
    "profile.info.subtitle": "Update your details to make booking easier.",
    "profile.info.first_name.label": "First name",
    "profile.info.first_name.placeholder": "e.g., Amina",
    "profile.info.last_name.label": "Last name",
    "profile.info.last_name.placeholder": "e.g., Benali",
    "profile.info.phone.label": "Phone",
    "profile.info.phone.placeholder": "e.g., +212 6 12 34 56 78",
    "profile.info.phone.help": "Used to contact you if needed.",
    "profile.info.csp.label": "Occupation",
    "profile.info.csp.placeholder": "Select…",
    "profile.info.csp.help": "Optional.",
    "profile.info.dob.label": "Date of birth",
    "profile.info.dob.placeholder": "dd/mm/yyyy",
    "profile.info.dob.help": "Optional.",
    "profile.info.city.label": "City",
    "profile.info.city.placeholder": "e.g., Casablanca",
    "profile.info.save": "Save",
    "profile.info.saved": "Saved",
    "profile.info.last_updated": "Last updated: {value}",
    "profile.info.edit": "Edit",
    "profile.info.phone.verified": "Verified",
    "profile.info.phone.verified_help": "This number has been verified and cannot be changed.",
    "profile.info.phone.verify": "Verify",
    "profile.info.phone.verify_description": "Send an SMS code to verify your number.",
    "profile.info.email.verified": "Verified",
    "profile.info.email.verified_help": "This email has been verified.",
    "profile.info.email.verify": "Verify",
    "profile.info.email.verify_description": "An 8-digit code will be sent to your email.",
    "profile.info.email.label": "Email",
    "profile.info.login_credentials": "Login credentials",
    "profile.info.phone.login_label": "Login phone number",

    // Phone verification modal
    "profile.phone_verification.title": "Verify my number",
    "profile.phone_verification.subtitle": "An SMS code will be sent to your number to verify it. Once verified, it cannot be changed.",
    "profile.phone_verification.success": "Number verified!",
    "profile.phone_verification.success_description": "Your phone number has been successfully verified.",
    "profile.phone_verification.not_available": "Verification unavailable",

    // Email verification modal
    "profile.email_verification.title": "Verify my email",
    "profile.email_verification.subtitle": "Solve the captcha then click Send. An 8-digit code will be sent to your email address.",
    "profile.email_verification.send_code": "Send code",
    "profile.email_verification.enter_code": "Enter the code received",
    "profile.email_verification.code_sent_to": "Code sent to",
    "profile.email_verification.success": "Email verified!",
    "profile.email_verification.success_description": "Your email address has been successfully verified.",
    "profile.email_verification.error.invalid_email": "Invalid email address.",
    "profile.email_verification.error.send_failed": "Could not send the code. Please try again.",
    "profile.email_verification.error.invalid_code": "Incorrect code. Please check and try again.",
    "profile.email_verification.error.code_expired": "This code has expired. Request a new one.",
    "profile.email_verification.error.captcha_required": "Please solve the captcha.",

    "profile.info.csp.group.education": "Education",
    "profile.info.csp.group.unemployed": "Unemployed",
    "profile.info.csp.group.employed": "Employed",
    "profile.info.csp.group.self_employed": "Self-employed",
    "profile.info.csp.group.public": "Public sector",
    "profile.info.csp.group.commerce": "Commerce",
    "profile.info.csp.group.manual": "Manual work",
    "profile.info.csp.group.other": "Other",

    "profile.info.csp.student": "Student",
    "profile.info.csp.intern": "Intern",
    "profile.info.csp.unemployed": "Unemployed",
    "profile.info.csp.job_seeker": "Job seeker",
    "profile.info.csp.retraining": "Retraining",
    "profile.info.csp.employee": "Employee",
    "profile.info.csp.technician": "Technician",
    "profile.info.csp.supervisor": "Supervisor",
    "profile.info.csp.manager": "Manager",
    "profile.info.csp.executive": "Executive",
    "profile.info.csp.freelance": "Freelance",
    "profile.info.csp.entrepreneur": "Entrepreneur",
    "profile.info.csp.liberal_profession": "Liberal profession",
    "profile.info.csp.public_servant": "Public servant",
    "profile.info.csp.merchant": "Merchant",
    "profile.info.csp.artisan": "Artisan",
    "profile.info.csp.worker": "Worker",
    "profile.info.csp.service_employee": "Service employee",
    "profile.info.csp.retired": "Retired",
    "profile.info.csp.stay_at_home": "Stay-at-home",
    "profile.info.csp.other": "Other",

    // Reset password page
    "reset_password.title": "New password",
    "reset_password.for_account": "For account {email}",
    "reset_password.validating": "Validating link...",
    "reset_password.new_password": "New password",
    "reset_password.confirm_password": "Confirm password",
    "reset_password.password_hint": "Minimum 8 characters",
    "reset_password.submit": "Set password",
    "reset_password.submitting": "Saving...",
    "reset_password.back_home": "Back to home",
    "reset_password.error.title": "Invalid link",
    "reset_password.error.missing_token": "The link is incomplete. Please use the full link received by email.",
    "reset_password.error.invalid_token": "This reset link is not valid.",
    "reset_password.error.token_expired": "This link has expired. Please request a new reset link.",
    "reset_password.error.token_used": "This link has already been used. Request a new one if needed.",
    "reset_password.error.too_short": "Password must be at least 8 characters.",
    "reset_password.error.mismatch": "Passwords do not match.",
    "reset_password.error.generic": "An error occurred. Please try again.",
    "reset_password.success.title": "Password changed",
    "reset_password.success.description": "Your password has been changed successfully. You can now log in.",
    "reset_password.success.login": "Log in",

    "profile.bookings.loading": "Loading bookings…",
    "profile.bookings.empty.title": "No bookings",
    "profile.bookings.empty.subtitle": "Your bookings will appear here.",
    "profile.bookings.ref": "Ref.",
    "profile.bookings.view": "View",
    "profile.bookings.field.date": "Date",
    "profile.bookings.field.time": "Time",
    "profile.bookings.field.people": "Guests",
    "profile.bookings.pre_reservation": "Pre-reservation",
    "profile.bookings.amount_paid": "Amount paid",

    "support.tickets.title": "Support tickets",
    "support.tickets.subtitle": "Create and track your support requests.",
    "support.hours": "Customer support available 9am–7pm",
    "support.tickets.new": "New ticket",
    "support.tickets.my_tickets": "My tickets",
    "support.tickets.empty": "No tickets yet.",
    "support.tickets.select_prompt": "Select a ticket to view details.",

    "support.ticket.form.subject": "Subject",
    "support.ticket.form.subject.placeholder": "e.g., Booking issue",
    "support.ticket.form.category": "Category",
    "support.ticket.form.category.placeholder": "Choose a category",
    "support.ticket.form.message": "Message",
    "support.ticket.form.message.placeholder": "Describe your request…",
    "support.ticket.form.submit": "Send",

    "support.ticket.category.reservations": "Bookings",
    "support.ticket.category.cancellation": "Cancellation",
    "support.ticket.category.billing": "Payment / billing",
    "support.ticket.category.account": "Account",
    "support.ticket.category.technical": "Technical",
    "support.ticket.category.partners": "Partners",
    "support.ticket.category.other": "Other",

    "support.ticket.updated_at": "Updated: {date}",
    "support.ticket.status.open": "Open",
    "support.ticket.status.closed": "Closed",
    "support.ticket.action.close": "Close",
    "support.ticket.action.reopen": "Reopen",

    "support.ticket.reply": "Reply",
    "support.ticket.reply.placeholder": "Write a message…",
    "support.ticket.reply.placeholder_closed": "This ticket is closed.",
    "support.ticket.reply.send": "Send",
    "support.ticket.closed_note": "This ticket is closed. Reopen it to reply.",

    "treatments.category.packs": "Packs",
    "treatments.category.buggy": "Buggy",
    "treatments.category.quad": "Quad",
    "treatments.category.motocross": "Motocross",
    "treatments.category.kids": "Kids",
    "treatments.category.rides": "Rides",
    "treatments.category.options": "Options",
    "treatments.category.hammam": "Hammam",
    "treatments.category.massage": "Massage",
    "treatments.category.cils": "Lashes & brows",
    "treatments.category.onglerie": "Nails",
    "treatments.category.coiffure": "Hair",
    "treatments.category.other": "Other",

    "treatments.empty.title": "No services",
    "treatments.empty.subtitle": "Services will be available soon.",
    "treatments.category_empty.title": "No services",
    "treatments.category_empty.subtitle": "No services in this category yet.",

    "establishment.tabs.aria_label": "Venue navigation",
    "establishment.tabs.menu": "Menu",
    "establishment.tabs.reviews": "Reviews",
    "establishment.tabs.info": "Info",
    "establishment.tabs.hours": "Hours",
    "establishment.tabs.map": "Map",
    "establishment.tabs.rooms": "Rooms",
    "establishment.tabs.services": "Services",
    "establishment.tabs.pricing": "Services & pricing",
    "establishment.tabs.vehicles": "Vehicles",

    // Pro booking settings
    "pro.booking_settings.title": "Cancellations & changes",
    "pro.booking_settings.subtitle":
      "Configure your cancellation and change policies (text shown to USERS).",
    "pro.booking_settings.reload": "Reload",
    "pro.booking_settings.save": "Save",
    "pro.booking_settings.load_failed":
      "Unable to load the policy (please try again).",

    "pro.booking_settings.pedagogy.title": "Timeslot protection",
    "pro.booking_settings.pedagogy.body":
      "Sortir Au Maroc may request a deposit for some bookings to reduce no-shows and protect your timeslots. This is automatic and aims to protect everyone’s experience.",
    "pro.booking_settings.pedagogy.note":
      "Tip: tell customers the deposit is used to confirm and protect the timeslot.",

    "pro.booking_settings.section.cancel.title": "A — Cancellation policy",
    "pro.booking_settings.section.cancel.description":
      "Deadlines, fees and user-facing text.",
    "pro.booking_settings.cancel.enable.title":
      "Enable a custom cancellation policy",
    "pro.booking_settings.cancel.enable.hint":
      "If disabled, the default Sortir Au Maroc policy applies.",
    "pro.booking_settings.cancel.free_hours.label":
      "Free cancellation window (hours before)",
    "pro.booking_settings.cancel.penalty_percent.label":
      "Penalty after the limit (%)",
    "pro.booking_settings.cancel.penalty_percent.example":
      "Example: after the limit until the booking time: {percent}% fee.",
    "pro.booking_settings.cancel.no_show_penalty.label": "No-show penalty (%)",
    "pro.booking_settings.cancel.no_show_always_100.title":
      "Always 100% for guaranteed no-shows",
    "pro.booking_settings.cancel.no_show_always_100.hint":
      "Optional, recommended when prepaid.",
    "pro.booking_settings.cancel.custom_text.title":
      "Custom text shown to the customer",
    "pro.booking_settings.cancel.custom_text.placeholder.fr":
      "Customer-facing text (FR)",
    "pro.booking_settings.cancel.custom_text.placeholder.en":
      "Customer-facing text (EN)",

    "pro.booking_settings.section.modif.title": "B — Change policy",
    "pro.booking_settings.section.modif.description":
      "Allowed, deadline and customer-facing text.",
    "pro.booking_settings.modif.enable.title": "Allow change requests",
    "pro.booking_settings.modif.enable.hint":
      "If disabled, the USER button will be hidden.",
    "pro.booking_settings.modif.deadline_hours.label":
      "Last deadline (hours before booking)",
    "pro.booking_settings.modif.require_guarantee.label":
      "Require a guarantee if score < … (optional)",
    "pro.booking_settings.modif.require_guarantee.placeholder": "e.g. 65",
    "pro.booking_settings.modif.require_guarantee.hint":
      "Leave empty to disable this rule.",
    "pro.booking_settings.modif.custom_text.title":
      "Informational text shown to the customer",
    "pro.booking_settings.modif.custom_text.placeholder.fr":
      "Customer-facing text (FR)",
    "pro.booking_settings.modif.custom_text.placeholder.en":
      "Customer-facing text (EN)",

    // Admin content
    "admin.content.title": "Content",
    "admin.content.description":
      "Manage editorial pages and FAQ (FR/EN) without touching code.",
    "admin.content.editor_language": "Editing language",
    "admin.content.tab.pages": "Pages",
    "admin.content.tab.faq": "FAQ",

    "admin.content.action.new_page": "New page",
    "admin.content.action.new_faq": "New FAQ",
    "admin.content.action.preview": "Preview",
    "admin.content.action.back_to_edit": "Back",
    "admin.content.action.save": "Save",

    "admin.content.warning": "Warning",
    "admin.content.translation_missing": "Missing translation",
    "admin.content.translation_missing_hint":
      "Complete FR/EN before publishing for a consistent experience.",

    "admin.content.status.draft": "Draft",
    "admin.content.status.published": "Published",

    "admin.content.pages.search": "Search (slug, title)…",
    "admin.content.pages.column.slug": "Slug",
    "admin.content.pages.column.title": "Title",
    "admin.content.pages.column.status": "Status",
    "admin.content.pages.column.updated": "Updated",

    "admin.content.faq.search": "Search (question, tags)…",
    "admin.content.faq.column.category": "Category",
    "admin.content.faq.column.order": "Order",
    "admin.content.faq.column.question": "Question",
    "admin.content.faq.column.status": "Status",
    "admin.content.faq.column.updated": "Updated",

    "admin.content.dialog.page": "Page",
    "admin.content.dialog.faq": "FAQ",

    "admin.content.field.slug": "Slug",
    "admin.content.field.slug_placeholder": "e.g., terms, privacy, about",
    "admin.content.field.status": "Status",
    "admin.content.field.title": "Title",
    "admin.content.field.title_placeholder_fr": "Title (FR)",
    "admin.content.field.title_placeholder_en": "Title (EN)",
    "admin.content.field.meta_title": "Meta title",
    "admin.content.field.meta_title_placeholder": "SEO title",
    "admin.content.field.meta_description": "Meta description",
    "admin.content.field.meta_description_placeholder":
      "SEO description (~160 chars)",
    "admin.content.field.content": "Content",
    "admin.content.field.content_placeholder": "Write here…",

    "admin.content.language.fr": "Français",
    "admin.content.language.en": "English",

    "admin.content.preview.seo": "SEO (preview)",
    "admin.content.preview.public": "Public rendering",

    "admin.content.history.title": "History",
    "admin.content.history.empty": "No changes recorded.",
    "admin.content.history.created": "Created",
    "admin.content.history.updated": "Updated",

    "admin.content.error.slug_required": "Slug is required.",
    "admin.content.error.title_required":
      "Please fill at least one title (FR or EN).",
    "admin.content.error.question_required":
      "Please fill at least one question (FR or EN).",

    "admin.content.faq.field.category": "Category",
    "admin.content.faq.field.order": "Display order",
    "admin.content.faq.field.tags": "Tags",
    "admin.content.faq.field.tags_placeholder":
      "cancellation, payments, no-show",
    "admin.content.faq.field.question": "Question",
    "admin.content.faq.field.question_placeholder_fr": "Question (FR)",
    "admin.content.faq.field.question_placeholder_en": "Question (EN)",
    "admin.content.faq.field.answer": "Answer",
    "admin.content.faq.field.answer_placeholder": "Your answer…",

    "admin.content.faq.category.reservations": "Bookings",
    "admin.content.faq.category.paiements": "Payments",
    "admin.content.faq.category.annulations": "Cancellations",
    "admin.content.faq.category.comptes_utilisateurs": "User accounts",
    "admin.content.faq.category.comptes_pro": "Pro accounts",
    "admin.content.faq.category.packs_offres": "Packs & offers",
    "admin.content.faq.category.support_general": "General support",

    // Admin rich text editor
    "admin.richtext.h2": "H2",
    "admin.richtext.h3": "H3",
    "admin.richtext.p": "Para.",
    "admin.richtext.bold": "Bold",
    "admin.richtext.italic": "Italic",
    "admin.richtext.underline": "Underline",
    "admin.richtext.ul": "List",
    "admin.richtext.ol": "Num.",
    "admin.richtext.link": "Link",
    "admin.richtext.link.dialog_title": "Add a link",
    "admin.richtext.link.hint":
      "Select text first, then paste the URL (e.g., https://…, /faq, mailto:…).",
    "admin.richtext.link.placeholder": "https://example.com",
    "admin.richtext.link.insert": "Insert",
    "admin.richtext.ai": "AI",

    // Report establishment
    "report.title": "Report this establishment",
    "report.description": "Would you like to report an issue with {name}?",
    "report.reason_label": "Reason for reporting",
    "report.reason_placeholder": "Select a reason",
    "report.reason.closed_permanently": "Permanently closed",
    "report.reason.incorrect_info": "Incorrect information",
    "report.reason.fraudulent": "Fraudulent establishment",
    "report.reason.inappropriate_content": "Inappropriate content",
    "report.reason.safety_concern": "Safety concern",
    "report.reason.other": "Other",
    "report.details_label": "Additional details (optional)",
    "report.details_placeholder": "Describe the issue...",
    "report.submit": "Submit report",
    "report.submitting": "Submitting...",
    "report.error.select_reason": "Please select a reason",
    "report.error.login_required": "You must be logged in to report",
    "report.error.generic": "Error submitting report",
    "report.success.title": "Report submitted",
    "report.success.description": "Thank you for your report. Our team will review it.",
    "report.button": "Report",
    "report.button_tooltip": "Report this establishment",

    // Admin settings
    "admin.settings.title": "⚙️ Superadmin settings",
    "admin.settings.description":
      "Global configuration center — replicated to Supabase",
    "admin.settings.logs": "Logs",
    "admin.settings.loading.title": "Loading",
    "admin.settings.loading.body": "Sync in progress…",
    "admin.settings.sync_report.message":
      "Settings synced with Supabase.\nNew active rules: {created} — Updated rules: {modified} — Nothing to do: {noop}.",
    "admin.settings.permissions.title": "Permissions",
    "admin.settings.permissions.body":
      "This page is restricted to superadmins. If access is not allowed, the user is redirected to the dashboard.",
  };

export default en as Record<string, string>;
