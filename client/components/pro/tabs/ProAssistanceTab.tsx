import { HelpCircle, LifeBuoy, Mail, Phone } from "lucide-react";

import { FaqSection } from "@/components/support/FaqSection";
import { SupportChatPanel } from "@/components/support/SupportChatPanel";
import { SupportTicketsPanel } from "@/components/support/SupportTicketsPanel";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { SectionHeader } from "@/components/ui/section-header";
import type { Establishment, ProRole } from "@/lib/pro/types";

type Props = {
  establishment: Establishment;
  role: ProRole;
};

export function ProAssistanceTab({ establishment, role }: Props) {
  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card>
        <CardHeader>
          <SectionHeader
            title="Assistance"
            description="FAQ, chat et tickets pour vous aider à gérer vos réservations et votre fiche."
            icon={LifeBuoy}
            actions={
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Badge className="bg-slate-100 text-slate-700 border-slate-200">
                  {establishment.name || "Établissement"}
                </Badge>
                <Badge className="bg-primary/10 text-primary border-primary/20">
                  Rôle: {role}
                </Badge>
              </div>
            }
          />
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Quick tips */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center gap-2 font-bold text-slate-900 mb-2">
              <HelpCircle className="w-4 h-4 text-primary" />
              Conseils pour un support efficace
            </div>
            <ul className="list-disc pl-5 text-sm text-slate-700 space-y-1">
              <li>Consultez d'abord la FAQ avant de créer un ticket</li>
              <li>Indiquez le nom de l'établissement et la date/heure du problème</li>
              <li>Ajoutez la référence de réservation si disponible</li>
              <li>Joignez des captures d'écran si possible</li>
            </ul>
          </div>

          {/* Contact cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4 hover:bg-slate-50 transition">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <Mail className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="font-bold text-slate-900">Email</div>
                  <div className="text-sm text-slate-600">support@sortiaumaroc.com</div>
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4 hover:bg-slate-50 transition">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <Phone className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="font-bold text-slate-900">Téléphone</div>
                  <div className="text-sm text-slate-600">+212 5 00 00 00 00</div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* FAQ Section */}
      <FaqSection defaultCategory="all" />

      {/* Chat Section */}
      <SupportChatPanel enabled />

      {/* Tickets Section */}
      <SupportTicketsPanel />
    </div>
  );
}
