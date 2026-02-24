import { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";

import "./global.css";

import App from "./App";
import { initConsumerAuth } from "@/lib/auth";
import { I18nProvider } from "@/lib/i18n";
import { installChunkLoadRecovery } from "@/lib/chunkRecovery";
import { installSafeFetch } from "@/lib/safeFetch";

// ---------------------------------------------------------------------------
// Global Error Boundary — catches unhandled React render errors and shows a
// fallback instead of a blank white screen.
// ---------------------------------------------------------------------------
class GlobalErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[GlobalErrorBoundary]", error, info.componentStack);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f3f4f6" }}>
          <div style={{ background: "#fff", padding: 32, borderRadius: 12, boxShadow: "0 4px 24px rgba(0,0,0,.1)", maxWidth: 420, textAlign: "center" }}>
            <h1 style={{ color: "#dc2626", fontSize: 22, marginBottom: 12 }}>Une erreur est survenue</h1>
            <p style={{ color: "#6b7280", marginBottom: 20 }}>Nous avons été notifiés et travaillons à résoudre le problème.</p>
            <button
              onClick={() => window.location.reload()}
              style={{ padding: "10px 24px", background: "#f97316", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontSize: 15 }}
            >
              Rafraîchir la page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

installChunkLoadRecovery();
installSafeFetch();
initConsumerAuth();

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(
    <HelmetProvider>
      <GlobalErrorBoundary>
        <I18nProvider>
          <App />
        </I18nProvider>
      </GlobalErrorBoundary>
    </HelmetProvider>,
  );
}
