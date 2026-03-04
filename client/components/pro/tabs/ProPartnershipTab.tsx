import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Check,
  Clock,
  Handshake,
  Loader2,
  Mail,
  MessageSquare,
  Pause,
  Shield,
  X,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { toast } from "@/hooks/use-toast";
import { proApiFetch } from "@/lib/pro/api";
import type { Establishment, ProRole } from "@/lib/pro/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PartnershipLine = {
  id: string;
  module: "ce" | "conciergerie" | "both";
  advantage_type: string;
  advantage_value: number | null;
  description: string | null;
  conditions: string | null;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
  toggled_by_pro: boolean;
};

type Partnership = {
  id: string;
  establishment_id: string;
  status:
    | "proposal_sent"
    | "in_negotiation"
    | "active"
    | "suspended"
    | "expired"
    | "refused";
  signed_at: string | null;
  valid_from: string | null;
  valid_to: string | null;
  created_at: string;
  updated_at: string;
  lines: PartnershipLine[];
};

type Props = {
  establishment: Establishment | null;
  role: ProRole | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatAdvantage(type: string, value: number | null): string {
  if (type === "percentage" && value != null) return `-${value}%`;
  if (type === "fixed" && value != null) return `${value} MAD offerts`;
  if (type === "special_offer") return "Offre speciale";
  if (type === "gift") return "Cadeau";
  if (type === "pack") return "Pack";
  return type;
}

function moduleBadge(module: string) {
  const map: Record<string, { label: string; className: string }> = {
    ce: {
      label: "CE",
      className:
        "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
    },
    conciergerie: {
      label: "Conciergerie",
      className:
        "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300",
    },
    both: {
      label: "CE + Conciergerie",
      className:
        "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    },
  };
  const m = map[module] ?? { label: module, className: "" };
  return (
    <Badge variant="outline" className={m.className}>
      {m.label}
    </Badge>
  );
}

function statusLabel(status: string): { label: string; className: string } {
  switch (status) {
    case "proposal_sent":
      return {
        label: "Proposition envoyee",
        className:
          "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
      };
    case "in_negotiation":
      return {
        label: "En negociation",
        className:
          "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
      };
    case "active":
      return {
        label: "Actif",
        className:
          "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
      };
    case "suspended":
      return {
        label: "Suspendu",
        className:
          "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
      };
    case "expired":
      return {
        label: "Expire",
        className:
          "bg-gray-100 text-gray-600 dark:bg-gray-800/40 dark:text-gray-400",
      };
    case "refused":
      return {
        label: "Refuse",
        className:
          "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
      };
    default:
      return { label: status, className: "" };
  }
}

function formatDate(iso: string | null): string {
  if (!iso) return "-";
  try {
    return new Date(iso).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProPartnershipTab({ establishment, role }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [partnership, setPartnership] = useState<Partnership | null>(null);

  // Action loading states
  const [accepting, setAccepting] = useState(false);
  const [refusing, setRefusing] = useState(false);
  const [togglingLineId, setTogglingLineId] = useState<string | null>(null);

  // Modification dialog
  const [modDialogOpen, setModDialogOpen] = useState(false);
  const [modMessage, setModMessage] = useState("");
  const [sendingMod, setSendingMod] = useState(false);

  // Refuse confirmation dialog
  const [refuseDialogOpen, setRefuseDialogOpen] = useState(false);

  // ---------- Fetch ----------

  const load = useCallback(async () => {
    if (!establishment?.id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await proApiFetch(
        `/api/pro/partnership?establishment_id=${encodeURIComponent(establishment.id)}`
      );
      setPartnership(data ?? null);
    } catch (e: unknown) {
      const msg =
        e instanceof Error ? e.message : "Erreur lors du chargement";
      setError(msg);
      console.error("[pro-partnership] load error:", e);
    } finally {
      setLoading(false);
    }
  }, [establishment?.id]);

  useEffect(() => {
    load();
  }, [load]);

  // ---------- Actions ----------

  async function handleAccept() {
    if (!partnership) return;
    setAccepting(true);
    try {
      await proApiFetch(`/api/pro/partnership/${partnership.id}/accept`, {
        method: "POST",
      });
      toast({
        title: "Partenariat accepte",
        description: "Vous avez accepte les conditions du partenariat.",
      });
      await load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erreur";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setAccepting(false);
    }
  }

  async function handleRefuse() {
    if (!partnership) return;
    setRefusing(true);
    try {
      await proApiFetch(`/api/pro/partnership/${partnership.id}/refuse`, {
        method: "POST",
      });
      toast({
        title: "Partenariat refuse",
        description: "Vous avez refuse la proposition de partenariat.",
      });
      setRefuseDialogOpen(false);
      await load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erreur";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setRefusing(false);
    }
  }

  async function handleRequestModification() {
    if (!partnership || !modMessage.trim()) return;
    setSendingMod(true);
    try {
      await proApiFetch(
        `/api/pro/partnership/${partnership.id}/request-modification`,
        {
          method: "POST",
          body: JSON.stringify({ message: modMessage.trim() }),
        }
      );
      toast({
        title: "Demande envoyee",
        description:
          "Votre demande de modification a ete transmise a l'equipe SAM.",
      });
      setModDialogOpen(false);
      setModMessage("");
      await load();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erreur";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setSendingMod(false);
    }
  }

  async function handleToggleLine(lineId: string, newValue: boolean) {
    if (!partnership) return;
    setTogglingLineId(lineId);
    try {
      await proApiFetch(
        `/api/pro/partnership/${partnership.id}/lines/${lineId}/toggle`,
        {
          method: "PATCH",
          body: JSON.stringify({ is_active: newValue }),
        }
      );
      // Optimistic update
      setPartnership((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          lines: prev.lines.map((l) =>
            l.id === lineId
              ? { ...l, is_active: newValue, toggled_by_pro: !newValue }
              : l
          ),
        };
      });
      toast({
        title: newValue ? "Ligne activee" : "Ligne desactivee",
        description: newValue
          ? "L'avantage a ete reactive."
          : "L'avantage a ete desactive de votre cote.",
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erreur";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setTogglingLineId(null);
    }
  }

  // ---------- Render states ----------

  if (!establishment) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        Selectionnez un etablissement pour voir le partenariat.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Chargement...</span>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12">
          <AlertTriangle className="h-10 w-10 text-destructive" />
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" onClick={load}>
            Reessayer
          </Button>
        </CardContent>
      </Card>
    );
  }

  // ---------- No agreement ----------

  if (!partnership) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          <Handshake className="h-12 w-12 text-muted-foreground" />
          <div>
            <CardTitle className="mb-1 text-lg">
              Aucun partenariat en cours
            </CardTitle>
            <CardDescription>
              Votre etablissement n&apos;a pas encore de partenariat avec SAM.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Mail className="h-4 w-4" />
            <a
              href="mailto:partenariats@sam.ma"
              className="underline hover:text-foreground"
            >
              partenariats@sam.ma
            </a>
          </div>
        </CardContent>
      </Card>
    );
  }

  const st = statusLabel(partnership.status);
  const isProposal =
    partnership.status === "proposal_sent" ||
    partnership.status === "in_negotiation";
  const isActive = partnership.status === "active";
  const isTerminal =
    partnership.status === "suspended" ||
    partnership.status === "expired" ||
    partnership.status === "refused";

  // ---------- Proposal ----------

  if (isProposal) {
    return (
      <>
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Handshake className="h-6 w-6 text-blue-600" />
              <div className="flex-1">
                <CardTitle>Proposition de partenariat recue</CardTitle>
                <CardDescription className="mt-1">
                  Consultez les conditions et prenez votre decision.
                </CardDescription>
              </div>
              <Badge variant="outline" className={st.className}>
                {st.label}
              </Badge>
            </div>
          </CardHeader>

          <CardContent className="space-y-4">
            {partnership.lines.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Aucune ligne d&apos;avantage dans cette proposition.
              </p>
            )}

            {partnership.lines.map((line, idx) => (
              <div key={line.id}>
                {idx > 0 && <Separator className="my-4" />}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {moduleBadge(line.module)}
                    <Badge variant="secondary">
                      {formatAdvantage(
                        line.advantage_type,
                        line.advantage_value
                      )}
                    </Badge>
                  </div>

                  {line.description && (
                    <p className="text-sm">{line.description}</p>
                  )}

                  {line.conditions && (
                    <p className="text-xs text-muted-foreground">
                      <Shield className="mr-1 inline h-3 w-3" />
                      Conditions : {line.conditions}
                    </p>
                  )}

                  {(line.start_date || line.end_date) && (
                    <p className="text-xs text-muted-foreground">
                      <Clock className="mr-1 inline h-3 w-3" />
                      {line.start_date && `Du ${formatDate(line.start_date)}`}
                      {line.start_date && line.end_date && " "}
                      {line.end_date && `au ${formatDate(line.end_date)}`}
                    </p>
                  )}
                </div>
              </div>
            ))}

            <Separator />

            <div className="flex flex-wrap gap-2">
              <Button
                onClick={handleAccept}
                disabled={accepting}
                className="bg-green-600 text-white hover:bg-green-700"
              >
                {accepting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Check className="mr-2 h-4 w-4" />
                )}
                Accepter les conditions
              </Button>

              <Button
                variant="outline"
                onClick={() => setModDialogOpen(true)}
              >
                <MessageSquare className="mr-2 h-4 w-4" />
                Demander une modification
              </Button>

              <Button
                variant="destructive"
                onClick={() => setRefuseDialogOpen(true)}
              >
                <X className="mr-2 h-4 w-4" />
                Refuser
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Modification dialog */}
        <Dialog open={modDialogOpen} onOpenChange={setModDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Demander une modification</DialogTitle>
            </DialogHeader>
            <Textarea
              placeholder="Decrivez les modifications souhaitees..."
              value={modMessage}
              onChange={(e) => setModMessage(e.target.value)}
              rows={5}
            />
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setModDialogOpen(false)}
              >
                Annuler
              </Button>
              <Button
                onClick={handleRequestModification}
                disabled={sendingMod || !modMessage.trim()}
              >
                {sendingMod && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Envoyer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Refuse confirmation */}
        <AlertDialog
          open={refuseDialogOpen}
          onOpenChange={setRefuseDialogOpen}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Refuser la proposition ?</AlertDialogTitle>
              <AlertDialogDescription>
                Cette action est definitive. Vous pourrez toujours contacter
                l&apos;equipe SAM pour une nouvelle proposition.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuler</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleRefuse}
                disabled={refusing}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {refusing && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Confirmer le refus
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  // ---------- Active ----------

  if (isActive) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Handshake className="h-6 w-6 text-green-600" />
            <div className="flex-1">
              <CardTitle>Partenariat actif</CardTitle>
              {(partnership.valid_from || partnership.valid_to) && (
                <CardDescription className="mt-1">
                  {partnership.valid_from &&
                    `Valide du ${formatDate(partnership.valid_from)}`}
                  {partnership.valid_from && partnership.valid_to && " "}
                  {partnership.valid_to &&
                    `au ${formatDate(partnership.valid_to)}`}
                </CardDescription>
              )}
            </div>
            <Badge variant="outline" className={st.className}>
              {st.label}
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {partnership.lines.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Aucune ligne d&apos;avantage configuree.
            </p>
          )}

          {partnership.lines.map((line, idx) => (
            <div key={line.id}>
              {idx > 0 && <Separator className="my-4" />}
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    {moduleBadge(line.module)}
                    <Badge variant="secondary">
                      {formatAdvantage(
                        line.advantage_type,
                        line.advantage_value
                      )}
                    </Badge>
                  </div>

                  {line.description && (
                    <p className="text-sm">{line.description}</p>
                  )}

                  {line.conditions && (
                    <p className="text-xs text-muted-foreground">
                      <Shield className="mr-1 inline h-3 w-3" />
                      Conditions : {line.conditions}
                    </p>
                  )}

                  {!line.is_active && line.toggled_by_pro && (
                    <p className="text-xs font-medium text-orange-600">
                      <Pause className="mr-1 inline h-3 w-3" />
                      Desactive par vous
                    </p>
                  )}
                </div>

                <div className="flex flex-col items-center gap-1 pt-1">
                  <Switch
                    checked={line.is_active}
                    disabled={togglingLineId === line.id}
                    onCheckedChange={(val) => handleToggleLine(line.id, val)}
                  />
                  {togglingLineId === line.id && (
                    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                  )}
                </div>
              </div>
            </div>
          ))}

          {partnership.signed_at && (
            <>
              <Separator />
              <p className="text-xs text-muted-foreground">
                <Check className="mr-1 inline h-3 w-3" />
                Accepte le {formatDate(partnership.signed_at)}
              </p>
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  // ---------- Terminal states: suspended / expired / refused ----------

  if (isTerminal) {
    const terminalConfig: Record<
      string,
      { icon: React.ReactNode; title: string; description: string }
    > = {
      suspended: {
        icon: <Pause className="h-12 w-12 text-orange-500" />,
        title: "Partenariat suspendu",
        description:
          "Votre partenariat est temporairement suspendu. Contactez l'equipe SAM pour plus d'informations.",
      },
      expired: {
        icon: <Clock className="h-12 w-12 text-gray-400" />,
        title: "Partenariat expire",
        description:
          "Votre partenariat a expire. Contactez l'equipe SAM pour un renouvellement.",
      },
      refused: {
        icon: <XCircle className="h-12 w-12 text-red-500" />,
        title: "Partenariat refuse",
        description:
          "Vous avez refuse la proposition de partenariat. Vous pouvez contacter l'equipe SAM pour une nouvelle proposition.",
      },
    };

    const cfg = terminalConfig[partnership.status] ?? {
      icon: <AlertTriangle className="h-12 w-12 text-muted-foreground" />,
      title: "Partenariat",
      description: "",
    };

    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
          {cfg.icon}
          <div>
            <CardTitle className="mb-1 text-lg">{cfg.title}</CardTitle>
            <Badge variant="outline" className={st.className + " mb-3"}>
              {st.label}
            </Badge>
            <CardDescription>{cfg.description}</CardDescription>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Mail className="h-4 w-4" />
            <a
              href="mailto:partenariats@sam.ma"
              className="underline hover:text-foreground"
            >
              partenariats@sam.ma
            </a>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Fallback (should not happen)
  return null;
}
