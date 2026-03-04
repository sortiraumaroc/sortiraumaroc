import { NavLink } from "react-router-dom";

import { cn } from "@/lib/utils";
import { usePlatformSettings } from "@/hooks/usePlatformSettings";

const BASE_ITEMS: Array<{ label: string; to: string }> = [
  { label: "Réservations", to: "/admin/reservations" },
  { label: "Liste d'attente", to: "/admin/waitlist" },
  { label: "Offres & packs", to: "/admin/deals" },
];

const RAMADAN_ITEMS: Array<{ label: string; to: string }> = [
  { label: "Spécial Ramadan", to: "/admin/ramadan" },
  { label: "Ftour", to: "/admin/ftour" },
];

export function AdminReservationsNav() {
  const { settings } = usePlatformSettings();
  const ramadanEnabled = settings?.ramadan?.enabled === true;

  const items = ramadanEnabled ? [...BASE_ITEMS, ...RAMADAN_ITEMS] : BASE_ITEMS;

  return (
    <div className="inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground">
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === "/admin/reservations"}
          className={({ isActive }) =>
            cn(
              "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
              isActive
                ? "bg-background text-foreground shadow-sm"
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
