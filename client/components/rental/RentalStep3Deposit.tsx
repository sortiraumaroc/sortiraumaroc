import { Landmark, Info, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// =============================================================================
// Types
// =============================================================================

interface RentalStep3DepositProps {
  depositAmount: number;
  insuranceName: string | null;
  franchise: number;
  onNext: () => void;
  onBack: () => void;
}

// =============================================================================
// Component
// =============================================================================

export function RentalStep3Deposit({
  depositAmount,
  insuranceName,
  franchise,
  onNext,
  onBack,
}: RentalStep3DepositProps) {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Landmark className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold text-foreground">Caution de location</h2>
        </div>
        <p className="text-sm text-slate-600">
          Une caution sera retenue lors de la prise en charge du vehicule.
        </p>
      </div>

      {/* Deposit amount card */}
      <div className="rounded-xl border-2 border-primary/20 bg-primary/5 p-6 text-center">
        <p className="text-sm text-slate-600 mb-2">Montant de la caution</p>
        <p className="text-4xl font-bold text-primary">
          {depositAmount.toLocaleString("fr-FR")} <span className="text-lg">MAD</span>
        </p>
      </div>

      {/* Insurance impact */}
      {insuranceName && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-green-800">
                Assurance "{insuranceName}" souscrite
              </p>
              <p className="text-xs text-green-700 mt-1 leading-relaxed">
                Grace a votre assurance, votre franchise en cas de sinistre est limitee
                a <span className="font-bold">{franchise.toLocaleString("fr-FR")} MAD</span>.
              </p>
            </div>
          </div>
        </div>
      )}

      {!insuranceName && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-amber-800">
                Aucune assurance souscrite
              </p>
              <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                Sans assurance, vous etes responsable de la totalite des dommages.
                La caution pourra etre retenue en cas de sinistre.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Explanation */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Comment fonctionne la caution ?</h3>

        <div className="space-y-2">
          {[
            {
              title: "Retenue a la prise en charge",
              text: "Le montant de la caution est retenu sur votre moyen de paiement au moment de la prise en charge du vehicule.",
            },
            {
              title: "Inspection du vehicule",
              text: "Un etat des lieux est realise au depart et au retour du vehicule pour constater d'eventuels dommages.",
            },
            {
              title: "Liberation de la caution",
              text: "Si le vehicule est restitue dans le meme etat, la caution est liberee sous 7 a 14 jours ouvrables.",
            },
          ].map((item, idx) => (
            <div
              key={idx}
              className="flex items-start gap-3 rounded-lg border border-slate-100 bg-slate-50 p-3"
            >
              <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                {idx + 1}
              </div>
              <div>
                <p className="text-xs font-semibold text-foreground">{item.title}</p>
                <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{item.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex gap-3 pt-4">
        <Button variant="outline" onClick={onBack} className="flex-1 h-12 font-bold">
          Retour
        </Button>
        <Button
          onClick={onNext}
          className="flex-1 h-12 text-base font-bold"
          size="lg"
        >
          Suivant
        </Button>
      </div>
    </div>
  );
}
