/**
 * PushNotificationPrompt
 *
 * A top banner asking users to enable push notifications.
 * Works for both authenticated and anonymous users.
 * Shows "Accepter" (red/white) and "Refuser" (black text).
 * Dismissed for 7 days if the user clicks "Refuser".
 */

import { Bell } from "lucide-react";
import { useState } from "react";
import { usePushNotifications } from "@/hooks/usePushNotifications";

export function PushNotificationPrompt() {
  const { shouldShowPrompt, requestPermission, dismissPrompt, loading } =
    usePushNotifications();
  const [visible, setVisible] = useState(true);

  if (!shouldShowPrompt || !visible) return null;

  const handleEnable = async () => {
    await requestPermission();
    setVisible(false);
  };

  const handleDismiss = () => {
    dismissPrompt();
    setVisible(false);
  };

  return (
    <div className="bg-white border-b border-slate-200 px-4 py-2.5">
      <div className="max-w-screen-xl mx-auto flex items-center justify-center gap-3 text-sm flex-wrap">
        <Bell className="h-4 w-4 text-[#a3001d] shrink-0" />
        <span className="text-slate-700">
          Activez les notifications pour ne rien manquer de nos bons plans et offres
        </span>
        <button
          onClick={handleEnable}
          disabled={loading}
          className="shrink-0 px-4 py-1.5 bg-[#a3001d] text-white text-xs font-semibold rounded-lg hover:bg-[#8a0018] transition disabled:opacity-50"
        >
          {loading ? "..." : "Accepter"}
        </button>
        <button
          onClick={handleDismiss}
          className="shrink-0 px-3 py-1.5 text-xs font-medium text-black hover:text-slate-600 transition"
        >
          Refuser
        </button>
      </div>
    </div>
  );
}
