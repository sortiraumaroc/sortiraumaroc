import { Router, Request, Response } from "express";
import { adminSupabase } from "../supabase";
import { createRateLimiter } from "../middleware/rateLimiter";

const router = Router();

// Rate limiter: max 5 subscribe requests per IP per hour
const newsletterSubscribeRateLimiter = createRateLimiter("newsletter_subscribe", {
  windowMs: 60 * 60 * 1000, // 1 hour
  maxRequests: 5,
  message: "Trop de tentatives d'inscription. Veuillez réessayer plus tard.",
});

// In-memory cache for subscriber count (30s TTL)
let countCache: { value: number; expiresAt: number } | null = null;
const COUNT_CACHE_TTL_MS = 30_000;

interface GeoIPResponse {
  status: string;
  country?: string;
  city?: string;
  query?: string;
}

async function getGeoLocation(ip: string): Promise<{ city: string | null; country: string | null }> {
  try {
    // Skip geolocation for localhost/private IPs
    if (ip === "127.0.0.1" || ip === "::1" || ip.startsWith("192.168.") || ip.startsWith("10.") || ip === "localhost") {
      return { city: null, country: null };
    }

    const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,city,query`);
    const data: GeoIPResponse = await response.json();

    if (data.status === "success") {
      return {
        city: data.city || null,
        country: data.country || null,
      };
    }

    return { city: null, country: null };
  } catch (error) {
    console.error("Geolocation error:", error);
    return { city: null, country: null };
  }
}

function getClientIP(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const ips = typeof forwarded === "string" ? forwarded : forwarded[0];
    return ips.split(",")[0].trim();
  }
  return req.socket.remoteAddress || "127.0.0.1";
}

// POST /api/newsletter/subscribe - Public endpoint for newsletter signup
router.post("/subscribe", newsletterSubscribeRateLimiter, async (req: Request, res: Response) => {
  try {
    const { email, source } = req.body;

    if (!email || typeof email !== "string") {
      return res.status(400).json({ error: "Email is required" });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "Invalid email format" });
    }

    // Sanitize source (allow known values only, default to "footer")
    const allowedSources = ["footer", "coming_soon_page"];
    const sanitizedSource = typeof source === "string" && allowedSources.includes(source) ? source : "footer";

    // Get client IP and geolocation
    const ip = getClientIP(req);
    const geo = await getGeoLocation(ip);

    // Check if email already exists
    const { data: existing } = await adminSupabase
      .from("newsletter_subscribers")
      .select("id, status")
      .eq("email", email.toLowerCase().trim())
      .single();

    if (existing) {
      if (existing.status === "unsubscribed") {
        // Reactivate subscription
        const { error: updateError } = await adminSupabase
          .from("newsletter_subscribers")
          .update({
            status: "active",
            unsubscribed_at: null,
            source: sanitizedSource,
            updated_at: new Date().toISOString(),
            ...(geo.city && { city: geo.city }),
            ...(geo.country && { country: geo.country }),
          })
          .eq("id", existing.id);

        if (updateError) {
          console.error("Error reactivating subscription:", updateError);
          return res.status(500).json({ error: "Failed to reactivate subscription" });
        }

        // Invalidate count cache
        countCache = null;

        return res.status(201).json({ success: true, message: "Inscrit avec succès" });
      }

      return res.status(409).json({ message: "Email already exists" });
    }

    // Insert new subscriber
    const { error: insertError } = await adminSupabase.from("newsletter_subscribers").insert({
      email: email.toLowerCase().trim(),
      ip_address: ip,
      city: geo.city,
      country: geo.country || "MA",
      source: sanitizedSource,
      status: "active",
    });

    if (insertError) {
      console.error("Error inserting subscriber:", insertError);
      if (insertError.code === "23505") {
        return res.status(409).json({ message: "Email already exists" });
      }
      return res.status(500).json({ error: "Failed to subscribe" });
    }

    // Invalidate count cache
    countCache = null;

    return res.status(201).json({ success: true, message: "Inscrit avec succès" });
  } catch (error) {
    console.error("Newsletter subscribe error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/newsletter/count - Public endpoint for active subscriber count
router.get("/count", async (_req: Request, res: Response) => {
  try {
    // Return cached value if still valid
    if (countCache && Date.now() < countCache.expiresAt) {
      return res.json({ count: countCache.value, success: true });
    }

    const { count, error } = await adminSupabase
      .from("newsletter_subscribers")
      .select("*", { count: "exact", head: true })
      .eq("status", "active");

    if (error) {
      console.error("Error fetching subscriber count:", error);
      return res.status(500).json({ error: "Failed to fetch count" });
    }

    const total = count ?? 0;

    // Cache for 30 seconds
    countCache = { value: total, expiresAt: Date.now() + COUNT_CACHE_TTL_MS };

    return res.json({ count: total, success: true });
  } catch (error) {
    console.error("Newsletter count error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/newsletter/unsubscribe - Public endpoint to unsubscribe
router.post("/unsubscribe", async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email || typeof email !== "string") {
      return res.status(400).json({ error: "Email is required" });
    }

    const { error } = await adminSupabase
      .from("newsletter_subscribers")
      .update({
        status: "unsubscribed",
        unsubscribed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("email", email.toLowerCase().trim());

    if (error) {
      console.error("Error unsubscribing:", error);
      return res.status(500).json({ error: "Failed to unsubscribe" });
    }

    return res.json({ success: true, message: "Successfully unsubscribed" });
  } catch (error) {
    console.error("Newsletter unsubscribe error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
