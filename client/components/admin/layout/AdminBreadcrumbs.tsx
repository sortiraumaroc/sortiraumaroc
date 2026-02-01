import { Link, useLocation } from "react-router-dom";

import { cn } from "@/lib/utils";

const LABELS: Record<string, string> = {
  admin: "Admin",
  users: "Utilisateurs",
  pros: "Pros",
  establishments: "Établissements",
  reservations: "Réservations",
  payments: "Paiements",
  reviews: "Avis & signalements",
  deals: "Offres & packs",
  support: "Support",
  content: "Contenu",
  settings: "Paramètres",
  collaborators: "Collaborateurs",
  roles: "Rôles & permissions",
  logs: "Journaux",
};

function labelFor(seg: string): string {
  return LABELS[seg] ?? seg;
}

export function AdminBreadcrumbs() {
  const { pathname } = useLocation();
  const segments = pathname.split("/").filter(Boolean);
  if (!segments.length) return null;

  const crumbs = segments.map((seg, idx) => {
    const to = "/" + segments.slice(0, idx + 1).join("/");
    const isLast = idx === segments.length - 1;
    return { seg, to, isLast };
  });

  return (
    <div className="flex flex-wrap items-center gap-1 text-xs text-slate-600">
      {crumbs.map((c, idx) => (
        <div key={c.to} className="flex items-center gap-1">
          {idx > 0 ? <span className="text-slate-300">/</span> : null}
          {c.isLast ? (
            <span className={cn("font-semibold text-slate-900")}>{labelFor(c.seg)}</span>
          ) : (
            <Link to={c.to} className="hover:text-primary">
              {labelFor(c.seg)}
            </Link>
          )}
        </div>
      ))}
    </div>
  );
}
