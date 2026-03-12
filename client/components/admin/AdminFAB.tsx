/**
 * AdminFAB — Bouton flottant dédié au back-office
 *
 * Deux actions en fan-out vertical :
 *   1. SAM AI Pro  (Sparkles) — chat IA connaissant admin + pro
 *   2. Support Tech (LifeBuoy) — contacter le responsable technique
 */

import * as React from "react";
import {
  Plus,
  X,
  Sparkles,
  LifeBuoy,
  Send,
  Camera,
  Loader2,
  CheckCircle2,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSam } from "@/hooks/useSam";
import { loadAdminSessionToken } from "@/lib/adminApi";
import { useLocation } from "react-router-dom";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SupportState = "idle" | "capturing" | "open" | "sending" | "sent";

// ---------------------------------------------------------------------------
// Sub-button
// ---------------------------------------------------------------------------

function FABSubButton({
  icon: Icon,
  label,
  onClick,
  index,
  expanded,
  className,
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
  index: number;
  expanded: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 transition-all duration-200",
        expanded
          ? "opacity-100 translate-y-0 scale-100"
          : "opacity-0 translate-y-2 scale-90 pointer-events-none",
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
// Admin AI Chat Panel
// ---------------------------------------------------------------------------

function AdminAiChatPanel({ onClose }: { onClose: () => void }) {
  const sam = useSam(undefined, undefined, "admin");
  const messagesEndRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = React.useState("");

  React.useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sam.messages]);

  React.useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = () => {
    const text = draft.trim();
    if (!text || sam.isLoading) return;
    setDraft("");
    sam.sendMessage(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="fixed bottom-24 end-6 z-[60] w-[400px] max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 bg-white shadow-2xl flex flex-col overflow-hidden"
      style={{ height: "min(600px, calc(100vh - 8rem))" }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-[#a3001d] to-[#c41d3c]">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20">
          <Sparkles className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-white leading-tight">SAM AI Pro</div>
          <div className="text-[10px] text-white/70">Assistant back-office</div>
        </div>
        <button
          type="button"
          onClick={() => { sam.clearMessages(); }}
          className="h-7 w-7 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition"
          title="Nouvelle conversation"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onClose}
          className="h-7 w-7 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {sam.messages.length === 0 && (
          <div className="text-center py-8 space-y-3">
            <div className="flex justify-center">
              <div className="h-14 w-14 rounded-full bg-gradient-to-br from-[#a3001d]/10 to-[#a3001d]/5 flex items-center justify-center">
                <Sparkles className="h-7 w-7 text-[#a3001d]" />
              </div>
            </div>
            <div>
              <div className="font-bold text-slate-900 text-sm">SAM AI Pro</div>
              <div className="text-xs text-slate-500 mt-1 max-w-[280px] mx-auto">
                Je connais sam.ma/admin et sam.ma/pro par cœur. Pose-moi n'importe quelle question !
              </div>
            </div>
            <div className="flex flex-wrap justify-center gap-1.5 mt-3">
              {[
                "Comment créer une campagne push ?",
                "Expliquer les packs & offres",
                "Comment gérer les paiements ?",
                "Aide sur les créneaux pro",
              ].map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => { setDraft(""); sam.sendMessage(q); }}
                  className="rounded-full border border-slate-200 px-3 py-1.5 text-[11px] text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {sam.messages.map((msg) => (
          <div key={msg.id} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                msg.role === "user"
                  ? "bg-[#a3001d] text-white rounded-br-md"
                  : "bg-slate-100 text-slate-800 rounded-bl-md",
                msg.isLoading && "animate-pulse",
                msg.isError && "border border-red-200 bg-red-50 text-red-700",
              )}
            >
              {msg.isLoading ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span className="text-xs">Réflexion…</span>
                </div>
              ) : (
                <div className="whitespace-pre-wrap break-words">{msg.content}</div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-slate-100 px-3 py-2.5">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Pose ta question…"
            rows={1}
            className="flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#a3001d]/30 focus:border-[#a3001d] max-h-24 min-h-[36px]"
            style={{ height: "36px" }}
            onInput={(e) => {
              const t = e.currentTarget;
              t.style.height = "36px";
              t.style.height = Math.min(t.scrollHeight, 96) + "px";
            }}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!draft.trim() || sam.isLoading}
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition",
              draft.trim() && !sam.isLoading
                ? "bg-[#a3001d] text-white hover:bg-[#8a0019]"
                : "bg-slate-100 text-slate-400 cursor-not-allowed",
            )}
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Admin Support Panel
// ---------------------------------------------------------------------------

function AdminSupportPanel({ onClose }: { onClose: () => void }) {
  const location = useLocation();
  const [state, setState] = React.useState<SupportState>("idle");
  const [message, setMessage] = React.useState("");
  const [screenshot, setScreenshot] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (state === "open") textareaRef.current?.focus();
  }, [state]);

  // Open form immediately
  React.useEffect(() => {
    setState("open");
  }, []);

  const captureScreenshot = React.useCallback(async () => {
    setState("capturing");
    try {
      // Use html2canvas if available, otherwise fallback to a note
      const { default: html2canvas } = await import("html2canvas");
      // Capture only the visible viewport area (not the full scrollable page)
      const canvas = await html2canvas(document.body, {
        useCORS: true,
        scale: 0.4,
        logging: false,
        windowWidth: document.documentElement.clientWidth,
        windowHeight: document.documentElement.clientHeight,
        height: document.documentElement.clientHeight,
        y: window.scrollY,
        ignoreElements: (el) => {
          // Ignore the FAB itself to not capture it
          return el.closest?.("[data-admin-fab]") !== null;
        },
      });
      setScreenshot(canvas.toDataURL("image/jpeg", 0.5));
      setState("open");
    } catch {
      setState("open");
    }
  }, []);

  const handleSubmit = async () => {
    if (!message.trim()) return;
    setState("sending");
    setError(null);

    try {
      const adminKey = loadAdminSessionToken();
      const payload = {
        url: window.location.href,
        page: location.pathname,
        message: message.trim(),
        screenshot: screenshot ?? undefined,
        userAgent: navigator.userAgent,
        screenWidth: window.innerWidth,
        screenHeight: window.innerHeight,
        timestamp: new Date().toISOString(),
      };

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (adminKey) {
        headers["x-admin-session"] = adminKey;
      }

      let res: Response;
      try {
        res = await fetch("/api/admin/support-request", {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        });
      } catch {
        throw new Error("Impossible de contacter le serveur. Vérifiez votre connexion.");
      }

      if (!res.ok) {
        // If body is too large (413) or route not found (404)
        if (res.status === 413) {
          throw new Error("Le contenu est trop volumineux. Retirez la capture d'écran et réessayez.");
        }
        if (res.status === 404) {
          throw new Error("Route non disponible. Redémarrez le serveur.");
        }
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `Erreur serveur (${res.status})`);
      }

      setState("sent");
      setTimeout(() => {
        setState("idle");
        setMessage("");
        setScreenshot(null);
        onClose();
      }, 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur d'envoi");
      setState("open");
    }
  };

  return (
    <div
      className="fixed bottom-24 end-6 z-[60] w-[380px] max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 bg-white shadow-2xl flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-emerald-600 to-emerald-500">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20">
          <LifeBuoy className="h-5 w-5 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-white leading-tight">Support Technique</div>
          <div className="text-[10px] text-white/70">Contacter le responsable technique</div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="h-7 w-7 rounded-lg flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      <div className="p-4 space-y-3">
        {state === "sent" ? (
          <div className="text-center py-6 space-y-2">
            <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
            <div className="font-semibold text-slate-900 text-sm">Demande envoyée !</div>
            <div className="text-xs text-slate-500">Le responsable technique sera notifié.</div>
          </div>
        ) : (
          <>
            {/* Context badge */}
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500 bg-slate-50 rounded-lg px-2.5 py-1.5">
              <span className="font-medium text-slate-600">Page :</span>
              <span className="truncate">{location.pathname}</span>
            </div>

            {/* Message */}
            <div>
              <label className="text-xs font-semibold text-slate-600 mb-1 block">Décrivez votre problème</label>
              <textarea
                ref={textareaRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Ex: Le bouton de suppression ne fonctionne pas sur cette page…"
                rows={4}
                className="w-full resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
              />
            </div>

            {/* Screenshot */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={captureScreenshot}
                disabled={state === "capturing"}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition",
                  screenshot
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50",
                  state === "capturing" && "opacity-50",
                )}
              >
                {state === "capturing" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Camera className="h-3.5 w-3.5" />
                )}
                {screenshot ? "Capture jointe" : "Capturer l'écran"}
              </button>

              {screenshot && (
                <button
                  type="button"
                  onClick={() => setScreenshot(null)}
                  className="text-xs text-slate-400 hover:text-red-500 transition"
                >
                  Retirer
                </button>
              )}
            </div>

            {/* Screenshot preview */}
            {screenshot && (
              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <img src={screenshot} alt="Capture" className="w-full h-auto" />
              </div>
            )}

            {error && (
              <div className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</div>
            )}

            {/* Submit */}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!message.trim() || state === "sending"}
              className={cn(
                "w-full flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition",
                message.trim() && state !== "sending"
                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                  : "bg-slate-100 text-slate-400 cursor-not-allowed",
              )}
            >
              {state === "sending" ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Envoi…</>
              ) : (
                <><Send className="h-4 w-4" />Envoyer</>
              )}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main AdminFAB
// ---------------------------------------------------------------------------

export function AdminFAB() {
  const [expanded, setExpanded] = React.useState(false);
  const [aiOpen, setAiOpen] = React.useState(false);
  const [supportOpen, setSupportOpen] = React.useState(false);

  // Close fan when a panel opens
  const openAi = () => {
    setExpanded(false);
    setSupportOpen(false);
    setAiOpen(true);
  };
  const openSupport = () => {
    setExpanded(false);
    setAiOpen(false);
    setSupportOpen(true);
  };

  // Escape key
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (aiOpen) setAiOpen(false);
        else if (supportOpen) setSupportOpen(false);
        else if (expanded) setExpanded(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [aiOpen, supportOpen, expanded]);

  const anyPanelOpen = aiOpen || supportOpen;

  return (
    <div data-admin-fab>
      {/* Backdrop (fan expanded) */}
      {expanded && !anyPanelOpen && (
        <div
          className="fixed inset-0 z-[55]"
          onClick={() => setExpanded(false)}
        />
      )}

      {/* Panels */}
      {aiOpen && <AdminAiChatPanel onClose={() => setAiOpen(false)} />}
      {supportOpen && <AdminSupportPanel onClose={() => setSupportOpen(false)} />}

      {/* Fan-out sub-buttons */}
      <div className="fixed bottom-20 end-6 z-[56] flex flex-col items-end gap-2.5">
        <FABSubButton
          icon={Sparkles}
          label="SAM AI Pro"
          onClick={openAi}
          index={1}
          expanded={expanded && !anyPanelOpen}
          className="!text-[#a3001d] !border-[#a3001d]/20 hover:!bg-[#a3001d]/5"
        />
        <FABSubButton
          icon={LifeBuoy}
          label="Support technique"
          onClick={openSupport}
          index={0}
          expanded={expanded && !anyPanelOpen}
          className="!text-emerald-600 !border-emerald-200 hover:!bg-emerald-50"
        />
      </div>

      {/* Main FAB button */}
      <button
        type="button"
        onClick={() => {
          if (anyPanelOpen) {
            setAiOpen(false);
            setSupportOpen(false);
          } else {
            setExpanded((prev) => !prev);
          }
        }}
        className={cn(
          "fixed bottom-6 end-6 z-[57] flex h-12 w-12 items-center justify-center rounded-full shadow-lg transition-all duration-200",
          "hover:scale-105 active:scale-95",
          anyPanelOpen
            ? "bg-slate-700 text-white"
            : expanded
              ? "bg-slate-700 text-white rotate-45"
              : "bg-[#a3001d] text-white",
        )}
        aria-label="Menu d'aide"
      >
        {anyPanelOpen ? (
          <X className="h-5 w-5" />
        ) : (
          <Plus className="h-5 w-5 transition-transform duration-200" />
        )}
      </button>
    </div>
  );
}
