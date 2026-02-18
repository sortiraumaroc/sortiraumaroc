import { useCallback, useEffect, useState } from "react";
import { AtSign, Check, Clock, ExternalLink, Loader2, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";

import {
  listUsernameRequests,
  approveUsernameRequest,
  rejectUsernameRequest,
  type UsernameRequest,
} from "@/lib/adminApi";

type Props = {
  adminKey: string | undefined;
};

export function UsernameRequestsPanel({ adminKey }: Props) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<UsernameRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [processing, setProcessing] = useState<string | null>(null);

  // Reject dialog state
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectingRequest, setRejectingRequest] = useState<UsernameRequest | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const loadRequests = useCallback(async () => {
    try {
      setLoading(true);
      const result = await listUsernameRequests(adminKey, { status: "pending" });
      setRequests(result.requests);
      setTotal(result.total);
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Erreur lors du chargement",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [adminKey, toast]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const handleApprove = async (request: UsernameRequest) => {
    setProcessing(request.id);
    try {
      const result = await approveUsernameRequest(adminKey, request.id);
      toast({
        title: "Approuvé",
        description: result.message,
      });
      await loadRequests();
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Erreur lors de l'approbation",
        variant: "destructive",
      });
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async () => {
    if (!rejectingRequest) return;

    setProcessing(rejectingRequest.id);
    try {
      const result = await rejectUsernameRequest(adminKey, rejectingRequest.id, rejectReason);
      toast({
        title: "Refusé",
        description: result.message,
      });
      setRejectDialogOpen(false);
      setRejectingRequest(null);
      setRejectReason("");
      await loadRequests();
    } catch (e) {
      toast({
        title: "Erreur",
        description: e instanceof Error ? e.message : "Erreur lors du refus",
        variant: "destructive",
      });
    } finally {
      setProcessing(null);
    }
  };

  const openRejectDialog = (request: UsernameRequest) => {
    setRejectingRequest(request);
    setRejectReason("");
    setRejectDialogOpen(true);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString("fr-FR", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <AtSign className="w-5 h-5" />
          Demandes de nom d'utilisateur
          {total > 0 && (
            <Badge variant="secondary" className="ms-2">
              {total} en attente
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {requests.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            Aucune demande en attente
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Établissement</TableHead>
                <TableHead>Username demandé</TableHead>
                <TableHead>Username actuel</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-end">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((request) => (
                <TableRow key={request.id}>
                  <TableCell>
                    <div className="font-medium">
                      {request.establishments?.name || "N/A"}
                    </div>
                    <div className="text-xs text-slate-500">
                      {request.establishments?.city || ""}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="font-mono font-bold text-primary">
                      @{request.requested_username}
                    </div>
                    <div className="text-xs text-slate-500">
                      sam.ma/@{request.requested_username}
                    </div>
                  </TableCell>
                  <TableCell>
                    {request.establishments?.username ? (
                      <span className="font-mono text-slate-600">
                        @{request.establishments.username}
                      </span>
                    ) : (
                      <span className="text-slate-400 italic">Aucun</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 text-sm text-slate-600">
                      <Clock className="w-3 h-3" />
                      {formatDate(request.created_at)}
                    </div>
                  </TableCell>
                  <TableCell className="text-end">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        disabled={processing === request.id}
                        onClick={() => openRejectDialog(request)}
                      >
                        {processing === request.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <X className="w-4 h-4" />
                        )}
                        <span className="ms-1">Refuser</span>
                      </Button>
                      <Button
                        size="sm"
                        className="bg-emerald-600 hover:bg-emerald-700"
                        disabled={processing === request.id}
                        onClick={() => handleApprove(request)}
                      >
                        {processing === request.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Check className="w-4 h-4" />
                        )}
                        <span className="ms-1">Approuver</span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {/* Reject Dialog */}
        <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Refuser la demande</DialogTitle>
              <DialogDescription>
                Refuser la demande de nom d'utilisateur{" "}
                <span className="font-mono font-bold">
                  @{rejectingRequest?.requested_username}
                </span>{" "}
                pour {rejectingRequest?.establishments?.name || "cet établissement"}.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="reason">Raison du refus (optionnel)</Label>
                <Input
                  id="reason"
                  placeholder="Ex: Nom inapproprié, marque déposée, etc."
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setRejectDialogOpen(false)}
                disabled={processing !== null}
              >
                Annuler
              </Button>
              <Button
                variant="destructive"
                onClick={handleReject}
                disabled={processing !== null}
              >
                {processing ? (
                  <Loader2 className="w-4 h-4 me-2 animate-spin" />
                ) : null}
                Refuser
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
