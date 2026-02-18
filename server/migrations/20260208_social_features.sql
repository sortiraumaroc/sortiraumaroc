-- =============================================================================
-- SOCIAL FEATURES: Posts, Likes, Comments, Saves, Follows
-- =============================================================================

-- Posts
CREATE TABLE IF NOT EXISTS social_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  establishment_id UUID REFERENCES establishments(id) ON DELETE SET NULL,
  content TEXT,
  rating INT CHECK (rating >= 1 AND rating <= 5),
  post_type TEXT NOT NULL DEFAULT 'experience' CHECK (post_type IN ('experience', 'review', 'recommendation', 'photo')),
  is_active BOOLEAN DEFAULT true,
  likes_count INT DEFAULT 0,
  comments_count INT DEFAULT 0,
  saves_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Post images (multiple per post)
CREATE TABLE IF NOT EXISTS social_post_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  display_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Likes
CREATE TABLE IF NOT EXISTS social_post_likes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(post_id, user_id)
);

-- Comments (with threading: parent_comment_id)
CREATE TABLE IF NOT EXISTS social_post_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  parent_comment_id UUID REFERENCES social_post_comments(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  likes_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Saves (bookmarks)
CREATE TABLE IF NOT EXISTS social_post_saves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(post_id, user_id)
);

-- User follows
CREATE TABLE IF NOT EXISTS social_user_follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id TEXT NOT NULL,
  following_id TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(follower_id, following_id),
  CHECK(follower_id != following_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_social_posts_user_id ON social_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_social_posts_establishment_id ON social_posts(establishment_id);
CREATE INDEX IF NOT EXISTS idx_social_posts_created_at ON social_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_posts_is_active ON social_posts(is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_social_post_images_post_id ON social_post_images(post_id);

CREATE INDEX IF NOT EXISTS idx_social_post_likes_post_id ON social_post_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_social_post_likes_user_id ON social_post_likes(user_id);

CREATE INDEX IF NOT EXISTS idx_social_post_comments_post_id ON social_post_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_social_post_comments_user_id ON social_post_comments(user_id);

CREATE INDEX IF NOT EXISTS idx_social_post_saves_post_id ON social_post_saves(post_id);
CREATE INDEX IF NOT EXISTS idx_social_post_saves_user_id ON social_post_saves(user_id);

CREATE INDEX IF NOT EXISTS idx_social_user_follows_follower ON social_user_follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_social_user_follows_following ON social_user_follows(following_id);

-- RLS policies
ALTER TABLE social_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_post_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_post_saves ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_user_follows ENABLE ROW LEVEL SECURITY;
