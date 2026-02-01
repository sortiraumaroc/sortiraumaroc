import { getAdminSupabase } from "./supabaseAdmin";

type AdminNotificationRow = {
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

export async function emitAdminNotification(input: AdminNotificationRow): Promise<void> {
  try {
    const supabase = getAdminSupabase();

    const payload = {
      type: input.type,
      title: input.title,
      body: input.body,
      data: input.data ?? {},
    };

    const { error } = await supabase.from("admin_notifications").insert(payload);
    if (error) {
      console.error("emitAdminNotification insert failed", error);
    }
  } catch (e) {
    console.error("emitAdminNotification crashed", e);
  }
}
