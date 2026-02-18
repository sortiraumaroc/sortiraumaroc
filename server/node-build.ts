import { createRequire } from "module";
import path from "path";
import { createServer } from "./index";
import * as express from "express";
import { fileURLToPath } from "url";
import { existsSync, statSync } from "fs";
import { purgeOldAuditLogs } from "./routes/admin";
import { prerenderMiddleware } from "./prerender";

// Polyfill: make `require` available globally for ESM bundles.
// Libraries like @sentry/node (via OpenTelemetry) use `require.cache`
// which is not available in ESM context. This shim fixes:
// "ReferenceError: require is not defined" in ExportsCache.has
if (typeof globalThis.require === "undefined") {
  const __req_filename = fileURLToPath(import.meta.url);
  (globalThis as any).require = createRequire(__req_filename);
}

const app = createServer();
// Sur Plesk, le port peut être géré automatiquement ou via variable d'environnement
// Vérifier les variables d'environnement Plesk communes
const port = process.env.PORT || process.env.PLESK_NODE_PORT || process.env.APP_PORT || 3000;

console.log(`🔧 Configuration serveur :`);
console.log(`   - Port: ${port}`);
console.log(`   - NODE_ENV: ${process.env.NODE_ENV || "non défini"}`);
console.log(`   - Working directory: ${process.cwd()}`);

// Ajouter des logs pour déboguer les requêtes API
// IMPORTANT : Doit être AVANT toutes les routes pour capturer toutes les requêtes
app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (req.path.startsWith("/api/")) {
    console.log(`[API Request] ${req.method} ${req.path}`);
    console.log(`[API Headers]`, {
      origin: req.headers.origin,
      "user-agent": req.headers["user-agent"]?.substring(0, 50),
      "content-type": req.headers["content-type"],
      host: req.headers.host,
    });
  }
  next();
});

// In production, serve the built SPA files
// Utiliser fileURLToPath pour obtenir le __dirname correct en ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Essayer plusieurs chemins possibles pour trouver dist/spa
const possiblePaths = [
  path.join(__dirname, "../spa"), // Depuis dist/server/
  path.join(process.cwd(), "dist/spa"), // Depuis la racine du projet
  path.join(process.cwd(), "spa"), // Alternative
];

let distPath = possiblePaths.find((p) => existsSync(p));

if (!distPath) {
  console.error("❌ Erreur : Impossible de trouver le répertoire dist/spa");
  console.error("Chemins testés :", possiblePaths);
  console.error("Répertoire courant :", process.cwd());
  console.error("__dirname :", __dirname);
  process.exit(1);
}

console.log(`✅ Servir les fichiers statiques depuis : ${distPath}`);

// Ajouter des logs pour déboguer les requêtes API
// IMPORTANT : Doit être AVANT toutes les routes pour capturer toutes les requêtes
app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (req.path.startsWith("/api/")) {
    console.log(`[API Request] ${req.method} ${req.path}`);
  }
  next();
});

// Coming-soon page removed — site is officially launched

// Bot pre-rendering: serve fully-rendered HTML to crawlers (ChatGPT, Google, Bing, etc.)
// Must be BEFORE static file middleware so bot requests are intercepted first.
// Falls back gracefully if Puppeteer is not installed.
app.use(prerenderMiddleware);

// Middleware personnalisé pour servir les fichiers statiques avec les bons types MIME
app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
  // Ne traiter que les requêtes GET pour les fichiers statiques
  if (req.method !== "GET" && req.method !== "HEAD") {
    return next();
  }

  // Ignorer les routes API
  if (req.path.startsWith("/api/")) {
    return next();
  }

  // Construire le chemin complet du fichier
  const filePath = path.join(distPath, req.path === "/" ? "index.html" : req.path);

  // Vérifier si le fichier existe et est un fichier (pas un répertoire)
  if (existsSync(filePath)) {
    try {
      const stats = statSync(filePath);
      if (stats.isFile()) {
        // Définir le type MIME correct
        if (filePath.endsWith(".js") || filePath.endsWith(".mjs")) {
          res.setHeader("Content-Type", "application/javascript; charset=utf-8");
        } else if (filePath.endsWith(".css")) {
          res.setHeader("Content-Type", "text/css; charset=utf-8");
        } else if (filePath.endsWith(".json")) {
          res.setHeader("Content-Type", "application/json; charset=utf-8");
        }

        // Headers de cache
        if (filePath.endsWith("index.html")) {
          res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
          res.setHeader("Pragma", "no-cache");
          res.setHeader("Expires", "0");
        } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }

        // Servir le fichier
        return res.sendFile(filePath);
      }
    } catch (error) {
      // En cas d'erreur, continuer au middleware suivant
      return next();
    }
  }

  // Si le fichier n'existe pas, vérifier si c'est un asset
  // Si c'est un asset manquant, retourner 404 au lieu de passer à la route catch-all
  if (
    req.path.startsWith("/assets/") ||
    req.path.match(/\.(js|css|mjs|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|json)$/i)
  ) {
    return res.status(404).send("File not found");
  }

  // Pour les autres routes, continuer au middleware suivant (route catch-all pour SPA)
  next();
});

// Serve static files avec express.static comme fallback (au cas où)
// Mais notre middleware personnalisé ci-dessus devrait gérer la plupart des cas
app.use(
  express.static(distPath, {
    setHeaders(res, filePath) {
      // Définir le type MIME correct pour les fichiers JavaScript
      if (filePath.endsWith(".js") || filePath.endsWith(".mjs")) {
        res.setHeader("Content-Type", "application/javascript; charset=utf-8");
      } else if (filePath.endsWith(".css")) {
        res.setHeader("Content-Type", "text/css; charset=utf-8");
      }

      if (filePath.endsWith(`${path.sep}index.html`)) {
        res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
        return;
      }

      if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }
    },
  }),
);

// Handle React Router - serve index.html for browser navigations.
// Important: do NOT serve index.html for asset/module requests (otherwise missing chunks
// get a 200 HTML response and the browser throws: "Failed to fetch dynamically imported module").
// Express 5 (path-to-regexp v8) doesn't accept "*" as a route pattern.
app.get(/.*/, (req, res) => {
  // Ne jamais intercepter les routes API
  if (req.path.startsWith("/api/") || req.path.startsWith("/health")) {
    return res.status(404).json({ error: "API endpoint not found" });
  }

  // Ne jamais intercepter les assets (fichiers statiques)
  // express.static devrait les avoir déjà servis, mais on ajoute une protection
  if (
    req.path.startsWith("/assets/") ||
    req.path.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|json)$/i)
  ) {
    // Si on arrive ici, c'est que le fichier n'existe pas (express.static aurait dû le servir)
    return res.status(404).end();
  }

  // Only treat requests that explicitly accept HTML as SPA navigations.
  const accept = String(req.headers.accept ?? "");
  const acceptsHtml = accept.includes("text/html");

  // Si la requête a une extension de fichier, ce n'est probablement pas une navigation SPA
  const hasExtension = path.extname(req.path) !== "";

  if (!acceptsHtml || hasExtension) {
    return res.status(404).end();
  }

  // Servir index.html pour les navigations React Router
  const indexPath = path.join(distPath, "index.html");
  if (existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }

  console.error(`❌ index.html introuvable dans ${distPath}`);
  return res.status(500).send("Internal Server Error: index.html not found");
});

app.listen(port, () => {
  console.log(`🚀 Fusion Starter server running on port ${port}`);
  console.log(`📱 Frontend: http://localhost:${port}`);
  console.log(`🔧 API: http://localhost:${port}/api`);
  console.log(`✅ Routes API configurées : /api/ping, /api/public/*, /api/consumer/*, /api/pro/*, /api/admin/*`);
  console.log(`✅ Route payment: POST /api/payments/lacaissepay/session`);
  console.log(`✅ Route webhook: POST /api/payments/webhook`);
  console.log(`✅ Toutes les routes sont enregistrées dans createServer()`);

  // Auto-purge audit logs older than 30 days on startup + every 24h
  purgeOldAuditLogs().catch((err) =>
    console.error("[AuditLogCleanup] Startup purge failed:", err)
  );
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
  setInterval(() => {
    purgeOldAuditLogs().catch((err) =>
      console.error("[AuditLogCleanup] Scheduled purge failed:", err)
    );
  }, TWENTY_FOUR_HOURS);
});


// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("🛑 Received SIGTERM, shutting down gracefully");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("🛑 Received SIGINT, shutting down gracefully");
  process.exit(0);
});
