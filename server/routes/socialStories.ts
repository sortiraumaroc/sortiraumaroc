import type { Express, RequestHandler } from "express";
import { z } from "zod";
import { getAdminSupabase } from "../supabaseAdmin";
import { createModuleLogger } from "../lib/logger";
import { zBody, zParams } from "../lib/validate";

const log = createModuleLogger("social-stories");

// ============================================================================
// HELPERS
// ============================================================================

/** Extract authenticated userId from Bearer token */
async function getAuthUserId(req: { header: (name: string) => string | undefined }): Promise<string | null> {
  const authHeader = req.header("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  const supabase = getAdminSupabase();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

// ============================================================================
// SCHEMAS
// ============================================================================

const STORY_CATEGORIES = ["restaurant", "wellness", "culture", "sport", "shopping", "hotel", "car"] as const;

const createStoryBody = z.object({
  images: z.array(z.string().url()).min(1, "Au moins une image est requise"),
  caption: z.string().trim().max(2200).optional(),
  location: z.string().trim().max(200).optional(),
  category: z.enum(STORY_CATEGORIES).optional(),
  isPartnership: z.boolean().optional().default(false),
  partnerEstablishmentId: z.string().uuid().optional(),
});

const userIdParams = z.object({ userId: z.string() });
const storyIdParams = z.object({ storyId: z.string().uuid() });

// ============================================================================
// ENDPOINT HANDLERS
// ============================================================================

/** POST /api/consumer/social/stories — Create a story */
const createStory: RequestHandler = async (req, res) => {
  try {
    const userId = await getAuthUserId(req);
    if (!userId) { res.status(401).json({ error: "Non autorisé" }); return; }

    const { images, caption, location, category, isPartnership, partnerEstablishmentId } = req.body as z.infer<typeof createStoryBody>;

    const supabase = getAdminSupabase();

    // If partnership story, fetch the partner establishment name
    let partnerName: string | null = null;
    if (isPartnership && partnerEstablishmentId) {
      const { data: estab } = await supabase
        .from("establishments")
        .select("name")
        .eq("id", partnerEstablishmentId)
        .maybeSingle();
      partnerName = estab?.name ?? null;
    }

    // expires 24h from now
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    const { data: story, error: storyError } = await supabase
      .from("social_stories")
      .insert({
        user_id: userId,
        caption: caption ?? null,
        location: location ?? null,
        category: category ?? null,
        is_partnership: isPartnership ?? false,
        partner_establishment_id: partnerEstablishmentId ?? null,
        partner_name: partnerName,
        expires_at: expiresAt,
        is_active: true,
        views_count: 0,
      })
      .select()
      .single();

    if (storyError || !story) {
      log.error({ err: storyError }, "createStory insert failed");
      res.status(500).json({ error: "Erreur lors de la création de la story" });
      return;
    }

    // Bulk insert images
    const imageRows = images.map((url: string, index: number) => ({
      story_id: story.id,
      image_url: url,
      display_order: index,
    }));

    const { data: insertedImages, error: imgError } = await supabase
      .from("social_story_images")
      .insert(imageRows)
      .select();

    if (imgError) {
      log.warn({ err: imgError }, "createStory image insert failed, story created without images");
    }

    res.status(201).json({ ...story, images: insertedImages ?? [] });
  } catch (err) {
    log.error({ err }, "createStory error");
    res.status(500).json({ error: "Erreur serveur" });
  }
};

/** GET /api/consumer/social/stories/feed — Stories feed (followed users + mine) */
const getStoriesFeed: RequestHandler = async (req, res) => {
  try {
    const userId = await getAuthUserId(req);
    if (!userId) { res.status(401).json({ error: "Non autorisé" }); return; }

    const supabase = getAdminSupabase();

    // Get followed user IDs
    const { data: follows } = await supabase
      .from("social_user_follows")
      .select("following_id")
      .eq("follower_id", userId);

    const followedIds = (follows ?? []).map((f: any) => f.following_id);
    const allIds = [userId, ...followedIds];

    // Fetch active non-expired stories for those users
    const now = new Date().toISOString();
    const { data: stories, error } = await supabase
      .from("social_stories")
      .select("*")
      .in("user_id", allIds)
      .eq("is_active", true)
      .gt("expires_at", now)
      .order("created_at", { ascending: false });

    if (error) {
      log.error({ err: error }, "getStoriesFeed query failed");
      res.status(500).json({ error: "Erreur serveur" });
      return;
    }

    if (!stories || stories.length === 0) {
      res.json({ items: [] });
      return;
    }

    // Fetch images for all stories
    const storyIds = stories.map((s: any) => s.id);
    const { data: images } = await supabase
      .from("social_story_images")
      .select("*")
      .in("story_id", storyIds)
      .order("display_order", { ascending: true });

    const imagesMap = new Map<string, any[]>();
    for (const img of (images ?? [])) {
      if (!imagesMap.has(img.story_id)) imagesMap.set(img.story_id, []);
      imagesMap.get(img.story_id)!.push(img);
    }

    // Fetch user info for all unique user IDs
    const uniqueUserIds = [...new Set(stories.map((s: any) => s.user_id as string))];
    const userInfoMap = new Map<string, { firstName: string; lastName: string; avatar: string | null }>();

    await Promise.all(
      uniqueUserIds.map(async (uid) => {
        const { data: userData } = await supabase.auth.admin.getUserById(uid);
        if (userData?.user) {
          const meta = userData.user.user_metadata ?? {};
          userInfoMap.set(uid, {
            firstName: meta.first_name || meta.firstName || "",
            lastName: meta.last_name || meta.lastName || "",
            avatar: meta.avatar_url || meta.avatar || null,
          });
        }
      })
    );

    // Group stories by user
    const groupsMap = new Map<string, any>();
    for (const story of stories) {
      const uid = story.user_id;
      if (!groupsMap.has(uid)) {
        const info = userInfoMap.get(uid) ?? { firstName: "", lastName: "", avatar: null };
        groupsMap.set(uid, {
          userId: uid,
          userName: `${info.firstName} ${info.lastName}`.trim(),
          userAvatar: info.avatar,
          stories: [],
        });
      }
      groupsMap.get(uid).stories.push({
        id: story.id,
        images: imagesMap.get(story.id) ?? [],
        caption: story.caption ?? null,
        location: story.location ?? null,
        isPartnership: story.is_partnership ?? false,
        partnerName: story.partner_name ?? null,
        createdAt: story.created_at,
        expiresAt: story.expires_at,
        viewsCount: story.views_count ?? 0,
      });
    }

    res.json({ items: Array.from(groupsMap.values()) });
  } catch (err) {
    log.error({ err }, "getStoriesFeed error");
    res.status(500).json({ error: "Erreur serveur" });
  }
};

/** GET /api/consumer/social/stories/:userId — Get active stories for a specific user */
const getUserStories: RequestHandler = async (req, res) => {
  try {
    const currentUserId = await getAuthUserId(req);
    if (!currentUserId) { res.status(401).json({ error: "Non autorisé" }); return; }

    const { userId } = req.params as z.infer<typeof userIdParams>;
    const supabase = getAdminSupabase();
    const now = new Date().toISOString();

    const { data: stories, error } = await supabase
      .from("social_stories")
      .select("*")
      .eq("user_id", userId)
      .eq("is_active", true)
      .gt("expires_at", now)
      .order("created_at", { ascending: true });

    if (error) {
      log.error({ err: error }, "getUserStories query failed");
      res.status(500).json({ error: "Erreur serveur" });
      return;
    }

    if (!stories || stories.length === 0) {
      res.json({ items: [] });
      return;
    }

    // Fetch images for all stories
    const storyIds = stories.map((s: any) => s.id);
    const { data: images } = await supabase
      .from("social_story_images")
      .select("*")
      .in("story_id", storyIds)
      .order("display_order", { ascending: true });

    const imagesMap = new Map<string, any[]>();
    for (const img of (images ?? [])) {
      if (!imagesMap.has(img.story_id)) imagesMap.set(img.story_id, []);
      imagesMap.get(img.story_id)!.push(img);
    }

    const items = stories.map((story: any) => ({
      id: story.id,
      images: imagesMap.get(story.id) ?? [],
      caption: story.caption ?? null,
      location: story.location ?? null,
      isPartnership: story.is_partnership ?? false,
      partnerName: story.partner_name ?? null,
      createdAt: story.created_at,
      expiresAt: story.expires_at,
      viewsCount: story.views_count ?? 0,
      isOwner: story.user_id === currentUserId,
    }));

    res.json({ items });
  } catch (err) {
    log.error({ err }, "getUserStories error");
    res.status(500).json({ error: "Erreur serveur" });
  }
};

/** DELETE /api/consumer/social/stories/:storyId — Delete own story (soft delete) */
const deleteStory: RequestHandler = async (req, res) => {
  try {
    const userId = await getAuthUserId(req);
    if (!userId) { res.status(401).json({ error: "Non autorisé" }); return; }

    const { storyId } = req.params as z.infer<typeof storyIdParams>;
    const supabase = getAdminSupabase();

    // Verify ownership
    const { data: story } = await supabase
      .from("social_stories")
      .select("user_id")
      .eq("id", storyId)
      .maybeSingle();

    if (!story || story.user_id !== userId) {
      res.status(403).json({ error: "Action non autorisée" });
      return;
    }

    await supabase
      .from("social_stories")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", storyId);

    res.json({ ok: true });
  } catch (err) {
    log.error({ err }, "deleteStory error");
    res.status(500).json({ error: "Erreur serveur" });
  }
};

/** POST /api/consumer/social/stories/:storyId/view — Record a view */
const viewStory: RequestHandler = async (req, res) => {
  try {
    const userId = await getAuthUserId(req);
    if (!userId) { res.status(401).json({ error: "Non autorisé" }); return; }

    const { storyId } = req.params as z.infer<typeof storyIdParams>;
    const supabase = getAdminSupabase();

    // Upsert view — on conflict (story_id, viewer_id) do nothing
    const { error: viewError } = await supabase
      .from("social_story_views")
      .upsert(
        { story_id: storyId, viewer_id: userId },
        { onConflict: "story_id,viewer_id", ignoreDuplicates: true }
      );

    if (viewError) {
      log.warn({ err: viewError }, "viewStory upsert failed");
    }

    // Recount actual views and update the story
    const { count } = await supabase
      .from("social_story_views")
      .select("*", { count: "exact", head: true })
      .eq("story_id", storyId);

    await supabase
      .from("social_stories")
      .update({ views_count: count ?? 0 })
      .eq("id", storyId);

    res.json({ ok: true });
  } catch (err) {
    log.error({ err }, "viewStory error");
    res.status(500).json({ error: "Erreur serveur" });
  }
};

// ============================================================================
// REGISTER
// ============================================================================

export function registerStoriesRoutes(app: Express) {
  // Create a story
  app.post("/api/consumer/social/stories", zBody(createStoryBody), createStory);

  // Stories feed (followed users + mine) — must come BEFORE /:userId to avoid collision
  app.get("/api/consumer/social/stories/feed", getStoriesFeed);

  // Get active stories for a specific user
  app.get("/api/consumer/social/stories/:userId", zParams(userIdParams), getUserStories);

  // Delete own story
  app.delete("/api/consumer/social/stories/:storyId", zParams(storyIdParams), deleteStory);

  // Record a view on a story
  app.post("/api/consumer/social/stories/:storyId/view", zParams(storyIdParams), viewStory);
}
