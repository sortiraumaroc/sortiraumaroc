import { Router, Request, Response } from "express";
import { adminSupabase } from "../supabase";

const router = Router();

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
router.post("/subscribe", async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email || typeof email !== "string") {
      return res.status(400).json({ error: "Email is required" });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "Invalid email format" });
    }

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
            updated_at: new Date().toISOString(),
            ...(geo.city && { city: geo.city }),
            ...(geo.country && { country: geo.country }),
          })
          .eq("id", existing.id);

        if (updateError) {
          console.error("Error reactivating subscription:", updateError);
          return res.status(500).json({ error: "Failed to reactivate subscription" });
        }

        return res.json({ success: true, message: "Subscription reactivated" });
      }

      return res.json({ success: true, message: "Already subscribed" });
    }

    // Insert new subscriber
    const { error: insertError } = await adminSupabase.from("newsletter_subscribers").insert({
      email: email.toLowerCase().trim(),
      ip_address: ip,
      city: geo.city,
      country: geo.country,
      source: "footer",
      status: "active",
    });

    if (insertError) {
      console.error("Error inserting subscriber:", insertError);
      if (insertError.code === "23505") {
        return res.json({ success: true, message: "Already subscribed" });
      }
      return res.status(500).json({ error: "Failed to subscribe" });
    }

    return res.json({ success: true, message: "Successfully subscribed" });
  } catch (error) {
    console.error("Newsletter subscribe error:", error);
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
