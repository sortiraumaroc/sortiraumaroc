import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
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
import { Textarea } from "@/components/ui/textarea";

const ACCENT = "#F5A623";

type DemoRequestDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function DemoRequestDialog({ open, onOpenChange }: DemoRequestDialogProps) {
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "",
    company: "",
    city: "",
    message: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const canSubmit = useMemo(() => {
    const emailOk = form.email.trim().includes("@");
    const nameOk = form.fullName.trim().length >= 2;
    const companyOk = form.company.trim().length >= 2;
    return emailOk && nameOk && companyOk && !submitting;
  }, [form, submitting]);

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/leads/pro-demo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          full_name: form.fullName.trim(),
          email: form.email.trim(),
          phone: form.phone.trim() || null,
          company: form.company.trim(),
          city: form.city.trim() || null,
          message: form.message.trim() || null,
        }),
      });

      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        const msg =
          payload && typeof payload.error === "string"
            ? payload.error
            : `HTTP ${res.status}`;
        throw new Error(msg);
      }

      setDone(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Une erreur est survenue";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setDone(false);
          setError(null);
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Demander une démo</DialogTitle>
          <DialogDescription>
            Donnez-nous vos informations, on vous recontacte rapidement.
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
            <div className="font-bold">Merci !</div>
            <div className="text-sm">
              Votre demande a bien été envoyée. Un membre de l'équipe vous
              contactera.
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Nom complet</Label>
                <Input
                  value={form.fullName}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, fullName: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, email: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Téléphone</Label>
                <Input
                  value={form.phone}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, phone: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Établissement / enseigne</Label>
                <Input
                  value={form.company}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, company: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Ville</Label>
              <Input
                value={form.city}
                onChange={(e) =>
                  setForm((p) => ({ ...p, city: e.target.value }))
                }
              />
            </div>

            <div className="space-y-2">
              <Label>Message (optionnel)</Label>
              <Textarea
                value={form.message}
                onChange={(e) =>
                  setForm((p) => ({ ...p, message: e.target.value }))
                }
                className="min-h-[120px]"
              />
            </div>

            {error ? (
              <div className="text-sm text-red-600">{error}</div>
            ) : null}
          </div>
        )}

        <DialogFooter>
          {done ? (
            <Button
              onClick={() => onOpenChange(false)}
              className="font-bold text-white"
              style={{ backgroundColor: ACCENT }}
            >
              Fermer
            </Button>
          ) : (
            <Button
              onClick={submit}
              disabled={!canSubmit}
              className="font-bold text-white"
              style={{ backgroundColor: ACCENT }}
            >
              {submitting ? "Envoi…" : "Envoyer"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
