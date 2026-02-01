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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  AdminApiError,
  duplicateAdminEmailTemplate,
  listAdminEmailTemplates,
  previewAdminEmail,
  sendAdminTestEmail,
  upsertAdminEmailTemplate,
  type AdminEmailTemplate,
  type AdminTestEmailSenderKey,
} from "@/lib/adminApi";

import { useToast } from "@/hooks/use-toast";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminEmailsNav } from "./AdminEmailsNav";

type TemplateDraft = {
  id?: string | null;
  key: string;
  audience: string;
  name: string;
  enabled: boolean;
  subject_fr: string;
  body_fr: string;
  cta_label_fr: string;
  cta_url: string;
  subject_en: string;
  body_en: string;
  cta_label_en: string;
};

const AUDIENCE_OPTIONS: Array<{ value: AdminEmailTemplate["audience"]; label: string }> = [
  { value: "consumer", label: "USER (transactionnel)" },
  { value: "pro", label: "Pro" },
  { value: "finance", label: "Finance" },
  { value: "system", label: "Système" },
  { value: "marketing", label: "Marketing" },
];

function templateToDraft(tpl?: AdminEmailTemplate | null): TemplateDraft {
  return {
    id: tpl?.id ?? null,
    key: tpl?.key ?? "",
    audience: tpl?.audience ?? "consumer",
    name: tpl?.name ?? "",
    enabled: tpl?.enabled ?? true,
    subject_fr: tpl?.subject_fr ?? "",
    body_fr: tpl?.body_fr ?? "",
    cta_label_fr: tpl?.cta_label_fr ?? "",
    cta_url: tpl?.cta_url ?? "",
    subject_en: tpl?.subject_en ?? "",
    body_en: tpl?.body_en ?? "",
    cta_label_en: tpl?.cta_label_en ?? "",
  };
}

export function AdminEmailsTemplatesPage() {
  const { toast } = useToast();

  const [items, setItems] = useState<AdminEmailTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [audienceFilter, setAudienceFilter] = useState<string>("all");

  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState<TemplateDraft>(() => templateToDraft(null));

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewHtml, setPreviewHtml] = useState<string>("");

  const [testTo, setTestTo] = useState<string>("");
  const [testing, setTesting] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await listAdminEmailTemplates(undefined, {
        audience: audienceFilter === "all" ? undefined : audienceFilter,
      });
      setItems(res.items ?? []);
    } catch (e) {
      if (e instanceof AdminApiError) setError(e.message);
      else setError("Erreur inattendue");
    } finally {
      setLoading(false);
    }
  }, [audienceFilter]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const openCreate = () => {
    setDraft(
      templateToDraft({
        id: "",
        key: "",
        audience: "marketing",
        name: "",
        enabled: true,
        subject_fr: "",
        subject_en: "",
        body_fr: "Bonjour {{user_name}},\n\n…\n\nL’équipe Sortir Au Maroc",
        body_en: "Hello {{user_name}},\n\n…\n\nThe Sortir Au Maroc team",
        cta_label_fr: "",
        cta_label_en: "",
        cta_url: "",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as any),
    );
    setEditorOpen(true);
  };

  const openEdit = (tpl: AdminEmailTemplate) => {
    setDraft(templateToDraft(tpl));
    setEditorOpen(true);
  };

  const save = async () => {
    const payload = {
      id: draft.id || undefined,
      key: draft.key.trim(),
      audience: draft.audience,
      name: draft.name.trim(),
      enabled: draft.enabled,
      subject_fr: draft.subject_fr.trim(),
      subject_en: draft.subject_en.trim(),
      body_fr: draft.body_fr.trim(),
      body_en: draft.body_en.trim(),
      cta_label_fr: draft.cta_label_fr.trim() || null,
      cta_label_en: draft.cta_label_en.trim() || null,
      cta_url: draft.cta_url.trim() || null,
    };

    try {
      await upsertAdminEmailTemplate(undefined, payload as any);
      toast({ title: "✔️ Template enregistré" });
      setEditorOpen(false);
      await refresh();
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur inattendue";
      toast({ title: "❌ Sauvegarde échouée", description: msg, variant: "destructive" });
    }
  };

  const duplicate = async (tpl: AdminEmailTemplate) => {
    try {
      const res = await duplicateAdminEmailTemplate(undefined, tpl.id);
      toast({ title: "✔️ Dupliqué", description: `Nouveau key: ${res.key}` });
      await refresh();
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur inattendue";
      toast({ title: "❌ Duplication échouée", description: msg, variant: "destructive" });
    }
  };

  const openPreview = async () => {
    try {
      const res = await previewAdminEmail(undefined, {
        from: "hello" as AdminTestEmailSenderKey,
        subject: draft.subject_fr || "Aperçu",
        body: draft.body_fr || "",
        cta_label: draft.cta_label_fr || null,
        cta_url: draft.cta_url || null,
        variables: {
          user_name: "Sam",
          booking_ref: "SB-123456",
          date: new Date().toISOString(),
          amount: "250 MAD",
          establishment: "Exemple établissement",
          cta_url: draft.cta_url || "https://sortiraumaroc.ma/",
        },
      });
      setPreviewHtml(res.html);
      setPreviewOpen(true);
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur inattendue";
      toast({ title: "❌ Aperçu échoué", description: msg, variant: "destructive" });
    }
  };

  const sendTest = async () => {
    const to = testTo.trim();
    if (!to) {
      toast({ title: "❌ Destinataire requis", description: "Saisis un email de test." });
      return;
    }

    setTesting(true);
    try {
      await sendAdminTestEmail(undefined, {
        from: "hello",
        to,
        subject: draft.subject_fr || "Test",
        message: draft.body_fr || "",
        cta_label: draft.cta_label_fr || undefined,
        cta_url: draft.cta_url || undefined,
      });
      toast({ title: "✔️ Email test envoyé" });
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur inattendue";
      toast({ title: "❌ Envoi échoué", description: msg, variant: "destructive" });
    } finally {
      setTesting(false);
    }
  };

  const columns = useMemo<ColumnDef<AdminEmailTemplate>[]>(() => {
    return [
      {
        accessorKey: "audience",
        header: "Type",
        cell: ({ row }) => {
          const v = row.original.audience;
          const label = AUDIENCE_OPTIONS.find((x) => x.value === v)?.label ?? v;
          return <Badge variant="outline">{label}</Badge>;
        },
      },
      { accessorKey: "name", header: "Nom" },
      { accessorKey: "key", header: "Key" },
      {
        accessorKey: "enabled",
        header: "Actif",
        cell: ({ row }) => (row.original.enabled ? <Badge className="bg-green-600 text-white">Oui</Badge> : <Badge variant="secondary">Non</Badge>),
      },
      { accessorKey: "updated_at", header: "MAJ" },
    ];
  }, []);

  return (
    <div className="space-y-4">
      <AdminPageHeader
        title="Emailing"
        description="Gestion des templates transactionnels & marketing (FR/EN), preview, envoi de test."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
              {loading ? "Chargement…" : "Rafraîchir"}
            </Button>
            <Button onClick={openCreate}>+ Nouveau template</Button>
          </div>
        }
      />

      <Card className="border-slate-200">
        <CardContent className="p-4 space-y-3">
          <AdminEmailsNav />

          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="w-full sm:w-72">
              <Select value={audienceFilter} onValueChange={setAudienceFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Filtrer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous</SelectItem>
                  {AUDIENCE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={() => void refresh()} disabled={loading}>
              Appliquer
            </Button>
          </div>

          {error ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
        </CardContent>
      </Card>

      <AdminDataTable
        data={items}
        columns={columns}
        isLoading={loading}
        searchPlaceholder="Rechercher (nom, key…)"
        onRowClick={(row) => openEdit(row)}
      />

      <Dialog
        open={editorOpen}
        onOpenChange={(open) => {
          setEditorOpen(open);
          if (!open) setTestTo("");
        }}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Template email</DialogTitle>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Key</Label>
                  <Input value={draft.key} onChange={(e) => setDraft((p) => ({ ...p, key: e.target.value }))} placeholder="ex: user_booking_confirmed" />
                </div>
                <div className="space-y-1">
                  <Label>Type</Label>
                  <Select value={draft.audience} onValueChange={(v) => setDraft((p) => ({ ...p, audience: v }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Type" />
                    </SelectTrigger>
                    <SelectContent>
                      {AUDIENCE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1">
                <Label>Nom</Label>
                <Input value={draft.name} onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))} placeholder="Nom interne" />
              </div>

              <div className="flex items-center justify-between rounded-lg border border-slate-200 p-3">
                <div>
                  <div className="text-sm font-semibold">Actif</div>
                  <div className="text-xs text-slate-500">Désactive l’utilisation du template si nécessaire.</div>
                </div>
                <Switch checked={draft.enabled} onCheckedChange={(v) => setDraft((p) => ({ ...p, enabled: v }))} />
              </div>

              <div className="space-y-1">
                <Label>CTA URL (optionnel)</Label>
                <Input value={draft.cta_url} onChange={(e) => setDraft((p) => ({ ...p, cta_url: e.target.value }))} placeholder="https://… ou {{cta_url}}" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>CTA label FR</Label>
                  <Input value={draft.cta_label_fr} onChange={(e) => setDraft((p) => ({ ...p, cta_label_fr: e.target.value }))} placeholder="ex: Voir" />
                </div>
                <div className="space-y-1">
                  <Label>CTA label EN</Label>
                  <Input value={draft.cta_label_en} onChange={(e) => setDraft((p) => ({ ...p, cta_label_en: e.target.value }))} placeholder="ex: Open" />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" onClick={() => void openPreview()}>
                  Aperçu
                </Button>
                {draft.id ? (
                  <Button variant="outline" onClick={() => void duplicate({ id: draft.id, key: draft.key } as any)}>
                    Dupliquer
                  </Button>
                ) : null}
              </div>

              <div className="rounded-lg border border-slate-200 p-3 space-y-2">
                <div className="text-sm font-semibold">Test d’envoi</div>
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
                  <Input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="vous@domaine.com" inputMode="email" />
                  <Button onClick={() => void sendTest()} disabled={testing}>
                    {testing ? "Envoi…" : "Envoyer"}
                  </Button>
                </div>
                <div className="text-xs text-slate-500">Utilise l’expéditeur hello@ (modifiable plus tard par campagne).</div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <Label>Objet FR</Label>
                <Input value={draft.subject_fr} onChange={(e) => setDraft((p) => ({ ...p, subject_fr: e.target.value }))} placeholder="Objet" />
              </div>
              <div className="space-y-1">
                <Label>Body FR</Label>
                <Textarea value={draft.body_fr} onChange={(e) => setDraft((p) => ({ ...p, body_fr: e.target.value }))} rows={10} />
              </div>

              <div className="space-y-1">
                <Label>Objet EN</Label>
                <Input value={draft.subject_en} onChange={(e) => setDraft((p) => ({ ...p, subject_en: e.target.value }))} placeholder="Subject" />
              </div>
              <div className="space-y-1">
                <Label>Body EN</Label>
                <Textarea value={draft.body_en} onChange={(e) => setDraft((p) => ({ ...p, body_en: e.target.value }))} rows={10} />
              </div>

              <div className="flex items-center justify-end gap-2">
                <Button variant="outline" onClick={() => setEditorOpen(false)}>
                  Fermer
                </Button>
                <Button onClick={() => void save()}>Enregistrer</Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Aperçu</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className="text-sm font-semibold">Desktop</div>
              <iframe title="preview-desktop" className="w-full h-[520px] rounded-lg border" srcDoc={previewHtml} />
            </div>
            <div className="space-y-2">
              <div className="text-sm font-semibold">Mobile</div>
              <div className="mx-auto w-[390px] max-w-full">
                <iframe title="preview-mobile" className="w-full h-[520px] rounded-lg border" srcDoc={previewHtml} />
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
