import type { ColumnDef } from "@tanstack/react-table";

import { AdminPageHeader } from "@/components/admin/layout/AdminPageHeader";
import { AdminDataTable } from "@/components/admin/table/AdminDataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AdminApiError,
  createAdminEmailCampaign,
  listAdminEmailCampaignRecipients,
  listAdminEmailCampaigns,
  listAdminEmailTemplates,
  sendAdminEmailCampaignNow,
  type AdminEmailCampaign,
  type AdminEmailCampaignRecipient,
  type AdminEmailTemplate,
} from "@/lib/adminApi";

import { useToast } from "@/hooks/use-toast";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminEmailsNav } from "./AdminEmailsNav";

type CampaignDraft = {
  name: string;
  template_id: string;
  audience: "consumer" | "pro";
  subject_override: string;
};

function emptyDraft(templates: AdminEmailTemplate[]): CampaignDraft {
  const tpl = templates[0];
  return {
    name: "",
    template_id: tpl?.id ?? "",
    audience: "consumer",
    subject_override: "",
  };
}

function formatCount(n: number): string {
  return Number.isFinite(n) ? String(n) : "0";
}

export function AdminEmailsCampaignsPage() {
  const { toast } = useToast();

  const [templates, setTemplates] = useState<AdminEmailTemplate[]>([]);
  const [items, setItems] = useState<AdminEmailCampaign[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState<CampaignDraft>(() => emptyDraft([]));

  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState<AdminEmailCampaign | null>(null);
  const [recipients, setRecipients] = useState<AdminEmailCampaignRecipient[]>([]);
  const [recipientsLoading, setRecipientsLoading] = useState(false);

  const refreshAll = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const [tplRes, campRes] = await Promise.all([
        listAdminEmailTemplates(undefined, { audience: "marketing" }),
        listAdminEmailCampaigns(undefined),
      ]);
      setTemplates(tplRes.items ?? []);
      setItems(campRes.items ?? []);
      setDraft((prev) => ({ ...prev, template_id: prev.template_id || (tplRes.items?.[0]?.id ?? "") }));
    } catch (e) {
      if (e instanceof AdminApiError) setError(e.message);
      else setError("Erreur inattendue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  const openCreate = () => {
    setDraft(emptyDraft(templates));
    setCreateOpen(true);
  };

  const create = async () => {
    if (!draft.name.trim()) {
      toast({ title: "❌ Nom requis" });
      return;
    }
    if (!draft.template_id) {
      toast({ title: "❌ Template requis" });
      return;
    }

    try {
      await createAdminEmailCampaign(undefined, {
        name: draft.name.trim(),
        template_id: draft.template_id,
        audience: draft.audience,
        subject_override: draft.subject_override.trim() || null,
      });
      toast({ title: "✔️ Campagne créée" });
      setCreateOpen(false);
      await refreshAll();
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur inattendue";
      toast({ title: "❌ Création échouée", description: msg, variant: "destructive" });
    }
  };

  const openDetails = async (c: AdminEmailCampaign) => {
    setSelectedCampaign(c);
    setDetailsOpen(true);
    setRecipientsLoading(true);

    try {
      const r = await listAdminEmailCampaignRecipients(undefined, { campaignId: c.id, limit: 300 });
      setRecipients(r.items ?? []);
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur inattendue";
      toast({ title: "❌ Chargement échoué", description: msg, variant: "destructive" });
    } finally {
      setRecipientsLoading(false);
    }
  };

  const sendNow = async (c: AdminEmailCampaign) => {
    try {
      const res = await sendAdminEmailCampaignNow(undefined, { id: c.id, limit: 50, dry_run: false });
      if ((res as any).ok !== true) {
        toast({ title: "❌ Envoi échoué", description: (res as any).error ?? "Erreur", variant: "destructive" });
        return;
      }
      toast({
        title: "✔️ Envoi lancé",
        description: `insérés: ${formatCount((res as any).inserted)} · envoyés: ${formatCount((res as any).sent)} · échecs: ${formatCount(
          (res as any).failed,
        )}`,
      });
      await refreshAll();
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur inattendue";
      toast({ title: "❌ Envoi échoué", description: msg, variant: "destructive" });
    }
  };

  const stats = useMemo(() => {
    const total = recipients.length;
    const sent = recipients.filter((r) => r.status === "sent").length;
    const failed = recipients.filter((r) => r.status === "failed").length;
    const skipped = recipients.filter((r) => r.status === "skipped_unsubscribed").length;
    const opened = recipients.filter((r) => !!r.opened_at).length;
    const clicked = recipients.filter((r) => !!r.clicked_at).length;
    return { total, sent, failed, skipped, opened, clicked };
  }, [recipients]);

  const columns = useMemo<ColumnDef<AdminEmailCampaign>[]>(() => {
    return [
      { accessorKey: "name", header: "Campagne" },
      {
        accessorKey: "audience",
        header: "Cible",
        cell: ({ row }) => <Badge variant="outline">{row.original.audience === "pro" ? "Pro" : "USER"}</Badge>,
      },
      {
        accessorKey: "email_templates",
        header: "Template",
        cell: ({ row }) => {
          const t = row.original.email_templates;
          return <div className="text-sm">{t ? `${t.name} (${t.key})` : row.original.template_id}</div>;
        },
      },
      {
        accessorKey: "status",
        header: "Statut",
        cell: ({ row }) => {
          const s = String(row.original.status || "");
          const cls =
            s === "sent" ? "bg-green-600 text-white" : s === "sending" ? "bg-amber-500 text-white" : "bg-slate-200 text-slate-900";
          const labels: Record<string, string> = {
            draft: "Brouillon",
            sending: "Envoi en cours",
            sent: "Envoyé",
            scheduled: "Programmé",
          };
          return <Badge className={cls}>{labels[s] ?? s}</Badge>;
        },
      },
      { accessorKey: "created_at", header: "Créée" },
    ];
  }, []);

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Emailing"
        description="Création et envoi de campagnes marketing (avec tracking open/click + unsubscribe)."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => void refreshAll()} disabled={loading}>
              {loading ? "Chargement…" : "Rafraîchir"}
            </Button>
            <Button onClick={openCreate}>+ Nouvelle campagne</Button>
          </div>
        }
      />

      <Card className="border-slate-200">
        <CardContent className="p-4 space-y-3">
          <AdminEmailsNav />
          {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
          <div className="text-xs text-slate-500">
            Par sécurité, l’action “Envoyer” envoie par défaut aux <strong>50 premiers</strong> destinataires (modifiable ensuite côté API).
          </div>
        </CardContent>
      </Card>

      <AdminDataTable
        data={items}
        columns={columns}
        isLoading={loading}
        searchPlaceholder="Rechercher (nom, template…)"
        onRowClick={(row) => void openDetails(row)}
      />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Nouvelle campagne</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1 md:col-span-2">
              <Label>Nom</Label>
              <Input value={draft.name} onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))} placeholder="ex: Promo Janvier" />
            </div>

            <div className="space-y-1">
              <Label>Audience</Label>
              <Select value={draft.audience} onValueChange={(v) => setDraft((p) => ({ ...p, audience: v as any }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Audience" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="consumer">USER</SelectItem>
                  <SelectItem value="pro">Pro</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label>Template (marketing)</Label>
              <Select value={draft.template_id} onValueChange={(v) => setDraft((p) => ({ ...p, template_id: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Template" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} ({t.key})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1 md:col-span-2">
              <Label>Objet override (optionnel)</Label>
              <Input
                value={draft.subject_override}
                onChange={(e) => setDraft((p) => ({ ...p, subject_override: e.target.value }))}
                placeholder="Si vide, utilise l’objet du template FR"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Annuler
            </Button>
            <Button onClick={() => void create()}>Créer</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={detailsOpen}
        onOpenChange={(open) => {
          setDetailsOpen(open);
          if (!open) {
            setSelectedCampaign(null);
            setRecipients([]);
          }
        }}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Détails campagne</DialogTitle>
          </DialogHeader>

          {selectedCampaign ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm text-slate-500">{selectedCampaign.id}</div>
                  <div className="text-lg font-semibold text-slate-900 truncate">{selectedCampaign.name}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={() => void openDetails(selectedCampaign)} disabled={recipientsLoading}>
                    {recipientsLoading ? "Chargement…" : "Rafraîchir"}
                  </Button>
                  <Button onClick={() => void sendNow(selectedCampaign)}>Envoyer (50)</Button>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                <div className="rounded-lg border border-slate-200 p-3">
                  <div className="text-xs text-slate-500">Total</div>
                  <div className="text-lg font-bold">{stats.total}</div>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <div className="text-xs text-slate-500">Envoyés</div>
                  <div className="text-lg font-bold">{stats.sent}</div>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <div className="text-xs text-slate-500">Ouvertures</div>
                  <div className="text-lg font-bold">{stats.opened}</div>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <div className="text-xs text-slate-500">Clics</div>
                  <div className="text-lg font-bold">{stats.clicked}</div>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <div className="text-xs text-slate-500">Échecs</div>
                  <div className="text-lg font-bold">{stats.failed}</div>
                </div>
                <div className="rounded-lg border border-slate-200 p-3">
                  <div className="text-xs text-slate-500">Unsub</div>
                  <div className="text-lg font-bold">{stats.skipped}</div>
                </div>
              </div>

              <AdminDataTable
                data={recipients}
                columns={
                  [
                    { accessorKey: "email", header: "Email" },
                    { accessorKey: "status", header: "Statut" },
                    { accessorKey: "opened_at", header: "Ouvert" },
                    { accessorKey: "clicked_at", header: "Cliqué" },
                    { accessorKey: "error", header: "Erreur" },
                  ] as Array<ColumnDef<AdminEmailCampaignRecipient>>
                }
                isLoading={recipientsLoading}
                searchPlaceholder="Rechercher email…"
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
