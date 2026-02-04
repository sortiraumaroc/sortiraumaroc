/**
 * SAM Sync API
 *
 * Receives sync requests from Sortir Au Maroc (SAM) to update
 * establishment, category, and menu item data in menu_sam.
 */

import { Router, RequestHandler } from "express";
import { prisma } from "../lib/prisma";

const router = Router();

// Secret key for authenticating sync requests from SAM
const SYNC_SECRET = process.env.SAM_SYNC_SECRET || "";

/**
 * Middleware to verify sync request authenticity
 */
const verifySyncSecret: RequestHandler = (req, res, next) => {
  const secret = req.headers["x-sync-secret"];

  if (!SYNC_SECRET) {
    // If no secret is configured, allow requests (development mode)
    console.warn("SAM_SYNC_SECRET not configured - allowing all sync requests");
    return next();
  }

  if (secret !== SYNC_SECRET) {
    return res.status(401).json({ error: "Invalid sync secret" });
  }

  next();
};

/**
 * Map SAM icon/category to menu_sam iconScan
 */
function mapCategoryIcon(title: string): string {
  const lower = title.toLowerCase();
  if (lower.includes("boisson") || lower.includes("drink") || lower.includes("cocktail") || lower.includes("jus")) {
    return "drinks";
  }
  if (lower.includes("dessert") || lower.includes("patisserie") || lower.includes("gateau")) {
    return "snack";
  }
  if (lower.includes("petit") && lower.includes("dejeuner") || lower.includes("breakfast")) {
    return "breakfast";
  }
  return "breakfast"; // default
}

/**
 * Map SAM labels to menu_sam label format
 */
function mapItemLabel(labels: string[]): string | null {
  if (!labels || labels.length === 0) return null;

  const labelMap: Record<string, string> = {
    "best-seller": "best-seller",
    "bestseller": "best-seller",
    "populaire": "best-seller",
    "specialite": "specialite",
    "spécialité": "specialite",
    "specialty": "specialite",
    "vegetarien": "vegetarien",
    "végétarien": "vegetarien",
    "vegan": "vegetarien",
    "epice": "epice",
    "épicé": "epice",
    "spicy": "epice",
    "nouveau": "nouveau",
    "new": "nouveau",
    "healthy": "healthy",
    "bio": "healthy",
    "chef": "suggestion-chef",
    "recommendation": "suggestion-chef",
    "signature": "signature",
    "traditionnel": "traditionnel",
    "marocain": "traditionnel",
    "fruits-mer": "fruits-mer",
    "seafood": "fruits-mer",
    "poisson": "fruits-mer",
  };

  for (const label of labels) {
    const lower = label.toLowerCase();
    for (const [key, value] of Object.entries(labelMap)) {
      if (lower.includes(key)) {
        return value;
      }
    }
  }

  return null;
}

/**
 * POST /api/sync/establishment
 *
 * Create or update a Place from SAM establishment data.
 * Called when enabling menu digital for an establishment.
 */
const syncEstablishment: RequestHandler = async (req, res) => {
  try {
    const {
      samEstablishmentId,
      name,
      slug,
      city,
      coverUrl,
      description,
      phone,
      address,
    } = req.body;

    if (!samEstablishmentId || !name) {
      return res.status(400).json({ error: "Missing required fields: samEstablishmentId, name" });
    }

    // Check if place already exists for this SAM establishment
    let place = await prisma.place.findFirst({
      where: { samEstablishmentId },
    });

    if (place) {
      // Update existing place
      place = await prisma.place.update({
        where: { placeId: place.placeId },
        data: {
          name,
          slug,
          city,
          imageDeCouverture: coverUrl,
          description,
          phoneOrder: phone,
          address,
          samSyncEnabled: true,
          samLastSyncAt: new Date(),
        },
      });
    } else {
      // Create new place - we need a client first
      // For now, create a placeholder client or use a default one
      let defaultClient = await prisma.client.findFirst({
        where: { email: "sam-sync@sortiraumaroc.ma" },
      });

      if (!defaultClient) {
        // Create a sync client - clientId is auto-incremented
        defaultClient = await prisma.client.create({
          data: {
            name: "SAM Sync",
            company: "Sortir Au Maroc",
            address: "",
            poste: "DG",
            patente: "",
            tel: "",
            cityId: 1, // Default city
            email: "sam-sync@sortiraumaroc.ma",
            password: "", // No password needed for sync client
            ice: "",
            nom: "SAM",
            prenom: "Sync",
            portable: "",
            dateNaissane: "",
            codeActivation: "",
            deviceToken: "",
          },
        });
      }

      place = await prisma.place.create({
        data: {
          name,
          slug,
          city,
          imageDeCouverture: coverUrl,
          description,
          phoneOrder: phone,
          address,
          clientId: defaultClient.clientId,
          cityId: 1,
          samEstablishmentId,
          samSyncEnabled: true,
          samLastSyncAt: new Date(),
          geoFenceEnabled: false,
          geoFenceRadiusMeters: 100,
        },
      });
    }

    return res.json({
      ok: true,
      placeId: place.placeId,
      message: place ? "Establishment updated" : "Establishment created",
    });

  } catch (error) {
    console.error("Sync establishment error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * POST /api/sync/full
 *
 * Full sync of categories and items from SAM inventory.
 */
const syncFull: RequestHandler = async (req, res) => {
  try {
    const { samEstablishmentId, categories, items } = req.body;

    if (!samEstablishmentId) {
      return res.status(400).json({ error: "Missing samEstablishmentId" });
    }

    // Find the place
    const place = await prisma.place.findFirst({
      where: { samEstablishmentId },
    });

    if (!place) {
      return res.status(404).json({ error: "Place not found. Enable menu digital first." });
    }

    // Sync categories
    const categoryMap = new Map<string, number>(); // samCategoryId -> menuCategoryId

    for (const cat of (categories || [])) {
      let menuCategory = await prisma.menuCategory.findFirst({
        where: { samCategoryId: cat.samCategoryId },
      });

      const categoryData = {
        placeId: place.placeId,
        title: cat.title || "Sans titre",
        priority: cat.sortOrder ?? 0,
        disponibleCat: cat.isActive !== false ? "oui" : "non",
        iconScan: mapCategoryIcon(cat.title || ""),
        samCategoryId: cat.samCategoryId,
      };

      if (menuCategory) {
        menuCategory = await prisma.menuCategory.update({
          where: { menuCategoryId: menuCategory.menuCategoryId },
          data: categoryData,
        });
      } else {
        menuCategory = await prisma.menuCategory.create({
          data: categoryData,
        });
      }

      categoryMap.set(cat.samCategoryId, menuCategory.menuCategoryId);
    }

    // Sync items
    let itemsSynced = 0;

    for (const item of (items || [])) {
      // Get the menu category ID
      const menuCategoryId = item.samCategoryId
        ? categoryMap.get(item.samCategoryId)
        : null;

      if (!menuCategoryId) {
        console.warn(`Skipping item ${item.title} - no category found for ${item.samCategoryId}`);
        continue;
      }

      let menuItem = await prisma.menuItem.findFirst({
        where: { samItemId: item.samItemId },
      });

      // Get the first photo URL if available
      const imgUrl = item.photos && item.photos.length > 0 ? item.photos[0] : null;

      const itemData = {
        menuCategoryId,
        title: item.title || "Sans titre",
        description: item.description || null,
        price: item.price || 0,
        img: imgUrl,
        priority: item.popularity ?? 0,
        disponibleProduct: item.isActive !== false ? "oui" : "non",
        label: mapItemLabel(item.labels || []),
        samItemId: item.samItemId,
        samVariantId: item.samVariantId || null,
      };

      if (menuItem) {
        await prisma.menuItem.update({
          where: { menuItemId: menuItem.menuItemId },
          data: itemData,
        });
      } else {
        await prisma.menuItem.create({
          data: itemData,
        });
      }

      itemsSynced++;
    }

    // Update last sync timestamp
    await prisma.place.update({
      where: { placeId: place.placeId },
      data: { samLastSyncAt: new Date() },
    });

    return res.json({
      ok: true,
      stats: {
        categoriesSynced: categoryMap.size,
        itemsSynced,
      },
    });

  } catch (error) {
    console.error("Full sync error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * POST /api/sync/disable
 *
 * Disable sync for an establishment (but keep the data).
 */
const syncDisable: RequestHandler = async (req, res) => {
  try {
    const { samEstablishmentId } = req.body;

    if (!samEstablishmentId) {
      return res.status(400).json({ error: "Missing samEstablishmentId" });
    }

    const place = await prisma.place.findFirst({
      where: { samEstablishmentId },
    });

    if (place) {
      await prisma.place.update({
        where: { placeId: place.placeId },
        data: { samSyncEnabled: false },
      });
    }

    return res.json({ ok: true, message: "Sync disabled" });

  } catch (error) {
    console.error("Sync disable error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * GET /api/sync/status/:samEstablishmentId
 *
 * Get sync status for an establishment.
 */
const getSyncStatus: RequestHandler = async (req, res) => {
  try {
    const { samEstablishmentId } = req.params;

    const place = await prisma.place.findFirst({
      where: { samEstablishmentId },
      include: {
        _count: {
          select: {
            commandes: true,
            qrTables: true,
          },
        },
      },
    });

    if (!place) {
      return res.json({
        ok: true,
        exists: false,
      });
    }

    // Count categories and items
    const categoryCount = await prisma.menuCategory.count({
      where: { placeId: place.placeId },
    });

    const itemCount = await prisma.menuItem.count({
      where: {
        menuCategory: {
          placeId: place.placeId,
        },
      },
    });

    return res.json({
      ok: true,
      exists: true,
      place: {
        placeId: place.placeId,
        name: place.name,
        slug: place.slug,
        samSyncEnabled: place.samSyncEnabled,
        samLastSyncAt: place.samLastSyncAt,
      },
      stats: {
        categories: categoryCount,
        items: itemCount,
        tables: place._count.qrTables,
        orders: place._count.commandes,
      },
    });

  } catch (error) {
    console.error("Get sync status error:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * POST /api/sync/provision
 *
 * Called by SAM after a successful Menu Digital subscription purchase.
 * Creates the client, place, and subscription in menu_sam.
 */
const provisionMenuDigital: RequestHandler = async (req, res) => {
  try {
    const {
      // SAM identifiers
      samEstablishmentId,
      samOrderId,
      supabaseUserId,

      // Establishment info
      establishmentName,
      slug, // username from SAM (e.g., "poulcook")
      city,
      coverUrl,
      description,
      phone,
      address,

      // Client info
      email,
      companyName,
      contactName,

      // Subscription info
      plan, // 'silver' or 'premium'
      billingCycle, // 'monthly' or 'annual'
      pricePaidCents,
      currency,
      durationDays, // e.g., 30 or 365
    } = req.body;

    // Validate required fields
    if (!samEstablishmentId || !email || !plan || !slug) {
      return res.status(400).json({
        error: "Missing required fields: samEstablishmentId, email, plan, slug",
      });
    }

    // Check if client already exists
    let client = await prisma.client.findFirst({
      where: {
        OR: [
          { supabaseUserId },
          { email },
        ],
      },
    });

    // Create or update client
    if (!client) {
      // Get or create default city
      let defaultCity = await prisma.city.findFirst();
      if (!defaultCity) {
        defaultCity = await prisma.city.create({
          data: { name: "Casablanca", slug: "casablanca" },
        });
      }

      client = await prisma.client.create({
        data: {
          name: contactName || companyName || "Client SAM",
          company: companyName || establishmentName || "",
          address: address || "",
          poste: "DG",
          patente: "",
          tel: phone || "",
          cityId: defaultCity.cityId,
          email,
          password: "", // SSO login, no password needed
          ice: "",
          nom: contactName?.split(" ")[0] || "",
          prenom: contactName?.split(" ").slice(1).join(" ") || "",
          portable: phone || "",
          dateNaissane: "",
          codeActivation: "",
          deviceToken: "",
          abonnement: plan,
          supabaseUserId,
          samEstablishmentId,
        },
      });
    } else {
      // Update existing client
      await prisma.client.update({
        where: { clientId: client.clientId },
        data: {
          supabaseUserId: supabaseUserId || client.supabaseUserId,
          samEstablishmentId: samEstablishmentId || client.samEstablishmentId,
          abonnement: plan,
        },
      });
    }

    // Check if place already exists
    let place = await prisma.place.findFirst({
      where: { samEstablishmentId },
    });

    if (!place) {
      // Create place
      place = await prisma.place.create({
        data: {
          name: establishmentName || "Mon Restaurant",
          slug,
          city: city || "",
          imageDeCouverture: coverUrl,
          description: description || "",
          phoneOrder: phone,
          address: address || "",
          clientId: client.clientId,
          cityId: client.cityId,
          samEstablishmentId,
          samSyncEnabled: true,
          samLastSyncAt: new Date(),
          geoFenceEnabled: false,
          geoFenceRadiusMeters: 100,
          // Enable features based on plan
          avecCommande: plan === "premium" ? "oui" : "non",
        },
      });
    } else {
      // Update existing place
      await prisma.place.update({
        where: { placeId: place.placeId },
        data: {
          name: establishmentName || place.name,
          slug: slug || place.slug,
          city: city || place.city,
          imageDeCouverture: coverUrl || place.imageDeCouverture,
          samSyncEnabled: true,
          avecCommande: plan === "premium" ? "oui" : "non",
        },
      });
    }

    // Calculate expiration date
    const startsAt = new Date();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + (durationDays || 365));

    // Deactivate any existing subscriptions
    await prisma.menuDigitalSubscription.updateMany({
      where: {
        placeId: place.placeId,
        status: "active",
      },
      data: { status: "replaced" },
    });

    // Create subscription with features based on plan
    const isPremium = plan === "premium";
    const subscription = await prisma.menuDigitalSubscription.create({
      data: {
        clientId: client.clientId,
        placeId: place.placeId,
        plan,
        status: "active",
        samOrderId,
        pricePaidCents: pricePaidCents || 0,
        currency: currency || "MAD",
        billingCycle: billingCycle || "annual",
        startsAt,
        expiresAt,
        // Feature flags
        canManageMenu: true,
        canManageTables: true,
        canReceiveCalls: true,
        canViewReviews: true,
        canManageOrders: isPremium,
        canManagePayments: isPremium,
        canManagePromos: isPremium,
        canAccessAdvanced: isPremium,
      },
    });

    // Build menu URL
    const menuUrl = `https://menu.sam.ma/${slug}`;
    const adminUrl = `https://menu.sam.ma/pro/dashboard`;

    return res.json({
      ok: true,
      message: "Menu Digital provisioned successfully",
      client: {
        id: client.clientId,
        email: client.email,
      },
      place: {
        id: place.placeId,
        name: place.name,
        slug: place.slug,
        menuUrl,
        adminUrl,
      },
      subscription: {
        id: subscription.id,
        plan: subscription.plan,
        startsAt: subscription.startsAt,
        expiresAt: subscription.expiresAt,
      },
    });

  } catch (error) {
    console.error("Provision error:", error);
    return res.status(500).json({ error: "Failed to provision Menu Digital" });
  }
};

// Register routes
router.use(verifySyncSecret);
router.post("/establishment", syncEstablishment);
router.post("/full", syncFull);
router.post("/disable", syncDisable);
router.get("/status/:samEstablishmentId", getSyncStatus);
router.post("/provision", provisionMenuDigital);

export const samSyncRouter = router;
