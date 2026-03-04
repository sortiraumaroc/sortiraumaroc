import { useState } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AdminApiError, sendAdminTestEmail, type AdminTestEmailSenderKey } from "@/lib/adminApi";

import type { SettingsReportPatch, ToastInput } from "../../AdminSettingsPage";

const SENDER_OPTIONS: Array<{ key: AdminTestEmailSenderKey; label: string; note: string }> = [
  { key: "hello", label: "hello@sam.ma", note: "Contact général" },
  { key: "support", label: "support@sam.ma", note: "Assistance" },
  { key: "pro", label: "pro@sam.ma", note: "Relation Pro" },
  { key: "finance", label: "finance@sam.ma", note: "Paiements" },
  { key: "noreply", label: "noreply@sam.ma", note: "Notifications auto" },
];

export function EmailSettingsCard(props: {
  onReport: (patch: SettingsReportPatch) => void;
  onToast: (toast: ToastInput) => void;
}) {
  const { onReport, onToast } = props;

  const [from, setFrom] = useState<AdminTestEmailSenderKey>("hello");
  const [to, setTo] = useState<string>("");
  const [subject, setSubject] = useState<string>("Test Sortir Au Maroc");
  const [message, setMessage] = useState<string>(
    "Bonjour,\n\nCeci est un email de test Sortir Au Maroc.\n\nMerci.",
  );
  const [ctaLabel, setCtaLabel] = useState<string>("Ouvrir Sortir Au Maroc");
  const [ctaUrl, setCtaUrl] = useState<string>("https://sam.ma/");

  const [sending, setSending] = useState(false);

  const sendTest = async () => {
    const email = to.trim();
    if (!email) {
      onToast({ title: "❌ Email requis", description: "Veuillez saisir un destinataire." });
      return;
    }

    setSending(true);
    try {
      const res = await sendAdminTestEmail(undefined, {
        from,
        to: email,
        subject: subject.trim() || undefined,
        message: message.trim() || undefined,
        cta_label: ctaLabel.trim() || undefined,
        cta_url: ctaUrl.trim() || undefined,
      });

      if ((res as any).ok === false) {
        onToast({ title: "❌ Envoi échoué", description: (res as any).error ?? "Erreur" , variant: "destructive"});
        onReport({ modified: 1 });
        return;
      }

      onToast({
        title: "✔️ Email envoyé",
        description: `ID: ${(res as any).email_id}${(res as any).message_id ? ` · messageId: ${(res as any).message_id}` : ""}`,
      });
      onReport({ modified: 1 });
    } catch (e) {
      const msg = e instanceof AdminApiError ? e.message : "Erreur inattendue";
      onToast({ title: "❌ Envoi échoué", description: msg, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const senderNote = SENDER_OPTIONS.find((x) => x.key === from)?.note;

  return (
    <Card className="border-slate-200">
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">Emails</CardTitle>
          <InfoTooltip
            content={
              <div className="space-y-1">
                <div>Envoi d’emails professionnels (template unique, responsive) + logs via Journaux.</div>
                <div className="text-slate-500">Action logs : email.queued / email.sent / email.failed</div>
              </div>
            }
          />
        </div>
        <Button asChild variant="outline" size="sm" className="shrink-0">
          <Link to={`/admin/logs?action=${encodeURIComponent("email.")}`}>Voir logs</Link>
        </Button>
      </CardHeader>

      <CardContent className="space-y-3">
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold">Test d’envoi</div>
              <div className="text-xs text-slate-600">Envoie un email de test avec le template Sortir Au Maroc.</div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Expéditeur</Label>
              <Select value={from} onValueChange={(v) => setFrom(v as AdminTestEmailSenderKey)}>
                <SelectTrigger>
                  <SelectValue placeholder="Choisir" />
                </SelectTrigger>
                <SelectContent>
                  {SENDER_OPTIONS.map((opt) => (
                    <SelectItem key={opt.key} value={opt.key}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {senderNote ? <div className="text-xs text-slate-500">{senderNote}</div> : null}
            </div>

            <div className="space-y-1">
              <Label>Destinataire</Label>
              <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="ex: vous@domaine.com" inputMode="email" />
            </div>

            <div className="space-y-1 md:col-span-2">
              <Label>Objet</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Objet" />
            </div>

            <div className="space-y-1 md:col-span-2">
              <Label>Message</Label>
              <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={5} placeholder="Votre message…" />
            </div>

            <div className="space-y-1">
              <Label>CTA (optionnel) — Libellé</Label>
              <Input value={ctaLabel} onChange={(e) => setCtaLabel(e.target.value)} placeholder="ex: Ouvrir" />
            </div>

            <div className="space-y-1">
              <Label>CTA (optionnel) — Lien</Label>
              <Input value={ctaUrl} onChange={(e) => setCtaUrl(e.target.value)} placeholder="https://…" />
            </div>
          </div>

          <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-2">
            <Button className="w-full sm:w-auto" onClick={() => void sendTest()} disabled={sending}>
              {sending ? "Envoi…" : "Envoyer un test"}
            </Button>
            <div className="text-xs text-slate-500">
              Nécessite la config SMTP côté serveur (SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS).
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
