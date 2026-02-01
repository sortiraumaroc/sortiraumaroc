import { defineConfig, Plugin, PluginOption } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

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

const plugins: PluginOption[] = [react()];

// Vitest uses Vite's dev server internally; mounting the Express middleware during tests
// can trigger SSR module runner transport errors after the suite completes.
if (!isVitest) plugins.push(expressPlugin());

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
    rollupOptions: {
      // Rollup can be quite aggressive with parallel filesystem work during "rendering chunks".
      // Limiting it helps stability on constrained CI runners.
      maxParallelFileOps: 4,
      output: {
        manualChunks(id) {
          // Keep chunking extremely simple for reliability in constrained CI environments.
          // Aggressive splitting can dramatically increase Rollup work during the
          // "rendering chunks" phase and has been observed to fail silently here.
          if (id.includes("node_modules")) return "vendor";
        },
      },
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
