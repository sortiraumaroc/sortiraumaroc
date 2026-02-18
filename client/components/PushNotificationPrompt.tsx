/**
 * PushNotificationPrompt
 *
 * A subtle banner that appears at the bottom of the screen to ask
 * the user's permission for push notifications.
 * Only shown when:
 *   - The user is authenticated
 *   - The browser supports push
 *   - Permission is "default" (not yet asked)
 *   - The user hasn't dismissed the prompt recently
 */

import { Bell, X } from "lucide-react";
import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { usePushNotifications } from "@/hooks/usePushNotifications";

export function PushNotificationPrompt() {
  const { t } = useI18n();
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
    <div className="fixed bottom-4 left-4 right-4 md:start-auto md:end-4 md:w-[420px] z-[9998] animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="bg-white border border-slate-200 rounded-xl shadow-xl p-4 flex items-start gap-3">
        {/* Bell icon */}
        <div className="shrink-0 mt-0.5 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
          <Bell className="w-5 h-5 text-primary" />
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900">
            {t("push.prompt_title")}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {t("push.prompt_description")}
          </p>

          {/* Buttons */}
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={handleEnable}
              disabled={loading}
              className="px-4 py-1.5 bg-primary text-white text-sm font-medium rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {loading ? t("push.prompt_enabling") : t("push.prompt_enable")}
            </button>
            <button
              onClick={handleDismiss}
              className="px-3 py-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors"
            >
              {t("push.prompt_later")}
            </button>
          </div>
        </div>

        {/* Close button */}
        <button
          onClick={handleDismiss}
          className="shrink-0 text-slate-400 hover:text-slate-600 transition-colors"
          aria-label="Fermer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
