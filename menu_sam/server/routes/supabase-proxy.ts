import { Router } from "express";

export const supabaseProxyRouter = Router();

function stripTrailingSlash(url: string): string {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function buildTargetUrl(baseUrl: string, originalUrl: string): string {
  // originalUrl is like: /api/supabase/auth/v1/token?grant_type=password
  const prefix = "/api/supabase";
  const base = stripTrailingSlash(baseUrl);
  const pathAndQuery = originalUrl.startsWith(prefix) ? originalUrl.slice(prefix.length) : originalUrl;
  return `${base}${pathAndQuery}`;
}

function isJsonContentType(value: unknown): boolean {
  return typeof value === "string" && value.toLowerCase().includes("application/json");
}

function isFormUrlEncodedContentType(value: unknown): boolean {
  return typeof value === "string" && value.toLowerCase().includes("application/x-www-form-urlencoded");
}

supabaseProxyRouter.all(/.*/, async (req, res) => {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  if (!supabaseUrl) {
    res.status(500).json({ error: "Supabase URL is not configured on the server." });
    return;
  }

  // Ensure we never use the service-role key for proxied traffic.
  // The proxy should behave like the browser client:
  //   - always send the publishable key as `apikey`
  //   - forward the end-user `Authorization: Bearer <jwt>` when present
  const publishableKey =
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_KEY;

  if (!publishableKey) {
    res.status(500).json({
      error:
        "Supabase publishable key is not configured on the server. Provide VITE_SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_ANON_KEY).",
    });
    return;
  }

  const targetUrl = buildTargetUrl(supabaseUrl, req.originalUrl);

  const headers = new Headers();

  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "undefined") continue;

    // Skip hop-by-hop headers.
    if (key.toLowerCase() === "host") continue;
    if (key.toLowerCase() === "connection") continue;
    if (key.toLowerCase() === "content-length") continue;

    // express can provide string[] for some headers
    headers.set(key, Array.isArray(value) ? value.join(",") : String(value));
  }

  // Force the publishable key for upstream auth.
  headers.set("apikey", publishableKey);
  if (!headers.has("authorization")) {
    headers.set("authorization", `Bearer ${publishableKey}`);
  }

  let body: any = undefined;
  const method = req.method.toUpperCase();

  if (method !== "GET" && method !== "HEAD") {
    const contentType = req.headers["content-type"];

    if (typeof req.body !== "undefined" && req.body !== null) {
      if (Buffer.isBuffer(req.body)) {
        body = req.body;
      } else if (typeof req.body === "string") {
        body = req.body;
      } else if (isJsonContentType(contentType)) {
        body = JSON.stringify(req.body);
      } else if (isFormUrlEncodedContentType(contentType) && typeof req.body === "object") {
        body = new URLSearchParams(req.body as Record<string, string>).toString();
      } else {
        // Default fallback: best-effort JSON.
        body = JSON.stringify(req.body);
        headers.set("content-type", "application/json");
      }
    }
  }

  try {
    const upstream = await fetch(targetUrl, {
      method,
      headers,
      body,
    });

    res.status(upstream.status);

    upstream.headers.forEach((value, key) => {
      const lower = key.toLowerCase();
      if (lower === "content-encoding") return;
      if (lower === "transfer-encoding") return;
      res.setHeader(key, value);
    });

    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.send(buffer);
  } catch {
    res.status(502).json({ error: "Supabase proxy failed to reach upstream." });
  }
});
