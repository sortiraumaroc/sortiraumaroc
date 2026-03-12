import { NavLink } from "react-router-dom";

import { cn } from "@/lib/utils";
import { isAdminSuperadmin } from "@/lib/adminApi";

const ITEMS: Array<{ label: string; to: string; superadminOnly?: boolean }> = [
  { label: "Collaborateurs", to: "/admin/collaborators" },
  { label: "Suivi d'activité", to: "/admin/activity-tracking", superadminOnly: true },
];

export function AdminCollaboratorsNav() {
  const isSuperadmin = isAdminSuperadmin();

  const visibleItems = ITEMS.filter((item) => !item.superadminOnly || isSuperadmin);

  return (
    <div className="inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground">
      {visibleItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === "/admin/collaborators"}
          className={({ isActive }) =>
            cn(
              "inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-semibold ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
              isActive
                ? "bg-[#a3001d] text-white shadow-sm"
                : "hover:bg-background/50 hover:text-foreground",
            )
          }
        >
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}
