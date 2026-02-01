import {
  Banknote,
  BarChart3,
  Briefcase,
  Building2,
  Camera,
  ClipboardList,
  CreditCard,
  FileSpreadsheet,
  FileText,
  Home,
  LayoutDashboard,
  LifeBuoy,
  ListChecks,
  Mail,
  Megaphone,
  Rocket,
  ScrollText,
  Settings,
  Sparkles,
  Video,
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
  { type: "link", label: "Utilisateurs", to: "/admin/users", icon: Users },
  { type: "link", label: "Professionnels", to: "/admin/pros", icon: UsersRound },
  {
    type: "link",
    label: "Établissements",
    to: "/admin/establishments",
    icon: Building2,
  },
  {
    type: "link",
    label: "Import / Export",
    to: "/admin/import-export",
    icon: FileSpreadsheet,
  },
  {
    type: "link",
    label: "Réservations",
    to: "/admin/reservations",
    icon: ClipboardList,
  },
  { type: "link", label: "Paiements", to: "/admin/payments", icon: CreditCard },
  {
    type: "link",
    label: "Payout",
    to: "/admin/finance/payout-requests",
    icon: CreditCard,
  },
  {
    type: "link",
    label: "Avis & signalements",
    to: "/admin/reviews",
    icon: Star,
  },
  { type: "link", label: "Contenu", to: "/admin/content", icon: FileText },
  { type: "link", label: "Page d'accueil", to: "/admin/homepage", icon: Home },
  { type: "link", label: "Emailing", to: "/admin/emails/templates", icon: Mail },
  { type: "link", label: "Visibilité", to: "/admin/visibility", icon: Rocket },
  { type: "link", label: "Publicités", to: "/admin/ads", icon: Sparkles },
  { type: "link", label: "Media Factory", to: "/admin/production-media", icon: Video },
  { type: "link", label: "Support", to: "/admin/support", icon: LifeBuoy },
  { type: "link", label: "Paramètres", to: "/admin/settings", icon: Settings },
  {
    type: "link",
    label: "Collaborateurs",
    to: "/admin/collaborators",
    icon: Shield,
    superadminOnly: true,
  },
  {
    type: "link",
    label: "Rôles & permissions",
    to: "/admin/roles",
    icon: BarChart3,
    superadminOnly: true,
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
