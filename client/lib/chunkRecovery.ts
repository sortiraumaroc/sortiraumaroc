function messageFromUnknown(reason: unknown): string {
  if (reason instanceof Error) return reason.message || reason.toString();
  if (typeof reason === "string") return reason;
  try {
    return JSON.stringify(reason);
  } catch {
    return String(reason);
  }
}

function shouldReloadForMessage(message: string): boolean {
  const m = message.toLowerCase();

  // Vite / native ESM
  if (m.includes("failed to fetch dynamically imported module")) return true;
  if (m.includes("error loading dynamically imported module")) return true;
  if (m.includes("importing a module script failed")) return true;

  // Common chunk load errors
  if (m.includes("chunkloaderror")) return true;
  if (m.includes("loading chunk")) return true;

  return false;
}

function reloadOnce(reason: string): void {
  if (typeof window === "undefined") return;

  const key = "__sam_chunk_reload_once_v1";
  try {
    if (window.sessionStorage.getItem(key) === "1") return;
    window.sessionStorage.setItem(key, "1");
  } catch {
    // If sessionStorage is blocked, still attempt a reload but avoid loops via a
    // global flag.
    const w = window as any;
    if (w.__sam_chunk_reload_once) return;
    w.__sam_chunk_reload_once = true;
  }

  // Avoid polluting the URL; just hard reload the current location.
  // This fixes stale index.html -> stale chunk graphs after deploys.
  // eslint-disable-next-line no-console
  console.warn(`[sam] Reloading page after module/chunk load failure (${reason})`);
  window.location.reload();
}

/**
 * Installs a global safety net for when a browser has a stale HTML/asset graph after a deploy.
 *
 * Symptoms:
 * - "Failed to fetch dynamically imported module ..."
 * - "ChunkLoadError"
 *
 * In those cases, a one-time reload typically fixes the app.
 */
export function installChunkLoadRecovery(): void {
  if (typeof window === "undefined") return;

  window.addEventListener("unhandledrejection", (event) => {
    const msg = messageFromUnknown((event as PromiseRejectionEvent).reason);
    if (!shouldReloadForMessage(msg)) return;
    reloadOnce("unhandledrejection");
  });

  window.addEventListener("error", (event) => {
    const msg = messageFromUnknown((event as ErrorEvent).error ?? (event as ErrorEvent).message);
    if (!shouldReloadForMessage(msg)) return;
    reloadOnce("error");
  });
}
