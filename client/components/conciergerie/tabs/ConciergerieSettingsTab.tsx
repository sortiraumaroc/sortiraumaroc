import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Mail, Phone, MapPin } from "lucide-react";
import type { ConciergeProfile } from "@shared/conciergerieTypes";

type Props = {
  concierge: ConciergeProfile;
};

export default function ConciergerieSettingsTab({ concierge }: Props) {
  const c = concierge.concierge;
  const u = concierge.user;

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">Paramètres</h2>

      {/* Concierge info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="w-4 h-4" />
            Informations de la conciergerie
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-slate-500">Nom</p>
              <p className="font-medium">{c.name}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Type</p>
              <p className="font-medium capitalize">{c.type}</p>
            </div>
            {c.city && (
              <div>
                <p className="text-xs text-slate-500">Ville</p>
                <p className="font-medium flex items-center gap-1">
                  <MapPin className="w-3 h-3" /> {c.city}
                </p>
              </div>
            )}
            {c.address && (
              <div>
                <p className="text-xs text-slate-500">Adresse</p>
                <p className="font-medium">{c.address}</p>
              </div>
            )}
            {c.phone && (
              <div>
                <p className="text-xs text-slate-500">Téléphone</p>
                <p className="font-medium flex items-center gap-1">
                  <Phone className="w-3 h-3" /> {c.phone}
                </p>
              </div>
            )}
            {c.email && (
              <div>
                <p className="text-xs text-slate-500">Email</p>
                <p className="font-medium flex items-center gap-1">
                  <Mail className="w-3 h-3" /> {c.email}
                </p>
              </div>
            )}
            <div>
              <p className="text-xs text-slate-500">Commission</p>
              <p className="font-medium">{c.commission_rate}%</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Statut</p>
              <span
                className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  c.status === "active"
                    ? "bg-green-100 text-green-700"
                    : c.status === "suspended"
                      ? "bg-red-100 text-red-600"
                      : "bg-amber-100 text-amber-700"
                }`}
              >
                {c.status === "active"
                  ? "Actif"
                  : c.status === "suspended"
                    ? "Suspendu"
                    : "En attente"}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* User info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mon compte</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-slate-500">Nom</p>
              <p className="font-medium">
                {[u.first_name, u.last_name].filter(Boolean).join(" ") || "—"}
              </p>
            </div>
            {u.email && (
              <div>
                <p className="text-xs text-slate-500">Email</p>
                <p className="font-medium">{u.email}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-slate-500">Rôle</p>
              <p className="font-medium capitalize">{u.role}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Contact */}
      <Card>
        <CardContent className="p-4 text-center text-sm text-slate-500">
          Pour modifier les informations de votre conciergerie, contactez
          l'équipe SAM à{" "}
          <a
            href="mailto:contact@sam.ma"
            className="text-primary hover:underline"
          >
            contact@sam.ma
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
