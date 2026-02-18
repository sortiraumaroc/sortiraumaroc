import type { Express, RequestHandler } from "express";
import { getAdminSupabase } from "../supabaseAdmin";

// ============================================================================
// HELPERS
// ============================================================================

function safeString(v: unknown, maxLen = 10000): string {
  if (typeof v !== "string") return "";
  return v.slice(0, maxLen).trim();
}

function safeInt(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

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
// FEED
// ============================================================================

/** GET /api/consumer/social/feed — paginated feed (posts from followed users + popular) */
const getFeed: RequestHandler = async (req, res) => {
  try {
    const userId = await getAuthUserId(req);
    if (!userId) { res.status(401).json({ error: "Non autorisé" }); return; }

    const page = safeInt(req.query.page, 1);
    const pageSize = safeInt(req.query.pageSize, 20);
    const offset = (page - 1) * pageSize;

    const supabase = getAdminSupabase();

    // Get followed user IDs
    const { data: follows } = await supabase
      .from("social_user_follows")
      .select("following_id")
      .eq("follower_id", userId);

    const followedIds = (follows ?? []).map((f: any) => f.following_id);
    // Include own posts + followed users
    const allIds = [userId, ...followedIds];

    const { data: posts, error, count } = await supabase
      .from("social_posts")
      .select("*", { count: "exact" })
      .in("user_id", allIds)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error("[social/feed] Error:", error);
      res.status(500).json({ error: "Erreur serveur" });
      return;
    }

    // Enrich posts with images and user interaction status
    const enrichedPosts = await enrichPosts(supabase, posts ?? [], userId);

    res.json({
      items: enrichedPosts,
      total: count ?? 0,
      page,
      pageSize,
      hasMore: offset + pageSize < (count ?? 0),
    });
  } catch (err) {
    console.error("[social/feed] Error:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
};

/** GET /api/consumer/social/feed/discover — trending/discovery feed */
const getDiscoverFeed: RequestHandler = async (req, res) => {
  try {
    const userId = await getAuthUserId(req);
    if (!userId) { res.status(401).json({ error: "Non autorisé" }); return; }

    const page = safeInt(req.query.page, 1);
    const pageSize = safeInt(req.query.pageSize, 20);
    const offset = (page - 1) * pageSize;

    const supabase = getAdminSupabase();

    const { data: posts, error, count } = await supabase
      .from("social_posts")
      .select("*", { count: "exact" })
      .eq("is_active", true)
      .order("likes_count", { ascending: false })
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error("[social/discover] Error:", error);
      res.status(500).json({ error: "Erreur serveur" });
      return;
    }

    const enrichedPosts = await enrichPosts(supabase, posts ?? [], userId);

    res.json({
      items: enrichedPosts,
      total: count ?? 0,
      page,
      pageSize,
      hasMore: offset + pageSize < (count ?? 0),
    });
  } catch (err) {
    console.error("[social/discover] Error:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
};

// ============================================================================
// POSTS CRUD
// ============================================================================

/** POST /api/consumer/social/posts — create a new post */
const createPost: RequestHandler = async (req, res) => {
  try {
    const userId = await getAuthUserId(req);
    if (!userId) { res.status(401).json({ error: "Non autorisé" }); return; }

    const content = safeString(req.body?.content);
    const postType = safeString(req.body?.postType) || "experience";
    const rating = req.body?.rating ? safeInt(req.body.rating) : null;
    const establishmentId = safeString(req.body?.establishmentId) || null;
    const images: string[] = Array.isArray(req.body?.images) ? req.body.images : [];

    if (!content && images.length === 0) {
      res.status(400).json({ error: "Le contenu ou des images sont requis" });
      return;
    }

    const supabase = getAdminSupabase();

    // Create post
    const { data: post, error } = await supabase
      .from("social_posts")
      .insert({
        user_id: userId,
        content,
        post_type: postType,
        rating,
        establishment_id: establishmentId,
      })
      .select()
      .single();

    if (error || !post) {
      console.error("[social/createPost] Error:", error);
      res.status(500).json({ error: "Erreur lors de la création du post" });
      return;
    }

    // Insert images if any
    if (images.length > 0) {
      const imageRows = images.map((url: string, index: number) => ({
        post_id: post.id,
        image_url: url,
        display_order: index,
      }));

      await supabase.from("social_post_images").insert(imageRows);
    }

    res.status(201).json(post);
  } catch (err) {
    console.error("[social/createPost] Error:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
};

/** GET /api/consumer/social/posts/:id — get post detail */
const getPost: RequestHandler = async (req, res) => {
  try {
    const userId = await getAuthUserId(req);
    if (!userId) { res.status(401).json({ error: "Non autorisé" }); return; }

    const postId = req.params.id;
    const supabase = getAdminSupabase();

    const { data: post, error } = await supabase
      .from("social_posts")
      .select("*")
      .eq("id", postId)
      .eq("is_active", true)
      .single();

    if (error || !post) {
      res.status(404).json({ error: "Post non trouvé" });
      return;
    }

    const enriched = await enrichPosts(supabase, [post], userId);
    res.json(enriched[0]);
  } catch (err) {
    console.error("[social/getPost] Error:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
};

/** DELETE /api/consumer/social/posts/:id — delete own post */
const deletePost: RequestHandler = async (req, res) => {
  try {
    const userId = await getAuthUserId(req);
    if (!userId) { res.status(401).json({ error: "Non autorisé" }); return; }

    const postId = req.params.id;
    const supabase = getAdminSupabase();

    // Verify ownership
    const { data: post } = await supabase
      .from("social_posts")
      .select("user_id")
      .eq("id", postId)
      .single();

    if (!post || post.user_id !== userId) {
      res.status(403).json({ error: "Action non autorisée" });
      return;
    }

    // Soft delete
    await supabase
      .from("social_posts")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", postId);

    res.json({ ok: true });
  } catch (err) {
    console.error("[social/deletePost] Error:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
};

// ============================================================================
// INTERACTIONS: Like, Save
// ============================================================================

/** POST /api/consumer/social/posts/:id/like — toggle like */
const toggleLike: RequestHandler = async (req, res) => {
  try {
    const userId = await getAuthUserId(req);
    if (!userId) { res.status(401).json({ error: "Non autorisé" }); return; }

    const postId = req.params.id;
    const supabase = getAdminSupabase();

    // Check if already liked
    const { data: existing } = await supabase
      .from("social_post_likes")
      .select("id")
      .eq("post_id", postId)
      .eq("user_id", userId)
      .maybeSingle();

    let liked: boolean;

    if (existing) {
      // Unlike
      await supabase.from("social_post_likes").delete().eq("id", existing.id);
      try {
        await supabase.rpc("decrement_counter", { table_name: "social_posts", column_name: "likes_count", row_id: postId });
      } catch {
        // Fallback: manual update
        await supabase.from("social_posts").update({
          likes_count: supabase.rpc ? undefined : 0,
        }).eq("id", postId);
      }
      liked = false;
    } else {
      // Like
      await supabase.from("social_post_likes").insert({ post_id: postId, user_id: userId });
      liked = true;
    }

    // Get updated count
    const { count } = await supabase
      .from("social_post_likes")
      .select("*", { count: "exact", head: true })
      .eq("post_id", postId);

    // Update counter on post
    await supabase
      .from("social_posts")
      .update({ likes_count: count ?? 0 })
      .eq("id", postId);

    res.json({ liked, likesCount: count ?? 0 });
  } catch (err) {
    console.error("[social/toggleLike] Error:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
};

/** POST /api/consumer/social/posts/:id/save — toggle save/bookmark */
const toggleSave: RequestHandler = async (req, res) => {
  try {
    const userId = await getAuthUserId(req);
    if (!userId) { res.status(401).json({ error: "Non autorisé" }); return; }

    const postId = req.params.id;
    const supabase = getAdminSupabase();

    // Check if already saved
    const { data: existing } = await supabase
      .from("social_post_saves")
      .select("id")
      .eq("post_id", postId)
      .eq("user_id", userId)
      .maybeSingle();

    let saved: boolean;

    if (existing) {
      await supabase.from("social_post_saves").delete().eq("id", existing.id);
      saved = false;
    } else {
      await supabase.from("social_post_saves").insert({ post_id: postId, user_id: userId });
      saved = true;
    }

    // Get updated count
    const { count } = await supabase
      .from("social_post_saves")
      .select("*", { count: "exact", head: true })
      .eq("post_id", postId);

    // Update counter on post
    await supabase
      .from("social_posts")
      .update({ saves_count: count ?? 0 })
      .eq("id", postId);

    res.json({ saved, savesCount: count ?? 0 });
  } catch (err) {
    console.error("[social/toggleSave] Error:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
};

// ============================================================================
// COMMENTS
// ============================================================================

/** GET /api/consumer/social/posts/:id/comments — list comments */
const getComments: RequestHandler = async (req, res) => {
  try {
    const userId = await getAuthUserId(req);
    if (!userId) { res.status(401).json({ error: "Non autorisé" }); return; }

    const postId = req.params.id;
    const page = safeInt(req.query.page, 1);
    const pageSize = safeInt(req.query.pageSize, 50);
    const offset = (page - 1) * pageSize;

    const supabase = getAdminSupabase();

    const { data: comments, error, count } = await supabase
      .from("social_post_comments")
      .select("*", { count: "exact" })
      .eq("post_id", postId)
      .order("created_at", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error("[social/getComments] Error:", error);
      res.status(500).json({ error: "Erreur serveur" });
      return;
    }

    res.json({
      items: comments ?? [],
      total: count ?? 0,
      page,
      pageSize,
      hasMore: offset + pageSize < (count ?? 0),
    });
  } catch (err) {
    console.error("[social/getComments] Error:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
};

/** POST /api/consumer/social/posts/:id/comments — add a comment */
const addComment: RequestHandler = async (req, res) => {
  try {
    const userId = await getAuthUserId(req);
    if (!userId) { res.status(401).json({ error: "Non autorisé" }); return; }

    const postId = req.params.id;
    const content = safeString(req.body?.content);
    const parentCommentId = safeString(req.body?.parentCommentId) || null;

    if (!content) {
      res.status(400).json({ error: "Le contenu est requis" });
      return;
    }

    const supabase = getAdminSupabase();

    const { data: comment, error } = await supabase
      .from("social_post_comments")
      .insert({
        post_id: postId,
        user_id: userId,
        content,
        parent_comment_id: parentCommentId,
      })
      .select()
      .single();

    if (error) {
      console.error("[social/addComment] Error:", error);
      res.status(500).json({ error: "Erreur serveur" });
      return;
    }

    // Increment comments count on the post
    const { count } = await supabase
      .from("social_post_comments")
      .select("*", { count: "exact", head: true })
      .eq("post_id", postId);

    await supabase
      .from("social_posts")
      .update({ comments_count: count ?? 0 })
      .eq("id", postId);

    res.status(201).json(comment);
  } catch (err) {
    console.error("[social/addComment] Error:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
};

/** DELETE /api/consumer/social/comments/:id — delete own comment */
const deleteComment: RequestHandler = async (req, res) => {
  try {
    const userId = await getAuthUserId(req);
    if (!userId) { res.status(401).json({ error: "Non autorisé" }); return; }

    const commentId = req.params.id;
    const supabase = getAdminSupabase();

    // Verify ownership
    const { data: comment } = await supabase
      .from("social_post_comments")
      .select("user_id, post_id")
      .eq("id", commentId)
      .single();

    if (!comment || comment.user_id !== userId) {
      res.status(403).json({ error: "Action non autorisée" });
      return;
    }

    await supabase.from("social_post_comments").delete().eq("id", commentId);

    // Update comments count
    const { count } = await supabase
      .from("social_post_comments")
      .select("*", { count: "exact", head: true })
      .eq("post_id", comment.post_id);

    await supabase
      .from("social_posts")
      .update({ comments_count: count ?? 0 })
      .eq("id", comment.post_id);

    res.json({ ok: true });
  } catch (err) {
    console.error("[social/deleteComment] Error:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
};

// ============================================================================
// FOLLOW
// ============================================================================

/** POST /api/consumer/social/users/:id/follow — toggle follow */
const toggleFollow: RequestHandler = async (req, res) => {
  try {
    const userId = await getAuthUserId(req);
    if (!userId) { res.status(401).json({ error: "Non autorisé" }); return; }

    const targetUserId = req.params.id;

    if (userId === targetUserId) {
      res.status(400).json({ error: "Impossible de se suivre soi-même" });
      return;
    }

    const supabase = getAdminSupabase();

    const { data: existing } = await supabase
      .from("social_user_follows")
      .select("id")
      .eq("follower_id", userId)
      .eq("following_id", targetUserId)
      .maybeSingle();

    let following: boolean;

    if (existing) {
      await supabase.from("social_user_follows").delete().eq("id", existing.id);
      following = false;
    } else {
      await supabase.from("social_user_follows").insert({
        follower_id: userId,
        following_id: targetUserId,
      });
      following = true;
    }

    // Get updated followers count
    const { count } = await supabase
      .from("social_user_follows")
      .select("*", { count: "exact", head: true })
      .eq("following_id", targetUserId);

    res.json({ following, followersCount: count ?? 0 });
  } catch (err) {
    console.error("[social/toggleFollow] Error:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
};

// ============================================================================
// USER PROFILES
// ============================================================================

/** GET /api/consumer/social/users/:id/profile — public social profile */
const getUserProfile: RequestHandler = async (req, res) => {
  try {
    const userId = await getAuthUserId(req);
    if (!userId) { res.status(401).json({ error: "Non autorisé" }); return; }

    const targetUserId = req.params.id;
    const supabase = getAdminSupabase();

    // Get user info from Supabase auth
    const { data: userData } = await supabase.auth.admin.getUserById(targetUserId);
    if (!userData.user) {
      res.status(404).json({ error: "Utilisateur non trouvé" });
      return;
    }

    const user = userData.user;
    const meta = user.user_metadata ?? {};

    // Get counts
    const [postsCount, followersCount, followingCount, isFollowingRes] = await Promise.all([
      supabase.from("social_posts").select("*", { count: "exact", head: true }).eq("user_id", targetUserId).eq("is_active", true),
      supabase.from("social_user_follows").select("*", { count: "exact", head: true }).eq("following_id", targetUserId),
      supabase.from("social_user_follows").select("*", { count: "exact", head: true }).eq("follower_id", targetUserId),
      supabase.from("social_user_follows").select("id").eq("follower_id", userId).eq("following_id", targetUserId).maybeSingle(),
    ]);

    // Check if target follows the current user
    const { data: isFollowedByData } = await supabase
      .from("social_user_follows")
      .select("id")
      .eq("follower_id", targetUserId)
      .eq("following_id", userId)
      .maybeSingle();

    res.json({
      id: targetUserId,
      firstName: meta.first_name || meta.firstName || "",
      lastName: meta.last_name || meta.lastName || "",
      avatar: meta.avatar_url || meta.avatar || null,
      bio: meta.bio || "",
      postsCount: postsCount.count ?? 0,
      followersCount: followersCount.count ?? 0,
      followingCount: followingCount.count ?? 0,
      isFollowing: !!isFollowingRes.data,
      isFollowedBy: !!isFollowedByData,
    });
  } catch (err) {
    console.error("[social/getUserProfile] Error:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
};

/** GET /api/consumer/social/users/:id/posts — user's posts */
const getUserPosts: RequestHandler = async (req, res) => {
  try {
    const userId = await getAuthUserId(req);
    if (!userId) { res.status(401).json({ error: "Non autorisé" }); return; }

    const targetUserId = req.params.id;
    const page = safeInt(req.query.page, 1);
    const pageSize = safeInt(req.query.pageSize, 20);
    const offset = (page - 1) * pageSize;

    const supabase = getAdminSupabase();

    const { data: posts, error, count } = await supabase
      .from("social_posts")
      .select("*", { count: "exact" })
      .eq("user_id", targetUserId)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error("[social/getUserPosts] Error:", error);
      res.status(500).json({ error: "Erreur serveur" });
      return;
    }

    const enrichedPosts = await enrichPosts(supabase, posts ?? [], userId);

    res.json({
      items: enrichedPosts,
      total: count ?? 0,
      page,
      pageSize,
      hasMore: offset + pageSize < (count ?? 0),
    });
  } catch (err) {
    console.error("[social/getUserPosts] Error:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
};

/** GET /api/consumer/social/users/:id/followers — list followers */
const getUserFollowers: RequestHandler = async (req, res) => {
  try {
    const userId = await getAuthUserId(req);
    if (!userId) { res.status(401).json({ error: "Non autorisé" }); return; }

    const targetUserId = req.params.id;
    const page = safeInt(req.query.page, 1);
    const pageSize = safeInt(req.query.pageSize, 50);
    const offset = (page - 1) * pageSize;

    const supabase = getAdminSupabase();

    const { data: follows, error, count } = await supabase
      .from("social_user_follows")
      .select("follower_id", { count: "exact" })
      .eq("following_id", targetUserId)
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error("[social/getUserFollowers] Error:", error);
      res.status(500).json({ error: "Erreur serveur" });
      return;
    }

    res.json({
      items: (follows ?? []).map((f: any) => ({ userId: f.follower_id })),
      total: count ?? 0,
      page,
      pageSize,
      hasMore: offset + pageSize < (count ?? 0),
    });
  } catch (err) {
    console.error("[social/getUserFollowers] Error:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
};

/** GET /api/consumer/social/users/:id/following — list following */
const getUserFollowing: RequestHandler = async (req, res) => {
  try {
    const userId = await getAuthUserId(req);
    if (!userId) { res.status(401).json({ error: "Non autorisé" }); return; }

    const targetUserId = req.params.id;
    const page = safeInt(req.query.page, 1);
    const pageSize = safeInt(req.query.pageSize, 50);
    const offset = (page - 1) * pageSize;

    const supabase = getAdminSupabase();

    const { data: follows, error, count } = await supabase
      .from("social_user_follows")
      .select("following_id", { count: "exact" })
      .eq("follower_id", targetUserId)
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (error) {
      console.error("[social/getUserFollowing] Error:", error);
      res.status(500).json({ error: "Erreur serveur" });
      return;
    }

    res.json({
      items: (follows ?? []).map((f: any) => ({ userId: f.following_id })),
      total: count ?? 0,
      page,
      pageSize,
      hasMore: offset + pageSize < (count ?? 0),
    });
  } catch (err) {
    console.error("[social/getUserFollowing] Error:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
};

/** GET /api/consumer/social/me/saved — my saved/bookmarked posts */
const getSavedPosts: RequestHandler = async (req, res) => {
  try {
    const userId = await getAuthUserId(req);
    if (!userId) { res.status(401).json({ error: "Non autorisé" }); return; }

    const page = safeInt(req.query.page, 1);
    const pageSize = safeInt(req.query.pageSize, 20);
    const offset = (page - 1) * pageSize;

    const supabase = getAdminSupabase();

    // Get saved post IDs
    const { data: saves, error: savesError, count } = await supabase
      .from("social_post_saves")
      .select("post_id", { count: "exact" })
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1);

    if (savesError) {
      console.error("[social/getSavedPosts] Error:", savesError);
      res.status(500).json({ error: "Erreur serveur" });
      return;
    }

    const postIds = (saves ?? []).map((s: any) => s.post_id);

    if (postIds.length === 0) {
      res.json({ items: [], total: 0, page, pageSize, hasMore: false });
      return;
    }

    const { data: posts } = await supabase
      .from("social_posts")
      .select("*")
      .in("id", postIds)
      .eq("is_active", true);

    const enrichedPosts = await enrichPosts(supabase, posts ?? [], userId);

    res.json({
      items: enrichedPosts,
      total: count ?? 0,
      page,
      pageSize,
      hasMore: offset + pageSize < (count ?? 0),
    });
  } catch (err) {
    console.error("[social/getSavedPosts] Error:", err);
    res.status(500).json({ error: "Erreur serveur" });
  }
};

// ============================================================================
// HELPERS
// ============================================================================

/** Enrich posts with images, user info, and interaction status */
async function enrichPosts(supabase: any, posts: any[], currentUserId: string) {
  if (posts.length === 0) return [];

  const postIds = posts.map((p) => p.id);
  const userIds = [...new Set(posts.map((p) => p.user_id))];

  // Fetch images for all posts
  const { data: images } = await supabase
    .from("social_post_images")
    .select("*")
    .in("post_id", postIds)
    .order("display_order", { ascending: true });

  // Fetch current user's likes and saves
  const [likesRes, savesRes] = await Promise.all([
    supabase.from("social_post_likes").select("post_id").in("post_id", postIds).eq("user_id", currentUserId),
    supabase.from("social_post_saves").select("post_id").in("post_id", postIds).eq("user_id", currentUserId),
  ]);

  const likedPostIds = new Set((likesRes.data ?? []).map((l: any) => l.post_id));
  const savedPostIds = new Set((savesRes.data ?? []).map((s: any) => s.post_id));

  // Build images map
  const imagesMap = new Map<string, any[]>();
  for (const img of (images ?? [])) {
    if (!imagesMap.has(img.post_id)) imagesMap.set(img.post_id, []);
    imagesMap.get(img.post_id)!.push(img);
  }

  return posts.map((post) => ({
    ...post,
    images: imagesMap.get(post.id) ?? [],
    isLiked: likedPostIds.has(post.id),
    isSaved: savedPostIds.has(post.id),
  }));
}

// ============================================================================
// REGISTER
// ============================================================================

export function registerSocialRoutes(app: Express) {
  // Feed
  app.get("/api/consumer/social/feed", getFeed);
  app.get("/api/consumer/social/feed/discover", getDiscoverFeed);

  // Posts CRUD
  app.post("/api/consumer/social/posts", createPost);
  app.get("/api/consumer/social/posts/:id", getPost);
  app.delete("/api/consumer/social/posts/:id", deletePost);

  // Interactions
  app.post("/api/consumer/social/posts/:id/like", toggleLike);
  app.post("/api/consumer/social/posts/:id/save", toggleSave);

  // Comments
  app.get("/api/consumer/social/posts/:id/comments", getComments);
  app.post("/api/consumer/social/posts/:id/comments", addComment);
  app.delete("/api/consumer/social/comments/:id", deleteComment);

  // Follow
  app.post("/api/consumer/social/users/:id/follow", toggleFollow);

  // User profiles
  app.get("/api/consumer/social/users/:id/profile", getUserProfile);
  app.get("/api/consumer/social/users/:id/posts", getUserPosts);
  app.get("/api/consumer/social/users/:id/followers", getUserFollowers);
  app.get("/api/consumer/social/users/:id/following", getUserFollowing);

  // Saved posts
  app.get("/api/consumer/social/me/saved", getSavedPosts);
}
