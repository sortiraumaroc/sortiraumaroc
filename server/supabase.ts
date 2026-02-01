/**
 * Supabase client instances for server-side use
 * Re-exports convenient instances for common use cases
 */

import { getAdminSupabase } from "./supabaseAdmin";

// Admin Supabase client (service role - full access)
export const adminSupabase = getAdminSupabase();

// Consumer Supabase client (same as admin for server-side operations)
// Note: On the server, we use the service role key for all operations
// and handle authorization in our route handlers
export const consumerSupabase = getAdminSupabase();
