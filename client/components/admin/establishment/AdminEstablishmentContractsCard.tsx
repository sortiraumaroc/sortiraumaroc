import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Calendar,
  ExternalLink,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  AdminApiError,
  listAdminEstablishmentContracts,
  uploadAdminEstablishmentContract,
  updateAdminEstablishmentContract,
  deleteAdminEstablishmentContract,
  type AdminEstablishmentContract,
} from "@/lib/adminApi";

const CONTRACT_TYPES = [
  { value: "partnership", label: "Contrat de partenariat" },
  { value: "commission", label: "Contrat de commission" },
  { value: "service", label: "Contrat de service" },
  { value: "sponsorship", label: "Contrat de sponsoring" },
  { value: "other", label: "Autre" },
];

const CONTRACT_STATUSES = [
  { value: "active", label: "Actif", cls: "bg-emerald-100 text-emerald-700 border-emerald-200" },
  { value: "pending", label: "En attente", cls: "bg-amber-100 text-amber-700 border-amber-200" },
  { value: "expired", label: "Expiré", cls: "bg-slate-100 text-slate-700 border-slate-200" },
  { value: "terminated", label: "Résilié", cls: "bg-red-100 text-red-700 border-red-200" },
];

function getStatusBadge(status: string) {
  const found = CONTRACT_STATUSES.find((s) => s.value === status);
  return found ?? { value: status, label: status, cls: "bg-slate-100 text-slate-700 border-slate-200" };
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString("fr-FR");
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString("fr-FR");
}

function formatFileSize(bytes: number | null | undefined): string {
  if (typeof bytes !== "number" || !Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

type UploadDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpload: (
    file: File,
    metadata: {
      contractType: string;
      contractReference: string;
      signedAt: string;
      startsAt: string;
      expiresAt: string;
      notes: string;
    }
  ) => Promise<void>;
  uploading: boolean;
};

function UploadContractDialog({ open, onOpenChange, onUpload, uploading }: UploadDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [contractType, setContractType] = useState("partnership");
  const [contractReference, setContractReference] = useState("");
  const [signedAt, setSignedAt] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [notes, setNotes] = useState("");

  const reset = () => {
    setFile(null);
    setContractType("partnership");
    setContractReference("");
    setSignedAt("");
    setStartsAt("");
    setExpiresAt("");
    setNotes("");
  };

  const handleSubmit = async () => {
    if (!file) return;
    await onUpload(file, {
      contractType,
      contractReference,
      signedAt,
      startsAt,
      expiresAt,
      notes,
    });
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Ajouter un contrat</DialogTitle>
          <DialogDescription>
            Téléversez le contrat PDF et renseignez les informations.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label>Fichier PDF *</Label>
            <Input
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-1"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Type de contrat</Label>
              <Select value={contractType} onValueChange={setContractType}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTRACT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Référence interne</Label>
              <Input
                value={contractReference}
                onChange={(e) => setContractReference(e.target.value)}
                placeholder="Ex: SAM-2026-001"
                className="mt-1"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Date signature</Label>
              <Input
                type="date"
                value={signedAt}
                onChange={(e) => setSignedAt(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Date début</Label>
              <Input
                type="date"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Date expiration</Label>
              <Input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes internes..."
              rows={2}
              className="mt-1"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={uploading}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={!file || uploading} className="gap-2">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            Téléverser
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type EditDialogProps = {
  contract: AdminEstablishmentContract | null;
  onClose: () => void;
  onSave: (data: {
    contract_type?: string;
    contract_reference?: string | null;
    signed_at?: string | null;
    starts_at?: string | null;
    expires_at?: string | null;
    status?: string;
    notes?: string | null;
  }) => Promise<void>;
  saving: boolean;
};

function EditContractDialog({ contract, onClose, onSave, saving }: EditDialogProps) {
  const [contractType, setContractType] = useState(contract?.contract_type ?? "partnership");
  const [contractReference, setContractReference] = useState(contract?.contract_reference ?? "");
  const [signedAt, setSignedAt] = useState(contract?.signed_at?.split("T")[0] ?? "");
  const [startsAt, setStartsAt] = useState(contract?.starts_at?.split("T")[0] ?? "");
  const [expiresAt, setExpiresAt] = useState(contract?.expires_at?.split("T")[0] ?? "");
  const [status, setStatus] = useState(contract?.status ?? "active");
  const [notes, setNotes] = useState(contract?.notes ?? "");

  useEffect(() => {
    if (contract) {
      setContractType(contract.contract_type ?? "partnership");
      setContractReference(contract.contract_reference ?? "");
      setSignedAt(contract.signed_at?.split("T")[0] ?? "");
      setStartsAt(contract.starts_at?.split("T")[0] ?? "");
      setExpiresAt(contract.expires_at?.split("T")[0] ?? "");
      setStatus(contract.status ?? "active");
      setNotes(contract.notes ?? "");
    }
  }, [contract]);

  const handleSubmit = async () => {
    await onSave({
      contract_type: contractType,
      contract_reference: contractReference || null,
      signed_at: signedAt || null,
      starts_at: startsAt || null,
      expires_at: expiresAt || null,
      status,
      notes: notes || null,
    });
  };

  return (
    <Dialog open={!!contract} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Modifier le contrat</DialogTitle>
          <DialogDescription>
            {contract?.file_name ?? "contrat.pdf"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Type de contrat</Label>
              <Select value={contractType} onValueChange={setContractType}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTRACT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Statut</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTRACT_STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Référence interne</Label>
            <Input
              value={contractReference}
              onChange={(e) => setContractReference(e.target.value)}
              placeholder="Ex: SAM-2026-001"
              className="mt-1"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Date signature</Label>
              <Input
                type="date"
                value={signedAt}
                onChange={(e) => setSignedAt(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Date début</Label>
              <Input
                type="date"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <Label>Date expiration</Label>
              <Input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                className="mt-1"
              />
            </div>
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notes internes..."
              rows={2}
              className="mt-1"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={saving} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AdminEstablishmentContractsCard(props: { establishmentId: string }) {
  const { establishmentId } = props;
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [contracts, setContracts] = useState<AdminEstablishmentContract[]>([]);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [editingContract, setEditingContract] = useState<AdminEstablishmentContract | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listAdminEstablishmentContracts(undefined, establishmentId);
      setContracts(res.items ?? []);
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : e instanceof Error ? e.message : "Erreur inattendue";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [establishmentId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleUpload = async (
    file: File,
    metadata: {
      contractType: string;
      contractReference: string;
      signedAt: string;
      startsAt: string;
      expiresAt: string;
      notes: string;
    }
  ) => {
    setUploading(true);
    try {
      await uploadAdminEstablishmentContract(undefined, establishmentId, file, {
        contractType: metadata.contractType,
        contractReference: metadata.contractReference || undefined,
        signedAt: metadata.signedAt || undefined,
        startsAt: metadata.startsAt || undefined,
        expiresAt: metadata.expiresAt || undefined,
        notes: metadata.notes || undefined,
      });
      toast({ title: "Contrat ajouté", description: file.name });
      setUploadDialogOpen(false);
      await refresh();
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : e instanceof Error ? e.message : "Erreur upload";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const handleUpdate = async (data: {
    contract_type?: string;
    contract_reference?: string | null;
    signed_at?: string | null;
    starts_at?: string | null;
    expires_at?: string | null;
    status?: string;
    notes?: string | null;
  }) => {
    if (!editingContract) return;
    setSaving(true);
    try {
      await updateAdminEstablishmentContract(undefined, establishmentId, editingContract.id, data);
      toast({ title: "Contrat modifié" });
      setEditingContract(null);
      await refresh();
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : e instanceof Error ? e.message : "Erreur";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (contractId: string) => {
    setDeleting(contractId);
    try {
      await deleteAdminEstablishmentContract(undefined, establishmentId, contractId);
      toast({ title: "Contrat supprimé" });
      await refresh();
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : e instanceof Error ? e.message : "Erreur";
      toast({ title: "Erreur", description: msg, variant: "destructive" });
    } finally {
      setDeleting(null);
    }
  };

  return (
    <>
      <Card className="border-slate-200">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm font-bold flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Contrats établissement
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setUploadDialogOpen(true)}
              className="gap-1.5 h-7"
            >
              <Plus className="h-3.5 w-3.5" />
              Ajouter
            </Button>
          </CardTitle>
        </CardHeader>

        <CardContent className="p-4 pt-0 space-y-3">
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800 flex items-center gap-2">
              <AlertTriangle className="h-3.5 w-3.5" />
              {error}
            </div>
          )}

          {loading ? (
            <div className="text-sm text-slate-600 flex items-center gap-2 py-4">
              <Loader2 className="h-4 w-4 animate-spin" />
              Chargement…
            </div>
          ) : contracts.length === 0 ? (
            <div className="text-sm text-slate-500 py-4 text-center">
              Aucun contrat enregistré
            </div>
          ) : (
            <div className="space-y-2">
              {contracts.map((contract) => {
                const statusBadge = getStatusBadge(contract.status);
                const typeLabel = CONTRACT_TYPES.find((t) => t.value === contract.contract_type)?.label ?? contract.contract_type;

                return (
                  <div
                    key={contract.id}
                    className="rounded-lg border border-slate-200 p-3 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm truncate">
                            {contract.file_name ?? "contrat.pdf"}
                          </span>
                          <Badge className={statusBadge.cls}>{statusBadge.label}</Badge>
                        </div>
                        <div className="text-xs text-slate-500 mt-1">
                          {typeLabel}
                          {contract.contract_reference && (
                            <> • Réf: <span className="font-mono">{contract.contract_reference}</span></>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {contract.signed_url && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 w-7 p-0"
                            asChild
                          >
                            <a href={contract.signed_url} target="_blank" rel="noreferrer">
                              <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={() => setEditingContract(contract)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                              disabled={deleting === contract.id}
                            >
                              {deleting === contract.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Trash2 className="h-3.5 w-3.5" />
                              )}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Supprimer ce contrat ?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Cette action est irréversible. Le fichier sera définitivement supprimé.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Annuler</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-red-600 hover:bg-red-700"
                                onClick={() => void handleDelete(contract.id)}
                              >
                                Supprimer
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                      {contract.signed_at && (
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          Signé: {formatDate(contract.signed_at)}
                        </div>
                      )}
                      {contract.starts_at && (
                        <div>Début: {formatDate(contract.starts_at)}</div>
                      )}
                      {contract.expires_at && (
                        <div>Expire: {formatDate(contract.expires_at)}</div>
                      )}
                      <div>{formatFileSize(contract.size_bytes)}</div>
                    </div>

                    {contract.notes && (
                      <div className="text-xs text-slate-600 bg-slate-50 rounded p-2">
                        {contract.notes}
                      </div>
                    )}

                    <div className="text-[10px] text-slate-400">
                      Ajouté le {formatDateTime(contract.uploaded_at)}
                      {contract.uploaded_by && <> par {contract.uploaded_by}</>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void refresh()}
              disabled={loading}
              className="gap-1.5"
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Rafraîchir
            </Button>
          </div>
        </CardContent>
      </Card>

      <UploadContractDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        onUpload={handleUpload}
        uploading={uploading}
      />

      <EditContractDialog
        contract={editingContract}
        onClose={() => setEditingContract(null)}
        onSave={handleUpdate}
        saving={saving}
      />
    </>
  );
}
