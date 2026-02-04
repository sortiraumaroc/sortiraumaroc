import * as React from "react";

import { Navigate, useLocation } from "react-router-dom";

import { useSuperadminSession } from "@/components/superadmin/use-superadmin-session";

function SuperadminRouteLoader() {
  return (
    <main className="min-h-screen bg-black text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl items-center justify-center px-6">
        <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="text-lg font-semibold">SUPERADMIN</div>
          <div className="mt-1 text-sm text-white/70">Chargement…</div>
        </div>
      </div>
    </main>
  );
}

export function SuperadminProtectedRoute({ children }: { children: React.ReactNode }) {
  const { state } = useSuperadminSession();
  const location = useLocation();

  if (state.status === "loading") return <SuperadminRouteLoader />;

  if (state.status === "signedOut") {
    return <Navigate to="/superadmin/login" replace state={{ from: location.pathname }} />;
  }

  if (state.mustChangePassword && location.pathname !== "/superadmin/force-password") {
    return <Navigate to="/superadmin/force-password" replace />;
  }

  if (state.role !== "SUPERADMIN") {
    return <Navigate to="/superadmin/login" replace state={{ from: location.pathname }} />;
  }

  return <>{children}</>;
}
