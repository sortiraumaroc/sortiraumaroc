import {
  BarChart3,
  Bell,
  Building2,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  Handshake,
  Home,
  LayoutDashboard,
  LifeBuoy,
  ListChecks,
  Mail,
  Rocket,
  ScrollText,
  Settings,
  Shield,
  Star,
  Tags,
  Users,
  UsersRound,
} from "lucide-react";

export type AdminNavLink = {
  type: "link";
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  superadminOnly?: boolean;
  /** Extra paths that should highlight this sidebar item as active */
  matchPaths?: string[];
};

export type AdminNavGroup = {
  type: "group";
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  children: AdminNavLink[];
  superadminOnly?: boolean;
};

export type AdminNavItem = AdminNavLink | AdminNavGroup;

export const ADMIN_NAV: AdminNavItem[] = [
  {
    type: "link",
    label: "Tableau de bord",
    to: "/admin",
    icon: LayoutDashboard,
  },
  { type: "link", label: "Utilisateurs", to: "/admin/users", icon: Users, matchPaths: ["/admin/ce"] },
  { type: "link", label: "Professionnels", to: "/admin/pros", icon: UsersRound },
  {
    type: "link",
    label: "Établissements",
    to: "/admin/establishments",
    icon: Building2,
    matchPaths: ["/admin/claim-requests", "/admin/import-export"],
  },
  {
    type: "link",
    label: "Réservations",
    to: "/admin/reservations",
    icon: ClipboardList,
    matchPaths: ["/admin/ramadan"],
  },
  { type: "link", label: "Packs", to: "/admin/packs-moderation", icon: Tags, matchPaths: ["/admin/finances"] },
  { type: "link", label: "Fidélité", to: "/admin/loyalty-v2", icon: Star },
  {
    type: "link",
    label: "Paiements",
    to: "/admin/payments",
    icon: CreditCard,
    matchPaths: ["/admin/finance/payout-requests"],
  },
  { type: "link", label: "Partenariats", to: "/admin/partnerships", icon: Handshake },
  {
    type: "link",
    label: "Page d'accueil",
    to: "/admin/homepage",
    icon: Home,
    matchPaths: ["/admin/content"],
  },
  { type: "link", label: "Emailing", to: "/admin/emails/templates", icon: Mail },
  {
    type: "link",
    label: "Visibilité",
    to: "/admin/visibility",
    icon: Rocket,
    matchPaths: ["/admin/ads", "/admin/production-media", "/admin/push-campaigns", "/admin/banners", "/admin/wheel", "/admin/messages", "/admin/partners", "/admin/production-media/compta", "/admin/username-subscriptions"],
  },
  { type: "link", label: "Support", to: "/admin/support", icon: LifeBuoy },
  { type: "link", label: "Formulaires", to: "/admin/contact-forms", icon: ClipboardCheck },
  {
    type: "link",
    label: "Paramètres",
    to: "/admin/settings",
    icon: Settings,
    matchPaths: ["/admin/rental"],
  },
  {
    type: "link",
    label: "Collaborateurs",
    to: "/admin/collaborators",
    icon: Shield,
    superadminOnly: true,
    matchPaths: ["/admin/activity-tracking"],
  },
  {
    type: "link",
    label: "Rôles & permissions",
    to: "/admin/roles",
    icon: BarChart3,
    superadminOnly: true,
  },
  {
    type: "link",
    label: "Notifications",
    to: "/admin/notifications",
    icon: Bell,
  },
  { type: "link", label: "Journaux", to: "/admin/logs", icon: ScrollText },
  {
    type: "link",
    label: "Audit & tests",
    to: "/admin/audit-tests",
    icon: ListChecks,
  },
  {
    type: "link",
    label: "Production check",
    to: "/admin/production-check",
    icon: ListChecks,
  },
];
