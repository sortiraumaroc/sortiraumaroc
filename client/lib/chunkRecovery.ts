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

/** Max number of automatic reload attempts before giving up. */
const MAX_RETRIES = 2;

/** Delay (ms) before reloading — gives the server time to recover from a 503. */
const RELOAD_DELAY_MS = 2_000;

function reloadOnce(reason: string): void {
  if (typeof window === "undefined") return;

  const key = "__sam_chunk_reload_count_v2";
  let attempts = 0;
  try {
    attempts = Number(window.sessionStorage.getItem(key) ?? "0") || 0;
    if (attempts >= MAX_RETRIES) return; // already retried enough
    window.sessionStorage.setItem(key, String(attempts + 1));
  } catch {
    // If sessionStorage is blocked, still attempt a reload but avoid loops via a
    // global flag.
    const w = window as any;
    if (w.__sam_chunk_reload_once) return;
    w.__sam_chunk_reload_once = true;
  }

  // eslint-disable-next-line no-console
  console.warn(
    `[sam] Reloading page in ${RELOAD_DELAY_MS}ms after module/chunk load failure (${reason}, attempt ${attempts + 1}/${MAX_RETRIES})`,
  );

  // Wait a short moment before reloading — on Plesk the Node.js backend can
  // temporarily return 503 after a hard refresh; a brief delay lets it recover.
  setTimeout(() => window.location.reload(), RELOAD_DELAY_MS);
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

  // Clear the retry counter once the page fully loads successfully.
  // This ensures future navigation/refreshes get fresh retry attempts.
  window.addEventListener("load", () => {
    try {
      window.sessionStorage.removeItem("__sam_chunk_reload_count_v2");
    } catch {
      /* ignore */
    }
  });

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
