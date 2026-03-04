/**
 * Device Fingerprinting — lightweight browser fingerprint for anti-fraud.
 *
 * Generates a SHA-256 hash of browser properties (screen, GPU, canvas,
 * audio, timezone, fonts). Cached in localStorage to avoid re-computation.
 *
 * In production, consider @fingerprintjs/fingerprintjs-pro for 99.5% accuracy.
 * This lightweight implementation covers the main vectors.
 */

const STORAGE_KEY = "sam_device_fp";

/**
 * Get or generate a device fingerprint.
 * Returns a hex-encoded SHA-256 hash (64 chars) or a fallback hash.
 */
export async function generateDeviceFingerprint(): Promise<string> {
  // Check cache first
  try {
    const cached = localStorage.getItem(STORAGE_KEY);
    if (cached && cached.length >= 16) return cached;
  } catch {
    /* localStorage may not be available */
  }

  const fp = await computeFingerprint();

  // Cache the result
  try {
    localStorage.setItem(STORAGE_KEY, fp);
  } catch {
    /* silent */
  }

  return fp;
}

/**
 * Get the short device ID (first 8 chars uppercase) for display purposes.
 */
export function getShortDeviceId(fingerprint: string): string {
  return fingerprint.slice(0, 8).toUpperCase();
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

async function computeFingerprint(): Promise<string> {
  const components: string[] = [];

  // Screen
  components.push(
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
  );
  components.push(`${screen.availWidth}x${screen.availHeight}`);
  components.push(`dpr:${window.devicePixelRatio}`);

  // Timezone & locale
  try {
    components.push(
      Intl.DateTimeFormat().resolvedOptions().timeZone,
    );
  } catch {
    components.push("tz:unknown");
  }
  components.push(navigator.language);
  components.push(new Date().getTimezoneOffset().toString());

  // Platform & hardware
  components.push(navigator.platform || "unknown");
  components.push(navigator.hardwareConcurrency?.toString() || "?");
  components.push(navigator.maxTouchPoints?.toString() || "0");

  // WebGL renderer (GPU fingerprint)
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl");
    if (gl && gl instanceof WebGLRenderingContext) {
      const dbg = gl.getExtension("WEBGL_debug_renderer_info");
      if (dbg) {
        components.push(
          gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) as string,
        );
        components.push(
          gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) as string,
        );
      }
    }
  } catch {
    /* silent */
  }

  // Canvas fingerprint (subtle rendering differences per device)
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 200;
    canvas.height = 50;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.textBaseline = "top";
      ctx.font = "14px Arial";
      ctx.fillStyle = "#a3001d";
      ctx.fillText("Sam.ma 2026", 2, 2);
      ctx.fillStyle = "rgba(251,191,36,0.7)";
      ctx.fillRect(50, 10, 80, 20);
      components.push(canvas.toDataURL().slice(-50));
    }
  } catch {
    /* silent */
  }

  // AudioContext fingerprint
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    if (AudioCtx) {
      const audioCtx = new AudioCtx();
      components.push(`sr:${audioCtx.sampleRate}`);
      audioCtx.close();
    }
  } catch {
    /* silent */
  }

  // Installed plugins (legacy but still useful)
  try {
    if (navigator.plugins) {
      const pluginList = Array.from(navigator.plugins)
        .map((p) => p.name)
        .sort()
        .join(",");
      components.push(pluginList.slice(0, 100));
    }
  } catch {
    /* silent */
  }

  // Font detection (check for common installed fonts)
  try {
    const testFonts = [
      "Arial",
      "Courier New",
      "Georgia",
      "Tahoma",
      "Verdana",
      "Impact",
      "Comic Sans MS",
      "Trebuchet MS",
    ];
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const detected = testFonts.filter((font) => {
        ctx.font = `16px "${font}"`;
        const w1 = ctx.measureText("mmmmmmmmmmlli").width;
        ctx.font = "16px monospace";
        const w2 = ctx.measureText("mmmmmmmmmmlli").width;
        return w1 !== w2;
      });
      components.push(`fonts:${detected.join(",")}`);
    }
  } catch {
    /* silent */
  }

  // Hash all components
  const raw = components.join("|");
  const encoder = new TextEncoder();
  const data = encoder.encode(raw);

  // Use SubtleCrypto for SHA-256 hash
  try {
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    // Fallback: simple DJB2 hash
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      const char = raw.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return `fb_${Math.abs(hash).toString(36)}`;
  }
}
