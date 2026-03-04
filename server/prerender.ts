/**
 * Bot pre-rendering middleware for SEO.
 *
 * Detects known crawlers (Googlebot, OAI-SearchBot, GPTBot, Bingbot, etc.)
 * and serves them a fully-rendered HTML snapshot via Puppeteer so they
 * can index the SPA content (meta tags, JSON-LD, text).
 *
 * Non-bot requests pass through untouched.
 *
 * The module lazily launches a single Chromium instance on first bot visit
 * and keeps an LRU cache (max 500 entries, TTL 1 hour) so repeat crawls
 * are served instantly from memory.
 */

import type { Request, Response, NextFunction } from "express";
import { createModuleLogger } from "./lib/logger";

const log = createModuleLogger("prerender");

// ── Bot detection ──────────────────────────────────────────────────────

const BOT_USER_AGENTS = [
  "googlebot",
  "bingbot",
  "slurp", // Yahoo
  "duckduckbot",
  "baiduspider",
  "yandexbot",
  "facebookexternalhit",
  "twitterbot",
  "linkedinbot",
  "whatsapp",
  "telegrambot",
  // AI crawlers
  "oai-searchbot",
  "gptbot",
  "chatgpt-user",
  "anthropic-ai",
  "claudebot",
  "perplexitybot",
  "cohere-ai",
  "bytespider",
  "applebot", // Apple Intelligence / Siri
];

function isBot(userAgent: string): boolean {
  const ua = userAgent.toLowerCase();
  return BOT_USER_AGENTS.some((bot) => ua.includes(bot));
}

// ── LRU Cache ──────────────────────────────────────────────────────────

interface CacheEntry {
  html: string;
  createdAt: number;
}

const CACHE_MAX = 500;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

const cache = new Map<string, CacheEntry>();

function getCached(url: string): string | null {
  const entry = cache.get(url);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > CACHE_TTL_MS) {
    cache.delete(url);
    return null;
  }
  return entry.html;
}

function setCached(url: string, html: string): void {
  // Evict oldest if at capacity
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(url, { html, createdAt: Date.now() });
}

// ── Puppeteer (lazy) ───────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let browserPromise: Promise<any> | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getBrowser(): Promise<any> {
  if (!browserPromise) {
    browserPromise = (async () => {
      try {
        // Dynamic import — puppeteer is optional. If not installed, the middleware
        // gracefully falls back to serving the standard SPA shell.
        const moduleName = "puppeteer";
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const puppeteer: any = await import(moduleName);
        const browser = await puppeteer.default.launch({
          headless: true,
          args: [
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--disable-extensions",
            "--disable-background-networking",
            "--disable-sync",
            "--metrics-recording-only",
            "--no-first-run",
          ],
        });
        log.info("Chromium launched for bot rendering");
        return browser;
      } catch (err) {
        browserPromise = null; // allow retry on next request
        throw err;
      }
    })();
  }
  return browserPromise;
}

async function renderPage(url: string): Promise<string> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    // Block heavy resources bots don't need
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const type = req.resourceType();
      if (["image", "stylesheet", "font", "media"].includes(type)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // Set a reasonable viewport
    await page.setViewport({ width: 1280, height: 800 });

    // Navigate and wait for the SPA to settle
    await page.goto(url, {
      waitUntil: "networkidle0",
      timeout: 8000,
    });

    // Wait a bit more for React to finish rendering
    await page.waitForFunction(
      () => {
        // Check that we have meaningful content (not just the shell)
        const title = document.title;
        const hasJsonLd = document.querySelector('script[type="application/ld+json"]');
        return (title && title !== "Sortir Au Maroc" && title.length > 5) || hasJsonLd;
      },
      { timeout: 3000 },
    ).catch(() => {
      // Timeout is OK — we'll return whatever we have
    });

    const html = await page.content();
    return html;
  } finally {
    await page.close();
  }
}

// ── Express middleware ──────────────────────────────────────────────────

let puppeteerAvailable: boolean | null = null;

export function prerenderMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Only intercept GET requests for HTML pages (not API, assets, etc.)
  if (req.method !== "GET" && req.method !== "HEAD") {
    return next();
  }

  // Skip API routes, static assets, and known file extensions
  if (
    req.path.startsWith("/api/") ||
    req.path.startsWith("/assets/") ||
    req.path === "/sitemap.xml" ||
    req.path === "/robots.txt" ||
    req.path === "/llms.txt" ||
    /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|json|xml|txt|map)$/i.test(req.path)
  ) {
    return next();
  }

  const userAgent = String(req.headers["user-agent"] ?? "");
  if (!isBot(userAgent)) {
    return next();
  }

  // Check if puppeteer is available (only check once)
  if (puppeteerAvailable === false) {
    return next();
  }

  // Build the full URL for Puppeteer to visit
  const protocol = req.headers["x-forwarded-proto"] || req.protocol || "http";
  const host = req.headers.host || "localhost:3000";
  const fullUrl = `${protocol}://${host}${req.originalUrl}`;

  // Check cache first
  const cached = getCached(req.originalUrl);
  if (cached) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("X-Prerendered", "cache");
    res.send(cached);
    return;
  }

  // Render the page asynchronously
  renderPage(fullUrl)
    .then((html) => {
      puppeteerAvailable = true;
      setCached(req.originalUrl, html);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("X-Prerendered", "fresh");
      res.send(html);
    })
    .catch((err) => {
      // If puppeteer fails (not installed), fall through to normal SPA serving
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("Cannot find package") || msg.includes("ERR_MODULE_NOT_FOUND") || msg.includes("Could not find Chromium")) {
        log.warn("Puppeteer not available — bot pre-rendering disabled. Install with: pnpm add puppeteer");
        puppeteerAvailable = false;
      } else {
        log.error({ err: msg }, "Render error");
      }
      next();
    });
}
