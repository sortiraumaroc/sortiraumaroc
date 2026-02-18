import {
  Banknote,
  BarChart3,
  Briefcase,
  Building2,
  Camera,
  Car,
  ClipboardCheck,
  ClipboardList,
  CreditCard,
  FileSpreadsheet,
  FileText,
  Flag,
  Home,
  LayoutDashboard,
  LifeBuoy,
  Link2,
  ListChecks,
  Mail,
  Megaphone,
  Rocket,
  ScrollText,
  Settings,

  Video,
  Shield,
  Star,
  Tags,
  Timer,
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
  { type: "link", label: "Liens Perso", to: "/admin/username-subscriptions", icon: Link2 },
  { type: "link", label: "Publicités", to: "/admin/ads", icon: Megaphone },
  { type: "link", label: "Media Factory", to: "/admin/production-media", icon: Video },
  { type: "link", label: "Support", to: "/admin/support", icon: LifeBuoy },
  { type: "link", label: "Formulaires", to: "/admin/contact-forms", icon: ClipboardCheck },
  { type: "link", label: "Revendications", to: "/admin/claim-requests", icon: Flag },
  { type: "link", label: "Packs", to: "/admin/packs-moderation", icon: Tags, matchPaths: ["/admin/finances"] },
  { type: "link", label: "Fidélité", to: "/admin/loyalty-v2", icon: Star },
  { type: "link", label: "Marketing", to: "/admin/push-campaigns", icon: Megaphone, matchPaths: ["/admin/banners", "/admin/wheel"] },
  { type: "link", label: "Location véhicules", to: "/admin/rental", icon: Car },
  { type: "link", label: "Comités d'Entreprise", to: "/admin/ce", icon: Briefcase },
  { type: "link", label: "Paramètres", to: "/admin/settings", icon: Settings },
  {
    type: "link",
    label: "Suivi activité",
    to: "/admin/activity-tracking",
    icon: Timer,
    superadminOnly: true,
  },
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
