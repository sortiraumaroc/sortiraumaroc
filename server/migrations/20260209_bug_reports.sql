-- Bug reports table
-- Stores user-submitted bug reports with screenshot and page URL

CREATE TABLE IF NOT EXISTS bug_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT NOT NULL,
  message TEXT NOT NULL,
  screenshot TEXT,  -- base64 PNG data URL
  user_agent TEXT,
  screen_width INTEGER,
  screen_height INTEGER,
  reported_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'fixed', 'dismissed')),
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for admin filtering
CREATE INDEX IF NOT EXISTS idx_bug_reports_status ON bug_reports(status);
CREATE INDEX IF NOT EXISTS idx_bug_reports_created_at ON bug_reports(created_at DESC);

-- RLS policies
ALTER TABLE bug_reports ENABLE ROW LEVEL SECURITY;

-- Anyone can insert (public bug reports)
CREATE POLICY bug_reports_insert_policy ON bug_reports
  FOR INSERT
  WITH CHECK (true);

-- Only service role can read/update (admin)
CREATE POLICY bug_reports_select_policy ON bug_reports
  FOR SELECT
  USING (auth.role() = 'service_role');

CREATE POLICY bug_reports_update_policy ON bug_reports
  FOR UPDATE
  USING (auth.role() = 'service_role');
