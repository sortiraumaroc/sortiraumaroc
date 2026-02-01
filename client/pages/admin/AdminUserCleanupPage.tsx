import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Trash2,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { useToast } from "@/hooks/use-toast";
import { getAdminHeaders } from "@/lib/adminApi";

type DemoAccount = {
  id: string;
  email: string;
  name: string;
  created_at: string;
  reason: string;
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AdminUserCleanupPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<DemoAccount[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [mode, setMode] = useState<"demo" | "all">("all"); // Default to "all" to show all accounts
  const [protectedEmail, setProtectedEmail] = useState<string>("");

  // Security password
  const [securityConfigured, setSecurityConfigured] = useState<boolean | null>(null);
  const [securityPassword, setSecurityPassword] = useState("");
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [configPasswordDialogOpen, setConfigPasswordDialogOpen] = useState(false);
  const [newSecurityPassword, setNewSecurityPassword] = useState("");
  const [confirmSecurityPassword, setConfirmSecurityPassword] = useState("");

  // Results
  const [results, setResults] = useState<{
    deleted: { id: string; email: string }[];
    errors: { id: string; email: string; error: string }[];
  } | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const headers = getAdminHeaders();

      const [previewRes, securityRes] = await Promise.all([
        fetch(`/api/admin/users/demo/preview?mode=${mode}`, { headers }),
        fetch("/api/admin/security/password/check", { headers }),
      ]);

      if (previewRes.ok) {
        const data = await previewRes.json();
        setAccounts(data.accounts ?? []);
        setProtectedEmail(data.protected_email ?? "");
      }

      if (securityRes.ok) {
        const data = await securityRes.json();
        setSecurityConfigured(data.configured);
      }
    } catch (err) {
      console.error("Failed to fetch demo accounts:", err);
    } finally {
      setLoading(false);
    }
  }, [mode]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const switchMode = (newMode: "demo" | "all") => {
    setMode(newMode);
    setSelectedIds(new Set());
  };

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const selectAll = () => {
    if (selectedIds.size === accounts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(accounts.map((a) => a.id)));
    }
  };

  const handleDelete = async () => {
    if (!securityPassword || selectedIds.size === 0) return;

    setDeleting(true);
    try {
      const res = await fetch("/api/admin/users/demo/delete", {
        method: "POST",
        headers: { ...getAdminHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({
          account_ids: Array.from(selectedIds),
          security_password: securityPassword,
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setResults({
          deleted: data.deleted ?? [],
          errors: data.errors ?? [],
        });
        toast({
          title: "Nettoyage terminé",
          description: `${data.deleted_count} comptes supprimés, ${data.error_count} erreurs`,
        });
        setConfirmDialogOpen(false);
        setSecurityPassword("");
        setSelectedIds(new Set());
        fetchData();
      } else {
        if (data.not_configured) {
          setConfirmDialogOpen(false);
          setConfigPasswordDialogOpen(true);
        } else {
          toast({ title: "Erreur", description: data.error, variant: "destructive" });
        }
      }
    } catch (err) {
      toast({ title: "Erreur", description: "Erreur lors de la suppression", variant: "destructive" });
    } finally {
      setDeleting(false);
    }
  };

  const handleConfigureSecurityPassword = async () => {
    if (!newSecurityPassword || newSecurityPassword !== confirmSecurityPassword) {
      toast({
        title: "Erreur",
        description: "Les mots de passe ne correspondent pas",
        variant: "destructive",
      });
      return;
    }

    if (newSecurityPassword.length < 6) {
      toast({
        title: "Erreur",
        description: "Le mot de passe doit contenir au moins 6 caractères",
        variant: "destructive",
      });
      return;
    }

    try {
      const res = await fetch("/api/admin/security/password", {
        method: "POST",
        headers: { ...getAdminHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ password: newSecurityPassword }),
      });

      if (res.ok) {
        toast({ title: "Succès", description: "Mot de passe de sécurité configuré" });
        setConfigPasswordDialogOpen(false);
        setNewSecurityPassword("");
        setConfirmSecurityPassword("");
        setSecurityConfigured(true);
      } else {
        const data = await res.json();
        toast({ title: "Erreur", description: data.error, variant: "destructive" });
      }
    } catch (err) {
      toast({ title: "Erreur", description: "Erreur lors de la configuration", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Nettoyage des comptes"
        description="Identifiez et supprimez les comptes de test et de démonstration"
      />

      {/* Security warning */}
      {securityConfigured === false && (
        <Card className="border-orange-200 bg-orange-50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-4">
              <AlertCircle className="h-8 w-8 text-orange-500" />
              <div className="flex-1">
                <h3 className="font-semibold text-orange-900">Mot de passe de sécurité non configuré</h3>
                <p className="text-sm text-orange-700">
                  Un mot de passe de sécurité est requis pour supprimer des comptes.
                </p>
              </div>
              <Button onClick={() => setConfigPasswordDialogOpen(true)}>Configurer</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Protected account info */}
      {protectedEmail && (
        <Card className="border-green-200 bg-green-50">
          <CardContent className="pt-4">
            <div className="flex items-center gap-4">
              <CheckCircle2 className="h-8 w-8 text-green-500" />
              <div>
                <h3 className="font-semibold text-green-900">Compte protégé</h3>
                <p className="text-sm text-green-700">
                  Le compte <strong>{protectedEmail}</strong> est protégé et ne sera jamais supprimé.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Mode selector */}
      <div className="flex gap-2">
        <Button
          variant={mode === "demo" ? "default" : "outline"}
          onClick={() => switchMode("demo")}
        >
          Comptes de démo uniquement
        </Button>
        <Button
          variant={mode === "all" ? "destructive" : "outline"}
          onClick={() => switchMode("all")}
        >
          TOUS les comptes (sauf protégé)
        </Button>
      </div>

      {/* Summary card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            {mode === "all" ? "Tous les comptes" : "Comptes de démo détectés"}
          </CardTitle>
          <CardDescription>
            {mode === "all"
              ? `Tous les comptes consumer sauf ${protectedEmail}`
              : "Comptes identifiés comme test ou démonstration"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <Badge variant={mode === "all" ? "destructive" : "outline"} className="text-lg px-4 py-2">
                {accounts.length} compte(s) {mode === "all" ? "à supprimer" : "détecté(s)"}
              </Badge>
              {selectedIds.size > 0 && (
                <Badge className="bg-blue-100 text-blue-700 text-lg px-4 py-2">
                  {selectedIds.size} sélectionné(s)
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => fetchData()} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                Actualiser
              </Button>
              {accounts.length > 0 && (
                <>
                  <Button variant="outline" size="sm" onClick={selectAll}>
                    {selectedIds.size === accounts.length ? "Désélectionner tout" : "Tout sélectionner"}
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    disabled={selectedIds.size === 0 || !securityConfigured}
                    onClick={() => setConfirmDialogOpen(true)}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Supprimer la sélection
                  </Button>
                </>
              )}
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
            </div>
          ) : accounts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <CheckCircle2 className="h-12 w-12 text-green-500 mb-4" />
              <h3 className="text-lg font-semibold text-gray-900">Aucun compte de démo détecté</h3>
              <p className="text-gray-500 mt-1">
                Votre base de données est propre.
              </p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={selectedIds.size === accounts.length}
                        onChange={selectAll}
                        className="rounded border-gray-300"
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Email</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Nom</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Raison</th>
                    <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Date création</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {accounts.map((account) => (
                    <tr
                      key={account.id}
                      className={`hover:bg-gray-50 ${selectedIds.has(account.id) ? "bg-blue-50" : ""}`}
                    >
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(account.id)}
                          onChange={() => toggleSelect(account.id)}
                          className="rounded border-gray-300"
                        />
                      </td>
                      <td className="px-4 py-3 font-medium">{account.email}</td>
                      <td className="px-4 py-3">{account.name || "-"}</td>
                      <td className="px-4 py-3">
                        <Badge
                          className={
                            account.reason.includes("@example.invalid")
                              ? "bg-red-100 text-red-700"
                              : "bg-orange-100 text-orange-700"
                          }
                        >
                          {account.reason}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">{formatDate(account.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Results */}
      {results && (
        <Card>
          <CardHeader>
            <CardTitle>Résultats du nettoyage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {results.deleted.length > 0 && (
                <div>
                  <h4 className="font-medium text-green-700 flex items-center gap-2 mb-2">
                    <CheckCircle2 className="h-4 w-4" />
                    {results.deleted.length} compte(s) supprimé(s)
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {results.deleted.map((d) => (
                      <Badge key={d.id} variant="outline" className="text-xs">
                        {d.email}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              {results.errors.length > 0 && (
                <div>
                  <h4 className="font-medium text-red-700 flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4" />
                    {results.errors.length} erreur(s)
                  </h4>
                  <div className="space-y-1">
                    {results.errors.map((e) => (
                      <div key={e.id} className="text-sm text-red-600">
                        {e.email}: {e.error}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-blue-500" />
            Critères de détection
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-gray-600">
            <li className="flex items-start gap-2">
              <Badge className="bg-red-100 text-red-700 mt-0.5">Email @example.invalid</Badge>
              <span>Comptes avec une adresse email @example.invalid (comptes de test)</span>
            </li>
            <li className="flex items-start gap-2">
              <Badge className="bg-orange-100 text-orange-700 mt-0.5">Sans réservation</Badge>
              <span>
                Comptes créés depuis plus de 7 jours avec un email commençant par test, demo ou fake, sans aucune
                réservation
              </span>
            </li>
          </ul>
        </CardContent>
      </Card>

      {/* Confirm Delete Dialog */}
      <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmer la suppression</DialogTitle>
            <DialogDescription>
              Vous allez supprimer {selectedIds.size} compte(s). Cette action est irréversible.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-red-50 rounded-lg">
              <div className="flex items-center gap-2 text-red-700 font-medium mb-2">
                <AlertTriangle className="h-5 w-5" />
                Attention
              </div>
              <p className="text-sm text-red-600">
                Les comptes seront anonymisés et supprimés de la base d'authentification. Les données associées
                (réservations, avis) seront conservées de manière anonyme.
              </p>
            </div>
            <div>
              <Label>Mot de passe de sécurité</Label>
              <Input
                type="password"
                value={securityPassword}
                onChange={(e) => setSecurityPassword(e.target.value)}
                placeholder="••••••"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDialogOpen(false)}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting || !securityPassword}>
              {deleting ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Suppression...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Supprimer
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Configure Security Password Dialog */}
      <Dialog open={configPasswordDialogOpen} onOpenChange={setConfigPasswordDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configurer le mot de passe de sécurité</DialogTitle>
            <DialogDescription>
              Ce mot de passe sera requis pour les actions sensibles (suppression de données, export).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nouveau mot de passe (min. 6 caractères)</Label>
              <Input
                type="password"
                value={newSecurityPassword}
                onChange={(e) => setNewSecurityPassword(e.target.value)}
                placeholder="••••••"
              />
            </div>
            <div>
              <Label>Confirmer le mot de passe</Label>
              <Input
                type="password"
                value={confirmSecurityPassword}
                onChange={(e) => setConfirmSecurityPassword(e.target.value)}
                placeholder="••••••"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfigPasswordDialogOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleConfigureSecurityPassword}>Configurer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AdminUserCleanupPage;
