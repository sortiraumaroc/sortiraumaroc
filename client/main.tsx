import { createRoot } from "react-dom/client";
import { HelmetProvider } from "react-helmet-async";

import "./global.css";

import App from "./App";
import { initConsumerAuth } from "@/lib/auth";
import { I18nProvider } from "@/lib/i18n";
import { installChunkLoadRecovery } from "@/lib/chunkRecovery";
import { installSafeFetch } from "@/lib/safeFetch";

installChunkLoadRecovery();
installSafeFetch();
initConsumerAuth();

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(
    <HelmetProvider>
      <I18nProvider>
        <App />
      </I18nProvider>
    </HelmetProvider>,
  );
}
