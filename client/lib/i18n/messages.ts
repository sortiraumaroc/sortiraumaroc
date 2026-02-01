import type { AppLocale } from "./types";

export type MessagesDict = Record<string, string>;

export const messages: Record<AppLocale, MessagesDict> = {
  fr: {
    // Common
    "common.close": "Fermer",
    "common.cancel": "Annuler",
    "common.confirm": "Confirmer",
    "common.continue": "Continuer",
    "common.back": "Retour",
    "common.prev": "Précédent",
    "common.next": "Suivant",
    "common.pdf": "PDF",
    "common.error.load_failed": "Erreur de chargement",
    "currency.mad.short": "Dhs",
    "common.loading": "Chargement…",
    "common.refresh": "Rafraîchir",
    "common.impossible": "Impossible",
    "common.error.generic": "Erreur",
    "common.error.unexpected": "Erreur inattendue",
    "common.clear": "Effacer",
    "common.edit": "Modifier",
    "common.reset": "Réinitialiser",
    "common.help": "Aide",

    // Navigation Resume
    "navigation.resume.title": "Reprendre ma navigation",
    "navigation.resume.description": "Vous aviez commencé une recherche. Voulez-vous la reprendre ?",
    "navigation.resume.continue": "Reprendre",
    "navigation.resume.new_search": "Nouvelle recherche",
    "navigation.resume.search": "Votre recherche",
    "navigation.resume.establishment_page": "Page établissement",
    "navigation.resume.just_now": "À l'instant",
    "navigation.resume.minutes_ago": "Il y a {n} min",
    "navigation.resume.hours_ago": "Il y a {n}h",

    "content.toc": "Sommaire",
    "content.related_links": "Liens utiles",

    "blog.index.title": "Blog",
    "blog.index.subtitle":
      "Actualités, guides et conseils pour vos sorties au Maroc.",
    "blog.index.error": "Impossible de charger les articles.",
    "blog.index.empty.title": "Aucun article pour le moment",
    "blog.index.empty.subtitle":
      "Publiez un article depuis le Super-admin pour le voir apparaître ici.",
    "blog.index.back_home": "Retour à l’accueil",

    "common.coming_soon": "Bientôt disponible",
    "common.change": "Changer",
    "common.user": "Utilisateur",
    "common.today": "Aujourd'hui",
    "common.tomorrow": "Demain",
    "common.at": "à",
    "common.time_placeholder": "hh:mm",
    "common.person.one": "personne",
    "common.person.other": "personnes",
    "timepicker.title": "Choisir une heure",

    // Persons
    "persons.title": "Personnes",
    "persons.button.confirm": "Valider",
    "persons.action.add": "Ajouter {label}",
    "persons.action.remove": "Retirer {label}",
    "persons.age_group.age0_2": "0–2 ans",
    "persons.age_group.age3_6": "3–6 ans",
    "persons.age_group.age6_12": "6–12 ans",
    "persons.age_group.age12_17": "12–17 ans",
    "persons.age_group.age18_plus": "+18 ans",

    // Language
    "language.french": "Français",
    "language.english": "English",
    "language.switcher.label": "Langue",
    "language.suggestion.title":
      "Sortir Au Maroc est disponible en Français / English.",
    "language.suggestion.subtitle":
      "Choisissez votre langue. Vous pourrez la changer à tout moment.",

    // Header
    "header.add_establishment.full": "Ajouter mon établissement",
    "header.add_establishment.short": "Ajouter",
    "header.profile.menu": "Menu du profil",
    "header.profile.photo_alt": "Photo de profil",
    "header.profile.my_account": "Mon identifiant",
    "header.profile.my_profile": "Mon profil",

    // NEW: auto-promotion waitlist logic
    "profile.bookings.waitlist_offer": "Offre disponible",
    "header.profile.logout": "Déconnexion",
    "header.login": "Se connecter",
    "header.brand": "Sortir Au Maroc",
    "header.pro_space": "Espace Pro",
    "header.logo_alt": "Sortir Au Maroc",

    "header.pro_conflict.title": "Déconnexion Pro requise",
    "header.pro_conflict.description":
      "Vous êtes connecté à l'espace Pro. Pour vous connecter en tant qu'utilisateur, déconnectez-vous d'abord de l'espace Pro.",
    "header.pro_conflict.go_to_pro": "Accéder à mon espace Pro",
    "header.pro_conflict.logout_pro": "Déconnexion Pro",

    // Auth
    "auth.title.login": "Se connecter à Sortir Au Maroc",
    "auth.title.forgot": "Mot de passe oublié ?",
    "auth.title.signup": "Créer un compte gratuitement",

    "auth.subtitle.login":
      "Accédez à vos réservations, favoris et offres exclusives",
    "auth.subtitle.forgot":
      "Entrez votre email ou numéro de téléphone pour recevoir un lien de réinitialisation.",
    "auth.subtitle.signup":
      "Créez votre compte pour accéder à vos réservations, favoris et offres exclusives.",

    "auth.field.email_or_phone.label": "Email ou Téléphone",
    "auth.field.email_or_phone.placeholder":
      "votre@email.com ou +212 6XX XXX XXX",
    "auth.field.password.label": "Mot de passe",

    "auth.link.forgot_password": "Mot de passe oublié ?",
    "auth.link.create_account": "Créer un compte",
    "auth.link.login": "Se connecter",

    "auth.password.show": "Afficher le mot de passe",
    "auth.password.hide": "Masquer le mot de passe",

    "auth.button.login": "Se connecter",
    "auth.button.login_busy": "Connexion…",
    "auth.button.demo_login": "Connexion démo",

    "auth.or_continue_with": "Ou continuer avec",
    "auth.button.continue_with_google": "Continuer avec Google",
    "auth.button.continue_with_apple": "Continuer avec Apple",
    "auth.button.continue_with_facebook": "Continuer avec Facebook",

    "auth.button.send_reset": "Envoyer le lien",
    "auth.button.send_reset_busy": "Envoi…",

    "auth.button.signup": "Créer mon compte",
    "auth.button.signup_busy": "Création…",

    "auth.note.no_account": "Pas de compte ?",
    "auth.note.have_account": "Déjà un compte ?",

    "auth.error.demo_login_failed":
      "Impossible de se connecter au compte démo. Réessayez.",
    "auth.error.phone_login_unavailable":
      "Pour l’instant, la connexion par téléphone n’est pas disponible. Utilisez un email.",
    "auth.error.invalid_credentials":
      "Identifiants incorrects ou compte inexistant.",
    "auth.error.reset_by_phone_unavailable":
      "Réinitialisation par téléphone non disponible. Utilisez votre email.",
    "auth.error.reset_send_failed":
      "Impossible d’envoyer le lien de réinitialisation. Réessayez.",
    "auth.error.signup_requires_email":
      "Pour l’instant, l’inscription nécessite un email.",
    "auth.error.signup_failed":
      "Impossible de créer le compte. Vérifiez l’email et réessayez.",
    "auth.error.too_many_attempts":
      "Trop de tentatives. Patientez quelques secondes puis réessayez.",
    "auth.error.signup_spam_detected":
      "Inscription bloquée (détection anti-spam).",
    "auth.error.social_unconfigured":
      "Connexion {provider} non configurée pour le moment.",
    "auth.error.social_login_failed":
      "Impossible de se connecter avec ce réseau social. Réessayez.",

    "auth.notice.reset_link_sent":
      "Lien de réinitialisation envoyé. Vérifiez votre boîte email.",
    "auth.notice.account_created":
      "Compte créé. Vérifiez votre email pour confirmer puis reconnectez-vous.",

    // Phone Auth
    "auth.phone.title": "Connexion par téléphone",
    "auth.phone.subtitle": "Entrez votre numéro de téléphone pour recevoir un code de vérification par SMS.",
    "auth.phone.label": "Numéro de téléphone",
    "auth.phone.hint": "Vous recevrez un SMS avec un code à 6 chiffres.",
    "auth.phone.send_code": "Envoyer le code",
    "auth.phone.verify_title": "Vérification",
    "auth.phone.code_sent_to": "Code envoyé au",
    "auth.phone.resend_code": "Renvoyer le code",
    "auth.phone.resend_in": "Renvoyer dans",
    "auth.phone.success_title": "Connexion réussie",
    "auth.phone.success_message": "Vous êtes connecté !",
    "auth.phone.redirecting": "Redirection en cours...",
    "auth.phone.use_email_instead": "Utiliser l'email à la place",
    "auth.phone.use_phone_instead": "Se connecter par téléphone",
    "auth.phone.error.invalid_number": "Numéro de téléphone invalide.",
    "auth.phone.error.send_failed": "Impossible d'envoyer le code. Réessayez.",
    "auth.phone.error.too_many_requests": "Trop de tentatives. Réessayez dans quelques minutes.",
    "auth.phone.error.invalid_code": "Code incorrect. Vérifiez et réessayez.",
    "auth.phone.error.code_expired": "Le code a expiré. Demandez-en un nouveau.",
    "auth.phone.error.verify_failed": "Vérification échouée. Réessayez.",
    "auth.phone.error.not_configured": "L'authentification par téléphone n'est pas disponible pour le moment.",

    // Footer
    "footer.brand": "Sortir Au Maroc",
    "footer.section.partners": "Partenaires",
    "footer.section.professionals": "Professionnels",
    "footer.section.help": "Aide",
    "footer.section.legal": "Légal",
    "footer.section.download_app": "Télécharger l'app",

    "footer.link.discover": "Découvrir",
    "footer.link.about": "À propos",
    "footer.link.contact": "Contact",
    "footer.link.blog": "Blog",
    "footer.link.careers": "Carrières",

    "footer.link.for_restaurateurs": "Pour les restaurateurs",
    "footer.link.for_providers": "Pour les prestataires",
    "footer.link.partner_space": "Espace Prestataires",

    "footer.link.create_pro_account": "Créer un compte pro",
    "footer.link.pro_space": "Espace Pro",
    "footer.link.pricing_offers": "Tarifs & offres",
    "footer.link.features": "Fonctionnalités",
    "footer.link.request_demo": "Demander une démo",

    "footer.link.faq": "Questions fréquentes",
    "footer.link.contact_phone": "Nous contacter · 05 20 12 34 56",
    "footer.link.terms": "Conditions d'utilisation",
    "footer.link.privacy": "Politique de Confidentialité",
    "footer.link.legal_notice": "Mentions légales",
    "footer.link.partner_charter": "Charte établissements",
    "footer.link.refund_policy": "Politique de remboursement",
    "footer.link.anti_no_show_policy": "Politique anti no-show",

    "footer.link.apple_store": "Apple Store",
    "footer.link.google_play": "Google Play",
    "footer.link.admin_aria": "Accéder à l’interface Admin",

    "footer.copyright_suffix": ". Tous droits réservés.",

    // Support pages
    "help.title": "Aide & Support",
    "help.subtitle":
      "FAQ, tickets de support et chat (disponible de 9h à 19h).",
    "help.login_required":
      "Pour créer un ticket ou utiliser le chat, vous devez être connecté. La FAQ reste disponible pour tous.",
    "help.tab.faq": "FAQ",
    "help.tab.tickets": "Tickets",
    "help.tab.chat": "Chat",

    "faq.title": "Questions fréquentes",
    "faq.subtitle":
      "Retrouvez les réponses aux questions les plus courantes : réservations, annulations, paiement et assistance.",
    "faq.button.access_help": "Accéder à l’aide (tickets & chat)",
    "faq.phone_support.title": "Assistance téléphonique",
    "faq.phone_support.hours": " · de 9h à 19h",

    "faq.section.title": "FAQ · Questions fréquentes",
    "faq.section.subtitle":
      "Tapez quelques mots-clés (ex: “annulation”, “paiement”, “retard”).",
    "faq.section.search_placeholder": "Rechercher dans la FAQ…",
    "faq.section.categories": "Catégories",
    "faq.section.category_all": "Toutes les catégories",
    "faq.section.category_all_short": "Toutes",
    "faq.section.results": "{count} résultat(s)",
    "faq.section.empty": "Aucun résultat. Essayez avec d’autres mots-clés.",
    "faq.section.error_load": "Impossible de charger la FAQ. Réessayez.",

    "faq.category.reservations": "Réservations",
    "faq.category.reservations.desc":
      "Confirmation, horaires, nombre de personnes, détails de la réservation.",
    "faq.category.paiements": "Paiements",
    "faq.category.paiements.desc":
      "Dépôt, facture, moyens de paiement, remboursements.",
    "faq.category.annulations": "Annulations",
    "faq.category.annulations.desc":
      "Changer une date, annuler, politiques de l’établissement.",
    "faq.category.comptes_utilisateurs": "Comptes utilisateurs",
    "faq.category.comptes_utilisateurs.desc":
      "Connexion, données personnelles, sécurité du compte.",
    "faq.category.comptes_pro": "Comptes Pro",
    "faq.category.comptes_pro.desc":
      "Espace pro, visibilité, gestion des réservations.",
    "faq.category.packs_offres": "Packs & offres",
    "faq.category.packs_offres.desc": "Offres, packs, visibilité, conditions.",
    "faq.category.support_general": "Support général",
    "faq.category.support_general.desc":
      "Assistance, tickets, contact et questions générales.",

    // SEO
    "seo.home.title": "Sortir Au Maroc — Réservez vos meilleures sorties au Maroc",
    "seo.home.description":
      "Trouvez et réservez vos restaurants, loisirs, spas, hôtels et expériences au Maroc. Réservation simple, confirmations et support.",
    "seo.home.keywords":
      "réservation, restaurant, loisirs, spa, hôtel, activités, Maroc",

    // Home
    "home.hero.title": "Découvrez et réservez les meilleures activités",
    "home.hero.subtitle":
      "Restaurants, loisirs, wellness et bien plus. Réservez en ligne au Maroc",

    "home.universe.restaurants": "Manger & Boire",
    "home.universe.sport": "Sport & Bien-être",
    "home.universe.leisure": "Loisirs",
    "home.universe.accommodation": "Hébergement",
    "home.universe.culture": "Culture",
    "home.universe.shopping": "Shopping",
    "home.universe.rentacar": "Louer un véhicule",

    "home.sections.best_offers.title": "Nos meilleures offres",
    "home.sections.selected_for_you.title":
      "Restaurants sélectionnés pour vous",
    "home.sections.selected_for_you.activities.title":
      "Activités sélectionnées pour vous",
    "home.sections.selected_for_you.sport.title":
      "Sport & Bien-être sélectionnés pour vous",
    "home.sections.selected_for_you.accommodation.title":
      "Hébergements sélectionnés pour vous",
    "home.sections.selected_for_you.culture.title":
      "Culture sélectionnée pour vous",
    "home.sections.selected_for_you.shopping.title":
      "Shopping sélectionné pour vous",
    "home.sections.selected_for_you.rentacar.title":
      "Véhicules sélectionnés pour vous",
    "home.sections.nearby.title": "À proximité de vous",
    "home.sections.most_booked.title": "Les plus réservés du mois",

    "home.categories.restaurants.title": "Votre envie du moment ?",
    "home.categories.sport.title": "Quelle activité vous tente ?",
    "home.categories.loisirs.title": "Une envie de loisir ?",
    "home.categories.hebergement.title": "Quel type d'hébergement ?",
    "home.categories.culture.title": "Envie de culture ?",
    "home.categories.shopping.title": "Envie de shopping ?",
    "home.categories.rentacar.title": "Louez votre véhicule",
    "home.sections.top100.title": "Découvrez le Top 100",
    "home.sections.top100.image_alt": "Top 100",
    "home.sections.view_all": "Voir tous",
    "home.sections.view_more": "VOIR PLUS",

    "home.cards.reviews_count": "{count} avis",
    "home.cards.next_slot": "Prochain créneau: {slot}",
    "home.cards.promo_badge": "-{percent}%",
    "home.cards.curated_badge": "Sélection",
    "home.cards.month_reservations_label": "Réservations (30j)",
    "home.cards.view_details_aria": "Voir la fiche: {name}",

    "home.how_it_works.title": "Comment ça marche ?",
    "home.how_it_works.subtitle":
      "Réservez votre activité préférée en quelques clics",
    "home.how_it_works.step1.title": "Découvrez",
    "home.how_it_works.step1.text":
      "Explorez les restaurants et activités près de chez vous",
    "home.how_it_works.step2.title": "Sélectionnez",
    "home.how_it_works.step2.text":
      "Choisissez votre date, heure et nombre de personnes",
    "home.how_it_works.step3.title": "Payez",
    "home.how_it_works.step3.text":
      "Complétez votre réservation en toute sécurité",
    "home.how_it_works.step4.title": "Profitez",
    "home.how_it_works.step4.text":
      "Recevez votre confirmation et le guide du lieu",

    "home.owner_block.image_alt": "Propriétaire d'établissement",
    "home.owner_block.title": "Êtes-vous propriétaire d'un établissement ?",
    "home.owner_block.subtitle": "Enregistrez votre établissement",
    "home.owner_block.paragraph":
      "Parlez-nous de votre établissement et nous vous contacterons dès que possible.",
    "home.owner_block.button_more": "PLUS D'INFORMATIONS",
    "home.owner_block.already_partner": "Déjà partenaire",
    "home.owner_block.already_partner_text":
      "Accédez à votre tableau de bord pour gérer vos réservations, vos informations, vos catégories (taxonomies), vos offres, vos factures et votre messagerie. Besoin d’aide ? Contactez-nous via le chat.",
    "home.owner_block.dashboard_button": "CONNEXION AU TABLEAU DE BORD",

    "home.featured_offers.items.discount_50.title": "Jusqu'à 50% de réduction",
    "home.featured_offers.items.discount_50.badge": "Offre du moment",
    "home.featured_offers.items.weekend_brunch.title": "Brunch du Weekend",
    "home.featured_offers.items.weekend_brunch.badge": "À la Une",
    "home.featured_offers.items.terrace_night.title": "Soirée sur la Terrasse",
    "home.featured_offers.items.terrace_night.badge": "Offre Limitée",
    "home.featured_offers.items.beach_vibes.title": "Ambiance Plage",
    "home.featured_offers.items.beach_vibes.badge": "Nouveau",
    "home.featured_offers.items.tasting_menu.title": "Menu Dégustation",
    "home.featured_offers.items.tasting_menu.badge": "Spécial",
    "home.featured_offers.items.culinary_experience.title":
      "Expérience Culinaire",
    "home.featured_offers.items.culinary_experience.badge": "Exclusif",

    // Results / Listing
    "results.search": "Rechercher",
    "results.filters": "Filtres",
    "results.view.list": "Liste",
    "results.view.map": "Carte",
    "results.summary.found": "{label} trouvés",
    "results.summary.showing": "Affichage",
    "results.geolocation.enable":
      "Activer la géolocalisation pour voir la distance",
    "results.no_results.title": "Aucun établissement trouvé",
    "results.no_results.body": "Nous n'avons pas trouvé d'établissement correspondant à vos critères.",
    "results.no_results.suggestion": "Essayez de modifier vos filtres ou explorez d'autres destinations pour votre prochaine sortie en couple, entre amis ou en famille !",
    "results.no_results.open_filters": "Modifier les filtres",
    "results.no_results.new_search": "Nouvelle recherche",
    "results.sponsored": "Sponsorisé",
    "results.status.open": "Ouvert",
    "results.status.closed": "Fermé",
    "results.promo.ongoing": "Offre en cours",
    "results.favorite.add": "Ajouter aux favoris",
    "results.favorite.remove": "Retirer des favoris",
    "results.highlight.today_prefix": "Aujourd'hui : ",
    "results.offer.up_to": "Jusqu'à -{percent}%",
    "results.action.book": "Réserver",
    "results.action.view": "Voir",
    "results.action.view_hotel": "Voir l’hôtel",
    "results.load_more": "Afficher {count} résultats supplémentaires",
    "results.people.option.1": "1 personne",
    "results.people.option.2": "2 personnes",
    "results.people.option.3": "3 personnes",
    "results.people.option.4": "4 personnes",
    "results.people.option.5_plus": "5+ personnes",
    "results.search_placeholder": "Où voulez-vous aller ?",
    "results.filter.date": "Date",
    "results.filter.time": "Heure",
    "results.filter.persons_short": "pers.",
    "results.filter.promotions": "Promotions",
    "results.filter.best_rated": "Mieux notés",
    "results.filter.cuisine_type": "Type de cuisine",
    "results.filter.ambiance": "Ambiance",
    "results.filter.sort_and_filter": "Trier et filtrer",

    // Search
    "search.field.city.placeholder": "Ville ou quartier",
    "search.field.activity.placeholder": "Activité ou établissement",
    "search.validation.minimum_people": "Minimum : {count} personnes",

    "search.placeholder.restaurant_type": "Type de lieu",
    "search.title.choose_restaurant_type": "Choisir un type de lieu",
    "search.placeholder.accommodation_type": "Type d'hébergement",
    "search.title.choose_accommodation_type": "Choisir un type d'hébergement",
    "search.placeholder.culture_type": "Type de sortie",
    "search.title.choose_culture_type": "Choisir un type de sortie",
    "search.placeholder.shopping_type": "Type de boutique",
    "search.title.choose_shopping_type": "Choisir un type de boutique",
    "search.placeholder.sport_activity_type": "Type d'activité",
    "search.title.choose_sport_activity_type": "Choisir un type d'activité",
    "search.placeholder.prestation_type": "Type de prestation",
    "search.title.choose_prestation_type": "Choisir un type de prestation",

    "search.restaurant_type.gastronomique": "Gastronomique",
    "search.restaurant_type.rooftop": "Rooftop",
    "search.restaurant_type.plage": "Restaurant de plage",
    "search.restaurant_type.brunch": "Brunch organisé",
    "search.restaurant_type.cafe": "Café",
    "search.restaurant_type.fast_food": "Fast-food",
    "search.restaurant_type.bistronomie": "Bistronomie",
    "search.restaurant_type.familial": "Restaurant familial",

    "search.shopping_type.mode": "Mode",
    "search.shopping_type.chaussures": "Chaussures",
    "search.shopping_type.beaute_parfumerie": "Beauté / Parfumerie",
    "search.shopping_type.optique": "Optique",
    "search.shopping_type.bijoux": "Bijoux",
    "search.shopping_type.maison_deco": "Maison / Déco",
    "search.shopping_type.epicerie_fine": "Épicerie fine",
    "search.shopping_type.artisanat": "Artisanat",
    "search.shopping_type.concept_store": "Concept store",
    "search.shopping_type.autres": "Autres",

    // Rentacar search fields
    "search.placeholder.vehicle_type": "Type de véhicule",
    "search.title.choose_vehicle_type": "Choisir un type de véhicule",
    "search.rentacar.pickup_location": "Prise en charge",
    "search.rentacar.dropoff_location": "Restitution",
    "search.rentacar.same_dropoff": "Restitution identique",
    "search.rentacar.same_dropoff_checkbox": "Restitution au même endroit",
    "search.rentacar.pickup_date": "Date de prise en charge",
    "search.rentacar.dropoff_date": "Date de restitution",
    "search.rentacar.pickup_time": "Heure de prise en charge",
    "search.rentacar.dropoff_time": "Heure de restitution",
    "search.rentacar.driver_age": "Âge du conducteur",
    "search.rentacar.young_driver_warning": "Conducteur de moins de 30 ans ou de plus de 70 ans",
    "search.rentacar.young_driver_description": "Les jeunes conducteurs et les conducteurs séniors peuvent devoir payer des frais supplémentaires.",
    "search.rentacar.select_dates": "Sélectionner les dates",

    // Search history
    "search.history.recent_searches": "Recherches récentes",
    "search.history.clear_all": "Tout effacer",
    "search.history.remove": "Supprimer",

    "results.universe.restaurants.count_label": "restaurants",
    "results.universe.sport.count_label": "activités de bien-être",
    "results.universe.loisirs.count_label": "activités de loisirs",
    "results.universe.hebergement.count_label": "hébergements",
    "results.universe.culture.count_label": "sites culturels",
    "results.universe.shopping.count_label": "lieux de shopping",
    "results.universe.rentacar.count_label": "véhicules",
    "results.universe.default.count_label": "résultats",

    // Vehicle card translations
    "vehicle.badge.super_offer": "Super offre",
    "vehicle.badge.member_price": "Prix membre",
    "vehicle.feature.unlimited_mileage": "Kilométrage illimité",
    "vehicle.cashback": "Gagnez {amount} € en cashback",
    "vehicle.benefit.free_cancellation": "Annulation gratuite",
    "vehicle.benefit.basic_insurance": "Assurance collision de base",
    "vehicle.benefit.online_checkin": "Enregistrement en ligne",
    "vehicle.positive_reviews": "d'avis positifs",
    "vehicle.discount": "de réduction",
    "vehicle.price_per_day": "par jour",
    "vehicle.price_total": "total",
    "vehicle.or_similar": "ou similaire",
    "vehicle.seats": "{count} places",
    "vehicle.sort_filter": "Trier et filtrer",
    "vehicle.total_taxes_included": "Montant total, taxes et frais compris",
    "vehicle.sort_info": "Comment fonctionne notre ordre de tri",

    // Filters
    "filters.title": "Filtres",
    "filters.promotions.title": "Promotions",
    "filters.promotions.subtitle": "Afficher les promotions",
    "filters.promotions.description":
      "Met en avant les établissements avec offres ou réductions",
    "filters.none_available": "Aucun filtre disponible pour cet univers.",
    "filters.apply": "Appliquer",

    "filters.section.restaurant.specialties": "Spécialités culinaires",
    "filters.section.restaurant.specialties.search_placeholder":
      "Rechercher une spécialité",
    "filters.section.price": "Prix",
    "filters.section.availability": "Disponibilité",
    "filters.availability.now": "Disponible maintenant",
    "filters.availability.tonight": "Ce soir",
    "filters.availability.tomorrow": "Demain",
    "filters.availability.specific": "Date spécifique",
    "filters.section.packs_offers": "Packs & offres",
    "filters.section.options": "Options",
    "filters.section.ambience": "Ambiance",
    "filters.section.activity_type": "Type d'activité",
    "filters.section.duration": "Durée",
    "filters.section.audience": "Public",
    "filters.section.level": "Niveau",
    "filters.section.constraints": "Contraintes",
    "filters.constraints.min_people": "Minimum de personnes",
    "filters.constraints.privatization": "Privatisation possible",
    "filters.section.type": "Type",
    "filters.section.format": "Format",
    "filters.section.duration_minutes": "Durée (min)",
    "filters.section.equipment": "Équipements",
    "filters.section.offers": "Offres",
    "filters.section.budget_per_night": "Budget / nuit",
    "filters.section.ratings": "Notes",
    "filters.section.conditions": "Conditions",
    "filters.section.language": "Langue",
    "filters.section.access": "Accès",
    "filters.section.store_type": "Type boutique",
    "filters.section.budget": "Budget",
    "filters.section.services": "Services",
    "filters.placeholder.example": "Ex : {value}",

    // Search suggestions
    "suggestions.my_position": "Ma position",
    "suggestions.use_my_location": "Utiliser ma localisation",
    "suggestions.section.cities": "Villes",
    "suggestions.section.neighborhoods": "Quartiers populaires",
    "suggestions.section.establishments": "Établissements & Activités",
    "suggestions.section.categories": "Catégories & Spécialités",
    "suggestions.section.offers": "Offres",
    "suggestions.section.trending": "Tendances",

    // Booking (high priority paths)
    "booking.steps.details": "Détails",
    "booking.steps.payment": "Paiement",
    "booking.steps.info": "Infos",
    "booking.steps.confirmation": "Confirmation",
    "booking.step_header.label": "ÉTAPE {step} SUR {total}",

    "booking.auth.title": "Connectez-vous pour finaliser (1 min)",
    "booking.auth.subtitle.step2":
      "Cela permet de sécuriser votre réservation et retrouver votre confirmation.",
    "booking.auth.subtitle.step3":
      "Vous pourrez confirmer vos informations et recevoir votre QR code.",

    "booking.establishment.fallback": "Réservation",

    "booking.card.title.restaurant": "Réserver une table",
    "booking.card.title.hotel": "Réserver une chambre",
    "booking.card.title.ticket": "Réserver une entrée",
    "booking.card.title.slot": "Réserver un créneau",
    "booking.card.title.default": "Réserver",

    "booking.cta.book_now": "Réserver maintenant",
    "booking.module.step_progress": "Étape {current} / {total}",

    "booking.people.more_than_10": "Plus de 10 personnes",
    "booking.people.exact_count": "Nombre exact",
    "booking.people.remove_one": "Retirer une personne",
    "booking.people.add_one": "Ajouter une personne",
    "booking.people.up_to": "Jusqu’à 50 personnes.",
    "booking.people.other_number": "Autre nombre",
    "booking.people.range": "Entre {min} et {max} personnes.",

    "booking.step1.title": "Choisissez votre créneau",
    "booking.step1.subtitle":
      "Sélectionnez une date, une heure et le nombre de personnes.",
    "booking.step1.section.date": "Sélectionnez une date",
    "booking.step1.section.time": "Sélectionnez une heure",
    "booking.step1.section.people": "Nombre de personnes",

    "booking.date_time.placeholder": "Sélectionnez une date et une heure",

    "booking.bottomsheet.tab.date": "Date",
    "booking.bottomsheet.tab.time": "Heure",
    "booking.bottomsheet.tab.persons_short": "Pers.",

    "booking.pack.selected": "PACK SÉLECTIONNÉ",
    "booking.pack.remove": "Retirer",

    "booking.step1.date.helper":
      "Choisissez un jour pour afficher les créneaux disponibles.",
    "booking.step1.time.helper": "Choisissez un horaire disponible.",
    "booking.step1.people.helper":
      "Choisissez le nombre de personnes pour la réservation.",

    "booking.step1.recap": "RÉCAPITULATIF",

    "booking.step1.selected.date": "Date sélectionnée",
    "booking.step1.selected.time": "Horaire sélectionné",
    "booking.step1.selected.slot": "Créneau sélectionné",
    "booking.step1.selected.participants": "Participants",

    "booking.step1.no_slots":
      "Aucun créneau disponible pour cette date. Essayez un autre jour.",
    "booking.step1.select_date_first":
      "Sélectionnez d’abord une date pour afficher les créneaux.",
    "booking.step1.select_time_first":
      "Sélectionnez d’abord une heure pour choisir le nombre de personnes.",

    "booking.step1.more_choices": "Plus de choix",
    "booking.step1.more_dates": "Voir plus de dates",

    "booking.waitlist": "Liste d’attente",
    "booking.slot.full": "Complet",
    "booking.slot.full_aria": "Créneau {time} complet",

    "booking.offer.short": "Offre -{promo}% carte",
    "booking.offer.long": "Offre -{promo}% sur la carte",

    "booking.capacity.full_waitlist":
      "Ce créneau est complet. Vous pouvez rejoindre la liste d’attente.",
    "booking.capacity.remaining":
      "Capacité restante pour ce créneau : {remaining}",
    "booking.capacity.limited": "Ce créneau est limité à {remaining} {unit}.",
    "booking.waitlist.notice":
      "Créneau complet : votre demande sera envoyée en liste d’attente.",

    "booking.step1.choose_people": "Choisissez le nombre de personnes",
    "booking.step1.choose_time": "Choisissez une heure",
    "booking.step1.choose_date": "Choisissez une date",

    "booking.activity.slot_at": "Créneau à {time}",
    "booking.time.choose": "Choisir {time}",
    "booking.service.at_time": "{service} à {time}",

    "booking.calendar.choose_date": "Choisir une date",
    "booking.calendar.placeholder": "jj/mm/aaaa",
    "booking.calendar.prev_month": "Mois précédent",
    "booking.calendar.next_month": "Mois suivant",

    "booking.time.bucket.other": "Autres",
    "booking.time.bucket.morning": "Matin",
    "booking.time.bucket.afternoon": "Après-midi",
    "booking.time.bucket.evening": "Soir",
    "booking.time.bucket.breakfast": "Petit-déjeuner",
    "booking.time.bucket.lunch": "Déjeuner",
    "booking.time.bucket.tea_time": "Tea Time",
    "booking.time.bucket.happy_hour": "Happy Hour",
    "booking.time.bucket.dinner": "Dîner",
    "booking.time.bucket.available": "Disponible",

    "booking.service.lunch": "Déjeuner",
    "booking.service.continuous": "Service continu",
    "booking.service.dinner": "Dîner",

    "booking.footer.security_notice":
      "🔒 Paiement sécurisé • ⚡ Géré par Sortir Au Maroc",

    "booking.recap.title": "Récapitulatif",
    "booking.recap.establishment": "Établissement",
    "booking.recap.pack": "Pack",
    "booking.recap.guests": "Personnes",
    "booking.recap.date": "Date",
    "booking.recap.time": "Horaire",
    "booking.recap.discount": "Réduction",

    "booking.mode.guaranteed": "Réservation garantie",
    "booking.mode.not_guaranteed": "Réservation non garantie",

    "booking.price.per_person": "{amount} / personne",
    "booking.price.from": "À partir de",

    "booking.step2.title.secure": "Sécurisez votre réservation",
    "booking.step2.title.waitlist": "Demande de liste d’attente",
    "booking.step2.subtitle.secure":
      "Choisissez si vous souhaitez garantir votre table.",
    "booking.step2.subtitle.waitlist":
      "Le créneau est complet. Nous transmettons votre demande au restaurant.",

    "booking.waitlist.banner.title": "Créneau complet — liste d’attente",
    "booking.waitlist.banner.body":
      "Nous envoyons votre demande au restaurant. Vous serez prévenu si une place se libère.",
    "booking.waitlist.banner.note":
      "Aucun paiement n’est requis pour une demande de liste d’attente.",

    "booking.mode.guaranteed.short": "Place garantie",
    "booking.mode.non_guaranteed.short": "En attente de confirmation",
    "booking.mode.guaranteed.line1":
      "Pré-réservation de {unit} MAD/pers. (déduite de l’addition)",
    "booking.mode.guaranteed.line2": "Annulation gratuite jusqu’à 24h",
    "booking.mode.non_guaranteed.line":
      "Sans paiement initial, le restaurant peut prioriser les places garanties.",
    "booking.mode.non_guaranteed.more":
      "Sans prépaiement, votre réservation dépend de la disponibilité et de la priorité du restaurant. Vous recevrez une confirmation rapidement.",

    "booking.payment.banner.title":
      "Paiement sécurisé — annulation selon conditions",
    "booking.payment.banner.waitlist":
      "Aucun paiement immédiat. Le restaurant confirmera si une place se libère.",
    "booking.payment.banner.followup":
      "Vous recevrez une réponse dès que possible.",
    "booking.payment.banner.guaranteed":
      "Pré-réservation de {unit} MAD / personne (déduite de l’addition).",
    "booking.payment.banner.total": "Total prépayé aujourd’hui : {total} MAD",
    "booking.payment.banner.non_guaranteed":
      "Aucun paiement immédiat. Le restaurant peut prioriser les places garanties.",
    "booking.payment.method.card": "Carte bancaire",
    "booking.payment.secure_method": "Paiement sécurisé",

    "booking.deposit.title": "Un acompte est requis",
    "booking.deposit.description":
      "Pour garantir la disponibilité des établissements et éviter les no-shows, un acompte peut être requis pour certaines réservations.",
    "booking.deposit.amount_label": "Montant à payer",
    "booking.deposit.pre_auth":
      "Pré-réservation : {unit} {currency} × {partySize} pers.",
    "booking.deposit.note":
      "Ce montant sera déduit de l’addition finale. En cas de no-show, il peut être conservé selon les conditions.",
    "booking.deposit.payma_hint":
      "Vous serez redirigé vers pay.ma pour effectuer le paiement. Après le paiement, revenez ici pour finaliser.",
    "booking.deposit.pay_and_confirm": "Payer et confirmer la réservation",

    "booking.deposit.pedagogy.context_label": "Contexte",
    "booking.deposit.pedagogy.context_value":
      "Sur certaines réservations, une confirmation renforcée peut s’appliquer.",
    "booking.deposit.pedagogy.impact_label": "Conséquence",
    "booking.deposit.pedagogy.impact_value":
      "Cette réservation nécessite un acompte pour être confirmée.",
    "booking.deposit.pedagogy.reassurance":
      "Ce n’est pas une sanction : c’est une mesure de protection des créneaux.",
    "booking.deposit.pedagogy.learn_more": "En savoir plus",

    "booking.step3.title": "Confirmez vos informations",
    "booking.step3.subtitle":
      "Ces informations permettront à l’établissement de vous contacter.",
    "booking.step3.description":
      "Ces informations permettront au restaurant de vous contacter à propos de votre réservation.",

    "booking.form.first_name": "Prénom",
    "booking.form.last_name": "Nom",
    "booking.form.email": "Email",
    "booking.form.phone": "Téléphone",
    "booking.form.message": "Message spécial",
    "booking.form.optional": "optionnel",

    "booking.form.placeholder.first_name": "Ex: Marie",
    "booking.form.placeholder.last_name": "Ex: Dupont",
    "booking.form.placeholder.email": "Ex: marie@example.com",
    "booking.form.placeholder.phone": "Ex: +212 6 12 34 56 78",
    "booking.form.placeholder.message": "Ex: Allergies, occasion spéciale…",
    "booking.form.placeholder.message_long":
      "Décrivez l'occasion (anniversaire, rendez-vous...), mentionnez régimes alimentaires, ou demandes spéciales...",

    "booking.step3.privacy_notice":
      "🔒 Vos données sont sécurisées et ne seront partagées qu'avec le restaurant pour votre réservation.",
    "booking.step3.cta.review": "Vérifier",

    "booking.step4.title.confirmed": "Votre réservation est confirmée",
    "booking.step4.title.waitlist": "Demande en liste d’attente",
    "booking.step4.title.sent": "Demande envoyée",

    "booking.step4.subtitle.confirmed":
      "Retrouvez votre QR code et vos documents à présenter à l’arrivée.",
    "booking.step4.subtitle.waitlist":
      "Le créneau est complet. Le restaurant vous recontactera si une place se libère.",
    "booking.step4.subtitle.sent":
      "Le restaurant doit valider votre demande. Vous recevrez une réponse rapidement.",

    "booking.step4.banner.title.confirmed": "Réservation confirmée !",
    "booking.step4.banner.title.pending": "Demande soumise",
    "booking.step4.banner.body.confirmed":
      "Votre place est garantie. Un SMS de confirmation a été envoyé.",
    "booking.step4.banner.body.pending":
      "Le restaurant confirmera votre réservation par SMS ou WhatsApp sous peu.",

    "booking.step4.contact.title": "CONTACT",
    "booking.step4.contact.confirmation_sent":
      "Confirmation envoyée au numéro fourni",
    "booking.step4.reference.title": "RÉFÉRENCE DE RÉSERVATION",

    "booking.step4.qr.title": "Code QR - À présenter au restaurant",
    "booking.step4.qr.alt": "QR code de réservation",
    "booking.step4.qr.body":
      "Le restaurant pourra scanner ce QR code pour confirmer votre présence",

    "booking.step4.pdf.title": "Télécharger la réservation en PDF",
    "booking.step4.pdf.cta": "Exporter en PDF",
    "booking.step4.pdf.generating": "Génération...",

    "booking.step4.wallet.apple": "Ajouter à Apple Wallet",
    "booking.step4.wallet.google": "Ajouter à Google Wallet",

    "booking.step4.calendar.add": "Ajouter au calendrier",
    "booking.step4.directions": "Voir l'itinéraire",

    "booking.step4.modify": "Modifier",
    "booking.step4.cancel": "Annuler",
    "booking.step4.cancel.confirm":
      "Êtes-vous sûr de vouloir annuler cette réservation ?",

    "booking.step4.trust.ssl": "Paiement sécurisé avec SSL 256-bit",
    "booking.step4.trust.managed_by": "Réservation gérée par Sortir Au Maroc",
    "booking.step4.trust.count": "Plus de 5,000 réservations effectuées",

    "booking.step4.home": "Retour à l'accueil",
    "booking.step4.calendar.event_title": "Réservation - {establishment}",
    "booking.waitlist.missing_slot":
      "Impossible de rejoindre la liste d’attente : aucun créneau n’a été sélectionné.",

    "booking.modify.title": "Demander une modification",
    "booking.modify.datetime_label": "Nouvelle date/heure ({optional})",
    "booking.modify.datetime_help":
      "L’établissement confirmera la modification (selon disponibilité).",
    "booking.modify.party_size_label": "Nombre de personnes ({optional})",
    "booking.modify.party_size_placeholder": "Ex : 4",
    "booking.modify.send": "Envoyer",

    // Reservation status (extra)
    "reservation.status.modification_pending":
      "En contrôle (modification demandée)",
    "reservation.status.modification_pending.title":
      "Votre demande de modification est en cours de traitement par l’établissement.",

    "reservation.status.refused": "Refusée",
    "reservation.status.refused.title": "Réservation refusée",
    "reservation.status.waitlist": "Liste d’attente",
    "reservation.status.pending_pro": "En attente de validation",

    "reservation.status.cancelled.you": "Annulée (vous)",
    "reservation.status.cancelled.client": "Annulée (client)",
    "reservation.status.cancelled.establishment": "Annulée (établissement)",
    "reservation.status.cancelled.refunded": "Annulée / remboursée",
    "reservation.status.cancelled.generic": "Annulée",

    "reservation.status.no_show": "No-show",

    "reservation.status.past.present": "Passée · présent",
    "reservation.status.past.no_show": "Passée · no-show",
    "reservation.status.past.generic": "Passée",

    "reservation.status.confirmed": "Confirmée",
    "reservation.status.confirmed.guaranteed": "Confirmée · garantie",
    "reservation.status.confirmed.not_guaranteed": "Confirmée · non garantie",

    "reservation.status.generic": "Réservation",

    // Payment status
    "payment.status.paid": "Payé",
    "payment.status.pending": "Non payé",
    "payment.status.refunded": "Remboursé",

    // Booking details
    "booking_details.loading.title": "Chargement…",
    "booking_details.loading.body": "Nous récupérons votre réservation.",

    "booking_details.not_found": "Réservation introuvable",
    "booking_details.not_found.body_default":
      "Cette réservation n'existe plus ou a été supprimée.",
    "booking_details.back_to_account": "Retour au compte",
    "booking_details.explore": "Explorer",
    "booking_details.back": "Retour",

    "booking_details.ref_prefix": "Réf.",
    "booking_details.field.date": "Date",
    "booking_details.field.time": "Heure",
    "booking_details.field.people": "Personnes",
    "booking_details.field.address": "Adresse",

    // NEW: auto-promotion waitlist logic
    "booking_details.waitlist_offer.badge": "Offre (liste d’attente)",
    "booking_details.waitlist_offer.title": "Offre de place disponible",
    "booking_details.waitlist_offer.body":
      "Vous avez 15 minutes pour confirmer cette réservation.",
    "booking_details.waitlist_offer.expires_at": "Expire à {time}",
    "booking_details.waitlist_offer.accept": "Accepter",
    "booking_details.waitlist_offer.refuse": "Refuser",
    "booking_details.waitlist_offer.expired_title": "Offre expirée",
    "booking_details.waitlist_offer.expired_body":
      "Cette offre n’est plus disponible. Le système proposera la place au prochain client.",
    "booking_details.waitlist_offer.waiting_title": "En liste d’attente",
    "booking_details.waitlist_offer.waiting_body":
      "Votre position actuelle : #{position}.",

    "booking_details.payment.title": "Paiement",
    "booking_details.payment.status": "Statut",
    "booking_details.payment.amount": "Montant",
    "booking_details.payment.total": "Total",
    "booking_details.payment.paid_at": "Payé le",
    "booking_details.payment.method": "Moyen",
    "booking_details.payment.escrow_held_badge": "Fonds retenus ⚠️",
    "booking_details.payment.none": "Aucun paiement enregistré.",
    "booking_details.payment.secure": "Paiement sécurisé",
    "booking_details.payment.pre_reservation_per_person":
      "Pré-réservation (par pers.)",
    "booking_details.payment.total_prepaid": "Total prépayé",
    "booking_details.payment.calculation": "Calcul : {unit} × {count} pers.",

    "booking_details.qr.title": "QR code & documents",
    "booking_details.qr.invoice": "Facture",
    "booking_details.qr.alt": "QR Code",
    "booking_details.qr.present_on_arrival": "À présenter à l'arrivée",
    "booking_details.qr.contains":
      "Le QR code contient la référence de réservation et, si disponible, le montant prépayé.",
    "booking_details.qr.pdf_restaurant_only":
      "Le PDF est disponible pour les réservations restaurant.",

    "booking_details.review.title": "Avis",
    "booking_details.review.overall": "Note globale : {rating}/5",
    "booking_details.review.criteria_average": "Moyenne des critères",
    "booking_details.review.published_at": "Publié le {date}",
    "booking_details.review.leave": "Laisser un avis",
    "booking_details.review.rate_each": "Notez chaque critère",
    "booking_details.review.estimated": "Note globale estimée : {rating}/5",
    "booking_details.review.comment_label": "Commentaire",
    "booking_details.review.comment_placeholder": "Partagez votre expérience…",
    "booking_details.review.publish": "Publier",
    "booking_details.review.thank_you_title": "Merci !",
    "booking_details.review.saved_body": "Votre avis a été enregistré.",
    "booking_details.review.unavailable":
      "Laisser un avis est disponible après la réservation, si le client s'est présenté.",

    "booking_details.summary.title": "Récapitulatif",
    "booking_details.summary.note": "Note :",
    "booking_details.summary.phone": "Téléphone :",

    "booking_details.pro_message.title": "Message de l’établissement",
    "booking_details.pro_message.template_prefix": "template",

    "booking_details.service.lunch": "déjeuner",
    "booking_details.service.continuous": "continu",
    "booking_details.service.dinner": "dîner",

    "booking_details.attendance.title": "Présence",
    "booking_details.attendance.present": "Présent(e)",
    "booking_details.attendance.no_show": "Absent(e) / no-show",
    "booking_details.attendance.unknown": "Non renseigné",

    "booking_details.toast.declined.title": "Proposition refusée",
    "booking_details.toast.declined.body": "Nous avons informé le système.",
    "booking_details.toast.accepted.title": "Demande envoyée",
    "booking_details.toast.accepted.body":
      "Votre acceptation a été envoyée au Pro pour validation.",
    "booking_details.toast.change_cancelled.title": "Annulé",
    "booking_details.toast.change_cancelled.body":
      "Votre demande de modification a été retirée.",
    "booking_details.toast.cancellation_sent.title": "Annulation envoyée",
    "booking_details.toast.cancellation_sent.body":
      "Votre demande d’annulation a été enregistrée. Vous recevrez une confirmation dès que le remboursement (si applicable) sera traité.",
    "booking_details.toast.payment_initiated.title": "Paiement initié",
    "booking_details.toast.payment_initiated.body":
      "Une fois le paiement effectué, revenez ici et réessayez d’accepter l’offre.",
    "booking_details.toast.change_request_sent.title": "Demande envoyée",
    "booking_details.toast.change_request_sent.body":
      "Votre demande de modification a été envoyée à l’établissement. Vous recevrez une réponse dès qu’elle sera traitée.",

    "booking_details.cancellation.free_until":
      "Annulation gratuite jusqu’à {date}.",
    "booking_details.cancellation.conditional":
      "Annulation sous conditions (retenue {percent}%).",
    "booking_details.cancellation.default_note":
      "Les demandes sont traitées par l’établissement selon sa disponibilité et sa politique.",

    // UI (Menu / Restaurant / Profile / Support / etc.)
    "common.error": "Erreur",
    "common.limited_offer": "Offre limitée",
    "common.per_person": "par personne",
    "common.instead_of": "au lieu de",

    "not_found.title": "Page introuvable",
    "not_found.body": "Désolé, cette page n’existe pas (ou plus).",
    "not_found.back_home": "Retour à l’accueil",
    "not_found.view_results": "Voir les résultats",

    "hotel.booking.title_fallback": "Réservation hôtel",
    "hotel.booking.step.details": "Détails",
    "hotel.booking.step.conditions": "Conditions",
    "hotel.booking.step.info": "Infos",
    "hotel.booking.step.confirmation": "Confirmation",
    "hotel.booking.payment_footer": "Paiement sécurisé • Géré par Sortir Au Maroc",

    "menu.search.placeholder": "Rechercher dans le menu…",
    "menu.search.results_label": "Résultats",
    "menu.search.no_results": "Aucun résultat pour votre recherche.",
    "menu.sort.label": "Trier",
    "menu.sort.all": "Tous",
    "menu.sort.popular": "Populaires",
    "menu.sort.best_sellers": "Meilleures ventes",
    "menu.group.packs": "Packs",
    "menu.packs.subtitle": "Offres & packs",
    "menu.items.count": "{count} plats",

    "menu.badge.new": "Nouveau",
    "menu.badge.specialty": "Spécialité",
    "menu.badge.best_seller": "Best-seller",
    "menu.badge.healthy": "Healthy",
    "menu.badge.vegetarian": "Végétarien",
    "menu.badge.fast": "Rapide",

    "pack.book_cta": "Réserver ce pack",
    "pack.urgency.today_only": "Aujourd’hui seulement",
    "pack.urgency.limited_recommended": "Places limitées",
    "pack.urgency.high_demand": "Très demandé",
    "pack.urgency.exclusive": "Offre exclusive",

    "restaurant.quick_booking.title": "Réservation rapide",
    "restaurant.quick_booking.subtitle":
      "Choisissez une date, une heure et le nombre de personnes.",
    "restaurant.quick_booking.duration": "1 min",
    "restaurant.quick_booking.closed_warning": "Créneau indisponible",
    "restaurant.quick_booking.advice":
      "Vous pourrez finaliser la réservation dans l’étape suivante.",
    "restaurant.quick_booking.cta.choose_slot": "Choisir ce créneau",
    "restaurant.quick_booking.cta.book_slot": "Réserver ce créneau",

    "weekday.monday": "Lundi",
    "weekday.tuesday": "Mardi",
    "weekday.wednesday": "Mercredi",
    "weekday.thursday": "Jeudi",
    "weekday.friday": "Vendredi",
    "weekday.saturday": "Samedi",
    "weekday.sunday": "Dimanche",

    "restaurant.hours.title": "Horaires",
    "restaurant.hours.table.day": "Jour",
    "restaurant.hours.service.lunch": "Déjeuner",
    "restaurant.hours.service.dinner": "Dîner",
    "restaurant.hours.status.open": "Ouvert",
    "restaurant.hours.status.soon": "Bientôt",
    "restaurant.hours.status.closed": "Fermé",
    "restaurant.hours.today_label": "Aujourd’hui : {day}",
    "restaurant.hours.week_toggle": "Voir les horaires de la semaine",
    "restaurant.hours.closed": "Fermé",
    "restaurant.hours.closed_today": "Fermé aujourd’hui",
    "restaurant.hours.next_slot.label": "Prochain créneau : {day} {from}–{to}",
    "restaurant.hours.next_slot.unavailable": "Aucun créneau à venir",

    "restaurant.hours.compatibility.ok": "Créneau disponible",
    "restaurant.hours.compatibility.not_ok": "Créneau indisponible",
    "restaurant.hours.compatibility.closed_day": "Fermé ce jour-là.",
    "restaurant.hours.compatibility.opens_at": "Ouvre à {time}.",
    "restaurant.hours.compatibility.opens_tomorrow_at":
      "Ouvre demain à {time}.",
    "restaurant.hours.compatibility.not_compatible": "Horaire non compatible.",

    "profile.user.fallback_name": "Mon compte",

    "profile.gate.title": "Connectez-vous pour accéder à votre profil",
    "profile.gate.subtitle":
      "Retrouvez vos réservations, favoris et préférences.",
    "profile.gate.cta.explore": "Explorer",
    "profile.gate.card.bookings.title": "Réservations",
    "profile.gate.card.bookings.subtitle":
      "Consultez vos réservations en cours et passées.",
    "profile.gate.card.favorites.title": "Favoris",
    "profile.gate.card.favorites.subtitle":
      "Retrouvez vos établissements enregistrés.",
    "profile.gate.card.preferences.title": "Préférences",
    "profile.gate.card.preferences.subtitle": "Personnalisez votre expérience.",

    "profile.contact.placeholder": "Email ou téléphone",

    "profile.stats.bookings": "Réservations",
    "profile.stats.favorites": "Favoris",
    "profile.stats.preferences": "Préférences",
    "profile.stats.preferences.short": "{enabled}/{total} activées",
    "profile.stats.preferences.long":
      "{enabled} sur {total} préférences activées",
    "profile.stats.preferences.examples":
      "Ex : rooftop, brunch, hammam, activités en famille…",

    "profile.tabs.info": "Infos",
    "profile.tabs.bookings": "Réservations",
    "profile.tabs.waitlist": "Liste d’attente",
    "profile.tabs.billing": "Facturation",
    "profile.tabs.packs": "Packs",
    "profile.tabs.favorites": "Favoris",
    "profile.tabs.preferences": "Préférences",
    "profile.tabs.privacy_account": "Confidentialité & compte",

    "profile.privacy.title": "Confidentialité & compte",
    "profile.privacy.subtitle":
      "Gérez votre compte, vos données et vos demandes (désactivation, suppression, export).",

    "profile.privacy.export.title": "Télécharger mes données",
    "profile.privacy.export.description":
      "Recevez un lien sécurisé par email (JSON ou CSV).",
    "profile.privacy.export.button": "Demander l’export",
    "profile.privacy.export.button.loading": "Demande…",
    "profile.privacy.export.toast.title": "Demande envoyée",
    "profile.privacy.export.toast.description":
      "Si un email est associé à votre compte, vous recevrez un lien de téléchargement.",

    "profile.privacy.deactivate.title": "Désactiver temporairement mon compte",
    "profile.privacy.deactivate.description":
      "Votre compte sera mis en pause. Vous pourrez le réactiver en vous reconnectant.",
    "profile.privacy.deactivate.button": "Désactiver",
    "profile.privacy.deactivate.button.loading": "Désactivation…",
    "profile.privacy.deactivate.button.confirm": "Confirmer la désactivation",
    "profile.privacy.deactivate.dialog.title": "Désactiver mon compte",
    "profile.privacy.deactivate.dialog.description":
      "Choisissez une raison (optionnel) et confirmez. Vous serez déconnecté.",
    "profile.privacy.deactivate.toast.title": "Compte désactivé",
    "profile.privacy.deactivate.toast.description":
      "Votre compte est en pause. Vous pourrez le réactiver en vous reconnectant.",

    "profile.privacy.delete.title": "Supprimer définitivement mon compte",
    "profile.privacy.delete.description":
      "Suppression irréversible. Certaines informations peuvent être conservées si la loi l’impose.",
    "profile.privacy.delete.button": "Supprimer",
    "profile.privacy.delete.button.loading": "Suppression…",
    "profile.privacy.delete.button.confirm": "Confirmer la suppression",
    "profile.privacy.delete.dialog.title": "Supprimer mon compte",
    "profile.privacy.delete.dialog.description":
      "Choisissez une raison puis confirmez. Cette action est irréversible.",
    "profile.privacy.delete.step2.warning":
      "Dernière étape : cette action est irréversible. Une fois supprimé, votre compte ne pourra pas être récupéré.",
    "profile.privacy.delete.step2.confirm_label":
      'Tapez "{word}" pour confirmer',
    "profile.privacy.delete.confirm_word": "SUPPRIMER",
    "profile.privacy.delete.toast.title": "Compte supprimé",
    "profile.privacy.delete.toast.description":
      "Votre compte a été supprimé. Merci d’avoir utilisé Sortir Au Maroc.",

    "profile.privacy.reason.label": "Raison (optionnel)",
    "profile.privacy.reason.details.label": "Détails (optionnel)",
    "profile.privacy.reason.details.placeholder":
      "Dites-nous en quelques mots…",

    "profile.privacy.reason.pause": "Je fais une pause temporaire",
    "profile.privacy.reason.not_using": "Je n’utilise pas assez Sortir Au Maroc",
    "profile.privacy.reason.too_many_notifications": "Trop de notifications",
    "profile.privacy.reason.technical_issue": "Problème technique",
    "profile.privacy.reason.privacy_concerns":
      "Préoccupations liées à la confidentialité",
    "profile.privacy.reason.not_found":
      "Je n’ai pas trouvé ce que je cherchais",
    "profile.privacy.reason.other": "Autre",

    "profile.privacy.deactivate.message.pause":
      "Merci. Nous mettons votre compte en pause. Vous pourrez le réactiver quand vous le souhaitez.",
    "profile.privacy.deactivate.message.not_using":
      "Merci pour votre retour. Votre compte sera mis en pause.",
    "profile.privacy.deactivate.message.too_many_notifications":
      "Compris. Votre compte sera mis en pause et vous ne recevrez plus de notifications.",
    "profile.privacy.deactivate.message.technical_issue":
      "Merci. Si vous souhaitez, contactez-nous : nous ferons de notre mieux pour résoudre le problème.",
    "profile.privacy.deactivate.message.privacy_concerns":
      "Merci. Nous prenons la confidentialité au sérieux et restons disponibles si vous avez des questions.",
    "profile.privacy.deactivate.message.not_found":
      "Merci. Nous espérons vous revoir bientôt sur Sortir Au Maroc.",
    "profile.privacy.deactivate.message.other":
      "Merci. Votre compte sera mis en pause.",

    "profile.privacy.delete.reason.not_using_anymore":
      "Je n’utilise plus Sortir Au Maroc",
    "profile.privacy.delete.reason.found_alternative":
      "J’ai trouvé une alternative",
    "profile.privacy.delete.reason.unsatisfied_experience":
      "Expérience insatisfaisante",
    "profile.privacy.delete.reason.too_buggy": "Trop de bugs",
    "profile.privacy.delete.reason.payment_issue": "Problème lié aux paiements",
    "profile.privacy.delete.reason.data_privacy":
      "Préoccupations données personnelles",
    "profile.privacy.delete.reason.not_covered":
      "Je ne suis plus dans une zone couverte",

    "profile.privacy.delete.message.not_using_anymore":
      "Merci pour votre retour. Nous allons traiter votre demande de suppression.",
    "profile.privacy.delete.message.found_alternative":
      "Merci pour votre retour. Nous allons traiter votre demande de suppression.",
    "profile.privacy.delete.message.unsatisfied_experience":
      "Merci. Nous sommes désolés que l’expérience n’ait pas été à la hauteur.",
    "profile.privacy.delete.message.too_buggy":
      "Merci. Nous sommes désolés pour les problèmes rencontrés.",
    "profile.privacy.delete.message.payment_issue":
      "Merci. Si vous souhaitez, contactez-nous pour clarifier la situation avant la suppression.",
    "profile.privacy.delete.message.data_privacy":
      "Merci. Nous allons traiter votre demande conformément à notre politique de confidentialité.",
    "profile.privacy.delete.message.not_covered":
      "Merci. Nous espérons revenir bientôt dans votre zone.",
    "profile.privacy.delete.message.other":
      "Merci. Nous allons traiter votre demande de suppression.",

    "profile.privacy.footer_hint":
      "Besoin d’aide ? Vous pouvez contacter le support depuis la page Aide.",

    "profile.waitlist.title": "Liste d’attente",
    "profile.waitlist.subtitle":
      "Suivez votre position et répondez aux offres quand une place se libère.",
    "profile.waitlist.empty.title": "Aucune liste d’attente",
    "profile.waitlist.empty.subtitle":
      "Quand un créneau est complet, vous pouvez rejoindre la liste d’attente depuis la page de réservation.",
    "profile.waitlist.empty.hint":
      "Astuce : si vous avez une réservation marquée « Liste d’attente », elle apparaît dans l’onglet Réservations.",
    "profile.waitlist.section.active": "Demandes actives",
    "profile.waitlist.section.expired": "Historique",
    "profile.waitlist.section.active_empty": "Aucune demande active.",
    "profile.waitlist.section.expired_empty": "Aucun historique.",
    "profile.waitlist.status.offer": "Offre",
    "profile.waitlist.status.waiting": "En attente",
    "profile.waitlist.status.accepted": "Acceptée",
    "profile.waitlist.status.expired": "Terminée",
    "profile.waitlist.status.unknown": "Statut",
    "profile.waitlist.field.date": "Date",
    "profile.waitlist.field.time": "Heure",
    "profile.waitlist.field.people": "Personnes",
    "profile.waitlist.offer.expires_at": "Expire à {time}",
    "profile.waitlist.position": "Position : #{position}",
    "profile.waitlist.cancel": "Annuler",
    "profile.waitlist.view_reservation": "Voir",
    "profile.waitlist.establishment_fallback": "Établissement",

    "profile.info.title": "Mes informations",
    "profile.info.subtitle":
      "Mettez à jour vos informations pour faciliter vos réservations.",
    "profile.info.first_name.label": "Prénom",
    "profile.info.first_name.placeholder": "Ex : Marie",
    "profile.info.last_name.label": "Nom",
    "profile.info.last_name.placeholder": "Ex : Dupont",
    "profile.info.phone.label": "Téléphone",
    "profile.info.phone.placeholder": "Ex : +212 6 12 34 56 78",
    "profile.info.phone.help": "Utilisé pour vous contacter si besoin.",
    "profile.info.csp.label": "Situation professionnelle",
    "profile.info.csp.placeholder": "Sélectionner…",
    "profile.info.csp.help": "Optionnel.",
    "profile.info.dob.label": "Date de naissance",
    "profile.info.dob.placeholder": "jj/mm/aaaa",
    "profile.info.dob.help": "Optionnel.",
    "profile.info.city.label": "Ville",
    "profile.info.city.placeholder": "Ex : Casablanca",
    "profile.info.save": "Enregistrer",
    "profile.info.saved": "Enregistré",
    "profile.info.last_updated": "Dernière mise à jour : {value}",
    "profile.info.edit": "Modifier",
    "profile.info.phone.verified": "Vérifié",
    "profile.info.phone.verified_help": "Ce numéro a été vérifié et ne peut plus être modifié.",
    "profile.info.phone.verify": "Vérifier",
    "profile.info.phone.verify_description": "Envoyez un code SMS pour vérifier votre numéro.",
    "profile.info.email.verified": "Vérifié",
    "profile.info.email.verified_help": "Cette adresse a été vérifiée.",
    "profile.info.email.verify": "Vérifier",
    "profile.info.email.verify_description": "Un code à 8 chiffres sera envoyé à votre adresse.",

    // Phone verification modal
    "profile.phone_verification.title": "Vérifier mon numéro",
    "profile.phone_verification.subtitle": "Un code SMS sera envoyé à votre numéro pour le vérifier. Une fois vérifié, il ne pourra plus être modifié.",
    "profile.phone_verification.success": "Numéro vérifié !",
    "profile.phone_verification.success_description": "Votre numéro de téléphone a été vérifié avec succès.",
    "profile.phone_verification.not_available": "Vérification indisponible",

    // Email verification modal
    "profile.email_verification.title": "Vérifier mon email",
    "profile.email_verification.subtitle": "Résolvez le captcha puis cliquez sur Envoyer. Un code à 8 chiffres sera envoyé à votre adresse email.",
    "profile.email_verification.send_code": "Envoyer le code",
    "profile.email_verification.enter_code": "Entrez le code reçu",
    "profile.email_verification.code_sent_to": "Code envoyé à",
    "profile.email_verification.success": "Email vérifié !",
    "profile.email_verification.success_description": "Votre adresse email a été vérifiée avec succès.",
    "profile.email_verification.error.invalid_email": "Adresse email invalide.",
    "profile.email_verification.error.send_failed": "Impossible d'envoyer le code. Réessayez.",
    "profile.email_verification.error.invalid_code": "Code incorrect. Vérifiez et réessayez.",
    "profile.email_verification.error.code_expired": "Ce code a expiré. Demandez-en un nouveau.",
    "profile.email_verification.error.captcha_required": "Veuillez résoudre le captcha.",

    "profile.info.csp.group.education": "Études",
    "profile.info.csp.group.unemployed": "Sans emploi",
    "profile.info.csp.group.employed": "Salarié",
    "profile.info.csp.group.self_employed": "Indépendant",
    "profile.info.csp.group.public": "Secteur public",
    "profile.info.csp.group.commerce": "Commerce",
    "profile.info.csp.group.manual": "Ouvriers & services",
    "profile.info.csp.group.other": "Autres",

    "profile.info.csp.student": "Étudiant",
    "profile.info.csp.intern": "Stagiaire",
    "profile.info.csp.unemployed": "Sans emploi",
    "profile.info.csp.job_seeker": "Demandeur d’emploi",
    "profile.info.csp.retraining": "Reconversion",
    "profile.info.csp.employee": "Employé",
    "profile.info.csp.technician": "Technicien",
    "profile.info.csp.supervisor": "Agent de maîtrise",
    "profile.info.csp.manager": "Manager",
    "profile.info.csp.executive": "Cadre",
    "profile.info.csp.freelance": "Freelance",
    "profile.info.csp.entrepreneur": "Entrepreneur",
    "profile.info.csp.liberal_profession": "Profession libérale",
    "profile.info.csp.public_servant": "Fonctionnaire",
    "profile.info.csp.merchant": "Commerçant",
    "profile.info.csp.artisan": "Artisan",
    "profile.info.csp.worker": "Ouvrier",
    "profile.info.csp.service_employee": "Employé de services",
    "profile.info.csp.retired": "Retraité",
    "profile.info.csp.stay_at_home": "Au foyer",
    "profile.info.csp.other": "Autre",

    "profile.bookings.loading": "Chargement des réservations…",
    "profile.bookings.empty.title": "Aucune réservation",
    "profile.bookings.empty.subtitle": "Vos réservations apparaîtront ici.",
    "profile.bookings.ref": "Réf.",
    "profile.bookings.view": "Voir",
    "profile.bookings.field.date": "Date",
    "profile.bookings.field.time": "Heure",
    "profile.bookings.field.people": "Personnes",
    "profile.bookings.pre_reservation": "Pré-réservation",
    "profile.bookings.amount_paid": "Montant payé",

    "support.tickets.title": "Tickets support",
    "support.tickets.subtitle": "Créez et suivez vos demandes d’assistance.",
    "support.hours": "Service client disponible de 9h à 19h",
    "support.tickets.new": "Nouveau ticket",
    "support.tickets.my_tickets": "Mes tickets",
    "support.tickets.empty": "Aucun ticket pour le moment.",
    "support.tickets.select_prompt":
      "Sélectionnez un ticket pour voir les détails.",

    "support.ticket.form.subject": "Sujet",
    "support.ticket.form.subject.placeholder": "Ex : Problème de réservation",
    "support.ticket.form.category": "Catégorie",
    "support.ticket.form.category.placeholder": "Choisir une catégorie",
    "support.ticket.form.message": "Message",
    "support.ticket.form.message.placeholder": "Décrivez votre demande…",
    "support.ticket.form.submit": "Envoyer",

    "support.ticket.category.reservations": "Réservations",
    "support.ticket.category.cancellation": "Annulation",
    "support.ticket.category.billing": "Paiement / facturation",
    "support.ticket.category.account": "Compte",
    "support.ticket.category.technical": "Technique",
    "support.ticket.category.partners": "Partenaires",
    "support.ticket.category.other": "Autre",

    "support.ticket.updated_at": "Mis à jour : {date}",
    "support.ticket.status.open": "Ouvert",
    "support.ticket.status.closed": "Fermé",
    "support.ticket.action.close": "Clôturer",
    "support.ticket.action.reopen": "Réouvrir",

    "support.ticket.reply": "Réponse",
    "support.ticket.reply.placeholder": "Écrire un message…",
    "support.ticket.reply.placeholder_closed": "Ce ticket est fermé.",
    "support.ticket.reply.send": "Envoyer",
    "support.ticket.closed_note":
      "Ce ticket est fermé. Réouvrez-le pour répondre.",

    "treatments.category.packs": "Packs",
    "treatments.category.buggy": "Buggy",
    "treatments.category.quad": "Quad",
    "treatments.category.motocross": "Motocross",
    "treatments.category.kids": "Enfants",
    "treatments.category.rides": "Balades",
    "treatments.category.options": "Options",
    "treatments.category.hammam": "Hammam",
    "treatments.category.massage": "Massage",
    "treatments.category.cils": "Cils & sourcils",
    "treatments.category.onglerie": "Onglerie",
    "treatments.category.coiffure": "Coiffure",
    "treatments.category.other": "Autres",

    "treatments.empty.title": "Aucune prestation",
    "treatments.empty.subtitle": "Les prestations seront bientôt disponibles.",
    "treatments.category_empty.title": "Aucune prestation",
    "treatments.category_empty.subtitle":
      "Aucune prestation dans cette catégorie pour le moment.",

    "establishment.tabs.aria_label": "Navigation de la fiche",
    "establishment.tabs.menu": "Menu",
    "establishment.tabs.reviews": "Avis",
    "establishment.tabs.info": "Infos",
    "establishment.tabs.hours": "Horaires",
    "establishment.tabs.map": "Carte",
    "establishment.tabs.rooms": "Chambres",
    "establishment.tabs.services": "Services",
    "establishment.tabs.pricing": "Prestations & tarifs",

    // Pro booking settings
    "pro.booking_settings.title": "Annulations & modifications",
    "pro.booking_settings.subtitle":
      "Paramétrez vos politiques d’annulation et de modification (texte affiché côté USER).",
    "pro.booking_settings.reload": "Recharger",
    "pro.booking_settings.save": "Enregistrer",
    "pro.booking_settings.load_failed":
      "Impossible de charger la politique (réessayez).",

    "pro.booking_settings.pedagogy.title": "Protection des créneaux",
    "pro.booking_settings.pedagogy.body":
      "Sortir Au Maroc peut demander un acompte sur certaines réservations afin de réduire les no-shows et sécuriser vos créneaux. Cette mesure est automatique et vise à protéger l’expérience de tous.",
    "pro.booking_settings.pedagogy.note":
      "Conseil : expliquez au client que le dépôt sert à confirmer et protéger le créneau.",

    "pro.booking_settings.section.cancel.title": "A — Politique d’annulation",
    "pro.booking_settings.section.cancel.description":
      "Délais, pénalités et texte affiché côté USER.",
    "pro.booking_settings.cancel.enable.title":
      "Activer une politique d’annulation personnalisée",
    "pro.booking_settings.cancel.enable.hint":
      "Si désactivé, la politique par défaut Sortir Au Maroc s’applique.",
    "pro.booking_settings.cancel.free_hours.label":
      "Délai d’annulation gratuite (heures avant)",
    "pro.booking_settings.cancel.penalty_percent.label":
      "Pénalité après la limite (%)",
    "pro.booking_settings.cancel.penalty_percent.example":
      "Ex : de la limite jusqu’à l’heure de la réservation : {percent}% de retenue.",
    "pro.booking_settings.cancel.no_show_penalty.label": "Pénalité no-show (%)",
    "pro.booking_settings.cancel.no_show_always_100.title":
      "Toujours 100% pour les no-show garantis",
    "pro.booking_settings.cancel.no_show_always_100.hint":
      "Optionnel, recommandé si prépaiement.",
    "pro.booking_settings.cancel.custom_text.title":
      "Texte personnalisé affiché au client",
    "pro.booking_settings.cancel.custom_text.placeholder.fr":
      "Texte FR affiché au client (page réservation + emails)",
    "pro.booking_settings.cancel.custom_text.placeholder.en":
      "Client-facing text (EN)",

    "pro.booking_settings.section.modif.title": "B — Politique de modification",
    "pro.booking_settings.section.modif.description":
      "Autorisation, délai et texte affiché au client.",
    "pro.booking_settings.modif.enable.title":
      "Autoriser les demandes de modification",
    "pro.booking_settings.modif.enable.hint":
      "Si désactivé, le bouton USER sera masqué.",
    "pro.booking_settings.modif.deadline_hours.label":
      "Dernier délai (heures avant la réservation)",
    "pro.booking_settings.modif.require_guarantee.label":
      "Imposer la garantie si score < … (optionnel)",
    "pro.booking_settings.modif.require_guarantee.placeholder": "Ex : 65",
    "pro.booking_settings.modif.require_guarantee.hint":
      "Laissez vide pour ne pas appliquer cette règle.",
    "pro.booking_settings.modif.custom_text.title":
      "Texte informatif affiché au client",
    "pro.booking_settings.modif.custom_text.placeholder.fr":
      "Texte FR affiché au client dans la modale de modification",
    "pro.booking_settings.modif.custom_text.placeholder.en":
      "Client-facing text (EN)",

    // Admin content
    "admin.content.title": "Contenu",
    "admin.content.description":
      "Gérez les pages éditoriales et la FAQ (FR/EN) sans toucher au code.",
    "admin.content.editor_language": "Langue d’édition",
    "admin.content.tab.pages": "Pages",
    "admin.content.tab.faq": "FAQ",

    "admin.content.action.new_page": "Nouvelle page",
    "admin.content.action.new_faq": "Nouvelle FAQ",
    "admin.content.action.preview": "Prévisualiser",
    "admin.content.action.back_to_edit": "Retour",
    "admin.content.action.save": "Enregistrer",

    "admin.content.warning": "Alerte",
    "admin.content.translation_missing": "Traduction manquante",
    "admin.content.translation_missing_hint":
      "Complétez la version FR/EN avant publication pour une expérience cohérente.",

    "admin.content.status.draft": "Brouillon",
    "admin.content.status.published": "Publié",

    "admin.content.pages.search": "Rechercher (slug, titre)…",
    "admin.content.pages.column.slug": "Slug",
    "admin.content.pages.column.title": "Titre",
    "admin.content.pages.column.status": "Statut",
    "admin.content.pages.column.updated": "MAJ",

    "admin.content.faq.search": "Rechercher (question, tags)…",
    "admin.content.faq.column.category": "Catégorie",
    "admin.content.faq.column.order": "Ordre",
    "admin.content.faq.column.question": "Question",
    "admin.content.faq.column.status": "Statut",
    "admin.content.faq.column.updated": "MAJ",

    "admin.content.dialog.page": "Page",
    "admin.content.dialog.faq": "FAQ",

    "admin.content.field.slug": "Slug",
    "admin.content.field.slug_placeholder": "ex: cgu, privacy, about",
    "admin.content.field.status": "Statut",
    "admin.content.field.title": "Titre",
    "admin.content.field.title_placeholder_fr": "Titre (FR)",
    "admin.content.field.title_placeholder_en": "Title (EN)",
    "admin.content.field.meta_title": "Meta title",
    "admin.content.field.meta_title_placeholder": "Titre SEO",
    "admin.content.field.meta_description": "Meta description",
    "admin.content.field.meta_description_placeholder":
      "Description SEO (≈ 160 caractères)",
    "admin.content.field.content": "Contenu",
    "admin.content.field.content_placeholder": "Écrivez ici…",

    "admin.content.language.fr": "Français",
    "admin.content.language.en": "English",

    "admin.content.preview.seo": "SEO (aperçu)",
    "admin.content.preview.public": "Rendu public",

    "admin.content.history.title": "Historique",
    "admin.content.history.empty": "Aucune modification enregistrée.",
    "admin.content.history.created": "Création",
    "admin.content.history.updated": "Modification",

    "admin.content.error.slug_required": "Le slug est obligatoire.",
    "admin.content.error.title_required":
      "Veuillez renseigner au moins un titre (FR ou EN).",
    "admin.content.error.question_required":
      "Veuillez renseigner au moins une question (FR ou EN).",

    "admin.content.faq.field.category": "Catégorie",
    "admin.content.faq.field.order": "Ordre d’affichage",
    "admin.content.faq.field.tags": "Tags",
    "admin.content.faq.field.tags_placeholder": "annulation, paiement, no-show",
    "admin.content.faq.field.question": "Question",
    "admin.content.faq.field.question_placeholder_fr": "Question (FR)",
    "admin.content.faq.field.question_placeholder_en": "Question (EN)",
    "admin.content.faq.field.answer": "Réponse",
    "admin.content.faq.field.answer_placeholder": "Votre réponse…",

    "admin.content.faq.category.reservations": "Réservations",
    "admin.content.faq.category.paiements": "Paiements",
    "admin.content.faq.category.annulations": "Annulations",
    "admin.content.faq.category.comptes_utilisateurs": "Comptes utilisateurs",
    "admin.content.faq.category.comptes_pro": "Comptes Pro",
    "admin.content.faq.category.packs_offres": "Packs & offres",
    "admin.content.faq.category.support_general": "Support général",

    // Admin rich text editor
    "admin.richtext.h2": "H2",
    "admin.richtext.h3": "H3",
    "admin.richtext.p": "Paragr.",
    "admin.richtext.bold": "Gras",
    "admin.richtext.italic": "Italique",
    "admin.richtext.underline": "Souligné",
    "admin.richtext.ul": "Liste",
    "admin.richtext.ol": "Num.",
    "admin.richtext.link": "Lien",
    "admin.richtext.link.dialog_title": "Ajouter un lien",
    "admin.richtext.link.hint":
      "Sélectionnez d'abord le texte, puis collez l'URL (ex: https://…, /faq, mailto:…).",
    "admin.richtext.link.placeholder": "https://example.com",
    "admin.richtext.link.insert": "Insérer",
    "admin.richtext.ai": "IA",

    // Report establishment
    "report.title": "Signaler cet établissement",
    "report.description": "Vous souhaitez signaler un problème avec {name} ?",
    "report.reason_label": "Raison du signalement",
    "report.reason_placeholder": "Sélectionnez une raison",
    "report.reason.closed_permanently": "Établissement fermé définitivement",
    "report.reason.incorrect_info": "Informations incorrectes",
    "report.reason.fraudulent": "Établissement frauduleux",
    "report.reason.inappropriate_content": "Contenu inapproprié",
    "report.reason.safety_concern": "Problème de sécurité",
    "report.reason.other": "Autre",
    "report.details_label": "Détails supplémentaires (optionnel)",
    "report.details_placeholder": "Décrivez le problème rencontré...",
    "report.submit": "Envoyer le signalement",
    "report.submitting": "Envoi en cours...",
    "report.error.select_reason": "Veuillez sélectionner une raison",
    "report.error.login_required": "Vous devez être connecté pour signaler",
    "report.error.generic": "Erreur lors de l'envoi du signalement",
    "report.success.title": "Signalement envoyé",
    "report.success.description": "Merci pour votre signalement. Notre équipe va l'examiner.",
    "report.button": "Signaler",
    "report.button_tooltip": "Signaler cet établissement",

    // Admin settings
    "admin.settings.title": "⚙️ Paramètres Superadmin",
    "admin.settings.description":
      "Centre de configuration global — répliqué en base Supabase",
    "admin.settings.logs": "Journaux",
    "admin.settings.loading.title": "Chargement",
    "admin.settings.loading.body": "Synchronisation en cours…",
    "admin.settings.sync_report.message":
      "Paramètres synchronisés avec Supabase.\nNouvelles règles actives : {created} — Règles modifiées : {modified} — Rien à faire : {noop}.",
    "admin.settings.permissions.title": "Permissions",
    "admin.settings.permissions.body":
      "Cette page est réservée au superadmin. En cas d’accès non autorisé, l’utilisateur est redirigé vers le tableau de bord.",
  },
  en: {
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
    "footer.link.careers": "Careers",

    "footer.link.for_restaurateurs": "For restaurants",
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

    "footer.copyright_suffix": ". All rights reserved.",

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

    // Search
    "search.field.city.placeholder": "City or area",
    "search.field.activity.placeholder": "Activity or place",
    "search.validation.minimum_people": "Minimum: {count} people",

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
    "vehicle.cashback": "Earn {amount} € cashback",
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
    "booking.steps.payment": "Payment",
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
    "booking.mode.non_guaranteed.more":
      "Without prepayment, your booking depends on availability and priority. You’ll receive confirmation quickly.",

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

    "booking.form.placeholder.first_name": "e.g. Marie",
    "booking.form.placeholder.last_name": "e.g. Dupont",
    "booking.form.placeholder.email": "e.g. marie@example.com",
    "booking.form.placeholder.phone": "e.g. +212 6 12 34 56 78",
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
      "The venue will confirm your booking by SMS or WhatsApp shortly.",

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
    "profile.info.first_name.placeholder": "e.g., Marie",
    "profile.info.last_name.label": "Last name",
    "profile.info.last_name.placeholder": "e.g., Dupont",
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
  },
};
