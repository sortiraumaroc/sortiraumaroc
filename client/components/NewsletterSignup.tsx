import { useState } from "react";
import { Mail, Check, Loader2 } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export function NewsletterSignup() {
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) return;

    setStatus("loading");
    setErrorMessage("");

    try {
      const response = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await response.json();

      if (response.status === 409) {
        // Already subscribed — treat as success
        setStatus("success");
        setEmail("");
        setTimeout(() => setStatus("idle"), 5000);
        return;
      }

      if (!response.ok) {
        setStatus("error");
        setErrorMessage(data.error || t("newsletter.error.generic"));
        return;
      }

      setStatus("success");
      setEmail("");

      // Reset to idle after 5 seconds
      setTimeout(() => setStatus("idle"), 5000);
    } catch {
      setStatus("error");
      setErrorMessage(t("newsletter.error.generic"));
    }
  };

  return (
    <div className="mt-4">
      <h4 className="font-bold mb-3 text-white">{t("newsletter.title")}</h4>
      <p className="text-sm text-gray-400 mb-3">{t("newsletter.subtitle")}</p>

      {status === "success" ? (
        <div className="flex items-center gap-2 text-green-400 text-sm">
          <Check className="w-4 h-4" />
          <span>{t("newsletter.success")}</span>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-2">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Mail className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("newsletter.placeholder")}
                className="w-full ps-9 pe-3 py-2 bg-white/10 border border-white/20 rounded-lg text-white text-sm placeholder:text-gray-500 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                disabled={status === "loading"}
                required
              />
            </div>
            <button
              type="submit"
              disabled={status === "loading" || !email.trim()}
              className="px-4 py-2 bg-primary hover:bg-primary/90 disabled:bg-primary/50 text-white text-sm font-bold rounded-lg transition-colors flex items-center gap-2"
            >
              {status === "loading" ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                t("newsletter.button")
              )}
            </button>
          </div>

          {status === "error" && errorMessage && (
            <p className="text-red-400 text-xs">{errorMessage}</p>
          )}
        </form>
      )}
    </div>
  );
}
