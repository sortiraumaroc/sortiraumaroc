import * as React from "react";

import { Navigate, useLocation } from "react-router-dom";

import { useProSession } from "@/components/pro/use-pro-session";
import { ProPlaceProvider } from "@/contexts/pro-place-context";

function ProRouteLoader() {
  return (
    <main className="min-h-screen bg-white text-black">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center px-6">
        <div className="w-full max-w-sm rounded-2xl border border-black/10 bg-black/5 p-6">
          <div className="text-lg font-semibold">Espace PRO</div>
          <div className="mt-1 text-sm text-black/70">Chargement…</div>
        </div>
      </div>
    </main>
  );
}

export function ProProtectedRoute({ children }: { children: React.ReactNode }) {
  const { state } = useProSession();
  const location = useLocation();

  if (state.status === "loading") return <ProRouteLoader />;

  if (state.status === "signedOut") {
    return <Navigate to="/pro/login" replace state={{ from: location.pathname }} />;
  }

  const userId = state.status === "signedIn" ? state.userId : null;

  return (
    <ProPlaceProvider userId={userId}>
      {children}
    </ProPlaceProvider>
  );
}
