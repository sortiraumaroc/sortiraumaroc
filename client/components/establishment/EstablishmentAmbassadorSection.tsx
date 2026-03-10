import { useState, useCallback, useEffect } from "react";
import {
  Gift,
  Users,
  Trophy,
  ChevronRight,
  Loader2,
  CheckCircle2,
  Clock,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { isAuthed, openAuthModal } from "@/lib/auth";
import {
  getEstablishmentAmbassadorProgram,
  applyToAmbassadorProgram,
  type PublicAmbassadorProgram,
  type MyApplicationStatus,
} from "@/lib/ambassadorConsumerApi";
import { toast } from "@/hooks/use-toast";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EstablishmentAmbassadorSectionProps {
  establishmentId: string;
  establishmentName: string;
}

type ApplicationState = "none" | "pending" | "accepted" | "rejected";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EstablishmentAmbassadorSection({
  establishmentId,
  establishmentName,
}: EstablishmentAmbassadorSectionProps) {
  const { t } = useI18n();

  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [program, setProgram] = useState<PublicAmbassadorProgram | null>(null);
  const [applicationState, setApplicationState] =
    useState<ApplicationState>("none");

  // -------------------------------------------------------------------------
  // Fetch program on mount
  // -------------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    async function fetchProgram() {
      try {
        const res = await getEstablishmentAmbassadorProgram(establishmentId);
        if (cancelled) return;

        if (!res.ok || !res.program) {
          setProgram(null);
        } else {
          setProgram(res.program);
          setApplicationState(res.my_application?.status ?? "none");
        }
      } catch {
        // Silently ignore errors (e.g. not authed for my_application part)
        if (!cancelled) setProgram(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchProgram();
    return () => {
      cancelled = true;
    };
  }, [establishmentId]);

  // -------------------------------------------------------------------------
  // Apply handler
  // -------------------------------------------------------------------------

  const handleApply = useCallback(async () => {
    if (!program) return;

    if (!isAuthed()) {
      openAuthModal();
      return;
    }

    setApplying(true);
    try {
      await applyToAmbassadorProgram(program.id);
      setApplicationState("pending");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Une erreur est survenue";
      toast({
        title: "Erreur",
        description: message,
        variant: "destructive",
      });
    } finally {
      setApplying(false);
    }
  }, [program]);

  // -------------------------------------------------------------------------
  // Render guards
  // -------------------------------------------------------------------------

  // Show nothing while loading
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
      </div>
    );
  }

  // No active program — render nothing
  if (!program) return null;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
      {/* Header */}
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#b30013]/10">
          <Gift className="h-5 w-5 text-[#b30013]" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-gray-900">
            Programme Ambassadeur
          </h3>
          <p className="text-sm text-gray-500">{establishmentName}</p>
        </div>
      </div>

      {/* Description */}
      {program.reward_description && (
        <p className="mb-4 text-sm leading-relaxed text-gray-700">
          {program.reward_description}
        </p>
      )}

      {/* Stats row */}
      <div className="mb-5 flex flex-wrap gap-4">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Users className="h-4 w-4 text-gray-400" />
          <span>
            {program.conversions_required} r&eacute;servation
            {program.conversions_required > 1 ? "s" : ""} confirm&eacute;e
            {program.conversions_required > 1 ? "s" : ""}
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Clock className="h-4 w-4 text-gray-400" />
          <span>Validit&eacute; {program.validity_days} jours</span>
        </div>
      </div>

      {/* Application status / CTA */}
      <ApplicationStatusBlock
        state={applicationState}
        applying={applying}
        onApply={handleApply}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: application status block
// ---------------------------------------------------------------------------

function ApplicationStatusBlock({
  state,
  applying,
  onApply,
}: {
  state: ApplicationState;
  applying: boolean;
  onApply: () => void;
}) {
  switch (state) {
    case "none":
      return (
        <Button
          onClick={onApply}
          disabled={applying}
          className="w-full bg-[#b30013] text-white hover:bg-[#8f000f]"
        >
          {applying ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Envoi en cours...
            </>
          ) : (
            <>
              <Trophy className="mr-2 h-4 w-4" />
              Rejoindre le programme
              <ChevronRight className="ml-auto h-4 w-4" />
            </>
          )}
        </Button>
      );

    case "pending":
      return (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm font-medium text-amber-700">
          <Clock className="h-4 w-4 shrink-0" />
          Candidature envoy&eacute;e
        </div>
      );

    case "accepted":
      return (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          Vous &ecirc;tes ambassadeur
        </div>
      );

    case "rejected":
      return (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          <XCircle className="h-4 w-4 shrink-0" />
          Candidature refus&eacute;e
        </div>
      );
  }
}
