import { NavLink } from "react-router-dom";

import { cn } from "@/lib/utils";

const ITEMS: Array<{ label: string; to: string }> = [
  { label: "Templates", to: "/admin/emails/templates" },
  { label: "Newsletter", to: "/admin/emails/newsletter" },
  { label: "Campagnes", to: "/admin/emails/campaigns" },
  { label: "Paramètres", to: "/admin/emails/settings" },
  { label: "Prospects", to: "/admin/emails/prospects" },
  { label: "Emails envoyés", to: "/admin/emails/sent" },
];

export function AdminEmailsNav() {
  return (
    <div className="inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground">
      {ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
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
