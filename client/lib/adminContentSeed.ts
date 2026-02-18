import {
  createAdminContentPage,
  listAdminContentPages,
  replaceAdminContentPageBlocks,
  updateAdminContentPage,
  type CmsBlockInput,
  type ContentPageAdmin,
} from "@/lib/adminApi";
import { sanitizeRichTextHtml } from "@/lib/richText";

export type SeedResult = { createdPages: number; updatedPages: number };

type SeedPage = {
  page_key: string;
  /**
   * Optional previous keys used in older seed versions.
   * If found, the record will be updated and migrated to `page_key`.
   */
  legacy_page_keys?: string[];
  slug_fr: string;
  slug_en: string;
  status: "draft" | "published";

  title_fr: string;
  title_en: string;
  page_subtitle_fr: string;
  page_subtitle_en: string;

  seo_title_fr: string;
  seo_title_en: string;
  seo_description_fr: string;
  seo_description_en: string;

  og_title_fr: string;
  og_title_en: string;
  og_description_fr: string;
  og_description_en: string;
  og_image_url: string | null;

  canonical_url_fr: string;
  canonical_url_en: string;
  robots: string;

  show_toc: boolean;
  related_links: unknown;

  schema_jsonld_fr: unknown;
  schema_jsonld_en: unknown;

  blocks: CmsBlockInput[];
};

function baseRobots(): string {
  return "index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1";
}

function pageSchema(args: { name: string; url: string; inLanguage: string }) {
  return {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: args.name,
    url: args.url,
    inLanguage: args.inLanguage,
    isPartOf: {
      "@type": "WebSite",
      name: "Sortir Au Maroc",
      url: "https://sam.ma/",
    },
  };
}

function b(
  type: string,
  args?: {
    is_enabled?: boolean;
    data?: unknown;
    data_fr?: unknown;
    data_en?: unknown;
  },
): CmsBlockInput {
  return {
    type,
    is_enabled: args?.is_enabled ?? true,
    data: args?.data ?? {},
    data_fr: args?.data_fr ?? {},
    data_en: args?.data_en ?? {},
  };
}

function heading(args: { level?: 2 | 3; anchor: string; fr: string; en: string }): CmsBlockInput {
  return b("heading", {
    data: { level: args.level ?? 2, anchor: args.anchor },
    data_fr: { text: args.fr },
    data_en: { text: args.en },
  });
}

function paragraph(args: { fr: string; en: string }): CmsBlockInput {
  return b("paragraph", {
    data_fr: { text: args.fr },
    data_en: { text: args.en },
  });
}

function bullets(args: { fr: string[]; en: string[] }): CmsBlockInput {
  return b("bullets", {
    data_fr: { items: args.fr },
    data_en: { items: args.en },
  });
}

function numbered(args: { fr: string[]; en: string[] }): CmsBlockInput {
  return b("numbered", {
    data_fr: { items: args.fr },
    data_en: { items: args.en },
  });
}

function callout(args: { variant: "info" | "warning" | "success" | "notice"; title_fr: string; title_en: string; text_fr: string; text_en: string }):
  CmsBlockInput {
  return b("callout", {
    data: { variant: args.variant },
    data_fr: { title: args.title_fr, text: args.text_fr },
    data_en: { title: args.title_en, text: args.text_en },
  });
}

function toc(args?: { title_fr?: string; title_en?: string; sticky?: boolean }): CmsBlockInput {
  return b("toc", {
    data: { sticky: args?.sticky ?? true },
    data_fr: { title: args?.title_fr ?? "Sommaire" },
    data_en: { title: args?.title_en ?? "Table of contents" },
  });
}

function divider(): CmsBlockInput {
  return b("divider");
}

function helpCallout(): CmsBlockInput {
  return callout({
    variant: "notice",
    title_fr: "Besoin d’aide ?",
    title_en: "Need help?",
    text_fr:
      "Pour toute question, réclamation ou demande liée à une réservation, contactez-nous via la page Contact. Nous vous répondrons dans les meilleurs délais.",
    text_en:
      "For any question, complaint, or booking-related request, please contact us via the Contact page. We will respond as soon as possible.",
  });
}

const SEED_PAGES: readonly SeedPage[] = [
  // ---------------------------------------------------------------------------
  // INFORMATION
  // ---------------------------------------------------------------------------
  {
    page_key: "discover",
    slug_fr: "decouvrir",
    slug_en: "discover",
    status: "published",
    title_fr: "Découvrir",
    title_en: "Discover",
    page_subtitle_fr: "Sortir Au Maroc vous aide à trouver et réserver des sorties au Maroc, en toute simplicité.",
    page_subtitle_en: "Sortir Au Maroc helps you find and book experiences in Morocco — simply and reliably.",
    seo_title_fr: "Découvrir Sortir Au Maroc",
    seo_title_en: "Discover Sortir Au Maroc",
    seo_description_fr:
      "Découvrez comment Sortir Au Maroc facilite la réservation de restaurants, loisirs, spas, hôtels et expériences au Maroc.",
    seo_description_en:
      "Discover how Sortir Au Maroc makes it easy to book restaurants, leisure activities, spas, hotels and experiences in Morocco.",
    og_title_fr: "Découvrir Sortir Au Maroc",
    og_title_en: "Discover Sortir Au Maroc",
    og_description_fr:
      "Une plateforme simple et fiable pour réserver vos meilleures sorties au Maroc.",
    og_description_en:
      "A simple, reliable platform to book the best experiences in Morocco.",
    og_image_url: null,
    canonical_url_fr: "https://sam.ma/content/decouvrir",
    canonical_url_en: "https://sam.ma/en/content/discover",
    robots: baseRobots(),
    show_toc: false,
    related_links: [
      {
        href_fr: "/content/contact",
        href_en: "/content/contact",
        label_fr: "Contact",
        label_en: "Contact",
      },
    ],
    schema_jsonld_fr: pageSchema({ name: "Découvrir Sortir Au Maroc", url: "https://sam.ma/content/decouvrir", inLanguage: "fr-MA" }),
    schema_jsonld_en: pageSchema({ name: "Discover Sortir Au Maroc", url: "https://sam.ma/en/content/discover", inLanguage: "en" }),
    blocks: [
      heading({ anchor: "what", fr: "Qu’est-ce que Sortir Au Maroc ?", en: "What is Sortir Au Maroc?" }),
      paragraph({
        fr: "Sortir Au Maroc est une plateforme qui facilite la mise en relation entre les utilisateurs et les établissements (restaurants, loisirs, spas, hôtels, culture…). Elle permet de rechercher une expérience et de demander une réservation selon les disponibilités et les règles de l’établissement.",
        en: "Sortir Au Maroc is a platform that connects guests and venues (restaurants, leisure activities, spas, hotels, culture…). It lets you search for an experience and submit a booking request based on venue availability and rules.",
      }),
      heading({ anchor: "how", fr: "Comment ça marche", en: "How it works" }),
      numbered({
        fr: [
          "Recherchez un établissement ou une expérience.",
          "Choisissez une date, une heure et le nombre de personnes.",
          "Soumettez votre demande et recevez les confirmations et notifications.",
        ],
        en: [
          "Search for a venue or experience.",
          "Select a date, time and number of guests.",
          "Submit your request and receive confirmations and notifications.",
        ],
      }),
      callout({
        variant: "info",
        title_fr: "Important",
        title_en: "Important",
        text_fr:
          "Sortir Au Maroc agit comme intermédiaire technique. La prestation est réalisée par l’établissement. Les conditions spécifiques (annulation, no-show, dépôts…) sont affichées avant validation.",
        text_en:
          "Sortir Au Maroc acts as a technical intermediary. The service is delivered by the venue. Specific conditions (cancellation, no-show, deposits…) are displayed before confirmation.",
      }),
    ],
  },
  {
    page_key: "about",
    slug_fr: "a-propos",
    slug_en: "about",
    status: "published",
    title_fr: "À propos",
    title_en: "About",
    page_subtitle_fr: "Notre mission : rendre la réservation de sorties plus simple et plus fiable.",
    page_subtitle_en: "Our mission: make booking experiences simpler and more reliable.",
    seo_title_fr: "À propos de Sortir Au Maroc",
    seo_title_en: "About Sortir Au Maroc",
    seo_description_fr: "Découvrez la vision de Sortir Au Maroc et notre engagement pour des réservations plus fiables.",
    seo_description_en: "Learn about Sortir Au Maroc’s vision and our commitment to more reliable bookings.",
    og_title_fr: "À propos de Sortir Au Maroc",
    og_title_en: "About Sortir Au Maroc",
    og_description_fr: "Une plateforme internationale pensée pour simplifier les réservations au Maroc.",
    og_description_en: "An international platform designed to simplify bookings in Morocco.",
    og_image_url: null,
    canonical_url_fr: "https://sam.ma/content/a-propos",
    canonical_url_en: "https://sam.ma/en/content/about",
    robots: baseRobots(),
    show_toc: false,
    related_links: [
      {
        href_fr: "/content/decouvrir",
        href_en: "/content/discover",
        label_fr: "Découvrir",
        label_en: "Discover",
      },
      {
        href_fr: "/content/contact",
        href_en: "/content/contact",
        label_fr: "Contact",
        label_en: "Contact",
      },
    ],
    schema_jsonld_fr: pageSchema({ name: "À propos", url: "https://sam.ma/content/a-propos", inLanguage: "fr-MA" }),
    schema_jsonld_en: pageSchema({ name: "About", url: "https://sam.ma/en/content/about", inLanguage: "en" }),
    blocks: [
      heading({ anchor: "mission", fr: "Notre mission", en: "Our mission" }),
      paragraph({
        fr: "Sortir Au Maroc a été conçu pour améliorer la fiabilité des sorties réservées (moins d’incertitudes, plus de confirmations) et faciliter la vie des établissements.",
        en: "Sortir Au Maroc is designed to improve booking reliability (less uncertainty, more confirmations) while making venue operations easier.",
      }),
      heading({ anchor: "principles", fr: "Nos principes", en: "Our principles" }),
      bullets({
        fr: [
          "Clarté : les règles de réservation sont affichées avant validation.",
          "Fiabilité : confirmations, rappels et suivi des demandes.",
          "Neutralité : Sortir Au Maroc reste un intermédiaire technique entre l’utilisateur et l’établissement.",
        ],
        en: [
          "Clarity: booking rules are displayed before confirmation.",
          "Reliability: confirmations, reminders and request tracking.",
          "Neutrality: Sortir Au Maroc remains a technical intermediary between guests and venues.",
        ],
      }),
    ],
  },
  {
    page_key: "contact",
    slug_fr: "contact",
    slug_en: "contact",
    status: "published",
    title_fr: "Contact",
    title_en: "Contact",
    page_subtitle_fr: "Support, questions et réclamations : nous sommes là pour vous aider.",
    page_subtitle_en: "Support, questions and complaints: we’re here to help.",
    seo_title_fr: "Contact — Sortir Au Maroc",
    seo_title_en: "Contact — Sortir Au Maroc",
    seo_description_fr: "Contactez Sortir Au Maroc pour une question, une réclamation ou une assistance liée à une réservation.",
    seo_description_en: "Contact Sortir Au Maroc for questions, complaints or booking-related assistance.",
    og_title_fr: "Contact — Sortir Au Maroc",
    og_title_en: "Contact — Sortir Au Maroc",
    og_description_fr: "Support, questions et réclamations.",
    og_description_en: "Support, questions and complaints.",
    og_image_url: null,
    canonical_url_fr: "https://sam.ma/content/contact",
    canonical_url_en: "https://sam.ma/en/content/contact",
    robots: baseRobots(),
    show_toc: false,
    related_links: [],
    schema_jsonld_fr: pageSchema({ name: "Contact", url: "https://sam.ma/content/contact", inLanguage: "fr-MA" }),
    schema_jsonld_en: pageSchema({ name: "Contact", url: "https://sam.ma/en/content/contact", inLanguage: "en" }),
    blocks: [
      heading({ anchor: "support", fr: "Support Sortir Au Maroc", en: "Sortir Au Maroc support" }),
      paragraph({
        fr: "Avant de nous écrire, consultez la FAQ. Si votre demande concerne une réservation, précisez l’établissement, la date, et tout élément utile.",
        en: "Before contacting us, please check the FAQ. If your request is about a booking, include the venue, date, and any helpful details.",
      }),
      bullets({
        fr: [
          "Email support : support@sortiraumaroc.ma",
          "Délai cible : réponse sous 48h ouvrées",
          "En cas d’urgence liée à une réservation imminente : mentionnez URGENT dans l’objet",
        ],
        en: [
          "Support email: support@sortiraumaroc.ma",
          "Target response time: within 2 business days",
          "For urgent issues about an imminent booking: include URGENT in the subject",
        ],
      }),
      callout({
        variant: "warning",
        title_fr: "Protection contre les fraudes",
        title_en: "Fraud protection",
        text_fr:
          "Pour votre sécurité, nous ne vous demanderons jamais votre mot de passe. En cas de doute, n’envoyez pas d’informations sensibles par email.",
        text_en:
          "For your safety, we will never ask for your password. If in doubt, do not send sensitive information by email.",
      }),
    ],
  },
  {
    page_key: "blog",
    slug_fr: "blog",
    slug_en: "blog",
    status: "published",
    title_fr: "Blog",
    title_en: "Blog",
    page_subtitle_fr: "Actualités, guides et conseils pour vos sorties au Maroc.",
    page_subtitle_en: "News, guides and tips for experiences in Morocco.",
    seo_title_fr: "Blog — Sortir Au Maroc",
    seo_title_en: "Blog — Sortir Au Maroc",
    seo_description_fr: "Guides de villes, sélections et conseils pratiques.",
    seo_description_en: "City guides, curated selections and practical tips.",
    og_title_fr: "Blog — Sortir Au Maroc",
    og_title_en: "Blog — Sortir Au Maroc",
    og_description_fr: "Guides et conseils pour réserver vos meilleures sorties.",
    og_description_en: "Guides and tips to book your best experiences.",
    og_image_url: null,
    canonical_url_fr: "https://sam.ma/content/blog",
    canonical_url_en: "https://sam.ma/en/content/blog",
    robots: baseRobots(),
    show_toc: false,
    related_links: [
      {
        href_fr: "/blog",
        href_en: "/blog",
        label_fr: "Voir les articles",
        label_en: "View articles",
      },
    ],
    schema_jsonld_fr: pageSchema({ name: "Blog", url: "https://sam.ma/content/blog", inLanguage: "fr-MA" }),
    schema_jsonld_en: pageSchema({ name: "Blog", url: "https://sam.ma/en/content/blog", inLanguage: "en" }),
    blocks: [
      heading({ anchor: "coming", fr: "Le blog arrive", en: "The blog is coming" }),
      paragraph({
        fr: "Cette page est une introduction éditoriale. Les articles sont publiés dans la section Blog.",
        en: "This page is an editorial introduction. Articles are published in the Blog section.",
      }),
      divider(),
      paragraph({
        fr: "Vous pouvez y trouver : des guides de villes, des idées de sorties et des conseils pour organiser vos réservations.",
        en: "You’ll find city guides, curated selections and tips to plan your bookings.",
      }),
    ],
  },
  {
    page_key: "careers",
    slug_fr: "carrieres",
    slug_en: "careers",
    status: "published",
    title_fr: "Carrières",
    title_en: "Careers",
    page_subtitle_fr: "Rejoignez une équipe qui construit une plateforme internationale.",
    page_subtitle_en: "Join a team building an international platform.",
    seo_title_fr: "Carrières — Sortir Au Maroc",
    seo_title_en: "Careers — Sortir Au Maroc",
    seo_description_fr: "Découvrez nos opportunités et la culture Sortir Au Maroc.",
    seo_description_en: "Explore opportunities and Sortir Au Maroc’s culture.",
    og_title_fr: "Carrières — Sortir Au Maroc",
    og_title_en: "Careers — Sortir Au Maroc",
    og_description_fr: "Construisons ensemble une expérience de réservation fiable.",
    og_description_en: "Let’s build a reliable booking experience together.",
    og_image_url: null,
    canonical_url_fr: "https://sam.ma/content/carrieres",
    canonical_url_en: "https://sam.ma/en/content/careers",
    robots: baseRobots(),
    show_toc: false,
    related_links: [
      {
        href_fr: "/content/contact",
        href_en: "/content/contact",
        label_fr: "Nous contacter",
        label_en: "Contact us",
      },
    ],
    schema_jsonld_fr: pageSchema({ name: "Carrières", url: "https://sam.ma/content/carrieres", inLanguage: "fr-MA" }),
    schema_jsonld_en: pageSchema({ name: "Careers", url: "https://sam.ma/en/content/careers", inLanguage: "en" }),
    blocks: [
      heading({ anchor: "join", fr: "Rejoindre Sortir Au Maroc", en: "Join Sortir Au Maroc" }),
      paragraph({
        fr: "Les opportunités sont publiées ici. Si vous souhaitez proposer une candidature spontanée, contactez-nous.",
        en: "Open positions are published here. For spontaneous applications, please contact us.",
      }),
      bullets({
        fr: ["Produit & design", "Ingénierie", "Opérations & partenariats"],
        en: ["Product & design", "Engineering", "Operations & partnerships"],
      }),
    ],
  },

  // ---------------------------------------------------------------------------
  // LEGAL
  // ---------------------------------------------------------------------------
  {
    page_key: "terms-of-use",
    legacy_page_keys: ["terms"],
    slug_fr: "conditions-utilisation",
    slug_en: "terms-of-use",
    status: "published",
    title_fr: "Conditions d’utilisation",
    title_en: "Terms of Use",
    page_subtitle_fr: "Conditions générales d’utilisation du Service Sortir Au Maroc.",
    page_subtitle_en: "General terms governing the use of the Sortir Au Maroc Service.",
    seo_title_fr: "Conditions d’utilisation — Sortir Au Maroc",
    seo_title_en: "Terms of Use — Sortir Au Maroc",
    seo_description_fr:
      "Conditions d’utilisation du Service Sortir Au Maroc : réservations, annulations, no-show, responsabilités, propriété intellectuelle.",
    seo_description_en:
      "Sortir Au Maroc Terms of Use: bookings, cancellations, no-show, liability, intellectual property.",
    og_title_fr: "Conditions d’utilisation — Sortir Au Maroc",
    og_title_en: "Terms of Use — Sortir Au Maroc",
    og_description_fr: "Cadre juridique d’utilisation de la plateforme Sortir Au Maroc.",
    og_description_en: "Legal framework for using the Sortir Au Maroc platform.",
    og_image_url: null,
    canonical_url_fr: "https://sam.ma/content/conditions-utilisation",
    canonical_url_en: "https://sam.ma/en/content/terms-of-use",
    robots: baseRobots(),
    show_toc: true,
    related_links: [
      {
        href_fr: "/content/politique-confidentialite",
        href_en: "/content/privacy-policy",
        label_fr: "Politique de confidentialité",
        label_en: "Privacy Policy",
      },
      {
        href_fr: "/content/politique-anti-no-show",
        href_en: "/content/anti-no-show-policy",
        label_fr: "Politique anti no-show",
        label_en: "Anti no-show policy",
      },
      {
        href_fr: "/content/contact",
        href_en: "/content/contact",
        label_fr: "Contact",
        label_en: "Contact",
      },
    ],
    schema_jsonld_fr: pageSchema({
      name: "Conditions d’utilisation — Sortir Au Maroc",
      url: "https://sam.ma/content/conditions-utilisation",
      inLanguage: "fr-MA",
    }),
    schema_jsonld_en: pageSchema({
      name: "Terms of Use — Sortir Au Maroc",
      url: "https://sam.ma/en/content/terms-of-use",
      inLanguage: "en",
    }),
    blocks: [
      toc(),
      callout({
        variant: "notice",
        title_fr: "Points clés",
        title_en: "Key points",
        text_fr:
          "• Sortir Au Maroc est un intermédiaire technique : la prestation est réalisée par l’Établissement.\n• Les règles (annulation, garanties / acomptes, no‑show) sont affichées avant validation.\n• En cas de question ou de litige, contactez-nous via la page Contact et privilégiez une solution amiable.",
        text_en:
          "• Sortir Au Maroc is a technical intermediary: the service is delivered by the Venue.\n• Rules (cancellation, guarantees / deposits, no‑show) are displayed before confirmation.\n• For questions or disputes, contact us via the Contact page and seek an amicable solution first.",
      }),
      heading({ anchor: "definitions", fr: "1. Définitions", en: "1. Definitions" }),
      bullets({
        fr: [
          "Service : la plateforme Sortir Au Maroc, accessible via site ou application.",
          "Utilisateur : toute personne utilisant le Service à titre personnel.",
          "Établissement : tout professionnel référencé proposant des prestations (restaurant, loisirs, spa, hôtel, etc.).",
          "Réservation : demande ou confirmation portant sur un créneau, un nombre de personnes et des conditions affichées.",
          "No-show : absence de l’Utilisateur à la Réservation sans annulation valable selon les règles applicables.",
        ],
        en: [
          "Service: the Sortir Au Maroc platform, available via website or application.",
          "User: any person using the Service for personal purposes.",
          "Venue: any professional listed on the Service offering experiences (restaurant, leisure, spa, hotel, etc.).",
          "Booking: a request or confirmation for a timeslot, party size and displayed conditions.",
          "No-show: the User’s absence without a valid cancellation under applicable rules.",
        ],
      }),
      heading({ anchor: "purpose", fr: "2. Objet du Service", en: "2. Purpose of the Service" }),
      paragraph({
        fr: "Le Service a pour objet de permettre aux Utilisateurs de rechercher des Établissements et de transmettre des demandes de Réservation. Les prestations sont réalisées par les Établissements. Sortir Au Maroc ne fournit pas la prestation sur place.",
        en: "The Service enables Users to discover Venues and submit Booking requests. Services are delivered by Venues. Sortir Au Maroc does not provide the on-site service.",
      }),
      heading({ anchor: "intermediary", fr: "3. Rôle de Sortir Au Maroc (intermédiaire technique)", en: "3. Sortir Au Maroc’s role (technical intermediary)" }),
      paragraph({
        fr: "Sortir Au Maroc agit comme intermédiaire technique : (i) publication d’informations, (ii) transmission de demandes, (iii) notifications et suivi. Sauf indication contraire, Sortir Au Maroc n’est ni vendeur de la prestation, ni organisateur, ni partie au contrat de prestation conclu entre l’Utilisateur et l’Établissement.",
        en: "Sortir Au Maroc acts as a technical intermediary: (i) information display, (ii) request transmission, (iii) notifications and tracking. Unless stated otherwise, Sortir Au Maroc is neither the seller of the service nor a party to the service contract between the User and the Venue.",
      }),
      callout({
        variant: "info",
        title_fr: "Neutralité",
        title_en: "Neutrality",
        text_fr:
          "Les conditions propres à l’Établissement (annulation, garanties, dépôts, no-show) peuvent s’appliquer en plus des présentes Conditions. Elles sont affichées avant validation.",
        text_en:
          "Venue-specific conditions (cancellation, guarantees, deposits, no-show) may apply in addition to these Terms. They are displayed before confirmation.",
      }),
      heading({ anchor: "account", fr: "4. Accès au Service et création de compte", en: "4. Access and account creation" }),
      paragraph({
        fr: "L’accès à certaines fonctionnalités peut nécessiter la création d’un compte. L’Utilisateur s’engage à fournir des informations exactes et à les maintenir à jour. L’Utilisateur est responsable de la confidentialité de ses identifiants et de toute activité réalisée via son compte.",
        en: "Access to certain features may require creating an account. The User agrees to provide accurate information and keep it up to date. The User is responsible for keeping credentials confidential and for any activity performed through the account.",
      }),
      heading({ level: 3, anchor: "account-closure", fr: "4.2 Désactivation et suppression du compte", en: "4.2 Account deactivation and deletion" }),
      paragraph({
        fr: "L’Utilisateur peut demander la désactivation temporaire ou la suppression définitive de son compte via le support (page Contact). La suppression entraîne la suppression ou l’anonymisation des données lorsque applicable, sous réserve des obligations légales, de prévention de fraude, ou de gestion de litiges (conservation limitée et sécurisée).",
        en: "The User may request temporary deactivation or permanent deletion of their account via Support (Contact page). Deletion results in deletion or anonymization of data where applicable, subject to legal obligations, fraud prevention, or dispute handling (limited and secure retention).",
      }),
      heading({ anchor: "booking", fr: "5. Processus de réservation", en: "5. Booking process" }),
      numbered({
        fr: [
          "Sélection d’un Établissement et d’un créneau.",
          "Saisie des informations nécessaires à la Réservation.",
          "Affichage des règles applicables (annulation, dépôts, no-show, etc.).",
          "Transmission de la demande et réception d’une confirmation ou d’un refus selon les modalités de l’Établissement.",
        ],
        en: [
          "Select a Venue and a timeslot.",
          "Provide information required for the Booking.",
          "Review applicable rules (cancellation, deposits, no-show, etc.).",
          "Submit the request and receive confirmation or rejection according to Venue rules.",
        ],
      }),
      heading({ anchor: "changes", fr: "6. Annulations et modifications", en: "6. Cancellations and changes" }),
      paragraph({
        fr: "Les règles d’annulation et de modification peuvent varier selon l’Établissement. L’Utilisateur doit respecter les délais et modalités affichés au moment de la Réservation. Une annulation tardive peut entraîner des frais, la perte d’un dépôt, ou une pénalité selon les règles applicables.",
        en: "Cancellation and change rules may vary by Venue. The User must comply with the deadlines and terms displayed at the time of Booking. Late cancellations may result in fees, loss of deposit, or penalties under applicable rules.",
      }),
      heading({ anchor: "payments", fr: "7. Paiements, garanties, acomptes (si applicables)", en: "7. Payments, guarantees, deposits (if applicable)" }),
      paragraph({
        fr: "Certains Établissements peuvent exiger un acompte, une garantie de paiement, ou un moyen de paiement pour sécuriser une Réservation. Le montant, les conditions de remboursement et les délais sont affichés avant validation.",
        en: "Some Venues may require a deposit, payment guarantee, or payment method to secure a Booking. Amounts, refund conditions and timelines are displayed before confirmation.",
      }),
      callout({
        variant: "info",
        title_fr: "Garantie / acompte : ce que cela signifie",
        title_en: "Guarantee / deposit: what it means",
        text_fr:
          "Une garantie ou un acompte sert à sécuriser le créneau pour l’Établissement. Selon les conditions affichées, un acompte peut être (i) remboursable, (ii) partiellement remboursable, ou (iii) non remboursable en cas d’annulation tardive ou de no‑show.",
        text_en:
          "A guarantee or deposit secures the timeslot for the Venue. Depending on the displayed terms, a deposit may be (i) refundable, (ii) partially refundable, or (iii) non-refundable in case of late cancellation or no‑show.",
      }),
      heading({ anchor: "no-show", fr: "8. Politique no-show et sanctions graduelles", en: "8. No-show policy and graduated sanctions" }),
      bullets({
        fr: [
          "Définition : une absence sans annulation conforme aux règles applicables.",
          "Conséquences possibles : perte d’acompte, facturation de frais, limitation temporaire de réservations.",
          "Sanctions graduelles : avertissement → restriction → suspension en cas de répétition, selon gravité et historique.",
        ],
        en: [
          "Definition: absence without valid cancellation under applicable rules.",
          "Possible consequences: deposit loss, fees, temporary booking limitations.",
          "Graduated approach: warning → restriction → suspension for repeated cases, depending on severity and history.",
        ],
      }),
      heading({ anchor: "liability", fr: "9. Limitation de responsabilité", en: "9. Limitation of liability" }),
      paragraph({
        fr: "Dans la mesure permise par les règles applicables, Sortir Au Maroc ne saurait être tenu responsable des prestations réalisées par les Établissements, des modifications de disponibilité, ni des dommages indirects. La responsabilité de Sortir Au Maroc, si elle est engagée, est limitée aux dommages directs prouvés liés au fonctionnement du Service.",
        en: "To the extent permitted by applicable rules, Sortir Au Maroc is not liable for Venue services, changes in availability, or indirect damages. If Sortir Au Maroc’s liability is incurred, it is limited to proven direct damages related to the Service’s operation.",
      }),
      heading({ anchor: "force-majeure", fr: "10. Force majeure", en: "10. Force majeure" }),
      paragraph({
        fr: "Aucune des parties ne pourra être tenue responsable d’un manquement résultant d’un événement de force majeure tel que défini par les règles applicables.",
        en: "Neither party shall be liable for a failure caused by a force majeure event as defined by applicable rules.",
      }),
      heading({ anchor: "ip", fr: "11. Propriété intellectuelle", en: "11. Intellectual property" }),
      paragraph({
        fr: "Le Service, ses marques, logos, interfaces et contenus sont protégés. Toute reproduction ou utilisation non autorisée est interdite.",
        en: "The Service, its brands, logos, interfaces and content are protected. Any unauthorized reproduction or use is prohibited.",
      }),
      heading({ anchor: "claims", fr: "12. Contact / réclamations", en: "12. Contact / complaints" }),
      paragraph({
        fr: "Pour toute question ou réclamation, l’Utilisateur peut contacter Sortir Au Maroc via la page Contact. Pour une réclamation concernant une prestation, il est recommandé de contacter également l’Établissement.",
        en: "For questions or complaints, the User may contact Sortir Au Maroc via the Contact page. For complaints about the on-site service, it is also recommended to contact the Venue.",
      }),
      heading({ anchor: "updates", fr: "13. Mise à jour des Conditions", en: "13. Updates to these Terms" }),
      paragraph({
        fr: "Sortir Au Maroc peut modifier les présentes Conditions afin de refléter des évolutions légales, techniques ou opérationnelles. La version applicable est celle publiée au moment de l’utilisation.",
        en: "Sortir Au Maroc may update these Terms to reflect legal, technical or operational changes. The applicable version is the one published at the time of use.",
      }),
      heading({ anchor: "law", fr: "14. Droit applicable (formulation neutre)", en: "14. Applicable law (neutral wording)" }),
      paragraph({
        fr: "Les présentes Conditions sont régies par les règles applicables. En cas de litige, les parties rechercheront une solution amiable avant toute action.",
        en: "These Terms are governed by applicable rules. In case of dispute, the parties will seek an amicable solution before any action.",
      }),
      divider(),
      helpCallout(),
    ],
  },
  {
    page_key: "privacy-policy",
    legacy_page_keys: ["privacy"],
    slug_fr: "politique-confidentialite",
    slug_en: "privacy-policy",
    status: "published",
    title_fr: "Politique de confidentialité",
    title_en: "Privacy Policy",
    page_subtitle_fr: "Informations relatives aux données personnelles et aux cookies.",
    page_subtitle_en: "Information about personal data and cookies.",
    seo_title_fr: "Politique de confidentialité — Sortir Au Maroc",
    seo_title_en: "Privacy Policy — Sortir Au Maroc",
    seo_description_fr:
      "Finalités, bases légales, durées de conservation, sous-traitants, sécurité et droits des utilisateurs.",
    seo_description_en:
      "Purposes, legal bases, retention, processors, security and user rights.",
    og_title_fr: "Politique de confidentialité — Sortir Au Maroc",
    og_title_en: "Privacy Policy — Sortir Au Maroc",
    og_description_fr: "Cadre de traitement des données personnelles sur Sortir Au Maroc.",
    og_description_en: "Framework for processing personal data on Sortir Au Maroc.",
    og_image_url: null,
    canonical_url_fr: "https://sam.ma/content/politique-confidentialite",
    canonical_url_en: "https://sam.ma/en/content/privacy-policy",
    robots: baseRobots(),
    show_toc: true,
    related_links: [
      {
        href_fr: "/content/conditions-utilisation",
        href_en: "/content/terms-of-use",
        label_fr: "Conditions d’utilisation",
        label_en: "Terms of Use",
      },
      {
        href_fr: "/content/contact",
        href_en: "/content/contact",
        label_fr: "Contact",
        label_en: "Contact",
      },
    ],
    schema_jsonld_fr: pageSchema({
      name: "Politique de confidentialité — Sortir Au Maroc",
      url: "https://sam.ma/content/politique-confidentialite",
      inLanguage: "fr-MA",
    }),
    schema_jsonld_en: pageSchema({
      name: "Privacy Policy — Sortir Au Maroc",
      url: "https://sam.ma/en/content/privacy-policy",
      inLanguage: "en",
    }),
    blocks: [
      toc(),
      callout({
        variant: "notice",
        title_fr: "Points clés",
        title_en: "Key points",
        text_fr:
          "• Sortir Au Maroc traite des données pour gérer votre compte, vos réservations et le support.\n• Vous disposez de droits (accès, rectification, effacement, limitation, portabilité).\n• Vous pouvez demander la suppression du compte et l’export de vos données via le support (page Contact).",
        text_en:
          "• Sortir Au Maroc processes data to manage your account, your bookings and support.\n• You have rights (access, rectification, erasure, restriction, portability).\n• You can request account deletion and a copy of your data via Support (Contact page).",
      }),
      heading({ anchor: "definitions", fr: "1. Définitions", en: "1. Definitions" }),
      bullets({
        fr: [
          "Données personnelles : toute information se rapportant à une personne identifiée ou identifiable.",
          "Traitement : toute opération effectuée sur des données (collecte, stockage, utilisation…).",
          "Sous-traitant : prestataire traitant des données pour le compte de Sortir Au Maroc.",
        ],
        en: [
          "Personal data: any information relating to an identified or identifiable person.",
          "Processing: any operation performed on data (collection, storage, use…).",
          "Processor: a provider processing data on behalf of Sortir Au Maroc.",
        ],
      }),
      heading({ anchor: "purposes", fr: "2. Finalités du traitement", en: "2. Purposes" }),
      bullets({
        fr: [
          "Gestion des comptes et authentification.",
          "Gestion des demandes de Réservation, confirmations, notifications.",
          "Support et gestion des réclamations.",
          "Prévention de la fraude et sécurité du Service.",
          "Mesure d’audience et amélioration du Service (si activée).",
        ],
        en: [
          "Account management and authentication.",
          "Handling Booking requests, confirmations and notifications.",
          "Support and complaint management.",
          "Fraud prevention and Service security.",
          "Analytics and Service improvement (if enabled).",
        ],
      }),
      heading({ anchor: "legal-basis", fr: "3. Base légale", en: "3. Legal basis" }),
      paragraph({
        fr: "Les traitements sont fondés sur : (i) l’exécution du contrat (gestion du compte et des Réservations), (ii) l’intérêt légitime (sécurité, prévention de fraude, amélioration), (iii) le consentement lorsque requis (cookies non essentiels).",
        en: "Processing is based on: (i) contract performance (account and Booking management), (ii) legitimate interests (security, fraud prevention, improvement), (iii) consent where required (non-essential cookies).",
      }),
      heading({ anchor: "data", fr: "4. Données collectées", en: "4. Data collected" }),
      bullets({
        fr: [
          "Données de compte : email, téléphone, préférences.",
          "Données de réservation : date, heure, nombre de personnes, messages.",
          "Données techniques : logs, identifiants techniques, informations de navigation.",
          "Données de paiement : lorsque applicable, via des prestataires de paiement (Sortir Au Maroc ne stocke pas les données carte complètes).",
        ],
        en: [
          "Account data: email, phone, preferences.",
          "Booking data: date, time, party size, messages.",
          "Technical data: logs, technical identifiers, browsing information.",
          "Payment data: when applicable, via payment providers (Sortir Au Maroc does not store full card data).",
        ],
      }),
      heading({ anchor: "retention", fr: "5. Durée de conservation", en: "5. Retention" }),
      paragraph({
        fr: "Les données sont conservées pendant la durée nécessaire aux finalités décrites, puis archivées ou supprimées conformément aux obligations applicables. Certaines données peuvent être conservées plus longtemps en cas d’obligation légale, de litige ou de fraude.",
        en: "Data is retained for as long as necessary for the purposes described, then archived or deleted according to applicable obligations. Some data may be retained longer in case of legal obligations, disputes or fraud.",
      }),
      heading({ anchor: "recipients", fr: "6. Destinataires et sous-traitants", en: "6. Recipients and processors" }),
      paragraph({
        fr: "Les données peuvent être partagées avec : (i) les Établissements concernés par une Réservation, (ii) des prestataires techniques (hébergement, emailing, analytics), (iii) des prestataires de paiement lorsque applicable. Les sous-traitants sont sélectionnés pour leurs garanties de sécurité.",
        en: "Data may be shared with: (i) Venues involved in a Booking, (ii) technical providers (hosting, email, analytics), (iii) payment providers when applicable. Processors are selected for their security guarantees.",
      }),
      heading({ anchor: "security", fr: "7. Sécurité", en: "7. Security" }),
      bullets({
        fr: [
          "Mesures techniques et organisationnelles adaptées.",
          "Contrôles d’accès et journalisation.",
          "Chiffrement en transit lorsque possible.",
        ],
        en: [
          "Appropriate technical and organizational measures.",
          "Access controls and logging.",
          "Encryption in transit when possible.",
        ],
      }),
      heading({ anchor: "cookies", fr: "8. Cookies", en: "8. Cookies" }),
      paragraph({
        fr: "Le Service peut utiliser des cookies et technologies similaires. Certains sont nécessaires au fonctionnement, d’autres peuvent être utilisés pour la mesure d’audience ou l’amélioration, sous réserve de votre choix lorsque requis.",
        en: "The Service may use cookies and similar technologies. Some are necessary for operation; others may be used for analytics or improvement, subject to your choice when required.",
      }),
      heading({ anchor: "rights", fr: "9. Droits des utilisateurs", en: "9. User rights" }),
      bullets({
        fr: [
          "Droit d’accès et de rectification de vos données.",
          "Droit à l’effacement (suppression) lorsque applicable, y compris suppression du compte.",
          "Droit d’opposition et droit à la limitation du traitement.",
          "Droit à la portabilité (recevoir une copie de vos données) lorsque applicable.",
          "Retrait du consentement lorsque le traitement est fondé sur celui-ci.",
        ],
        en: [
          "Right of access and rectification.",
          "Right to erasure where applicable, including account deletion.",
          "Right to object and right to restriction of processing.",
          "Right to data portability (receive a copy of your data) where applicable.",
          "Withdrawal of consent when processing is based on it.",
        ],
      }),
      callout({
        variant: "info",
        title_fr: "Suppression du compte et export des données",
        title_en: "Account deletion and data export",
        text_fr:
          "Pour demander la suppression définitive du compte ou recevoir une copie de vos données, contactez-nous via la page Contact. Nous pourrons vous demander des informations de vérification afin de protéger votre compte.",
        text_en:
          "To request permanent account deletion or receive a copy of your data, contact us via the Contact page. We may ask for verification details to protect your account.",
      }),
      heading({ anchor: "contact", fr: "10. Contact", en: "10. Contact" }),
      paragraph({
        fr: "Pour exercer vos droits ou poser une question, contactez-nous via la page Contact.",
        en: "To exercise your rights or ask a question, contact us via the Contact page.",
      }),
      heading({ anchor: "updates", fr: "11. Mise à jour", en: "11. Updates" }),
      paragraph({
        fr: "Cette Politique peut évoluer. La version publiée sur le Service est la version applicable.",
        en: "This Policy may change. The version published on the Service is the applicable one.",
      }),
      divider(),
      helpCallout(),
    ],
  },
  {
    page_key: "legal-notice",
    slug_fr: "mentions-legales",
    slug_en: "legal-notice",
    status: "published",
    title_fr: "Mentions légales",
    title_en: "Legal Notice",
    page_subtitle_fr: "Version provisoire (allégée) — informations générales sur le Service.",
    page_subtitle_en: "Provisional version — general information about the Service.",
    seo_title_fr: "Mentions légales — Sortir Au Maroc",
    seo_title_en: "Legal Notice — Sortir Au Maroc",
    seo_description_fr: "Informations générales (version provisoire).",
    seo_description_en: "General information (provisional version).",
    og_title_fr: "Mentions légales — Sortir Au Maroc",
    og_title_en: "Legal Notice — Sortir Au Maroc",
    og_description_fr: "Informations générales sur Sortir Au Maroc.",
    og_description_en: "General information about Sortir Au Maroc.",
    og_image_url: null,
    canonical_url_fr: "https://sam.ma/content/mentions-legales",
    canonical_url_en: "https://sam.ma/en/content/legal-notice",
    robots: baseRobots(),
    show_toc: true,
    related_links: [
      { href_fr: "/content/contact", href_en: "/content/contact", label_fr: "Contact", label_en: "Contact" },
    ],
    schema_jsonld_fr: pageSchema({ name: "Mentions légales", url: "https://sam.ma/content/mentions-legales", inLanguage: "fr-MA" }),
    schema_jsonld_en: pageSchema({ name: "Legal notice", url: "https://sam.ma/en/content/legal-notice", inLanguage: "en" }),
    blocks: [
      toc(),
      heading({ anchor: "editor", fr: "1. Éditeur du Service", en: "1. Service publisher" }),
      paragraph({
        fr: "Sortir Au Maroc (dénomination commerciale). Adresse provisoire : Casablanca, Maroc. Contact : support@sortiraumaroc.ma.",
        en: "Sortir Au Maroc (brand name). Provisional address: Casablanca, Morocco. Contact: support@sortiraumaroc.ma.",
      }),
      heading({ anchor: "hosting", fr: "2. Hébergement", en: "2. Hosting" }),
      paragraph({
        fr: "Les informations d’hébergement peuvent évoluer selon l’infrastructure technique. Pour toute demande, contactez-nous.",
        en: "Hosting information may change depending on technical infrastructure. For any request, please contact us.",
      }),
      heading({ anchor: "ip", fr: "3. Propriété intellectuelle", en: "3. Intellectual property" }),
      paragraph({
        fr: "Les contenus, marques et éléments graphiques du Service sont protégés. Toute reproduction non autorisée est interdite.",
        en: "Service content, brands and graphic elements are protected. Any unauthorized reproduction is prohibited.",
      }),
      divider(),
      helpCallout(),
    ],
  },
  {
    page_key: "partner-venue-charter",
    slug_fr: "charte-etablissements",
    slug_en: "partner-venue-charter",
    status: "published",
    title_fr: "Charte des établissements",
    title_en: "Partner Venue Charter",
    page_subtitle_fr: "Engagements de qualité pour les établissements partenaires.",
    page_subtitle_en: "Quality commitments for partner venues.",
    seo_title_fr: "Charte des établissements — Sortir Au Maroc",
    seo_title_en: "Partner Venue Charter — Sortir Au Maroc",
    seo_description_fr: "Engagements de qualité, informations, confirmations et gestion des réservations.",
    seo_description_en: "Quality commitments, information accuracy, confirmations and booking management.",
    og_title_fr: "Charte des établissements — Sortir Au Maroc",
    og_title_en: "Partner Venue Charter — Sortir Au Maroc",
    og_description_fr: "Engagements des partenaires sur Sortir Au Maroc.",
    og_description_en: "Partner commitments on Sortir Au Maroc.",
    og_image_url: null,
    canonical_url_fr: "https://sam.ma/content/charte-etablissements",
    canonical_url_en: "https://sam.ma/en/content/partner-venue-charter",
    robots: baseRobots(),
    show_toc: true,
    related_links: [
      { href_fr: "/content/contact", href_en: "/content/contact", label_fr: "Contact", label_en: "Contact" },
    ],
    schema_jsonld_fr: pageSchema({ name: "Charte des établissements", url: "https://sam.ma/content/charte-etablissements", inLanguage: "fr-MA" }),
    schema_jsonld_en: pageSchema({ name: "Partner venue charter", url: "https://sam.ma/en/content/partner-venue-charter", inLanguage: "en" }),
    blocks: [
      toc(),
      heading({ anchor: "scope", fr: "1. Objet", en: "1. Purpose" }),
      paragraph({
        fr: "Cette charte décrit les engagements attendus des Établissements partenaires afin d’assurer une expérience de réservation fiable.",
        en: "This charter describes partner venue commitments to ensure a reliable booking experience.",
      }),
      heading({ anchor: "accuracy", fr: "2. Exactitude des informations", en: "2. Information accuracy" }),
      bullets({
        fr: [
          "Mettre à jour les horaires, l’adresse, les règles de réservation.",
          "Décrire clairement les conditions (dépôt, annulation, no-show).",
          "Maintenir les disponibilités aussi proches que possible de la réalité.",
        ],
        en: [
          "Keep schedules, address and booking rules up to date.",
          "Clearly describe conditions (deposit, cancellation, no-show).",
          "Maintain availability as accurately as possible.",
        ],
      }),
      heading({ anchor: "confirmation", fr: "3. Confirmation des réservations", en: "3. Booking confirmations" }),
      paragraph({
        fr: "L’Établissement s’engage à traiter les demandes de réservation dans des délais raisonnables et à respecter les confirmations envoyées.",
        en: "The Venue commits to handle booking requests within reasonable time and respect confirmed bookings.",
      }),
      heading({ anchor: "conduct", fr: "4. Comportement et accueil", en: "4. Conduct and reception" }),
      paragraph({
        fr: "L’Établissement s’engage à accueillir l’Utilisateur dans des conditions professionnelles, conformément aux informations affichées.",
        en: "The Venue commits to welcome Users professionally and according to displayed information.",
      }),
      divider(),
      helpCallout(),
    ],
  },
  {
    page_key: "refund-policy",
    slug_fr: "politique-remboursement",
    slug_en: "refund-policy",
    status: "published",
    title_fr: "Politique de remboursement",
    title_en: "Refund Policy",
    page_subtitle_fr: "Cadre général pour les remboursements liés aux dépôts et frais éventuels.",
    page_subtitle_en: "General framework for refunds related to deposits and possible fees.",
    seo_title_fr: "Politique de remboursement — Sortir Au Maroc",
    seo_title_en: "Refund Policy — Sortir Au Maroc",
    seo_description_fr: "Règles de remboursement selon les conditions affichées par l’établissement.",
    seo_description_en: "Refund rules based on venue conditions displayed at booking time.",
    og_title_fr: "Politique de remboursement — Sortir Au Maroc",
    og_title_en: "Refund Policy — Sortir Au Maroc",
    og_description_fr: "Cadre de remboursement des dépôts et frais.",
    og_description_en: "Refund framework for deposits and fees.",
    og_image_url: null,
    canonical_url_fr: "https://sam.ma/content/politique-remboursement",
    canonical_url_en: "https://sam.ma/en/content/refund-policy",
    robots: baseRobots(),
    show_toc: true,
    related_links: [
      { href_fr: "/content/conditions-utilisation", href_en: "/content/terms-of-use", label_fr: "Conditions d’utilisation", label_en: "Terms of Use" },
      { href_fr: "/content/contact", href_en: "/content/contact", label_fr: "Contact", label_en: "Contact" },
    ],
    schema_jsonld_fr: pageSchema({ name: "Politique de remboursement", url: "https://sam.ma/content/politique-remboursement", inLanguage: "fr-MA" }),
    schema_jsonld_en: pageSchema({ name: "Refund policy", url: "https://sam.ma/en/content/refund-policy", inLanguage: "en" }),
    blocks: [
      toc(),
      callout({
        variant: "notice",
        title_fr: "Points clés",
        title_en: "Key points",
        text_fr:
          "• Les remboursements dépendent des conditions affichées avant validation (Établissement + prestataire de paiement).\n• Un acompte peut être remboursable, partiellement remboursable ou non remboursable selon les conditions affichées.\n• En cas de doute, contactez le support avec les détails de la réservation.",
        text_en:
          "• Refunds depend on the conditions displayed before confirmation (Venue + payment provider).\n• A deposit may be refundable, partially refundable or non-refundable depending on the displayed terms.\n• If in doubt, contact Support with your booking details.",
      }),
      heading({ anchor: "principle", fr: "1. Principe", en: "1. Principle" }),
      paragraph({
        fr: "Les remboursements dépendent des conditions affichées avant la confirmation de la Réservation (dépôt, délai d’annulation, frais).",
        en: "Refunds depend on the conditions displayed before Booking confirmation (deposit, cancellation deadlines, fees).",
      }),
      heading({ anchor: "process", fr: "2. Procédure", en: "2. Process" }),
      numbered({
        fr: [
          "Vérifier les conditions affichées avant la confirmation (annulation, délai, frais, dépôt / garantie).",
          "Faire la demande via la page Contact en indiquant la réservation concernée.",
          "Analyse conjointe : Sortir Au Maroc traite la demande au niveau plateforme et peut solliciter l’Établissement pour vérifier les conditions et faits.",
        ],
        en: [
          "Check the conditions displayed before confirmation (cancellation window, fees, deposit / guarantee).",
          "Submit a request via the Contact page with the relevant booking details.",
          "Joint review: Sortir Au Maroc handles the request at platform level and may contact the Venue to validate the terms and facts.",
        ],
      }),
      callout({
        variant: "info",
        title_fr: "Délais",
        title_en: "Timelines",
        text_fr:
          "Les délais de remboursement peuvent varier selon les prestataires de paiement et la nature du litige. Un remboursement peut apparaître en plusieurs étapes (autorisation / débit / remboursement).",
        text_en:
          "Refund timelines may vary depending on payment providers and the nature of the dispute. A refund may appear in multiple steps (authorization / charge / refund).",
      }),
      heading({ anchor: "common-cases", fr: "3. Cas fréquents", en: "3. Common cases" }),
      bullets({
        fr: [
          "Annulation dans le délai prévu : remboursement selon les conditions affichées.",
          "Annulation hors délai : frais possibles et/ou acompte non remboursable selon les conditions affichées.",
          "No-show : perte d’acompte et/ou frais possibles selon les conditions affichées.",
        ],
        en: [
          "Cancellation within the allowed window: refund based on the displayed terms.",
          "Late cancellation: possible fees and/or non-refundable deposit based on the displayed terms.",
          "No-show: possible deposit loss and/or fees based on the displayed terms.",
        ],
      }),
      callout({
        variant: "warning",
        title_fr: "Acompte et non-remboursement",
        title_en: "Deposit and non-refundability",
        text_fr:
          "Un acompte peut être non remboursable lorsque cela est clairement indiqué avant confirmation, notamment en cas d’annulation tardive ou de no-show.",
        text_en:
          "A deposit may be non-refundable when clearly indicated before confirmation, especially for late cancellations or no-shows.",
      }),
      divider(),
      helpCallout(),
    ],
  },
  {
    page_key: "anti-no-show-policy",
    slug_fr: "politique-anti-no-show",
    slug_en: "anti-no-show-policy",
    status: "published",
    title_fr: "Politique anti no-show",
    title_en: "Anti no-show policy",
    page_subtitle_fr: "Cadre pour réduire les absences et protéger les établissements et utilisateurs.",
    page_subtitle_en: "Framework to reduce no-shows and protect venues and users.",
    seo_title_fr: "Politique anti no-show — Sortir Au Maroc",
    seo_title_en: "Anti no-show policy — Sortir Au Maroc",
    seo_description_fr: "Définition, sanctions graduelles, dépôts et comportements attendus.",
    seo_description_en: "Definition, graduated sanctions, deposits and expected behavior.",
    og_title_fr: "Politique anti no-show — Sortir Au Maroc",
    og_title_en: "Anti no-show policy — Sortir Au Maroc",
    og_description_fr: "Prévention et sanctions graduelles en cas de no-show.",
    og_description_en: "Prevention and graduated sanctions for no-shows.",
    og_image_url: null,
    canonical_url_fr: "https://sam.ma/content/politique-anti-no-show",
    canonical_url_en: "https://sam.ma/en/content/anti-no-show-policy",
    robots: baseRobots(),
    show_toc: true,
    related_links: [
      { href_fr: "/content/conditions-utilisation", href_en: "/content/terms-of-use", label_fr: "Conditions d’utilisation", label_en: "Terms of Use" },
      { href_fr: "/content/contact", href_en: "/content/contact", label_fr: "Contact", label_en: "Contact" },
    ],
    schema_jsonld_fr: pageSchema({ name: "Politique anti no-show", url: "https://sam.ma/content/politique-anti-no-show", inLanguage: "fr-MA" }),
    schema_jsonld_en: pageSchema({ name: "Anti no-show policy", url: "https://sam.ma/en/content/anti-no-show-policy", inLanguage: "en" }),
    blocks: [
      toc(),
      callout({
        variant: "notice",
        title_fr: "Points clés",
        title_en: "Key points",
        text_fr:
          "• Un no-show = absence sans annulation conforme aux règles affichées.\n• Un acompte / une garantie peut être utilisé pour sécuriser un créneau et limiter les no-shows.\n• Les sanctions sont graduelles (avertissement → restriction → suspension) en cas de répétitions.",
        text_en:
          "• A no-show = absence without a valid cancellation under the displayed rules.\n• A deposit / guarantee may secure a timeslot and reduce no-shows.\n• Sanctions are graduated (warning → restriction → suspension) for repeated cases.",
      }),
      heading({ anchor: "definition", fr: "1. Définition", en: "1. Definition" }),
      paragraph({
        fr: "Un no-show correspond à l’absence de l’Utilisateur à la réservation sans annulation conforme aux règles affichées au moment de la réservation (délais, conditions et, le cas échéant, frais / dépôt).",
        en: "A no-show occurs when the User does not attend a booking without a valid cancellation under the rules displayed at booking time (deadlines, conditions and, when applicable, fees / deposit).",
      }),
      heading({ anchor: "prevention", fr: "2. Prévention", en: "2. Prevention" }),
      bullets({
        fr: [
          "Rappels de réservation lorsque disponibles.",
          "Affichage clair des règles (annulation, dépôts).",
          "Possibilité de dépôts ou garanties sur certains créneaux.",
        ],
        en: [
          "Booking reminders when available.",
          "Clear display of rules (cancellation, deposits).",
          "Deposits or guarantees for certain timeslots.",
        ],
      }),
      heading({ anchor: "sanctions", fr: "3. Sanctions graduelles", en: "3. Graduated sanctions" }),
      callout({
        variant: "warning",
        title_fr: "Sanctions : principe",
        title_en: "Sanctions: principle",
        text_fr:
          "Les sanctions visent à protéger les Établissements et les autres utilisateurs. Elles sont proportionnées et tiennent compte de l’historique.",
        text_en:
          "Sanctions aim to protect Venues and other users. They are proportionate and consider the user’s history.",
      }),
      numbered({
        fr: [
          "Avertissement et rappel des règles.",
          "Restriction temporaire du nombre de réservations.",
          "Suspension du compte en cas de répétitions ou abus.",
        ],
        en: [
          "Warning and reminder of rules.",
          "Temporary restriction of booking capabilities.",
          "Account suspension for repeated cases or abuse.",
        ],
      }),
      callout({
        variant: "warning",
        title_fr: "Impact",
        title_en: "Impact",
        text_fr: "Les no-shows pénalisent les établissements et réduisent la disponibilité pour d’autres utilisateurs.",
        text_en: "No-shows hurt venues and reduce availability for other users.",
      }),
      divider(),
      helpCallout(),
    ],
  },
];

export async function seedPhase1ContentPages(args: { adminKey: string | undefined; existingPages?: ContentPageAdmin[] }):
  Promise<SeedResult> {
  const existing = Array.isArray(args.existingPages) ? args.existingPages : (await listAdminContentPages(args.adminKey)).items;
  const pages = Array.isArray(existing) ? existing : [];

  const byKey = new Map<string, ContentPageAdmin>();
  for (const p of pages) {
    const key = String((p as any).page_key ?? "").trim();
    if (key) byKey.set(key, p);
  }

  let createdPages = 0;
  let updatedPages = 0;

  for (const p of SEED_PAGES) {
    const existingPage =
      byKey.get(p.page_key) ??
      (Array.isArray(p.legacy_page_keys)
        ? p.legacy_page_keys.map((k) => byKey.get(k)).find(Boolean)
        : undefined);

    const payload = {
      slug: p.slug_fr, // legacy slug aligns with FR slug
      page_key: p.page_key,
      slug_fr: p.slug_fr,
      slug_en: p.slug_en,
      status: p.status,
      is_published: p.status === "published",

      title: p.title_fr,
      body_markdown: "",

      title_fr: p.title_fr,
      title_en: p.title_en,
      page_subtitle_fr: p.page_subtitle_fr,
      page_subtitle_en: p.page_subtitle_en,

      // keep legacy HTML empty (blocks are source of truth)
      body_html_fr: sanitizeRichTextHtml(""),
      body_html_en: sanitizeRichTextHtml(""),

      seo_title_fr: p.seo_title_fr,
      seo_title_en: p.seo_title_en,
      seo_description_fr: p.seo_description_fr,
      seo_description_en: p.seo_description_en,

      // keep legacy SEO in sync
      meta_title_fr: p.seo_title_fr,
      meta_title_en: p.seo_title_en,
      meta_description_fr: p.seo_description_fr,
      meta_description_en: p.seo_description_en,

      og_title_fr: p.og_title_fr,
      og_title_en: p.og_title_en,
      og_description_fr: p.og_description_fr,
      og_description_en: p.og_description_en,
      og_image_url: p.og_image_url,

      canonical_url_fr: p.canonical_url_fr,
      canonical_url_en: p.canonical_url_en,
      robots: p.robots,

      show_toc: p.show_toc,
      related_links: p.related_links,
      schema_jsonld_fr: p.schema_jsonld_fr,
      schema_jsonld_en: p.schema_jsonld_en,
    };

    if (!existingPage) {
      const created = await createAdminContentPage(args.adminKey, payload);
      await replaceAdminContentPageBlocks(args.adminKey, { pageId: created.item.id, blocks: p.blocks });
      createdPages += 1;
      continue;
    }

    await updateAdminContentPage(args.adminKey, { id: existingPage.id, ...payload });
    await replaceAdminContentPageBlocks(args.adminKey, { pageId: existingPage.id, blocks: p.blocks });
    updatedPages += 1;
  }

  return { createdPages, updatedPages };
}
