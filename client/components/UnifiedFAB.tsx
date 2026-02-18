/**
 * UnifiedFAB — Bouton flottant unifié pour mobile & desktop
 *
 * Combine 3 actions en un seul FAB avec fan-out vertical :
 *   1. Sam AI (MessageCircle) — ouvre le chat IA
 *   2. Bug Report (CircleHelp) — capture screenshot + formulaire
 *   3. Scroll to top (ArrowUp) — remonte en haut (mobile only, scroll > 400px)
 */

import * as React from "react";
import {
  Plus,
  X,
  MessageCircle,
  CircleHelp,
  ArrowUp,
  Send,
  Camera,
  Loader2,
  CheckCircle2,
  LifeBuoy,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocation, useSearchParams } from "react-router-dom";
import { useSam } from "../hooks/useSam";
import { SamChatWindow } from "./sam/SamChatWindow";
import { SupportChatOverlay } from "./support/SupportChatOverlay";
import { isAuthed, AUTH_CHANGED_EVENT } from "@/lib/auth";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BugReportState = "idle" | "capturing" | "open" | "sending" | "sent";

// ---------------------------------------------------------------------------
// Sub-button component
// ---------------------------------------------------------------------------

function FABSubButton({
  icon: Icon,
  label,
  onClick,
  index,
  expanded,
  className,
  mobileOnly = false,
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  index: number;
  expanded: boolean;
  className?: string;
  mobileOnly?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 transition-all duration-200",
        expanded
          ? "opacity-100 translate-y-0 scale-100"
          : "opacity-0 translate-y-2 scale-90 pointer-events-none",
        mobileOnly && "md:hidden",
      )}
      style={{ transitionDelay: expanded ? `${index * 60}ms` : "0ms" }}
    >
      <span className="rounded-lg bg-gray-900/80 px-2.5 py-1 text-xs font-medium text-white whitespace-nowrap shadow-sm">
        {label}
      </span>
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={cn(
          "flex h-11 w-11 items-center justify-center rounded-full shadow-md border border-gray-200",
          "bg-white text-gray-700 transition-all hover:scale-105 active:scale-95",
          className,
        )}
      >
        <Icon className="h-5 w-5" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function UnifiedFAB() {
  // --- Universe from URL ---
  const [searchParams] = useSearchParams();
  const currentUniverse = searchParams.get("universe") || "restaurants";

  // --- Sam state ---
  const sam = useSam(currentUniverse);

  // --- FAB state ---
  const [expanded, setExpanded] = React.useState(false);

  // --- Support state ---
  const [supportOpen, setSupportOpen] = React.useState(false);
  const [authed, setAuthed] = React.useState(() => isAuthed());

  React.useEffect(() => {
    const sync = () => setAuthed(isAuthed());
    window.addEventListener(AUTH_CHANGED_EVENT, sync);
    return () => window.removeEventListener(AUTH_CHANGED_EVENT, sync);
  }, []);

  // --- Bug report state ---
  const [bugState, setBugState] = React.useState<BugReportState>("idle");
  const [bugMessage, setBugMessage] = React.useState("");
  const [bugScreenshot, setBugScreenshot] = React.useState<string | null>(null);
  const [bugError, setBugError] = React.useState<string | null>(null);

  // --- Scroll state ---
  const [showScrollTop, setShowScrollTop] = React.useState(false);

  // --- Location ---
  const location = useLocation();
  const isAdminPage = location.pathname.startsWith("/admin");

  // ---------------------------------------------------------------------------
  // Scroll listener
  // ---------------------------------------------------------------------------
  React.useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop((window.scrollY || document.documentElement.scrollTop) > 400);
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close fan when Sam opens or bug/support dialog opens
  React.useEffect(() => {
    if (sam.isOpen || supportOpen || bugState !== "idle") setExpanded(false);
  }, [sam.isOpen, supportOpen, bugState]);

  // Escape key handler
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (supportOpen) {
          setSupportOpen(false);
        } else if (bugState !== "idle" && bugState !== "sending") {
          handleBugClose();
        } else if (expanded) {
          setExpanded(false);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [expanded, bugState, supportOpen]);

  // ---------------------------------------------------------------------------
  // Bug report logic (from BugReportWidget.tsx)
  // ---------------------------------------------------------------------------
  const captureScreenshot = React.useCallback(async () => {
    setBugState("capturing");
    try {
      const fab = document.getElementById("unified-fab");
      if (fab) fab.style.display = "none";

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

      if (fab) fab.style.display = "";
      setBugScreenshot(canvas.toDataURL("image/png", 0.8));
      setBugState("open");
    } catch (err) {
      console.error("[BugReport] Screenshot capture failed:", err);
      const fab = document.getElementById("unified-fab");
      if (fab) fab.style.display = "";
      setBugState("open");
    }
  }, []);

  const handleBugOpen = React.useCallback(() => {
    setExpanded(false);
    setBugError(null);
    setBugMessage("");
    setBugScreenshot(null);
    captureScreenshot();
  }, [captureScreenshot]);

  const handleBugClose = React.useCallback(() => {
    setBugState("idle");
    setBugMessage("");
    setBugScreenshot(null);
    setBugError(null);
  }, []);

  const handleBugSubmit = React.useCallback(async () => {
    if (!bugMessage.trim()) {
      setBugError("Veuillez décrire le bug rencontré.");
      return;
    }
    setBugState("sending");
    setBugError(null);
    try {
      const payload: Record<string, unknown> = {
        url: window.location.href,
        message: bugMessage.trim(),
        userAgent: navigator.userAgent,
        screenWidth: window.innerWidth,
        screenHeight: window.innerHeight,
        timestamp: new Date().toISOString(),
      };
      if (bugScreenshot) payload.screenshot = bugScreenshot;

      const res = await fetch("/api/bug-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Erreur lors de l'envoi");
      }
      setBugState("sent");
      setTimeout(() => handleBugClose(), 2000);
    } catch (err: any) {
      console.error("[BugReport] Submit failed:", err);
      setBugError(err.message || "Erreur lors de l'envoi du rapport.");
      setBugState("open");
    }
  }, [bugMessage, bugScreenshot, handleBugClose]);

  // ---------------------------------------------------------------------------
  // Action handlers
  // ---------------------------------------------------------------------------
  const handleMainClick = () => {
    if (sam.isOpen) {
      sam.setIsOpen(false);
    } else if (supportOpen) {
      setSupportOpen(false);
    } else {
      setExpanded((prev) => !prev);
    }
  };

  const handleOpenSupport = () => {
    setExpanded(false);
    setSupportOpen(true);
  };

  const handleOpenSam = () => {
    setExpanded(false);
    sam.setIsOpen(true);
  };

  const handleScrollToTop = () => {
    setExpanded(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // ---------------------------------------------------------------------------
  // Main button icon
  // ---------------------------------------------------------------------------
  const isActive = sam.isOpen || supportOpen || expanded;
  const MainIcon = isActive ? X : Plus;

  // Don't render on admin pages
  if (isAdminPage) return null;

  return (
    <>
      {/* Sam Chat Window */}
      {sam.isOpen && (
        <SamChatWindow
          messages={sam.messages}
          isLoading={sam.isLoading}
          onSend={sam.sendMessage}
          onClear={sam.clearMessages}
          onClose={() => sam.setIsOpen(false)}
          universe={currentUniverse}
        />
      )}

      {/* Support Overlay */}
      {supportOpen && (
        <SupportChatOverlay
          onClose={() => setSupportOpen(false)}
          enabled={authed}
        />
      )}

      {/* Bug Report Dialog */}
      {bugState !== "idle" && bugState !== "capturing" && (
        <>
          <div
            className="fixed inset-0 z-[60] bg-black/30"
            onClick={bugState === "sending" ? undefined : handleBugClose}
          />
          <div
            className={cn(
              "fixed z-[60] bg-white rounded-xl shadow-2xl border border-gray-200",
              "w-[90vw] max-w-md",
              "bottom-6 end-6",
              "animate-in fade-in slide-in-from-bottom-4 duration-200",
            )}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-50">
                  <CircleHelp className="h-4 w-4 text-red-600" />
                </div>
                <h3 className="text-sm font-semibold text-gray-900">Signaler un bug</h3>
              </div>
              <button
                type="button"
                onClick={handleBugClose}
                disabled={bugState === "sending"}
                className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {bugState === "sent" ? (
              <div className="flex flex-col items-center gap-3 px-4 pb-6 pt-4">
                <CheckCircle2 className="h-10 w-10 text-green-500" />
                <p className="text-sm font-medium text-gray-700">Merci ! Votre rapport a été envoyé.</p>
              </div>
            ) : (
              <div className="space-y-3 px-4 pb-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Page concernée</label>
                  <div className="w-full truncate rounded-md border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
                    {window.location.href}
                  </div>
                </div>
                {bugScreenshot && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-500">
                      <Camera className="me-1 inline h-3 w-3" />
                      Capture d&apos;écran (automatique)
                    </label>
                    <div className="w-full overflow-hidden rounded-md border border-gray-200 bg-gray-100">
                      <img src={bugScreenshot} alt="Capture" className="h-auto max-h-32 w-full object-cover object-top" />
                    </div>
                  </div>
                )}
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-500">Décrivez le bug *</label>
                  <textarea
                    value={bugMessage}
                    onChange={(e) => setBugMessage(e.target.value)}
                    placeholder="Expliquez ce qui ne fonctionne pas..."
                    rows={3}
                    disabled={bugState === "sending"}
                    className={cn(
                      "flex w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm",
                      "resize-none placeholder:text-gray-400",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/30 focus-visible:border-red-400",
                      "disabled:opacity-50",
                    )}
                  />
                </div>
                {bugError && <p className="text-xs text-red-600">{bugError}</p>}
                <button
                  type="button"
                  onClick={handleBugSubmit}
                  disabled={bugState === "sending"}
                  className={cn(
                    "flex w-full items-center justify-center gap-2",
                    "rounded-lg px-4 py-2.5 text-sm font-medium",
                    "bg-red-600 text-white",
                    "hover:bg-red-700 active:bg-red-800",
                    "disabled:cursor-not-allowed disabled:opacity-60",
                    "transition-colors",
                  )}
                >
                  {bugState === "sending" ? (
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

      {/* Capturing spinner (shown over the FAB position) */}
      {bugState === "capturing" && (
        <div className="fixed bottom-6 end-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-white shadow-lg border border-gray-200">
          <Loader2 className="h-5 w-5 animate-spin text-gray-500" />
        </div>
      )}

      {/* Fan-out backdrop (tap to close) */}
      {expanded && !sam.isOpen && !supportOpen && bugState === "idle" && (
        <div className="fixed inset-0 z-40" onClick={() => setExpanded(false)} />
      )}

      {/* FAB container */}
      {bugState !== "capturing" && (
        <div id="unified-fab" className="fixed bottom-6 end-6 z-50 flex flex-col-reverse items-end gap-3">
          {/* Main button */}
          <button
            type="button"
            onClick={handleMainClick}
            aria-label={isActive ? "Fermer" : "Menu actions"}
            className={cn(
              "flex h-14 w-14 items-center justify-center rounded-full shadow-lg",
              "transition-all duration-300 hover:scale-105 active:scale-95",
              isActive
                ? "bg-gray-700 text-white"
                : "bg-primary text-white",
            )}
          >
            <MainIcon className={cn("h-6 w-6 transition-transform duration-300", expanded && "rotate-45")} />
          </button>

          {/* Sub-buttons (only when expanded, not when sam/bug open) */}
          {!sam.isOpen && !supportOpen && bugState === "idle" && (
            <>
              <FABSubButton
                icon={MessageCircle}
                label="Sam AI"
                onClick={handleOpenSam}
                index={0}
                expanded={expanded}
                className="text-primary"
              />
              <FABSubButton
                icon={LifeBuoy}
                label="Support"
                onClick={handleOpenSupport}
                index={1}
                expanded={expanded}
                className="text-emerald-600"
              />
              <FABSubButton
                icon={CircleHelp}
                label="Bug"
                onClick={handleBugOpen}
                index={2}
                expanded={expanded}
                className="text-red-500"
              />
              {showScrollTop && (
                <FABSubButton
                  icon={ArrowUp}
                  label="Haut"
                  onClick={handleScrollToTop}
                  index={3}
                  expanded={expanded}
                  mobileOnly
                />
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
