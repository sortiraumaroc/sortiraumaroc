import * as React from "react";
import { CircleHelp, Send, X, Camera, Loader2, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocation } from "react-router-dom";

type WidgetState = "idle" | "open" | "capturing" | "sending" | "sent";

export function BugReportWidget() {
  const [state, setState] = React.useState<WidgetState>("idle");
  const [message, setMessage] = React.useState("");
  const [screenshot, setScreenshot] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const location = useLocation();

  const currentUrl = window.location.href;

  const captureScreenshot = React.useCallback(async () => {
    setState("capturing");
    try {
      // Hide the widget before capturing
      const widget = document.getElementById("bug-report-widget");
      if (widget) widget.style.display = "none";

      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(document.body, {
        useCORS: true,
        allowTaint: true,
        logging: false,
        scale: window.devicePixelRatio > 1 ? 1.5 : 1,
        windowWidth: document.documentElement.scrollWidth,
        windowHeight: document.documentElement.scrollHeight,
        x: window.scrollX,
        y: window.scrollY,
        width: window.innerWidth,
        height: window.innerHeight,
      });

      // Restore widget visibility
      if (widget) widget.style.display = "";

      const dataUrl = canvas.toDataURL("image/png", 0.8);
      setScreenshot(dataUrl);
      setState("open");
    } catch (err) {
      console.error("[BugReport] Screenshot capture failed:", err);
      // Still open the dialog even if screenshot fails
      if (document.getElementById("bug-report-widget")) {
        document.getElementById("bug-report-widget")!.style.display = "";
      }
      setState("open");
    }
  }, []);

  const handleOpen = React.useCallback(() => {
    setError(null);
    setMessage("");
    setScreenshot(null);
    captureScreenshot();
  }, [captureScreenshot]);

  const handleClose = React.useCallback(() => {
    setState("idle");
    setMessage("");
    setScreenshot(null);
    setError(null);
  }, []);

  const handleSubmit = React.useCallback(async () => {
    if (!message.trim()) {
      setError("Veuillez décrire le bug rencontré.");
      return;
    }

    setState("sending");
    setError(null);

    try {
      const payload: Record<string, unknown> = {
        url: currentUrl,
        message: message.trim(),
        userAgent: navigator.userAgent,
        screenWidth: window.innerWidth,
        screenHeight: window.innerHeight,
        timestamp: new Date().toISOString(),
      };

      if (screenshot) {
        payload.screenshot = screenshot;
      }

      const res = await fetch("/api/bug-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Erreur lors de l'envoi");
      }

      setState("sent");
      setTimeout(() => {
        handleClose();
      }, 2000);
    } catch (err: any) {
      console.error("[BugReport] Submit failed:", err);
      setError(err.message || "Erreur lors de l'envoi du rapport.");
      setState("open");
    }
  }, [message, screenshot, currentUrl, handleClose]);

  // Close on Escape
  React.useEffect(() => {
    if (state === "idle") return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [state, handleClose]);

  // Don't render on admin pages
  if (location.pathname.startsWith("/admin")) return null;

  return (
    <div id="bug-report-widget" className="fixed bottom-6 end-6 z-50">
      {/* Floating "?" button */}
      {state === "idle" && (
        <button
          type="button"
          onClick={handleOpen}
          aria-label="Signaler un bug"
          className={cn(
            "flex items-center justify-center",
            "w-12 h-12 rounded-full",
            "bg-white text-gray-700 shadow-lg border border-gray-200",
            "transition-all duration-200 ease-in-out",
            "hover:shadow-xl hover:scale-105 active:scale-95",
          )}
        >
          <CircleHelp className="h-6 w-6" />
        </button>
      )}

      {/* Loading overlay while capturing */}
      {state === "capturing" && (
        <div className="flex items-center justify-center w-12 h-12 rounded-full bg-white shadow-lg border border-gray-200">
          <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
        </div>
      )}

      {/* Dialog */}
      {(state === "open" || state === "sending" || state === "sent") && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/30 z-40"
            onClick={state === "sending" ? undefined : handleClose}
          />

          {/* Panel */}
          <div
            ref={dialogRef}
            className={cn(
              "fixed z-50 bg-white rounded-xl shadow-2xl border border-gray-200",
              "w-[90vw] max-w-md",
              "bottom-6 end-6",
              "animate-in fade-in slide-in-from-bottom-4 duration-200",
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <div className="flex items-center gap-2">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-red-50">
                  <CircleHelp className="h-4 w-4 text-red-600" />
                </div>
                <h3 className="font-semibold text-gray-900 text-sm">
                  Signaler un bug
                </h3>
              </div>
              <button
                type="button"
                onClick={handleClose}
                disabled={state === "sending"}
                className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Success state */}
            {state === "sent" ? (
              <div className="px-4 pb-6 pt-4 flex flex-col items-center gap-3">
                <CheckCircle2 className="h-10 w-10 text-green-500" />
                <p className="text-sm text-gray-700 font-medium">
                  Merci ! Votre rapport a été envoyé.
                </p>
              </div>
            ) : (
              <div className="px-4 pb-4 space-y-3">
                {/* URL (read-only) */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Page concernée
                  </label>
                  <div className="w-full rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600 truncate">
                    {currentUrl}
                  </div>
                </div>

                {/* Screenshot preview */}
                {screenshot && (
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">
                      <Camera className="inline h-3 w-3 me-1" />
                      Capture d'écran (automatique)
                    </label>
                    <div className="w-full rounded-md border border-gray-200 overflow-hidden bg-gray-100">
                      <img
                        src={screenshot}
                        alt="Capture d'écran"
                        className="w-full h-auto max-h-32 object-cover object-top"
                      />
                    </div>
                  </div>
                )}

                {/* Message */}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Décrivez le bug *
                  </label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Expliquez ce qui ne fonctionne pas..."
                    rows={3}
                    disabled={state === "sending"}
                    className={cn(
                      "flex w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm",
                      "placeholder:text-gray-400 resize-none",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/30 focus-visible:border-red-400",
                      "disabled:opacity-50",
                    )}
                  />
                </div>

                {/* Error */}
                {error && (
                  <p className="text-xs text-red-600">{error}</p>
                )}

                {/* Submit */}
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={state === "sending"}
                  className={cn(
                    "w-full flex items-center justify-center gap-2",
                    "rounded-lg px-4 py-2.5 text-sm font-medium",
                    "bg-red-600 text-white",
                    "hover:bg-red-700 active:bg-red-800",
                    "disabled:opacity-60 disabled:cursor-not-allowed",
                    "transition-colors",
                  )}
                >
                  {state === "sending" ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Envoi en cours...
                    </>
                  ) : (
                    <>
                      <Send className="h-4 w-4" />
                      Envoyer le rapport
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
