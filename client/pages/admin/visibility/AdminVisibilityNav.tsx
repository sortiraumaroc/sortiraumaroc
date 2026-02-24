import { NavLink, useLocation } from "react-router-dom";

import { cn } from "@/lib/utils";

const baseClass =
  "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50";
const activeClass = "bg-background text-foreground shadow-sm";
const inactiveClass = "hover:bg-background/50 hover:text-foreground";

export function AdminVisibilityNav() {
  const { pathname } = useLocation();

  // Marketing covers push-campaigns, banners, wheel
  const isMarketing =
    pathname.startsWith("/admin/push-campaigns") ||
    pathname.startsWith("/admin/banners") ||
    pathname.startsWith("/admin/wheel");

  // Media Factory covers production-media, messages, partners, production-media/compta
  const isMediaFactory =
    pathname.startsWith("/admin/production-media") ||
    pathname.startsWith("/admin/messages") ||
    pathname.startsWith("/admin/partners");

  return (
    <div className="inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground">
      <NavLink
        to="/admin/visibility"
        end
        className={({ isActive }) =>
          cn(baseClass, isActive ? activeClass : inactiveClass)
        }
      >
        Visibilité
      </NavLink>
      <NavLink
        to="/admin/ads"
        end
        className={({ isActive }) =>
          cn(baseClass, isActive ? activeClass : inactiveClass)
        }
      >
        Publicités
      </NavLink>
      <NavLink
        to="/admin/push-campaigns"
        className={() =>
          cn(baseClass, isMarketing ? activeClass : inactiveClass)
        }
      >
        Marketing
      </NavLink>
      <NavLink
        to="/admin/production-media"
        className={() =>
          cn(baseClass, isMediaFactory ? activeClass : inactiveClass)
        }
      >
        Media Factory
      </NavLink>
    </div>
  );
}
