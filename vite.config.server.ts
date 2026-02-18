import { defineConfig } from "vite";
import path from "path";

// Server build configuration
// NOTE: ssr.noExternal forces Vite to BUNDLE all npm packages into the output
// so we don't need node_modules on the production server (Plesk).
// Only Node.js built-ins + express/cors remain external (already installed on server).
export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, "server/node-build.ts"),
      name: "server",
      fileName: "production",
      formats: ["es"],
    },
    outDir: "dist/server",
    target: "node22",
    ssr: true,
    rollupOptions: {
      external: [
        // Node.js built-ins (bare + node: prefix)
        "fs",
        "fs/promises",
        "path",
        "url",
        "http",
        "https",
        "os",
        "crypto",
        "stream",
        "stream/promises",
        "util",
        "events",
        "buffer",
        "querystring",
        "child_process",
        "net",
        "tls",
        "dns",
        "zlib",
        "assert",
        "constants",
        "worker_threads",
        "perf_hooks",
        "async_hooks",
        "diagnostics_channel",
        "string_decoder",
        "readline",
        "tty",
        "node:fs",
        "node:fs/promises",
        "node:path",
        "node:url",
        "node:http",
        "node:https",
        "node:os",
        "node:crypto",
        "node:stream",
        "node:stream/promises",
        "node:util",
        "node:events",
        "node:buffer",
        "node:querystring",
        "node:child_process",
        "node:net",
        "node:tls",
        "node:dns",
        "node:zlib",
        "node:assert",
        "node:constants",
        "node:worker_threads",
        "node:perf_hooks",
        "node:async_hooks",
        "node:diagnostics_channel",
        "node:string_decoder",
        "node:readline",
        "node:tty",
        "module",
        "node:module",
        // External dependencies that are already installed on the server
        "express",
        "cors",
        // sharp has native binaries (.node files) that cannot be bundled
        "sharp",
      ],
      output: {
        format: "es",
        entryFileNames: "[name].mjs",
      },
    },
    minify: false, // Keep readable for debugging
    sourcemap: false,
  },
  ssr: {
    // Force Vite to bundle ALL npm packages (not externalize them).
    // This means the output node-build.mjs is self-contained and only needs
    // express + cors + Node.js builtins at runtime.
    noExternal: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./client"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
  define: {
    "process.env.NODE_ENV": '"production"',
  },
});
