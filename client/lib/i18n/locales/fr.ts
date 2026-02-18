import type { TranslationKey } from "../translation-keys";

const fr: Record<TranslationKey, string> = {
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
    "header.add_establishment.short": "Ajouter mon établissement",
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
    "footer.link.videos": "Vidéos",
    "footer.link.careers": "Carrières",

    "footer.link.become_sponsor": "Devenir parrain",
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
    "footer.link.admin_aria": "Accéder à l'interface Admin",

    "footer.section.discover": "Découvrir",
    "footer.section.follow_us": "Suivez-nous",
    "footer.install_app": "Installer l'application",

    "footer.copyright_suffix": ". Tous droits réservés.",

    // PWA
    "pwa.update_available": "Nouvelle version disponible",
    "pwa.update_description": "Cliquez pour mettre à jour l'application.",
    "pwa.update_button": "Mettre à jour",
    "pwa.ios_guide_title": "Installer la webapp sam.ma",
    "pwa.ios_guide_subtitle": "Ajoutez l'app sur votre écran d'accueil pour un accès rapide.",
    "pwa.ios_step1_title": "Appuyez sur le bouton Partager",
    "pwa.ios_step1_desc": "En bas de Safari, appuyez sur l'icône de partage (carré avec une flèche vers le haut).",
    "pwa.ios_step2_title": "\"Sur l'écran d'accueil\"",
    "pwa.ios_step2_desc": "Faites défiler et appuyez sur \"Sur l'écran d'accueil\".",
    "pwa.ios_step3_title": "Appuyez sur Ajouter",
    "pwa.ios_step3_desc": "Confirmez en appuyant sur \"Ajouter\" en haut à droite. C'est fait !",
    "pwa.ios_guide_ok": "J'ai compris",

    // Push notifications
    "push.prompt_title": "Activer les notifications",
    "push.prompt_description": "Recevez vos confirmations de réservation et alertes liste d'attente en temps réel.",
    "push.prompt_enable": "Activer",
    "push.prompt_enabling": "Activation…",
    "push.prompt_later": "Plus tard",

    // Profile preferences
    "profile.prefs.section_communication": "Communication",
    "profile.prefs.newsletter_desc": "Recevoir les nouveautés, bons plans et sélections.",
    "profile.prefs.reminders": "Rappels de réservation",
    "profile.prefs.reminders_desc": "Recevoir un rappel avant vos sorties.",
    "profile.prefs.whatsapp_desc": "Autoriser les confirmations et messages via WhatsApp.",
    "profile.prefs.section_push": "Notifications push",
    "profile.prefs.push_blocked": "Les notifications sont bloquées dans les paramètres de votre navigateur. Pour les réactiver, modifiez les permissions du site dans votre navigateur.",
    "profile.prefs.push_enabled": "Notifications push",
    "profile.prefs.push_enabled_desc": "Recevoir des notifications sur cet appareil.",
    "profile.prefs.push_bookings": "Réservations",
    "profile.prefs.push_bookings_desc": "Confirmations, rappels et mises à jour de vos réservations.",
    "profile.prefs.push_waitlist": "Liste d'attente",
    "profile.prefs.push_waitlist_desc": "Alertes quand une place se libère.",
    "profile.prefs.push_marketing": "Bons plans & promotions",
    "profile.prefs.push_marketing_desc": "Offres spéciales et recommandations personnalisées.",

    // Newsletter
    "newsletter.title": "Newsletter",
    "newsletter.subtitle": "Recevez nos bons plans et nouveautés",
    "newsletter.placeholder": "Votre email",
    "newsletter.button": "OK",
    "newsletter.success": "Merci ! Vous êtes inscrit.",
    "newsletter.error.generic": "Une erreur est survenue. Réessayez.",
    "newsletter.error.invalid_email": "Adresse email invalide",

    // Videos page
    "videos.page.title": "Vidéos",
    "videos.page.subtitle": "Découvrez les meilleurs établissements du Maroc à travers nos vidéos exclusives.",
    "videos.page.empty_title": "Aucune vidéo disponible",
    "videos.page.empty_description": "Revenez bientôt pour découvrir nos nouvelles vidéos.",

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
    "home.universe.rentacar": "Se déplacer",

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
    "home.sections.open_now.title": "Ouvert maintenant",
    "home.sections.trending.title": "Tendance ce mois-ci",
    "home.sections.new.title": "Nouveautés",
    "home.sections.top_rated.title": "Les mieux notés",
    "home.sections.deals.title": "Bons plans du moment",
    "home.sections.themed.romantic": "Pour une soirée romantique",
    "home.sections.themed.brunch": "Envie d'un brunch ?",
    "home.sections.themed.lunch": "Pour votre pause déjeuner",
    "home.sections.themed.ramadan": "Sélection Ftour & Shour",
    "home.sections.ramadan.title": "Spécial Ramadan",
    "home.sections.ramadan.subtitle": "Découvrez les meilleures formules Ftour",

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

    // Homepage sections
    "home.search.placeholder.restaurants": "Cuisine, restaurant, plat...",
    "home.search.placeholder.restaurants_detailed": "Cuisine, nom de restaurant, plat...",
    "home.search.placeholder.accommodation": "Hôtel, type, équipement...",
    "home.search.placeholder.accommodation_detailed": "Nom d'hôtel, type, équipement...",
    "home.search.placeholder.activities": "Activité, lieu...",
    "home.search.placeholder.activities_detailed": "Activité, lieu, type...",
    "home.cities.title": "Autres villes au Maroc",
    "home.cities.see_more": "Voir plus",
    "home.videos.title": "Vidéos",
    "home.videos.book": "Réserver",
    "home.videos.close": "Fermer",
    "home.videos.fullscreen": "Plein écran",
    "home.blog.title": "Blog",
    "home.blog.read": "Lire",
    "home.blog.see_more": "Voir plus",
    "home.sponsored": "Sponsorisé",
    "home.how_it_works.default.exclusive_offers.title": "Offres exclusives",
    "home.how_it_works.default.exclusive_offers.description": "Profitez de réductions et avantages uniques chez nos établissements partenaires au Maroc.",
    "home.how_it_works.default.best_choice.title": "Le meilleur choix",
    "home.how_it_works.default.best_choice.description": "Une sélection rigoureuse d'établissements pour toutes vos envies : restaurants, loisirs, bien-être...",
    "home.how_it_works.default.verified_reviews.title": "Avis vérifiés",
    "home.how_it_works.default.verified_reviews.description": "Des recommandations authentiques de notre communauté pour vous guider dans vos choix.",
    "home.how_it_works.default.easy_booking.title": "Réservation facile",
    "home.how_it_works.default.easy_booking.description": "Réservez instantanément, gratuitement, partout et à tout moment. 24h/24, 7j/7.",

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
    "results.filter.open_now": "Ouvert maintenant",
    "results.filter.instant_booking": "Réservation instantanée",
    "results.filter.terrace": "Terrasse",
    "results.filter.parking": "Parking",
    "results.filter.kid_friendly": "Adapté enfants",
    "results.filter.wifi": "Wi-Fi",
    "results.filter.budget": "Budget",
    "results.filter.price_1": "€",
    "results.filter.price_2": "€€",
    "results.filter.price_3": "€€€",
    "results.filter.price_4": "€€€€",
    "results.filter.no_results_filters": "Aucun résultat avec ces filtres",
    "results.filter.reset_filters": "Réinitialiser les filtres",

    // Prompt 12 — Personalization
    "search.personalized": "Résultats adaptés à vos préférences",
    "search.personalized.tooltip": "Basé sur vos réservations et recherches passées",
    "search.personalized.disable": "Désactiver la personnalisation",
    "search.personalized.enable": "Activer la personnalisation",
    "settings.personalization": "Personnalisation des résultats",
    "settings.personalization.description": "Adapter l'ordre des résultats en fonction de vos goûts",

    // Search fallback (Prompt 13)
    "search.no_results": "Aucun résultat pour « {query} »",
    "search.did_you_mean": "Vouliez-vous dire ?",
    "search.did_you_mean.results": "{count} résultats",
    "search.similar_results": "Résultats similaires",
    "search.relax_filters": "Essayez avec moins de filtres",
    "search.relax_filters.without": "Sans {filter}",
    "search.reset_all_filters": "Réinitialiser tous les filtres",
    "search.nearby": "Disponible à proximité",
    "search.nearby.distance": "à {km} km",
    "search.nearby.see_results": "Voir {count} résultats à {city}",
    "search.popular_fallback": "Les plus populaires",
    "search.also_like": "Vous aimerez aussi",

    // Search
    "search.field.city.placeholder": "Ville ou quartier",
    "search.field.activity.placeholder": "Activité ou établissement",
    "search.validation.minimum_people": "Minimum : {count} personnes",

    "search.placeholder.unified": "Cuisine, nom de lieu, plat...",
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
    "vehicle.cashback": "Gagnez {amount} MAD en cashback",
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

    // Rental module
    "rental.title": "Location de véhicules",
    "rental.search.title": "Trouvez votre véhicule",
    "rental.search.pickup_city": "Ville de prise en charge",
    "rental.search.dropoff_city": "Ville de restitution",
    "rental.search.pickup_date": "Date de prise en charge",
    "rental.search.dropoff_date": "Date de restitution",
    "rental.search.pickup_time": "Heure de prise en charge",
    "rental.search.dropoff_time": "Heure de restitution",
    "rental.search.vehicle_type": "Type de véhicule",
    "rental.search.no_results": "Aucun véhicule disponible pour ces critères",
    "rental.category.economy": "Économique",
    "rental.category.compact": "Compacte",
    "rental.category.midsize": "Intermédiaire",
    "rental.category.fullsize": "Berline",
    "rental.category.suv": "SUV",
    "rental.category.luxury": "Luxe",
    "rental.category.van": "Utilitaire",
    "rental.category.convertible": "Cabriolet",
    "rental.booking.step1": "Options",
    "rental.booking.step2": "Assurance",
    "rental.booking.step3": "Caution",
    "rental.booking.step4": "Pièces d'identité",
    "rental.booking.step5": "Paiement",
    "rental.booking.confirm_title": "Réservation confirmée !",
    "rental.booking.reference": "Référence de réservation",
    "rental.booking.next_steps": "Prochaines étapes",
    "rental.insurance.essential": "Essentielle",
    "rental.insurance.comfort": "Confort",
    "rental.insurance.serenity": "Sérénité",
    "rental.insurance.recommended": "Recommandé",
    "rental.insurance.franchise": "Franchise",
    "rental.insurance.per_day": "/jour",
    "rental.kyc.title": "Vérification d'identité",
    "rental.kyc.permit_front": "Permis de conduire (recto)",
    "rental.kyc.permit_back": "Permis de conduire (verso)",
    "rental.kyc.cin_front": "CIN (recto)",
    "rental.kyc.cin_back": "CIN (verso)",
    "rental.kyc.passport_front": "Passeport (page photo)",
    "rental.kyc.status.pending": "En attente de validation",
    "rental.kyc.status.validated": "Validé",
    "rental.kyc.status.refused": "Refusé",
    "rental.deposit.title": "Caution",
    "rental.deposit.description": "Un dépôt de garantie sera retenu lors de la prise en charge du véhicule",
    "rental.deposit.released": "Libérée à la restitution si aucun dommage",
    "rental.price.per_day": "MAD/jour",
    "rental.price.total": "Total",
    "rental.price.base": "Tarif de base",
    "rental.price.options": "Options",
    "rental.price.insurance": "Assurance",
    "rental.price.deposit": "Caution",
    "rental.status.pending_kyc": "En attente KYC",
    "rental.status.confirmed": "Confirmée",
    "rental.status.in_progress": "En cours",
    "rental.status.completed": "Terminée",
    "rental.status.cancelled": "Annulée",
    "rental.status.disputed": "Litige",
    "rental.mileage.unlimited": "Kilométrage illimité",
    "rental.mileage.limited": "Kilométrage limité",
    "rental.specs.seats": "{count} places",
    "rental.specs.doors": "{count} portes",
    "rental.specs.transmission.auto": "Automatique",
    "rental.specs.transmission.manual": "Manuelle",
    "rental.specs.ac": "Climatisation",
    "rental.specs.fuel.gasoline": "Essence",
    "rental.specs.fuel.diesel": "Diesel",
    "rental.specs.fuel.electric": "Électrique",
    "rental.specs.fuel.hybrid": "Hybride",
    "rental.pro.vehicles": "Véhicules",
    "rental.pro.reservations": "Réservations",
    "rental.pro.options": "Options",
    "rental.pro.stats": "Statistiques",
    "rental.pro.add_vehicle": "Ajouter un véhicule",
    "rental.pro.edit_vehicle": "Modifier le véhicule",
    "rental.pro.validate_kyc": "Valider KYC",
    "rental.pro.generate_contract": "Générer le contrat",
    "rental.admin.insurance_plans": "Plans d'assurance",
    "rental.admin.moderation": "Modération véhicules",
    "rental.admin.stats": "Statistiques",

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
    "booking.step1.more_dates": "+ de dates",

    "booking.choose_slot": "Choisissez un créneau",
    "booking.reservations_today": "Déjà {count} réservations pour aujourd'hui",

    "booking.waitlist": "Liste d'attente",
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
    "booking.mode.non_guaranteed.line_simple":
      "Votre réservation sera confirmée par le restaurant.",
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

    "booking.form.placeholder.first_name": "Ex: Amina",
    "booking.form.placeholder.last_name": "Ex: Benali",
    "booking.form.placeholder.email": "Ex: amina@example.com",
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

    "profile.tabs.info": "Mes informations",
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

    // Password management
    "profile.password.title": "Mot de passe",
    "profile.password.description": "Gérez la sécurité de votre compte.",
    "profile.password.reset.title": "Régénérer mon mot de passe",
    "profile.password.reset.description": "Un lien de réinitialisation vous sera envoyé par email.",
    "profile.password.reset.button": "Envoyer par email",
    "profile.password.reset.button.loading": "Envoi…",
    "profile.password.reset.toast.title": "Email envoyé",
    "profile.password.reset.toast.description": "Vérifiez votre boîte de réception pour le lien de réinitialisation.",
    "profile.password.reset.error.phone_only.title": "Réinitialisation non disponible",
    "profile.password.reset.error.phone_only.description": "Vous vous êtes inscrit avec votre téléphone. Veuillez utiliser l'option \"Changer mon mot de passe\" à la place.",
    "profile.password.change.title": "Changer mon mot de passe",
    "profile.password.change.description": "Modifiez votre mot de passe actuel.",
    "profile.password.change.button": "Modifier",
    "profile.password.change.button.loading": "Modification…",
    "profile.password.change.button.confirm": "Confirmer",
    "profile.password.change.dialog.title": "Changer le mot de passe",
    "profile.password.change.dialog.description": "Entrez votre mot de passe actuel puis choisissez un nouveau mot de passe.",
    "profile.password.change.current": "Mot de passe actuel",
    "profile.password.change.new": "Nouveau mot de passe",
    "profile.password.change.confirm": "Confirmer le nouveau mot de passe",
    "profile.password.change.hint": "Minimum 8 caractères",
    "profile.password.change.toast.title": "Mot de passe modifié",
    "profile.password.change.toast.description": "Votre mot de passe a été mis à jour avec succès.",
    "profile.password.change.error.too_short": "Le mot de passe doit contenir au moins 8 caractères.",
    "profile.password.change.error.mismatch": "Les mots de passe ne correspondent pas.",
    "profile.password.change.error.invalid_current": "Le mot de passe actuel est incorrect.",

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
    "profile.info.first_name.placeholder": "Ex : Amina",
    "profile.info.last_name.label": "Nom",
    "profile.info.last_name.placeholder": "Ex : Benali",
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
    "profile.info.email.label": "Email",
    "profile.info.login_credentials": "Identifiants de connexion",
    "profile.info.phone.login_label": "Téléphone de connexion",

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

    // Reset password page
    "reset_password.title": "Nouveau mot de passe",
    "reset_password.for_account": "Pour le compte {email}",
    "reset_password.validating": "Vérification du lien...",
    "reset_password.new_password": "Nouveau mot de passe",
    "reset_password.confirm_password": "Confirmer le mot de passe",
    "reset_password.password_hint": "Minimum 8 caractères",
    "reset_password.submit": "Définir le mot de passe",
    "reset_password.submitting": "Enregistrement...",
    "reset_password.back_home": "Retour à l'accueil",
    "reset_password.error.title": "Lien invalide",
    "reset_password.error.missing_token": "Le lien est incomplet. Veuillez utiliser le lien complet reçu par email.",
    "reset_password.error.invalid_token": "Ce lien de réinitialisation n'est pas valide.",
    "reset_password.error.token_expired": "Ce lien a expiré. Demandez un nouveau lien de réinitialisation.",
    "reset_password.error.token_used": "Ce lien a déjà été utilisé. Demandez un nouveau lien si nécessaire.",
    "reset_password.error.too_short": "Le mot de passe doit contenir au moins 8 caractères.",
    "reset_password.error.mismatch": "Les mots de passe ne correspondent pas.",
    "reset_password.error.generic": "Une erreur est survenue. Veuillez réessayer.",
    "reset_password.success.title": "Mot de passe modifié",
    "reset_password.success.description": "Votre mot de passe a été modifié avec succès. Vous pouvez maintenant vous connecter.",
    "reset_password.success.login": "Se connecter",

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
    "establishment.tabs.vehicles": "Véhicules",

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
  };

export default fr;
