/**
 * Made In City Scraper - SAM Import CHR
 *
 * Scrape les établissements depuis madein.city
 * Structure: /{ville}/fr/{categorie}/ et pages d'articles
 * Focus sur Marrakech (autres villes: Paris, Bruxelles, Istanbul, Barcelone)
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

const BASE_URL = "https://madein.city";

// Mapping catégorie CHR -> paths sur le site
const CATEGORY_PATHS: Record<string, string[]> = {
  restaurant: ["/restaurants"],
  cafe: ["/cafes"],
  bar: ["/bars-nightlife", "/bars"],
  rooftop: ["/bars-nightlife"], // Filtrer par contenu
  lounge: ["/bars-nightlife"],
  club: ["/bars-nightlife"],
};

// Villes disponibles sur Made In City (focus Maroc = Marrakech uniquement)
const SUPPORTED_CITIES: Record<string, string> = {
  marrakech: "marrakech",
};

// ============================================
// HELPERS
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

export class MadeInCityConnector extends BaseConnector {
  readonly source = "madeincity" as const;

  constructor(config: Partial<ConnectorConfig> = {}) {
    super({
      rateLimitPerSecond: 0.5, // Respectueux du serveur
      respectRobots: true,
      userAgent: "SAM-Import-Bot/1.0 (+https://sam.ma/bot)",
      ...config,
    });
    this.initRateLimiter();
  }

  async search(params: SearchParams): Promise<ConnectorResult> {
    const startTime = Date.now();
    const { city, category, keywords, limit = 50 } = params;

    // Vérifier si la ville est supportée
    const citySlug = SUPPORTED_CITIES[city.toLowerCase()];
    if (!citySlug) {
      this.logInfo(`City ${city} not supported by Made In City (only Marrakech)`);
      return this.createSuccessResult(BASE_URL, [], Date.now() - startTime, 200);
    }

    const allPlaces: RawPlace[] = [];
    const seenUrls = new Set<string>();

    try {
      // Déterminer les paths à scraper
      const paths = category
        ? CATEGORY_PATHS[category] || [`/${category}`]
        : Object.values(CATEGORY_PATHS).flat();

      // Dédupliquer les paths
      const uniquePaths = [...new Set(paths)];

      for (const path of uniquePaths) {
        if (allPlaces.length >= limit) break;

        const listUrl = `${BASE_URL}/${citySlug}/fr${path}/`;
        this.logInfo(`Fetching: ${listUrl}`);

        try {
          const listHtml = await this.fetchPage(listUrl);
          if (!listHtml) continue;

          // Extraire les liens vers les articles
          const articleLinks = this.extractArticleLinks(listHtml, citySlug);
          this.logInfo(`Found ${articleLinks.length} articles on ${path}`);

          for (const link of articleLinks) {
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
              const place = await this.scrapeArticlePage(fullUrl, city, category);
              if (place) {
                allPlaces.push(place);
                this.logInfo(`Scraped: ${place.name}`);
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

      this.logInfo(`Scraped ${allPlaces.length} places from Made In City for ${city}`);

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
      return await this.scrapeArticlePage(url);
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
   * Extrait les liens vers les articles depuis une page de liste
   */
  private extractArticleLinks(html: string, citySlug: string): string[] {
    const links: string[] = [];

    // Pattern pour les liens d'articles Made In City
    // Structure: /{ville}/fr/{...}/article-slug/
    const patterns = [
      // Liens relatifs
      new RegExp(`<a[^>]+href=["'](/${citySlug}/fr/[^"']+/)["']`, "gi"),
      // Liens absolus
      new RegExp(`<a[^>]+href=["'](https?://(?:www\\.)?madein\\.city/${citySlug}/fr/[^"']+/)["']`, "gi"),
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

        // Filtrer les liens de navigation
        if (
          href &&
          !href.endsWith("/fr/") &&
          !links.includes(href) &&
          !href.includes("/stories/") && // Skip les stories éditoriales
          href.split("/").filter(Boolean).length >= 4 // Ex: /marrakech/fr/restaurants/nom-resto/
        ) {
          links.push(href);
        }
      }
    }

    return links;
  }

  /**
   * Scrape une page d'article (fiche établissement)
   */
  private async scrapeArticlePage(
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
    const city = this.extractCityFromUrl(url) || defaultCity;
    const category = defaultCategory || this.guessCategoryFromUrl(url);

    return {
      source: "madeincity",
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
          .replace(/\s*[-|–]\s*Made\s*In\s*City.*/i, "")
          .replace(/\s*[-|–]\s*madein\.city.*/i, "")
          .replace(/\s*,\s*Marrakech.*/i, "")
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
      // Numéro marocain
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
      /<a[^>]+href=["'](https?:\/\/(?!(?:www\.)?(?:facebook|instagram|twitter|tiktok|youtube|wa\.me|madein\.city))[^"']+)["'][^>]*>[\s\S]*?(?:site\s*web|website|visiter)/i,
      // Schema.org url
      /<[^>]+itemprop=["']url["'][^>]+href=["'](https?:\/\/(?!.*madein\.city)[^"']+)["']/i,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1] && !match[1].includes("madein.city")) {
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
      // Images principales
      /<img[^>]+src=["']([^"']+)["'][^>]*class=["'][^"']*(?:featured|main|hero|cover)[^"']*["']/gi,
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
              credit: "madein.city",
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

    const pattern = /<a[^>]+href=["'](https?:\/\/(?:www\.)?(?:facebook\.com|instagram\.com|twitter\.com|tiktok\.com)\/[^"']+)["']/gi;
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
      /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i,
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
      /"latitude":\s*["']?(-?\d+\.?\d*)["']?,?\s*"longitude":\s*["']?(-?\d+\.?\d*)["']?/,
      /google\.com\/maps[^"']*[@/](-?\d+\.?\d*),(-?\d+\.?\d*)/,
      /data-lat=["'](-?\d+\.?\d*)["'][^>]*data-lng=["'](-?\d+\.?\d*)["']/,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1] && match?.[2]) {
        const lat = parseFloat(match[1]);
        const lng = parseFloat(match[2]);
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

    const keywordsMatch = html.match(/<meta[^>]+name=["']keywords["'][^>]+content=["']([^"']+)["']/i);
    if (keywordsMatch?.[1]) {
      tags.push(...keywordsMatch[1].split(",").map((t) => t.trim().toLowerCase()).filter(t => t.length > 2));
    }

    return [...new Set(tags)].slice(0, 15);
  }

  /**
   * Extrait la ville depuis l'URL
   */
  private extractCityFromUrl(url: string): string | undefined {
    const match = url.match(/madein\.city\/([^/]+)\/fr/);
    if (match?.[1]) {
      return match[1].toLowerCase();
    }
    return undefined;
  }

  /**
   * Devine la catégorie depuis l'URL
   */
  private guessCategoryFromUrl(url: string): string | undefined {
    const lower = url.toLowerCase();
    if (lower.includes("/bars-nightlife") || lower.includes("/bars")) {
      if (lower.includes("club") || lower.includes("night")) return "club";
      return "bar";
    }
    if (lower.includes("/cafes")) return "cafe";
    if (lower.includes("/restaurants")) return "restaurant";
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

export function createMadeInCityConnector(
  config?: Partial<ConnectorConfig>
): MadeInCityConnector {
  const connector = new MadeInCityConnector(config);
  registerConnector(connector);
  return connector;
}
