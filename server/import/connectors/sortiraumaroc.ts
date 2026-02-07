/**
 * Sortir Au Maroc Scraper - SAM Import CHR
 *
 * Scrape les établissements depuis sortiraumaroc.ma
 * Structure découverte: /categorie/[category-name] et /place/[establishment-name]
 */

import type {
  RawPlace,
  ConnectorConfig,
  ConnectorResult,
  RawPhoto,
  SocialLinks,
} from "./types";
import {
  BaseConnector,
  type SearchParams,
  registerConnector,
} from "./base";
import { extractSocialLinks } from "../utils";

// ============================================
// CONFIGURATION
// ============================================

const BASE_URL = "https://www.sortiraumaroc.ma";

// Mapping catégorie CHR -> paths sur le site
// Note: sortiraumaroc.ma n'a que 3 catégories actives
const CATEGORY_PATHS: Record<string, string[]> = {
  restaurant: ["/categorie/restaurant"],
  cafe: ["/categorie/the-et-cafe"],
  bar: ["/categorie/bars-pubs"],
  tea_room: ["/categorie/the-et-cafe"],
  // Les autres catégories n'existent pas sur sortiraumaroc.ma (retournent 404)
};

// Liste complète des villes marocaines
const MOROCCAN_CITIES = [
  "casablanca",
  "marrakech",
  "rabat",
  "fes",
  "fès",
  "tanger",
  "agadir",
  "meknes",
  "meknès",
  "oujda",
  "kenitra",
  "kénitra",
  "tetouan",
  "tétouan",
  "essaouira",
  "mohammedia",
  "el jadida",
  "el_jadida",
  "eljadida",
  "beni mellal",
  "benimellal",
  "nador",
  "taza",
  "settat",
  "berrechid",
  "khouribga",
  "sale",
  "salé",
  "temara",
  "témara",
  "safi",
  "ifrane",
  "ouarzazate",
  "errachidia",
  "laayoune",
  "dakhla",
  "taghazout",
  "chefchaouen",
  "asilah",
];

// ============================================
// HELPERS POUR PARSER LE HTML
// ============================================

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&apos;/g, "'");
}

// ============================================
// CONNECTOR
// ============================================

export class SortirAuMarocConnector extends BaseConnector {
  readonly source = "sortiraumaroc" as const;

  constructor(config: Partial<ConnectorConfig> = {}) {
    super({
      rateLimitPerSecond: 2, // 2 requêtes/seconde
      respectRobots: true,
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      ...config,
    });
    this.initRateLimiter();
  }

  async search(params: SearchParams): Promise<ConnectorResult> {
    const startTime = Date.now();
    const { city, category, keywords, limit = 50 } = params;

    const allPlaces: RawPlace[] = [];
    const seenUrls = new Set<string>();

    try {
      // Déterminer les paths à scraper
      const paths = category
        ? CATEGORY_PATHS[category] || [`/categorie/${category}`]
        : Object.values(CATEGORY_PATHS).flat();

      // Dédupliquer les paths
      const uniquePaths = [...new Set(paths)];

      for (const path of uniquePaths) {
        if (allPlaces.length >= limit) break;

        const listUrl = `${BASE_URL}${path}`;
        this.logInfo(`Fetching category: ${listUrl}`);

        try {
          const listHtml = await this.fetchPage(listUrl);
          if (!listHtml) continue;

          // Extraire les liens vers les fiches /place/xxx
          const placeLinks = this.extractPlaceLinks(listHtml, city);
          this.logInfo(`Found ${placeLinks.length} links on ${path} (filtering by ${city})`);

          for (const link of placeLinks) {
            if (allPlaces.length >= limit) break;
            if (seenUrls.has(link)) continue;
            seenUrls.add(link);

            // Filtrer par keywords si spécifiés
            if (keywords?.length) {
              const linkLower = link.toLowerCase();
              if (!keywords.some((kw) => linkLower.includes(kw.toLowerCase()))) {
                continue;
              }
            }

            const fullUrl = link.startsWith("http") ? link : `${BASE_URL}${link}`;

            try {
              const place = await this.scrapePlacePage(fullUrl, city, category);
              if (place) {
                // Vérifier que l'établissement est bien dans la ville demandée
                if (this.matchesCity(place.city || "", city)) {
                  allPlaces.push(place);
                  this.logInfo(`Scraped: ${place.name} (${place.city})`);
                }
              }
            } catch (err) {
              this.logWarn(`Failed to scrape: ${fullUrl}`, {
                error: (err as Error).message,
              });
            }
          }
        } catch (err) {
          this.logWarn(`Failed to fetch list: ${listUrl}`, {
            error: (err as Error).message,
          });
        }
      }

      this.logInfo(`Scraped ${allPlaces.length} places for ${city}`);

      return this.createSuccessResult(
        BASE_URL,
        allPlaces,
        Date.now() - startTime,
        200
      );
    } catch (error) {
      this.logError(`Search failed for ${city}`, {
        error: (error as Error).message,
      });
      return this.createErrorResult(
        BASE_URL,
        error as Error,
        Date.now() - startTime
      );
    }
  }

  async getDetails(url: string): Promise<RawPlace | null> {
    try {
      return await this.scrapePlacePage(url);
    } catch (error) {
      this.logError(`Failed to get details: ${url}`, {
        error: (error as Error).message,
      });
      return null;
    }
  }

  /**
   * Récupère une page HTML
   */
  private async fetchPage(url: string): Promise<string | null> {
    return this.executeWithRateLimit(async () => {
      const response = await fetch(url, {
        headers: {
          "User-Agent": this.config.userAgent || "Mozilla/5.0 (compatible; SAM-Bot/1.0)",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "fr-FR,fr;q=0.9",
        },
      });

      if (!response.ok) {
        if (response.status === 429) {
          throw new Error("Rate limited");
        }
        this.logWarn(`HTTP ${response.status} for ${url}`);
        return null;
      }

      return response.text();
    });
  }

  /**
   * Extrait les liens /place/xxx depuis une page de catégorie
   */
  private extractPlaceLinks(html: string, targetCity?: string): string[] {
    const links: string[] = [];

    // Pattern pour les liens /place/xxx
    const patterns = [
      // Liens vers /place/
      /<a[^>]+href=["'](\/place\/[^"']+)["']/gi,
      // Liens absolus vers place
      /<a[^>]+href=["'](https?:\/\/(?:www\.)?sortiraumaroc\.ma\/place\/[^"']+)["']/gi,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(html)) !== null) {
        let href = match[1];

        // Normaliser en path relatif
        if (href.startsWith("http")) {
          try {
            const url = new URL(href);
            href = url.pathname;
          } catch {
            continue;
          }
        }

        // Filtrer les liens non pertinents
        if (
          href &&
          href.startsWith("/place/") &&
          !href.includes("#") &&
          !links.includes(href)
        ) {
          // Si une ville cible est spécifiée, on peut filtrer par URL
          // mais le filtrage principal se fait sur le contenu de la page
          links.push(href);
        }
      }
    }

    return links;
  }

  /**
   * Vérifie si une ville correspond à la ville recherchée
   */
  private matchesCity(placeCity: string, targetCity: string): boolean {
    if (!targetCity) return true;

    const normalize = (s: string) =>
      s
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[_-]/g, " ")
        .trim();

    const normalizedPlace = normalize(placeCity);
    const normalizedTarget = normalize(targetCity);

    // Match exact ou partiel
    return (
      normalizedPlace.includes(normalizedTarget) ||
      normalizedTarget.includes(normalizedPlace)
    );
  }

  /**
   * Scrape une page de fiche établissement /place/xxx
   */
  private async scrapePlacePage(
    url: string,
    defaultCity?: string,
    defaultCategory?: string
  ): Promise<RawPlace | null> {
    const html = await this.fetchPage(url);
    if (!html) return null;

    // Extraire le nom
    const name = this.extractName(html);
    if (!name) {
      this.logWarn(`Could not extract name from: ${url}`);
      return null;
    }

    // Extraire les autres champs
    const address = this.extractAddress(html);
    const phone = this.extractPhone(html);
    const website = this.extractWebsite(html);
    const photos = this.extractPhotos(html);
    const socialLinks = this.extractSocialLinksFromPage(html);
    const description = this.extractDescription(html);
    const coords = this.extractCoordinates(html);
    const tags = this.extractTags(html);
    const city = this.extractCity(html, address) || defaultCity;
    const category = defaultCategory || this.guessCategoryFromContent(html, url);

    return {
      source: "sortiraumaroc",
      sourceUrl: url,
      externalId: this.generateExternalId(url),
      fetchedAt: new Date().toISOString(),

      name: decodeHtmlEntities(name),
      category,
      description: description ? decodeHtmlEntities(description) : undefined,

      address: address ? decodeHtmlEntities(address) : undefined,
      city: city || "",

      phone,
      website,

      latitude: coords?.lat,
      longitude: coords?.lng,

      photos,
      socialLinks,
      tags,

      rawData: {
        url,
        scrapedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Extrait le nom de l'établissement
   */
  private extractName(html: string): string | undefined {
    const patterns = [
      // Open Graph title
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i,
      // H1
      /<h1[^>]*class=["'][^"']*(?:title|name|heading)[^"']*["'][^>]*>([^<]+)</i,
      /<h1[^>]*>([^<]+)</i,
      // Title tag
      /<title[^>]*>([^<]+)</i,
    ];

    for (const regex of patterns) {
      const match = html.match(regex);
      if (match?.[1]) {
        const title = stripHtml(match[1]);
        // Nettoyer le titre
        return title
          .replace(/\s*[-|–]\s*Sortir\s*Au\s*Maroc.*/i, "")
          .replace(/\s*[-|–]\s*sortiraumaroc.*/i, "")
          .trim();
      }
    }

    return undefined;
  }

  /**
   * Extrait l'adresse
   */
  private extractAddress(html: string): string | undefined {
    const patterns = [
      // Schema.org
      /<[^>]+itemprop=["']streetAddress["'][^>]*>([^<]+)</i,
      /<[^>]+itemprop=["']address["'][^>]*>([^<]+)</i,
      // Classes communes
      /<[^>]+class=["'][^"']*(?:address|adresse|location)[^"']*["'][^>]*>([^<]{10,200})</i,
      // Icône localisation suivie de texte
      /(?:fa-map-marker|fa-location|location-icon)[^>]*>[\s\S]*?<[^>]*>([^<]{10,200})</i,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) {
        const addr = stripHtml(match[1]);
        if (addr.length > 5) return addr;
      }
    }

    return undefined;
  }

  /**
   * Extrait le numéro de téléphone
   */
  private extractPhone(html: string): string | undefined {
    const patterns = [
      // Lien tel:
      /href=["']tel:([^"']+)["']/i,
      // Schema.org
      /<[^>]+itemprop=["']telephone["'][^>]*>([^<]+)</i,
      // Numéro marocain dans le texte
      /((?:\+212|00212|0)[\s.-]?[5-7][\s\d.-]{8,14})/,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) {
        return match[1].replace(/[\s.-]/g, "").replace(/^00/, "+");
      }
    }

    return undefined;
  }

  /**
   * Extrait le site web
   */
  private extractWebsite(html: string): string | undefined {
    const patterns = [
      // Lien explicite "site web"
      /<a[^>]+href=["'](https?:\/\/(?!(?:www\.)?(?:facebook|instagram|twitter|tiktok|youtube|wa\.me|sortiraumaroc))[^"']+)["'][^>]*>[\s\S]*?(?:site\s*web|website|visiter|official)/i,
      // Schema.org url
      /<[^>]+itemprop=["']url["'][^>]+href=["'](https?:\/\/(?!.*sortiraumaroc)[^"']+)["']/i,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1] && !match[1].includes("sortiraumaroc")) {
        return match[1];
      }
    }

    return undefined;
  }

  /**
   * Extrait les photos
   */
  private extractPhotos(html: string): RawPhoto[] {
    const photos: RawPhoto[] = [];
    const seenUrls = new Set<string>();

    const patterns = [
      // Open Graph image
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/gi,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/gi,
      // Images dans galerie
      /<img[^>]+src=["']([^"']+)["'][^>]*class=["'][^"']*(?:gallery|slider|photo|image|main)[^"']*["']/gi,
      // Images de grande taille
      /<img[^>]+src=["']([^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/gi,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(html)) !== null && photos.length < 10) {
        let url = match[1];

        if (
          url &&
          !seenUrls.has(url) &&
          !url.includes("logo") &&
          !url.includes("icon") &&
          !url.includes("avatar") &&
          !url.includes("placeholder") &&
          url.length > 10
        ) {
          // Normaliser l'URL
          if (url.startsWith("//")) {
            url = "https:" + url;
          } else if (url.startsWith("/")) {
            url = BASE_URL + url;
          }

          if (url.startsWith("http")) {
            seenUrls.add(url);
            photos.push({
              url,
              credit: "sortiraumaroc.ma",
            });
          }
        }
      }
    }

    return photos;
  }

  /**
   * Extrait les liens sociaux
   */
  private extractSocialLinksFromPage(html: string): SocialLinks | undefined {
    const links: string[] = [];

    // Réseaux sociaux
    const pattern = /<a[^>]+href=["'](https?:\/\/(?:www\.)?(?:facebook\.com|instagram\.com|twitter\.com|tiktok\.com|youtube\.com|linkedin\.com)\/[^"']+)["']/gi;
    let match;
    while ((match = pattern.exec(html)) !== null) {
      links.push(match[1]);
    }

    // WhatsApp
    const waPattern = /<a[^>]+href=["'](https?:\/\/(?:wa\.me|api\.whatsapp\.com)\/[^"']+)["']/gi;
    while ((match = waPattern.exec(html)) !== null) {
      links.push(match[1]);
    }

    if (links.length === 0) return undefined;

    return extractSocialLinks(links);
  }

  /**
   * Extrait la description
   */
  private extractDescription(html: string): string | undefined {
    const patterns = [
      // Open Graph description
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i,
      // Meta description
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
      // Paragraphe de description
      /<div[^>]+class=["'][^"']*description[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) {
        const desc = stripHtml(match[1]);
        if (desc.length > 20 && desc.length < 1000) {
          return desc;
        }
      }
    }

    return undefined;
  }

  /**
   * Extrait les coordonnées GPS
   */
  private extractCoordinates(html: string): { lat: number; lng: number } | undefined {
    const patterns = [
      // JSON-LD
      /"latitude":\s*["']?(-?\d+\.?\d*)["']?,?\s*"longitude":\s*["']?(-?\d+\.?\d*)["']?/,
      // Google Maps embed
      /google\.com\/maps[^"']*[@/](-?\d+\.?\d*),(-?\d+\.?\d*)/,
      // Data attributes
      /data-lat=["'](-?\d+\.?\d*)["'][^>]*data-lng=["'](-?\d+\.?\d*)["']/,
      /data-latitude=["'](-?\d+\.?\d*)["'][^>]*data-longitude=["'](-?\d+\.?\d*)["']/,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1] && match?.[2]) {
        const lat = parseFloat(match[1]);
        const lng = parseFloat(match[2]);
        // Vérifier que c'est au Maroc (approximativement)
        if (!isNaN(lat) && !isNaN(lng) && lat > 20 && lat < 40 && lng > -20 && lng < 0) {
          return { lat, lng };
        }
      }
    }

    return undefined;
  }

  /**
   * Extrait les tags
   */
  private extractTags(html: string): string[] {
    const tags: string[] = [];

    // Meta keywords
    const keywordsMatch = html.match(/<meta[^>]+name=["']keywords["'][^>]+content=["']([^"']+)["']/i);
    if (keywordsMatch?.[1]) {
      tags.push(...keywordsMatch[1].split(",").map((t) => t.trim().toLowerCase()).filter(t => t.length > 2));
    }

    // Tags avec classes spécifiques
    const tagPattern = /<[^>]+class=["'][^"']*(?:tag|badge|label)[^"']*["'][^>]*>([^<]{2,30})</gi;
    let match;
    while ((match = tagPattern.exec(html)) !== null) {
      const tag = stripHtml(match[1]).toLowerCase();
      if (tag && tag.length < 30 && !tags.includes(tag)) {
        tags.push(tag);
      }
    }

    return [...new Set(tags)].slice(0, 15);
  }

  /**
   * Extrait la ville depuis le contenu ou l'adresse
   */
  private extractCity(html: string, address?: string): string | undefined {
    // Chercher dans les données structurées
    const patterns = [
      /<[^>]+itemprop=["']addressLocality["'][^>]*>([^<]+)</i,
      /<[^>]+class=["'][^"']*city[^"']*["'][^>]*>([^<]+)</i,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) {
        const city = stripHtml(match[1]).toLowerCase();
        if (MOROCCAN_CITIES.some((c) => city.includes(c) || c.includes(city))) {
          return city;
        }
      }
    }

    // Chercher dans l'adresse
    if (address) {
      const addrLower = address.toLowerCase();
      for (const city of MOROCCAN_CITIES) {
        if (addrLower.includes(city)) {
          return city;
        }
      }
    }

    // Chercher dans l'URL ou le contenu
    const htmlLower = html.toLowerCase();
    for (const city of MOROCCAN_CITIES) {
      if (htmlLower.includes(`"${city}"`) || htmlLower.includes(`>${city}<`)) {
        return city;
      }
    }

    return undefined;
  }

  /**
   * Devine la catégorie depuis le contenu de la page
   */
  private guessCategoryFromContent(html: string, url: string): string | undefined {
    const lower = (html + url).toLowerCase();

    // Patterns de catégories
    if (lower.includes("nightclub") || lower.includes("discothèque") || lower.includes("discotheque")) return "club";
    if (lower.includes("rooftop")) return "rooftop";
    if (lower.includes("lounge")) return "lounge";
    if (lower.includes("salon de thé") || lower.includes("salon-de-the") || lower.includes("tea room")) return "tea_room";
    if (lower.includes("pâtisserie") || lower.includes("patisserie")) return "patisserie";
    if (lower.includes("boulangerie")) return "boulangerie";
    if (lower.includes("glacier") || lower.includes("ice cream")) return "glacier";
    if (lower.includes("fast food") || lower.includes("fast-food")) return "fast_food";
    if (lower.includes("snack")) return "snack";
    if (lower.includes("brasserie")) return "brasserie";
    if (lower.includes("/bar") || html.match(/class=["'][^"']*bar[^"']*["']/i)) return "bar";
    if (lower.includes("/cafe") || lower.includes("café") || lower.includes("coffee")) return "cafe";
    if (lower.includes("/restaurant") || lower.includes("gastronomie")) return "restaurant";

    return undefined;
  }

  /**
   * Génère un ID externe depuis l'URL
   */
  private generateExternalId(url: string): string {
    try {
      const path = new URL(url).pathname;
      return path.replace(/^\//, "").replace(/\/$/, "").replace(/\//g, "_");
    } catch {
      return url.replace(/[^a-z0-9]/gi, "_");
    }
  }
}

// ============================================
// EXPORT ET ENREGISTREMENT
// ============================================

export function createSortirAuMarocConnector(
  config?: Partial<ConnectorConfig>
): SortirAuMarocConnector {
  const connector = new SortirAuMarocConnector(config);
  registerConnector(connector);
  return connector;
}
