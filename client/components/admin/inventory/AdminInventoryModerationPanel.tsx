import { useState, useCallback, useEffect } from "react";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  FileEdit,
  FilePlus,
  Trash2,
  Package,
  FolderPlus,
  RefreshCcw,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
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

import { useToast } from "@/hooks/use-toast";
import { formatLeJjMmAaAHeure } from "@shared/datetime";

// Types
type PendingChange = {
  id: string;
  establishment_id: string;
  change_type: string;
  target_id?: string | null;
  payload: Record<string, any>;
  bulk_data?: any;
  status: "pending" | "approved" | "rejected";
  submitted_by: string;
  submitted_at: string;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_notes?: string | null;
  created_at: string;
  establishments?: {
    id: string;
    name: string;
    slug?: string;
  };
};

type Props = {
  establishmentId?: string; // If provided, show only changes for this establishment
  onChangeApplied?: () => void; // Callback when a change is approved/rejected
};

// Admin API helper
async function adminApiFetch(
  path: string,
  options: RequestInit = {}
): Promise<any> {
  const res = await fetch(path, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const payload = await res.json().catch(() => null);

  if (!res.ok) {
    const msg =
      payload && typeof payload === "object" && typeof payload.error === "string"
        ? payload.error
        : payload?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return payload;
}

function getChangeTypeIcon(type: string) {
  switch (type) {
    case "create_category":
      return <FolderPlus className="h-4 w-4" />;
    case "update_category":
      return <FileEdit className="h-4 w-4" />;
    case "delete_category":
      return <Trash2 className="h-4 w-4" />;
    case "create_item":
      return <FilePlus className="h-4 w-4" />;
    case "update_item":
      return <FileEdit className="h-4 w-4" />;
    case "delete_item":
      return <Trash2 className="h-4 w-4" />;
    case "bulk_import":
      return <Package className="h-4 w-4" />;
    default:
      return <FileEdit className="h-4 w-4" />;
  }
}

function getChangeTypeLabel(type: string): string {
  switch (type) {
    case "create_category":
      return "Créer catégorie";
    case "update_category":
      return "Modifier catégorie";
    case "delete_category":
      return "Supprimer catégorie";
    case "create_item":
      return "Créer offre";
    case "update_item":
      return "Modifier offre";
    case "delete_item":
      return "Supprimer offre";
    case "bulk_import":
      return "Import en masse";
    default:
      return type;
  }
}

function getChangeTypeColor(type: string): string {
  if (type.includes("create") || type === "bulk_import") return "bg-green-500";
  if (type.includes("update")) return "bg-blue-500";
  if (type.includes("delete")) return "bg-red-500";
  return "bg-gray-500";
}

export function AdminInventoryModerationPanel({ establishmentId, onChangeApplied }: Props) {
  const { toast } = useToast();
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Dialog states
  const [selectedChange, setSelectedChange] = useState<PendingChange | null>(null);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectNotes, setRejectNotes] = useState("");

  // Fetch pending changes
  const fetchPendingChanges = useCallback(async () => {
    try {
      setLoading(true);
      const path = establishmentId
        ? `/api/admin/establishments/${encodeURIComponent(establishmentId)}/inventory/pending-changes`
        : "/api/admin/inventory/pending-changes";
      const res = await adminApiFetch(path);
      setPendingChanges(res.pendingChanges ?? []);
    } catch (err) {
      console.error("Error fetching pending changes:", err);
      toast({
        title: "Erreur",
        description: "Impossible de charger les demandes en attente",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [establishmentId, toast]);

  useEffect(() => {
    fetchPendingChanges();
  }, [fetchPendingChanges]);

  // Approve a change
  const handleApprove = async (change: PendingChange) => {
    try {
      setActionLoading(change.id);
      await adminApiFetch(`/api/admin/inventory/pending-changes/${change.id}/approve`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      toast({
        title: "Approuvé",
        description: "La modification a été appliquée avec succès",
      });
      setPendingChanges((prev) => prev.filter((c) => c.id !== change.id));
      onChangeApplied?.();
    } catch (err) {
      console.error("Error approving change:", err);
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Impossible d'approuver la modification",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  // Reject a change
  const handleReject = async () => {
    if (!selectedChange) return;
    try {
      setActionLoading(selectedChange.id);
      await adminApiFetch(`/api/admin/inventory/pending-changes/${selectedChange.id}/reject`, {
        method: "POST",
        body: JSON.stringify({ notes: rejectNotes }),
      });
      toast({
        title: "Rejeté",
        description: "La demande a été rejetée",
      });
      setPendingChanges((prev) => prev.filter((c) => c.id !== selectedChange.id));
      setShowRejectDialog(false);
      setSelectedChange(null);
      setRejectNotes("");
      onChangeApplied?.();
    } catch (err) {
      console.error("Error rejecting change:", err);
      toast({
        title: "Erreur",
        description: err instanceof Error ? err.message : "Impossible de rejeter la modification",
        variant: "destructive",
      });
    } finally {
      setActionLoading(null);
    }
  };

  // Open details dialog
  const openDetails = (change: PendingChange) => {
    setSelectedChange(change);
    setShowDetailsDialog(true);
  };

  // Open reject dialog
  const openRejectDialog = (change: PendingChange) => {
    setSelectedChange(change);
    setRejectNotes("");
    setShowRejectDialog(true);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">Chargement...</span>
        </CardContent>
      </Card>
    );
  }

  if (pendingChanges.length === 0) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Demandes de modération
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={fetchPendingChanges}>
            <RefreshCcw className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <CheckCircle2 className="h-12 w-12 mb-2 text-green-500" />
            <p>Aucune demande en attente</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Demandes de modération
            <Badge variant="secondary" className="ml-2">
              {pendingChanges.length}
            </Badge>
          </CardTitle>
          <Button variant="ghost" size="sm" onClick={fetchPendingChanges}>
            <RefreshCcw className="h-4 w-4" />
          </Button>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {pendingChanges.map((change) => (
              <div
                key={change.id}
                className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-full ${getChangeTypeColor(change.change_type)} text-white`}>
                    {getChangeTypeIcon(change.change_type)}
                  </div>
                  <div>
                    <div className="font-medium flex items-center gap-2">
                      {getChangeTypeLabel(change.change_type)}
                      {change.payload?.title && (
                        <span className="text-muted-foreground font-normal">
                          : {change.payload.title}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {change.establishments?.name && (
                        <span className="mr-2">{change.establishments.name}</span>
                      )}
                      <span>{formatLeJjMmAaAHeure(change.submitted_at)}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openDetails(change)}
                  >
                    Détails
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openRejectDialog(change)}
                    disabled={actionLoading === change.id}
                  >
                    <XCircle className="h-4 w-4 mr-1" />
                    Refuser
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => handleApprove(change)}
                    disabled={actionLoading === change.id}
                  >
                    {actionLoading === change.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4 mr-1" />
                        Approuver
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedChange && getChangeTypeIcon(selectedChange.change_type)}
              {selectedChange && getChangeTypeLabel(selectedChange.change_type)}
            </DialogTitle>
            <DialogDescription>
              Détails de la demande de modification
            </DialogDescription>
          </DialogHeader>

          {selectedChange && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium">Établissement:</span>
                  <p className="text-muted-foreground">
                    {selectedChange.establishments?.name ?? selectedChange.establishment_id}
                  </p>
                </div>
                <div>
                  <span className="font-medium">Soumis le:</span>
                  <p className="text-muted-foreground">
                    {formatLeJjMmAaAHeure(selectedChange.submitted_at)}
                  </p>
                </div>
              </div>

              <div>
                <span className="font-medium text-sm">Données:</span>
                <pre className="mt-1 p-3 bg-muted rounded-lg text-xs overflow-auto max-h-64">
                  {JSON.stringify(selectedChange.payload, null, 2)}
                </pre>
              </div>

              {selectedChange.target_id && (
                <div>
                  <span className="font-medium text-sm">ID cible:</span>
                  <p className="text-muted-foreground text-sm font-mono">
                    {selectedChange.target_id}
                  </p>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDetailsDialog(false)}>
              Fermer
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setShowDetailsDialog(false);
                if (selectedChange) openRejectDialog(selectedChange);
              }}
            >
              <XCircle className="h-4 w-4 mr-1" />
              Refuser
            </Button>
            <Button
              onClick={() => {
                setShowDetailsDialog(false);
                if (selectedChange) handleApprove(selectedChange);
              }}
              disabled={actionLoading === selectedChange?.id}
            >
              {actionLoading === selectedChange?.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  Approuver
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <AlertDialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Refuser la demande</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir refuser cette demande ? Vous pouvez ajouter une note explicative.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="py-4">
            <Textarea
              placeholder="Raison du refus (optionnel)"
              value={rejectNotes}
              onChange={(e) => setRejectNotes(e.target.value)}
              rows={3}
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReject}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={actionLoading === selectedChange?.id}
            >
              {actionLoading === selectedChange?.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Refuser"
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
