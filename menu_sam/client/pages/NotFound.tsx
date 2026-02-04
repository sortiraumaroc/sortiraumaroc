import * as React from "react";

import { Link, useLocation } from "react-router-dom";

import { Button } from "@/components/ui/button";

export default function NotFound() {
  const location = useLocation();

  React.useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname,
    );
  }, [location.pathname]);

  return (
    <div className="min-h-[70vh] px-4 py-16 text-center">
      <p className="text-sm font-semibold text-primary">404</p>
      <h1 className="mt-2 text-2xl font-semibold text-foreground">
        Page introuvable
      </h1>
      <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">
        Cette page n’existe pas (ou a été déplacée). Revenez au menu pour continuer.
      </p>
      <div className="mt-6 flex justify-center">
        <Button asChild className="h-11 rounded-2xl px-6">
          <Link to="/menu">Retour au menu</Link>
        </Button>
      </div>
    </div>
  );
}
