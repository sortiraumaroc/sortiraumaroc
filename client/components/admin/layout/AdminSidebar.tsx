import { useEffect, useMemo, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";

import { ChevronDown } from "lucide-react";

import { ADMIN_NAV, type AdminNavItem } from "@/components/admin/layout/adminNav";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { isAdminSuperadmin } from "@/lib/adminApi";

export function AdminSidebar(props: { onNavigate?: () => void }) {
  const location = useLocation();
  const isSuperadmin = isAdminSuperadmin();

  // Filter nav items based on role
  const filteredNav = useMemo((): AdminNavItem[] => {
    return ADMIN_NAV.filter((item) => {
      if (item.superadminOnly && !isSuperadmin) return false;
      return true;
    });
  }, [isSuperadmin]);

  const activeGroupKey = useMemo(() => {
    for (const item of filteredNav) {
      if (item.type !== "group") continue;
      const groupActive = item.children.some(
        (child) => location.pathname === child.to || location.pathname.startsWith(`${child.to}/`),
      );
      if (groupActive) return item.label;
    }
    return null;
  }, [location.pathname, filteredNav]);

  // Accordéon: un seul groupe ouvert à la fois.
  const [openGroupKey, setOpenGroupKey] = useState<string | null>(activeGroupKey);

  useEffect(() => {
    // À chaque navigation, on ouvre le groupe actif (si la route est dedans), sinon on referme tout.
    setOpenGroupKey(activeGroupKey);
  }, [activeGroupKey]);

  return (
    <aside className="h-full w-full">
      <div className="min-h-full rounded-lg border border-slate-200 bg-white">
        <div className="p-4 border-b border-slate-200">
          <div className="flex items-center gap-2.5">
            <img
              src="https://cdn.builder.io/api/v1/image/assets%2F9d79e075af8c480ea94841fd41e63e5c%2Fc4b847e82d5c43669264291d1a767312?format=webp&width=800"
              alt="Sortir Au Maroc"
              className="w-10 h-10 rounded object-contain"
            />
            <div>
              <div className="text-sm font-bold text-[#a3001d] leading-none">
                Sortir Au Maroc
              </div>
              <div className="text-[9px] text-slate-500 leading-tight mt-0.5">
                La plateforme de<br />réservation en ligne
              </div>
            </div>
          </div>
        </div>

        <nav className="p-2">
          <ul className="space-y-1">
            {filteredNav.map((item) => {
              if (item.type === "link") {
                return (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      onClick={() => props.onNavigate?.()}
                      className={({ isActive }) =>
                        cn(
                          "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition",
                          isActive ? "bg-primary text-white" : "text-slate-700 hover:bg-slate-100 hover:text-slate-900",
                        )
                      }
                      end={item.to === "/admin"}
                    >
                      <item.icon className="h-4 w-4" />
                      {item.label}
                    </NavLink>
                  </li>
                );
              }

              const groupKey = item.label;
              const groupActive = item.children.some(
                (child) => location.pathname === child.to || location.pathname.startsWith(`${child.to}/`),
              );
              const open = openGroupKey === groupKey;

              return (
                <li key={`group-${groupKey}`}>
                  <Collapsible
                    open={open}
                    onOpenChange={(next) => {
                      setOpenGroupKey(next ? groupKey : null);
                    }}
                  >
                    <CollapsibleTrigger asChild>
                      <button
                        type="button"
                        className={cn(
                          "flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-extrabold transition",
                          groupActive || open ? "text-primary" : "text-slate-800 hover:bg-slate-100",
                        )}
                        aria-expanded={open}
                      >
                        <span className="flex flex-1 items-center gap-2">
                          <item.icon className={cn("h-4 w-4", groupActive || open ? "text-primary" : "text-slate-700")} />
                          {item.label}
                        </span>
                        <ChevronDown
                          className={cn(
                            "ml-auto h-4 w-4 text-slate-500 transition-transform",
                            open ? "rotate-180" : "rotate-0",
                          )}
                        />
                      </button>
                    </CollapsibleTrigger>

                    <CollapsibleContent>
                      <ul className="mt-1 ml-3 space-y-1 border-l border-slate-200 pl-3">
                        {item.children.map((child) => (
                          <li key={child.to}>
                            <NavLink
                              to={child.to}
                              onClick={() => props.onNavigate?.()}
                              className={({ isActive }) =>
                                cn(
                                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition",
                                  isActive
                                    ? "bg-primary text-white"
                                    : "text-slate-700 hover:bg-slate-100 hover:text-slate-900",
                                )
                              }
                              end
                            >
                              <child.icon className="h-4 w-4" />
                              {child.label}
                            </NavLink>
                          </li>
                        ))}
                      </ul>
                    </CollapsibleContent>
                  </Collapsible>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </aside>
  );
}
