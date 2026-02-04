import * as React from "react";

import { Link, useLocation } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { BarChart3, BookOpenCheck, LifeBuoy, LogOut, Receipt, Settings, ShieldAlert, Users, ScrollText } from "lucide-react";

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/superadmin/dashboard", label: "Vue globale", icon: <BarChart3 className="h-4 w-4" /> },
  { href: "/superadmin/accounts", label: "Comptes", icon: <Users className="h-4 w-4" /> },
  { href: "/superadmin/payments", label: "Paiements", icon: <Receipt className="h-4 w-4" /> },
  { href: "/superadmin/support", label: "Support", icon: <LifeBuoy className="h-4 w-4" /> },
  { href: "/superadmin/faq", label: "FAQ", icon: <BookOpenCheck className="h-4 w-4" /> },
  { href: "/superadmin/logs", label: "Logs", icon: <ScrollText className="h-4 w-4" /> },
  { href: "/superadmin/settings", label: "Système", icon: <Settings className="h-4 w-4" /> },
];

export function SuperadminShell({
  title,
  subtitle,
  onSignOut,
  children,
}: {
  title: string;
  subtitle?: string;
  onSignOut: () => void;
  children: React.ReactNode;
}) {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="grid w-full grid-cols-1 gap-6 px-4 py-6 sm:px-6 md:grid-cols-[280px_1fr]">
        <aside className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="flex items-center gap-2">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-sam-red text-white">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">Sortir Au Maroc</div>
              <div className="truncate text-xs text-white/60">Console SUPERADMIN</div>
            </div>
          </div>

          <nav className="mt-4 space-y-1">
            {NAV_ITEMS.map((item) => {
              const active = location.pathname === item.href;
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={cn(
                    "flex items-center gap-2 rounded-xl px-3 py-2 text-sm",
                    "transition-colors",
                    active ? "bg-sam-red text-white" : "text-white/80 hover:bg-white/10 hover:text-white",
                  )}
                >
                  {item.icon}
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="mt-4 border-t border-white/10 pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={onSignOut}
              className={cn("w-full justify-start rounded-xl px-3", "text-white/80 hover:bg-white/10 hover:text-white")}
            >
              <LogOut className="h-4 w-4" />
              Déconnexion
            </Button>
          </div>
        </aside>

        <main className="rounded-2xl border border-white/10 bg-white/5">
          <header className="border-b border-white/10 px-5 py-4">
            <div className="truncate text-lg font-semibold">{title}</div>
            {subtitle ? <div className="mt-1 text-sm text-white/60">{subtitle}</div> : null}
          </header>

          <div className="p-5">{children}</div>
        </main>
      </div>
    </div>
  );
}
