# Supabase Row Level Security (RLS) Policies

## Overview

This document describes the recommended RLS policies for SAM'BOOKING tables.
**IMPORTANT**: Apply these policies in the Supabase Dashboard > SQL Editor.

## Critical Tables

### 1. `reservations`

```sql
-- Enable RLS
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own reservations
CREATE POLICY "Users can view own reservations" ON reservations
FOR SELECT USING (auth.uid() = user_id);

-- Policy: Users can create reservations for themselves
CREATE POLICY "Users can create own reservations" ON reservations
FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own pending reservations
CREATE POLICY "Users can update own pending reservations" ON reservations
FOR UPDATE USING (
  auth.uid() = user_id
  AND status IN ('pending_pro_validation', 'requested', 'waitlist')
);

-- Policy: Service role can do everything (for webhooks, admin)
CREATE POLICY "Service role full access" ON reservations
FOR ALL USING (auth.jwt()->>'role' = 'service_role');
```

### 2. `consumer_users`

```sql
-- Enable RLS
ALTER TABLE consumer_users ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only view and update their own profile
CREATE POLICY "Users can view own profile" ON consumer_users
FOR SELECT USING (auth.uid()::text = auth_user_id);

CREATE POLICY "Users can update own profile" ON consumer_users
FOR UPDATE USING (auth.uid()::text = auth_user_id);

-- Policy: Service role full access
CREATE POLICY "Service role full access" ON consumer_users
FOR ALL USING (auth.jwt()->>'role' = 'service_role');
```

### 3. `pack_purchases`

```sql
-- Enable RLS
ALTER TABLE pack_purchases ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own purchases
CREATE POLICY "Users can view own purchases" ON pack_purchases
FOR SELECT USING (
  auth.uid()::text = (meta->>'buyer_user_id')::text
);

-- Policy: Service role full access
CREATE POLICY "Service role full access" ON pack_purchases
FOR ALL USING (auth.jwt()->>'role' = 'service_role');
```

### 4. `waitlist_entries`

```sql
-- Enable RLS
ALTER TABLE waitlist_entries ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own waitlist entries
CREATE POLICY "Users can view own waitlist" ON waitlist_entries
FOR SELECT USING (auth.uid() = user_id);

-- Policy: Users can cancel their own waitlist entries
CREATE POLICY "Users can update own waitlist" ON waitlist_entries
FOR UPDATE USING (auth.uid() = user_id);

-- Policy: Service role full access
CREATE POLICY "Service role full access" ON waitlist_entries
FOR ALL USING (auth.jwt()->>'role' = 'service_role');
```

### 5. `consumer_notifications`

```sql
-- Enable RLS
ALTER TABLE consumer_notifications ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own notifications
CREATE POLICY "Users can view own notifications" ON consumer_notifications
FOR SELECT USING (auth.uid() = user_id);

-- Policy: Users can mark their own notifications as read
CREATE POLICY "Users can update own notifications" ON consumer_notifications
FOR UPDATE USING (auth.uid() = user_id);

-- Policy: Service role full access
CREATE POLICY "Service role full access" ON consumer_notifications
FOR ALL USING (auth.jwt()->>'role' = 'service_role');
```

### 6. `reservation_messages`

```sql
-- Enable RLS
ALTER TABLE reservation_messages ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view messages for their own reservations
CREATE POLICY "Users can view own reservation messages" ON reservation_messages
FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM reservations
    WHERE reservations.id = reservation_messages.reservation_id
    AND reservations.user_id = auth.uid()
  )
);

-- Policy: Users can send messages for their own reservations
CREATE POLICY "Users can send messages on own reservations" ON reservation_messages
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM reservations
    WHERE reservations.id = reservation_messages.reservation_id
    AND reservations.user_id = auth.uid()
  )
  AND sender_type = 'consumer'
);

-- Policy: Service role full access
CREATE POLICY "Service role full access" ON reservation_messages
FOR ALL USING (auth.jwt()->>'role' = 'service_role');
```

## Public Tables (Read-Only)

### `establishments`

```sql
-- Enable RLS
ALTER TABLE establishments ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can view active establishments
CREATE POLICY "Public can view active establishments" ON establishments
FOR SELECT USING (status = 'active');

-- Policy: Service role full access
CREATE POLICY "Service role full access" ON establishments
FOR ALL USING (auth.jwt()->>'role' = 'service_role');
```

### `pro_slots`

```sql
-- Enable RLS
ALTER TABLE pro_slots ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can view active slots for active establishments
CREATE POLICY "Public can view active slots" ON pro_slots
FOR SELECT USING (
  active = true
  AND EXISTS (
    SELECT 1 FROM establishments
    WHERE establishments.id = pro_slots.establishment_id
    AND establishments.status = 'active'
  )
);

-- Policy: Service role full access
CREATE POLICY "Service role full access" ON pro_slots
FOR ALL USING (auth.jwt()->>'role' = 'service_role');
```

### `packs`

```sql
-- Enable RLS
ALTER TABLE packs ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can view active packs
CREATE POLICY "Public can view active packs" ON packs
FOR SELECT USING (active = true);

-- Policy: Service role full access
CREATE POLICY "Service role full access" ON packs
FOR ALL USING (auth.jwt()->>'role' = 'service_role');
```

## Admin Tables

### `admin_collaborators`

```sql
-- Enable RLS
ALTER TABLE admin_collaborators ENABLE ROW LEVEL SECURITY;

-- Only service role can access admin tables
CREATE POLICY "Service role only" ON admin_collaborators
FOR ALL USING (auth.jwt()->>'role' = 'service_role');
```

### `system_logs`

```sql
-- Enable RLS
ALTER TABLE system_logs ENABLE ROW LEVEL SECURITY;

-- Only service role can access logs
CREATE POLICY "Service role only" ON system_logs
FOR ALL USING (auth.jwt()->>'role' = 'service_role');
```

## How to Apply

1. Go to Supabase Dashboard
2. Navigate to SQL Editor
3. Copy and paste each section
4. Run the SQL
5. Verify policies in Authentication > Policies

## Testing RLS

After applying policies, test with:

```sql
-- Test as anonymous user
SET request.jwt.claims = '{}';
SELECT * FROM reservations; -- Should return nothing or only public data

-- Test as authenticated user
SET request.jwt.claims = '{"sub": "user-uuid-here", "role": "authenticated"}';
SELECT * FROM reservations; -- Should return only user's reservations

-- Test as service role
SET request.jwt.claims = '{"role": "service_role"}';
SELECT * FROM reservations; -- Should return all reservations
```

## Important Notes

1. **Service Role**: The server uses `SUPABASE_SERVICE_ROLE_KEY` which bypasses RLS.
   This is necessary for webhooks and admin operations.

2. **Anon Key**: Client-side uses `VITE_SUPABASE_ANON_KEY` which respects RLS.
   This is why RLS is critical for client-side security.

3. **Testing**: Always test policies in a staging environment first.

4. **Performance**: Consider adding indexes on columns used in RLS policies.
