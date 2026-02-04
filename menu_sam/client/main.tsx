import * as React from "react";
import { createRoot, type Root } from "react-dom/client";

import App from "./App";

declare global {
  // eslint-disable-next-line no-var
  var __SAM_ROOT__: Root | undefined;
}

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root element not found");
}

const root = globalThis.__SAM_ROOT__ ?? createRoot(container);
globalThis.__SAM_ROOT__ = root;

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

if (import.meta.hot) {
  import.meta.hot.accept();
}
