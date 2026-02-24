import { NavLink, useLocation } from "react-router-dom";

import { cn } from "@/lib/utils";

const baseClass =
  "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50";
const activeClass = "bg-background text-foreground shadow-sm";
const inactiveClass = "hover:bg-background/50 hover:text-foreground";

export function AdminHomepageNav() {
  const { pathname } = useLocation();
  const isContent = pathname.startsWith("/admin/content");

  return (
    <div className="inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground">
      <NavLink
        to="/admin/homepage"
        end
        className={({ isActive }) =>
          cn(baseClass, isActive ? activeClass : inactiveClass)
        }
      >
        Page d'accueil
      </NavLink>
      <NavLink
        to="/admin/content"
        className={() =>
          cn(baseClass, isContent ? activeClass : inactiveClass)
        }
      >
        Pages & Blog
      </NavLink>
    </div>
  );
}
