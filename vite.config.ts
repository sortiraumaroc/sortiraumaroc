import { defineConfig, Plugin, PluginOption } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";

// Optional bundle analyzer: enabled via `ANALYZE=true pnpm run build` (or your CI env)
// Note: rollup-plugin-visualizer is optional and only needed for bundle analysis.
const analyze = String(process.env.ANALYZE ?? "").toLowerCase() === "true";

// Diagnostic switch: when NO_WRITE=true we ask Rollup/Vite to build without writing
// to disk. This helps determine if failures happen during the output/write phase.
const noWrite = String(process.env.NO_WRITE ?? "").toLowerCase() === "true";

let visualizer: null | ((opts: Record<string, unknown>) => PluginOption) = null;
if (analyze) {
  try {
    const mod = await import("rollup-plugin-visualizer");
    visualizer = (mod as any).visualizer as (opts: Record<string, unknown>) => PluginOption;
  } catch {
    console.warn("rollup-plugin-visualizer not installed - skipping bundle analysis.");
  }
}

const isVitest = String(process.env.VITEST ?? "") !== "";

const plugins: PluginOption[] = [
  react(),
  // PWA (vite-plugin-pwa) has been removed — it caused "Vous êtes hors ligne"
  // offline pages and stale cache issues after deployments. The site works fine
  // as a regular SPA. Firebase push notifications remain via firebase-messaging-sw.js.

  // Strip `crossorigin` from Vite-generated <script> and <link rel="stylesheet"> tags.
  // Vite adds `crossorigin` by default for ES module scripts which forces CORS mode
  // on all dynamic imports. On our Plesk/Nginx setup the server doesn't serve CORS
  // headers for same-origin static files, causing "Failed to fetch dynamically
  // imported module" errors and a white page in production.
  // NOTE: We preserve `crossorigin` on <link rel="preconnect"> (needed for Google Fonts).
  {
    name: "remove-crossorigin",
    enforce: "post" as const,
    transformIndexHtml(html: string) {
      return html.replace(
        /(<(?:script|link)\b[^>]*?)(\s+crossorigin)([^>]*>)/gi,
        (match, before: string, _co: string, after: string) => {
          // Keep crossorigin on preconnect links (Google Fonts etc.)
          if (before.includes('rel="preconnect"')) return match;
          return before + after;
        },
      );
    },
  },
];

// Vitest uses Vite's dev server internally; mounting the Express middleware during tests
// can trigger SSR module runner transport errors after the suite completes.
if (!isVitest) plugins.push(expressPlugin());

// Inject Firebase env vars into the service worker (public/firebase-messaging-sw.js).
// The SW can't use import.meta.env so we replace __PLACEHOLDER__ tokens at serve/build time.
plugins.push(firebaseSwPlugin());

if (analyze && visualizer) {
  plugins.push(
    visualizer({
      filename: "dist/spa/stats.html",
      open: false,
      gzipSize: true,
      brotliSize: true,
      template: "treemap",
    })
  );
}

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      // Permet au HMR de fonctionner depuis un mobile sur le réseau local
      host: "192.168.1.11",
    },
    fs: {
      allow: [".", "./client", "./shared", "./server", "./node_modules"],
      deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**"],
    },
  },
  build: {
    outDir: "dist/spa",
    sourcemap: false,
    reportCompressedSize: false,
    cssCodeSplit: true,
    write: !noWrite,
    minify: "esbuild",
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      // Rollup can be quite aggressive with parallel filesystem work during "rendering chunks".
      // Limiting it helps stability on constrained CI runners.
      maxParallelFileOps: 4,
      // NOTE: manualChunks was removed because it caused ESM initialisation-order
      // issues (e.g. "Cannot access 'X' before initialization", "Cannot read
      // properties of undefined (reading 'useLayoutEffect')"). Vite's default
      // automatic code-splitting handles circular dependencies correctly.
    },
  },
  plugins,
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      "@": path.resolve(__dirname, "./client"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
  optimizeDeps: {
    include: ["react", "react-dom"],
    force: false,
  },
});

// ---------------------------------------------------------------------------
// Firebase Service Worker Config Injection
// ---------------------------------------------------------------------------
// The service worker (public/firebase-messaging-sw.js) can't use import.meta.env.
// This plugin replaces __FIREBASE_*__ placeholders with actual env var values
// during both dev serve and production build.

function firebaseSwPlugin(): Plugin {
  // Read Firebase env vars from .env (Vite doesn't expose them in process.env)
  const firebaseEnv: Record<string, string> = {};
  try {
    const envContent = fs.readFileSync(path.resolve(__dirname, ".env"), "utf-8");
    for (const line of envContent.split("\n")) {
      const match = line.match(/^(VITE_FIREBASE_\w+)\s*=\s*"?([^"\r\n]*)"?/);
      if (match) firebaseEnv[match[1]] = match[2];
    }
  } catch {
    // .env not found — placeholders will resolve to empty strings
  }

  function injectConfig(content: string): string {
    return content
      .replace(/__FIREBASE_API_KEY__/g, firebaseEnv.VITE_FIREBASE_API_KEY || "")
      .replace(/__FIREBASE_AUTH_DOMAIN__/g, firebaseEnv.VITE_FIREBASE_AUTH_DOMAIN || "")
      .replace(/__FIREBASE_PROJECT_ID__/g, firebaseEnv.VITE_FIREBASE_PROJECT_ID || "")
      .replace(/__FIREBASE_STORAGE_BUCKET__/g, firebaseEnv.VITE_FIREBASE_STORAGE_BUCKET || "")
      .replace(/__FIREBASE_MESSAGING_SENDER_ID__/g, firebaseEnv.VITE_FIREBASE_MESSAGING_SENDER_ID || "")
      .replace(/__FIREBASE_APP_ID__/g, firebaseEnv.VITE_FIREBASE_APP_ID || "");
  }

  return {
    name: "firebase-sw-config",

    // DEV: intercept /firebase-messaging-sw.js before Vite's static file server
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === "/firebase-messaging-sw.js") {
          const swPath = path.resolve(__dirname, "public/firebase-messaging-sw.js");
          try {
            let content = fs.readFileSync(swPath, "utf-8");
            content = injectConfig(content);
            res.setHeader("Content-Type", "application/javascript");
            res.setHeader("Service-Worker-Allowed", "/");
            res.end(content);
          } catch {
            next();
          }
          return;
        }
        next();
      });
    },

    // BUILD: post-process the SW file copied to dist/spa/
    closeBundle() {
      const swPath = path.resolve(__dirname, "dist/spa/firebase-messaging-sw.js");
      try {
        if (fs.existsSync(swPath)) {
          let content = fs.readFileSync(swPath, "utf-8");
          content = injectConfig(content);
          fs.writeFileSync(swPath, content);
          console.log("[firebase-sw-config] Injected Firebase config into SW");
        }
      } catch {
        // Non-blocking — SW will work without background message handling
      }
    },
  };
}

function expressPlugin(): Plugin {
  return {
    name: "express-plugin",
    apply: "serve", // Only apply during development (serve mode)
    configureServer(server) {
      console.log("[dev] Mounting API server middleware...");

      // Load the server (TypeScript) through Vite's SSR module loader.
      // This avoids Node ESM trying to import a TS file/directory directly (which would fail)
      // and prevents client builds from pulling in server code.
      void server
        .ssrLoadModule("/server/index.ts")
        .then((mod: any) => {
          const createServer = mod?.createServer as undefined | (() => any);
          if (!createServer) throw new Error("createServer export not found in /server/index.ts");
          const app = createServer();

          // Important: Vite has an HTML fallback middleware that would otherwise catch `/api/*`
          // and return `index.html` (causing confusing HTTP 404/HTML responses in the admin login).
          // We insert our API handler at the beginning of the connect stack and scope it to `/api`.
          const apiMiddleware = (req: any, res: any, next: any) => {
            const url = String(req?.url ?? "");
            if (url.startsWith("/api/")) return (app as any)(req, res, next);
            if (url === "/favicon.ico") return (app as any)(req, res, next);
            return next();
          };

          (server.middlewares as any).stack?.unshift({ route: "", handle: apiMiddleware });
          console.log("[dev] API server mounted.");
        })
        .catch((err) => {
          console.error("[dev] Failed to mount API server in dev:", err);
        });
    },
  };
}
